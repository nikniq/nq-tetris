<?php

namespace Tests\Feature;

use App\Models\Score;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Hash;
use Tests\TestCase;

class AccountTest extends TestCase
{
    use RefreshDatabase;

    public function test_account_page_requires_login_and_shows_details(): void
    {
        $this->get('/account')->assertRedirect('/login');

        $user = User::factory()->create(['name' => 'Tetro']);
        Score::create(['user_id' => $user->id, 'score' => 100, 'lines' => 1, 'level' => 1]);

        $this->actingAs($user)->get('/account')
            ->assertOk()
            ->assertSee('Tetro')
            ->assertSee($user->email)
            ->assertSee('1 game played')
            ->assertSee('Change password');
    }

    public function test_name_can_be_changed(): void
    {
        $user = User::factory()->create();

        $this->actingAs($user)->post('/account/name', ['name' => 'Blockhead'])->assertRedirect('/account');
        $this->assertSame('Blockhead', $user->fresh()->name);

        $this->actingAs($user)->post('/account/name', ['name' => str_repeat('x', 51)])->assertSessionHasErrors('name');
    }

    public function test_changing_a_password_needs_the_current_one(): void
    {
        $user = User::factory()->create(['password' => 'oldpassword']);

        $this->actingAs($user)->post('/account/password', [
            'current_password' => 'wrong', 'password' => 'newpassword1', 'password_confirmation' => 'newpassword1',
        ])->assertSessionHasErrors('current_password');
        $this->assertTrue(Hash::check('oldpassword', $user->fresh()->password));

        $this->actingAs($user)->post('/account/password', [
            'current_password' => 'oldpassword', 'password' => 'newpassword1', 'password_confirmation' => 'newpassword1',
        ])->assertRedirect('/account');
        $this->assertTrue(Hash::check('newpassword1', $user->fresh()->password));
    }

    public function test_a_passwordless_account_can_set_one_without_a_current_password(): void
    {
        $user = User::create(['name' => 'G', 'email' => 'g@example.com', 'google_id' => 'g-1', 'email_verified_at' => now()]);

        $this->actingAs($user)->get('/account')->assertSee('No password set');
        $this->actingAs($user)->get('/')->assertSee('You have not set a password yet');

        $this->actingAs($user)->post('/account/password', [
            'password' => 'newpassword1', 'password_confirmation' => 'newpassword1',
        ])->assertRedirect('/account');
        $this->assertTrue(Hash::check('newpassword1', $user->fresh()->password));
        $this->actingAs($user->fresh())->get('/')->assertDontSee('You have not set a password yet');
    }

    public function test_account_deletion_removes_scores_and_needs_confirmation(): void
    {
        $user = User::factory()->create(['password' => 'password123']);
        Score::create(['user_id' => $user->id, 'score' => 100, 'lines' => 1, 'level' => 1]);

        $this->actingAs($user)->delete('/account', ['current_password' => 'nope'])->assertSessionHasErrors('current_password');
        $this->assertDatabaseCount('users', 1);

        $this->actingAs($user)->delete('/account', ['current_password' => 'password123'])->assertRedirect('/');
        $this->assertGuest();
        $this->assertDatabaseCount('users', 0);
        $this->assertDatabaseCount('scores', 0);
    }
}
