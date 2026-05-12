@extends('layouts.admin')

@section('title', 'Cloud OS Admin - Developers')
@section('header_title', 'Developers')

@section('content')
<div class="card">
    <div class="page-actions">
        <h2>Developer Accounts</h2>
        <span class="muted">{{ $developers->count() }} total</span>
    </div>
    <table>
        <thead>
            <tr><th>Name</th><th>Company</th><th>Email</th><th>Apps</th><th>Status</th></tr>
        </thead>
        <tbody>
            @forelse ($developers as $developer)
                <tr>
                    <td>{{ $developer->developer_name }}</td>
                    <td>{{ $developer->company_name ?: 'N/A' }}</td>
                    <td>{{ $developer->email }}</td>
                    <td>{{ $developer->apps_count }}</td>
                    <td><span class="status status-{{ $developer->status ?? 'active' }}">{{ ucfirst($developer->status ?? 'active') }}</span></td>
                </tr>
            @empty
                <tr><td colspan="5" class="muted">No developers yet.</td></tr>
            @endforelse
        </tbody>
    </table>

    @if ($developers->hasPages())
        <div style="margin-top: 24px; display: flex; justify-content: center; gap: 8px;">
            @if ($developers->onFirstPage())
                <span class="btn" style="background: var(--line); color: var(--muted); cursor: not-allowed;">Previous</span>
            @else
                <a href="{{ $developers->previousPageUrl() }}" class="btn" style="background: var(--line); color: var(--ink);">Previous</a>
            @endif

            <span class="muted" style="display: flex; align-items: center; padding: 0 16px;">
                Page {{ $developers->currentPage() }} of {{ $developers->lastPage() }}
            </span>

            @if ($developers->hasMorePages())
                <a href="{{ $developers->nextPageUrl() }}" class="btn btn-primary">Next</a>
            @else
                <span class="btn" style="background: var(--line); color: var(--muted); cursor: not-allowed;">Next</span>
            @endif
        </div>
    @endif
</div>
@endsection
