<?php

namespace App\Services;

use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Http;
use Illuminate\Support\Facades\Log;
use Illuminate\Support\Facades\Schema;
use Throwable;

class ExpoPushService
{
    private const EXPO_PUSH_URL = 'https://exp.host/--/api/v2/push/send';

    public function sendCallNotification(string $receiverPhoneNumber, string $callerPhoneNumber, string $callType = 'video'): void
    {
        $callType = $callType === 'voice' ? 'voice' : 'video';

        $this->sendToPhoneNumber($receiverPhoneNumber, [
            'title' => $callType === 'voice' ? 'Incoming voice call' : 'Incoming video call',
            'body' => "Call from {$callerPhoneNumber}",
            'sound' => 'default',
            'priority' => 'high',
            'channelId' => 'incoming-calls',
            'categoryId' => 'cloudos_call',
            'data' => [
                'kind' => 'call',
                'callerPhoneNumber' => $callerPhoneNumber,
                'callType' => $callType,
            ],
        ]);
    }

    public function sendMessageNotification(string $receiverPhoneNumber, string $senderPhoneNumber, string $senderName, string $body): void
    {
        $preview = trim($body);
        if (mb_strlen($preview) > 120) {
            $preview = mb_substr($preview, 0, 117) . '...';
        }

        $this->sendToPhoneNumber($receiverPhoneNumber, [
            'title' => $senderName !== '' ? $senderName : $senderPhoneNumber,
            'body' => $preview,
            'sound' => 'default',
            'priority' => 'high',
            'channelId' => 'messages',
            'categoryId' => 'cloudos_message',
            'data' => [
                'kind' => 'message',
                'senderPhoneNumber' => $senderPhoneNumber,
            ],
        ]);
    }

    public function sendAppUpdateNotification(string $title, string $message): void
    {
        try {
            if (! Schema::hasTable('devices') || ! Schema::hasColumn('devices', 'push_token')) {
                Log::info('Expo push skipped: devices push_token column is missing.');
                return;
            }

            $tokens = DB::table('devices')
                ->whereNotNull('push_token')
                ->pluck('push_token')
                ->filter()
                ->unique()
                ->values();

            if ($tokens->isEmpty()) {
                Log::info('Expo push skipped: no tokens found for app update.');
                return;
            }

            $payload = $tokens
                ->map(fn ($token) => [
                    'to' => $token,
                    'title' => $title,
                    'body' => $message,
                    'sound' => 'default',
                    'priority' => 'high',
                    'data' => [
                        'kind' => 'app_update',
                    ],
                ])
                ->values()
                ->all();

            $response = Http::timeout(8)
                ->acceptJson()
                ->post(self::EXPO_PUSH_URL, count($payload) === 1 ? $payload[0] : $payload);

            if (! $response->successful()) {
                Log::warning('Expo push failed for app update.', [
                    'status' => $response->status(),
                    'body' => $response->body(),
                ]);
            }
        } catch (Throwable $e) {
            Log::warning('Expo push exception for app update.', [
                'error' => $e->getMessage(),
            ]);
        }
    }

    private function sendToPhoneNumber(string $phoneNumber, array $message): void
    {
        try {
            if (! Schema::hasTable('devices') || ! Schema::hasColumn('devices', 'push_token')) {
                Log::info('Expo push skipped: devices push_token column is missing.');
                return;
            }

            $normalizedPhoneNumber = preg_replace('/\D+/', '', $phoneNumber) ?? '';
            if ($normalizedPhoneNumber === '') {
                Log::info('Expo push skipped: empty receiver phone number.');
                return;
            }

            $tokens = $this->tokensForPhoneNumber($normalizedPhoneNumber);

            if ($tokens->isEmpty()) {
                Log::info('Expo push skipped: no token found for receiver.', [
                    'receiver_phone_number' => $normalizedPhoneNumber,
                    'kind' => $message['data']['kind'] ?? null,
                ]);
                return;
            }

            $payload = $tokens
                ->map(fn ($token) => array_merge($message, ['to' => $token]))
                ->values()
                ->all();

            $response = Http::timeout(8)
                ->acceptJson()
                ->post(self::EXPO_PUSH_URL, count($payload) === 1 ? $payload[0] : $payload);

            if (! $response->successful()) {
                Log::warning('Expo push failed.', [
                    'status' => $response->status(),
                    'body' => $response->body(),
                    'receiver_phone_number' => $normalizedPhoneNumber,
                ]);
            }
        } catch (Throwable $e) {
            Log::warning('Expo push exception.', [
                'receiver_phone_number' => $phoneNumber,
                'error' => $e->getMessage(),
            ]);
        }
    }

    private function tokensForPhoneNumber(string $phoneNumber)
    {
        $tokens = DB::table('devices')
            ->where('phone_number', $phoneNumber)
            ->whereNotNull('push_token')
            ->pluck('push_token');

        if ($tokens->isNotEmpty() || ! Schema::hasTable('users')) {
            return $tokens->filter()->unique()->values();
        }

        $userId = DB::table('users')
            ->where('phone_number', $phoneNumber)
            ->value('id');

        if (! $userId) {
            return $tokens->filter()->unique()->values();
        }

        return DB::table('devices')
            ->where('user_id', $userId)
            ->whereNotNull('push_token')
            ->pluck('push_token')
            ->filter()
            ->unique()
            ->values();
    }
}
