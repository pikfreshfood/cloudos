@extends('layouts.marketing')

@section('title', 'Cloud OS - Upload App')
@section('meta_description', 'Upload an Android app package for review in the Cloud OS developer portal.')

@section('content')
<section class="page-hero">
    <div class="section-inner">
        <p class="section-kicker">Upload app</p>
        <h1 class="section-heading">Submit an app for Cloud OS review.</h1>
        <p class="section-copy">Add your app listing, icon, screenshots, and APK download URL for admin approval.</p>
    </div>
</section>

<section>
    <div class="section-inner auth-layout">
        <div class="form-panel card">
            @if ($errors->any())
                <div class="hidden-message visible" style="color:#842029;background:#f8d7da;border-color:#f5c2c7;">{{ $errors->first() }}</div>
            @endif

            <form method="POST" action="{{ route('developer.apps.store') }}" enctype="multipart/form-data">
                @csrf
                <div class="form-grid">
                    <div class="field">
                        <label for="app-name">App name</label>
                        <input id="app-name" name="app_name" value="{{ old('app_name') }}" required>
                    </div>
                    <div class="field">
                        <label for="environment">Environment</label>
                        <select id="environment" name="environment" required>
                            <option value="production" @selected(old('environment') === 'production')>Production</option>
                            <option value="test" @selected(old('environment') === 'test')>Test</option>
                        </select>
                    </div>
                    <div class="field full">
                        <label for="app-url">APK download URL</label>
                        <input id="app-url" type="url" name="app_url" value="{{ old('app_url') }}" placeholder="https://example.com/app.apk" required>
                    </div>
                    <div class="field full">
                        <label for="app-description">App description</label>
                        <textarea id="app-description" name="app_description">{{ old('app_description') }}</textarea>
                    </div>
                    <div class="field">
                        <label for="app-icon">App icon</label>
                        <input id="app-icon" type="file" name="app_icon" accept="image/png,image/jpeg,image/webp" required>
                        <div class="preview-label">Selected icon preview</div>
                        <div id="app-icon-preview" class="media-preview-grid">
                            <p class="preview-empty">No icon selected yet.</p>
                        </div>
                    </div>
                    <div class="field">
                        <label for="screenshots">Screenshots</label>
                        <input id="screenshots" type="file" name="screenshots[]" accept="image/png,image/jpeg,image/webp" multiple>
                        <div class="preview-label">Selected screenshots preview</div>
                        <div id="screenshots-preview" class="media-preview-grid screenshots-preview">
                            <p class="preview-empty">No screenshots selected yet.</p>
                        </div>
                    </div>
                    <div class="field full">
                        <button class="button button-primary" type="submit">Submit app for review</button>
                    </div>
                </div>
            </form>
        </div>

        <article class="card legal-panel">
            <p class="section-kicker">Checklist</p>
            <h2>Before you submit</h2>
            <p>Use a public APK URL, a clear square app icon, and screenshots that show the main app experience. Approved apps can appear in the Cloud OS mobile app store and device menu.</p>
        </article>
    </div>
</section>
@endsection

@push('styles')
<style>
    .media-preview-grid {
        display: flex;
        flex-wrap: wrap;
        gap: 10px;
        margin-top: 10px;
    }
    .preview-label {
        margin-top: 10px;
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
    .media-preview {
        position: relative;
        width: 92px;
        border: 1px solid var(--line);
        border-radius: 8px;
        padding: 8px;
        background: rgba(255, 255, 255, 0.06);
    }
    .media-preview img {
        width: 100%;
        aspect-ratio: 1;
        display: block;
        border-radius: 8px;
        object-fit: cover;
        background: #020713;
    }
    .screenshots-preview .media-preview { width: 132px; }
    .screenshots-preview .media-preview img { aspect-ratio: 16 / 10; }
    .media-preview span {
        display: block;
        margin-top: 6px;
        overflow: hidden;
        color: var(--muted);
        font-size: 11px;
        text-overflow: ellipsis;
        white-space: nowrap;
    }
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
        renderImagePreviews(this, 'app-icon-preview', { limit: 1, emptyText: 'No icon selected yet.' });
    });

    document.getElementById('screenshots')?.addEventListener('change', function () {
        renderImagePreviews(this, 'screenshots-preview', { limit: 8, emptyText: 'No screenshots selected yet.' });
    });
</script>
@endpush
