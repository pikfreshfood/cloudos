@extends('layouts.marketing')

@section('title', 'Cloud OS - App Reviews')
@section('meta_description', 'Read user reviews for a Cloud OS developer app.')

@section('content')
<section class="page-hero">
    <div class="section-inner">
        <p class="section-kicker">App reviews</p>
        <h1 class="section-heading">{{ $app->app_name }} reviews.</h1>
        <p class="section-copy">See ratings and comments from Cloud OS users after your app is available.</p>
    </div>
</section>

<section>
    <div class="section-inner">
        <div class="status-list">
            @forelse ($app->reviews as $review)
                <article class="card legal-panel">
                    <h2>{{ $review->rating }}/5 rating</h2>
                    <p>{{ $review->comment ?: 'No written comment.' }}</p>
                    <p class="form-note">User: {{ $review->user?->name ?? $review->user_id }} | Device: {{ $review->device_id ?: 'N/A' }}</p>
                </article>
            @empty
                <article class="card legal-panel">
                    <h2>No reviews yet.</h2>
                    <p>Reviews will appear here after Cloud OS users rate your app.</p>
                </article>
            @endforelse
        </div>
    </div>
</section>
@endsection
