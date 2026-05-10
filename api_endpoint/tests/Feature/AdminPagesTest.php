<?php

namespace Tests\Feature;

use App\Models\AdminAccount;
use App\Models\DeveloperApp;
use App\Models\DeveloperProfile;
use App\Models\SupportMessage;
use App\Models\User;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Hash;
use Illuminate\Support\Facades\Schema;
use Tests\TestCase;

class AdminPagesTest extends TestCase
{
    protected function setUp(): void
    {
        parent::setUp();

        Schema::dropIfExists('support_messages');
        Schema::dropIfExists('developer_apps');
        Schema::dropIfExists('developer_profiles');
        Schema::dropIfExists('admin_accounts');
        Schema::dropIfExists('users');

        Schema::create('users', function (Blueprint $table) {
            $table->id();
            $table->string('name');
            $table->string('username')->nullable()->unique();
            $table->string('email')->unique();
            $table->string('phone_number')->nullable()->unique();
            $table->string('password');
            $table->timestamps();
        });

        Schema::create('admin_accounts', function (Blueprint $table) {
            $table->id();
            $table->string('name');
            $table->string('email')->unique();
            $table->string('password');
            $table->string('role')->default('super_admin');
            $table->string('status')->default('active');
            $table->timestamps();
        });

        Schema::create('developer_profiles', function (Blueprint $table) {
            $table->id();
            $table->string('developer_name');
            $table->string('company_name')->nullable();
            $table->string('email')->unique();
            $table->string('password');
            $table->string('app_category')->nullable();
            $table->text('app_summary')->nullable();
            $table->string('test_api_key', 80)->unique();
            $table->string('live_api_key', 80)->unique();
            $table->string('status')->default('active');
            $table->timestamps();
        });

        Schema::create('developer_apps', function (Blueprint $table) {
            $table->id();
            $table->foreignId('developer_profile_id')->constrained('developer_profiles')->cascadeOnDelete();
            $table->string('app_name');
            $table->text('app_description')->nullable();
            $table->string('app_icon_path')->nullable();
            $table->json('screenshots')->nullable();
            $table->unsignedBigInteger('app_icon_size_bytes')->default(0);
            $table->string('app_url', 1200);
            $table->string('environment')->default('production');
            $table->string('status')->default('pending');
            $table->text('admin_note')->nullable();
            $table->timestamp('approved_at')->nullable();
            $table->timestamps();
        });

        Schema::create('support_messages', function (Blueprint $table) {
            $table->id();
            $table->string('name');
            $table->string('email');
            $table->string('topic');
            $table->text('message');
            $table->string('status')->default('open');
            $table->timestamps();
        });
    }

    protected function tearDown(): void
    {
        Schema::dropIfExists('support_messages');
        Schema::dropIfExists('developer_apps');
        Schema::dropIfExists('developer_profiles');
        Schema::dropIfExists('admin_accounts');
        Schema::dropIfExists('users');

        parent::tearDown();
    }

    public function test_admin_login_and_pages_load(): void
    {
        $admin = AdminAccount::create([
            'name' => 'Cloud OS Admin',
            'email' => 'admin@cloudos.app',
            'password' => Hash::make('admin123'),
            'role' => 'super_admin',
            'status' => 'active',
        ]);

        User::create([
            'name' => 'Mobile User',
            'username' => 'mobileuser',
            'email' => 'mobile@example.com',
            'phone_number' => '07061082286',
            'password' => 'password',
        ]);

        $developer = DeveloperProfile::create([
            'developer_name' => 'Cloud Builder',
            'company_name' => 'Cloud OS',
            'email' => 'builder@example.com',
            'password' => 'secret123',
            'test_api_key' => 'cm_test_admin',
            'live_api_key' => 'cm_live_admin',
        ]);

        DeveloperApp::create([
            'developer_profile_id' => $developer->id,
            'app_name' => 'Sample Cloud App',
            'app_url' => 'https://example.com/app.apk',
            'environment' => 'production',
            'status' => 'pending',
        ]);

        SupportMessage::create([
            'name' => 'Support User',
            'email' => 'support@example.com',
            'topic' => 'Help',
            'message' => 'I need help.',
        ]);

        $this->get('/admin')->assertRedirect('/admin/dashboard');
        $this->get('/admin/login')->assertOk()->assertSee('Admin Login');

        $this->post('/admin/login', [
            'email' => 'admin@cloudos.app',
            'password' => 'admin123',
        ])->assertRedirect(route('admin.dashboard'));

        foreach ([
            '/admin/dashboard' => 'Recent App Submissions',
            '/admin/users' => 'Registered Users',
            '/admin/developers' => 'Developer Accounts',
            '/admin/apps' => 'App Review Queue',
            '/admin/support' => 'Support Messages',
            '/admin/admins' => 'Existing Admins',
            '/admin/change-password' => 'Change Admin Password',
        ] as $path => $text) {
            $this->withSession([
                'admin_logged_in' => true,
                'admin_id' => $admin->id,
                'admin_role' => 'super_admin',
            ])->get($path)->assertOk()->assertSee($text);
        }
    }
}
