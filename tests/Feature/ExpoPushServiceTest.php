<?php

namespace Tests\Feature;

use App\Services\ExpoPushService;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Http;
use Illuminate\Support\Facades\Schema;
use Tests\TestCase;

class ExpoPushServiceTest extends TestCase
{
    protected function setUp(): void
    {
        parent::setUp();

        Schema::dropIfExists('devices');
        Schema::dropIfExists('users');

        Schema::create('users', function (Blueprint $table) {
            $table->id();
            $table->string('name');
            $table->string('email')->unique();
            $table->string('password');
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
            $table->string('push_token', 255)->nullable()->index();
            $table->string('push_platform', 30)->nullable();
            $table->timestamps();
        });
    }

    protected function tearDown(): void
    {
        Schema::dropIfExists('devices');
        Schema::dropIfExists('users');

        parent::tearDown();
    }

    public function test_desktop_call_push_uses_cloud_call_url_not_phone_dialer_number(): void
    {
        config(['app.url' => 'https://cloudos.ng']);
        Http::fake([
            'https://exp.host/*' => Http::response(['data' => ['status' => 'ok']], 200),
        ]);

        $userId = \DB::table('users')->insertGetId([
            'name' => 'Mobile User',
            'email' => 'mobile@example.test',
            'password' => 'secret',
            'created_at' => now(),
            'updated_at' => now(),
        ]);

        \DB::table('devices')->insert([
            'user_id' => $userId,
            'device_id' => 'android-device',
            'name' => 'Android',
            'os' => 'android',
            'phone_number' => '07061080002',
            'storage' => 200,
            'push_token' => 'ExponentPushToken[test-token]',
            'push_platform' => 'android',
            'created_at' => now(),
            'updated_at' => now(),
        ]);

        app(ExpoPushService::class)->sendCallNotification(
            '07061080002',
            'win-pc-00001-1234',
            'video'
        );

        Http::assertSent(function ($request) {
            $payload = $request->data();
            $data = $payload['data'] ?? [];

            return $payload['to'] === 'ExponentPushToken[test-token]'
                && $data['kind'] === 'cloudos_webrtc_call'
                && $data['callerPhoneNumber'] === ''
                && $data['callerDeviceNumber'] === 'winpc000011234'
                && $data['receiverDeviceNumber'] === '07061080002'
                && $data['useSystemDialer'] === false
                && str_contains($data['callUrl'], '/device-call?')
                && str_contains($data['callUrl'], 'target=winpc000011234');
        });
    }
}
