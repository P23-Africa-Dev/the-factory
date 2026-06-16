<?php

declare(strict_types=1);

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class AiLog extends Model
{
    protected $fillable = [
        'company_id',
        'user_id',
        'session_id',
        'provider',
        'model',
        'user_prompt',
        'sanitized_prompt',
        'prompt_length',
        'input_tokens',
        'output_tokens',
        'total_tokens',
        'estimated_cost_usd',
        'started_at',
        'ended_at',
        'execution_ms',
        'status',
        'intent_type',
        'tool_name',
        'error_code',
        'error_message',
        'stack_trace',
    ];

    protected $casts = [
        'started_at' => 'datetime',
        'ended_at' => 'datetime',
        'estimated_cost_usd' => 'decimal:6',
    ];

    public function company(): BelongsTo
    {
        return $this->belongsTo(Company::class);
    }

    public function user(): BelongsTo
    {
        return $this->belongsTo(User::class);
    }

    /**
     * Estimate cost based on provider pricing (USD per 1K tokens, approximate).
     */
    public static function estimateCost(string $provider, string $model, int $inputTokens, int $outputTokens): float
    {
        // Prices per 1M tokens (input / output) as of 2025 — update as needed
        $pricing = [
            'openai' => [
                'gpt-4.1-mini' => ['input' => 0.40, 'output' => 1.60],
                'gpt-4o' => ['input' => 2.50, 'output' => 10.00],
                'gpt-4o-mini' => ['input' => 0.15, 'output' => 0.60],
                'gpt-4.1' => ['input' => 2.00, 'output' => 8.00],
                'default' => ['input' => 0.40, 'output' => 1.60],
            ],
            'claude' => [
                'claude-3-5-sonnet-latest' => ['input' => 3.00, 'output' => 15.00],
                'claude-3-5-sonnet-20241022' => ['input' => 3.00, 'output' => 15.00],
                'claude-3-haiku-20240307' => ['input' => 0.25, 'output' => 1.25],
                'default' => ['input' => 3.00, 'output' => 15.00],
            ],
        ];

        $providerPricing = $pricing[$provider] ?? $pricing['openai'];
        $modelPricing = $providerPricing[$model] ?? $providerPricing['default'];

        $inputCost = ($inputTokens / 1_000_000) * $modelPricing['input'];
        $outputCost = ($outputTokens / 1_000_000) * $modelPricing['output'];

        return round($inputCost + $outputCost, 6);
    }
}
