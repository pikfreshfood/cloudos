<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('app_updates', function (Blueprint $table) {
            $table->id();
            $table->string('title');
            $table->text('message');
            $table->enum('status', ['active', 'paused', 'deleted'])->default('active');
            $table->unsignedInteger('version_code')->default(1);
            $table->timestamps();
        });

        Schema::create('app_update_seen', function (Blueprint $table) {
            $table->id();
            $table->foreignId('app_update_id')->constrained()->onDelete('cascade');
            $table->foreignId('user_id')->constrained()->onDelete('cascade');
            $table->enum('action', ['seen', 'skipped', 'never_show'])->default('seen');
            $table->timestamps();
            
            $table->unique(['app_update_id', 'user_id']);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('app_update_seen');
        Schema::dropIfExists('app_updates');
    }
};
