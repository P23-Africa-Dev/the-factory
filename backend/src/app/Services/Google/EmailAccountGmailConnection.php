<?php

declare(strict_types=1);

namespace App\Services\Google;

use App\Models\EmailAccount;
use Carbon\CarbonInterface;

/**
 * Adapts an EmailAccount so GmailApiService / GoogleTokenService can treat it
 * like a calendar connection (organizer_email, encrypted tokens, update()).
 */
class EmailAccountGmailConnection
{
    public string $organizer_email;

    public string $organizer_name;

    public ?string $access_token_encrypted;

    public ?string $refresh_token_encrypted;

    public ?CarbonInterface $token_expires_at;

    /** @var array<int, string> */
    public array $scopes;

    public string $status;

    public ?string $gmail_history_id;

    public ?string $gmail_last_synced_at;

    public ?string $last_error_message = null;

    public ?CarbonInterface $last_error_at = null;

    public ?CarbonInterface $last_token_refresh_at = null;

    public function __construct(
        private readonly EmailAccount $account,
    ) {
        $this->syncFromModel();
    }

    public function account(): EmailAccount
    {
        return $this->account;
    }

    /**
     * @param  array<string, mixed>  $attributes
     */
    public function update(array $attributes): void
    {
        $mapped = [];

        foreach ($attributes as $key => $value) {
            $mapped[$this->mapAttribute($key)] = $value;
        }

        $this->account->update($mapped);
        $this->account->refresh();
        $this->syncFromModel();
    }

    private function syncFromModel(): void
    {
        $this->organizer_email = (string) $this->account->email;
        $this->organizer_name = (string) ($this->account->display_name ?? '');
        $this->access_token_encrypted = $this->account->access_token_encrypted;
        $this->refresh_token_encrypted = $this->account->refresh_token_encrypted;
        $this->token_expires_at = $this->account->token_expires_at;
        $this->scopes = is_array($this->account->scopes) ? $this->account->scopes : [];
        $this->status = (string) $this->account->status;
        $this->gmail_history_id = $this->account->history_id;
        $this->gmail_last_synced_at = $this->account->last_synced_at?->toIso8601String();
        $this->last_error_message = $this->account->last_error_message;
        $this->last_error_at = $this->account->last_error_at;
        $this->last_token_refresh_at = $this->account->last_token_refresh_at;
    }

    private function mapAttribute(string $key): string
    {
        return match ($key) {
            'organizer_email' => 'email',
            'organizer_name' => 'display_name',
            'gmail_history_id' => 'history_id',
            'gmail_last_synced_at' => 'last_synced_at',
            default => $key,
        };
    }
}
