<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\User;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\File;
use Illuminate\Support\Facades\Schema;
use Illuminate\Support\Facades\Storage;
use Illuminate\Support\Str;
use Symfony\Component\HttpFoundation\StreamedResponse;

class FileUploadController extends Controller
{
    public function index(Request $request): JsonResponse
    {
        $validated = $request->validate([
            'user_id' => ['required', 'string', 'max:255'],
            'device_id' => ['required', 'string', 'max:255'],
            'folder_path' => ['nullable', 'string', 'max:500'],
            'show_excluded' => ['nullable', 'boolean'],
        ]);

        $folderPath = $this->sanitizeFolderPath($validated['folder_path'] ?? '');
        $deviceBasePath = trim("uploads/{$validated['user_id']}/{$validated['device_id']}", '/');
        $basePath = trim("uploads/{$validated['user_id']}/{$validated['device_id']}/{$folderPath}", '/');
        $disk = Storage::disk('local');
        $showExcluded = $validated['show_excluded'] ?? false;
        $excludedFolderName = 'Excluded from Sync';

        try {
            $usedSpace = $this->getDeviceUsedSpace($validated['user_id'], $validated['device_id']);
            if (! $disk->exists($basePath)) {
              return response()->json([
                  'files' => [],
                  'folder_path' => $folderPath,
                  'used_space' => $usedSpace,
              ]);
            }

            $directories = collect($disk->directories($basePath))
                ->map(fn ($directory) => $this->mapDirectory($directory, $basePath))
                ->filter()
                ->filter(function ($dir) use ($showExcluded, $excludedFolderName) {
                    if ($showExcluded) {
                        return true;
                    }
                    return $dir['name'] !== $excludedFolderName;
                })
                ->values();

            $files = collect($disk->files($basePath))
                ->map(fn ($filePath) => $this->mapFile($filePath, $disk))
                ->filter()
                ->values();

            $items = $directories
                ->concat($files)
                ->sortBy([
                    ['type', 'asc'],
                    ['name', 'asc'],
                ])
                ->values();
        } catch (\Throwable) {
            return response()->json([
                'files' => [],
                'folder_path' => $folderPath,
                'used_space' => 0,
            ]);
        }

        return response()->json([
            'files' => $items,
            'folder_path' => $folderPath,
            'used_space' => $usedSpace,
        ]);
    }

    public function store(Request $request): JsonResponse
    {
        $validated = $request->validate([
            'file' => ['required', 'file', 'max:512000'],
            'user_id' => ['required', 'string', 'max:255'],
            'device_id' => ['required', 'string', 'max:255'],
            'folder_path' => ['nullable', 'string', 'max:500'],
        ]);

        $file = $request->file('file');
        $folderPath = $this->sanitizeFolderPath($validated['folder_path'] ?? '');
        $basePath = trim("uploads/{$validated['user_id']}/{$validated['device_id']}/{$folderPath}", '/');
        $originalName = $file->getClientOriginalName();
        $filename = $this->uniqueFilename($basePath, $originalName);
        $storageCheck = $this->canStoreIncomingBytes($validated['user_id'], $validated['device_id'], (int) $file->getSize());

        if (! $storageCheck['ok']) {
            return response()->json([
                'message' => 'Cloud storage full. Upgrade storage to continue syncing files.',
                'used_space' => $storageCheck['used_space'],
                'storage_limit' => $storageCheck['storage_limit'],
            ], 422);
        }

        $this->ensureLocalStoragePath($basePath);
        $storedPath = $file->storeAs($basePath, $filename, 'local');

        if (! $storedPath) {
            return response()->json([
                'message' => 'Unable to save file. Please confirm public/cloud-storage is writable on the server.',
            ], 500);
        }

        return response()->json([
            'message' => 'File uploaded successfully.',
            'file' => [
                'name' => $filename,
                'original_name' => $originalName,
                'path' => $storedPath,
                'folder_path' => $folderPath,
                'size' => $file->getSize(),
                'mime_type' => $file->getClientMimeType(),
            ],
        ], 201);
    }

