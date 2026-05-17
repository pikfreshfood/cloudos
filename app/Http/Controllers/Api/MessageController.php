<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\Contact;
use App\Models\Message;
use App\Models\User;
use App\Services\ExpoPushService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;
use Throwable;

class MessageController extends Controller
{
    public function conversations(Request $request): JsonResponse
    {
        $validated = $this->validatePhoneScopedRequest($request, 'owner_phone_number');
        $ownerPhoneNumber = $validated['owner_phone_number'];

        if (! $this->ensureMessagesTableIsReady()) {
            return response()->json(['conversations' => []]);
        }

        try {
            $messages = Message::query()
                ->where('type', 'normal')
                ->where(function ($q) use ($ownerPhoneNumber) {
                    $q->where('sender_phone_number', $ownerPhoneNumber)
                        ->orWhere('recipient_phone_number', $ownerPhoneNumber);
                })
                ->latest('id')
                ->get();
        } catch (Throwable) {
            return response()->json(['conversations' => []]);
        }

        $conversations = $messages
            ->groupBy(fn (Message $message) => $this->normalizePhoneNumber($message->sender_phone_number) === $ownerPhoneNumber
                ? $message->recipient_phone_number
                : $message->sender_phone_number)
            ->map(function ($threadMessages, $phoneNumber) use ($ownerPhoneNumber) {
                /** @var \Illuminate\Support\Collection<int, Message> $threadMessages */
                $latest = $threadMessages->first();
                $unreadCount = $threadMessages
                    ->filter(fn (Message $message) => $this->normalizePhoneNumber($message->recipient_phone_number) === $ownerPhoneNumber && $message->read_at === null)
                    ->count();
                $isLatestOutgoing = $this->normalizePhoneNumber($latest?->sender_phone_number ?? '') === $ownerPhoneNumber;

                return [
                    'phone_number' => (string) $phoneNumber,
                    'last_message' => $latest?->body ?? '',
                    'last_message_at' => optional($latest?->created_at)?->toISOString(),
                    'last_direction' => $isLatestOutgoing ? 'outgoing' : 'incoming',
                    'name' => $isLatestOutgoing
                        ? null
                        : ($latest?->sender_name ?: null),
                    'unread_count' => $unreadCount,
                ];
            })
            ->values();

        return response()->json([
            'conversations' => $conversations,
        ]);
    }

    public function unreadCount(Request $request): JsonResponse
    {
        $validated = $request->validate([
            'user_id' => ['required', 'integer', 'exists:users,id'],
            'phone_number' => ['required', 'regex:/^\d{3,20}$/'],
            'peer_phone_number' => ['nullable', 'regex:/^\d{3,20}$/'],
        ]);
        $phoneNumber = $this->normalizePhoneNumber($validated['phone_number']);
        $peerPhoneNumber = isset($validated['peer_phone_number'])
            ? $this->normalizePhoneNumber($validated['peer_phone_number'])
            : null;

        if (! $this->ensureMessagesTableIsReady()) {
            return response()->json(['unread_count' => 0]);
        }

        try {
            $query = Message::query()
                ->where('type', 'normal')
                ->where('recipient_phone_number', $phoneNumber)
                ->whereNull('read_at');

            if ($peerPhoneNumber) {
                $query->where('sender_phone_number', $peerPhoneNumber);
            }

            $count = $query->count();
        } catch (Throwable) {
            $count = 0;
        }

        return response()->json([
            'unread_count' => $count,
        ]);
    }

    public function thread(Request $request): JsonResponse
    {
        $validated = $this->validatePhoneScopedRequest($request, 'owner_phone_number', 'peer_phone_number');
        $ownerPhoneNumber = $validated['owner_phone_number'];
        $peerPhoneNumber = $validated['peer_phone_number'];

        if (! $this->ensureMessagesTableIsReady()) {
            return response()->json(['messages' => []]);
        }

        try {
            Message::query()
                ->where('type', 'normal')
                ->where('sender_phone_number', $peerPhoneNumber)
                ->where('recipient_phone_number', $ownerPhoneNumber)
                ->whereNull('read_at')
                ->update(['read_at' => now()]);

            $messages = Message::query()
                ->where('type', 'normal')
                ->where(function ($query) use ($ownerPhoneNumber, $peerPhoneNumber) {
                    $query->where(function ($q) use ($ownerPhoneNumber, $peerPhoneNumber) {
                        $q->where('sender_phone_number', $ownerPhoneNumber)
                            ->where('recipient_phone_number', $peerPhoneNumber);
                    })
                        ->orWhere(function ($q) use ($ownerPhoneNumber, $peerPhoneNumber) {
                            $q->where('sender_phone_number', $peerPhoneNumber)
                                ->where('recipient_phone_number', $ownerPhoneNumber);
                        });
                })
                ->orderBy('id')
                ->get()
                ->map(fn (Message $message) => $this->mapMessage($message, $ownerPhoneNumber))
                ->values();
        } catch (Throwable) {
            return response()->json(['messages' => []]);
        }

        return response()->json([
            'messages' => $messages,
        ]);
    }

