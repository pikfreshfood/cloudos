@extends('layouts.admin')

@section('title', 'Cloud OS Admin - Users')
@section('header_title', 'Users')

@section('content')
<div class="card">
    <div class="page-actions">
        <h2>Registered Users</h2>
        <span class="muted">{{ $users->count() }} total</span>
    </div>
    <table>
        <thead>
            <tr><th>Name</th><th>Email</th><th>Phone</th><th>Joined</th></tr>
        </thead>
        <tbody>
            @forelse ($users as $user)
                <tr>
                    <td>{{ $user->name }}</td>
                    <td>{{ $user->email }}</td>
                    <td>{{ $user->phone_number ?? 'N/A' }}</td>
                    <td>{{ $user->created_at?->format('M j, Y') }}</td>
                </tr>
            @empty
                <tr><td colspan="4" class="muted">No users yet.</td></tr>
            @endforelse
        </tbody>
    </table>
</div>
@endsection
