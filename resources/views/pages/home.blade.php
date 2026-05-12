@extends('layouts.marketing')

@section('title', 'Cloud OS - Home')
@section('meta_description', 'Download Cloud OS, a cloud-powered mobile operating workspace for files, apps, sharing, calls, and connected devices.')

@section('content')
@php
    $apkAvailable = file_exists(public_path('downloads/Cloud_OS.apk')) || file_exists(public_path('downloads/cloud-os.apk')) || file_exists(public_path('downloads/cloud-mobile.apk'));
@endphp

<section class="hero">
    <div class="hero-inner">
        <div>
            <div class="eyebrow"><span class="status-dot"></span> Cloud. Power. Possibilities.</div>
            <h1>Cloud OS</h1>
            <p class="hero-copy">
                A cloud-powered mobile operating workspace for files, apps, messages, calls, media, payments, and device-to-device sharing.
                Cloud OS gives every user a personal device number, an app menu, and a connected cloud experience from one place.
            </p>
            <div class="hero-actions">
                <a class="button button-primary" href="{{ route('download.android') }}">Download Android APK</a>
                <a class="button button-light" href="{{ route('developers.signup') }}">Developer signup</a>
            </div>
            <div class="hero-metrics" aria-label="Cloud OS highlights">
                <div class="metric">
                    <strong>OS</strong>
                    <span>Phone-like cloud workspace</span>
                </div>
                <div class="metric">
                    <strong>Multi</strong>
                    <span>Share files and apps across devices</span>
                </div>
                <div class="metric">
                    <strong>Call</strong>
                    <span>Device numbers can connect directly</span>
                </div>
            </div>
        </div>

        <div class="hero-logo-stage" aria-label="Cloud OS logo">
            <div class="hero-logo-panel">
                <img class="hero-logo" src="{{ asset('images/cloud-os-logo.png') }}" alt="Cloud OS logo">
                <p>Cloud OS brings cloud power to your mobile device menu, app sharing, file movement, and device-number communication.</p>
            </div>
        </div>
    </div>
</section>

<section>
    <div class="section-inner">
        <p class="section-kicker">What users get</p>
        <h2 class="section-heading">Everything starts from one Cloud OS workspace.</h2>
        <p class="section-copy">
            Cloud OS combines useful phone tools with a cloud backend for files, contacts, messages, media, social chat,
            payments, app installs, device numbers, and direct sharing between registered devices.
        </p>
        <div class="feature-grid">
            <article class="feature">
                <div class="feature-symbol blue">F</div>
                <h3>Cloud files</h3>
                <p>Upload, organize, rename, move, copy, preview, download, and share files with another Cloud OS device.</p>
            </article>
            <article class="feature">
                <div class="feature-symbol green">D</div>
                <h3>Device numbers</h3>
                <p>Each registered device can keep its generated number, appear in contacts, and call another Cloud OS device.</p>
            </article>
            <article class="feature">
                <div class="feature-symbol red">A</div>
                <h3>Connected apps</h3>
                <p>Users can select multiple apps, share them to another registered device, and add received apps to the menu.</p>
            </article>
            <article class="feature">
                <div class="feature-symbol gold">S</div>
                <h3>App Store ready</h3>
                <p>Developer uploads, app reviews, and install records support a growing Cloud OS app store experience.</p>
            </article>
        </div>
    </div>
</section>

<section class="download-band" id="download">
    <div class="section-inner download-layout">
        <div>
            <p class="section-kicker">Download</p>
            <h2 class="section-heading">Install Cloud OS and start from your cloud-powered device menu.</h2>
            <p class="section-copy">
                Place the Android build at <strong>public/downloads/cloud-os.apk</strong>, and the button will serve it automatically.
                The old <strong>cloud-mobile.apk</strong> name is still supported as a fallback.
            </p>
            <div class="hero-actions">
                <a class="button button-primary" href="{{ route('download.android') }}">Download Android APK</a>
                <a class="button button-light" href="{{ route('auth.entry') }}">Create account</a>
            </div>
        </div>
        <div class="download-panel">
            <div class="download-row">
                <div>
                    <strong>Android APK</strong>
                    <span>{{ $apkAvailable ? 'Available now from the server.' : 'Waiting for the first APK build.' }}</span>
                </div>
                <a class="button button-light" href="{{ route('download.android') }}">{{ $apkAvailable ? 'Get APK' : 'Check' }}</a>
            </div>
            <div class="download-row">
                <div>
                    <strong>Developer apps</strong>
                    <span>Approved apps can be prepared for the Cloud OS app menu.</span>
                </div>
                <a class="button button-light" href="{{ route('developers.signup') }}">Signup</a>
            </div>
        </div>
    </div>
</section>

<section id="app-store">
    <div class="section-inner">
        <p class="section-kicker">App Store flow</p>
        <h2 class="section-heading">Developers upload. Cloud OS displays. Users share, download, and open apps from the menu.</h2>
        <p class="section-copy">
            This public website supports the Cloud OS app store flow: developer accounts, package uploads,
            review status, store listings, install records, and device-to-device app sharing.
        </p>
    </div>
</section>
@endsection
