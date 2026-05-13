<?php

declare(strict_types=1);

namespace App\Exceptions;

use Exception;

class InvalidRoleAccessException extends Exception
{
    /**
     * Render the exception as JSON.
     */
    public function render()
    {
        return response()->json([
            'success' => false,
            'message' => $this->message,
            'data' => null,
            'errors' => [
                'authentication' => [$this->message],
            ],
        ], 403);
    }
}
