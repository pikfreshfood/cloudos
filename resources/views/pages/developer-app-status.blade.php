@extends('layouts.marketing')

@section('title', 'Cloud OS - App Status')
@section('meta_description', 'Track Cloud OS developer app submissions and review status.')

@section('content')
<section class="page-hero">
    <div class="section-inner">
        <p class="section-kicker">App status</p>
        <h1 class="section-heading">Track your Cloud OS submissions.</h1>
        <p class="section-copy">Review app approval status, admin notes, and listing details from one place.</p>
    </div>
</section>

<section>
    <div class="section-inner">
        @if (session('status'))
            <div class="hidden-message visible">{{ session('status') }}</div>
        @endif

        <div class="status-list">
            @forelse ($apps as $app)
                <article class="card status-card">
                    <div>
                        <strong>{{ $app->app_name }}</strong>
                        <span>{{ ucfirst($app->environment) }} - {{ $app->created_at?->format('M j, Y') }}</span>
                    </div>
                    <div class="status-actions">
                        <span class="status-badge status-{{ $app->status }}">{{ ucfirst($app->status) }}</span>
                        <a class="button button-light" href="{{ route('developer.apps.edit', $app) }}">Edit</a>
                        <a class="button button-light" href="{{ route('developer.apps.reviews', $app) }}">Reviews</a>
                    </div>
                    @if ($app->admin_note)
                        <p>{{ $app->admin_note }}</p>
                    @endif
                </article>
            @empty
                <article class="card legal-panel">
                    <h2>No apps submitted yet.</h2>
                    <p>Upload your first app to start the Cloud OS review flow.</p>
                    <div class="portal-actions">
                        <a class="button button-primary" href="{{ route('developer.upload-app') }}">Upload app</a>
                    </div>
                </article>
            @endforelse
        </div>

        <div class="pagination-wrap">{{ $apps->links() }}</div>
    </div>
</section>
@endsection

@push('styles')
<style>
    .status-list { display: grid; gap: 14px; }
    .status-card {
        display: grid;
        grid-template-columns: minmax(0, 1fr) auto;
        gap: 18px;
        padding: 22px;
        align-items: center;
    }
    .status-card strong { display: block; color: var(--ink); font-size: 20px; }
    .status-card span, .status-card p { color: var(--muted); }
    .status-card p { grid-column: 1 / -1; line-height: 1.6; }
    .status-actions { display: flex; flex-wrap: wrap; gap: 10px; align-items: center; justify-content: flex-end; }
    .status-badge {
        display: inline-flex;
        min-height: 34px;
        align-items: center;
        border-radius: 8px;
        padding: 0 12px;
        color: #ffffff;
        font-size: 12px;
        font-weight: 900;
        text-transform: uppercase;
        background: rgba(159, 181, 207, 0.28);
    }
    .status-approved { background: #087f5b; }
    .status-pending { background: #0b5ed7; }
    .status-rejected { background: #b02a37; }
    .pagination-wrap { margin-top: 24px; color: var(--muted); }
    @media (max-width: 720px) {
        .status-card { grid-template-columns: 1fr; }
        .status-actions { justify-content: flex-start; }
    }
</style>
@endpush
