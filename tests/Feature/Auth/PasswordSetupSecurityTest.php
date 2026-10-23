<?php

namespace Tests\Feature\Auth;

use App\Http\Controllers\Auth\PasswordController;
use App\Models\AuditLog;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Http\Request;
use Illuminate\Log\Events\MessageLogged;
use Illuminate\Support\Facades\Event;
use PHPUnit\Framework\Attributes\DataProvider;
use Symfony\Component\HttpKernel\Exception\HttpException;
use Tests\TestCase;

class PasswordSetupSecurityTest extends TestCase
{
    use RefreshDatabase;

    private User $owner;
    private User $other;
    private array $logged = [];
    private const PASSWORD = 'Setup-secret-39D0-do-not-log!';
    private const TOKEN = 'Remember-secret-39D0-do-not-log';

    protected function setUp(): void
    {
        parent::setUp();
        $this->owner = User::factory()->create(['google_id' => 'google-owner-test', 'remember_token' => self::TOKEN]);
        $this->other = User::factory()->create();
        Event::listen(MessageLogged::class, function (MessageLogged $event) {
            $this->logged[] = [$event->level, $event->message, $event->context];
        });
    }

    private function payload(): array
    {
        return ['email' => $this->owner->email, 'password' => self::PASSWORD, 'password_confirmation' => self::PASSWORD];
    }

    private function assertUnchanged(array $before, string $response = ''): void
    {
        $this->assertSame($before, [$this->owner->fresh()->getRawOriginal(), $this->other->fresh()->getRawOriginal()]);
        $this->assertSame(0, AuditLog::count());
        $logs = json_encode($this->logged, JSON_THROW_ON_ERROR | JSON_UNESCAPED_SLASHES);
        foreach ([self::PASSWORD, self::TOKEN, $before[0]['password'], $before[1]['password']] as $secret) {
            $this->assertStringNotContainsString($secret, $logs);
            $this->assertStringNotContainsString($secret, $response);
        }
    }

    private function snapshot(): array
    {
        return [$this->owner->fresh()->getRawOriginal(), $this->other->fresh()->getRawOriginal()];
    }

    public function test_anonymous_json_request_cannot_change_any_account(): void
    {
        $before = $this->snapshot();
        $response = $this->postJson('/account/set-password', $this->payload())->assertUnauthorized();
        $this->assertUnchanged($before, $response->getContent());
    }

    public function test_guest_form_post_is_redirected_to_login_without_changes(): void
    {
        $before = $this->snapshot();
        $response = $this->post('/account/set-password', $this->payload())->assertRedirect('/login');
        $this->assertUnchanged($before, $response->getContent());
    }

    public function test_authenticated_user_cannot_select_another_account_by_email(): void
    {
        $before = $this->snapshot();
        $response = $this->actingAs($this->other)->postJson('/account/set-password', $this->payload())->assertForbidden();
        $this->assertUnchanged($before, $response->getContent());
    }

    public function test_google_owner_is_also_denied_until_a_secure_setup_workflow_is_approved(): void
    {
        $before = $this->snapshot();
        $response = $this->actingAs($this->owner)->postJson('/account/set-password', $this->payload())->assertForbidden();
        $this->assertUnchanged($before, $response->getContent());
    }

    public static function invalidPayloads(): array
    {
        return ['empty' => [[]], 'mismatched confirmation' => [['password_confirmation' => 'different']],
            'invalid email' => [['email' => 'not-an-email']], 'array email' => [['email' => ['invalid']]],
            'weak password' => [['password' => 'x', 'password_confirmation' => 'x']]];
    }

    #[DataProvider('invalidPayloads')]
    public function test_invalid_payloads_remain_denied_without_mutation(array $overrides): void
    {
        $before = $this->snapshot();
        $payload = $overrides === [] ? [] : array_replace($this->payload(), $overrides);
        $response = $this->actingAs($this->owner)->postJson('/account/set-password', $payload)->assertForbidden();
        $this->assertUnchanged($before, $response->getContent());
    }

    public function test_controller_itself_denies_access_if_route_middleware_is_bypassed(): void
    {
        $before = $this->snapshot();
        $request = Request::create('/account/set-password', 'POST', $this->payload());
        $request->setUserResolver(fn () => $this->other);
        try {
            app(PasswordController::class)->setPasswordForGoogleUser($request);
            $this->fail('Expected direct setup to remain disabled');
        } catch (HttpException $e) {
            $this->assertSame(403, $e->getStatusCode());
        }
        $this->assertUnchanged($before);
    }

    public function test_password_setup_route_retains_its_name_and_requires_authentication(): void
    {
        $route = app('router')->getRoutes()->getByName('account.set.password');
        $this->assertSame('account/set-password', $route->uri());
        $this->assertContains('POST', $route->methods());
        $this->assertContains('auth', $route->gatherMiddleware());
    }
}
