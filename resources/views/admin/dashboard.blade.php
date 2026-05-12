@extends('layouts.admin')

@section('title', 'Cloud OS Admin - Dashboard')
@section('header_title', 'Dashboard')

@section('content')
<div class="stats-grid">
    <div class="card stat-card"><span>Users</span><strong>{{ $stats['registered_users'] }}</strong></div>
    <div class="card stat-card"><span>Developers</span><strong>{{ $stats['registered_developers'] }}</strong></div>
    <div class="card stat-card"><span>App downloads</span><strong>{{ $stats['app_downloads'] }}</strong></div>
    <div class="card stat-card"><span>Total paid</span><strong>₦{{ number_format($stats['total_paid_ngn']) }}</strong></div>
    <div class="card stat-card"><span>Total apps</span><strong>{{ $stats['total_apps'] }}</strong></div>
    <div class="card stat-card"><span>Open support</span><strong>{{ $stats['support_open'] }}</strong></div>
</div>

<div class="card">
    <div class="page-actions">
        <h2>Recent App Submissions</h2>
        <a class="btn btn-primary" href="{{ route('admin.apps') }}">Review apps</a>
    </div>
    <table>
        <thead>
            <tr><th>App</th><th>Developer</th><th>Status</th><th>Submitted</th></tr>
        </thead>
        <tbody>
            @forelse ($recentApps as $app)
                <tr>
                    <td>
                        <div class="admin-app-title">
                            @if ($app->app_icon_path)
                                <img class="admin-app-icon" src="{{ route('developer-app-media', ['path' => $app->app_icon_path]) }}" alt="{{ $app->app_name }} icon">
                            @endif
                            <strong>{{ $app->app_name }}</strong>
                        </div>
                    </td>
                    <td>{{ $app->developer?->developer_name ?? 'Unknown' }}</td>
                    <td><span class="status status-{{ $app->status }}">{{ ucfirst($app->status) }}</span></td>
                    <td>{{ $app->created_at?->format('M j, Y') }}</td>
                </tr>
            @empty
                <tr><td colspan="4" class="muted">No app submissions yet.</td></tr>
            @endforelse
        </tbody>
    </table>
</div>
@endsection

@push('styles')
<style>
    .admin-app-title {
        display: flex;
        align-items: center;
        gap: 10px;
    }
    .admin-app-icon {
        width: 42px;
        height: 42px;
        border: 1px solid var(--line);
        border-radius: 8px;
        object-fit: cover;
        background: #071426;
    }
</style>
@endpush
