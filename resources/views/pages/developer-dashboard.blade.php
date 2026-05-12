@extends('layouts.marketing')

@section('title', 'Cloud OS - Developer Dashboard')
@section('meta_description', 'Manage Cloud OS developer apps, API keys, upload status, and store submissions.')

@section('content')
<section class="page-hero">
    <div class="section-inner">
        <p class="section-kicker">Developer dashboard</p>
        <h1 class="section-heading">Welcome back, {{ $developer->developer_name }}.</h1>
        <p class="section-copy">
            Manage your Cloud OS app submissions, track review progress, and keep your developer keys ready for integration.
        </p>
    </div>
</section>

<section>
    <div class="section-inner">
        @if (session('status'))
            <div class="hidden-message visible">{{ session('status') }}</div>
        @endif

        <div class="portal-grid">
            <article class="card portal-stat">
                <span>Total apps</span>
                <strong>{{ $totalApps }}</strong>
            </article>
            <article class="card portal-stat">
                <span>Pending</span>
                <strong>{{ $pendingApps }}</strong>
            </article>
            <article class="card portal-stat">
                <span>Approved</span>
                <strong>{{ $approvedApps }}</strong>
            </article>
            <article class="card portal-stat">
                <span>Rejected</span>
                <strong>{{ $rejectedApps }}</strong>
            </article>
        </div>

        <div class="split-layout portal-panel-row">
            <article class="card legal-panel">
                <p class="section-kicker">Next action</p>
                <h2>Upload or update your Cloud OS app.</h2>
                <p>
                    Submit your APK URL, icon, screenshots, and listing details. Admin approval is required before users can install the app
                    from the Cloud OS mobile workspace.
                </p>
                <div class="portal-actions">
                    <a class="button button-primary" href="{{ route('developer.upload-app') }}">Upload app</a>
                    <a class="button button-light" href="{{ route('developer.app-status') }}">View status</a>
                </div>
            </article>

            <article class="card legal-panel">
                <p class="section-kicker">API keys</p>
                <h2>Developer integration keys</h2>
                <p>Use your test key while building. Keep the live key private and only use it for approved production integrations.</p>
                <div class="key-box">
                    <span>Test key</span>
                    <code>{{ $developer->test_api_key }}</code>
                </div>
                <div class="key-box">
                    <span>Live key</span>
                    <code>{{ $developer->live_api_key }}</code>
                </div>
            </article>
        </div>
    </div>
</section>
@endsection

@push('styles')
<style>
    .portal-grid {
        display: grid;
        grid-template-columns: repeat(4, minmax(0, 1fr));
        gap: 16px;
        margin-bottom: 28px;
    }
    .portal-stat {
        padding: 22px;
    }
    .portal-stat span {
        display: block;
        color: var(--muted);
        font-size: 13px;
        font-weight: 800;
        text-transform: uppercase;
    }
    .portal-stat strong {
        display: block;
        margin-top: 10px;
        color: var(--ink);
        font-size: 42px;
        line-height: 1;
    }
    .portal-panel-row {
        margin-top: 18px;
    }
    .portal-actions {
        display: flex;
        flex-wrap: wrap;
        gap: 12px;
        margin-top: 22px;
    }
    .key-box {
        display: grid;
        gap: 8px;
        margin-top: 14px;
        padding: 14px;
        border: 1px solid var(--line);
        border-radius: 8px;
        background: rgba(2, 7, 19, 0.55);
    }
    .key-box span {
        color: var(--muted);
        font-size: 12px;
        font-weight: 800;
        text-transform: uppercase;
    }
    .key-box code {
        color: var(--cyan);
        overflow-wrap: anywhere;
    }
    @media (max-width: 900px) {
        .portal-grid { grid-template-columns: repeat(2, minmax(0, 1fr)); }
    }
    @media (max-width: 560px) {
        .portal-grid { grid-template-columns: 1fr; }
    }
</style>
@endpush
