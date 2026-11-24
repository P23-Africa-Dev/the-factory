<?php

declare(strict_types=1);

namespace App\Services\AI\Agent\Tools;

/**
 * How ELY may run a tool.
 *
 * Safe: runs directly (audited, undo where supported).
 * Confirm: ELY prepares it and the user must press Confirm.
 * Blocked: ELY never runs it; it explains the steps and links to the page.
 */
enum ToolRisk: string
{
    case Safe = 'safe';
    case Confirm = 'confirm';
    case Blocked = 'blocked';
}
