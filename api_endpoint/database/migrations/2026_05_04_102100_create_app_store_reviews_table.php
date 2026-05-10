<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('app_store_reviews', function (Blueprint $table) {
            $table->id();
            $table->foreignId('developer_app_id')->constrained('developer_apps')->cascadeOnDelete();
            $table->string('user_id');
            $table->string('device_id')->nullable();
            $table->unsignedTinyInteger('rating');
            $table->text('comment')->nullable();
            $table->timestamps();

            $table->unique(['developer_app_id', 'user_id', 'device_id'], 'app_review_user_device_unique');
            $table->index(['developer_app_id', 'rating']);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('app_store_reviews');
    }
};
