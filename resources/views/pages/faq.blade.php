@extends('layouts.marketing')

@section('title', 'Cloud OS - FAQ')
@section('meta_description', 'Frequently asked questions about Cloud OS accounts, app sharing, downloads, and developer submissions.')

@section('content')
<section class="page-hero">
    <div class="section-inner">
        <p class="section-kicker">FAQ</p>
        <h1 class="section-heading">Common Cloud OS questions.</h1>
        <p class="section-copy">Quick answers about using the mobile app, developer portal, and connected device features.</p>
    </div>
</section>

<section>
    <div class="section-inner">
        <div class="faq-list">
            <details open>
                <summary>Where do mobile users register?</summary>
                <p>Mobile users create their account inside the Cloud OS Android app so their device number can be attached to the phone workspace.</p>
            </details>
            <details>
                <summary>How do developers submit apps?</summary>
                <p>Create a developer account, upload your app details, and wait for admin approval before the app is released.</p>
            </details>
            <details>
                <summary>Can devices share apps and files?</summary>
                <p>Cloud OS is designed for device-to-device sharing between registered devices and device numbers.</p>
            </details>
        </div>
    </div>
</section>
@endsection
