<?php

namespace Tests\Feature;

use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

class AuthTest extends TestCase
{
    use RefreshDatabase;

    public function test_register_and_login_pages_render(): void
    {
        $this->get('/register')->assertOk()->assertSee('Create account');
        $this->get('/login')->assertOk()->assertSee('Log in');
    }

    public function test_user_can_register_and_is_logged_in(): void
    {
        $response = $this->post('/register', [
            'name' => 'Tetro',
            'email' => 'tetro@example.com',
            'password' => 'password123',
            'password_confirmation' => 'password123',
        ]);

        $response->assertRedirect('/');
        $this->assertAuthenticated();
        $this->assertDatabaseHas('users', ['email' => 'tetro@example.com']);
    }

    public function test_register_rejects_duplicate_email_and_short_password(): void
    {
        User::factory()->create(['email' => 'taken@example.com']);

        $this->from('/register')->post('/register', [
            'name' => 'Dup',
            'email' => 'taken@example.com',
            'password' => 'short',
            'password_confirmation' => 'short',
        ])->assertRedirect('/register')->assertSessionHasErrors(['email', 'password']);

        $this->assertGuest();
    }

    public function test_user_can_login_and_logout(): void
    {
        $user = User::factory()->create(['password' => 'password123']);

        $this->post('/login', ['email' => $user->email, 'password' => 'password123'])
            ->assertRedirect('/');
        $this->assertAuthenticatedAs($user);

        $this->post('/logout')->assertRedirect('/');
        $this->assertGuest();
    }

    public function test_login_with_wrong_password_fails(): void
    {
        $user = User::factory()->create(['password' => 'password123']);

        $this->from('/login')->post('/login', ['email' => $user->email, 'password' => 'nope'])
            ->assertRedirect('/login')
            ->assertSessionHasErrors('email');
        $this->assertGuest();
    }

    public function test_logged_in_users_are_sent_away_from_guest_pages(): void
    {
        $this->actingAs(User::factory()->create());

        $this->get('/login')->assertRedirect();
        $this->get('/register')->assertRedirect();
    }
}
