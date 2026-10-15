<?php

namespace Tests\Feature;

use App\Models\Score;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

class ScoreTest extends TestCase
{
    use RefreshDatabase;

    public function test_guest_cannot_save_a_score(): void
    {
        $this->postJson('/scores', ['score' => 100, 'lines' => 1, 'level' => 1])
            ->assertUnauthorized();

        $this->assertDatabaseCount('scores', 0);
    }

    public function test_logged_in_user_can_save_a_score_and_gets_their_best_back(): void
    {
        $user = User::factory()->create();
        Score::create(['user_id' => $user->id, 'score' => 5000, 'lines' => 20, 'level' => 3]);

        $this->actingAs($user)
            ->postJson('/scores', ['score' => 1200, 'lines' => 8, 'level' => 1])
            ->assertCreated()
            ->assertJson(['saved' => true, 'best' => 5000, 'is_best' => false]);

        $this->actingAs($user)
            ->postJson('/scores', ['score' => 9000, 'lines' => 40, 'level' => 5])
            ->assertCreated()
            ->assertJson(['best' => 9000, 'is_best' => true]);

        $this->assertDatabaseCount('scores', 3);
    }

    public function test_score_payload_is_validated(): void
    {
        $this->actingAs(User::factory()->create())
            ->postJson('/scores', ['score' => -1, 'lines' => 'x'])
            ->assertUnprocessable()
            ->assertJsonValidationErrors(['score', 'lines', 'level']);
    }

    public function test_home_shows_leaderboard_and_personal_best(): void
    {
        $alice = User::factory()->create(['name' => 'Alice']);
        $bob = User::factory()->create(['name' => 'Bob']);
        Score::create(['user_id' => $alice->id, 'score' => 3000, 'lines' => 12, 'level' => 2]);
        Score::create(['user_id' => $bob->id, 'score' => 7000, 'lines' => 30, 'level' => 4]);
        Score::create(['user_id' => $alice->id, 'score' => 4500, 'lines' => 18, 'level' => 2]);

        $this->get('/')->assertOk()->assertSeeInOrder(['Bob', '7,000', 'Alice', '4,500', 'Alice', '3,000']);

        $this->actingAs($alice)->get('/')
            ->assertOk()
            ->assertSee('id="best">4500', false);
    }
}