    public function storeBase64(Request $request): JsonResponse
    {
        $validated = $request->validate([
            'file_name' => ['required', 'string', 'max:255'],
            'file_data' => ['required', 'string'],
            'mime_type' => ['nullable', 'string', 'max:255'],
            'user_id' => ['required', 'string', 'max:255'],
            'device_id' => ['required', 'string', 'max:255'],
            'folder_path' => ['nullable', 'string', 'max:500'],
        ]);

        $base64 = preg_replace('/^data:[^;]+;base64,/', '', $validated['file_data']) ?? '';
        $contents = base64_decode($base64, true);

        if ($contents === false) {
            return response()->json([
                'message' => 'Invalid file payload.',
            ], 422);
        }

        if (strlen($contents) > 512000 * 1024) {
            return response()->json([
                'message' => 'The file may not be greater than 500 MB.',
            ], 422);
        }

        $folderPath = $this->sanitizeFolderPath($validated['folder_path'] ?? '');
        $basePath = trim("uploads/{$validated['user_id']}/{$validated['device_id']}/{$folderPath}", '/');
        $originalName = $this->sanitizeName($validated['file_name']) ?: 'file';
        $filename = $this->uniqueFilename($basePath, $originalName);
        $storedPath = trim("{$basePath}/{$filename}", '/');
        $disk = Storage::disk('local');
        $storageCheck = $this->canStoreIncomingBytes($validated['user_id'], $validated['device_id'], strlen($contents));

        if (! $storageCheck['ok']) {
            return response()->json([
                'message' => 'Cloud storage full. Upgrade storage to continue syncing files.',
                'used_space' => $storageCheck['used_space'],
                'storage_limit' => $storageCheck['storage_limit'],
            ], 422);
        }

        $this->ensureLocalStoragePath($basePath);
        if (! $disk->put($storedPath, $contents)) {
            return response()->json([
                'message' => 'Unable to save file. Please confirm public/cloud-storage is writable on the server.',
            ], 500);
        }

        return response()->json([
            'message' => 'File uploaded successfully.',
            'file' => [
                'name' => $filename,
                'original_name' => $originalName,
                'path' => $storedPath,
                'folder_path' => $folderPath,
                'size' => strlen($contents),
                'mime_type' => $validated['mime_type'] ?? 'application/octet-stream',
            ],
        ], 201);
    }

    public function createFolder(Request $request): JsonResponse
    {
        $validated = $request->validate([
            'user_id' => ['required', 'string', 'max:255'],
            'device_id' => ['required', 'string', 'max:255'],
            'folder_path' => ['nullable', 'string', 'max:500'],
            'name' => ['required', 'string', 'max:255'],
        ]);

        $folderPath = $this->sanitizeFolderPath($validated['folder_path'] ?? '');
        $name = trim($validated['name']);
        if ($name === '' || str_contains($name, '/') || str_contains($name, '\\')) {
            return response()->json([
                'message' => 'Invalid folder name.',
            ], 422);
        }

        $basePath = trim("uploads/{$validated['user_id']}/{$validated['device_id']}/{$folderPath}/{$name}", '/');
        $this->ensureLocalStoragePath($basePath);

        return response()->json([
            'message' => 'Folder created successfully.',
            'folder' => [
                'name' => $name,
                'path' => $basePath,
                'folder_path' => trim(($folderPath ? "{$folderPath}/" : '') . $name, '/'),
            ],
        ], 201);
    }

    public function createSyncFolderStructure(Request $request): JsonResponse
    {
        $validated = $request->validate([
            'user_id' => ['required', 'string', 'max:255'],
            'device_id' => ['required', 'string', 'max:255'],
            'folder_path' => ['nullable', 'string', 'max:500'],
            'folders' => ['nullable', 'array'],
            'folders.*' => ['required', 'string', 'max:500'],
        ]);

        $deviceBasePath = trim("uploads/{$validated['user_id']}/{$validated['device_id']}", '/');
        $disk = Storage::disk('local');

        $defaultFolders = [
            'Camera',
            'Documents',
            'Downloads',
            'Pictures',
            'Music',
            'Videos',
            'Recordings',
            'Screenshots',
            'WhatsApp',
            'Telegram',
        ];

        $foldersToCreate = $validated['folders']
            ?? (! empty($validated['folder_path'])
                ? [$this->sanitizeFolderPath($validated['folder_path'])]
                : $defaultFolders);
        $createdFolders = [];

        foreach ($foldersToCreate as $folderPath) {
            $folderPath = $this->sanitizeFolderPath($folderPath);

            if ($folderPath === '') {
                continue;
            }

            $fullPath = trim("{$deviceBasePath}/{$folderPath}", '/');
            if (! $disk->exists($fullPath)) {
                $this->ensureLocalStoragePath($fullPath);
                $createdFolders[] = [
                    'name' => basename($folderPath),
                    'path' => $fullPath,
                    'folder_path' => $folderPath,
                ];
            }
        }

        return response()->json([
            'message' => count($createdFolders) > 0 
                ? 'Sync folder structure created successfully.' 
                : 'Sync folder structure already exists.',
            'created_folders' => $createdFolders,
            'total_folders' => count($foldersToCreate),
        ]);
    }

