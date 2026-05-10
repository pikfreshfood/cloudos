@extends('layouts.admin')

@section('title', 'Cloud OS Admin - Payments')
@section('header_title', 'Payments')

@section('content')
<div class="card">
    <div class="page-actions">
        <h2>Payment Transactions</h2>
        <span class="muted">{{ $transactions->total() }} transactions</span>
    </div>
    
    <form method="GET" action="{{ route('admin.payments') }}" class="card" style="margin-bottom: 24px; padding: 20px;">
        <div class="form-grid">
            <div class="field">
                <label>Search</label>
                <input type="text" name="search" placeholder="Search by reference, email, device, or user" value="{{ $filters['search'] ?? '' }}">
            </div>
            <div class="field">
                <label>Status</label>
                <select name="status">
                    <option value="">All Statuses</option>
                    <option value="success" {{ ($filters['status'] ?? '') === 'success' ? 'selected' : '' }}>Success</option>
                    <option value="pending" {{ ($filters['status'] ?? '') === 'pending' ? 'selected' : '' }}>Pending</option>
                    <option value="failed" {{ ($filters['status'] ?? '') === 'failed' ? 'selected' : '' }}>Failed</option>
                    <option value="initialized" {{ ($filters['status'] ?? '') === 'initialized' ? 'selected' : '' }}>Initialized</option>
                </select>
            </div>
            <div class="field">
                <label>Date From</label>
                <input type="date" name="date_from" value="{{ $filters['date_from'] ?? '' }}">
            </div>
            <div class="field">
                <label>Date To</label>
                <input type="date" name="date_to" value="{{ $filters['date_to'] ?? '' }}">
            </div>
        </div>
        <div style="margin-top: 16px; display: flex; gap: 12px;">
            <button type="submit" class="btn btn-primary">Filter</button>
            <a href="{{ route('admin.payments') }}" class="btn" style="background: var(--line); color: var(--ink);">Reset</a>
        </div>
    </form>

    <table>
        <thead>
            <tr><th>Reference</th><th>User</th><th>Email</th><th>Device</th><th>Storage</th><th>Amount</th><th>Status</th><th>Date</th></tr>
        </thead>
        <tbody>
            @forelse ($transactions as $transaction)
                <tr>
                    <td><code>{{ $transaction->reference }}</code></td>
                    <td>{{ $transaction->user?->name ?? 'N/A' }}</td>
                    <td>{{ $transaction->email }}</td>
                    <td>{{ $transaction->device_name }}</td>
                    <td>{{ $transaction->storage_mb >= 1024 ? ($transaction->storage_mb / 1024) . ' GB' : $transaction->storage_mb . ' MB' }}</td>
                    <td>₦{{ number_format((int) ($transaction->amount_kobo / 100)) }}</td>
                    <td><span class="status status-{{ $transaction->status }}">{{ ucfirst($transaction->status) }}</span></td>
                    <td>{{ $transaction->paid_at?->format('M j, Y g:i A') ?? $transaction->created_at->format('M j, Y g:i A') }}</td>
                </tr>
            @empty
                <tr><td colspan="8" class="muted">No payment transactions found.</td></tr>
            @endforelse
        </tbody>
    </table>

    @if ($transactions->hasPages())
        <div style="margin-top: 24px; display: flex; justify-content: center; gap: 8px;">
            @if ($transactions->onFirstPage())
                <span class="btn" style="background: var(--line); color: var(--muted); cursor: not-allowed;">Previous</span>
            @else
                <a href="{{ $transactions->previousPageUrl() }}" class="btn" style="background: var(--line); color: var(--ink);">Previous</a>
            @endif

            <span class="muted" style="display: flex; align-items: center; padding: 0 16px;">
                Page {{ $transactions->currentPage() }} of {{ $transactions->lastPage() }}
            </span>

            @if ($transactions->hasMorePages())
                <a href="{{ $transactions->nextPageUrl() }}" class="btn btn-primary">Next</a>
            @else
                <span class="btn" style="background: var(--line); color: var(--muted); cursor: not-allowed;">Next</span>
            @endif
        </div>
    @endif
</div>
@endsection
