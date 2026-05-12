<?php

use App\Http\Controllers\Api\PaystackPaymentController;
use App\Http\Controllers\AdminController;
use App\Http\Controllers\DeveloperPortalController;
use App\Http\Controllers\SupportMessageController;
use App\Models\User;
use Illuminate\Http\Request;
use Illuminate\Support\Carbon;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Hash;
use Illuminate\Support\Facades\Route;
use Illuminate\Support\Facades\Schema;

Route::get('/', function () {
    return view('pages.home');
})->name('home');

Route::view('/about', 'pages.about')->name('about');
Route::view('/contact-us', 'pages.contact')->name('contact');
Route::post('/contact-us', [SupportMessageController::class, 'store'])->name('contact.submit');
Route::view('/login-register', 'pages.auth')->name('auth.entry');
Route::redirect('/login', '/login-register')->name('login');
Route::redirect('/register', '/login-register')->name('register');
Route::view('/device-call', 'pages.device-call')->name('device-call');
Route::view('/faq', 'pages.faq')->name('faq');
Route::view('/terms-and-conditions', 'pages.terms')->name('terms');
Route::view('/privacy-policy', 'pages.privacy')->name('privacy');
Route::get('/password-reset', function (Request $request) {
    return view('pages.password-reset', [
        'email' => $request->query('email', ''),
        'token' => $request->query('token', ''),
    ]);
})->name('password.reset.form');
Route::post('/password-reset', function (Request $request) {
    $validated = $request->validate([
        'email' => ['required', 'string', 'email', 'max:255'],
        'token' => ['required', 'string'],
        'password' => ['required', 'string', 'min:6', 'confirmed'],
    ]);

    $email = strtolower(trim($validated['email']));
    $record = DB::table('password_reset_tokens')->where('email', $email)->first();

    if (! $record || ! Hash::check($validated['token'], $record->token)) {
        return back()->withErrors(['email' => 'This password reset link is invalid or has already been used.']);
    }

    if ($record->created_at && now()->diffInMinutes(Carbon::parse($record->created_at)) > 60) {
        DB::table('password_reset_tokens')->where('email', $email)->delete();
        return back()->withErrors(['email' => 'This password reset link has expired. Request a new one from the app.']);
    }

    $user = User::where('email', $email)->first();
    if (! $user) {
        return back()->withErrors(['email' => 'No Cloud OS account was found for this email address.']);
    }

    $user->password = Hash::make(trim((string) $validated['password']));
    $user->save();
    DB::table('password_reset_tokens')->where('email', $email)->delete();

    return redirect('/login-register')->with('status', 'Your password has been reset. You can now sign in to Cloud OS.');
})->name('password.reset.update');

Route::post('/developer/register', [DeveloperPortalController::class, 'register'])->name('developer.register');
Route::post('/developer/login', [DeveloperPortalController::class, 'login'])->name('developer.login');
Route::post('/developer/logout', [DeveloperPortalController::class, 'logout'])->name('developer.logout');
Route::get('/developer/dashboard', [DeveloperPortalController::class, 'dashboard'])->name('developer.dashboard');
Route::get('/developer/upload-app', [DeveloperPortalController::class, 'uploadApp'])->name('developer.upload-app');
Route::get('/developer/app-status', [DeveloperPortalController::class, 'appStatus'])->name('developer.app-status');
Route::post('/developer/apps', [DeveloperPortalController::class, 'storeApp'])->name('developer.apps.store');
Route::get('/developer/apps/{app}/edit', [DeveloperPortalController::class, 'editApp'])->name('developer.apps.edit');
Route::get('/developer/apps/{app}/reviews', [DeveloperPortalController::class, 'appReviews'])->name('developer.apps.reviews');
Route::patch('/developer/apps/{app}', [DeveloperPortalController::class, 'updateApp'])->name('developer.apps.update');
Route::delete('/developer/apps/{app}', [DeveloperPortalController::class, 'destroyApp'])->name('developer.apps.destroy');
Route::view('/developer/documentation', 'pages.developer-docs')->name('developer.docs');
Route::get('/developer-app-media/{path}', [DeveloperPortalController::class, 'media'])
    ->where('path', '.*')
    ->name('developer-app-media');

