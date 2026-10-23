<?php

namespace Tests\Feature;

use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Laravel\Socialite\Facades\Socialite;
use Laravel\Socialite\Two\User as GoogleUser;
use Tests\TestCase;

class GoogleAuthTest extends TestCase
{
    use RefreshDatabase;

    protected function setUp(): void
    {
        parent::setUp();
        config(['services.google.client_id' => 'test-client', 'services.google.client_secret' => 'secret']);
    }

    private function googleReturns(array $overrides = []): void
    {
        $raw = array_merge([
            'sub' => 'g-123', 'name' => 'Gina Google', 'email' => 'gina@example.com',
            'email_verified' => true, 'picture' => 'https://img.example/gina.png',
        ], $overrides);

        $user = (new GoogleUser)->setRaw($raw)->map([
            'id' => $raw['sub'], 'name' => $raw['name'], 'email' => $raw['email'], 'avatar' => $raw['picture'],
        ]);

        Socialite::shouldReceive('driver->user')->andReturn($user);
    }

    public function test_google_button_only_shows_when_configured(): void
    {
        $this->get('/login')->assertSee('Continue with Google');

        config(['services.google.client_id' => null]);
        $this->get('/login')->assertDontSee('Continue with Google');
        $this->get('/auth/google')->assertRedirect('/login');
    }

    public function test_redirect_goes_to_google(): void
    {
        $response = $this->get('/auth/google');
        $response->assertRedirect();
        $this->assertStringStartsWith('https://accounts.google.com/o/oauth2/auth', $response->headers->get('Location'));
        $this->assertStringContainsString(urlencode('/auth/google/callback'), $response->headers->get('Location'));
    }

    public function test_first_google_sign_in_creates_a_verified_account_without_password(): void
    {
        $this->googleReturns();

        $this->get('/auth/google/callback')->assertRedirect('/');

        $user = User::where('email', 'gina@example.com')->firstOrFail();
        $this->assertAuthenticatedAs($user);
        $this->assertSame('g-123', $user->google_id);
        $this->assertSame('Gina Google', $user->name);
        $this->assertNull($user->password);
        $this->assertNotNull($user->email_verified_at);
        $this->assertSame('https://img.example/gina.png', $user->avatar);

        // Second sign-in finds the same account.
        auth()->logout();
        $this->get('/auth/google/callback')->assertRedirect('/');
        $this->assertAuthenticatedAs($user);
        $this->assertDatabaseCount('users', 1);
    }

    public function test_google_links_to_an_existing_account_with_the_same_verified_email(): void
    {
        $existing = User::factory()->create(['email' => 'gina@example.com', 'name' => 'Gina', 'email_verified_at' => null]);
        $this->googleReturns();

        $this->get('/auth/google/callback')->assertRedirect('/');

        $this->assertAuthenticatedAs($existing);
        $this->assertSame('g-123', $existing->fresh()->google_id);
        $this->assertNotNull($existing->fresh()->email_verified_at);
        $this->assertSame('Gina', $existing->fresh()->name);
        $this->assertDatabaseCount('users', 1);
    }

    public function test_unverified_google_email_cannot_claim_an_existing_account(): void
    {
        User::factory()->create(['email' => 'gina@example.com']);
        $this->googleReturns(['email_verified' => false]);

        $this->get('/auth/google/callback')->assertRedirect('/login')->assertSessionHasErrors('email');
        $this->assertGuest();
        $this->assertNull(User::first()->google_id);
    }

    public function test_logged_in_user_can_link_and_unlink_google(): void
    {
        $user = User::factory()->create(['password' => 'password123']);
        $this->googleReturns();

        $this->actingAs($user)->get('/auth/google/callback')->assertRedirect('/account');
        $this->assertSame('g-123', $user->fresh()->google_id);

        $this->actingAs($user)->post('/account/google/unlink')->assertRedirect('/account');
        $this->assertNull($user->fresh()->google_id);
    }

    public function test_cannot_unlink_google_without_a_password(): void
    {
        $user = User::create(['name' => 'G', 'email' => 'g@example.com', 'google_id' => 'g-1', 'email_verified_at' => now()]);

        $this->actingAs($user)->post('/account/google/unlink')->assertSessionHasErrors('google');
        $this->assertSame('g-1', $user->fresh()->google_id);
    }

    public function test_google_sign_in_failure_is_handled(): void
    {
        Socialite::shouldReceive('driver->user')->andThrow(new \RuntimeException('denied'));

        $this->get('/auth/google/callback')->assertRedirect('/login')->assertSessionHasErrors('email');
        $this->assertGuest();
    }
}