    public function excludeFromSync(Request $request): JsonResponse
    {
        $validated = $request->validate([
            'user_id' => ['required', 'string', 'max:255'],
            'device_id' => ['required', 'string', 'max:255'],
            'path' => ['required', 'string', 'max:1000'],
            'type' => ['required', 'in:file,folder'],
        ]);

        $disk = Storage::disk('local');
        $sourcePath = $this->resolveManagedPath($validated['user_id'], $validated['device_id'], $validated['path']);
        $excludedFolderName = 'Excluded from Sync';
        $excludedFolderPath = trim("uploads/{$validated['user_id']}/{$validated['device_id']}/{$excludedFolderName}", '/');

        if (! $disk->exists($sourcePath)) {
            return response()->json(['message' => 'Item not found.'], 404);
        }

        if (basename($sourcePath) === $excludedFolderName) {
            return response()->json(['message' => 'Cannot exclude the excluded folder itself.'], 422);
        }

        $this->ensureLocalStoragePath($excludedFolderPath);

        $destinationPath = $validated['type'] === 'folder'
            ? $this->uniqueDirectoryPath($disk, $excludedFolderPath, basename($sourcePath))
            : trim($excludedFolderPath . '/' . $this->uniqueFilename($excludedFolderPath, basename($sourcePath)), '/');

        $this->moveManagedItem($disk, $sourcePath, $destinationPath, $validated['type']);

        return response()->json([
            'message' => 'Item excluded from sync successfully.',
            'path' => $destinationPath,
        ]);
    }

    public function restoreFromExclude(Request $request): JsonResponse
    {
        $validated = $request->validate([
            'user_id' => ['required', 'string', 'max:255'],
            'device_id' => ['required', 'string', 'max:255'],
            'path' => ['required', 'string', 'max:1000'],
            'type' => ['required', 'in:file,folder'],
        ]);

        $disk = Storage::disk('local');
        $excludedFolderName = 'Excluded from Sync';
        $deviceBasePath = trim("uploads/{$validated['user_id']}/{$validated['device_id']}", '/');
        $sourcePath = $this->resolveManagedPath($validated['user_id'], $validated['device_id'], $validated['path']);

        if (! $disk->exists($sourcePath)) {
            return response()->json(['message' => 'Item not found.'], 404);
        }

        $destinationPath = $validated['type'] === 'folder'
            ? $this->uniqueDirectoryPath($disk, $deviceBasePath, basename($sourcePath))
            : trim($deviceBasePath . '/' . $this->uniqueFilename($deviceBasePath, basename($sourcePath)), '/');

        $this->moveManagedItem($disk, $sourcePath, $destinationPath, $validated['type']);

        return response()->json([
            'message' => 'Item restored to sync successfully.',
            'path' => $destinationPath,
        ]);
    }

    public function saveHtmlCompanion(Request $request): JsonResponse
    {
        $validated = $request->validate([
            'user_id' => ['required', 'string', 'max:255'],
            'device_id' => ['required', 'string', 'max:255'],
            'path' => ['required', 'string', 'max:1000'],
            'html' => ['required', 'string'],
        ]);

        $disk = Storage::disk('local');
        $sourcePath = $this->resolveManagedPath($validated['user_id'], $validated['device_id'], $validated['path']);

        if (! $disk->exists($sourcePath)) {
            return response()->json(['message' => 'Source document not found.'], 404);
        }

        $companionPath = trim($sourcePath . '.editable.html', '/');
        $this->ensureLocalStoragePath(dirname($companionPath));
        $disk->put($companionPath, $validated['html']);

        return response()->json([
            'message' => 'HTML companion saved successfully.',
            'path' => $companionPath,
        ]);
    }

