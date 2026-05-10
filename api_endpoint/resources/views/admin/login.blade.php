<!DOCTYPE html>
<html lang="{{ str_replace('_', '-', app()->getLocale()) }}">
<head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <title>Cloud OS Admin Login</title>
    <style>
        :root { --bg:#071426; --panel:#ffffff; --ink:#0f1f33; --muted:#68778c; --line:#dce5ef; --brand:#155eef; --danger:#c2413b; }
        * { box-sizing: border-box; }
        body { margin: 0; min-height: 100vh; display: grid; place-items: center; padding: 24px; font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Arial, sans-serif; background: linear-gradient(135deg, #020713, #071426); color: var(--ink); }
        .login-card { width: min(100%, 420px); padding: 30px; border: 1px solid rgba(21,94,239,.18); border-radius: 14px; background: var(--panel); box-shadow: 0 24px 70px rgba(0,0,0,.28); }
        .brand { display: flex; align-items: center; gap: 12px; margin-bottom: 24px; }
        .brand img { width: 58px; height: 42px; object-fit: contain; }
        h1 { margin: 0; font-size: 24px; }
        p { margin: 6px 0 0; color: var(--muted); }
        form { display: grid; gap: 16px; margin-top: 24px; }
        label { display: block; margin-bottom: 7px; font-size: 13px; font-weight: 700; }
        input { width: 100%; min-height: 46px; border: 1px solid var(--line); border-radius: 8px; padding: 11px 13px; font: inherit; }
        button { min-height: 46px; border: 0; border-radius: 8px; color: #fff; background: var(--brand); font-weight: 800; cursor: pointer; }
        .alert { padding: 12px 14px; border-radius: 8px; color: var(--danger); background: #fef2f2; font-weight: 700; }
    </style>
</head>
<body>
    <main class="login-card">
        <div class="brand">
            <img src="{{ asset('images/cloud-os-logo.png') }}" alt="Cloud OS logo">
            <div>
                <h1>Admin Login</h1>
                <p>Cloud OS control panel</p>
            </div>
        </div>

        @if ($errors->any())
            <div class="alert">{{ $errors->first() }}</div>
        @endif

        <form method="POST" action="{{ route('admin.login.submit') }}">
            @csrf
            <div>
                <label for="email">Email address</label>
                <input id="email" type="email" name="email" value="{{ old('email') }}" autocomplete="email" required>
            </div>
            <div>
                <label for="password">Password</label>
                <input id="password" type="password" name="password" autocomplete="current-password" required>
            </div>
            <button type="submit">Login</button>
        </form>
    </main>
</body>
</html>
