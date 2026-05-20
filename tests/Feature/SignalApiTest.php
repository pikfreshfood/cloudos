<?php

namespace Tests\Feature;

use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;
use Tests\TestCase;

class SignalApiTest extends TestCase
{
    protected function setUp(): void
    {
        parent::setUp();

        Schema::dropIfExists('signals');
        Schema::create('signals', function (Blueprint $table) {
            $table->id();
            $table->string('sender_phone_number');
            $table->string('receiver_phone_number');
            $table->string('type');
            $table->longText('data');
            $table->timestamps();
        });
    }

    protected function tearDown(): void
    {
        Schema::dropIfExists('signals');

        parent::tearDown();
    }

    public function test_signal_peek_does_not_delete_but_receive_does(): void
    {
        $this->postJson('/api/signals', [
            'type' => 'send',
            'sender' => '07061080001',
            'receiver' => '07061080002',
            'signalType' => 'offer',
            'data' => json_encode(['sdp' => 'sample']),
        ])->assertOk()
            ->assertJsonPath('message', 'sent');

        $this->postJson('/api/signals', [
            'type' => 'peek',
            'user' => '07061080002',
        ])->assertOk()
            ->assertJsonCount(1);

        $this->postJson('/api/signals', [
            'type' => 'receive',
            'user' => '07061080002',
        ])->assertOk()
            ->assertJsonCount(1);

        $this->postJson('/api/signals', [
            'type' => 'receive',
            'user' => '07061080002',
        ])->assertOk()
            ->assertJsonCount(0);
    }

    public function test_signal_accepts_desktop_device_numbers(): void
    {
        $this->postJson('/api/signals', [
            'type' => 'send',
            'sender' => 'win-pc-00001-1234',
            'receiver' => 'mac-pc-00001-4321',
            'signalType' => 'offer',
            'data' => json_encode(['callType' => 'video']),
        ])->assertOk()
            ->assertJsonPath('message', 'sent');

        $this->postJson('/api/signals', [
            'type' => 'peek',
            'user' => 'mac-pc-00001-4321',
        ])->assertOk()
            ->assertJsonPath('0.sender', 'win-pc-00001-1234')
            ->assertJsonPath('0.receiver', 'mac-pc-00001-4321')
            ->assertJsonPath('0.kind', 'cloudos_webrtc_call')
            ->assertJsonPath('0.action', 'open_cloudos_call')
            ->assertJsonPath('0.sender_phone_number', 'win-pc-00001-1234')
            ->assertJsonPath('0.callerPhoneNumber', 'win-pc-00001-1234')
            ->assertJsonPath('0.phoneNumber', 'win-pc-00001-1234')
            ->assertJsonPath('0.callerDeviceNumber', 'win-pc-00001-1234')
            ->assertJsonPath('0.callerDeviceNumberNormalized', 'winpc000011234')
            ->assertJsonPath('0.useSystemDialer', false)
            ->assertJsonPath('0.isCloudOsCall', true)
            ->assertJsonPath('0.callType', 'video');
    }

    public function test_signal_can_be_received_with_stripped_desktop_device_number(): void
    {
        $this->postJson('/api/signals', [
            'type' => 'send',
            'sender' => 'win-pc-00001-1234',
            'receiver' => 'mac-pc-00001-4321',
            'signalType' => 'offer',
            'data' => json_encode(['callType' => 'voice']),
        ])->assertOk();

        $this->postJson('/api/signals', [
            'type' => 'peek',
            'user' => 'macpc000014321',
        ])->assertOk()
            ->assertJsonPath('0.sender', 'win-pc-00001-1234')
            ->assertJsonPath('0.receiver', 'mac-pc-00001-4321')
            ->assertJsonPath('0.callType', 'voice');
    }

    public function test_signal_can_be_received_when_mobile_sends_digit_only_desktop_number(): void
    {
        $this->postJson('/api/signals', [
            'type' => 'send',
            'sender' => '07061080002',
            'receiver' => '000017546',
            'signalType' => 'offer',
            'data' => json_encode(['callType' => 'video']),
        ])->assertOk();

        $this->postJson('/api/signals', [
            'type' => 'peek',
            'user' => 'win-pc-00001-7546',
        ])->assertOk()
            ->assertJsonPath('0.sender', '07061080002')
            ->assertJsonPath('0.receiver', '000017546')
            ->assertJsonPath('0.callType', 'video');
    }
}
