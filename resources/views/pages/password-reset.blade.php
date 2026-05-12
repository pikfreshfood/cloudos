@extends('layouts.marketing')

@section('title', 'Cloud OS - Reset Password')
@section('meta_description', 'Reset your Cloud OS account password securely.')

@section('content')
<section class="page-hero">
    <div class="section-inner">
        <p class="section-kicker">Account recovery</p>
        <h1 class="section-heading">Reset your Cloud OS password.</h1>
        <p class="section-copy">Choose a new password for your Cloud OS account. For your protection, reset links expire after 60 minutes.</p>
    </div>
</section>

<section>
    <div class="section-inner">
        <div class="form-panel card" style="max-width:620px;margin:0 auto;">
            @if ($errors->any())
                <div class="hidden-message visible" style="color:#842029;background:#f8d7da;border-color:#f5c2c7;">
                    {{ $errors->first() }}
                </div>
            @endif

            <form method="POST" action="{{ route('password.reset.update') }}">
                @csrf
                <input type="hidden" name="email" value="{{ $email }}">
                <input type="hidden" name="token" value="{{ $token }}">
                <div class="form-grid">
                    <div class="field full">
                        <label>Email address</label>
                        <input type="email" value="{{ $email }}" disabled>
                    </div>
                    <div class="field">
                        <label for="password">New password</label>
                        <input id="password" type="password" name="password" autocomplete="new-password" required minlength="6">
                    </div>
                    <div class="field">
                        <label for="password_confirmation">Confirm password</label>
                        <input id="password_confirmation" type="password" name="password_confirmation" autocomplete="new-password" required minlength="6">
                    </div>
                    <div class="field full">
                        <button class="btn-primary" type="submit">Reset password</button>
                    </div>
                </div>
            </form>
        </div>
    </div>
</section>
@endsection
