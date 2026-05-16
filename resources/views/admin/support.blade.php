@extends('layouts.admin')

@section('title', 'Cloud OS Admin - Support')
@section('header_title', 'Support')

@section('content')
<div style="display: flex; gap: 24px; min-height: 600px; width: 100%;">
    <div style="width: 350px; flex-shrink: 0;">
        <div class="card" style="height: 100%;">
            <h2 style="margin-top: 0; margin-bottom: 16px; font-size: 20px; font-weight: 600;">Live Chat Threads</h2>
            <div style="display: flex; flex-direction: column; gap: 12px; max-height: 550px; overflow-y: auto;">
                @forelse ($conversations as $conv)
                    <a href="{{ route('admin.support', ['user_id' => $conv['user']->id]) }}" 
                       style="padding: 16px; border-radius: 12px; text-decoration: none; {{ ($selectedUser && $selectedUser->id === $conv['user']->id) ? 'background: #e8f0fe; border: 1px solid #c7d2fe;' : 'background: #f8fafc; border: 1px solid transparent;' }}"
                    >
                        <div style="display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 8px;">
                            <div style="font-weight: 600; color: #1e293b; font-size: 16px;">
                                {{ $conv['user']->name }}
                            </div>
                            @if($conv['last_message_time'])
                                <span style="font-size: 12px; color: #64748b;">
                                    {{ $conv['last_message_time']->diffForHumans() }}
                                </span>
                            @endif
                        </div>
                        <div style="font-size: 14px; color: #475569; margin-bottom: 4px;">
                            {{ $conv['user']->email }}
                        </div>
                        @if($conv['last_message'])
                            <div style="font-size: 13px; color: #64748b; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;">
                                {{ \Illuminate\Support\Str::limit($conv['last_message']->body, 60) }}
                            </div>
                        @endif
                    </a>
                @empty
                    <div style="padding: 48px; text-align: center; color: #64748b;">
                        No conversations yet.
                    </div>
                @endforelse
            </div>
        </div>
    </div>

    <div style="flex: 1;">
        <div class="card" style="height: 100%; display: flex; flex-direction: column;">
            @if($selectedUser)
                <div style="border-bottom: 1px solid #e2e8f0; padding-bottom: 16px; margin-bottom: 16px;">
                    <h2 style="margin: 0; font-size: 20px; font-weight: 600;">{{ $selectedUser->name }}</h2>
                    <p style="margin: 4px 0 0 0; color: #475569; font-size: 14px;">{{ $selectedUser->email }}</p>
                </div>

                <div style="flex: 1; display: flex; flex-direction: column; gap: 12px; overflow-y: auto; padding-right: 8px;">
                    @forelse ($messages as $message)
                        <div style="display: flex; flex-direction: column; gap: 4px;">
                            <div style="padding: 12px 16px; border-radius: 16px; max-width: 70%; {{ $message->sender_phone_number === '0000000000' ? 'background: #1e293b; color: white; align-self: flex-end; border-bottom-right-radius: 4px;' : 'background: #f1f5f9; color: #1e293b; align-self: flex-start; border-bottom-left-radius: 4px;' }}">
                                <div style="white-space: pre-wrap; word-wrap: break-word;">{{ $message->body }}</div>
                            </div>
                            <div style="font-size: 11px; color: #94a3b8; padding: 0 8px;">
                                {{ $message->created_at->format('j M Y, H:i') }}
                            </div>
                        </div>
                    @empty
                        <div style="padding: 48px; text-align: center; color: #64748b;">
                            No messages yet.
                        </div>
                    @endforelse
                </div>

                <div style="border-top: 1px solid #e2e8f0; padding-top: 16px; margin-top: 16px;">
                    <form class="inline-form" method="POST" action="{{ route('admin.support.reply') }}">
                        @csrf
                        <input type="hidden" name="recipient_phone_number" value="{{ $selectedUser->phone_number }}">
                        <div style="margin-bottom: 12px;">
                            <textarea name="body" required style="width: 100%; padding: 16px; border: 1px solid #cbd5e1; border-radius: 12px; min-height: 100px; font-size: 14px; resize: vertical;" placeholder="Type your reply..."></textarea>
                        </div>
                        <div style="display: flex; justify-content: flex-end;">
                            <button class="btn btn-primary" type="submit" style="background: #1e293b; border-radius: 12px; padding: 10px 24px; font-weight: 600;">Send Reply</button>
                        </div>
                    </form>
                </div>
            @else
                <div style="flex: 1; display: flex; align-items: center; justify-content: center;">
                    <div style="text-align: center; color: #64748b;">
                        <h3 style="font-size: 18px; font-weight: 600; margin-bottom: 8px;">Select a Conversation</h3>
                        <p style="font-size: 14px;">Choose a chat thread from the left sidebar to view and reply to messages.</p>
                    </div>
                </div>
            @endif
        </div>
    </div>
</div>
@endsection
