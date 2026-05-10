@extends('layouts.admin')

@section('title', 'Cloud OS Admin - Change Password')
@section('header_title', 'Change Password')

@section('content')
<div class="card" style="max-width: 620px;">
    <h2>Change Admin Password</h2>
    <form method="POST" action="{{ route('admin.change-password.update') }}" class="form-grid" style="margin-top: 18px;">
        @csrf
        <div class="field full">
            <label for="current_password">Current password</label>
            <input id="current_password" type="password" name="current_password" required>
        </div>
        <div class="field">
            <label for="password">New password</label>
            <input id="password" type="password" name="password" required>
        </div>
        <div class="field">
            <label for="password_confirmation">Confirm new password</label>
            <input id="password_confirmation" type="password" name="password_confirmation" required>
        </div>
        <div class="field full">
            <button class="btn btn-primary" type="submit">Update password</button>
        </div>
    </form>
</div>
@endsection
