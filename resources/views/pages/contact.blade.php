@extends('layouts.marketing')

@section('title', 'Cloud OS - Contact Us')
@section('meta_description', 'Contact the Cloud OS team for support, developer questions, and platform enquiries.')

@section('content')
<section class="page-hero">
    <div class="section-inner">
        <p class="section-kicker">Contact us</p>
        <h1 class="section-heading">Talk to the Cloud OS team.</h1>
        <p class="section-copy">Send support requests, developer questions, or feedback about the Cloud OS mobile workspace.</p>
    </div>
</section>

<section>
    <div class="section-inner contact-layout">
        <div class="form-panel card">
            @if (session('status'))
                <div class="hidden-message visible">{{ session('status') }}</div>
            @endif

            @if ($errors->any())
                <div class="hidden-message visible" style="color:#842029;background:#f8d7da;border-color:#f5c2c7;">{{ $errors->first() }}</div>
            @endif

            <form method="POST" action="{{ route('contact.submit') }}">
                @csrf
                <div class="form-grid">
                    <div class="field">
                        <label for="name">Name</label>
                        <input id="name" name="name" value="{{ old('name') }}" required>
                    </div>
                    <div class="field">
                        <label for="email">Email</label>
                        <input id="email" type="email" name="email" value="{{ old('email') }}" required>
                    </div>
                    <div class="field full">
                        <label for="subject">Subject</label>
                        <input id="subject" name="subject" value="{{ old('subject') }}" required>
                    </div>
                    <div class="field full">
                        <label for="message">Message</label>
                        <textarea id="message" name="message" required>{{ old('message') }}</textarea>
                    </div>
                    <div class="field full">
                        <button class="button button-primary" type="submit">Send message</button>
                    </div>
                </div>
            </form>
        </div>

        <article class="card legal-panel">
            <h2>Support areas</h2>
            <p>App publishing, login issues, device numbers, file sharing, payment callbacks, and general Cloud OS enquiries.</p>
        </article>
    </div>
</section>
@endsection