    public function store(Request $request): JsonResponse
    {
        $validated = $request->validate([
            'user_id' => ['required', 'integer', 'exists:users,id'],
            'sender_phone_number' => ['required', 'regex:/^\d{3,20}$/'],
            'recipient_phone_number' => ['required', 'regex:/^\d{3,20}$/'],
            'body' => ['required', 'string', 'max:5000'],
        ]);

        $validated['sender_phone_number'] = $this->normalizePhoneNumber($validated['sender_phone_number']);
        $validated['recipient_phone_number'] = $this->normalizePhoneNumber($validated['recipient_phone_number']);

        if (empty(trim((string) $validated['body']))) {
            return response()->json([
                'message' => 'Message body is required.',
            ], 422);
        }

        if (! $this->ensureMessagesTableIsReady()) {
            return response()->json([
                'message' => 'Message service is not ready. Confirm the live database user can create or update the messages table.',
            ], 503);
        }

        $sender = User::query()->findOrFail($validated['user_id']);
        $recipientPhoneNumber = $this->resolveDeliveryPhoneNumber($validated['recipient_phone_number']);
        $recipientUser = $this->findUserByMessagePhone($validated['recipient_phone_number'])
            ?: $this->findUserByMessagePhone($recipientPhoneNumber);
        $senderDisplayName = $sender->name;

        if ($recipientUser) {
            $contact = Contact::query()
                ->where('user_id', $recipientUser->id)
                ->where('phone_number', $validated['sender_phone_number'])
                ->first();

            if ($contact) {
                $senderDisplayName = $contact->name;
            }
        }

        $message = Message::query()->create([
            'sender_user_id' => $sender->id,
            'sender_name' => $senderDisplayName,
            'sender_phone_number' => $validated['sender_phone_number'],
            'recipient_phone_number' => $recipientPhoneNumber,
            'type' => 'normal',
            'body' => trim($validated['body']),
        ]);

        app(ExpoPushService::class)->sendMessageNotification(
            $recipientPhoneNumber,
            $validated['sender_phone_number'],
            (string) $senderDisplayName,
            (string) $message->body
        );

        return response()->json([
            'message' => 'Message sent successfully.',
            'data' => $this->mapMessage($message, $validated['sender_phone_number']),
        ], 201);
    }

    public function destroy(Request $request): JsonResponse
    {
        $validated = $this->validatePhoneScopedRequest($request, 'owner_phone_number', 'peer_phone_number');
        $ownerPhoneNumber = $validated['owner_phone_number'];
        $peerPhoneNumber = $validated['peer_phone_number'];

        if (! $this->ensureMessagesTableIsReady()) {
            return response()->json([
                'message' => 'Message service is not ready.',
                'deleted_count' => 0,
            ], 503);
        }

        $deletedCount = Message::query()
            ->where('type', 'normal')
            ->where(function ($query) use ($ownerPhoneNumber, $peerPhoneNumber) {
                $query->where(function ($q) use ($ownerPhoneNumber, $peerPhoneNumber) {
                    $q->where('sender_phone_number', $ownerPhoneNumber)
                        ->where('recipient_phone_number', $peerPhoneNumber);
                })
                    ->orWhere(function ($q) use ($ownerPhoneNumber, $peerPhoneNumber) {
                        $q->where('sender_phone_number', $peerPhoneNumber)
                            ->where('recipient_phone_number', $ownerPhoneNumber);
                    });
            })
            ->delete();

        return response()->json([
            'message' => 'Chat deleted successfully.',
            'deleted_count' => $deletedCount,
        ]);
    }

    private function validatePhoneScopedRequest(Request $request, string ...$phoneFields): array
    {
        $rules = [
            'user_id' => ['required', 'integer', 'exists:users,id'],
        ];

        foreach ($phoneFields as $field) {
            $rules[$field] = ['required', 'regex:/^\d{3,20}$/'];
        }

        $validated = $request->validate($rules);

        foreach ($phoneFields as $field) {
            $validated[$field] = $this->normalizePhoneNumber($validated[$field]);
        }

        return $validated;
    }

    private function normalizePhoneNumber(string $phoneNumber): string
    {
        return preg_replace('/\D+/', '', trim($phoneNumber)) ?? '';
    }

