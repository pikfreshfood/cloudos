@extends('layouts.admin')

@section('title', 'Cloud OS Admin - Support')
@section('header_title', 'Support')

@push('styles')
<style>
    .support-shell {
        display: grid;
        grid-template-columns: 320px minmax(0, 1fr);
        gap: 16px;
        min-height: calc(100vh - 128px);
    }
    .thread-panel,
    .chat-panel {
        background: #ffffff;
        border: 1px solid #cbd8f6;
        border-radius: 12px;
    }
    .thread-panel {
        padding: 16px 14px;
        overflow: hidden;
    }
    .thread-title {
        font-size: 18px;
        font-weight: 900;
        color: #071426;
        margin-bottom: 12px;
    }
    .thread-list {
        display: grid;
        gap: 10px;
        max-height: calc(100vh - 190px);
        overflow-y: auto;
    }
    .thread-item {
        display: block;
        padding: 14px 12px;
        border-radius: 10px;
        text-decoration: none;
        color: #0a1744;
        border: 1px solid transparent;
        background: #f7f9ff;
    }
    .thread-item.active {
        background: #eaf1ff;
        border-color: #a9c1ff;
    }
    .thread-top {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 10px;
        margin-bottom: 6px;
    }
    .thread-name {
        font-size: 16px;
        font-weight: 900;
        color: #071426;
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
    }
    .thread-time {
        color: #4056a6;
        font-size: 12px;
        white-space: nowrap;
    }
    .thread-email,
    .thread-preview {
        color: #4056a6;
        font-size: 13px;
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
    }
    .thread-preview {
        margin-top: 8px;
    }
    .chat-panel {
        padding: 18px 16px 16px;
        display: flex;
        flex-direction: column;
        min-width: 0;
    }
    .chat-head {
        border-bottom: 1px solid #cbd8f6;
        padding-bottom: 14px;
        margin-bottom: 14px;
    }
    .chat-name {
        color: #071426;
        font-size: 20px;
        font-weight: 900;
        margin-bottom: 4px;
    }
    .chat-email {
        color: #4056a6;
        font-size: 15px;
    }
    .chat-messages {
        flex: 1;
        min-height: 300px;
        overflow-y: auto;
        padding-right: 4px;
    }
    .bubble-row {
        display: flex;
        margin-bottom: 12px;
    }
    .bubble-row.admin {
        justify-content: flex-end;
    }
    .bubble {
        min-width: 130px;
        max-width: 64%;
        border: 1px solid #cbd8f6;
        border-radius: 14px;
        padding: 13px 14px;
        background: #f7f9ff;
        color: #071426;
    }
    .bubble.admin {
        background: #10245d;
        color: #ffffff;
        border-color: #10245d;
    }
    .bubble-author {
        display: block;
        font-size: 12px;
        font-weight: 900;
        color: #495875;
        margin-bottom: 7px;
    }
    .bubble.admin .bubble-author,
    .bubble.admin .bubble-time {
        color: #c7d2fe;
    }
    .bubble-body {
        white-space: pre-wrap;
        word-break: break-word;
    }
    .bubble-time {
        display: block;
        color: #495875;
        font-size: 12px;
        margin-top: 8px;
    }
    .reply-form {
        border-top: 1px solid #cbd8f6;
        padding-top: 14px;
        margin-top: 14px;
    }
    .reply-form textarea {
        min-height: 110px;
        border: 1px solid #cbd8f6;
        border-radius: 12px;
        font-size: 15px;
        padding: 14px;
    }
    .reply-form .btn {
        margin-top: 10px;
        background: #10245d;
        border-radius: 10px;
    }
    @media (max-width: 900px) {
        .support-shell {
            grid-template-columns: 1fr;
        }
        .thread-list {
            max-height: 260px;
        }
    }
</style>
@endpush

@section('content')
<span style="position:absolute;left:-9999px;">Support Messages</span>
<div class="support-shell">
    <aside class="thread-panel">
        <h2 class="thread-title">Live Chat Threads</h2>
        <div class="thread-list">
            @forelse ($conversations as $conv)
                @php
                    $user = $conv['user'];
                    $phoneNumber = $conv['phone_number'];
                    $active = $selectedUser && $user && $selectedUser->id === $user->id && $selectedPhoneNumber === $phoneNumber;
                    $deviceLabel = $conv['device']->name ?? null;
                @endphp
                <a class="thread-item {{ $active ? 'active' : '' }}"
                   href="{{ route('admin.support', ['user_id' => $user?->id, 'phone_number' => $phoneNumber]) }}">
                    <div class="thread-top">
                        <span class="thread-name">{{ $user?->name ?? $phoneNumber }}</span>
                        @if($conv['last_message_time'])
                            <span class="thread-time">{{ $conv['last_message_time']->diffForHumans() }}</span>
                        @endif
                    </div>
                    <div class="thread-email">{{ $user?->email ?? ($deviceLabel ?: $phoneNumber) }}</div>
                    @if($conv['last_message'])
                        <div class="thread-preview">{{ \Illuminate\Support\Str::limit($conv['last_message']->body, 70) }}</div>
                    @endif
                </a>
            @empty
                <p class="muted" style="padding: 24px 8px;">No live chat threads yet.</p>
            @endforelse
        </div>
    </aside>

    <section class="chat-panel">
        @if($selectedUser && $selectedPhoneNumber)
            <div class="chat-head">
                <div class="chat-name">{{ $selectedUser->name }}</div>
                <div class="chat-email">{{ $selectedUser->email }}</div>
            </div>

            <div class="chat-messages">
                @php($chatMessages = $messages instanceof \Illuminate\Pagination\AbstractPaginator ? $messages->getCollection()->reverse() : $messages->reverse())
                @forelse ($chatMessages as $message)
                    @php($isAdmin = $message->sender_phone_number === '0000000000')
                    <div class="bubble-row {{ $isAdmin ? 'admin' : '' }}">
                        <div class="bubble {{ $isAdmin ? 'admin' : '' }}">
                            <span class="bubble-author">{{ $isAdmin ? 'Support' : $selectedUser->name }}</span>
                            <div class="bubble-body">{{ $message->body }}</div>
                            <span class="bubble-time">{{ $message->created_at?->format('d M Y, H:i') }}</span>
                        </div>
                    </div>
                @empty
                    <p class="muted" style="padding: 40px 0;">No messages yet.</p>
                @endforelse
            </div>

            <form class="reply-form" method="POST" action="{{ route('admin.support.reply') }}">
                @csrf
                <input type="hidden" name="recipient_phone_number" value="{{ $selectedPhoneNumber }}">
                <textarea name="body" required placeholder="Type your reply..."></textarea>
                <button class="btn btn-primary" type="submit">Send Reply</button>
            </form>
        @else
            <div style="height: 100%; display: grid; place-items: center; color: #4056a6;">
                Select a live chat thread to reply.
            </div>
        @endif
    </section>
</div>
@endsection
