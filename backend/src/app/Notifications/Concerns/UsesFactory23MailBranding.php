<?php

declare(strict_types=1);

namespace App\Notifications\Concerns;

use Illuminate\Notifications\Messages\MailMessage;
use Illuminate\Support\HtmlString;

trait UsesFactory23MailBranding
{
    protected function factory23Mail(): MailMessage
    {
        return (new MailMessage)->mailer('resend');
    }

    protected function factory23Salutation(?string $team = null): string
    {
        return $team ?? (string) config('brand.team');
    }

    /**
     * @param  array<string, string|null>  $rows
     */
    protected function factory23DetailTable(array $rows): HtmlString
    {
        return new HtmlString(view('emails.components.detail-table', ['rows' => $rows])->render());
    }

    protected function factory23OtpBox(string $otp): HtmlString
    {
        return new HtmlString(view('emails.components.otp-box', ['otp' => $otp])->render());
    }

    protected function factory23FrontendUrl(string $path = ''): string
    {
        $base = rtrim((string) config('brand.website_url'), '/');
        $path = ltrim($path, '/');

        return $path === '' ? $base : $base.'/'.$path;
    }
}
