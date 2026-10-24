<?php

namespace Tests\Feature;

use App\Models\Score;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

class LeaderboardTest extends TestCase
{
    use RefreshDatabase;

    public function test_leaderboard_lists_each_players_best_and_shows_my_rank(): void
    {
        $alice = User::factory()->create(['name' => 'Alice']);
        $bob = User::factory()->create(['name' => 'Bob']);
        $carol = User::factory()->create(['name' => 'Carol']);
        Score::create(['user_id' => $alice->id, 'score' => 3000, 'lines' => 12, 'level' => 2]);
        Score::create(['user_id' => $alice->id, 'score' => 4500, 'lines' => 18, 'level' => 2]);
        Score::create(['user_id' => $bob->id, 'score' => 7000, 'lines' => 30, 'level' => 4]);
        Score::create(['user_id' => $carol->id, 'score' => 100, 'lines' => 0, 'level' => 1]);

        $this->get('/leaderboard')->assertOk()
            ->assertSeeInOrder(['Bob', '7,000', 'Alice', '4,500', 'Carol', '100'])
            ->assertDontSee('3,000')
            ->assertSee('3 players ranked')
            ->assertSee('Log in');

        $this->actingAs($alice)->get('/leaderboard')->assertOk()
            ->assertSee('#2')->assertSee('Your best: <strong>4,500</strong>', false);
    }

    public function test_sprint_tab_ranks_by_time_and_ignores_unfinished_runs(): void
    {
        $alice = User::factory()->create(['name' => 'Alice']);
        $bob = User::factory()->create(['name' => 'Bob']);
        Score::create(['user_id' => $alice->id, 'mode' => 'sprint', 'score' => 4200, 'lines' => 40, 'level' => 1, 'duration_ms' => 75250]);
        Score::create(['user_id' => $bob->id, 'mode' => 'sprint', 'score' => 4000, 'lines' => 40, 'level' => 1, 'duration_ms' => 90500]);
        Score::create(['user_id' => $bob->id, 'mode' => 'sprint', 'score' => 100, 'lines' => 5, 'level' => 1, 'duration_ms' => 1000]);

        $this->get('/leaderboard/sprint')->assertOk()
            ->assertSeeInOrder(['Alice', '1:15.25', 'Bob', '1:30.50'])
            ->assertDontSee('0:01.00');

        $unfinished = User::factory()->create();
        Score::create(['user_id' => $unfinished->id, 'mode' => 'sprint', 'score' => 50, 'lines' => 3, 'level' => 1, 'duration_ms' => 500]);
        $this->actingAs($unfinished)->get('/leaderboard/sprint')->assertSee('Finish all 40 lines');

        $this->get('/leaderboard/bogus')->assertOk()->assertSee('Marathon');
    }

    public function test_rank_is_computed_for_players_outside_the_listed_rows(): void
    {
        $me = User::factory()->create();
        Score::create(['user_id' => $me->id, 'score' => 10, 'lines' => 0, 'level' => 1]);
        foreach (range(1, 3) as $i) {
            Score::create(['user_id' => User::factory()->create()->id, 'score' => 1000 * $i, 'lines' => 1, 'level' => 1]);
        }

        $this->actingAs($me)->get('/leaderboard')->assertSee('#4');
    }
}
