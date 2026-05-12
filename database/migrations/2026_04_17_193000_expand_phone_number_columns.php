<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Support\Facades\Schema;
use Illuminate\Database\Schema\Blueprint;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('users', function (Blueprint $table) {
            $table->string('phone_number', 15)->nullable()->change();
        });
        Schema::table('contacts', function (Blueprint $table) {
            $table->string('phone_number', 15)->change();
        });
    }

    public function down(): void
    {
        Schema::table('contacts', function (Blueprint $table) {
            $table->string('phone_number', 9)->change();
        });
        Schema::table('users', function (Blueprint $table) {
            $table->string('phone_number', 9)->nullable()->change();
        });
    }
};
