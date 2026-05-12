@extends('layouts.admin')

@section('title', 'Cloud OS Admin - Update User')
@section('header_title', 'Update User')

@section('content')
<div class="grid">
    <div class="card">
        <div class="page-actions">
            <div>
                <h2>Edit / Update User</h2>
                <p class="muted">{{ $user->email }}</p>
            </div>
            <a class="btn" href="{{ route('admin.users') }}">Back to users</a>
        </div>

        <form method="POST" action="{{ route('admin.users.update', $user) }}" class="form-grid">
            @csrf
            <div class="field">
                <label for="name">Name</label>
                <input id="name" name="name" value="{{ old('name', $user->name) }}" required>
            </div>
            <div class="field">
                <label for="email">Email</label>
                <input id="email" type="email" name="email" value="{{ old('email', $user->email) }}" required>
            </div>
            <div class="field">
                <label for="phone_number">Phone number</label>
                <input id="phone_number" name="phone_number" value="{{ old('phone_number', $user->phone_number) }}" inputmode="numeric" placeholder="Optional">
            </div>
            <div class="field">
                <label for="password">New password</label>
                <input id="password" type="password" name="password" placeholder="Leave blank to keep current password">
            </div>
            <div class="field">
                <label for="password_confirmation">Confirm new password</label>
                <input id="password_confirmation" type="password" name="password_confirmation" placeholder="Confirm new password">
            </div>
            <div class="field" style="align-self:end;">
                <button class="btn btn-primary" type="submit">Update account</button>
            </div>
        </form>
    </div>
</div>
@endsection