    private function resolveDeliveryPhoneNumber(string $phoneNumber): string
    {
        $normalizedPhoneNumber = $this->normalizePhoneNumber($phoneNumber);

        if ($normalizedPhoneNumber === '' || ! Schema::hasTable('devices')) {
            return $normalizedPhoneNumber;
        }

        $deviceExists = DB::table('devices')
            ->where('phone_number', $normalizedPhoneNumber)
            ->exists();

        if ($deviceExists) {
            return $normalizedPhoneNumber;
        }

        $user = User::query()->where('phone_number', $normalizedPhoneNumber)->first();

        if (! $user) {
            return $normalizedPhoneNumber;
        }

        $devicePhoneNumber = DB::table('devices')
            ->where('user_id', $user->id)
            ->whereNotNull('phone_number')
            ->orderByDesc('updated_at')
            ->value('phone_number');

        return $devicePhoneNumber
            ? $this->normalizePhoneNumber((string) $devicePhoneNumber)
            : $normalizedPhoneNumber;
    }

    private function findUserByMessagePhone(string $phoneNumber): ?User
    {
        $normalizedPhoneNumber = $this->normalizePhoneNumber($phoneNumber);

        if ($normalizedPhoneNumber === '') {
            return null;
        }

        $user = User::query()->where('phone_number', $normalizedPhoneNumber)->first();

        if ($user || ! Schema::hasTable('devices')) {
            return $user;
        }

        $deviceUserId = DB::table('devices')
            ->where('phone_number', $normalizedPhoneNumber)
            ->value('user_id');

        return $deviceUserId ? User::query()->find($deviceUserId) : null;
    }

    private function ensureMessagesTableIsReady(): bool
    {
        try {
            if (! Schema::hasTable('messages')) {
                Schema::create('messages', function (Blueprint $table) {
                    $table->id();
                    $table->unsignedBigInteger('sender_user_id')->nullable();
                    $table->string('sender_name', 255)->nullable();
                    $table->string('sender_phone_number', 50);
                    $table->string('recipient_phone_number', 50);
                    $table->string('type', 20)->default('normal');
                    $table->text('body');
                    $table->timestamp('read_at')->nullable();
                    $table->timestamps();

                    $table->index(['sender_phone_number', 'recipient_phone_number']);
                    $table->index(['recipient_phone_number', 'read_at']);
                });
            }

            $columns = Schema::getColumnListing('messages');

            Schema::table('messages', function (Blueprint $table) use ($columns) {
                if (! in_array('sender_user_id', $columns, true)) {
                    $table->unsignedBigInteger('sender_user_id')->nullable();
                }

                if (! in_array('sender_name', $columns, true)) {
                    $table->string('sender_name', 255)->nullable();
                }

                if (! in_array('sender_phone_number', $columns, true)) {
                    $table->string('sender_phone_number', 50)->nullable();
                }

                if (! in_array('recipient_phone_number', $columns, true)) {
                    $table->string('recipient_phone_number', 50)->nullable();
                }

                if (! in_array('type', $columns, true)) {
                    $table->string('type', 20)->default('normal');
                }

                if (! in_array('body', $columns, true)) {
                    $table->text('body')->nullable();
                }

                if (! in_array('read_at', $columns, true)) {
                    $table->timestamp('read_at')->nullable();
                }

                if (! in_array('created_at', $columns, true)) {
                    $table->timestamp('created_at')->nullable();
                }

                if (! in_array('updated_at', $columns, true)) {
                    $table->timestamp('updated_at')->nullable();
                }
            });

            if (Schema::hasColumn('messages', 'type')) {
                DB::table('messages')->whereNull('type')->update(['type' => 'normal']);
            }

            return Schema::hasTable('messages')
                && Schema::hasColumn('messages', 'sender_user_id')
                && Schema::hasColumn('messages', 'sender_name')
                && Schema::hasColumn('messages', 'sender_phone_number')
                && Schema::hasColumn('messages', 'recipient_phone_number')
                && Schema::hasColumn('messages', 'type')
                && Schema::hasColumn('messages', 'body')
                && Schema::hasColumn('messages', 'read_at');
        } catch (Throwable) {
            return false;
        }
    }

    private function mapMessage(Message $message, string $viewerPhoneNumber): array
    {
        $viewerPhoneNumber = $this->normalizePhoneNumber($viewerPhoneNumber);

        return [
            'id' => (string) $message->id,
            'body' => $message->body,
            'sender_name' => $message->sender_name,
            'sender_phone_number' => $message->sender_phone_number,
            'recipient_phone_number' => $message->recipient_phone_number,
            'direction' => $this->normalizePhoneNumber($message->sender_phone_number) === $viewerPhoneNumber ? 'outgoing' : 'incoming',
            'read_at' => optional($message->read_at)?->toISOString(),
            'created_at' => optional($message->created_at)?->toISOString(),
        ];
    }
}
