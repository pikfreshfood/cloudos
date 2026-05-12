<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Services\ExpoPushService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;
use Throwable;

class SignalController extends Controller
{
    public function handle(Request $request): JsonResponse
    {
        $validated = $request->validate([
            'type' => ['required', 'in:send,receive,peek'],
            'sender' => ['nullable', 'string', 'max:50'],
            'receiver' => ['nullable', 'string', 'max:50'],
            'signalType' => ['nullable', 'string', 'max:30'],
            'data' => ['nullable'],
            'user' => ['nullable', 'string', 'max:50'],
            'delete' => ['nullable', 'boolean'],
        ]);

        if (! $this->signalsTableIsAvailable()) {
            return $validated['type'] === 'send'
                ? response()->json(['message' => 'Signal service is not ready.'], 503)
                : response()->json([]);
        }

        if ($validated['type'] === 'send') {
            $sender = $this->normalizePhone($validated['sender'] ?? '');
            $receiver = $this->normalizePhone($validated['receiver'] ?? '');
            $signalType = (string) ($validated['signalType'] ?? '');
            $data = $validated['data'] ?? '';

            if ($sender === '' || $receiver === '' || $signalType === '' || $data === '') {
                return response()->json(['message' => 'Invalid signal payload.'], 422);
            }

            try {
                DB::table('signals')->insert([
                    'sender_phone_number' => $sender,
                    'receiver_phone_number' => $receiver,
                    'type' => $signalType,
                    'data' => is_string($data) ? $data : json_encode($data),
                    'created_at' => now(),
                    'updated_at' => now(),
                ]);

                if ($signalType === 'offer') {
                    $signalData = is_string($data) ? json_decode($data, true) : $data;
                    $callType = ($signalData['callType'] ?? null) === 'voice' ? 'voice' : 'video';
                    app(ExpoPushService::class)->sendCallNotification($receiver, $sender, $callType);
                }
            } catch (Throwable) {
                return response()->json(['message' => 'Signal service is not ready.'], 503);
            }

            return response()->json(['message' => 'sent']);
        }

        $user = $this->normalizePhone($validated['user'] ?? '');

        if ($user === '') {
            return response()->json([]);
        }

        try {
            $signals = DB::table('signals')
                ->where('receiver_phone_number', $user)
                ->orderBy('id')
                ->get()
                ->map(fn ($signal) => [
                    'id' => $signal->id,
                    'sender' => $signal->sender_phone_number,
                    'receiver' => $signal->receiver_phone_number,
                    'type' => $signal->type,
                    'data' => $signal->data,
                    'created_at' => $signal->created_at,
                ])
                ->values();

            $shouldDelete = $validated['type'] === 'receive' && ($validated['delete'] ?? true);

            if ($shouldDelete) {
                DB::table('signals')
                    ->where('receiver_phone_number', $user)
                    ->delete();
            }
        } catch (Throwable) {
            return response()->json([]);
        }

        return response()->json($signals);
    }

    private function normalizePhone(string $value): string
    {
        return preg_replace('/\D+/', '', trim($value)) ?? '';
    }

    private function signalsTableIsAvailable(): bool
    {
        try {
            return Schema::hasTable('signals');
        } catch (Throwable) {
            return false;
        }
    }
}
