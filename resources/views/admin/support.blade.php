@extends('layouts.admin')

@section('title', 'Cloud OS Admin - Support')
@section('header_title', 'Support')

@section('content')
<div style="display: flex; gap: 24px; min-height: 600px;">
    <div style="width: 320px; flex-shrink: 0;">
        <div class="card">
            <div class="page-actions" style="margin-bottom: 16px;">
                <h3>Conversations</h3>
                <span class="muted">{{ $conversations->count() }}</span>
            </div>
            <div style="display: flex; flex-direction: column; gap: 8px;">
                <a href="{{ route('admin.support') }}" 
                   style="padding: 12px; border-radius: 8px; text-decoration: none; {{ !$selectedUser ? 'background: var(--line);' : 'background: transparent;' }}"
                >
                    <div style="font-weight: 500; color: var(--ink);">All Messages</div>
                    <div style="font-size: 12px; color: var(--muted);">View all support messages</div>
                </a>
                @forelse ($conversations as $conv)
                    <a href="{{ route('admin.support', ['user_id' => $conv['user']->id ?? 0]) }}" 
                       style="padding: 12px; border-radius: 8px; text-decoration: none; {{ ($selectedUser && $conv['user'] && $selectedUser->id === $conv['user']->id) ? 'background: var(--line);' : 'background: transparent;' }}"
                    >
                        <div style="display: flex; justify-content: space-between; align-items: center;">
                            <div style="font-weight: 500; color: var(--ink);">
                                {{ $conv['user']->name ?? 'Unknown User' }}
                            </div>
                            <span class="muted" style="font-size: 12px;">{{ $conv['message_count'] }}</span>
                        </div>
                        @if($conv['user'])
                            <div style="font-size: 12px; color: var(--muted);">{{ $conv['user']->email }}</div>
                        @endif
                        <div style="font-size: 12px; color: var(--muted); margin-top: 4px;">
                            {{ $conv['phone_number'] }}
                        </div>
                        @if($conv['last_message'])
                            <div style="font-size: 12px; color: var(--muted); margin-top: 4px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;">
                                {{ \Illuminate\Support\Str::limit($conv['last_message']->body, 40) }}
                            </div>
                        @endif
                    </a>
                @empty
                    <div class="muted" style="padding: 12px;">No conversations yet.</div>
                @endforelse
            </div>
        </div>
    </div>

    <div style="flex: 1;">
        <div class="card">
            <div class="page-actions">
                <h2>
                    @if($selectedUser)
                        Conversation with {{ $selectedUser->name }}
                    @else
                        All Support Messages
                    @endif
                </h2>
                <span class="muted">{{ $messages->total() }} messages</span>
            </div>

            <div style="margin-bottom: 24px; padding: 16px; background: var(--line); border-radius: 12px;">
                <h3 style="margin-top: 0; margin-bottom: 12px;">Send Reply</h3>
                <form class="inline-form" method="POST" action="{{ route('admin.support.reply') }}">
                    @csrf
                    <div style="display: flex; gap: 12px; margin-bottom: 12px; align-items: center;">
                        <label style="min-width: 120px;">Recipient Phone:</label>
                        <input type="text" name="recipient_phone_number" required style="flex: 1; padding: 8px 12px; border: 1px solid var(--line); border-radius: 8px;" placeholder="e.g., 1234567890" value="{{ $selectedUser->phone_number ?? '' }}">
                    </div>
                    <div style="display: flex; gap: 12px; margin-bottom: 12px; align-items: flex-start;">
                        <label style="min-width: 120px; margin-top: 8px;">Reply:</label>
                        <textarea name="body" required style="flex: 1; padding: 8px 12px; border: 1px solid var(--line); border-radius: 8px; min-height: 80px;" placeholder="Write your reply here..."></textarea>
                    </div>
                    <div style="display: flex; justify-content: flex-end;">
                        <button class="btn btn-primary" type="submit">Send Reply</button>
                    </div>
                </form>
            </div>

            <table>
                <thead>
                    <tr><th>Sender</th><th>Recipient</th><th>Direction</th><th>Date</th><th>Message</th></tr>
                </thead>
                <tbody>
                    @forelse ($messages as $message)
                        <tr>
                            <td>{{ $message->sender_name ?? $message->sender_phone_number }}</td>
                            <td>{{ $message->recipient_phone_number }}</td>
                            <td>
                                @if($message->sender_phone_number === '0000000000')
                                    <span class="status status-in_progress">Admin → User</span>
                                @else
                                    <span class="status status-open">User → Admin</span>
                                @endif
                            </td>
                            <td>{{ $message->created_at->format('M d, Y H:i') }}</td>
                            <td>{{ \Illuminate\Support\Str::limit($message->body, 120) }}</td>
                        </tr>
                    @empty
                        <tr><td colspan="5" class="muted">No support messages yet.</td></tr>
                    @endforelse
                </tbody>
            </table>

            @if ($messages->hasPages())
                <div style="margin-top: 24px; display: flex; justify-content: center; gap: 8px;">
                    @if ($messages->onFirstPage())
                        <span class="btn" style="background: var(--line); color: var(--muted); cursor: not-allowed;">Previous</span>
                    @else
                        <a href="{{ $messages->previousPageUrl() }}" class="btn" style="background: var(--line); color: var(--ink);">Previous</a>
                    @endif

                    <span class="muted" style="display: flex; align-items: center; padding: 0 16px;">
                        Page {{ $messages->currentPage() }} of {{ $messages->lastPage() }}
                    </span>

                    @if ($messages->hasMorePages())
                        <a href="{{ $messages->nextPageUrl() }}" class="btn btn-primary">Next</a>
                    @else
                        <span class="btn" style="background: var(--line); color: var(--muted); cursor: not-allowed;">Next</span>
                    @endif
                </div>
            @endif
        </div>
    </div>
</div>
@endsection
