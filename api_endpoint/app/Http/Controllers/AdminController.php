<?php

namespace App\Http\Controllers;

use App\Models\AdminAccount;
use App\Models\DeveloperApp;
use App\Models\DeveloperProfile;
use App\Models\SupportMessage;
use App\Models\User;
use Illuminate\Http\RedirectResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Hash;
use Illuminate\Support\Facades\Schema;
use Illuminate\Validation\ValidationException;
use Illuminate\View\View;

class AdminController extends Controller
{
    public function loginForm(Request $request): View|RedirectResponse
    {
        if ($this->isLoggedIn($request)) {
            return redirect()->route('admin.dashboard');
        }

        return view('admin.login');
    }

    public function login(Request $request): RedirectResponse
    {
        $validated = $request->validate([
            'email' => ['required', 'email'],
            'password' => ['required', 'string'],
        ]);

        $admin = $this->adminAccount();

        if (
            strtolower(trim($validated['email'])) !== strtolower($admin->email) ||
            ! Hash::check($validated['password'], $admin->password) ||
            ($admin->status ?? 'active') !== 'active'
        ) {
            throw ValidationException::withMessages([
                'email' => ['Invalid admin login details.'],
            ]);
        }

        $request->session()->put('admin_logged_in', true);
        $request->session()->put('admin_id', $admin->id);
        $request->session()->put('admin_role', $admin->role ?? 'super_admin');

        return redirect()->route('admin.dashboard');
    }

    public function logout(Request $request): RedirectResponse
    {
        $request->session()->forget('admin_logged_in');

        return redirect()->route('admin.login');
    }

    public function dashboard(Request $request): View|RedirectResponse
    {
        if (! $this->isLoggedIn($request)) {
            return redirect()->route('admin.login');
        }

        return view('admin.dashboard', [
            'stats' => $this->stats(),
            'recentApps' => DeveloperApp::with('developer')->latest()->limit(6)->get(),
        ]);
    }

    public function admins(Request $request): View|RedirectResponse
    {
        if (! $this->isLoggedIn($request)) {
            return redirect()->route('admin.login');
        }

        return view('admin.admins', [
            'admins' => AdminAccount::latest()->get(),
            'roles' => $this->adminRoles(),
        ]);
    }

    public function storeAdmin(Request $request): RedirectResponse
    {
        if (! $this->isLoggedIn($request)) {
            return redirect()->route('admin.login');
        }

        $validated = $request->validate([
            'name' => ['required', 'string', 'max:255'],
            'email' => ['required', 'email', 'max:255', 'unique:admin_accounts,email'],
            'password' => ['required', 'string', 'min:6', 'confirmed'],
            'role' => ['required', 'in:' . implode(',', array_keys($this->adminRoles()))],
        ]);

        AdminAccount::create([
            'name' => trim($validated['name']),
            'email' => strtolower(trim($validated['email'])),
            'password' => Hash::make($validated['password']),
            'role' => $validated['role'],
            'status' => 'active',
        ]);

        return redirect()->route('admin.admins')
            ->with('status', 'New admin account created.');
    }

    public function updateAdmin(Request $request, AdminAccount $admin): RedirectResponse
    {
        if (! $this->isLoggedIn($request)) {
            return redirect()->route('admin.login');
        }

        $validated = $request->validate([
            'name' => ['required', 'string', 'max:255'],
            'role' => ['required', 'in:' . implode(',', array_keys($this->adminRoles()))],
            'status' => ['required', 'in:active,inactive'],
        ]);

        $admin->update($validated);

        return redirect()->route('admin.admins')
            ->with('status', 'Admin account updated.');
    }

    public function users(Request $request): View|RedirectResponse
    {
        if (! $this->isLoggedIn($request)) {
            return redirect()->route('admin.login');
        }

        return view('admin.users', [
            'stats' => $this->stats(),
            'users' => User::latest()->get(),
        ]);
    }

    public function developers(Request $request): View|RedirectResponse
    {
        if (! $this->isLoggedIn($request)) {
            return redirect()->route('admin.login');
        }

        return view('admin.developers', [
            'stats' => $this->stats(),
            'developers' => DeveloperProfile::withCount('apps')->latest()->get(),
        ]);
    }

