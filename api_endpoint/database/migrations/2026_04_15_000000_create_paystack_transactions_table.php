<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
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
    }

    public function down(): void
    {
        Schema::dropIfExists('paystack_transactions');
    }
};
