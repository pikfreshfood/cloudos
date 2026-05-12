@extends('layouts.admin')

@section('title', 'Cloud OS Admin - Push Updates')
@section('header_title', 'Push Updates')

@section('content')
<div class="grid">
    <div class="card">
        <h2>Push New Update</h2>
        @if (session('error'))
            <div style="padding: 16px; background: #fee2e2; color: #991b1b; border-radius: 8px; margin-bottom: 18px;">
                {{ session('error') }}
            </div>
        @endif
        <form method="POST" action="{{ route('admin.updates.store') }}" class="form-grid" style="margin-top: 18px;">
            @csrf
            <div class="field full">
                <label for="title">Update Title</label>
                <input id="title" name="title" required placeholder="e.g., New Feature Update">
            </div>
            <div class="field full">
                <label for="message">Update Message</label>
                <textarea id="message" name="message" required placeholder="Describe what's new in this update..." rows="5"></textarea>
            </div>
            <div class="field full">
                <label for="link">Link (Optional)</label>
                <input id="link" name="link" type="url" placeholder="e.g., https://cloudos.ng/download">
            </div>
            <div class="field" style="align-self:end;">
                <button class="btn btn-primary" type="submit">Push Update</button>
            </div>
        </form>
    </div>

    <div class="card">
        <h2>Update History</h2>
        <table>
            <thead>
                <tr><th>Title</th><th>Message</th><th>Link</th><th>Status</th><th>Seen By</th><th>Date</th><th>Actions</th></tr>
            </thead>
            <tbody>
                @forelse ($updates as $update)
                    <tr>
                        <td>{{ $update->title }}</td>
                        <td style="max-width: 250px;">
                            <span class="muted">{{ Str::limit($update->message, 80) }}</span>
                        </td>
                        <td style="max-width: 200px;">
                            @if ($update->link)
                                <a href="{{ $update->link }}" target="_blank" class="muted" style="font-size: 12px; word-break: break-all;">{{ Str::limit($update->link, 30) }}</a>
                            @else
                                <span class="muted" style="font-size: 12px;">—</span>
                            @endif
                        </td>
                        <td><span class="status status-{{ $update->status }}">{{ ucfirst($update->status) }}</span></td>
                        <td>{{ $update->seen_by_users_count }} users</td>
                        <td>{{ $update->created_at->format('M j, Y g:i A') }}</td>
                        <td>
                            <div class="inline-form">
                                @if ($update->status !== 'deleted')
                                    <form method="POST" action="{{ route('admin.updates.status', $update) }}">
                                        @csrf
                                        <select name="status" onchange="this.form.submit()">
                                            <option value="active" {{ $update->status === 'active' ? 'selected' : '' }}>Active</option>
                                            <option value="paused" {{ $update->status === 'paused' ? 'selected' : '' }}>Paused</option>
                                        </select>
                                    </form>
                                    <form method="POST" action="{{ route('admin.updates.delete', $update) }}" onsubmit="return confirm('Are you sure you want to delete this update?');">
                                        @csrf
                                        @method('DELETE')
                                        <button type="submit" class="btn" style="background: #fee2e2; color: #991b1b;">Delete</button>
                                    </form>
                                @endif
                            </div>
                        </td>
                    </tr>
                @empty
                    <tr>
                        <td colspan="7">
                            <div style="text-align: center; padding: 40px;">
                                <p class="muted" style="margin-bottom: 8px;">No updates pushed yet.</p>
                                <p style="font-size: 13px; color: #94a3b8;">If you just installed this update, run: <code style="background: #f1f5f9; padding: 2px 6px; border-radius: 4px;">php artisan migrate</code></p>
                            </div>
                        </td>
                    </tr>
                @endforelse
            </tbody>
        </table>

        @if (is_object($updates) && method_exists($updates, 'hasPages') && $updates->hasPages())
            <div style="margin-top: 24px; display: flex; justify-content: center; gap: 8px;">
                @if ($updates->onFirstPage())
                    <span class="btn" style="background: var(--line); color: var(--muted); cursor: not-allowed;">Previous</span>
                @else
                    <a href="{{ $updates->previousPageUrl() }}" class="btn" style="background: var(--line); color: var(--ink);">Previous</a>
                @endif

                <span class="muted" style="display: flex; align-items: center; padding: 0 16px;">
                    Page {{ $updates->currentPage() }} of {{ $updates->lastPage() }}
                </span>

                @if ($updates->hasMorePages())
                    <a href="{{ $updates->nextPageUrl() }}" class="btn btn-primary">Next</a>
                @else
                    <span class="btn" style="background: var(--line); color: var(--muted); cursor: not-allowed;">Next</span>
                @endif
            </div>
        @endif
    </div>
</div>
@endsection