    public function rename(Request $request): JsonResponse
    {
        $validated = $request->validate([
            'user_id' => ['required', 'string', 'max:255'],
            'device_id' => ['required', 'string', 'max:255'],
            'path' => ['required', 'string', 'max:1000'],
            'name' => ['required', 'string', 'max:255'],
            'type' => ['required', 'in:file,folder'],
        ]);

        $disk = Storage::disk('local');
        $sourcePath = $this->resolveManagedPath($validated['user_id'], $validated['device_id'], $validated['path']);
        $newName = $this->sanitizeName($validated['name']);

        if ($newName === '') {
            return response()->json(['message' => 'Invalid name.'], 422);
        }

        if (! $disk->exists($sourcePath)) {
            return response()->json(['message' => 'Item not found.'], 404);
        }

        $parentPath = trim(dirname($sourcePath), '.\/');
        $destinationPath = trim(($parentPath ? "{$parentPath}/" : '') . $newName, '/');

        if ($validated['type'] === 'file') {
            $extension = pathinfo($sourcePath, PATHINFO_EXTENSION);
            $targetName = pathinfo($newName, PATHINFO_EXTENSION) === '' && $extension !== ''
                ? "{$newName}.{$extension}"
                : $newName;
            $destinationPath = trim(($parentPath ? "{$parentPath}/" : '') . $targetName, '/');
        }

        if ($sourcePath !== $destinationPath && $disk->exists($destinationPath)) {
            return response()->json(['message' => 'An item with that name already exists.'], 422);
        }

        $this->moveManagedItem($disk, $sourcePath, $destinationPath, $validated['type']);

        return response()->json([
            'message' => 'Item renamed successfully.',
            'path' => $destinationPath,
        ]);
    }

    public function move(Request $request): JsonResponse
    {
        $validated = $request->validate([
            'user_id' => ['required', 'string', 'max:255'],
            'device_id' => ['required', 'string', 'max:255'],
            'path' => ['required', 'string', 'max:1000'],
            'type' => ['required', 'in:file,folder'],
            'destination_folder_path' => ['nullable', 'string', 'max:500'],
        ]);

        $disk = Storage::disk('local');
        $sourcePath = $this->resolveManagedPath($validated['user_id'], $validated['device_id'], $validated['path']);

        if (! $disk->exists($sourcePath)) {
            return response()->json(['message' => 'Item not found.'], 404);
        }

        $destinationFolder = $this->buildManagedFolderPath(
            $validated['user_id'],
            $validated['device_id'],
            $validated['destination_folder_path'] ?? ''
        );
        $destinationPath = trim($destinationFolder . '/' . basename($sourcePath), '/');

        if ($sourcePath !== $destinationPath && $disk->exists($destinationPath)) {
            return response()->json(['message' => 'An item with that name already exists at the destination.'], 422);
        }

        $this->moveManagedItem($disk, $sourcePath, $destinationPath, $validated['type']);

        return response()->json([
            'message' => 'Item moved successfully.',
            'path' => $destinationPath,
        ]);
    }

    public function copy(Request $request): JsonResponse
    {
        $validated = $request->validate([
            'user_id' => ['required', 'string', 'max:255'],
            'device_id' => ['required', 'string', 'max:255'],
            'path' => ['required', 'string', 'max:1000'],
            'type' => ['required', 'in:file,folder'],
            'destination_folder_path' => ['nullable', 'string', 'max:500'],
        ]);

        $disk = Storage::disk('local');
        $sourcePath = $this->resolveManagedPath($validated['user_id'], $validated['device_id'], $validated['path']);

        if (! $disk->exists($sourcePath)) {
            return response()->json(['message' => 'Item not found.'], 404);
        }

        $destinationFolder = $this->buildManagedFolderPath(
            $validated['user_id'],
            $validated['device_id'],
            $validated['destination_folder_path'] ?? ''
        );

        $destinationPath = $validated['type'] === 'folder'
            ? $this->uniqueDirectoryPath($disk, $destinationFolder, basename($sourcePath))
            : trim($destinationFolder . '/' . $this->uniqueFilename($destinationFolder, basename($sourcePath)), '/');

        $this->copyManagedItem($disk, $sourcePath, $destinationPath, $validated['type']);

        return response()->json([
            'message' => 'Item copied successfully.',
            'path' => $destinationPath,
        ]);
    }