Route::redirect('/admin', '/admin/dashboard')->name('admin.home');
Route::get('/admin/login', [AdminController::class, 'loginForm'])->name('admin.login');
Route::post('/admin/login', [AdminController::class, 'login'])->name('admin.login.submit');
Route::post('/admin/logout', [AdminController::class, 'logout'])->name('admin.logout');
Route::get('/admin/dashboard', [AdminController::class, 'dashboard'])->name('admin.dashboard');
Route::get('/admin/admins', [AdminController::class, 'admins'])->name('admin.admins');
Route::post('/admin/admins', [AdminController::class, 'storeAdmin'])->name('admin.admins.store');
Route::post('/admin/admins/{admin}', [AdminController::class, 'updateAdmin'])->name('admin.admins.update');
Route::get('/admin/users', [AdminController::class, 'users'])->name('admin.users');
Route::get('/admin/users/{user}/edit', [AdminController::class, 'editUser'])->name('admin.users.edit');
Route::post('/admin/users/{user}', [AdminController::class, 'updateUser'])->name('admin.users.update');
Route::delete('/admin/users/{user}', [AdminController::class, 'deleteUser'])->name('admin.users.delete');
Route::get('/admin/developers', [AdminController::class, 'developers'])->name('admin.developers');
Route::get('/admin/apps', [AdminController::class, 'apps'])->name('admin.apps');
Route::post('/admin/apps/{app}/status', [AdminController::class, 'updateAppStatus'])->name('admin.apps.status');
Route::get('/admin/support', [AdminController::class, 'support'])->name('admin.support');
Route::post('/admin/support/{message}/status', [AdminController::class, 'updateSupportStatus'])->name('admin.support.status');
Route::get('/admin/payments', [AdminController::class, 'payments'])->name('admin.payments');
Route::get('/admin/updates', [AdminController::class, 'updates'])->name('admin.updates');
Route::post('/admin/updates', [AdminController::class, 'storeUpdate'])->name('admin.updates.store');
Route::post('/admin/updates/{update}/status', [AdminController::class, 'updateUpdateStatus'])->name('admin.updates.status');
Route::delete('/admin/updates/{update}', [AdminController::class, 'deleteUpdate'])->name('admin.updates.delete');
Route::get('/admin/change-password', [AdminController::class, 'changePasswordForm'])->name('admin.change-password');
Route::post('/admin/change-password', [AdminController::class, 'changePassword'])->name('admin.change-password.update');
Route::redirect('/admin/developer-apps', '/admin/apps')->name('admin.developer-apps');

Route::redirect('/download/cloud-mobile', '/download/cloud-os');

Route::get('/download/cloud-os', function () {
    $apkPath = public_path('downloads/Cloud_OS.apk');

    if (! file_exists($apkPath)) {
        $apkPath = public_path('downloads/cloud-os.apk');
    }

    if (! file_exists($apkPath)) {
        $apkPath = public_path('downloads/cloud-mobile.apk');
    }

    if (file_exists($apkPath)) {
        try {
            if (Schema::hasTable('app_downloads')) {
                DB::table('app_downloads')->insert([
                    'user_id' => auth()->id(),
                    'ip_address' => request()->ip(),
                    'user_agent' => request()->userAgent(),
                    'created_at' => now(),
                    'updated_at' => now(),
                ]);
            }
        } catch (\Exception $e) {
            // Log the error silently and continue
            \Illuminate\Support\Facades\Log::error('Download count error: ' . $e->getMessage());
        }

        return response()->download($apkPath, 'Cloud-OS.apk', [
            'Content-Type' => 'application/vnd.android.package-archive',
            'Content-Disposition' => 'attachment; filename="Cloud-OS.apk"',
        ]);
    }

    return redirect('/#download');
})->name('download.android');

Route::get('/developers/signup', function () {
    return redirect('/login-register#developer-signup');
})->name('developers.signup');

Route::get('/paystack/mobile/callback', [PaystackPaymentController::class, 'mobileCallback'])
    ->name('paystack.mobile.callback');
