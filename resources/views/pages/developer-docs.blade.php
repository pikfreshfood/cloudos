@extends('layouts.marketing')

@section('title', 'Cloud OS - Developer Documentation')
@section('meta_description', 'Cloud OS developer documentation for app uploads, API keys, and mobile integrations.')

@section('content')
<section class="page-hero">
    <div class="section-inner">
        <p class="section-kicker">Documentation</p>
        <h1 class="section-heading">Build for the Cloud OS mobile workspace.</h1>
        <p class="section-copy">Use your dashboard keys and app upload tools to connect apps with Cloud OS users and device workflows.</p>
    </div>
</section>

<section>
    <div class="section-inner cards-grid">
        <article class="card legal-panel">
            <h2>App submission</h2>
            <p>Upload a public APK URL, app icon, screenshots, environment, and description. Admin review is required before release.</p>
        </article>
        <article class="card legal-panel">
            <h2>API keys</h2>
            <p>Test keys are for development. Live keys should stay private and be used only in production integrations.</p>
        </article>
        <article class="card legal-panel">
            <h2>Device experience</h2>
            <p>Approved apps can be installed into the Cloud OS device menu and shared across connected device numbers.</p>
        </article>
    </div>
</section>
@endsection
