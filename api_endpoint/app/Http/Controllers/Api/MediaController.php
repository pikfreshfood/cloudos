<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Storage;
use Symfony\Component\HttpFoundation\StreamedResponse;
use Throwable;

class MediaController extends Controller
{
    private const AUDIO_EXTENSIONS = ['mp3', 'wav', 'm4a', 'aac', 'flac', 'ogg'];
    private const IMAGE_EXTENSIONS = ['jpg', 'jpeg', 'png', 'gif', 'webp'];

    public function music(Request $request): JsonResponse
    {
        $validated = $request->validate([
            'user_id' => ['required', 'string', 'max:255'],
            'device_id' => ['required', 'string', 'max:255'],
        ]);

        $basePath = trim("uploads/{$validated['user_id']}/{$validated['device_id']}", '/');
        $disk = Storage::disk('local');

        try {
            if (! $disk->exists($basePath)) {
                return response()->json(['tracks' => []]);
            }

            $tracks = collect($disk->allFiles($basePath))
                ->filter(fn (string $path) => $this->hasAllowedExtension($path, self::AUDIO_EXTENSIONS))
                ->map(function (string $path) use ($disk) {
                    $filename = basename($path);
                    $title = pathinfo($filename, PATHINFO_FILENAME);
                    $size = $this->safeSize($disk, $path);

                    return [
                        'id' => $path,
                        'title' => $title,
                        'artist' => 'Cloud Upload',
                        'size' => $size ? number_format($size / (1024 * 1024), 2) . ' MB' : 'Unknown',
                        'url' => url('/api/media/stream?path=' . rawurlencode($path)),
                        'path' => $path,
                    ];
                })
                ->sortBy('title')
                ->values();
        } catch (Throwable) {
            return response()->json(['tracks' => []]);
        }

        return response()->json([
            'tracks' => $tracks,
        ]);
    }

    public function images(Request $request): JsonResponse
    {
        $validated = $request->validate([
            'user_id' => ['required', 'string', 'max:255'],
            'device_id' => ['required', 'string', 'max:255'],
        ]);

        $basePath = trim("uploads/{$validated['user_id']}/{$validated['device_id']}", '/');
        $disk = Storage::disk('local');

        try {
            if (! $disk->exists($basePath)) {
                return response()->json(['images' => []]);
            }

            $images = collect($disk->allFiles($basePath))
                ->filter(fn (string $path) => $this->hasAllowedExtension($path, self::IMAGE_EXTENSIONS))
                ->map(function (string $path) use ($disk) {
                    $filename = basename($path);
                    $lastModified = $this->safeLastModified($disk, $path);

                    return [
                        'id' => $path,
                        'title' => $filename,
                        'url' => url('/api/media/stream?path=' . rawurlencode($path)),
                        'path' => $path,
                        'is_remote' => true,
                        'updated_at' => $lastModified ? date(DATE_ATOM, $lastModified) : null,
                    ];
                })
                ->sortByDesc('updated_at')
                ->values();
        } catch (Throwable) {
            return response()->json(['images' => []]);
        }

        return response()->json([
            'images' => $images,
        ]);
    }

    public function destroy(Request $request): JsonResponse
    {
        $validated = $request->validate([
            'path' => ['required', 'string'],
        ]);

        $path = $this->sanitizePath($validated['path']);
        $disk = Storage::disk('local');

        if (! $disk->exists($path)) {
            return response()->json([
                'message' => 'Media file not found.',
            ], 404);
        }

        $disk->delete($path);

        return response()->json([
            'message' => 'Media deleted successfully.',
        ]);
    }

    public function stream(Request $request): StreamedResponse
    {
        $validated = $request->validate([
            'path' => ['required', 'string'],
        ]);

        $path = $this->sanitizePath($validated['path']);
        $disk = Storage::disk('local');

        abort_unless($disk->exists($path), 404, 'Media file not found.');

        $mimeType = $this->safeMimeType($disk, $path);
        $stream = $disk->readStream($path);

        abort_unless($stream !== false, 404, 'Unable to open media stream.');

        return response()->stream(function () use ($stream) {
            fpassthru($stream);
            fclose($stream);
        }, 200, [
            'Content-Type' => $mimeType,
            'Content-Length' => (string) $disk->size($path),
            'Accept-Ranges' => 'bytes',
            'Cache-Control' => 'no-cache, no-store, must-revalidate',
        ]);
    }

    private function sanitizePath(string $path): string
    {
        $clean = str_replace('\\', '/', $path);
        $clean = preg_replace('#/+#', '/', $clean) ?? '';
        $segments = array_filter(explode('/', trim($clean, '/')), static function ($segment) {
            return $segment !== '' && $segment !== '.' && $segment !== '..';
        });

        return implode('/', $segments);
    }

    private function hasAllowedExtension(string $path, array $extensions): bool
    {
        $extension = strtolower(pathinfo($path, PATHINFO_EXTENSION));

        return in_array($extension, $extensions, true);
    }

    private function safeMimeType($disk, string $path): string
    {
        try {
            $mimeType = $disk->mimeType($path);
            if (is_string($mimeType) && $mimeType !== '') {
                return $mimeType;
            }
        } catch (\Throwable $exception) {
            // Fallback handled below.
        }

        return match (strtolower((string) pathinfo($path, PATHINFO_EXTENSION))) {
            'mp3' => 'audio/mpeg',
            'wav' => 'audio/wav',
            'm4a' => 'audio/mp4',
            'aac' => 'audio/aac',
            'flac' => 'audio/flac',
            'ogg' => 'audio/ogg',
            'jpg', 'jpeg' => 'image/jpeg',
            'png' => 'image/png',
            'gif' => 'image/gif',
            'webp' => 'image/webp',
            'mp4' => 'video/mp4',
            default => 'application/octet-stream',
        };
    }

    private function safeSize($disk, string $path): int
    {
        try {
            return (int) $disk->size($path);
        } catch (Throwable) {
            return 0;
        }
    }

    private function safeLastModified($disk, string $path): ?int
    {
        try {
            $lastModified = $disk->lastModified($path);
            return is_numeric($lastModified) ? (int) $lastModified : null;
        } catch (Throwable) {
            return null;
        }
    }
}