    public function destroy(Request $request): JsonResponse
    {
        $validated = $request->validate([
            'user_id' => ['required', 'string', 'max:255'],
            'device_id' => ['required', 'string', 'max:255'],
            'path' => ['required', 'string', 'max:1000'],
            'type' => ['required', 'in:file,folder'],
        ]);

        $disk = Storage::disk('local');
        $path = $this->resolveManagedPath($validated['user_id'], $validated['device_id'], $validated['path']);

        if (! $disk->exists($path)) {
            return response()->json(['message' => 'Item not found.'], 404);
        }

        if ($validated['type'] === 'folder') {
            $disk->deleteDirectory($path);
        } else {
            $disk->delete($path);
        }

        return response()->json([
            'message' => 'Item deleted successfully.',
        ]);
    }

    public function download(Request $request): StreamedResponse
    {
        $validated = $request->validate([
            'user_id' => ['required', 'string', 'max:255'],
            'device_id' => ['required', 'string', 'max:255'],
            'path' => ['required', 'string', 'max:1000'],
        ]);

        $disk = Storage::disk('local');
        $path = $this->resolveManagedPath($validated['user_id'], $validated['device_id'], $validated['path']);

        abort_unless($disk->exists($path), 404, 'File not found.');
        abort_if($this->isDirectoryPath($disk, $path), 422, 'Folders cannot be downloaded.');

        $stream = $disk->readStream($path);
        abort_unless($stream !== false, 404, 'Unable to open file stream.');

        return response()->streamDownload(function () use ($stream) {
            fpassthru($stream);
            fclose($stream);
        }, basename($path), [
            'Content-Type' => $this->safeMimeType($disk, $path),
            'Content-Length' => (string) $disk->size($path),
        ]);
    }

