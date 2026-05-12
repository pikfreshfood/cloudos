<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Support\Facades\Schema;
use Illuminate\Database\Schema\Blueprint;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('users', function (Blueprint $table) {
            $table->string('phone_number', 50)->nullable()->change();
        });
        Schema::table('contacts', function (Blueprint $table) {
            $table->string('phone_number', 50)->change();
        });
    }

    public function down(): void
    {
        Schema::table('contacts', function (Blueprint $table) {
            $table->string('phone_number', 15)->change();
        });
        Schema::table('users', function (Blueprint $table) {
            $table->string('phone_number', 15)->nullable()->change();
        });
    }
};
