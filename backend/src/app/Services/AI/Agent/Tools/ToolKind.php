<?php

declare(strict_types=1);

namespace App\Services\AI\Agent\Tools;

enum ToolKind: string
{
    case Read = 'read';
    case Write = 'write';
}
