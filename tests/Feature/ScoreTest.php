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
            ->assertJson(['saved' => true, 'mode' => 'marathon', 'best' => 5000, 'is_best' => false]);

        $this->actingAs($user)
            ->postJson('/scores', ['score' => 9000, 'lines' => 40, 'level' => 5])
            ->assertCreated()
            ->assertJson(['best' => 9000, 'is_best' => true]);

        $this->assertDatabaseCount('scores', 3);
    }

    public function test_score_payload_is_validated(): void
    {
        $this->actingAs(User::factory()->create())
            ->postJson('/scores', ['score' => -1, 'lines' => 'x', 'mode' => 'bogus'])
            ->assertUnprocessable()
            ->assertJsonValidationErrors(['score', 'lines', 'level', 'mode']);
    }

    public function test_sprint_best_is_the_fastest_finished_run(): void
    {
        $user = User::factory()->create();

        // Unfinished sprint: saved, but never ranked. With nothing finished yet
        // the response still reports it as the only result on record.
        $this->actingAs($user)
            ->postJson('/scores', ['mode' => 'sprint', 'score' => 900, 'lines' => 12, 'level' => 1, 'duration_ms' => 20000])
            ->assertCreated()
            ->assertJson(['is_best' => true, 'best_duration_ms' => 20000]);

        $this->actingAs($user)
            ->postJson('/scores', ['mode' => 'sprint', 'score' => 4000, 'lines' => 40, 'level' => 1, 'duration_ms' => 95000])
            ->assertCreated()
            ->assertJson(['is_best' => true, 'best_duration_ms' => 95000]);

        // Slower finish is not a best, even with a higher score.
        $this->actingAs($user)
            ->postJson('/scores', ['mode' => 'sprint', 'score' => 6000, 'lines' => 40, 'level' => 1, 'duration_ms' => 120000])
            ->assertCreated()
            ->assertJson(['is_best' => false, 'best_duration_ms' => 95000]);

        // Faster finish is.
        $this->actingAs($user)
            ->postJson('/scores', ['mode' => 'sprint', 'score' => 3500, 'lines' => 40, 'level' => 1, 'duration_ms' => 80000])
            ->assertCreated()
            ->assertJson(['is_best' => true, 'best_duration_ms' => 80000]);
    }

    public function test_home_shows_leaderboard_per_mode_and_personal_best(): void
    {
        $alice = User::factory()->create(['name' => 'Alice']);
        $bob = User::factory()->create(['name' => 'Bob']);
        Score::create(['user_id' => $alice->id, 'score' => 3000, 'lines' => 12, 'level' => 2]);
        Score::create(['user_id' => $bob->id, 'score' => 7000, 'lines' => 30, 'level' => 4]);
        Score::create(['user_id' => $alice->id, 'score' => 4500, 'lines' => 18, 'level' => 2]);
        // Sprint board: Alice finished faster; her unfinished run must not show.
        Score::create(['user_id' => $bob->id, 'mode' => 'sprint', 'score' => 4000, 'lines' => 40, 'level' => 1, 'duration_ms' => 90500]);
        Score::create(['user_id' => $alice->id, 'mode' => 'sprint', 'score' => 4200, 'lines' => 40, 'level' => 1, 'duration_ms' => 75250]);
        Score::create(['user_id' => $alice->id, 'mode' => 'sprint', 'score' => 100, 'lines' => 5, 'level' => 1, 'duration_ms' => 1000]);
        Score::create(['user_id' => $bob->id, 'mode' => 'ultra', 'score' => 12000, 'lines' => 50, 'level' => 1, 'duration_ms' => 120000]);

        $response = $this->get('/')->assertOk();
        $response->assertSeeInOrder(['data-board="marathon"', 'Bob', '7,000', 'Alice', '4,500', 'Alice', '3,000'], false);
        $response->assertSeeInOrder(['data-board="sprint"', 'Alice', '1:15.25', 'Bob', '1:30.50'], false);
        $response->assertDontSee('0:01.00');
        $response->assertSeeInOrder(['data-board="ultra"', 'Bob', '12,000'], false);

        $this->actingAs($alice)->get('/')
            ->assertOk()
            ->assertSee('id="best">4500', false)
            ->assertSeeInOrder(['Best sprint', '1:15.25'])
            ->assertSee('"sprint":{"score":4200,"duration_ms":75250}', false);
    }

    public function test_home_shows_personal_stats_for_logged_in_player(): void
    {
        $user = User::factory()->create();
        Score::create(['user_id' => $user->id, 'score' => 1000, 'lines' => 10, 'level' => 2]);
        Score::create(['user_id' => $user->id, 'score' => 3000, 'lines' => 25, 'level' => 3]);

        $this->actingAs($user)->get('/')
            ->assertOk()
            ->assertSee('Your stats')
            ->assertSeeInOrder(['Games', '2', 'Total lines', '35', 'Top level', '3', 'Average', '2,000']);

        auth()->logout();
        $this->get('/')->assertOk()->assertSee('Create an account')->assertDontSee('Total lines');
    }
}
