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
        $receiverDeviceNumber = $this->normalizeCloudNumber($receiverPhoneNumber);
        $callerDeviceNumber = $this->normalizeCloudNumber($callerPhoneNumber);
        $callerIsTelephoneNumber = $this->isTelephoneNumber($callerPhoneNumber);
        $callerCallbackNumber = $callerIsTelephoneNumber
            ? $this->normalizeTelephoneNumber($callerPhoneNumber)
            : $callerDeviceNumber;
        $callUrl = $this->deviceCallUrl($receiverDeviceNumber, $callerDeviceNumber, $callType);
        $callerLabel = $callerIsTelephoneNumber ? $callerPhoneNumber : "Cloud OS device {$callerDeviceNumber}";

        $this->sendToPhoneNumber($receiverPhoneNumber, [
            'title' => $callType === 'voice' ? 'Incoming voice call' : 'Incoming video call',
            'body' => "Call from {$callerLabel}",
            'sound' => 'default',
            'priority' => 'high',
            'channelId' => 'incoming-calls',
            'categoryId' => 'cloudos_call',
            'ttl' => 60,
            'interruptionLevel' => 'time-sensitive',
            'data' => [
                'kind' => 'cloudos_webrtc_call',
                'action' => 'open_cloudos_call',
                'callerPhoneNumber' => $callerCallbackNumber,
                'callerNumber' => $callerCallbackNumber,
                'phoneNumber' => $callerCallbackNumber,
                'senderPhoneNumber' => $callerCallbackNumber,
                'sender_phone_number' => $callerCallbackNumber,
                'senderDeviceNumber' => $callerDeviceNumber,
                'displayNumber' => $callerCallbackNumber,
                'callerDeviceNumber' => $callerDeviceNumber,
                'callerDeviceNumberNormalized' => $this->compactCloudNumber($callerDeviceNumber),
                'callerDeviceNumberAliases' => $this->numberAliases($callerDeviceNumber),
                'callerCloudNumber' => $callerDeviceNumber,
                'receiverDeviceNumber' => $receiverDeviceNumber,
                'receiverDeviceNumberNormalized' => $this->compactCloudNumber($receiverDeviceNumber),
                'receiverDeviceNumberAliases' => $this->numberAliases($receiverDeviceNumber),
                'receiverCloudNumber' => $receiverDeviceNumber,
                'callType' => $callType,
                'callUrl' => $callUrl,
                'url' => $callUrl,
                'webUrl' => $callUrl,
                'useSystemDialer' => false,
                'isCloudOsCall' => true,
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
            'ttl' => 2419200,
            'interruptionLevel' => 'time-sensitive',
            'data' => [
                'kind' => 'message',
                'senderPhoneNumber' => $senderPhoneNumber,
            ],
        ]);
    }

    public function sendSupportNotification(string $receiverPhoneNumber, string $body): void
    {
        $preview = trim($body);
        if (mb_strlen($preview) > 120) {
            $preview = mb_substr($preview, 0, 117) . '...';
        }

        $this->sendToPhoneNumber($receiverPhoneNumber, [
            'title' => 'Cloud OS Support',
            'body' => $preview !== '' ? $preview : 'Support replied to your live chat.',
            'sound' => 'default',
            'priority' => 'high',
            'channelId' => 'support-chat',
            'categoryId' => 'cloudos_support',
            'ttl' => 2419200,
            'interruptionLevel' => 'time-sensitive',
            'data' => [
                'kind' => 'support_message',
                'senderPhoneNumber' => '0000000000',
                'recipientPhoneNumber' => $receiverPhoneNumber,
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
                    'channelId' => 'app-updates',
                    'categoryId' => 'cloudos_update',
                    'ttl' => 2419200,
                    'interruptionLevel' => 'time-sensitive',
                    'data' => [
                        'kind' => 'app_update',
                        'title' => $title,
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

            $normalizedPhoneNumber = $this->normalizeCloudNumber($phoneNumber);
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
            ->whereIn('phone_number', $this->numberAliases($phoneNumber))
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

    private function normalizeCloudNumber(string $value): string
    {
        $compact = $this->compactCloudNumber($value);
        if (preg_match('/^(win|mac)pc(\d+)(\d{4})$/', $compact, $matches)) {
            return "{$matches[1]}-pc-{$matches[2]}-{$matches[3]}";
        }
        if (preg_match('/^pc(win|mac)(\d+)(\d{4})$/', $compact, $matches)) {
            return "pc-{$matches[1]}-{$matches[2]}-{$matches[3]}";
        }
        return $compact;
    }

    private function compactCloudNumber(string $value): string
    {
        return strtolower(preg_replace('/[^A-Za-z0-9]+/', '', trim($value)) ?? '');
    }

    private function numberAliases(string $value): array
    {
        $canonical = $this->normalizeCloudNumber($value);
        $compact = $this->compactCloudNumber($canonical);
        $aliases = [$canonical, $compact];

        if (preg_match('/^(win|mac)-pc-(\d+)-(\d{4})$/', $canonical, $matches)) {
            $aliases[] = "pc-{$matches[1]}-{$matches[2]}-{$matches[3]}";
            $aliases[] = "pc{$matches[1]}{$matches[2]}{$matches[3]}";
        }
        if (preg_match('/^pc-(win|mac)-(\d+)-(\d{4})$/', $canonical, $matches)) {
            $aliases[] = "{$matches[1]}-pc-{$matches[2]}-{$matches[3]}";
            $aliases[] = "{$matches[1]}pc{$matches[2]}{$matches[3]}";
        }

        return array_values(array_unique(array_filter($aliases)));
    }

    private function normalizeTelephoneNumber(string $value): string
    {
        return preg_replace('/\D+/', '', trim($value)) ?? '';
    }

    private function isTelephoneNumber(string $value): bool
    {
        $trimmed = trim($value);
        if ($trimmed === '') {
            return false;
        }

        return preg_match('/^\+?\d[\d\s().-]{2,}$/', $trimmed) === 1
            && $this->normalizeTelephoneNumber($trimmed) !== '';
    }

    private function deviceCallUrl(string $receiverDeviceNumber, string $callerDeviceNumber, string $callType): string
    {
        return url('/device-call') . '?' . http_build_query([
            'mode' => 'incoming',
            'user' => $receiverDeviceNumber,
            'target' => $callerDeviceNumber,
            'call_type' => $callType,
        ]);
    }
}
