<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\SyncState;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Schema;

class SyncStateController extends Controller
{
    private function ensureSyncStatesStorage(): void
    {
        if (!Schema::hasTable('sync_states')) {
            Schema::create('sync_states', function (Blueprint $table) {
                $table->id();
                $table->unsignedBigInteger('user_id');
                $table->string('device_id')->nullable();
                $table->string('sync_type');
                $table->string('status')->default('idle');
                $table->integer('progress')->default(0);
                $table->text('error_message')->nullable();
                $table->timestamp('last_run_at')->nullable();
                $table->timestamp('next_run_at')->nullable();
                $table->json('metadata')->nullable();
                $table->timestamps();

                $table->index('user_id');
                $table->unique(['user_id', 'sync_type', 'device_id'], 'sync_states_user_type_device_unique');
            });

            return;
        }

        $columns = [
            'user_id' => fn (Blueprint $table) => $table->unsignedBigInteger('user_id')->index()->default(0),
            'device_id' => fn (Blueprint $table) => $table->string('device_id')->nullable(),
            'sync_type' => fn (Blueprint $table) => $table->string('sync_type')->default('offline_folder'),
            'status' => fn (Blueprint $table) => $table->string('status')->default('idle'),
            'progress' => fn (Blueprint $table) => $table->integer('progress')->default(0),
            'error_message' => fn (Blueprint $table) => $table->text('error_message')->nullable(),
            'last_run_at' => fn (Blueprint $table) => $table->timestamp('last_run_at')->nullable(),
            'next_run_at' => fn (Blueprint $table) => $table->timestamp('next_run_at')->nullable(),
            'metadata' => fn (Blueprint $table) => $table->json('metadata')->nullable(),
            'created_at' => fn (Blueprint $table) => $table->timestamp('created_at')->nullable(),
            'updated_at' => fn (Blueprint $table) => $table->timestamp('updated_at')->nullable(),
        ];

        foreach ($columns as $column => $addColumn) {
            if (!Schema::hasColumn('sync_states', $column)) {
                Schema::table('sync_states', $addColumn);
            }
        }
    }

    public function index(Request $request): JsonResponse
    {
        $this->ensureSyncStatesStorage();

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
        $this->ensureSyncStatesStorage();

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
        $this->ensureSyncStatesStorage();

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
        $this->ensureSyncStatesStorage();

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
        $this->ensureSyncStatesStorage();

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
