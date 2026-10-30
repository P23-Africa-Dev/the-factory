<?php

declare(strict_types=1);

namespace App\Exceptions;

use RuntimeException;

/**
 * Thrown when a task comment cannot be written to the database.
 */
class TaskCommentPersistenceException extends RuntimeException {}
