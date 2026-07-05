<?php

declare(strict_types=1);

namespace App\Services\AI\Crm;

use App\Models\Lead;
use App\Services\AI\Providers\AiProviderRouter;
use Illuminate\Support\Str;

class EmailInferenceService
{
    public function __construct(private readonly AiProviderRouter $aiProviderRouter) {}

    /**
     * @param  array<string, string>  $entities
     * @return array<string, mixed>
     */
    public function infer(
        string $message,
        int $companyId,
        array $entities = [],
        string $conversationSummary = '',
        ?int $userId = null,
    ): array {
        $to = $this->extractLabeledValue($message, ['to', 'recipient', 'email to'])
            ?? ($entities['lead_email'] ?? null);

        $subject = $this->extractLabeledValue($message, ['subject', 'title'])
            ?? $this->inferSubjectFromMessage($message);

        $body = $this->extractLabeledValue($message, ['body', 'message', 'content'])
            ?? $this->extractBodyBlock($message);

        $leadId = isset($entities['lead_id']) ? (int) $entities['lead_id'] : null;

        if ($leadId === null) {
            $leadName = $this->extractLabeledValue($message, ['lead', 'lead name', 'customer', 'client']);
            if (is_string($leadName) && trim($leadName) !== '') {
                $lead = Lead::query()
                    ->where('company_id', $companyId)
                    ->where('name', 'like', '%' . trim($leadName) . '%')
                    ->first();
                $leadId = $lead?->id;
                $to = $to ?? $lead?->email;
            }
        }

        if ($body === null || trim((string) $body) === '') {
            $body = $this->draftWithAi($message, $conversationSummary, (string) ($to ?? ''), $companyId, $userId);
        }

        $toRecipients = [];

        if (is_string($to) && filter_var(trim($to), FILTER_VALIDATE_EMAIL)) {
            $toRecipients[] = ['email' => strtolower(trim($to)), 'name' => null];
        }

        return [
            'lead_id' => $leadId,
            'to' => $toRecipients,
            'cc' => [],
            'bcc' => [],
            'subject' => Str::limit(trim((string) $subject), 255, ''),
            'body_text' => trim((string) $body),
            'body_html' => '<p>' . nl2br(e(trim((string) $body))) . '</p>',
        ];
    }

    /**
     * @param  array<string,mixed>  $actionArgs
     * @return array<string,mixed>
     */
    public function normalizeProvidedArgs(int $companyId, array $actionArgs): array
    {
        if (! isset($actionArgs['to']) || ! is_array($actionArgs['to'])) {
            $email = trim((string) ($actionArgs['to_email'] ?? $actionArgs['email'] ?? ''));
            if ($email !== '') {
                $actionArgs['to'] = [['email' => $email, 'name' => $actionArgs['to_name'] ?? null]];
            }
        }

        if (isset($actionArgs['lead_id']) && ! isset($actionArgs['company_id'])) {
            $lead = Lead::query()
                ->where('company_id', $companyId)
                ->find((int) $actionArgs['lead_id']);

            if ($lead && empty($actionArgs['to']) && $lead->email) {
                $actionArgs['to'] = [['email' => $lead->email, 'name' => $lead->name]];
            }
        }

        if (! isset($actionArgs['body_html']) && isset($actionArgs['body_text'])) {
            $actionArgs['body_html'] = '<p>' . nl2br(e((string) $actionArgs['body_text'])) . '</p>';
        }

        return $actionArgs;
    }

    /**
     * @param  list<string>  $labels
     */
    private function extractLabeledValue(string $message, array $labels): ?string
    {
        foreach ($labels as $label) {
            $pattern = '/\b' . preg_quote($label, '/') . '\s*:\s*(.+?)(?:\n|$)/i';
            if (preg_match($pattern, $message, $matches) === 1) {
                return trim((string) $matches[1]);
            }
        }

        return null;
    }

    private function inferSubjectFromMessage(string $message): string
    {
        if (preg_match('/\bregarding\s+(.+?)(?:\.|$)/i', $message, $matches) === 1) {
            return 'Regarding ' . trim((string) $matches[1]);
        }

        return 'Follow-up';
    }

    private function extractBodyBlock(string $message): ?string
    {
        if (preg_match('/\bbody\s*:\s*([\s\S]+)$/i', $message, $matches) === 1) {
            return trim((string) $matches[1]);
        }

        return null;
    }

    private function draftWithAi(string $message, string $conversationSummary, string $recipientEmail, int $companyId, ?int $userId = null): string
    {
        $userPrompt = "Draft a concise professional CRM follow-up email based on this request.\n"
            . "Recipient: {$recipientEmail}\n"
            . "Request: {$message}\n"
            . "Context: {$conversationSummary}\n"
            . 'Return only the email body text.';

        try {
            $result = $this->aiProviderRouter->generateForPurpose(
                purpose: 'operational',
                systemPrompt: 'You write polished business emails for CRM follow-up.',
                userPrompt: $userPrompt,
                options: [
                    'company_id' => $companyId,
                    '_log' => [
                        'company_id' => $companyId,
                        'user_id' => $userId,
                        'intent_type' => 'inference',
                        'tool_name' => 'crm.send_email',
                        'routing_purpose' => 'operational',
                        'user_prompt' => $userPrompt,
                    ],
                ],
            );

            return trim((string) ($result?->text ?? ''));
        } catch (\Throwable) {
            return 'Hello,' . "\n\n" . 'I wanted to follow up regarding our recent conversation.' . "\n\n" . 'Best regards';
        }
    }
}
