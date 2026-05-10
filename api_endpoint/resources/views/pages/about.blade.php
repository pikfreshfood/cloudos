@extends('layouts.marketing')

@section('title', 'Cloud OS - About')
@section('meta_description', 'Learn about Cloud OS, a cloud-powered mobile workspace for files, apps, device numbers, and sharing.')

@section('content')
<section class="page-hero">
    <div class="section-inner">
        <p class="section-kicker">About Cloud OS</p>
        <h1 class="section-heading">A mobile workspace powered by cloud connection.</h1>
        <p class="section-copy">
            Cloud OS brings files, apps, contacts, calls, media, payments, device numbers, and sharing tools into one connected mobile experience.
        </p>
    </div>
</section>

<section>
    <div class="section-inner cards-grid">
        <article class="card legal-panel">
            <h2>For users</h2>
            <p>Cloud OS gives users a personal device workspace for managing files, apps, shared items, and device-number communication.</p>
        </article>
        <article class="card legal-panel">
            <h2>For developers</h2>
            <p>Developers can submit apps, track approval status, and prepare software for the Cloud OS app store and device menu.</p>
        </article>
        <article class="card legal-panel">
            <h2>For connected devices</h2>
            <p>The platform is designed around device numbers so registered devices can discover each other and share safely.</p>
        </article>
    </div>
</section>
@endsection
