@extends('layouts.marketing')

@section('title', 'Cloud OS - Edit App')
@section('meta_description', 'Edit a Cloud OS developer app submission.')

@section('content')
<section class="page-hero">
    <div class="section-inner">
        <p class="section-kicker">Edit app</p>
        <h1 class="section-heading">Update {{ $app->app_name }}.</h1>
        <p class="section-copy">Changes return the app to pending status so admin can review the latest version.</p>
    </div>
</section>

<section>
    <div class="section-inner">
        <div class="form-panel card">
            @if ($errors->any())
                <div class="hidden-message visible" style="color:#842029;background:#f8d7da;border-color:#f5c2c7;">{{ $errors->first() }}</div>
            @endif

            <form method="POST" action="{{ route('developer.apps.update', $app) }}" enctype="multipart/form-data">
                @csrf
                @method('PATCH')
                <div class="form-grid">
                    <div class="field">
                        <label for="app-name">App name</label>
                        <input id="app-name" name="app_name" value="{{ old('app_name', $app->app_name) }}" required>
                    </div>
                    <div class="field">
                        <label for="environment">Environment</label>
                        <select id="environment" name="environment" required>
                            <option value="production" @selected(old('environment', $app->environment) === 'production')>Production</option>
                            <option value="test" @selected(old('environment', $app->environment) === 'test')>Test</option>
                        </select>
                    </div>
                    <div class="field full">
                        <label for="app-url">APK download URL</label>
                        <input id="app-url" type="url" name="app_url" value="{{ old('app_url', $app->app_url) }}" required>
                    </div>
                    <div class="field full">
                        <label for="app-description">App description</label>
                        <textarea id="app-description" name="app_description">{{ old('app_description', $app->app_description) }}</textarea>
                    </div>
                    <div class="field">
                        <label for="app-icon">Replace app icon</label>
                        @if ($app->app_icon_path)
                            <div class="current-media">
                                <img src="{{ route('developer-app-media', ['path' => $app->app_icon_path]) }}" alt="{{ $app->app_name }} icon">
                                <span>Current icon</span>
                            </div>
                        @endif
                        <input id="app-icon" type="file" name="app_icon" accept="image/png,image/jpeg,image/webp">
                        <div class="preview-label">New selected icon preview</div>
                        <div id="app-icon-preview" class="media-preview-grid">
                            <p class="preview-empty">No replacement icon selected.</p>
                        </div>
                    </div>
                    <div class="field">
                        <label for="screenshots">Add screenshots</label>
                        @if (count($app->screenshots ?? []))
                            <div class="preview-label">Current uploaded screenshots</div>
                            <div class="existing-screenshots">
                                @foreach ($app->screenshots ?? [] as $index => $screenshot)
                                    @php $path = is_array($screenshot) ? ($screenshot['path'] ?? null) : $screenshot; @endphp
                                    @if ($path)
                                        <label class="existing-screenshot">
                                            <img src="{{ route('developer-app-media', ['path' => $path]) }}" alt="Screenshot {{ $index + 1 }}">
                                            <span>
                                                <input type="checkbox" name="remove_screenshots[]" value="{{ $index }}">
                                                Remove
                                            </span>
                                        </label>
                                    @endif
                                @endforeach
                            </div>
                        @endif
                        <input id="screenshots" type="file" name="screenshots[]" accept="image/png,image/jpeg,image/webp" multiple>
                        <div class="preview-label">New selected screenshots preview</div>
                        <div id="screenshots-preview" class="media-preview-grid screenshots-preview">
                            <p class="preview-empty">No new screenshots selected.</p>
                        </div>
                    </div>
                    <div class="field full">
                        <button class="button button-primary" type="submit">Save changes</button>
                    </div>
                </div>
            </form>
        </div>
    </div>
</section>
@endsection

@push('styles')
<style>
    .current-media,
    .existing-screenshots,
    .media-preview-grid {
        display: flex;
        flex-wrap: wrap;
        gap: 10px;
        margin-bottom: 10px;
    }
    .preview-label {
        margin: 10px 0 6px;
        color: var(--cyan);
        font-size: 12px;
        font-weight: 900;
        text-transform: uppercase;
    }
    .preview-empty {
        width: 100%;
        color: var(--muted);
        font-size: 13px;
    }
    .current-media,
    .media-preview,
    .existing-screenshot {
        position: relative;
        width: 104px;
        border: 1px solid var(--line);
        border-radius: 8px;
        padding: 8px;
        background: rgba(255, 255, 255, 0.06);
    }
    .existing-screenshot,
    .screenshots-preview .media-preview { width: 142px; }
    .current-media img,
    .media-preview img,
    .existing-screenshot img {
        width: 100%;
        aspect-ratio: 1;
        display: block;
        border-radius: 8px;
        object-fit: cover;
        background: #020713;
    }
    .existing-screenshot img,
    .screenshots-preview .media-preview img { aspect-ratio: 16 / 10; }
    .current-media span,
    .media-preview span,
    .existing-screenshot span {
        display: block;
        margin-top: 6px;
        color: var(--muted);
        font-size: 11px;
        font-weight: 800;
    }
    .existing-screenshot input { width: auto; min-height: auto; margin-right: 5px; }
    .media-remove {
        width: 100%;
        min-height: 32px;
        margin-top: 8px;
        border: 1px solid rgba(255, 255, 255, 0.16);
        border-radius: 8px;
        color: #fff;
        background: #b02a37;
        cursor: pointer;
        font-size: 12px;
        font-weight: 900;
    }
</style>
@endpush

@push('scripts')
<script>
    function syncFiles(input, files) {
        const transfer = new DataTransfer();
        files.forEach((file) => transfer.items.add(file));
        input.files = transfer.files;
    }

    function renderImagePreviews(input, targetId, options = {}) {
        const limit = options.limit || 8;
        const emptyText = options.emptyText || 'No files selected yet.';
        const target = document.getElementById(targetId);
        if (!target) return;
        target.innerHTML = '';

        const files = Array.from(input.files || []).filter((file) => file.type.startsWith('image/')).slice(0, limit);
        syncFiles(input, files);

        if (!files.length) {
            const empty = document.createElement('p');
            empty.className = 'preview-empty';
            empty.textContent = emptyText;
            target.appendChild(empty);
            return;
        }

        files.forEach((file, index) => {
            if (!file.type.startsWith('image/')) return;
            const item = document.createElement('div');
            item.className = 'media-preview';
            const image = document.createElement('img');
            image.src = URL.createObjectURL(file);
            image.onload = () => URL.revokeObjectURL(image.src);
            const label = document.createElement('span');
            label.textContent = file.name;
            const remove = document.createElement('button');
            remove.type = 'button';
            remove.className = 'media-remove';
            remove.textContent = 'Remove';
            remove.addEventListener('click', () => {
                const nextFiles = Array.from(input.files || []).filter((_, fileIndex) => fileIndex !== index);
                syncFiles(input, nextFiles);
                renderImagePreviews(input, targetId, options);
            });
            item.appendChild(image);
            item.appendChild(label);
            item.appendChild(remove);
            target.appendChild(item);
        });
    }

    document.getElementById('app-icon')?.addEventListener('change', function () {
        renderImagePreviews(this, 'app-icon-preview', { limit: 1, emptyText: 'No replacement icon selected.' });
    });

    document.getElementById('screenshots')?.addEventListener('change', function () {
        renderImagePreviews(this, 'screenshots-preview', { limit: 8, emptyText: 'No new screenshots selected.' });
    });
</script>
@endpush
