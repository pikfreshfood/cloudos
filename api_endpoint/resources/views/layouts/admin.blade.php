<!DOCTYPE html>
<html lang="{{ str_replace('_', '-', app()->getLocale()) }}">
<head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <title>@yield('title', 'Cloud OS Admin')</title>
    <style>
        :root {
            --bg: #f4f7fb;
            --panel: #ffffff;
            --ink: #0f1f33;
            --muted: #68778c;
            --line: #dce5ef;
            --brand: #155eef;
            --brand-dark: #0b2f7d;
            --success: #178c5f;
            --warning: #b7791f;
            --danger: #c2413b;
            --sidebar: #071426;
        }
        * { margin: 0; padding: 0; box-sizing: border-box; }
        body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif; background: var(--bg); color: var(--ink); display: flex; min-height: 100vh; }
        
        .sidebar { width: 260px; background: var(--sidebar); color: #fff; display: flex; flex-direction: column; }
        .sidebar-header { padding: 24px; border-bottom: 1px solid rgba(255,255,255,0.1); }
        .sidebar-brand { font-size: 20px; font-weight: 700; color: #fff; text-decoration: none; display: flex; align-items: center; gap: 10px; }
        
        .nav { flex: 1; padding: 20px 0; }
        .nav-item { display: flex; align-items: center; gap: 12px; padding: 12px 24px; color: rgba(255,255,255,0.7); text-decoration: none; transition: 0.2s; }
        .nav-item:hover { background: rgba(255,255,255,0.05); color: #fff; }
        .nav-item.active { background: var(--brand); color: #fff; }
        
        .main { flex: 1; display: flex; flex-direction: column; min-width: 0; }
        .header { height: 64px; background: var(--panel); border-bottom: 1px solid var(--line); display: flex; align-items: center; justify-content: space-between; padding: 0 32px; }
        .content { padding: 32px; flex: 1; }
        
        .card { background: var(--panel); border: 1px solid var(--line); border-radius: 12px; padding: 24px; }
        .btn { padding: 10px 20px; border-radius: 8px; border: none; font-weight: 600; cursor: pointer; transition: 0.2s; text-decoration: none; display: inline-flex; align-items: center; gap: 8px; }
        .btn-primary { background: var(--brand); color: #fff; }
        .btn-primary:hover { background: var(--brand-dark); }
        
        table { width: 100%; border-collapse: collapse; margin-top: 20px; }
        th { text-align: left; padding: 12px; border-bottom: 2px solid var(--line); color: var(--muted); font-size: 13px; text-transform: uppercase; }
        td { padding: 16px 12px; border-bottom: 1px solid var(--line); }
        
        .status { padding: 4px 12px; border-radius: 20px; font-size: 12px; font-weight: 600; }
        .status-active, .status-success { background: #ecfdf3; color: var(--success); }
        .status-inactive, .status-rejected { background: #fef2f2; color: var(--danger); }
        .status-pending, .status-initialized { background: #fffbeb; color: var(--warning); }
        .status-approved, .status-closed { background: #ecfdf3; color: var(--success); }
        .status-open { background: #eff6ff; color: var(--brand); }
        .status-in_progress { background: #fffbeb; color: var(--warning); }
        .grid { display: grid; gap: 18px; }
        .stats-grid { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 16px; margin-bottom: 24px; }
        .stat-card strong { display: block; margin-top: 8px; font-size: 32px; }
        .stat-card span { color: var(--muted); font-size: 13px; font-weight: 700; text-transform: uppercase; }
        .page-actions { display: flex; align-items: center; justify-content: space-between; gap: 16px; margin-bottom: 20px; }
        .form-grid { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 16px; }
        .field { display: grid; gap: 7px; }
        .field.full { grid-column: 1 / -1; }
        label { color: var(--ink); font-size: 13px; font-weight: 700; }
        input, select, textarea { width: 100%; min-height: 42px; border: 1px solid var(--line); border-radius: 8px; padding: 10px 12px; color: var(--ink); background: #fff; }
        textarea { min-height: 88px; resize: vertical; }
        .inline-form { display: flex; gap: 8px; align-items: center; flex-wrap: wrap; }
        .alert { padding: 14px 16px; border-radius: 8px; margin-bottom: 20px; font-weight: 600; }
        .alert-success { background: #ecfdf3; color: var(--success); }
        .alert-error { background: #fef2f2; color: var(--danger); }
        .muted { color: var(--muted); }
        @media (max-width: 900px) {
            body { display: block; }
            .sidebar { width: 100%; }
            .nav { display: flex; flex-wrap: wrap; padding: 10px; }
            .nav-item { padding: 10px 12px; }
            .stats-grid, .form-grid { grid-template-columns: 1fr; }
            .content { padding: 20px; }
        }
    </style>
    @stack('styles')
</head>
<body>
    @php
        $currentAdmin = session('admin_id') ? \App\Models\AdminAccount::find(session('admin_id')) : null;
    @endphp
    <div class="sidebar">
        <div class="sidebar-header">
            <a href="{{ route('admin.dashboard') }}" class="sidebar-brand">
                <img src="{{ asset('images/cloud-os-logo.png') }}" alt="Logo" style="width: 32px; height: 32px;">
                <span>Cloud OS</span>
            </a>
        </div>
        <nav class="nav">
            <a href="{{ route('admin.dashboard') }}" class="nav-item {{ request()->routeIs('admin.dashboard') ? 'active' : '' }}">Dashboard</a>
            <a href="{{ route('admin.users') }}" class="nav-item {{ request()->routeIs('admin.users') ? 'active' : '' }}">Users</a>
            <a href="{{ route('admin.apps') }}" class="nav-item {{ request()->routeIs('admin.apps') ? 'active' : '' }}">Apps</a>
            <a href="{{ route('admin.developers') }}" class="nav-item {{ request()->routeIs('admin.developers') ? 'active' : '' }}">Developers</a>
            <a href="{{ route('admin.payments') }}" class="nav-item {{ request()->routeIs('admin.payments') ? 'active' : '' }}">Payments</a>
            <a href="{{ route('admin.updates') }}" class="nav-item {{ request()->routeIs('admin.updates') ? 'active' : '' }}">Push Updates</a>
            <a href="{{ route('admin.support') }}" class="nav-item {{ request()->routeIs('admin.support') ? 'active' : '' }}">Support</a>
            <a href="{{ route('admin.admins') }}" class="nav-item {{ request()->routeIs('admin.admins') ? 'active' : '' }}">Admin Accounts</a>
        </nav>
        <div style="padding: 20px; border-top: 1px solid rgba(255,255,255,0.1);">
            <form action="{{ route('admin.logout') }}" method="POST">
                @csrf
                <button type="submit" class="nav-item" style="background: none; border: none; width: 100%; cursor: pointer;">Logout</button>
            </form>
        </div>
    </div>
    
    <div class="main">
        <header class="header">
            <h1 style="font-size: 18px; font-weight: 600;">@yield('header_title')</h1>
            <div style="display: flex; align-items: center; gap: 16px;">
                <span style="color: var(--muted);">{{ $currentAdmin?->name ?? 'Cloud OS Admin' }}</span>
            </div>
        </header>
        <main class="content">
            @if(session('success') || session('status'))
                <div class="alert alert-success">{{ session('success') ?? session('status') }}</div>
            @endif
            @if($errors->any())
                <div class="alert alert-error">{{ $errors->first() }}</div>
            @endif
            @yield('content')
        </main>
    </div>
    @stack('scripts')
</body>
</html>
