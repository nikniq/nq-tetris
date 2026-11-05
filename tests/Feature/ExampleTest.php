<?php

namespace Tests\Feature;

use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

class ExampleTest extends TestCase
{
    use RefreshDatabase;

    /**
     * A basic test example.
     */
    public function test_the_application_returns_a_successful_response(): void
    {
        $response = $this->get('/');

        $response->assertStatus(200);
    }

    public function test_two_player_page_renders_for_guests(): void
    {
        $this->get('/versus')->assertOk()
            ->assertSee('Player 1')->assertSee('Player 2')
            ->assertSee('js/versus.js', false);

        $this->get('/')->assertSee('Play two player on this screen');
    }
}
