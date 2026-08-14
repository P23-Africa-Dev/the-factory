<?php

declare(strict_types=1);

namespace App\Services\Google;

use RuntimeException;

/**
 * Gmail history.list returned 404 — the stored historyId is too old or invalid.
 * Connection is still valid; run a fresh mailbox backfill instead of marking the account errored.
 */
class StaleGmailHistoryException extends RuntimeException
{
}
