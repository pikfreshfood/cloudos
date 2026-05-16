<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\SyncState;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

class SyncStateController extends Controller
{
    public function index(Request $request): JsonResponse
    {
        $validated = $request->validate([
            'user_id' => ['required', 'integer', 'exists:users,id'],
            'device_id' => ['nullable', 'string', 'max:255'],
        ]);

        $query = SyncState::where('user_id', $validated['user_id']);

        if (isset($validated['device_id'])) {
            $query->where('device_id', $validated['device_id']);
        }

        $syncStates = $query->get();

        return response()->json(['sync_states' => $syncStates]);
    }

    public function show(Request $request): JsonResponse
    {
        $validated = $request->validate([
            'user_id' => ['required', 'integer', 'exists:users,id'],
            'sync_type' => ['required', 'string'],
            'device_id' => ['nullable', 'string', 'max:255'],
        ]);

        $query = SyncState::where('user_id', $validated['user_id'])
            ->where('sync_type', $validated['sync_type']);

        if (isset($validated['device_id'])) {
            $query->where('device_id', $validated['device_id']);
        }

        $syncState = $query->first();

        if (!$syncState) {
            return response()->json(['message' => 'Sync state not found.'], 404);
        }

        return response()->json(['sync_state' => $syncState]);
    }

    public function store(Request $request): JsonResponse
    {
        $validated = $request->validate([
            'user_id' => ['required', 'integer', 'exists:users,id'],
            'device_id' => ['nullable', 'string', 'max:255'],
            'sync_type' => ['required', 'string'],
            'status' => ['nullable', 'string'],
            'progress' => ['nullable', 'integer', 'min:0', 'max:100'],
            'error_message' => ['nullable', 'string'],
            'last_run_at' => ['nullable', 'date'],
            'next_run_at' => ['nullable', 'date'],
            'metadata' => ['nullable', 'array'],
        ]);

        $syncState = SyncState::updateOrCreate(
            [
                'user_id' => $validated['user_id'],
                'sync_type' => $validated['sync_type'],
                'device_id' => $validated['device_id'] ?? null,
            ],
            $validated
        );

        return response()->json([
            'message' => 'Sync state saved successfully.',
            'sync_state' => $syncState,
        ], 201);
    }

    public function update(Request $request): JsonResponse
    {
        $validated = $request->validate([
            'user_id' => ['required', 'integer', 'exists:users,id'],
            'sync_type' => ['required', 'string'],
            'device_id' => ['nullable', 'string', 'max:255'],
            'status' => ['nullable', 'string'],
            'progress' => ['nullable', 'integer', 'min:0', 'max:100'],
            'error_message' => ['nullable', 'string'],
            'last_run_at' => ['nullable', 'date'],
            'next_run_at' => ['nullable', 'date'],
            'metadata' => ['nullable', 'array'],
        ]);

        $query = SyncState::where('user_id', $validated['user_id'])
            ->where('sync_type', $validated['sync_type']);

        if (isset($validated['device_id'])) {
            $query->where('device_id', $validated['device_id']);
        }

        $syncState = $query->first();

        if (!$syncState) {
            return response()->json(['message' => 'Sync state not found.'], 404);
        }

        $syncState->update($validated);

        return response()->json([
            'message' => 'Sync state updated successfully.',
            'sync_state' => $syncState,
        ]);
    }

    public function destroy(Request $request): JsonResponse
    {
        $validated = $request->validate([
            'user_id' => ['required', 'integer', 'exists:users,id'],
            'sync_type' => ['required', 'string'],
            'device_id' => ['nullable', 'string', 'max:255'],
        ]);

        $query = SyncState::where('user_id', $validated['user_id'])
            ->where('sync_type', $validated['sync_type']);

        if (isset($validated['device_id'])) {
            $query->where('device_id', $validated['device_id']);
        }

        $syncState = $query->first();

        if (!$syncState) {
            return response()->json(['message' => 'Sync state not found.'], 404);
        }

        $syncState->delete();

        return response()->json(['message' => 'Sync state deleted successfully.']);
    }
}
