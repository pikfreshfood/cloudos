<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('devices', function (Blueprint $table) {
            if (! Schema::hasColumn('devices', 'storage_expires_at')) {
                $table->timestamp('storage_expires_at')->nullable()->after('storage');
            }
        });

        Schema::table('paystack_transactions', function (Blueprint $table) {
            if (! Schema::hasColumn('paystack_transactions', 'billing_period')) {
                $table->string('billing_period', 20)->default('yearly')->after('storage_mb');
            }

            if (! Schema::hasColumn('paystack_transactions', 'storage_expires_at')) {
                $table->timestamp('storage_expires_at')->nullable()->after('paid_at');
            }
        });
    }

    public function down(): void
    {
        Schema::table('paystack_transactions', function (Blueprint $table) {
            if (Schema::hasColumn('paystack_transactions', 'storage_expires_at')) {
                $table->dropColumn('storage_expires_at');
            }

            if (Schema::hasColumn('paystack_transactions', 'billing_period')) {
                $table->dropColumn('billing_period');
            }
        });

        Schema::table('devices', function (Blueprint $table) {
            if (Schema::hasColumn('devices', 'storage_expires_at')) {
                $table->dropColumn('storage_expires_at');
            }
        });
    }
};
