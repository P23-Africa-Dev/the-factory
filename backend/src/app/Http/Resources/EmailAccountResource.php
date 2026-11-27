<?php

declare(strict_types=1);

namespace App\Http\Resources;

use App\Services\Email\Providers\ImapSmtpProvider;
use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;

class EmailAccountResource extends JsonResource
{
    /**
     * @return array<string,mixed>
     */
    public function toArray(Request $request): array
    {
        return [
            'id' => $this->id,
            'provider' => $this->provider,
            'email' => $this->email,
            'display_name' => $this->display_name,
            'is_default' => (bool) $this->is_default,
            'status' => $this->status,
            'scopes' => $this->scopes,
            'smtp_host' => $this->smtp_host,
            'smtp_port' => $this->smtp_port,
            'smtp_encryption' => $this->smtp_encryption,
            'smtp_username' => $this->smtp_username,
            // Temporary "send through Factory23" option for IMAP/SMTP accounts
            // while our host blocks outbound SMTP ports.
            'send_via_platform' => (bool) $this->send_via_platform,
            'platform_sender' => $this->provider === 'imap_smtp' && $this->send_via_platform
                ? ImapSmtpProvider::platformSendSettings()['from_address']
                : null,
            'smtp_port_blocked' => $this->provider === 'imap_smtp'
                && ImapSmtpProvider::isSmtpPortBlocked($this->smtp_port !== null ? (int) $this->smtp_port : null),
            'imap_host' => $this->imap_host,
            'imap_port' => $this->imap_port,
            'imap_encryption' => $this->imap_encryption,
            'imap_username' => $this->imap_username,
            'last_synced_at' => $this->last_synced_at?->toIso8601String(),
            'last_error_message' => $this->last_error_message,
            'last_error_at' => $this->last_error_at?->toIso8601String(),
            'connected_at' => $this->connected_at?->toIso8601String(),
            'disconnected_at' => $this->disconnected_at?->toIso8601String(),
            'created_at' => $this->created_at?->toIso8601String(),
            'updated_at' => $this->updated_at?->toIso8601String(),
        ];
    }
}