    public function share(Request $request): JsonResponse
    {
        $validated = $request->validate([
            'user_id' => ['required', 'string', 'max:255'],
            'device_id' => ['required', 'string', 'max:255'],
            'recipient_phone_number' => ['required', 'string'],
            'recipient_user_id' => ['nullable', 'integer', 'exists:users,id'],
            'recipient_device_id' => ['nullable', 'string', 'max:255'],
            'recipient_device_storage' => ['nullable', 'numeric', 'min:1'],
            'items' => ['required', 'array'],
            'items.*.path' => ['required', 'string'],
            'items.*.type' => ['required', 'in:file,folder'],
            'items.*.name' => ['required', 'string'],
        ]);

        $sender = User::findOrFail($validated['user_id']);
        $recipientPhoneInput = (string)$validated['recipient_phone_number'];
        $recipientDigits = preg_replace('/\D+/', '', $recipientPhoneInput);
        $recipientDeviceId = $validated['recipient_device_id'] ?? null;
        $recipientDevice = null;

        $recipient = isset($validated['recipient_user_id'])
            ? User::find($validated['recipient_user_id'])
            : null;

        if (!$recipient && !empty($recipientDigits) && Schema::hasTable('devices')) {
            $recipientDevice = $this->findDeviceByPhoneNumber($recipientPhoneInput, $recipientDigits);

            if ($recipientDevice) {
                $recipient = User::find($recipientDevice->user_id);
                $recipientDeviceId = $recipientDevice->device_id;
            }
        }

        if (!$recipient) {
            $recipient = User::where('phone_number', $recipientPhoneInput)->first();
        }

        if (!$recipient && !empty($recipientDigits)) {
            $recipient = User::where('phone_number', $recipientDigits)->first();
        }

        if (!$recipient && !empty($recipientDigits)) {
            $allUsers = User::whereNotNull('phone_number')->get();
            foreach ($allUsers as $u) {
                $dbDigits = preg_replace('/\D+/', '', (string)$u->phone_number);
                if (empty($dbDigits)) continue;

                // Match if the pure digits are identical
                if ($dbDigits === $recipientDigits) {
                    $recipient = $u;
                    break;
                }

                // Match if one contains the other (e.g. 080... vs +23480...)
                if (str_contains($dbDigits, $recipientDigits) || str_contains($recipientDigits, $dbDigits)) {
                    if (strlen($dbDigits) >= 7 && strlen($recipientDigits) >= 7) {
                        $recipient = $u;
                        break;
                    }
                }
            }
        }

        if (!$recipient && strlen($recipientPhoneInput) > 2 && !preg_match('/^\d+$/', $recipientDigits)) {
            $recipient = User::where('username', 'like', "%$recipientPhoneInput%")
                ->orWhere('name', 'like', "%$recipientPhoneInput%")
                ->first();
        }

        if (!$recipient) {
            return response()->json(['message' => 'Recipient device not found.'], 404);
        }

        if (!$recipientDeviceId) {
            if (Schema::hasTable('devices')) {
                $recipientDevice = DB::table('devices')
                    ->where('user_id', $recipient->id)
                    ->orderByRaw("CASE WHEN device_id = 'cloud' THEN 0 ELSE 1 END")
                    ->first();
            }

            $recipientDeviceId = $recipientDevice ? $recipientDevice->device_id : 'cloud';
        }

        if ((int)$recipient->id === (int)$sender->id && $recipientDeviceId === $validated['device_id']) {
            return response()->json(['message' => 'Choose another device, not the current device.'], 422);
        }

        $disk = Storage::disk('local');
        
        // 1. Calculate incoming size
        $totalIncomingSize = 0;
        foreach ($validated['items'] as $item) {
            $sourcePath = $this->resolveManagedPath($validated['user_id'], $validated['device_id'], $item['path']);
            if (!$disk->exists($sourcePath)) continue;
            
            if ($item['type'] === 'folder') {
                foreach ($disk->allFiles($sourcePath) as $f) {
                    $totalIncomingSize += $disk->size($f);
                }
            } else {
                $totalIncomingSize += $disk->size($sourcePath);
            }
        }

        $recipientUsed = $this->getDeviceUsedSpace($recipient->id, $recipientDeviceId);
        
        // Default limit to 500MB if no device record exists
        $recipientLimit = isset($validated['recipient_device_storage'])
            ? (int)$validated['recipient_device_storage'] * 1024 * 1024
            : 500 * 1024 * 1024;

        if (!isset($validated['recipient_device_storage']) && Schema::hasTable('devices')) {
            $recipientDevice = DB::table('devices')
                ->where('user_id', $recipient->id)
                ->where('device_id', $recipientDeviceId)
                ->first();

            if ($recipientDevice && $recipientDevice->storage) {
                $recipientLimit = (int)$recipientDevice->storage * 1024 * 1024;
            }
        }

        if (($recipientUsed + $totalIncomingSize) > $recipientLimit) {
            return response()->json([
                'message' => "Sharing failed. The recipient does not have enough cloud storage space (Limit: " . round($recipientLimit / (1024 * 1024), 1) . "MB).",
                'required_bytes' => $totalIncomingSize,
                'available_bytes' => max(0, $recipientLimit - $recipientUsed)
            ], 422);
        }

        $sharedCount = 0;
        foreach ($validated['items'] as $item) {
            $sourcePath = $this->resolveManagedPath($validated['user_id'], $validated['device_id'], $item['path']);
            
            if (!$disk->exists($sourcePath)) continue;

            // Destination: Shared with me / From Sender Name / ...
            $senderFolderName = "From " . ($sender->name ?: "User " . $sender->id);
            
            // IMPORTANT: We place shared files in the recipient's primary device folder
            // so they can actually see them.
            $destinationFolder = $this->buildManagedFolderPath(
                $recipient->id,
                $recipientDeviceId,
                "Shared with me/{$senderFolderName}"
            );

            $destinationPath = $item['type'] === 'folder'
                ? $this->uniqueDirectoryPath($disk, $destinationFolder, $item['name'])
                : trim($destinationFolder . '/' . $this->uniqueFilename($destinationFolder, $item['name']), '/');

            $this->copyManagedItem($disk, $sourcePath, $destinationPath, $item['type']);
            $sharedCount++;
        }

        return response()->json([
            'message' => "Successfully shared {$sharedCount} item(s) with {$recipient->name}.",
        ]);
    }

