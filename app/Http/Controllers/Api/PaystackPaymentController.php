<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\PaystackTransaction;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Carbon;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Http;
use Illuminate\Support\Facades\Schema;
use Illuminate\Support\Str;

class PaystackPaymentController extends Controller
{
    private const STORAGE_PRICES_NGN = [
        2048 => 500,
        4096 => 1000,
        8192 => 1800,
        16384 => 2800,
        32768 => 4000,
        65536 => 5500,
        131072 => 6800,
        256000 => 8000,
    ];

    public function initialize(Request $request): JsonResponse
    {
        $validated = $request->validate([
            'email' => ['required', 'email'],
            'user_id' => ['required', 'string', 'max:255'],
            'device_id' => ['required', 'string', 'max:255'],
            'device_name' => ['required', 'string', 'max:255'],
            'storage_mb' => ['required', 'integer'],
            'mobile_callback_url' => ['nullable', 'url'],
        ]);

        $this->ensurePaystackConfigured();

        $priceNgn = self::STORAGE_PRICES_NGN[$validated['storage_mb']] ?? null;
        if ($priceNgn === null) {
            return response()->json([
                'message' => 'Unsupported storage plan selected.',
            ], 422);
        }

        $reference = 'pstk_' . Str::lower(Str::random(24));
        $amountKobo = $priceNgn * 100;
        $callbackUrl = $validated['mobile_callback_url'] ?? route('paystack.mobile.callback');
        $metadata = [
            'user_id' => $validated['user_id'],
            'device_id' => $validated['device_id'],
            'device_name' => $validated['device_name'],
            'storage_mb' => $validated['storage_mb'],
            'billing_period' => 'yearly',
        ];

        $response = Http::timeout(30)
            ->acceptJson()
            ->when(app()->environment('local'), fn ($http) => $http->withoutVerifying())
            ->withToken(config('services.paystack.secret_key'))
            ->post(rtrim(config('services.paystack.base_url'), '/') . '/transaction/initialize', [
                'email' => $validated['email'],
                'amount' => $amountKobo,
                'currency' => 'NGN',
                'reference' => $reference,
                'callback_url' => $callbackUrl,
                'metadata' => $metadata,
            ]);

        if (! $response->successful() || ! data_get($response->json(), 'status')) {
            return response()->json([
                'message' => data_get($response->json(), 'message', 'Unable to initialize Paystack payment.'),
            ], 502);
        }

        $data = $response->json('data');

        PaystackTransaction::create([
            'reference' => $reference,
            'email' => $validated['email'],
            'user_id' => $validated['user_id'],
            'device_id' => $validated['device_id'],
            'device_name' => $validated['device_name'],
            'storage_mb' => $validated['storage_mb'],
            'billing_period' => 'yearly',
            'amount_kobo' => $amountKobo,
            'status' => 'initialized',
            'authorization_url' => $data['authorization_url'] ?? null,
            'access_code' => $data['access_code'] ?? null,
            'callback_url' => $callbackUrl,
            'metadata' => $metadata,
        ]);

        return response()->json([
            'reference' => $reference,
            'authorization_url' => $data['authorization_url'] ?? null,
            'access_code' => $data['access_code'] ?? null,
            'amount_ngn' => $priceNgn,
            'storage_mb' => $validated['storage_mb'],
            'billing_period' => 'yearly',
            'public_key' => config('services.paystack.public_key'),
        ]);
    }

    public function verify(Request $request): JsonResponse
    {
        $validated = $request->validate([
            'reference' => ['required', 'string'],
        ]);

        $this->ensurePaystackConfigured();

        $transaction = PaystackTransaction::query()
            ->where('reference', $validated['reference'])
            ->first();

        if (! $transaction) {
            return response()->json([
                'message' => 'Payment reference not found.',
            ], 404);
        }

        if ($transaction->status === 'success') {
            return response()->json([
                'verified' => true,
                'reference' => $transaction->reference,
                'storage_mb' => $transaction->storage_mb,
                'billing_period' => $transaction->billing_period ?? 'yearly',
                'storage_expires_at' => $transaction->storage_expires_at?->toISOString(),
                'amount_ngn' => (int) ($transaction->amount_kobo / 100),
                'device_id' => $transaction->device_id,
                'device_name' => $transaction->device_name,
                'message' => 'Payment already verified.',
            ]);
        }

        $response = Http::timeout(30)
            ->acceptJson()
            ->when(app()->environment('local'), fn ($http) => $http->withoutVerifying())
            ->withToken(config('services.paystack.secret_key'))
            ->get(rtrim(config('services.paystack.base_url'), '/') . '/transaction/verify/' . urlencode($transaction->reference));

        if (! $response->successful() || ! data_get($response->json(), 'status')) {
            return response()->json([
                'message' => data_get($response->json(), 'message', 'Unable to verify Paystack payment.'),
            ], 502);
        }

        $data = $response->json('data');
        $status = data_get($data, 'status');

        if ($status !== 'success') {
            $transaction->update([
                'status' => $status ?: 'pending',
                'verified_payload' => $data,
            ]);

            return response()->json([
                'verified' => false,
                'message' => 'Payment is not yet successful.',
                'status' => $status,
            ], 422);
        }

        $paidAt = Carbon::now();
        $storageExpiresAt = $paidAt->copy()->addYear();

        $transaction->update([
            'status' => 'success',
            'paid_at' => $paidAt,
            'storage_expires_at' => $storageExpiresAt,
            'verified_payload' => $data,
        ]);

        $this->activateDeviceStorage($transaction, $storageExpiresAt);

        return response()->json([
            'verified' => true,
            'reference' => $transaction->reference,
            'storage_mb' => $transaction->storage_mb,
            'billing_period' => $transaction->billing_period ?? 'yearly',
            'storage_expires_at' => $storageExpiresAt->toISOString(),
            'amount_ngn' => (int) ($transaction->amount_kobo / 100),
            'device_id' => $transaction->device_id,
            'device_name' => $transaction->device_name,
            'message' => 'Payment verified successfully.',
        ]);
    }

    public function mobileCallback(Request $request)
    {
        return response()->view('paystack.mobile-callback', [
            'reference' => $request->string('reference')->toString(),
        ]);
    }

    private function ensurePaystackConfigured(): void
    {
        abort_if(
            empty(config('services.paystack.secret_key')) || empty(config('services.paystack.public_key')),
            503,
            'Paystack is not configured yet.'
        );
    }

    private function activateDeviceStorage(PaystackTransaction $transaction, Carbon $storageExpiresAt): void
    {
        if (! Schema::hasTable('devices')) {
            return;
        }

        $updates = [
            'storage' => $transaction->storage_mb,
            'updated_at' => now(),
        ];

        if (Schema::hasColumn('devices', 'storage_expires_at')) {
            $updates['storage_expires_at'] = $storageExpiresAt;
        }

        DB::table('devices')
            ->where('user_id', $transaction->user_id)
            ->where('device_id', $transaction->device_id)
            ->update($updates);
    }
}
