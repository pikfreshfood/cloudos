@extends('layouts.admin')

@section('title', 'Cloud OS Admin - Users')
@section('header_title', 'Users')

@push('styles')
<style>
    .users-table th:last-child,
    .users-table td:last-child { width: 52%; }
    .users-table td { vertical-align: top; }
    .user-edit-form {
        display: grid;
        grid-template-columns: repeat(2, minmax(160px, 1fr));
        gap: 10px;
        min-width: 420px;
    }
    .user-edit-form .form-actions {
        grid-column: 1 / -1;
        display: flex;
        gap: 10px;
        align-items: center;
        flex-wrap: wrap;
    }
    .btn-danger { background: var(--danger); color: #fff; }
    .btn-danger:hover { background: #9f302c; }
    @media (max-width: 1100px) {
        .users-table { min-width: 980px; }
        .card { overflow-x: auto; }
    }
</style>
@endpush

@section('content')
<div class="card">
    <div class="page-actions">
        <h2>Registered Users</h2>
        <span class="muted">{{ $users->count() }} total</span>
    </div>
    <table class="users-table">
        <thead>
            <tr><th>Name</th><th>Email</th><th>Phone</th><th>Joined</th><th>Manage Account</th></tr>
        </thead>
        <tbody>
            @forelse ($users as $user)
                <tr>
                    <td>{{ $user->name }}</td>
                    <td>{{ $user->email }}</td>
                    <td>{{ $user->phone_number ?? 'N/A' }}</td>
                    <td>{{ $user->created_at?->format('M j, Y') }}</td>
                    <td>
                        <form class="user-edit-form" method="POST" action="{{ route('admin.users.update', $user) }}">
                            @csrf
                            <div class="field">
                                <label for="user-{{ $user->id }}-name">Name</label>
                                <input id="user-{{ $user->id }}-name" name="name" value="{{ old('name', $user->name) }}" required>
                            </div>
                            <div class="field">
                                <label for="user-{{ $user->id }}-email">Email</label>
                                <input id="user-{{ $user->id }}-email" type="email" name="email" value="{{ old('email', $user->email) }}" required>
                            </div>
                            <div class="field">
                                <label for="user-{{ $user->id }}-phone">Phone number</label>
                                <input id="user-{{ $user->id }}-phone" name="phone_number" value="{{ old('phone_number', $user->phone_number) }}" inputmode="numeric" placeholder="Optional">
                            </div>
                            <div class="field">
                                <label for="user-{{ $user->id }}-password">New password</label>
                                <input id="user-{{ $user->id }}-password" type="password" name="password" placeholder="Leave blank to keep">
                            </div>
                            <div class="field">
                                <label for="user-{{ $user->id }}-password-confirmation">Confirm password</label>
                                <input id="user-{{ $user->id }}-password-confirmation" type="password" name="password_confirmation" placeholder="Confirm new password">
                            </div>
                            <div class="form-actions">
                                <button class="btn btn-primary" type="submit">Save changes</button>
                            </div>
                        </form>
                        <form method="POST" action="{{ route('admin.users.delete', $user) }}" style="margin-top: 10px;" onsubmit="return confirm('Delete this user account permanently?');">
                            @csrf
                            @method('DELETE')
                            <button class="btn btn-danger" type="submit">Delete user</button>
                        </form>
                    </td>
                </tr>
            @empty
                <tr><td colspan="5" class="muted">No users yet.</td></tr>
            @endforelse
        </tbody>
    </table>
</div>
@endsection
