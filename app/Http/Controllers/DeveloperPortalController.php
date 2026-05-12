<?php

namespace App\Http\Controllers;

use App\Models\DeveloperApp;
use App\Models\DeveloperProfile;
use Illuminate\Http\RedirectResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Hash;
use Illuminate\Support\Facades\Schema;
use Illuminate\Support\Facades\Storage;
use Illuminate\Support\Str;
use Illuminate\Validation\ValidationException;
use Illuminate\View\View;
use Symfony\Component\HttpFoundation\StreamedResponse;

class DeveloperPortalController extends Controller
{
    public function register(Request $request): RedirectResponse
    {
        $this->ensureDeveloperTablesExist();

        $validated = $request->validate([
            'developer_name' => ['required', 'string', 'max:255'],
            'company_name' => ['nullable', 'string', 'max:255'],
            'email' => ['required', 'string', 'email', 'max:255', 'unique:developer_profiles,email'],
            'password' => ['required', 'string', 'min:6', 'confirmed'],
            'app_category' => ['nullable', 'string', 'max:120'],
            'app_summary' => ['nullable', 'string', 'max:2000'],
        ]);

        $developer = DeveloperProfile::create([
            'developer_name' => trim($validated['developer_name']),
            'company_name' => trim($validated['company_name'] ?? ''),
            'email' => strtolower(trim($validated['email'])),
            'password' => $validated['password'],
            'app_category' => $validated['app_category'] ?? null,
            'app_summary' => $validated['app_summary'] ?? null,
            'test_api_key' => 'cm_test_' . Str::random(48),
            'live_api_key' => 'cm_live_' . Str::random(48),
        ]);

        $request->session()->put('developer_id', $developer->id);

        return redirect()->route('developer.dashboard')
            ->with('status', 'Developer account created. You can now upload your app.');
    }

    public function login(Request $request): RedirectResponse
    {
        $this->ensureDeveloperTablesExist();

        $validated = $request->validate([
            'email' => ['required', 'string', 'email', 'max:255'],
            'password' => ['required', 'string'],
        ]);

        $developer = DeveloperProfile::query()
            ->where('email', strtolower(trim($validated['email'])))
            ->first();

        if (! $developer || ! Hash::check($validated['password'], $developer->password)) {
            throw ValidationException::withMessages([
                'email' => ['The provided developer credentials are incorrect.'],
            ]);
        }

        $request->session()->put('developer_id', $developer->id);

        return redirect()->route('developer.dashboard');
    }

    public function logout(Request $request): RedirectResponse
    {
        $request->session()->forget('developer_id');

        return redirect()->route('auth.entry');
    }

    public function dashboard(Request $request): View|RedirectResponse
    {
        $this->ensureDeveloperTablesExist();

        $developer = $this->currentDeveloper($request);
        if (! $developer) {
            return redirect()->route('auth.entry')
                ->with('status', 'Login as a developer to open your dashboard.');
        }

        $apps = $developer->apps();

        return view('pages.developer-dashboard', [
            'developer' => $developer,
            'totalApps' => (clone $apps)->count(),
            'pendingApps' => (clone $apps)->where('status', 'pending')->count(),
            'approvedApps' => (clone $apps)->where('status', 'approved')->count(),
            'rejectedApps' => (clone $apps)->where('status', 'rejected')->count(),
        ]);
    }

    public function uploadApp(Request $request): View|RedirectResponse
    {
        $this->ensureDeveloperTablesExist();

        $developer = $this->currentDeveloper($request);
        if (! $developer) {
            return redirect()->route('auth.entry')
                ->with('status', 'Login as a developer to upload your app.');
        }

        return view('pages.developer-upload-app', [
            'developer' => $developer,
        ]);
    }

    public function appStatus(Request $request): View|RedirectResponse
    {
        $this->ensureDeveloperTablesExist();

        $developer = $this->currentDeveloper($request);
        if (! $developer) {
            return redirect()->route('auth.entry')
                ->with('status', 'Login as a developer to view app status.');
        }

        return view('pages.developer-app-status', [
            'developer' => $developer,
            'apps' => $developer->apps()->with(['reviews.user'])->latest()->paginate(10),
        ]);
    }

