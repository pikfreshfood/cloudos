<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    /**
     * Run the migrations.
     */
    public function up(): void
    {
        Schema::table('contacts', function (Blueprint $table) {
            $table->dropUnique(['user_id', 'phone_number']);
        });

        Schema::table('contacts', function (Blueprint $table) {
            $table->string('device_id')->nullable()->after('user_id');
            $table->index(['user_id', 'device_id']);
            $table->unique(['user_id', 'device_id', 'phone_number']);
        });
    }

    /**
     * Reverse the migrations.
     */
    public function down(): void
    {
        Schema::table('contacts', function (Blueprint $table) {
            $table->dropUnique(['user_id', 'device_id', 'phone_number']);
            $table->dropIndex(['user_id', 'device_id']);
            $table->dropColumn('device_id');
            $table->unique(['user_id', 'phone_number']);
        });
    }
};