    public function apps(Request $request): View|RedirectResponse
    {
        if (! $this->isLoggedIn($request)) {
            return redirect()->route('admin.login');
        }

        return view('admin.apps', [
            'stats' => $this->stats(),
            'apps' => DeveloperApp::with('developer')->latest()->get(),
        ]);
    }

    public function support(Request $request): View|RedirectResponse
    {
        if (! $this->isLoggedIn($request)) {
            return redirect()->route('admin.login');
        }

        return view('admin.support', [
            'stats' => $this->stats(),
            'messages' => SupportMessage::latest()->get(),
        ]);
    }

    public function payments(Request $request): View|RedirectResponse
    {
        if (! $this->isLoggedIn($request)) {
            return redirect()->route('admin.login');
        }

        $query = \App\Models\PaystackTransaction::with('user');

        if ($request->has('status') && $request->status !== '') {
            $query->where('status', $request->status);
        }

        if ($request->has('search') && $request->search !== '') {
            $search = $request->search;
            $query->where(function ($q) use ($search) {
                $q->where('reference', 'like', "%{$search}%")
                  ->orWhere('email', 'like', "%{$search}%")
                  ->orWhere('device_name', 'like', "%{$search}%")
                  ->orWhereHas('user', function ($q) use ($search) {
                      $q->where('name', 'like', "%{$search}%");
                  });
            });
        }

        if ($request->has('date_from') && $request->date_from !== '') {
            $query->whereDate('created_at', '>=', $request->date_from);
        }

        if ($request->has('date_to') && $request->date_to !== '') {
            $query->whereDate('created_at', '<=', $request->date_to);
        }

        $transactions = $query->latest()->paginate(20)->withQueryString();

        return view('admin.payments', [
            'stats' => $this->stats(),
            'transactions' => $transactions,
            'filters' => $request->only(['status', 'search', 'date_from', 'date_to']),
        ]);
    }

    public function updates(Request $request): View|RedirectResponse
    {
        if (! $this->isLoggedIn($request)) {
            return redirect()->route('admin.login');
        }

        $updates = [];
        try {
            if (Schema::hasTable('app_updates')) {
                $updates = \App\Models\AppUpdate::withCount('seenByUsers')->latest()->get();
            }
        } catch (\Exception $e) {
            // Table doesn't exist yet
        }

        return view('admin.updates', [
            'stats' => $this->stats(),
            'updates' => $updates,
        ]);
    }

    public function storeUpdate(Request $request): RedirectResponse
    {
        if (! $this->isLoggedIn($request)) {
            return redirect()->route('admin.login');
        }

        $validated = $request->validate([
            'title' => ['required', 'string', 'max:255'],
            'message' => ['required', 'string'],
        ]);

        try {
            if (Schema::hasTable('app_updates')) {
                $latestUpdate = \App\Models\AppUpdate::latest()->first();
                $nextVersion = $latestUpdate ? $latestUpdate->version_code + 1 : 1;

                \App\Models\AppUpdate::create([
                    'title' => $validated['title'],
                    'message' => $validated['message'],
                    'status' => 'active',
                    'version_code' => $nextVersion,
                ]);

                return redirect()->route('admin.updates')
                    ->with('status', 'App update pushed successfully!');
            }
        } catch (\Exception $e) {
            // Table doesn't exist yet
        }

        return redirect()->route('admin.updates')
            ->with('error', 'Please run the database migration first: php artisan migrate');
    }

    public function updateUpdateStatus(Request $request, \App\Models\AppUpdate $update): RedirectResponse
    {
        if (! $this->isLoggedIn($request)) {
            return redirect()->route('admin.login');
        }

        $validated = $request->validate([
            'status' => ['required', 'in:active,paused,deleted'],
        ]);

        $update->update(['status' => $validated['status']]);

        return redirect()->route('admin.updates')
            ->with('status', 'Update status changed successfully!');
    }

