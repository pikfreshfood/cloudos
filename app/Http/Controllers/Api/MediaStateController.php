<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\MediaState;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;
use Throwable;

class MediaStateController extends Controller
{
    public function index(Request $request): JsonResponse
    {
        $validated = $request->validate([
            'user_id' => ['required', 'integer', 'exists:users,id'],
            'media_type' => ['nullable', 'string', 'in:music,video'],
        ]);

        if (! $this->ensureMediaStatesTableIsReady()) {
            return response()->json(['media_states' => []]);
        }

        $query = MediaState::query()->where('user_id', $validated['user_id']);

        if (isset($validated['media_type'])) {
            $query->where('media_type', $validated['media_type']);
        }

        $states = $query->with(['device:id,name'])
            ->latest()
            ->get();

        return response()->json([
            'media_states' => $states,
        ]);
    }

    public function show(Request $request): JsonResponse
    {
        $validated = $request->validate([
            'user_id' => ['required', 'integer', 'exists:users,id'],
            'media_type' => ['required', 'string', 'in:music,video'],
            'media_path' => ['required', 'string', 'max:500'],
        ]);

        if (! $this->ensureMediaStatesTableIsReady()) {
            return response()->json(['media_state' => null]);
        }

        $state = MediaState::query()
            ->where('user_id', $validated['user_id'])
            ->where('media_type', $validated['media_type'])
            ->where('media_path', $validated['media_path'])
            ->first();

        if (! $state) {
            return response()->json([
                'media_state' => null,
            ]);
        }

        return response()->json([
            'media_state' => $state,
        ]);
    }

    public function store(Request $request): JsonResponse
    {
        $validated = $request->validate([
            'user_id' => ['required', 'integer', 'exists:users,id'],
            'device_id' => ['nullable', 'string', 'max:255'],
            'media_type' => ['required', 'string', 'in:music,video'],
            'media_path' => ['required', 'string', 'max:500'],
            'media_title' => ['nullable', 'string', 'max:255'],
            'position_ms' => ['required', 'integer', 'min:0'],
            'duration_ms' => ['required', 'integer', 'min:0'],
            'playback_status' => ['required', 'string', 'in:playing,paused,stopped'],
            'metadata' => ['nullable', 'array'],
        ]);

        if (! $this->ensureMediaStatesTableIsReady()) {
            return response()->json([
                'message' => 'Media playback state storage is not ready.',
            ], 503);
        }

        $databaseDeviceId = $this->resolveDatabaseDeviceId(
            (int) $validated['user_id'],
            $validated['device_id'] ?? null
        );

        $mediaState = MediaState::updateOrCreate(
            [
                'user_id' => $validated['user_id'],
                'media_type' => $validated['media_type'],
                'media_path' => $validated['media_path'],
            ],
            [
                ...$validated,
                'device_id' => $databaseDeviceId,
            ]
        );

        $mediaState->load(['device:id,name']);

        return response()->json([
            'message' => 'Media state saved successfully.',
            'media_state' => $mediaState,
        ], 201);
    }

    public function destroy(Request $request): JsonResponse
    {
        $validated = $request->validate([
            'user_id' => ['required', 'integer', 'exists:users,id'],
            'media_type' => ['required', 'string', 'in:music,video'],
            'media_path' => ['required', 'string', 'max:500'],
        ]);

        if (! $this->ensureMediaStatesTableIsReady()) {
            return response()->json([
                'message' => 'Media state deleted successfully.',
            ]);
        }

        MediaState::query()
            ->where('user_id', $validated['user_id'])
            ->where('media_type', $validated['media_type'])
            ->where('media_path', $validated['media_path'])
            ->delete();

        return response()->json([
            'message' => 'Media state deleted successfully.',
        ]);
    }

    private function resolveDatabaseDeviceId(int $userId, ?string $deviceId): ?int
    {
        if (! $deviceId || ! Schema::hasTable('devices')) {
            return null;
        }

        $query = DB::table('devices')->where('user_id', $userId);

        if (ctype_digit($deviceId)) {
            $byPrimaryKey = (clone $query)->where('id', (int) $deviceId)->value('id');
            if ($byPrimaryKey) {
                return (int) $byPrimaryKey;
            }
        }

        $byExternalId = $query->where('device_id', $deviceId)->value('id');

        return $byExternalId ? (int) $byExternalId : null;
    }

    private function ensureMediaStatesTableIsReady(): bool
    {
        try {
            if (! Schema::hasTable('media_states')) {
                Schema::create('media_states', function (Blueprint $table) {
                    $table->id();
                    $table->unsignedBigInteger('user_id');
                    $table->unsignedBigInteger('device_id')->nullable();
                    $table->string('media_type');
                    $table->string('media_path', 500);
                    $table->string('media_title')->nullable();
                    $table->bigInteger('position_ms')->default(0);
                    $table->bigInteger('duration_ms')->default(0);
                    $table->string('playback_status')->default('stopped');
                    $table->json('metadata')->nullable();
                    $table->timestamps();

                    $table->unique(['user_id', 'media_type', 'media_path']);
                    $table->index(['user_id', 'device_id']);
                });
            }

            $columns = Schema::getColumnListing('media_states');

            Schema::table('media_states', function (Blueprint $table) use ($columns) {
                if (! in_array('user_id', $columns, true)) {
                    $table->unsignedBigInteger('user_id');
                }

                if (! in_array('device_id', $columns, true)) {
                    $table->unsignedBigInteger('device_id')->nullable();
                }

                if (! in_array('media_type', $columns, true)) {
                    $table->string('media_type');
                }

                if (! in_array('media_path', $columns, true)) {
                    $table->string('media_path', 500);
                }

                if (! in_array('media_title', $columns, true)) {
                    $table->string('media_title')->nullable();
                }

                if (! in_array('position_ms', $columns, true)) {
                    $table->bigInteger('position_ms')->default(0);
                }

                if (! in_array('duration_ms', $columns, true)) {
                    $table->bigInteger('duration_ms')->default(0);
                }

                if (! in_array('playback_status', $columns, true)) {
                    $table->string('playback_status')->default('stopped');
                }

                if (! in_array('metadata', $columns, true)) {
                    $table->json('metadata')->nullable();
                }

                if (! in_array('created_at', $columns, true)) {
                    $table->timestamp('created_at')->nullable();
                }

                if (! in_array('updated_at', $columns, true)) {
                    $table->timestamp('updated_at')->nullable();
                }
            });

            return Schema::hasTable('media_states')
                && Schema::hasColumn('media_states', 'user_id')
                && Schema::hasColumn('media_states', 'media_type')
                && Schema::hasColumn('media_states', 'media_path')
                && Schema::hasColumn('media_states', 'position_ms')
                && Schema::hasColumn('media_states', 'duration_ms')
                && Schema::hasColumn('media_states', 'playback_status');
        } catch (Throwable) {
            return false;
        }
    }
}
