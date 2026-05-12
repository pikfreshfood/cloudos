@extends('layouts.admin')

@section('title', 'Cloud OS Admin - Apps')
@section('header_title', 'Apps')

@section('content')
<div class="card">
    <div class="page-actions">
        <h2>App Review Queue</h2>
        <span class="muted">{{ $apps->total() }} apps</span>
    </div>
    <table>
        <thead>
            <tr><th>App</th><th>Media</th><th>Developer</th><th>URL</th><th>Status</th><th>Action</th></tr>
        </thead>
        <tbody>
            @forelse ($apps as $app)
                <tr>
                    <td>
                        <div class="admin-app-title">
                            @if ($app->app_icon_path)
                                <img class="admin-app-icon" src="{{ route('developer-app-media', ['path' => $app->app_icon_path]) }}" alt="{{ $app->app_name }} icon">
                            @endif
                            <div>
                                <strong>{{ $app->app_name }}</strong>
                                @if ($app->app_description)
                                    <span>{{ Str::limit($app->app_description, 80) }}</span>
                                @endif
                            </div>
                        </div>
                    </td>
                    <td>
                        <div class="admin-screenshot-row">
                            @forelse (($app->screenshots ?? []) as $index => $screenshot)
                                @php $path = is_array($screenshot) ? ($screenshot['path'] ?? null) : $screenshot; @endphp
                                @if ($path)
                                    <a href="{{ route('developer-app-media', ['path' => $path]) }}" target="_blank" rel="noopener">
                                        <img src="{{ route('developer-app-media', ['path' => $path]) }}" alt="Screenshot {{ $index + 1 }}">
                                    </a>
                                @endif
                            @empty
                                <span class="muted">No screenshots</span>
                            @endforelse
                        </div>
                    </td>
                    <td>{{ $app->developer?->developer_name ?? 'Unknown' }}</td>
                    <td><a href="{{ $app->app_url }}" target="_blank" rel="noopener">Open APK</a></td>
                    <td><span class="status status-{{ $app->status }}">{{ ucfirst($app->status) }}</span></td>
                    <td>
                        <form class="inline-form" method="POST" action="{{ route('admin.apps.status', $app) }}">
                            @csrf
                            <select name="status" required>
                                <option value="pending" @selected($app->status === 'pending')>Pending</option>
                                <option value="approved" @selected($app->status === 'approved')>Approved</option>
                                <option value="rejected" @selected($app->status === 'rejected')>Rejected</option>
                            </select>
                            <input name="admin_note" value="{{ $app->admin_note }}" placeholder="Admin note">
                            <button class="btn btn-primary" type="submit">Save</button>
                        </form>
                    </td>
                </tr>
            @empty
                <tr><td colspan="6" class="muted">No app submissions yet.</td></tr>
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
        gap: 12px;
        min-width: 220px;
    }
    .admin-app-title strong,
    .admin-app-title span {
        display: block;
    }
    .admin-app-title span {
        max-width: 260px;
        margin-top: 4px;
        color: var(--muted);
        font-size: 12px;
        line-height: 1.4;
    }
    .admin-app-icon {
        width: 54px;
        height: 54px;
        border: 1px solid var(--line);
        border-radius: 8px;
        object-fit: cover;
        background: #071426;
    }
    .admin-screenshot-row {
        display: flex;
        flex-wrap: wrap;
        gap: 8px;
        max-width: 300px;
    }
    .admin-screenshot-row img {
        width: 74px;
        height: 48px;
        border: 1px solid var(--line);
        border-radius: 8px;
        object-fit: cover;
        background: #071426;
    }
</style>
@endpush
