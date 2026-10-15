<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('scores', function (Blueprint $table) {
            $table->id();
            $table->foreignId('user_id')->constrained()->cascadeOnDelete();
            $table->unsignedInteger('score');
            $table->unsignedInteger('lines');
            $table->unsignedInteger('level');
            $table->timestamps();

            // Leaderboard reads are "top N by score"; per-user best is
            // "top 1 for this user" — both served by these.
            $table->index(['score']);
            $table->index(['user_id', 'score']);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('scores');
    }
};
