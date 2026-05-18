<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('devices', function (Blueprint $table) {
            $table->unsignedInteger('storage')->default(200)->change();
        });

        DB::table('devices')
            ->where('storage', 100)
            ->update(['storage' => 200]);
    }

    public function down(): void
    {
        Schema::table('devices', function (Blueprint $table) {
            $table->unsignedInteger('storage')->default(100)->change();
        });

        DB::table('devices')
            ->where('storage', 200)
            ->update(['storage' => 100]);
    }
};
