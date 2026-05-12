@extends('layouts.admin')

@section('title', 'Cloud OS Admin - Users')
@section('header_title', 'Users')

@push('styles')
<style>
    .btn-danger { background: var(--danger); color: #fff; }
    .btn-danger:hover { background: #9f302c; }
</style>
@endpush

@section('content')
<div class="card">
    <div class="page-actions">
        <h2>Registered Users</h2>
        <span class="muted">{{ $users->total() }} total</span>
    </div>
    <table class="users-table">
        <thead>
            <tr><th>Name</th><th>Email</th><th>Phone</th><th>Joined</th><th>Action</th></tr>
        </thead>
        <tbody>
            @forelse ($users as $user)
                <tr>
                    <td>{{ $user->name }}</td>
                    <td>{{ $user->email }}</td>
                    <td>{{ $user->phone_number ?? 'N/A' }}</td>
                    <td>{{ $user->created_at?->format('M j, Y') }}</td>
                    <td>
                        <div class="inline-form">
                            <a class="btn btn-primary" href="{{ route('admin.users.edit', $user) }}">Edit / Update</a>
                            <form method="POST" action="{{ route('admin.users.delete', $user) }}" onsubmit="return confirm('Delete this user account permanently?');">
                                @csrf
                                @method('DELETE')
                                <button class="btn btn-danger" type="submit">Delete</button>
                            </form>
                        </div>
                    </td>
                </tr>
            @empty
                <tr><td colspan="5" class="muted">No users yet.</td></tr>
            @endforelse
        </tbody>
    </table>

    @if ($users->hasPages())
        <div style="margin-top: 24px; display: flex; justify-content: center; gap: 8px;">
            @if ($users->onFirstPage())
                <span class="btn" style="background: var(--line); color: var(--muted); cursor: not-allowed;">Previous</span>
            @else
                <a href="{{ $users->previousPageUrl() }}" class="btn" style="background: var(--line); color: var(--ink);">Previous</a>
            @endif

            <span class="muted" style="display: flex; align-items: center; padding: 0 16px;">
                Page {{ $users->currentPage() }} of {{ $users->lastPage() }}
            </span>

            @if ($users->hasMorePages())
                <a href="{{ $users->nextPageUrl() }}" class="btn btn-primary">Next</a>
            @else
                <span class="btn" style="background: var(--line); color: var(--muted); cursor: not-allowed;">Next</span>
            @endif
        </div>
    @endif
</div>
@endsection
