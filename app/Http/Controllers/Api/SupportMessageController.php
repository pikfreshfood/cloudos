<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\SupportMessage;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

class SupportMessageController extends Controller
{
    public function index(Request $request): JsonResponse
    {
        $validated = $request->validate([
            'user_id' => ['required', 'integer', 'exists:users,id'],
        ]);

        $messages = SupportMessage::query()
            ->where('user_id', $validated['user_id'])
            ->latest()
            ->with(['user:id,name,email,username,phone_number', 'device:id,name,phone_number'])
            ->get();

        $user = \App\Models\User::find($validated['user_id']);

        return response()->json([
            'messages' => $messages,
            'support' => [
                'name' => 'Cloud OS Support',
                'initials' => 'CS',
                'avatar_url' => null,
            ],
        ]);
    }

    public function store(Request $request): JsonResponse
    {
        $validated = $request->validate([
            'user_id' => ['required', 'integer', 'exists:users,id'],
            'device_id' => ['nullable', 'integer', 'exists:devices,id'],
            'topic' => ['required', 'string', 'max:120'],
            'message' => ['required', 'string', 'max:5000'],
        ]);

        $user = \App\Models\User::findOrFail($validated['user_id']);
        $validated['name'] = $user->name;
        $validated['email'] = $user->email;

        $supportMessage = SupportMessage::create($validated);
        $supportMessage->load(['user:id,name,email,username,phone_number', 'device:id,name,phone_number']);

        return response()->json([
            'message' => 'Support message sent successfully.',
            'support_message' => $supportMessage,
            'support' => [
                'name' => 'Cloud OS Support',
                'initials' => 'CS',
                'avatar_url' => null,
            ],
        ], 201);
    }
}