    public function storeApp(Request $request): RedirectResponse
    {
        $this->ensureDeveloperTablesExist();

        $developer = $this->currentDeveloper($request);
        if (! $developer) {
            return redirect()->route('auth.entry');
        }

        $validated = $request->validate([
            'app_name' => ['required', 'string', 'max:255'],
            'app_description' => ['nullable', 'string', 'max:3000'],
            'app_icon' => ['required', 'image', 'mimes:png,jpg,jpeg,webp', 'max:4096'],
            'screenshots' => ['nullable', 'array', 'max:8'],
            'screenshots.*' => ['image', 'mimes:png,jpg,jpeg,webp', 'max:4096'],
            'app_url' => ['required', 'url', 'max:1200'],
            'environment' => ['required', 'in:test,production'],
        ]);

        $icon = $request->file('app_icon');
        $iconName = Str::slug($validated['app_name']) . '-' . Str::random(8) . '.' . $icon->getClientOriginalExtension();
        $iconPath = $icon->storeAs('developer-app-icons', $iconName, 'public');
        $screenshots = [];

        foreach ($request->file('screenshots', []) as $index => $screenshot) {
            $screenshotName = Str::slug($validated['app_name']) . '-screen-' . ($index + 1) . '-' . Str::random(8) . '.' . $screenshot->getClientOriginalExtension();
            $screenshotPath = $screenshot->storeAs('developer-app-screenshots', $screenshotName, 'public');
            $screenshots[] = [
                'path' => $screenshotPath,
                'size_bytes' => $screenshot->getSize() ?: 0,
            ];
        }

        DeveloperApp::create([
            'developer_profile_id' => $developer->id,
            'app_name' => trim($validated['app_name']),
            'app_description' => trim($validated['app_description'] ?? ''),
            'app_icon_path' => $iconPath,
            'screenshots' => $screenshots,
            'app_icon_size_bytes' => $icon->getSize() ?: 0,
            'app_url' => trim($validated['app_url']),
            'environment' => $validated['environment'],
            'status' => 'pending',
        ]);

        return redirect()->route('developer.app-status')
            ->with('status', 'App uploaded. Admin approval is now pending.');
    }

    public function editApp(Request $request, DeveloperApp $app): View|RedirectResponse
    {
        $this->ensureDeveloperTablesExist();

        $developer = $this->currentDeveloper($request);
        if (! $developer) {
            return redirect()->route('auth.entry');
        }

        abort_unless((int) $app->developer_profile_id === (int) $developer->id, 403);

        return view('pages.developer-edit-app', [
            'developer' => $developer,
            'app' => $app,
        ]);
    }

    public function updateApp(Request $request, DeveloperApp $app): RedirectResponse
    {
        $this->ensureDeveloperTablesExist();

        $developer = $this->currentDeveloper($request);
        if (! $developer) {
            return redirect()->route('auth.entry');
        }

        abort_unless((int) $app->developer_profile_id === (int) $developer->id, 403);

        $validated = $request->validate([
            'app_name' => ['required', 'string', 'max:255'],
            'app_description' => ['nullable', 'string', 'max:3000'],
            'app_icon' => ['nullable', 'image', 'mimes:png,jpg,jpeg,webp', 'max:4096'],
            'remove_screenshots' => ['nullable', 'array'],
            'remove_screenshots.*' => ['integer'],
            'screenshots' => ['nullable', 'array', 'max:8'],
            'screenshots.*' => ['image', 'mimes:png,jpg,jpeg,webp', 'max:4096'],
            'app_url' => ['required', 'url', 'max:1200'],
            'environment' => ['required', 'in:test,production'],
        ]);

        $screenshots = array_values($app->screenshots ?? []);
        $removeIndexes = collect($validated['remove_screenshots'] ?? [])
            ->map(fn ($index) => (int) $index)
            ->unique()
            ->values()
            ->all();

        $keptScreenshots = [];
        foreach ($screenshots as $index => $screenshot) {
            if (in_array($index, $removeIndexes, true)) {
                $path = is_array($screenshot) ? ($screenshot['path'] ?? null) : $screenshot;
                if ($path) {
                    Storage::disk('public')->delete($path);
                }
                continue;
            }

            $keptScreenshots[] = $screenshot;
        }

        $newScreenshotFiles = $request->file('screenshots', []);
        if (count($keptScreenshots) + count($newScreenshotFiles) > 8) {
            throw ValidationException::withMessages([
                'screenshots' => ['You can keep and upload a maximum of 8 screenshots.'],
            ]);
        }

        foreach ($newScreenshotFiles as $index => $screenshot) {
            $screenshotName = Str::slug($validated['app_name']) . '-screen-' . (count($keptScreenshots) + $index + 1) . '-' . Str::random(8) . '.' . $screenshot->getClientOriginalExtension();
            $screenshotPath = $screenshot->storeAs('developer-app-screenshots', $screenshotName, 'public');
            $keptScreenshots[] = [
                'path' => $screenshotPath,
                'size_bytes' => $screenshot->getSize() ?: 0,
            ];
        }

        $iconPath = $app->app_icon_path;
        $iconSize = $app->app_icon_size_bytes;
        if ($request->hasFile('app_icon')) {
            if ($app->app_icon_path) {
                Storage::disk('public')->delete($app->app_icon_path);
            }

            $icon = $request->file('app_icon');
            $iconName = Str::slug($validated['app_name']) . '-' . Str::random(8) . '.' . $icon->getClientOriginalExtension();
            $iconPath = $icon->storeAs('developer-app-icons', $iconName, 'public');
            $iconSize = $icon->getSize() ?: 0;
        }

        $app->update([
            'app_name' => trim($validated['app_name']),
            'app_description' => trim($validated['app_description'] ?? ''),
            'app_icon_path' => $iconPath,
            'screenshots' => $keptScreenshots,
            'app_icon_size_bytes' => $iconSize,
            'app_url' => trim($validated['app_url']),
            'environment' => $validated['environment'],
            'status' => 'pending',
            'admin_note' => null,
            'approved_at' => null,
        ]);

        return redirect()->route('developer.app-status')
            ->with('status', 'App updated. Admin approval is pending again.');
    }

