@extends('layouts.admin')

@section('title', 'Cloud OS Admin - Support')
@section('header_title', 'Support')

@section('content')
<div class="card">
    <div class="page-actions">
        <h2>Support Messages</h2>
        <span class="muted">{{ $messages->count() }} messages</span>
    </div>
    <table>
        <thead>
            <tr><th>Name</th><th>Email</th><th>Topic</th><th>Status</th><th>Message</th><th>Action</th></tr>
        </thead>
        <tbody>
            @forelse ($messages as $message)
                <tr>
                    <td>{{ $message->name }}</td>
                    <td>{{ $message->email }}</td>
                    <td>{{ $message->topic }}</td>
                    <td><span class="status status-{{ $message->status }}">{{ str_replace('_', ' ', ucfirst($message->status)) }}</span></td>
                    <td>{{ \Illuminate\Support\Str::limit($message->message, 90) }}</td>
                    <td>
                        <form class="inline-form" method="POST" action="{{ route('admin.support.status', $message) }}">
                            @csrf
                            <select name="status" required>
                                <option value="open" @selected($message->status === 'open')>Open</option>
                                <option value="in_progress" @selected($message->status === 'in_progress')>In progress</option>
                                <option value="closed" @selected($message->status === 'closed')>Closed</option>
                            </select>
                            <button class="btn btn-primary" type="submit">Save</button>
                        </form>
                    </td>
                </tr>
            @empty
                <tr><td colspan="6" class="muted">No support messages yet.</td></tr>
            @endforelse
        </tbody>
    </table>
</div>
@endsection
