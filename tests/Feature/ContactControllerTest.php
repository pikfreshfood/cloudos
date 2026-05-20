<?php

namespace Tests\Feature;

use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;
use Tests\TestCase;

class ContactControllerTest extends TestCase
{
    protected function setUp(): void
    {
        parent::setUp();

        Schema::dropIfExists('contacts');
        Schema::dropIfExists('devices');
        Schema::dropIfExists('users');

        Schema::create('users', function (Blueprint $table) {
            $table->id();
            $table->string('name');
            $table->string('email')->unique();
            $table->string('password');
            $table->string('phone_number', 50)->nullable()->unique();
            $table->timestamps();
        });

        Schema::create('devices', function (Blueprint $table) {
            $table->id();
            $table->foreignId('user_id')->constrained()->cascadeOnDelete();
            $table->string('device_id');
            $table->string('name')->nullable();
            $table->string('os', 30)->nullable();
            $table->string('phone_number', 50)->nullable()->unique();
            $table->unsignedInteger('storage')->default(200);
            $table->timestamp('storage_expires_at')->nullable();
            $table->timestamps();
        });

        Schema::create('contacts', function (Blueprint $table) {
            $table->id();
            $table->foreignId('user_id')->constrained()->cascadeOnDelete();
            $table->string('device_id')->nullable();
            $table->foreignId('contact_user_id')->nullable()->constrained('users')->nullOnDelete();
            $table->string('name');
            $table->string('phone_number', 50);
            $table->timestamps();

            $table->unique(['user_id', 'device_id', 'phone_number']);
        });
    }

    protected function tearDown(): void
    {
        Schema::dropIfExists('contacts');
        Schema::dropIfExists('devices');
        Schema::dropIfExists('users');

        parent::tearDown();
    }

    public function test_lookup_resolves_stripped_desktop_device_number(): void
    {
        $userId = DB::table('users')->insertGetId([
            'name' => 'Desktop Owner',
            'email' => 'desktop@example.test',
            'password' => 'secret',
            'phone_number' => '07061080001',
            'created_at' => now(),
            'updated_at' => now(),
        ]);

        DB::table('devices')->insert([
            'user_id' => $userId,
            'device_id' => 'win-pc-00001-7546',
            'name' => 'Windows PC',
            'os' => 'windows',
            'phone_number' => 'win-pc-00001-7546',
            'storage' => 200,
            'created_at' => now(),
            'updated_at' => now(),
        ]);

        $this->getJson('/api/contacts/lookup?phone_number=000017546')
            ->assertOk()
            ->assertJsonPath('device.phone_number', 'win-pc-00001-7546')
            ->assertJsonPath('device.device_id', 'win-pc-00001-7546')
            ->assertJsonPath('user.id', (string) $userId);
    }

    public function test_store_preserves_linked_desktop_device_number(): void
    {
        $ownerId = DB::table('users')->insertGetId([
            'name' => 'Mobile Owner',
            'email' => 'mobile-owner@example.test',
            'password' => 'secret',
            'phone_number' => '07061080002',
            'created_at' => now(),
            'updated_at' => now(),
        ]);

        $desktopOwnerId = DB::table('users')->insertGetId([
            'name' => 'Desktop Owner',
            'email' => 'desktop-owner@example.test',
            'password' => 'secret',
            'phone_number' => '07061080001',
            'created_at' => now(),
            'updated_at' => now(),
        ]);

        DB::table('devices')->insert([
            'user_id' => $desktopOwnerId,
            'device_id' => 'win-pc-00001-7546',
            'name' => 'Windows PC',
            'os' => 'windows',
            'phone_number' => 'win-pc-00001-7546',
            'storage' => 200,
            'created_at' => now(),
            'updated_at' => now(),
        ]);

        $this->postJson('/api/contacts', [
            'user_id' => $ownerId,
            'device_id' => 'android-device',
            'name' => 'My PC',
            'phone_number' => '000017546',
        ])->assertCreated()
            ->assertJsonPath('contact.phone_number', 'win-pc-00001-7546')
            ->assertJsonPath('contact.linked_device.phone_number', 'win-pc-00001-7546');
    }
}
