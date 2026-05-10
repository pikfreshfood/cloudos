@extends('layouts.marketing')

@section('title', 'Cloud OS - Login and Register')
@section('meta_description', 'Login or register for the Cloud OS developer portal and prepare apps for the Cloud OS mobile workspace.')

@section('content')
<section class="page-hero">
    <div class="section-inner">
        <p class="section-kicker">Cloud OS account</p>
        <h1 class="section-heading">Build, publish, and manage apps for Cloud OS.</h1>
        <p class="section-copy">
            Use this page to access the developer portal. Mobile users should create their Cloud OS account inside the Android app,
            where device numbers, contacts, calls, file sharing, and app sharing are connected to the phone workspace.
        </p>
    </div>
</section>

<section>
    <div class="section-inner auth-layout">
        <div>
            <p class="section-kicker">Developer portal</p>
            <h2 class="section-heading">Your Cloud OS app channel starts here.</h2>
            <p class="section-copy">
                Register as a developer to upload Android packages, track review status, and prepare apps for the Cloud OS device menu.
                Existing developers can sign in and continue managing their apps.
            </p>

            <div class="steps">
                <div class="step">
                    <div class="step-number">1</div>
                    <div>
                        <strong>Create your developer profile</strong>
                        <span>Add your name, company, category, and a short summary of what you want to build for Cloud OS.</span>
                    </div>
                </div>
                <div class="step">
                    <div class="step-number">2</div>
                    <div>
                        <strong>Upload your app package</strong>
                        <span>Submit app icons, screenshots, and APK files for review before users install them in Cloud OS.</span>
                    </div>
                </div>
                <div class="step">
                    <div class="step-number">3</div>
                    <div>
                        <strong>Reach Cloud OS devices</strong>
                        <span>Approved apps become part of the connected mobile workspace for sharing, files, and device communication.</span>
                    </div>
                </div>
            </div>
        </div>

        <div class="form-panel card">
            <div class="auth-switch" role="tablist" aria-label="Developer account options">
                <button class="active" type="button" data-auth-tab="login" role="tab" aria-selected="true">Login</button>
                <button type="button" data-auth-tab="register" role="tab" aria-selected="false">Register</button>
            </div>

            @if (session('status'))
                <div class="hidden-message visible">{{ session('status') }}</div>
            @endif

            @if ($errors->any())
                <div class="hidden-message visible" style="color:#842029;background:#f8d7da;border-color:#f5c2c7;">
                    {{ $errors->first() }}
                </div>
            @endif

            <div class="auth-pane active" data-auth-pane="login" role="tabpanel">
                <form method="POST" action="{{ route('developer.login') }}">
                    @csrf
                    <div class="form-grid">
                        <div class="field full">
                            <label for="login-email">Email address</label>
                            <input id="login-email" type="email" name="email" value="{{ old('email') }}" autocomplete="email" required>
                        </div>
                        <div class="field full">
                            <label for="login-password">Password</label>
                            <input id="login-password" type="password" name="password" autocomplete="current-password" required>
                        </div>
                        <div class="field full">
                            <button class="button button-primary" type="submit">Login to dashboard</button>
                        </div>
                    </div>
                </form>
                <p class="form-note">Mobile app accounts are created inside the Cloud OS Android app.</p>
            </div>

            <div class="auth-pane" id="developer-signup" data-auth-pane="register" role="tabpanel">
                <form method="POST" action="{{ route('developer.register') }}">
                    @csrf
                    <div class="form-grid">
                        <div class="field">
                            <label for="developer-name">Developer name</label>
                            <input id="developer-name" type="text" name="developer_name" value="{{ old('developer_name') }}" autocomplete="name" required>
                        </div>
                        <div class="field">
                            <label for="company-name">Company name</label>
                            <input id="company-name" type="text" name="company_name" value="{{ old('company_name') }}" autocomplete="organization">
                        </div>
                        <div class="field full">
                            <label for="register-email">Email address</label>
                            <input id="register-email" type="email" name="email" value="{{ old('email') }}" autocomplete="email" required>
                        </div>
                        <div class="field">
                            <label for="register-password">Password</label>
                            <input id="register-password" type="password" name="password" autocomplete="new-password" required>
                        </div>
                        <div class="field">
                            <label for="password-confirmation">Confirm password</label>
                            <input id="password-confirmation" type="password" name="password_confirmation" autocomplete="new-password" required>
                        </div>
                        <div class="field full">
                            <label for="app-category">App category</label>
                            <input id="app-category" type="text" name="app_category" value="{{ old('app_category') }}" placeholder="Files, messaging, tools, media">
                        </div>
                        <div class="field full">
                            <label for="app-summary">App summary</label>
                            <textarea id="app-summary" name="app_summary" placeholder="Tell us what your app will do in Cloud OS.">{{ old('app_summary') }}</textarea>
                        </div>
                        <div class="field full">
                            <button class="button button-primary" type="submit">Create developer account</button>
                        </div>
                    </div>
                </form>
            </div>
        </div>
    </div>
</section>
@endsection

@push('scripts')
<script>
    document.querySelectorAll('[data-auth-tab]').forEach((tab) => {
        tab.addEventListener('click', () => {
            const target = tab.dataset.authTab;

            document.querySelectorAll('[data-auth-tab]').forEach((button) => {
                const selected = button.dataset.authTab === target;
                button.classList.toggle('active', selected);
                button.setAttribute('aria-selected', selected ? 'true' : 'false');
            });

            document.querySelectorAll('[data-auth-pane]').forEach((pane) => {
                pane.classList.toggle('active', pane.dataset.authPane === target);
            });
        });
    });

    if (window.location.hash === '#developer-signup') {
        document.querySelector('[data-auth-tab="register"]')?.click();
    }
</script>
@endpush
