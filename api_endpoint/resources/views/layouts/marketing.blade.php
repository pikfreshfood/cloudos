<!DOCTYPE html>
<html lang="{{ str_replace('_', '-', app()->getLocale()) }}">
<head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <meta name="description" content="@yield('meta_description', 'Cloud OS is a cloud-powered mobile workspace, app store, and device-to-device sharing platform.')">
    <title>@yield('title', 'Cloud OS')</title>
    <style>
        :root {
            color-scheme: dark;
            --ink: #f4f8ff;
            --muted: #9fb5cf;
            --line: rgba(72, 169, 255, 0.24);
            --paper: #071226;
            --soft: #0b1830;
            --blue: #0497ff;
            --cyan: #24e7ff;
            --silver: #d8e2ef;
            --navy: #020713;
        }

        * { box-sizing: border-box; }
        html { scroll-behavior: smooth; }
        body {
            margin: 0;
            font-family: Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
            color: var(--ink);
            background: var(--navy);
        }
        a { color: inherit; text-decoration: none; }
        h1, h2, h3, p { margin: 0; }
        input, select, textarea, button { font: inherit; }

        .site-shell { min-height: 100vh; overflow-x: hidden; }
        .nav {
            position: sticky;
            top: 0;
            z-index: 20;
            background: rgba(2, 7, 19, 0.92);
            border-bottom: 1px solid rgba(36, 231, 255, 0.16);
            backdrop-filter: blur(18px);
        }
        .nav-inner, .section-inner, .hero-inner, .footer-inner {
            width: min(1120px, calc(100% - 40px));
            margin: 0 auto;
        }
        .nav-inner {
            min-height: 72px;
            display: flex;
            align-items: center;
            justify-content: space-between;
            gap: 24px;
        }
        .brand {
            display: inline-flex;
            align-items: center;
            font-weight: 850;
            color: var(--ink);
        }
        .brand-mark {
            width: 76px;
            height: 44px;
            border-radius: 8px;
            display: grid;
            place-items: center;
            overflow: hidden;
            background: transparent;
        }
        .brand-mark img {
            width: 100%;
            height: 100%;
            display: block;
            object-fit: contain;
        }
        .nav-links {
            display: flex;
            align-items: center;
            gap: 20px;
            color: var(--muted);
            font-size: 14px;
            font-weight: 700;
        }
        .nav-links a:hover, .nav-links a.active,
        .nav-logout-button:hover {
            color: var(--cyan);
        }
        .nav-logout-form { margin: 0; }
        .nav-logout-button {
            border: 0;
            padding: 0;
            color: var(--muted);
            background: transparent;
            font-weight: 700;
            cursor: pointer;
        }
        .mobile-menu-button {
            display: none;
            width: 46px;
            height: 46px;
            align-items: center;
            justify-content: center;
            border: 1px solid var(--line);
            border-radius: 8px;
            background: var(--paper);
            cursor: pointer;
        }
        .mobile-menu-icon {
            width: 20px;
            display: grid;
            gap: 4px;
        }
        .mobile-menu-icon span {
            display: block;
            height: 2px;
            border-radius: 99px;
            background: var(--cyan);
        }
        .mobile-menu-panel {
            display: none;
            width: min(1120px, calc(100% - 40px));
            margin: 0 auto;
            padding: 0 0 16px;
        }
        .mobile-menu-panel.open { display: block; }
        .mobile-menu-links {
            display: grid;
            gap: 8px;
            padding: 14px;
            border: 1px solid var(--line);
            border-radius: 8px;
            background: var(--paper);
            box-shadow: 0 18px 36px rgba(0, 0, 0, 0.28);
        }
        .mobile-menu-links a,
        .mobile-menu-links button {
            min-height: 42px;
            display: flex;
            align-items: center;
            border: 0;
            border-radius: 8px;
            padding: 0 12px;
            color: var(--muted);
            background: transparent;
            font-weight: 800;
            cursor: pointer;
        }
        .mobile-menu-links form { margin: 0; }
        .mobile-menu-links button { width: 100%; }
        .mobile-menu-links a.active,
        .mobile-menu-links a:hover,
        .mobile-menu-links button:hover {
            color: var(--cyan);
            background: var(--soft);
        }

        .button {
            min-height: 46px;
            display: inline-flex;
            align-items: center;
            justify-content: center;
            gap: 10px;
            border-radius: 8px;
            padding: 0 18px;
            border: 1px solid transparent;
            font-weight: 800;
            line-height: 1;
            cursor: pointer;
            transition: transform 160ms ease, box-shadow 160ms ease, border-color 160ms ease;
        }
        .button:hover { transform: translateY(-1px); }
        .button-primary {
            color: #ffffff;
            background: linear-gradient(135deg, var(--blue), var(--cyan));
            box-shadow: 0 14px 30px rgba(4, 151, 255, 0.28);
        }
        .button-dark {
            color: #ffffff;
            background: #020713;
            box-shadow: 0 14px 28px rgba(0, 0, 0, 0.34);
        }
        .button-light {
            color: var(--ink);
            background: rgba(255, 255, 255, 0.08);
            border-color: var(--line);
        }

        .hero {
            background:
                linear-gradient(135deg, rgba(2, 7, 19, 0.98), rgba(5, 18, 42, 0.96)),
                linear-gradient(90deg, rgba(4, 151, 255, 0.18), rgba(36, 231, 255, 0.08));
            border-bottom: 1px solid var(--line);
        }
        .hero-inner {
            min-height: calc(100vh - 72px);
            display: grid;
            grid-template-columns: minmax(0, 1.02fr) minmax(320px, 0.78fr);
            align-items: center;
            gap: 54px;
            padding: 48px 0 64px;
        }
        .eyebrow {
            display: inline-flex;
            align-items: center;
            gap: 8px;
            color: var(--cyan);
            font-size: 13px;
            font-weight: 850;
            text-transform: uppercase;
            letter-spacing: 0.08em;
            margin-bottom: 16px;
        }
        .status-dot {
            width: 9px;
            height: 9px;
            border-radius: 99px;
            background: var(--cyan);
            box-shadow: 0 0 0 6px rgba(36, 231, 255, 0.14);
        }
        h1 {
            max-width: 760px;
            color: var(--ink);
            font-size: clamp(44px, 8vw, 78px);
            line-height: 0.96;
            letter-spacing: 0;
        }
        .hero-copy {
            max-width: 660px;
            margin-top: 22px;
            color: var(--muted);
            font-size: 19px;
            line-height: 1.72;
        }
        .hero-actions {
            display: flex;
            flex-wrap: wrap;
            gap: 12px;
            margin-top: 32px;
        }
        .hero-metrics, .feature-grid, .cards-grid {
            display: grid;
            gap: 18px;
            margin-top: 36px;
        }
        .hero-metrics { grid-template-columns: repeat(3, minmax(0, 1fr)); max-width: 660px; }
        .feature-grid { grid-template-columns: repeat(4, minmax(0, 1fr)); }
        .cards-grid { grid-template-columns: repeat(3, minmax(0, 1fr)); }

        .metric, .feature, .card, .form-panel, .legal-panel {
            border: 1px solid var(--line);
            border-radius: 8px;
            background: var(--paper);
        }
        .metric { min-height: 98px; padding: 18px; background: rgba(7, 18, 38, 0.78); }
        .metric strong { display: block; color: var(--ink); font-size: 26px; line-height: 1; }
        .metric span { display: block; margin-top: 8px; color: var(--muted); font-size: 13px; line-height: 1.35; }
        .feature, .card { min-height: 210px; padding: 24px; }
        .feature-symbol {
            width: 42px;
            height: 42px;
            border-radius: 8px;
            display: grid;
            place-items: center;
            color: #ffffff;
            font-weight: 900;
            margin-bottom: 22px;
        }
        .feature h3, .card h3 { color: var(--ink); font-size: 18px; line-height: 1.25; }
        .feature p, .card p { margin-top: 12px; color: var(--muted); line-height: 1.6; font-size: 15px; }
        .blue, .green, .gold, .red, .navy { background: linear-gradient(135deg, var(--blue), var(--cyan)); }

        .hero-logo-stage { display: grid; place-items: center; }
        .hero-logo-panel {
            width: min(440px, 100%);
            padding: 18px;
            border: 1px solid rgba(36, 231, 255, 0.22);
            border-radius: 8px;
            background: #020713;
            box-shadow: 0 34px 90px rgba(4, 151, 255, 0.18);
        }
        .hero-logo {
            width: 100%;
            display: block;
            border-radius: 6px;
        }
        .hero-logo-panel p {
            margin-top: 16px;
            color: rgba(255, 255, 255, 0.78);
            font-size: 14px;
            line-height: 1.6;
        }

        section, .page-section { padding: 86px 0; }
        .page-hero {
            padding: 86px 0;
            background: linear-gradient(135deg, #020713, #0b1830);
            border-bottom: 1px solid var(--line);
        }
        .section-kicker {
            color: var(--cyan);
            font-size: 13px;
            font-weight: 850;
            text-transform: uppercase;
            letter-spacing: 0.08em;
            margin-bottom: 12px;
        }
        .section-heading {
            max-width: 760px;
            color: var(--ink);
            font-size: clamp(32px, 5vw, 52px);
            line-height: 1.04;
            letter-spacing: 0;
        }
        .section-copy {
            max-width: 720px;
            margin-top: 16px;
            color: var(--muted);
            font-size: 17px;
            line-height: 1.72;
        }
        .split-layout, .download-layout, .auth-layout, .contact-layout {
            display: grid;
            grid-template-columns: minmax(0, 1fr) minmax(320px, 1fr);
            gap: 44px;
            align-items: start;
        }
        .download-band { background: var(--navy); color: #ffffff; }
        .download-band .section-kicker { color: var(--cyan); }
        .download-band .section-heading, .download-band .section-copy { color: #ffffff; }
        .download-band .section-copy { opacity: 0.78; }
        .download-panel {
            padding: 26px;
            border: 1px solid rgba(36, 231, 255, 0.18);
            border-radius: 8px;
            background: rgba(7, 18, 38, 0.84);
        }
        .download-row {
            display: flex;
            align-items: center;
            justify-content: space-between;
            gap: 16px;
            padding: 16px 0;
            border-bottom: 1px solid rgba(255, 255, 255, 0.14);
        }
        .download-row:last-child { border-bottom: 0; }
        .download-row strong { display: block; font-size: 17px; }
        .download-row span { display: block; margin-top: 5px; color: rgba(255, 255, 255, 0.72); font-size: 13px; }

        .soft-section { background: var(--soft); }
        .steps { display: grid; gap: 14px; margin-top: 28px; }
        .step { display: grid; grid-template-columns: 38px minmax(0, 1fr); gap: 14px; align-items: start; }
        .step-number {
            width: 38px;
            height: 38px;
            display: grid;
            place-items: center;
            border-radius: 8px;
            color: #ffffff;
            background: linear-gradient(135deg, var(--blue), var(--cyan));
            font-weight: 900;
        }
        .step strong { display: block; color: var(--ink); }
        .step span { display: block; margin-top: 5px; color: var(--muted); line-height: 1.5; }

        .form-panel { padding: 28px; box-shadow: 0 22px 55px rgba(4, 151, 255, 0.12); }
        .form-grid { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 16px; }
        .field { display: grid; gap: 7px; }
        .field.full { grid-column: 1 / -1; }
        label { color: var(--ink); font-size: 13px; font-weight: 800; }
        input, select, textarea {
            width: 100%;
            min-height: 46px;
            border: 1px solid var(--line);
            border-radius: 8px;
            padding: 11px 13px;
            color: var(--ink);
            background: rgba(2, 7, 19, 0.72);
            outline: none;
        }
        textarea { min-height: 112px; resize: vertical; }
        input:focus, select:focus, textarea:focus {
            border-color: var(--cyan);
            box-shadow: 0 0 0 4px rgba(36, 231, 255, 0.12);
        }
        .form-note { margin-top: 14px; color: var(--muted); font-size: 13px; line-height: 1.5; }
        .hidden-message {
            display: none;
            margin-top: 14px;
            padding: 12px 14px;
            border-radius: 8px;
            color: #0f5132;
            background: #dff7ea;
            border: 1px solid #bce8cf;
            font-weight: 750;
        }
        .hidden-message.visible { display: block; }
        .auth-switch {
            display: grid;
            grid-template-columns: repeat(2, minmax(0, 1fr));
            gap: 8px;
            padding: 6px;
            margin-bottom: 24px;
            border: 1px solid var(--line);
            border-radius: 8px;
            background: rgba(2, 7, 19, 0.72);
        }
        .auth-switch button {
            min-height: 44px;
            border: 0;
            border-radius: 8px;
            color: var(--muted);
            background: transparent;
            font-weight: 850;
            cursor: pointer;
        }
        .auth-switch button.active {
            color: #ffffff;
            background: linear-gradient(135deg, var(--blue), var(--cyan));
            box-shadow: 0 10px 22px rgba(4, 151, 255, 0.18);
        }
        .auth-pane { display: none; }
        .auth-pane.active { display: block; }
        .legal-panel { padding: 30px; }
        .legal-panel h2 { margin-top: 28px; color: var(--ink); font-size: 24px; }
        .legal-panel h2:first-child { margin-top: 0; }
        .legal-panel p, .legal-panel li { color: var(--muted); line-height: 1.75; }
        .legal-panel p { margin-top: 12px; }
        .legal-panel ul { padding-left: 20px; }
        .faq-list { display: grid; gap: 14px; margin-top: 34px; }
        details {
            border: 1px solid var(--line);
            border-radius: 8px;
            background: var(--paper);
            padding: 18px 20px;
        }
        summary { cursor: pointer; color: var(--ink); font-weight: 850; }
        details p { margin-top: 12px; color: var(--muted); line-height: 1.65; }

        .footer { padding: 56px 0 30px; color: var(--silver); background: #020713; }
        .footer-grid {
            display: grid;
            grid-template-columns: minmax(240px, 1.2fr) repeat(3, minmax(150px, 1fr));
            gap: 34px;
        }
        .footer h3 { color: #ffffff; font-size: 15px; margin: 0 0 14px; }
        .footer p, .footer a { color: rgba(219, 231, 244, 0.78); line-height: 1.7; font-size: 14px; }
        .footer a:hover { color: #ffffff; }
        .footer-links { display: grid; gap: 9px; }
        .social-links { display: flex; flex-wrap: wrap; gap: 10px; margin-top: 18px; }
        .social-links a {
            min-width: 42px;
            min-height: 42px;
            display: grid;
            place-items: center;
            border-radius: 8px;
            border: 1px solid rgba(255, 255, 255, 0.16);
            color: #ffffff;
            font-weight: 850;
        }
        .social-links svg {
            width: 20px;
            height: 20px;
            fill: currentColor;
        }
        .footer-bottom {
            display: flex;
            justify-content: space-between;
            gap: 20px;
            flex-wrap: wrap;
            margin-top: 38px;
            padding-top: 22px;
            border-top: 1px solid rgba(255, 255, 255, 0.14);
            color: rgba(219, 231, 244, 0.72);
            font-size: 13px;
        }

        @media (max-width: 900px) {
            .hero-inner, .split-layout, .download-layout, .auth-layout, .contact-layout { grid-template-columns: 1fr; }
            .hero-inner { min-height: auto; padding-top: 44px; }
            .hero-logo-stage { order: -1; }
            .feature-grid, .cards-grid, .footer-grid { grid-template-columns: repeat(2, minmax(0, 1fr)); }
        }
        @media (max-width: 680px) {
            .nav-inner, .section-inner, .hero-inner, .footer-inner { width: min(100% - 28px, 1120px); }
            .nav-inner { min-height: auto; padding: 14px 0; align-items: center; }
            .nav-links { display: none; }
            .nav .button-primary { display: none; }
            .mobile-menu-button { display: inline-flex; }
            .mobile-menu-panel { width: min(100% - 28px, 1120px); }
            h1 { font-size: clamp(38px, 13vw, 54px); }
            .hero-copy, .section-copy { font-size: 16px; }
            .hero-metrics, .feature-grid, .cards-grid, .form-grid, .footer-grid { grid-template-columns: 1fr; }
            section, .page-section, .page-hero { padding: 64px 0; }
            .download-row { align-items: flex-start; flex-direction: column; }
        }
    </style>
    @stack('styles')
</head>
<body>
    @php
        $developerLoggedIn = session()->has('developer_id');
    @endphp

    <div class="site-shell">
        <header class="nav">
            <div class="nav-inner">
                <a href="{{ route('home') }}" class="brand" aria-label="Cloud OS home">
                    <span class="brand-mark">
                        <img src="{{ asset('images/cloud-os-logo.png') }}" alt="" aria-hidden="true">
                    </span>
                </a>
                <nav class="nav-links" aria-label="Main navigation">
                    @if ($developerLoggedIn)
                        <a class="{{ request()->routeIs('developer.dashboard') ? 'active' : '' }}" href="{{ route('developer.dashboard') }}">Dashboard</a>
                        <a class="{{ request()->routeIs('developer.upload-app') ? 'active' : '' }}" href="{{ route('developer.upload-app') }}">Upload App</a>
                        <a class="{{ request()->routeIs('developer.app-status') ? 'active' : '' }}" href="{{ route('developer.app-status') }}">App Status</a>
                        <a class="{{ request()->routeIs('developer.docs') ? 'active' : '' }}" href="{{ route('developer.docs') }}">Documentation</a>
                        <form class="nav-logout-form" action="{{ route('developer.logout') }}" method="post">
                            @csrf
                            <button class="nav-logout-button" type="submit">Logout</button>
                        </form>
                    @else
                        <a class="{{ request()->routeIs('home') ? 'active' : '' }}" href="{{ route('home') }}">Home</a>
                        <a class="{{ request()->routeIs('about') ? 'active' : '' }}" href="{{ route('about') }}">About</a>
                        <a class="{{ request()->routeIs('contact') ? 'active' : '' }}" href="{{ route('contact') }}">Contact Us</a>
                        <a class="{{ request()->routeIs('auth.entry') || request()->routeIs('login') || request()->routeIs('register') ? 'active' : '' }}" href="{{ route('auth.entry') }}">Login/Register</a>
                    @endif
                </nav>
                @if ($developerLoggedIn)
                    <a class="button button-primary" href="{{ route('developer.docs') }}">API Docs</a>
                @else
                    <a class="button button-primary" href="{{ route('download.android') }}">Download</a>
                @endif
                <button class="mobile-menu-button" type="button" aria-label="Open menu" aria-controls="mobileMenu" aria-expanded="false">
                    <span class="mobile-menu-icon" aria-hidden="true">
                        <span></span>
                        <span></span>
                        <span></span>
                    </span>
                </button>
            </div>
            <div class="mobile-menu-panel" id="mobileMenu">
                <nav class="mobile-menu-links" aria-label="Mobile navigation">
                    @if ($developerLoggedIn)
                        <a class="{{ request()->routeIs('developer.dashboard') ? 'active' : '' }}" href="{{ route('developer.dashboard') }}">Dashboard</a>
                        <a class="{{ request()->routeIs('developer.upload-app') ? 'active' : '' }}" href="{{ route('developer.upload-app') }}">Upload App</a>
                        <a class="{{ request()->routeIs('developer.app-status') ? 'active' : '' }}" href="{{ route('developer.app-status') }}">App Status</a>
                        <a class="{{ request()->routeIs('developer.docs') ? 'active' : '' }}" href="{{ route('developer.docs') }}">Documentation</a>
                        <form action="{{ route('developer.logout') }}" method="post">
                            @csrf
                            <button type="submit">Logout</button>
                        </form>
                    @else
                        <a class="{{ request()->routeIs('home') ? 'active' : '' }}" href="{{ route('home') }}">Home</a>
                        <a class="{{ request()->routeIs('about') ? 'active' : '' }}" href="{{ route('about') }}">About</a>
                        <a class="{{ request()->routeIs('contact') ? 'active' : '' }}" href="{{ route('contact') }}">Contact Us</a>
                        <a class="{{ request()->routeIs('auth.entry') || request()->routeIs('login') || request()->routeIs('register') ? 'active' : '' }}" href="{{ route('auth.entry') }}">Login/Register</a>
                        <a href="{{ route('download.android') }}">Download</a>
                    @endif
                </nav>
            </div>
        </header>

        <main>
            @yield('content')
        </main>

        <footer class="footer">
            <div class="footer-inner">
                <div class="footer-grid">
                    <div>
                        <h3>Cloud OS</h3>
                        <p>Cloud-powered mobile workspace, app store, file sharing, and device-number communication platform.</p>
                        <div class="social-links" aria-label="Social media links">
                            <a href="https://facebook.com" rel="noopener" target="_blank" aria-label="Facebook">F</a>
                            <a href="https://x.com" rel="noopener" target="_blank" aria-label="X">X</a>
                            <a href="https://instagram.com" rel="noopener" target="_blank" aria-label="Instagram">IG</a>
                            <a href="https://linkedin.com" rel="noopener" target="_blank" aria-label="LinkedIn">IN</a>
                            <a href="https://youtube.com" rel="noopener" target="_blank" aria-label="YouTube">YT</a>
                        </div>
                    </div>
                    @if ($developerLoggedIn)
                        <div>
                            <h3>Developer Portal</h3>
                            <div class="footer-links">
                                <a href="{{ route('developer.dashboard') }}">Dashboard</a>
                                <a href="{{ route('developer.upload-app') }}">Upload App</a>
                                <a href="{{ route('developer.app-status') }}">App Status</a>
                                <a href="{{ route('developer.docs') }}">Developer Documentation</a>
                            </div>
                        </div>
                        <div>
                            <h3>API</h3>
                            <div class="footer-links">
                                <a href="{{ route('developer.docs') }}">File Manager API</a>
                                <a href="{{ route('developer.dashboard') }}">API Keys</a>
                                <a href="{{ route('faq') }}">FAQ</a>
                            </div>
                        </div>
                    @else
                        <div>
                            <h3>Company</h3>
                            <div class="footer-links">
                                <a href="{{ route('home') }}">Home</a>
                                <a href="{{ route('about') }}">About</a>
                                <a href="{{ route('contact') }}">Contact Us</a>
                                <a href="{{ route('auth.entry') }}">Login/Register</a>
                            </div>
                        </div>
                        <div>
                            <h3>Developers</h3>
                            <div class="footer-links">
                                <a href="{{ route('developers.signup') }}">Developer Signup</a>
                                <a href="{{ route('developer.dashboard') }}">Developer Dashboard</a>
                                <a href="{{ route('developer.docs') }}">Developer Documentation</a>
                                <a href="{{ route('home') }}#app-store">App Store</a>
                                <a href="{{ route('download.android') }}">Download App</a>
                                <a href="{{ route('faq') }}">FAQ</a>
                            </div>
                        </div>
                    @endif
                    <div>
                        <h3>Legal</h3>
                        <div class="footer-links">
                            <a href="{{ route('terms') }}">Terms and Conditions</a>
                            <a href="{{ route('privacy') }}">Privacy Policy</a>
                            <a href="{{ route('faq') }}">FAQ</a>
                        </div>
                    </div>
                </div>
                <div class="footer-bottom">
                    <span>&copy; {{ date('Y') }} Cloud OS. All rights reserved.</span>
                    <span>Cloud. Power. Possibilities.</span>
                </div>
            </div>
        </footer>
    </div>

    <script>
        const mobileMenuButton = document.querySelector('.mobile-menu-button');
        const mobileMenu = document.getElementById('mobileMenu');

        if (mobileMenuButton && mobileMenu) {
            mobileMenuButton.addEventListener('click', () => {
                const isOpen = mobileMenu.classList.toggle('open');
                mobileMenuButton.setAttribute('aria-expanded', isOpen ? 'true' : 'false');
                mobileMenuButton.setAttribute('aria-label', isOpen ? 'Close menu' : 'Open menu');
            });
        }
    </script>
    @stack('scripts')
</body>
</html>
