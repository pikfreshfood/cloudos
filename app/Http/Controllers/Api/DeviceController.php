<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\User;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;
use Throwable;

class DeviceController extends Controller
{
    private const DEFAULT_DEVICE_STORAGE_MB = 100;

    public function sync(Request $request): JsonResponse
    {
        $validated = $request->validate([
            'user_id' => ['required', 'integer', 'exists:users,id'],
            'devices' => ['required', 'array', 'min:1'],
            'devices.*.device_id' => ['required', 'string', 'max:255'],
            'devices.*.name' => ['nullable', 'string', 'max:255'],
            'devices.*.os' => ['nullable', 'string', 'max:30'],
            'devices.*.phone_number' => ['required', 'string', 'max:50'],
            'devices.*.storage' => ['nullable', 'numeric', 'min:1'],
            'devices.*.storage_expires_at' => ['nullable', 'date'],
        ]);

        $now = now();
        $synced = 0;

        foreach ($validated['devices'] as $device) {
            $phoneNumber = preg_replace('/\D+/', '', (string) $device['phone_number']) ?? '';

            if ($phoneNumber === '') {
                continue;
            }

            DB::table('devices')->updateOrInsert(
                [
                    'user_id' => $validated['user_id'],
                    'device_id' => $device['device_id'],
                ],
                [
                    'name' => $device['name'] ?? null,
                    'os' => $device['os'] ?? null,
                    'phone_number' => $phoneNumber,
                    'storage' => (int) ($device['storage'] ?? self::DEFAULT_DEVICE_STORAGE_MB),
                    'storage_expires_at' => $device['storage_expires_at'] ?? null,
                    'updated_at' => $now,
                    'created_at' => $now,
                ]
            );

            $synced++;
        }

        return response()->json([
            'message' => "Synced {$synced} device(s).",
            'synced' => $synced,
        ]);
    }

    public function index(Request $request): JsonResponse
    {
        $validated = $request->validate([
            'user_id' => ['required', 'integer', 'exists:users,id'],
        ]);

        $devices = DB::table('devices')
            ->where('user_id', $validated['user_id'])
            ->orderBy('created_at')
            ->get()
            ->map(fn ($row) => [
                'device_id' => $row->device_id,
                'name' => $row->name,
                'os' => $row->os,
                'phone_number' => $row->phone_number,
                'storage' => (int) $row->storage,
                'storage_expires_at' => $row->storage_expires_at ?? null,
                'created_at' => $row->created_at,
                'updated_at' => $row->updated_at,
            ]);

        return response()->json(['devices' => $devices]);
    }

    public function installedApps(Request $request): JsonResponse
    {
        $validated = $request->validate([
            'user_id' => ['required', 'integer', 'exists:users,id'],
            'device_id' => ['required', 'string', 'max:255'],
        ]);

        $apps = DB::table('device_installed_apps')
            ->where('user_id', $validated['user_id'])
            ->where('device_id', $validated['device_id'])
            ->orderBy('created_at')
            ->get()
            ->map(fn ($row) => json_decode((string) $row->app_data, true))
            ->filter()
            ->values();

        return response()->json(['apps' => $apps]);
    }

    public function syncInstalledApps(Request $request): JsonResponse
    {
        $validated = $request->validate([
            'user_id' => ['required', 'integer', 'exists:users,id'],
            'device_id' => ['required', 'string', 'max:255'],
            'apps' => ['required', 'array'],
            'apps.*' => ['required', 'array'],
        ]);

        $storeAppIds = collect($validated['apps'])
            ->map(fn ($app) => (string) ($app['storeAppId'] ?? $app['store_app_id'] ?? $app['id'] ?? ''))
            ->filter()
            ->values();

        $query = DB::table('device_installed_apps')
            ->where('user_id', $validated['user_id'])
            ->where('device_id', $validated['device_id']);

        if ($storeAppIds->isEmpty()) {
            $query->delete();
        } else {
            $query->whereNotIn('store_app_id', $storeAppIds)->delete();
        }

        $synced = $this->storeInstalledApps(
            (int) $validated['user_id'],
            $validated['device_id'],
            $validated['apps']
        );

        return response()->json([
            'message' => "Synced {$synced} installed app(s).",
            'synced' => $synced,
        ]);
    }

