<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\DeveloperProfile;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Storage;
use Illuminate\Support\Str;
use Symfony\Component\HttpFoundation\StreamedResponse;

class DeveloperFileManagerController extends Controller
{
    public function index(Request $request): JsonResponse
    {
        $validated = $request->validate([
            'api_key' => ['required', 'string', 'max:120'],
            'environment' => ['required', 'in:test,production'],
            'user_id' => ['required', 'string', 'max:255'],
            'device_id' => ['required', 'string', 'max:255'],
            'folder_path' => ['nullable', 'string', 'max:500'],
            'format' => ['nullable', 'string', 'max:20'],
        ]);

        $developer = $this->resolveDeveloper($validated['api_key'], $validated['environment']);
        $disk = Storage::disk('local');
        $folderPath = $this->sanitizeFolderPath($validated['folder_path'] ?? '');
        $basePath = $this->basePath($developer, $validated['environment'], $validated['user_id'], $validated['device_id'], $folderPath);
        $format = $this->normalizeFormat($validated['format'] ?? null);

        if (! $disk->exists($basePath)) {
            return response()->json([
                'environment' => $validated['environment'],
                'folder_path' => $folderPath,
                'format' => $format,
                'files' => [],
            ]);
        }

        $files = collect($disk->files($basePath))
            ->filter(fn (string $path) => $this->matchesFormat($path, $format))
            ->map(fn (string $path) => $this->mapFile($request, $disk, $path, $validated))
            ->values();

        return response()->json([
            'environment' => $validated['environment'],
            'folder_path' => $folderPath,
            'format' => $format,
            'files' => $files,
        ]);
    }

    public function store(Request $request): JsonResponse
    {
        $validated = $request->validate([
            'api_key' => ['required', 'string', 'max:120'],
            'environment' => ['required', 'in:test,production'],
            'user_id' => ['required', 'string', 'max:255'],
            'device_id' => ['required', 'string', 'max:255'],
            'folder_path' => ['nullable', 'string', 'max:500'],
            'file' => ['required', 'file', 'max:512000'],
        ]);

        $developer = $this->resolveDeveloper($validated['api_key'], $validated['environment']);
        $folderPath = $this->sanitizeFolderPath($validated['folder_path'] ?? '');
        $basePath = $this->basePath($developer, $validated['environment'], $validated['user_id'], $validated['device_id'], $folderPath);
        $file = $request->file('file');
        $filename = $this->uniqueFilename($basePath, $file->getClientOriginalName());
        $storedPath = $file->storeAs($basePath, $filename, 'local');

        return response()->json([
            'message' => 'File written to file manager.',
            'environment' => $validated['environment'],
            'file' => [
                'name' => $filename,
                'path' => $storedPath,
                'folder_path' => $folderPath,
                'size_bytes' => $file->getSize(),
                'mime_type' => $file->getClientMimeType(),
            ],
        ], 201);
    }

    public function download(Request $request): StreamedResponse
    {
        $validated = $request->validate([
            'api_key' => ['required', 'string', 'max:120'],
            'environment' => ['required', 'in:test,production'],
            'user_id' => ['required', 'string', 'max:255'],
            'device_id' => ['required', 'string', 'max:255'],
            'path' => ['required', 'string', 'max:1000'],
        ]);

        $developer = $this->resolveDeveloper($validated['api_key'], $validated['environment']);
        $disk = Storage::disk('local');
        $root = $this->basePath($developer, $validated['environment'], $validated['user_id'], $validated['device_id']);
        $path = $this->sanitizeFolderPath($validated['path']);

        abort_unless($path !== '' && ($path === $root || str_starts_with($path, "{$root}/")), 422, 'Invalid file path.');
        abort_unless($disk->exists($path), 404, 'File not found.');
        abort_if(is_dir($disk->path($path)), 422, 'Folders cannot be downloaded.');

        $stream = $disk->readStream($path);
        abort_unless($stream !== false, 404, 'Unable to open file stream.');

        return response()->streamDownload(function () use ($stream) {
            fpassthru($stream);
            fclose($stream);
        }, basename($path), [
            'Content-Type' => $disk->mimeType($path) ?: 'application/octet-stream',
            'Content-Length' => (string) $disk->size($path),
        ]);
    }

    private function resolveDeveloper(string $apiKey, string $environment): DeveloperProfile
    {
        $column = $environment === 'test' ? 'test_api_key' : 'live_api_key';

        $developer = DeveloperProfile::where($column, $apiKey)->first();
        abort_unless($developer, 401, 'Invalid developer API key.');

        return $developer;
    }

    private function basePath(DeveloperProfile $developer, string $environment, string $userId, string $deviceId, string $folderPath = ''): string
    {
        $folderPath = $this->sanitizeFolderPath($folderPath);
        $userId = $this->safeSegment($userId);
        $deviceId = $this->safeSegment($deviceId);

        $root = $environment === 'test'
            ? "developer_api_test/{$developer->id}/{$userId}/{$deviceId}"
            : "uploads/{$userId}/{$deviceId}";

        return trim($root . '/' . $folderPath, '/');
    }

    private function sanitizeFolderPath(string $folderPath): string
    {
        $clean = str_replace('\\', '/', $folderPath);
        $clean = preg_replace('#/+#', '/', $clean) ?? '';
        $segments = array_filter(explode('/', trim($clean, '/')), static function ($segment) {
            return $segment !== '' && $segment !== '.' && $segment !== '..';
        });

        return implode('/', $segments);
    }

    private function safeSegment(string $value): string
    {
        $clean = str_replace(['/', '\\'], '_', trim($value));
        $clean = str_replace('..', '_', $clean);

        return $clean !== '' ? $clean : 'default';
    }

    private function normalizeFormat(?string $format): ?string
    {
        $normalized = strtolower(trim((string) $format));
        $normalized = ltrim($normalized, '.');

        return $normalized !== '' ? $normalized : null;
    }

    private function matchesFormat(string $path, ?string $format): bool
    {
        if (! $format) {
            return true;
        }

        return strtolower(pathinfo($path, PATHINFO_EXTENSION)) === $format;
    }

    private function mapFile(Request $request, $disk, string $path, array $validated): array
    {
        return [
            'name' => basename($path),
            'path' => $path,
            'format' => strtolower(pathinfo($path, PATHINFO_EXTENSION)),
            'size_bytes' => $disk->size($path),
            'mime_type' => $disk->mimeType($path) ?: 'application/octet-stream',
            'download_url' => url('/api/developer/file-manager/download?' . http_build_query([
                'api_key' => $validated['api_key'],
                'environment' => $validated['environment'],
                'user_id' => $validated['user_id'],
                'device_id' => $validated['device_id'],
                'path' => $path,
            ])),
        ];
    }

    private function uniqueFilename(string $basePath, string $originalName): string
    {
        $name = pathinfo($originalName, PATHINFO_FILENAME);
        $extension = pathinfo($originalName, PATHINFO_EXTENSION);
        $safeBaseName = Str::limit(Str::slug($name, '_') ?: 'file', 80, '');
        $candidate = $extension ? "{$safeBaseName}.{$extension}" : $safeBaseName;
        $counter = 1;

        while (Storage::disk('local')->exists(trim("{$basePath}/{$candidate}", '/'))) {
            $candidate = $extension
                ? "{$safeBaseName}_{$counter}.{$extension}"
                : "{$safeBaseName}_{$counter}";
            $counter++;
        }

        return $candidate;
    }
}
