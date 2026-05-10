<?php

namespace Tests\Feature;

use App\Models\DeveloperApp;
use App\Models\DeveloperProfile;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;
use Tests\TestCase;

class AuthPageTest extends TestCase
{
    protected function setUp(): void
    {
        parent::setUp();

        Schema::dropIfExists('app_store_reviews');
        Schema::dropIfExists('developer_apps');
        Schema::dropIfExists('developer_profiles');

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
            $table->timestamp('email_verified_at')->nullable();
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

        Schema::create('app_store_reviews', function (Blueprint $table) {
            $table->id();
            $table->foreignId('developer_app_id')->constrained('developer_apps')->cascadeOnDelete();
            $table->string('user_id');
            $table->string('device_id')->nullable();
            $table->unsignedTinyInteger('rating');
            $table->text('comment')->nullable();
            $table->timestamps();
        });
    }

    protected function tearDown(): void
    {
        Schema::dropIfExists('app_store_reviews');
        Schema::dropIfExists('developer_apps');
        Schema::dropIfExists('developer_profiles');

        parent::tearDown();
    }

    public function test_login_register_page_loads(): void
    {
        $response = $this->get('/login-register');

        $response->assertOk();
        $response->assertSee('Cloud OS');
        $response->assertSee('Create developer account');
    }

    public function test_logged_in_developer_pages_load(): void
    {
        $developer = DeveloperProfile::create([
            'developer_name' => 'Cloud Builder',
            'company_name' => 'Cloud OS',
            'email' => 'builder@example.com',
            'password' => 'secret123',
            'test_api_key' => 'cm_test_123',
            'live_api_key' => 'cm_live_123',
        ]);

        $app = DeveloperApp::create([
            'developer_profile_id' => $developer->id,
            'app_name' => 'Sample Cloud App',
            'app_description' => 'A sample app for Cloud OS.',
            'app_url' => 'https://example.com/app.apk',
            'environment' => 'production',
            'status' => 'pending',
        ]);

        $this->withSession(['developer_id' => $developer->id])
            ->get('/developer/dashboard')
            ->assertOk()
            ->assertSee('Welcome back, Cloud Builder');

        $this->withSession(['developer_id' => $developer->id])
            ->get('/developer/upload-app')
            ->assertOk()
            ->assertSee('Submit app for review');

        $this->withSession(['developer_id' => $developer->id])
            ->get('/developer/app-status')
            ->assertOk()
            ->assertSee('Sample Cloud App');

        $this->withSession(['developer_id' => $developer->id])
            ->get("/developer/apps/{$app->id}/edit")
            ->assertOk()
            ->assertSee('Update Sample Cloud App');

        $this->withSession(['developer_id' => $developer->id])
            ->get("/developer/apps/{$app->id}/reviews")
            ->assertOk()
            ->assertSee('No reviews yet');

        $this->withSession(['developer_id' => $developer->id])
            ->get('/developer/documentation')
            ->assertOk()
            ->assertSee('Build for the Cloud OS mobile workspace');
    }
}
