<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\MediaState;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

class MediaStateController extends Controller
{
    public function index(Request $request): JsonResponse
    {
        $validated = $request->validate([
            'user_id' => ['required', 'integer', 'exists:users,id'],
            'media_type' => ['nullable', 'string', 'in:music,video'],
        ]);

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
}