    private function findDeviceByPhoneNumber(string $phoneInput, string $phoneDigits): ?object
    {
        if (!Schema::hasTable('devices')) {
            return null;
        }

        $device = DB::table('devices')
            ->where('phone_number', $phoneInput)
            ->orWhere('phone_number', $phoneDigits)
            ->first();

        if ($device || $phoneDigits === '') {
            return $device;
        }

        $allDevices = DB::table('devices')
            ->whereNotNull('phone_number')
            ->get();

        foreach ($allDevices as $candidate) {
            $dbDigits = preg_replace('/\D+/', '', (string) $candidate->phone_number);

            if ($dbDigits === '') {
                continue;
            }

            if ($dbDigits === $phoneDigits || str_contains($dbDigits, $phoneDigits) || str_contains($phoneDigits, $dbDigits)) {
                if (strlen($dbDigits) >= 7 && strlen($phoneDigits) >= 7) {
                    return $candidate;
                }
            }
        }

        return null;
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

    private function sanitizeName(string $name): string
    {
        $trimmed = trim($name);

        if ($trimmed === '' || str_contains($trimmed, '/') || str_contains($trimmed, '\\')) {
            return '';
        }

        return $trimmed;
    }

    private function buildManagedFolderPath(string $userId, string $deviceId, string $folderPath = ''): string
    {
        $sanitizedFolderPath = $this->sanitizeFolderPath($folderPath);

        return trim("uploads/{$userId}/{$deviceId}/{$sanitizedFolderPath}", '/');
    }

    private function resolveManagedPath(string $userId, string $deviceId, string $path): string
    {
        $root = trim("uploads/{$userId}/{$deviceId}", '/');
        $candidate = $this->sanitizeFolderPath($path);

        if ($candidate === $root || str_starts_with($candidate, "{$root}/")) {
            return $candidate;
        }

        abort(422, 'Invalid path.');
    }

    private function uniqueFilename(string $basePath, string $originalName): string
    {
        $name = pathinfo($originalName, PATHINFO_FILENAME);
        $extension = pathinfo($originalName, PATHINFO_EXTENSION);
        $safeBaseName = Str::limit(Str::slug($name, '_', app()->getLocale()) ?: 'file', 80, '');
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

    private function uniqueDirectoryPath($disk, string $basePath, string $name): string
    {
        $safeBaseName = Str::limit(Str::slug(pathinfo($name, PATHINFO_FILENAME) ?: $name, '_', app()->getLocale()) ?: 'folder', 80, '');
        $candidate = trim("{$basePath}/{$safeBaseName}", '/');
        $counter = 1;

        while ($disk->exists($candidate)) {
            $candidate = trim("{$basePath}/{$safeBaseName}_{$counter}", '/');
            $counter++;
        }

        return $candidate;
    }

    public function getDeviceUsedSpace(string $userId, string $deviceId): int
    {
        $deviceBasePath = trim("uploads/{$userId}/{$deviceId}", '/');
        $disk = Storage::disk('local');
        $usedSpace = 0;

        try {
            if (! $disk->exists($deviceBasePath)) {
                return 0;
            }

            $allFiles = $disk->allFiles($deviceBasePath);
            foreach ($allFiles as $f) {
                try {
                    $usedSpace += $disk->size($f);
                } catch (\Exception $e) {
                    // Ignore missing files or permission issues
                }
            }
        } catch (\Throwable) {
            return 0;
        }

        return $usedSpace;
    }

    private function getDeviceStorageLimitBytes(string $userId, string $deviceId): int
    {
        $storageMb = 500;

        try {
            if (Schema::hasTable('devices')) {
                $device = DB::table('devices')
                    ->where('user_id', $userId)
                    ->where('device_id', $deviceId)
                    ->first();

                if ($device && $device->storage) {
                    $storageMb = (int) $device->storage;
                }
            }
        } catch (\Throwable) {
            $storageMb = 500;
        }

        return $storageMb * 1024 * 1024;
    }

    private function canStoreIncomingBytes(string $userId, string $deviceId, int $incomingBytes): array
    {
        $usedSpace = $this->getDeviceUsedSpace($userId, $deviceId);
        $storageLimit = $this->getDeviceStorageLimitBytes($userId, $deviceId);

        return [
            'ok' => ($usedSpace + $incomingBytes) <= $storageLimit,
            'used_space' => $usedSpace,
            'storage_limit' => $storageLimit,
        ];
    }

    private function moveManagedItem($disk, string $sourcePath, string $destinationPath, string $type): void
    {
        if ($type === 'folder') {
            $sourceAbsolutePath = $disk->path($sourcePath);
            $destinationAbsolutePath = $disk->path($destinationPath);
            File::ensureDirectoryExists(dirname($destinationAbsolutePath));
            File::moveDirectory($sourceAbsolutePath, $destinationAbsolutePath, true);
            return;
        }

        $this->ensureLocalStoragePath(dirname($destinationPath));
        $disk->move($sourcePath, $destinationPath);
    }

    private function copyManagedItem($disk, string $sourcePath, string $destinationPath, string $type): void
    {
        if ($type === 'folder') {
            $sourceAbsolutePath = $disk->path($sourcePath);
            $destinationAbsolutePath = $disk->path($destinationPath);
            File::ensureDirectoryExists(dirname($destinationAbsolutePath));
            
            if (!File::exists($sourceAbsolutePath)) {
                return;
            }

            File::copyDirectory($sourceAbsolutePath, $destinationAbsolutePath);
            return;
        }

        $this->ensureLocalStoragePath(dirname($destinationPath));
        
        // Ensure we are copying content, not just moving references
        if ($disk->exists($sourcePath)) {
            $disk->copy($sourcePath, $destinationPath);
        }
    }

    private function mapDirectory(string $directory, string $basePath): ?array
    {
        $relativeName = basename($directory);
        if ($relativeName === '' || str_starts_with($relativeName, '.')) {
            return null;
        }

        return [
            'id' => "folder:{$directory}",
            'name' => $relativeName,
            'type' => 'folder',
            'size' => '',
            'date' => null,
            'path' => $directory,
        ];
    }

    private function ensureLocalStoragePath(string $relativePath): void
    {
        $cleanPath = $this->sanitizeFolderPath($relativePath);
        $disk = Storage::disk('local');

        if (! $disk->exists('uploads')) {
            $disk->makeDirectory('uploads');
        }

        if ($cleanPath !== '' && ! $disk->exists($cleanPath)) {
            $disk->makeDirectory($cleanPath);
        }
    }

    private function mapFile(string $filePath, $disk): ?array
    {
        $name = basename($filePath);
        if ($name === '' || str_starts_with($name, '.')) {
            return null;
        }

        $lastModified = $disk->lastModified($filePath);
        $size = $disk->size($filePath);

        return [
            'id' => "file:{$filePath}",
            'name' => $name,
            'type' => 'file',
            'size_bytes' => $size,
            'size' => $size ? round($size / 1024, 2) . ' KB' : '',
            'date' => $lastModified ? date('n/j/Y', $lastModified) : null,
            'path' => $filePath,
        ];
    }

    private function isDirectoryPath($disk, string $path): bool
    {
        try {
            return is_dir($disk->path($path));
        } catch (\Throwable $exception) {
            return false;
        }
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

        return $this->mimeTypeFromExtension(pathinfo($path, PATHINFO_EXTENSION));
    }

    private function mimeTypeFromExtension(?string $extension): string
    {
        $normalized = strtolower((string) $extension);

        return match ($normalized) {
            'jpg', 'jpeg' => 'image/jpeg',
            'png' => 'image/png',
            'gif' => 'image/gif',
            'webp' => 'image/webp',
            'svg' => 'image/svg+xml',
            'pdf' => 'application/pdf',
            'txt' => 'text/plain',
            'json' => 'application/json',
            'csv' => 'text/csv',
            'mp3' => 'audio/mpeg',
            'wav' => 'audio/wav',
            'm4a' => 'audio/mp4',
            'aac' => 'audio/aac',
            'ogg' => 'audio/ogg',
            'mp4' => 'video/mp4',
            'mov' => 'video/quicktime',
            'avi' => 'video/x-msvideo',
            'zip' => 'application/zip',
            'doc' => 'application/msword',
            'docx' => 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
            default => 'application/octet-stream',
        };
    }
}
