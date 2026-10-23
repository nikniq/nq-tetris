<?php

namespace Tests\Feature;

use App\Models\User;
use App\Notifications\AccountLink;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Notification;
use Illuminate\Support\Facades\URL;
use Tests\TestCase;

class AuthTest extends TestCase
{
    use RefreshDatabase;

    protected function setUp(): void
    {
        parent::setUp();
        Notification::fake();
    }

    private function linkFor(User $user, string $purpose = 'verify', int $minutes = 60): string
    {
        return URL::temporarySignedRoute('account.link', now()->addMinutes($minutes), [
            'user' => $user->id, 'hash' => $user->linkHash(), 'purpose' => $purpose,
        ]);
    }

    public function test_auth_pages_render(): void
    {
        $this->get('/register')->assertOk()->assertSee('Send confirmation link');
        $this->get('/login')->assertOk()->assertSee('Forgot password?');
        $this->get('/forgot')->assertOk()->assertSee('Send link');
    }

    public function test_registering_creates_an_unverified_user_without_password_and_emails_a_link(): void
    {
        $this->post('/register', ['name' => 'Tetro', 'email' => 'tetro@example.com'])
            ->assertRedirect('/register/sent');

        $user = User::where('email', 'tetro@example.com')->firstOrFail();
        $this->assertNull($user->password);
        $this->assertNull($user->email_verified_at);
        $this->assertGuest();

        Notification::assertSentTo($user, AccountLink::class, fn ($n) => $n->purpose === 'verify');

        $this->get('/register/sent')->assertOk()->assertSee('tetro@example.com');
    }

    public function test_link_verifies_email_logs_in_and_leads_to_password_setup(): void
    {
        $user = User::create(['name' => 'Tetro', 'email' => 'tetro@example.com']);

        $this->get($this->linkFor($user))->assertRedirect('/password/set');
        $this->assertAuthenticatedAs($user);
        $this->assertNotNull($user->fresh()->email_verified_at);

        $this->get('/password/set')->assertOk()->assertSee('Choose a password');

        $this->post('/password/set', ['password' => 'password123', 'password_confirmation' => 'password123'])
            ->assertRedirect('/');
        $this->assertNotNull($user->fresh()->password);

        // The link was tied to the passwordless state, so it is now dead.
        auth()->logout();
        $this->get($this->linkFor($user->fresh()))->assertRedirect('/password/set'); // fresh hash: fine
        auth()->logout();
        $this->get($this->linkFor($user))->assertRedirect('/login')->assertSessionHasErrors('email'); // stale hash
        $this->assertGuest();

        // And the password works.
        $this->post('/login', ['email' => 'tetro@example.com', 'password' => 'password123'])->assertRedirect('/');
        $this->assertAuthenticatedAs($user);
    }

    public function test_tampered_or_expired_links_are_rejected(): void
    {
        $user = User::create(['name' => 'Tetro', 'email' => 'tetro@example.com']);

        $this->get($this->linkFor($user).'x')->assertForbidden();
        $this->get($this->linkFor($user, 'verify', -1))->assertForbidden();
        $this->assertGuest();
        $this->assertNull($user->fresh()->email_verified_at);
    }

    public function test_registering_an_existing_email_sends_a_sign_in_link_and_looks_the_same(): void
    {
        $existing = User::factory()->create(['email' => 'taken@example.com', 'name' => 'Original']);

        $this->post('/register', ['name' => 'Impostor', 'email' => 'taken@example.com'])
            ->assertRedirect('/register/sent');

        $this->assertSame('Original', $existing->fresh()->name);
        $this->assertDatabaseCount('users', 1);
        Notification::assertSentTo($existing, AccountLink::class, fn ($n) => $n->purpose === 'reset');
    }

    public function test_forgot_password_sends_a_link_to_known_addresses_only_but_answers_alike(): void
    {
        $user = User::factory()->create(['email' => 'known@example.com']);

        $this->post('/forgot', ['email' => 'known@example.com'])->assertRedirect('/register/sent');
        $this->post('/forgot', ['email' => 'nobody@example.com'])->assertRedirect('/register/sent');

        Notification::assertSentTo($user, AccountLink::class, fn ($n) => $n->purpose === 'reset');
        Notification::assertCount(1);

        // Following the reset link signs in and asks for a new password.
        $this->get($this->linkFor($user, 'reset'))->assertRedirect('/password/set');
        $this->assertAuthenticatedAs($user);
        $this->get('/password/set')->assertOk()->assertSee('New password');
    }

    public function test_login_and_logout_with_a_password(): void
    {
        $user = User::factory()->create(['password' => 'password123']);

        $this->post('/login', ['email' => $user->email, 'password' => 'password123'])->assertRedirect('/');
        $this->assertAuthenticatedAs($user);

        $this->post('/logout')->assertRedirect('/');
        $this->assertGuest();
    }

    public function test_login_explains_when_an_account_has_no_password(): void
    {
        $user = User::create(['name' => 'G', 'email' => 'g@example.com', 'email_verified_at' => now()]);

        $this->from('/login')->post('/login', ['email' => 'g@example.com', 'password' => 'anything'])
            ->assertRedirect('/login')
            ->assertSessionHasErrors(['email' => 'This account has no password yet. Request a link below to set one.']);
        $this->assertGuest();

        $user->forceFill(['google_id' => '123'])->save();
        $this->from('/login')->post('/login', ['email' => 'g@example.com', 'password' => 'anything'])
            ->assertSessionHasErrorsIn('default', ['email']);
        $this->assertStringContainsString('Google', session('errors')->first('email'));
    }

    public function test_wrong_password_and_unknown_email_get_the_same_generic_error(): void
    {
        User::factory()->create(['email' => 'real@example.com', 'password' => 'password123']);

        $this->from('/login')->post('/login', ['email' => 'real@example.com', 'password' => 'nope'])
            ->assertSessionHasErrors(['email' => 'These credentials do not match our records.']);
        $this->from('/login')->post('/login', ['email' => 'fake@example.com', 'password' => 'nope'])
            ->assertSessionHasErrors(['email' => 'These credentials do not match our records.']);
        $this->assertGuest();
    }

    public function test_logged_in_users_are_sent_away_from_guest_pages(): void
    {
        $this->actingAs(User::factory()->create());

        $this->get('/login')->assertRedirect();
        $this->get('/register')->assertRedirect();
        $this->get('/forgot')->assertRedirect();
    }

    public function test_password_setup_requires_login(): void
    {
        $this->get('/password/set')->assertRedirect('/login');
    }
}
