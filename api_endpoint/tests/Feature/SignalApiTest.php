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
}
