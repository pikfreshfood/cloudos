@extends('layouts.admin')

@section('title', 'Cloud OS Admin - Admin Accounts')
@section('header_title', 'Admin Accounts')

@section('content')
<div class="grid">
    <div class="card">
        <h2>Create Admin</h2>
        <form method="POST" action="{{ route('admin.admins.store') }}" class="form-grid" style="margin-top: 18px;">
            @csrf
            <div class="field">
                <label for="name">Name</label>
                <input id="name" name="name" required>
            </div>
            <div class="field">
                <label for="email">Email</label>
                <input id="email" type="email" name="email" required>
            </div>
            <div class="field">
                <label for="password">Password</label>
                <input id="password" type="password" name="password" required>
            </div>
            <div class="field">
                <label for="password_confirmation">Confirm password</label>
                <input id="password_confirmation" type="password" name="password_confirmation" required>
            </div>
            <div class="field">
                <label for="role">Role</label>
                <select id="role" name="role" required>
                    @foreach ($roles as $value => $label)
                        <option value="{{ $value }}">{{ $label }}</option>
                    @endforeach
                </select>
            </div>
            <div class="field" style="align-self:end;">
                <button class="btn btn-primary" type="submit">Create admin</button>
            </div>
        </form>
    </div>

    <div class="card">
        <h2>Existing Admins</h2>
        <table>
            <thead>
                <tr><th>Name</th><th>Email</th><th>Role</th><th>Status</th><th>Action</th></tr>
            </thead>
            <tbody>
                @forelse ($admins as $admin)
                    <tr>
                        <td>{{ $admin->name }}</td>
                        <td>{{ $admin->email }}</td>
                        <td>{{ $roles[$admin->role] ?? $admin->role }}</td>
                        <td><span class="status status-{{ $admin->status }}">{{ ucfirst($admin->status) }}</span></td>
                        <td>
                            <form class="inline-form" method="POST" action="{{ route('admin.admins.update', $admin) }}">
                                @csrf
                                <input name="name" value="{{ $admin->name }}" required>
                                <select name="role" required>
                                    @foreach ($roles as $value => $label)
                                        <option value="{{ $value }}" @selected($admin->role === $value)>{{ $label }}</option>
                                    @endforeach
                                </select>
                                <select name="status" required>
                                    <option value="active" @selected($admin->status === 'active')>Active</option>
                                    <option value="inactive" @selected($admin->status === 'inactive')>Inactive</option>
                                </select>
                                <button class="btn btn-primary" type="submit">Save</button>
                            </form>
                        </td>
                    </tr>
                @empty
                    <tr><td colspan="5" class="muted">No admin accounts yet.</td></tr>
                @endforelse
            </tbody>
        </table>

        @if ($admins->hasPages())
            <div style="margin-top: 24px; display: flex; justify-content: center; gap: 8px;">
                @if ($admins->onFirstPage())
                    <span class="btn" style="background: var(--line); color: var(--muted); cursor: not-allowed;">Previous</span>
                @else
                    <a href="{{ $admins->previousPageUrl() }}" class="btn" style="background: var(--line); color: var(--ink);">Previous</a>
                @endif

                <span class="muted" style="display: flex; align-items: center; padding: 0 16px;">
                    Page {{ $admins->currentPage() }} of {{ $admins->lastPage() }}
                </span>

                @if ($admins->hasMorePages())
                    <a href="{{ $admins->nextPageUrl() }}" class="btn btn-primary">Next</a>
                @else
                    <span class="btn" style="background: var(--line); color: var(--muted); cursor: not-allowed;">Next</span>
                @endif
            </div>
        @endif
    </div>
</div>
@endsection
