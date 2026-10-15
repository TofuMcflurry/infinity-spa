<?php

namespace Tests\Feature\Auth;

use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

class RegistrationTest extends TestCase
{
    use RefreshDatabase;

    public function test_registration_screen_can_be_rendered(): void
    {
        $response = $this->get('/register');

        $response->assertStatus(200);
    }

    public function test_new_users_can_register(): void
    {
        // This app's registration flow is OTP-based (RegisteredUserController
        // creates the user, sends an OTP, and redirects to verification —
        // it deliberately does not call Auth::login()), unlike the stock
        // Breeze scaffold this test originally assumed.
        $response = $this->post('/register', [
            'name' => 'Test User',
            'email' => 'test@example.com',
            'password' => 'password',
            'password_confirmation' => 'password',
        ]);

        $this->assertDatabaseHas('users', ['email' => 'test@example.com']);
        $this->assertGuest();
        $response->assertRedirect(route('otp.form', ['email' => 'test@example.com']));
    }
}
