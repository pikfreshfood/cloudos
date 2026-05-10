<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\AppUpdate;
use App\Models\AppUpdateSeen;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

class AppUpdateController extends Controller
{
    public function latest(Request $request): JsonResponse
    {
        $validated = $request->validate([
            'user_id' => ['required', 'integer', 'exists:users,id'],
            'last_seen_version' => ['nullable', 'integer'],
        ]);

        $latestUpdate = AppUpdate::where('status', 'active')
            ->latest()
            ->first();

        if (!$latestUpdate) {
            return response()->json(['update' => null]);
        }

        $userHasSeen = AppUpdateSeen::where('app_update_id', $latestUpdate->id)
            ->where('user_id', $validated['user_id'])
            ->first();

        if ($userHasSeen) {
            if ($userHasSeen->action === 'never_show' && $latestUpdate->version_code <= ($validated['last_seen_version'] ?? 0)) {
                return response()->json(['update' => null]);
            }
            if (in_array($userHasSeen->action, ['seen', 'skipped'])) {
                return response()->json(['update' => null]);
            }
        }

        return response()->json([
            'update' => [
                'id' => $latestUpdate->id,
                'version_code' => $latestUpdate->version_code,
                'title' => $latestUpdate->title,
                'message' => $latestUpdate->message,
                'created_at' => $latestUpdate->created_at,
            ],
        ]);
    }

    public function markSeen(Request $request): JsonResponse
    {
        $validated = $request->validate([
            'user_id' => ['required', 'integer', 'exists:users,id'],
            'app_update_id' => ['required', 'integer', 'exists:app_updates,id'],
            'action' => ['required', 'in:seen,skipped,never_show'],
        ]);

        AppUpdateSeen::updateOrCreate(
            [
                'app_update_id' => $validated['app_update_id'],
                'user_id' => $validated['user_id'],
            ],
            [
                'action' => $validated['action'],
            ]
        );

        return response()->json(['success' => true]);
    }
}
