<?php

use App\Http\Controllers\Api\AppUpdateController;
use App\Http\Controllers\Api\AuthController;
use App\Http\Controllers\Api\AppStoreController;
use App\Http\Controllers\Api\ContactController;
use App\Http\Controllers\Api\DeveloperFileManagerController;
use App\Http\Controllers\Api\DeviceController;
use App\Http\Controllers\Api\FileUploadController;
use App\Http\Controllers\Api\MediaController;
use App\Http\Controllers\Api\MediaStateController;
use App\Http\Controllers\Api\MessageController;
use App\Http\Controllers\Api\PaystackPaymentController;
use App\Http\Controllers\Api\SignalController;
use App\Http\Controllers\Api\SyncStateController;
use App\Http\Controllers\Api\SupportMessageController;
use Illuminate\Support\Facades\Route;

Route::get('/health', function () {
    return response()->json([
        'status' => 'ok',
        'service' => 'cloud-os-api',
        'timestamp' => now()->toISOString(),
    ]);
});

Route::get('/app-store/apps', [AppStoreController::class, 'index']);
Route::get('/app-store/apps/{app}/reviews', [AppStoreController::class, 'reviews']);
Route::post('/app-store/apps/{app}/reviews', [AppStoreController::class, 'storeReview']);
Route::get('/devices', [DeviceController::class, 'index']);
Route::post('/devices/sync', [DeviceController::class, 'sync']);
Route::get('/devices/installed-apps', [DeviceController::class, 'installedApps']);
Route::post('/devices/installed-apps/sync', [DeviceController::class, 'syncInstalledApps']);
Route::post('/devices/installed-apps/share', [DeviceController::class, 'shareInstalledApps']);
Route::post('/devices/push-token', [DeviceController::class, 'syncPushToken']);

Route::prefix('auth')->group(function () {
    Route::post('/register', [AuthController::class, 'register']);
    Route::post('/login', [AuthController::class, 'login']);
    Route::post('/forgot-password', [AuthController::class, 'forgotPassword']);
    Route::patch('/profile', [AuthController::class, 'updateProfile']);
});

Route::prefix('developer/file-manager')->group(function () {
    Route::get('/', [DeveloperFileManagerController::class, 'index']);
    Route::post('/', [DeveloperFileManagerController::class, 'store']);
    Route::get('/download', [DeveloperFileManagerController::class, 'download']);
});

Route::get('/contacts', [ContactController::class, 'index']);
Route::post('/contacts', [ContactController::class, 'store']);
Route::delete('/contacts', [ContactController::class, 'destroy']);
Route::delete('/contacts/bulk', [ContactController::class, 'bulkDestroy']);
Route::get('/contacts/lookup', [ContactController::class, 'lookup']);
Route::post('/signals', [SignalController::class, 'handle']);
Route::get('/messages', [MessageController::class, 'conversations']);
Route::get('/messages/unread-count', [MessageController::class, 'unreadCount']);
Route::get('/messages/thread', [MessageController::class, 'thread']);
Route::post('/messages', [MessageController::class, 'store']);
Route::delete('/messages', [MessageController::class, 'destroy']);

Route::post('/files/upload', [FileUploadController::class, 'store']);
Route::post('/files/upload-base64', [FileUploadController::class, 'storeBase64']);
Route::post('/files/storage-status', [FileUploadController::class, 'storageStatus']);
Route::get('/files', [FileUploadController::class, 'index']);
Route::post('/files/html-companion', [FileUploadController::class, 'saveHtmlCompanion']);
Route::post('/files/folders', [FileUploadController::class, 'createFolder']);
Route::post('/files/sync-folder-structure', [FileUploadController::class, 'createSyncFolderStructure']);
Route::post('/files/exclude-from-sync', [FileUploadController::class, 'excludeFromSync']);
Route::post('/files/restore-from-exclude', [FileUploadController::class, 'restoreFromExclude']);
Route::post('/files/share', [FileUploadController::class, 'share']);
Route::post('/files/rename', [FileUploadController::class, 'rename']);
Route::post('/files/move', [FileUploadController::class, 'move']);
Route::post('/files/copy', [FileUploadController::class, 'copy']);
Route::delete('/files', [FileUploadController::class, 'destroy']);
Route::get('/files/download', [FileUploadController::class, 'download']);
Route::get('/media/music', [MediaController::class, 'music']);
Route::get('/media/images', [MediaController::class, 'images']);
Route::delete('/media', [MediaController::class, 'destroy']);
Route::get('/media/stream', [MediaController::class, 'stream'])->name('api.media.stream');
Route::prefix('payments/paystack')->group(function () {
    Route::post('/initialize', [PaystackPaymentController::class, 'initialize']);
    Route::post('/verify', [PaystackPaymentController::class, 'verify']);
});

Route::prefix('app-updates')->group(function () {
    Route::get('/latest', [AppUpdateController::class, 'latest']);
    Route::post('/mark-seen', [AppUpdateController::class, 'markSeen']);
});

Route::prefix('sync-states')->group(function () {
    Route::get('/', [SyncStateController::class, 'index']);
    Route::get('/show', [SyncStateController::class, 'show']);
    Route::post('/', [SyncStateController::class, 'store']);
    Route::patch('/', [SyncStateController::class, 'update']);
    Route::delete('/', [SyncStateController::class, 'destroy']);
});

Route::prefix('support-messages')->group(function () {
    Route::get('/', [SupportMessageController::class, 'index']);
    Route::post('/', [SupportMessageController::class, 'store']);
});

Route::prefix('media-states')->group(function () {
    Route::get('/', [MediaStateController::class, 'index']);
    Route::get('/show', [MediaStateController::class, 'show']);
    Route::post('/', [MediaStateController::class, 'store']);
    Route::delete('/', [MediaStateController::class, 'destroy']);
});
