<?php

namespace Tests\Feature;

use App\Models\User;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Http\UploadedFile;
use Illuminate\Support\Facades\Schema;
use Illuminate\Support\Facades\Storage;
use Tests\TestCase;

class FileShareTest extends TestCase
{
    protected function setUp(): void
    {
        parent::setUp();

        Schema::dropIfExists('users');
        Schema::create('users', function (Blueprint $table) {
            $table->id();
            $table->string('name');
            $table->string('username')->nullable()->unique();
            $table->string('email')->unique();
            $table->string('phone_number')->nullable()->unique();
            $table->timestamp('email_verified_at')->nullable();
            $table->string('password');
            $table->rememberToken();
            $table->timestamps();
        });
    }

    protected function tearDown(): void
    {
        Schema::dropIfExists('users');

        parent::tearDown();
    }

    public function test_file_can_be_shared_to_another_local_device_for_the_same_user(): void
    {
        Storage::fake('local');

        $user = User::factory()->create([
            'name' => 'Test User',
            'username' => 'testuser',
            'phone_number' => '08011111111',
        ]);

        $sourcePath = "uploads/{$user->id}/android-device/document.txt";
        Storage::disk('local')->put($sourcePath, 'hello');

        $response = $this->postJson('/api/files/share', [
            'user_id' => (string) $user->id,
            'device_id' => 'android-device',
            'recipient_phone_number' => '08011112222',
            'recipient_user_id' => $user->id,
            'recipient_device_id' => 'ios-device',
            'recipient_device_storage' => 200,
            'items' => [
                [
                    'path' => $sourcePath,
                    'type' => 'file',
                    'name' => 'document.txt',
                ],
            ],
        ]);

        $response->assertOk()
            ->assertJsonPath('message', 'Successfully shared 1 item(s) with Test User.');

        Storage::disk('local')->assertExists(
            "uploads/{$user->id}/ios-device/Shared with me/From Test User/document.txt"
        );
    }

    public function test_file_share_rejects_current_device_as_the_recipient(): void
    {
        Storage::fake('local');

        $user = User::factory()->create([
            'username' => 'testuser',
            'phone_number' => '08011111111',
        ]);

        $sourcePath = "uploads/{$user->id}/android-device/document.txt";
        Storage::disk('local')->put($sourcePath, 'hello');

        $response = $this->postJson('/api/files/share', [
            'user_id' => (string) $user->id,
            'device_id' => 'android-device',
            'recipient_phone_number' => '08011111111',
            'recipient_user_id' => $user->id,
            'recipient_device_id' => 'android-device',
            'items' => [
                [
                    'path' => $sourcePath,
                    'type' => 'file',
                    'name' => 'document.txt',
                ],
            ],
        ]);

        $response->assertStatus(422)
            ->assertJsonPath('message', 'Choose another device, not the current device.');
    }

    public function test_file_manager_upload_stores_file(): void
    {
        Storage::fake('local');

        $response = $this->postJson('/api/files/upload', [
            'user_id' => 'cloud-user',
            'device_id' => 'android-device',
            'folder_path' => 'Camera',
            'file' => UploadedFile::fake()->image('photo.jpg', 120, 120),
        ]);

        $response->assertCreated()
            ->assertJsonPath('message', 'File uploaded successfully.')
            ->assertJsonPath('file.folder_path', 'Camera');

        Storage::disk('local')->assertExists('uploads/cloud-user/android-device/Camera/photo.jpg');
    }

    public function test_file_manager_can_create_folder(): void
    {
        Storage::fake('local');

        $response = $this->postJson('/api/files/folders', [
            'user_id' => 'cloud-user',
            'device_id' => 'android-device',
            'folder_path' => '',
            'name' => 'Documents',
        ]);

        $response->assertCreated()
            ->assertJsonPath('message', 'Folder created successfully.')
            ->assertJsonPath('folder.folder_path', 'Documents');

        Storage::disk('local')->assertExists('uploads/cloud-user/android-device/Documents');
    }
}