    public function deleteUpdate(Request $request, \App\Models\AppUpdate $update): RedirectResponse
    {
        if (! $this->isLoggedIn($request)) {
            return redirect()->route('admin.login');
        }

        $update->update(['status' => 'deleted']);

        return redirect()->route('admin.updates')
            ->with('status', 'Update marked as deleted!');
    }

    public function updateSupportStatus(Request $request, SupportMessage $message): RedirectResponse
    {
        if (! $this->isLoggedIn($request)) {
            return redirect()->route('admin.login');
        }

        $validated = $request->validate([
            'status' => ['required', 'in:open,in_progress,closed'],
        ]);

        $message->update($validated);

        return redirect()->route('admin.support')
            ->with('status', 'Support message status updated.');
    }

    public function changePasswordForm(Request $request): View|RedirectResponse
    {
        if (! $this->isLoggedIn($request)) {
            return redirect()->route('admin.login');
        }

        return view('admin.change-password');
    }

    public function changePassword(Request $request): RedirectResponse
    {
        if (! $this->isLoggedIn($request)) {
            return redirect()->route('admin.login');
        }

        $validated = $request->validate([
            'current_password' => ['required', 'string'],
            'password' => ['required', 'string', 'min:6', 'confirmed'],
        ]);

        $admin = AdminAccount::find($request->session()->get('admin_id')) ?? $this->adminAccount();

        if (! Hash::check($validated['current_password'], $admin->password)) {
            throw ValidationException::withMessages([
                'current_password' => ['Current password is incorrect.'],
            ]);
        }

        $admin->update([
            'password' => Hash::make($validated['password']),
        ]);

        return redirect()->route('admin.change-password')
            ->with('status', 'Admin password changed successfully.');
    }

    public function updateAppStatus(Request $request, DeveloperApp $app): RedirectResponse
    {
        if (! $this->isLoggedIn($request)) {
            return redirect()->route('admin.login');
        }

        $validated = $request->validate([
            'status' => ['required', 'in:pending,approved,rejected'],
            'admin_note' => ['nullable', 'string', 'max:2000'],
        ]);

        $app->update([
            'status' => $validated['status'],
            'admin_note' => $validated['admin_note'] ?? null,
            'approved_at' => $validated['status'] === 'approved' ? now() : null,
        ]);

        return redirect()->route('admin.apps')
            ->with('status', 'App status updated.');
    }

    private function isLoggedIn(Request $request): bool
    {
        return (bool) $request->session()->get('admin_logged_in');
    }

    private function stats(): array
    {
        $appDownloads = 0;
        try {
            if (Schema::hasTable('app_downloads')) {
                $appDownloads = \App\Models\AppDownload::count();
            }
        } catch (\Exception $e) {
            // Table doesn't exist yet
        }

        $totalPaidKobo = \App\Models\PaystackTransaction::where('status', 'success')->sum('amount_kobo');
        $totalPaidNgn = (int) ($totalPaidKobo / 100);

        return [
            'registered_users' => User::count(),
            'registered_developers' => DeveloperProfile::count(),
            'total_apps' => DeveloperApp::count(),
            'pending_apps' => DeveloperApp::where('status', 'pending')->count(),
            'approved_apps' => DeveloperApp::where('status', 'approved')->count(),
            'rejected_apps' => DeveloperApp::where('status', 'rejected')->count(),
            'support_open' => SupportMessage::where('status', 'open')->count(),
            'app_downloads' => $appDownloads,
            'total_paid_ngn' => $totalPaidNgn,
        ];
    }

    private function adminAccount(): AdminAccount
    {
        return AdminAccount::firstOrCreate(
            ['email' => env('ADMIN_EMAIL', 'admin@cloudos.app')],
            [
                'name' => 'Cloud OS Admin',
                'password' => Hash::make(env('ADMIN_PASSWORD', 'admin123')),
                'role' => 'super_admin',
                'status' => 'active',
            ]
        );
    }

    private function adminRoles(): array
    {
        return [
            'super_admin' => 'Super Admin',
            'app_reviewer' => 'App Reviewer',
            'support_admin' => 'Support Admin',
            'viewer' => 'Viewer',
        ];
    }
}
