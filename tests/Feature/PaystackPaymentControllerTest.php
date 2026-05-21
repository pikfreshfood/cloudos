<?php

namespace Tests\Feature;

use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Http;
use Illuminate\Support\Facades\Schema;
use Tests\TestCase;

class PaystackPaymentControllerTest extends TestCase
{
    protected function setUp(): void
    {
        parent::setUp();

        Schema::dropIfExists('paystack_transactions');
    }

    protected function tearDown(): void
    {
        Schema::dropIfExists('paystack_transactions');

        parent::tearDown();
    }

    public function test_initialize_repairs_old_paystack_table_before_insert(): void
    {
        config([
            'services.paystack.public_key' => 'pk_test_key',
            'services.paystack.secret_key' => 'sk_test_key',
            'services.paystack.base_url' => 'https://api.paystack.test',
        ]);

        Schema::create('paystack_transactions', function (Blueprint $table) {
            $table->id();
            $table->string('reference')->unique();
            $table->string('email');
            $table->string('user_id');
            $table->string('device_id');
            $table->string('device_name');
            $table->unsignedInteger('storage_mb');
            $table->unsignedInteger('amount_kobo');
            $table->string('status')->default('initialized');
            $table->text('authorization_url')->nullable();
            $table->string('access_code')->nullable();
            $table->text('callback_url')->nullable();
            $table->json('metadata')->nullable();
            $table->json('verified_payload')->nullable();
            $table->timestamp('paid_at')->nullable();
            $table->timestamps();
        });

        $this->assertFalse(Schema::hasColumn('paystack_transactions', 'billing_period'));

        Http::fake([
            'https://api.paystack.test/transaction/initialize' => Http::response([
                'status' => true,
                'message' => 'Authorization URL created',
                'data' => [
                    'authorization_url' => 'https://checkout.paystack.test/pay/test',
                    'access_code' => 'access-code',
                    'reference' => 'ignored',
                ],
            ]),
        ]);

        $this->postJson('/api/payments/paystack/initialize', [
            'email' => 'user@example.test',
            'user_id' => '1',
            'device_id' => 'android-device',
            'device_name' => 'Android Cloud OS',
            'storage_mb' => 2048,
            'mobile_callback_url' => 'https://cloudos.ng/paystack/mobile/callback',
        ])->assertOk()
            ->assertJsonPath('billing_period', 'yearly')
            ->assertJsonPath('amount_ngn', 500);

        $this->assertTrue(Schema::hasColumn('paystack_transactions', 'billing_period'));
        $this->assertTrue(Schema::hasColumn('paystack_transactions', 'storage_expires_at'));
        $this->assertDatabaseHas('paystack_transactions', [
            'email' => 'user@example.test',
            'billing_period' => 'yearly',
            'storage_mb' => 2048,
            'amount_kobo' => 50000,
            'status' => 'initialized',
        ]);
    }
}