    public function destroyApp(Request $request, DeveloperApp $app): RedirectResponse
    {
        $this->ensureDeveloperTablesExist();

        $developer = $this->currentDeveloper($request);
        if (! $developer) {
            return redirect()->route('auth.entry');
        }

        abort_unless((int) $app->developer_profile_id === (int) $developer->id, 403);

        if ($app->app_icon_path) {
            Storage::disk('public')->delete($app->app_icon_path);
        }

        foreach ($app->screenshots ?? [] as $screenshot) {
            $path = is_array($screenshot) ? ($screenshot['path'] ?? null) : $screenshot;
            if ($path) {
                Storage::disk('public')->delete($path);
            }
        }

        $appName = $app->app_name;
        $app->delete();

        return redirect()->route('developer.app-status')
            ->with('status', "{$appName} has been deleted.");
    }

    public function appReviews(Request $request, DeveloperApp $app): View|RedirectResponse
    {
        $this->ensureDeveloperTablesExist();

        $developer = $this->currentDeveloper($request);
        if (! $developer) {
            return redirect()->route('auth.entry');
        }

        abort_unless((int) $app->developer_profile_id === (int) $developer->id, 403);

        return view('pages.developer-app-reviews', [
            'developer' => $developer,
            'app' => $app->load(['reviews.user']),
        ]);
    }

    public function media(string $path): StreamedResponse
    {
        $path = $this->sanitizeMediaPath($path);

        abort_unless(
            str_starts_with($path, 'developer-app-icons/') || str_starts_with($path, 'developer-app-screenshots/'),
            404
        );

        abort_unless(Storage::disk('public')->exists($path), 404);

        return Storage::disk('public')->response($path);
    }

    private function currentDeveloper(Request $request): ?DeveloperProfile
    {
        $developerId = $request->session()->get('developer_id');
        if (! $developerId) {
            return null;
        }

        return DeveloperProfile::find($developerId);
    }

    private function ensureDeveloperTablesExist(): void
    {
        abort_unless(
            Schema::hasTable('developer_profiles') && Schema::hasTable('developer_apps'),
            503,
            'Developer portal tables are not migrated yet. Run php artisan migrate.'
        );
    }

    private function sanitizeMediaPath(string $path): string
    {
        $clean = str_replace('\\', '/', $path);
        $clean = preg_replace('#/+#', '/', $clean) ?? '';
        $segments = array_filter(explode('/', trim($clean, '/')), static function ($segment) {
            return $segment !== '' && $segment !== '.' && $segment !== '..';
        });

        return implode('/', $segments);
    }
}
