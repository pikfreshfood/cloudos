<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\MediaState;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

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
            'device_id' => ['nullable', 'integer', 'exists:devices,id'],
            'media_type' => ['required', 'string', 'in:music,video'],
            'media_path' => ['required', 'string', 'max:500'],
            'media_title' => ['nullable', 'string', 'max:255'],
            'position_ms' => ['required', 'integer', 'min:0'],
            'duration_ms' => ['required', 'integer', 'min:0'],
            'playback_status' => ['required', 'string', 'in:playing,paused,stopped'],
            'metadata' => ['nullable', 'array'],
        ]);

        $mediaState = MediaState::updateOrCreate(
            [
                'user_id' => $validated['user_id'],
                'media_type' => $validated['media_type'],
                'media_path' => $validated['media_path'],
            ],
            $validated
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
}