    public function shareInstalledApps(Request $request): JsonResponse
    {
        $validated = $request->validate([
            'sender_user_id' => ['required', 'integer', 'exists:users,id'],
            'sender_device_id' => ['required', 'string', 'max:255'],
            'recipient_phone_number' => ['required', 'string'],
            'apps' => ['required', 'array', 'min:1'],
            'apps.*' => ['required', 'array'],
        ]);

        $phoneDigits = preg_replace('/\D+/', '', (string) $validated['recipient_phone_number']) ?? '';
        $recipientDevice = $this->findDeviceByPhoneNumber((string) $validated['recipient_phone_number'], $phoneDigits);

        if (!$recipientDevice) {
            return response()->json(['message' => 'Recipient device not found.'], 404);
        }

        if ((int) $recipientDevice->user_id === (int) $validated['sender_user_id']
            && $recipientDevice->device_id === $validated['sender_device_id']) {
            return response()->json(['message' => 'Choose another device, not the current device.'], 422);
        }

        $synced = $this->storeInstalledApps(
            (int) $recipientDevice->user_id,
            $recipientDevice->device_id,
            $validated['apps']
        );

        $recipient = User::find($recipientDevice->user_id);

        return response()->json([
            'message' => "{$synced} app(s) added to {$recipientDevice->name}.",
            'synced' => $synced,
            'recipient_user_id' => $recipientDevice->user_id,
            'recipient_name' => $recipient?->name,
            'recipient_device_id' => $recipientDevice->device_id,
            'recipient_device_name' => $recipientDevice->name,
        ]);
    }

    public function syncPushToken(Request $request): JsonResponse
    {
        $validated = $request->validate([
            'user_id' => ['required', 'integer', 'exists:users,id'],
            'device_id' => ['required', 'string', 'max:255'],
            'phone_number' => ['required', 'string', 'max:50'],
            'push_token' => ['required', 'string', 'max:255'],
            'platform' => ['nullable', 'string', 'max:30'],
        ]);

        if (! $this->ensurePushColumnsAreReady()) {
            return response()->json(['message' => 'Push token storage is not ready.'], 503);
        }

        $phoneNumber = preg_replace('/\D+/', '', (string) $validated['phone_number']) ?? '';

        DB::table('devices')->updateOrInsert(
            [
                'user_id' => $validated['user_id'],
                'device_id' => $validated['device_id'],
            ],
            [
                'phone_number' => $phoneNumber,
                'push_token' => $validated['push_token'],
                'push_platform' => $validated['platform'] ?? null,
                'updated_at' => now(),
                'created_at' => now(),
            ]
        );

        return response()->json(['message' => 'Push token synced.']);
    }

    private function storeInstalledApps(int $userId, string $deviceId, array $apps): int
    {
        $now = now();
        $synced = 0;

        foreach ($apps as $app) {
            $storeAppId = (string) ($app['storeAppId'] ?? $app['store_app_id'] ?? $app['id'] ?? '');

            if ($storeAppId === '') {
                continue;
            }

            DB::table('device_installed_apps')->updateOrInsert(
                [
                    'user_id' => $userId,
                    'device_id' => $deviceId,
                    'store_app_id' => $storeAppId,
                ],
                [
                    'app_data' => json_encode($app),
                    'updated_at' => $now,
                    'created_at' => $now,
                ]
            );

            $synced++;
        }

        return $synced;
    }

    private function findDeviceByPhoneNumber(string $phoneInput, string $phoneDigits): ?object
    {
        if (!Schema::hasTable('devices')) {
            return null;
        }

        $device = DB::table('devices')
            ->where('phone_number', $phoneInput)
            ->orWhere('phone_number', $phoneDigits)
            ->first();

        if ($device || $phoneDigits === '') {
            return $device;
        }

        $allDevices = DB::table('devices')
            ->whereNotNull('phone_number')
            ->get();

        foreach ($allDevices as $candidate) {
            $dbDigits = preg_replace('/\D+/', '', (string) $candidate->phone_number);

            if ($dbDigits === '') {
                continue;
            }

            if ($dbDigits === $phoneDigits || str_contains($dbDigits, $phoneDigits) || str_contains($phoneDigits, $dbDigits)) {
                if (strlen($dbDigits) >= 7 && strlen($phoneDigits) >= 7) {
                    return $candidate;
                }
            }
        }

        return null;
    }

    private function ensurePushColumnsAreReady(): bool
    {
        try {
            if (! Schema::hasTable('devices')) {
                return false;
            }

            $columns = Schema::getColumnListing('devices');

            Schema::table('devices', function (Blueprint $table) use ($columns) {
                if (! in_array('push_token', $columns, true)) {
                    $table->string('push_token', 255)->nullable()->index();
                }

                if (! in_array('push_platform', $columns, true)) {
                    $table->string('push_platform', 30)->nullable();
                }
            });

            return Schema::hasColumn('devices', 'push_token')
                && Schema::hasColumn('devices', 'push_platform');
        } catch (Throwable) {
            return false;
        }
    }
}
