<?php

declare(strict_types=1);

namespace App\Services\AI\Crm;

use App\Models\CompanyCalendarConnection;
use App\Models\Lead;
use App\Models\User;
use App\Models\UserCalendarConnection;
use App\Services\AI\Context\ConversationMemoryService;
use App\Services\AI\Providers\AiProviderRouter;
use App\Services\Google\GoogleScopeHelper;
use Illuminate\Support\Str;

class EmailInferenceService
{
    public function __construct(
        private readonly AiProviderRouter $aiProviderRouter,
        private readonly ConversationMemoryService $conversationMemoryService,
    ) {}

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
        ?string $threadId = null,
    ): array {
        $senderName = $this->resolveSenderName($userId);
        $lead = $this->resolveLead(
            message: $message,
            companyId: $companyId,
            entities: $entities,
            conversationSummary: $conversationSummary,
            threadId: $threadId,
            userId: $userId,
        );

        $leadId = $lead?->id;
        $leadName = $lead?->name;
        $leadEmail = is_string($lead?->email) ? trim((string) $lead->email) : '';

        $to = $this->extractLabeledValue($message, ['to', 'recipient', 'email to'])
            ?? ($entities['lead_email'] ?? null)
            ?? ($leadEmail !== '' ? $leadEmail : null);

        $subject = $this->extractLabeledValue($message, ['subject', 'title'])
            ?? $this->inferSubjectFromMessage($message, $leadName);

        $body = $this->extractLabeledValue($message, ['body', 'message', 'content'])
            ?? $this->extractBodyBlock($message);

        if ($body === null || trim((string) $body) === '') {
            $body = $this->draftWithAi(
                message: $message,
                conversationSummary: $conversationSummary,
                recipientEmail: (string) ($to ?? $leadEmail),
                leadName: $leadName,
                senderName: $senderName,
                companyId: $companyId,
                userId: $userId,
            );
        }

        $bodyText = $this->personalizeBody(trim((string) $body), $senderName, $leadName);

        $toRecipients = [];
        if (is_string($to) && filter_var(trim($to), FILTER_VALIDATE_EMAIL)) {
            $toRecipients[] = [
                'email' => strtolower(trim($to)),
                'name' => is_string($leadName) && trim($leadName) !== '' ? trim($leadName) : null,
            ];
        } elseif ($leadEmail !== '' && filter_var($leadEmail, FILTER_VALIDATE_EMAIL)) {
            $toRecipients[] = [
                'email' => strtolower($leadEmail),
                'name' => is_string($leadName) && trim($leadName) !== '' ? trim($leadName) : null,
            ];
        }

        $gmailStatus = $this->gmailIntegrationStatus($companyId, $userId);

        return [
            'lead_id' => $leadId,
            'lead_name' => $leadName,
            'lead_email' => $leadEmail !== '' ? $leadEmail : null,
            'to' => $toRecipients,
            'cc' => [],
            'bcc' => [],
            'subject' => Str::limit(trim((string) $subject), 255, ''),
            'body_text' => $bodyText,
            'body_html' => '<p>' . nl2br(e($bodyText)) . '</p>',
            '__inference' => [
                'lead_resolved' => $leadId !== null,
                'recipient_resolved' => $toRecipients !== [],
                'gmail_connection_required' => ($gmailStatus['gmail_ready'] ?? false) !== true,
                'gmail_status' => $gmailStatus,
            ],
        ];
    }

    /**
     * @param  array<string,mixed>  $actionArgs
     * @return array<string,mixed>
     */
    public function normalizeProvidedArgs(int $companyId, array $actionArgs, ?int $userId = null): array
    {
        if ((! isset($actionArgs['lead_id']) || (int) ($actionArgs['lead_id'] ?? 0) <= 0)
            && is_string($actionArgs['lead_name'] ?? null)
            && trim((string) $actionArgs['lead_name']) !== '') {
            $lead = $this->resolveLeadByName($companyId, (string) $actionArgs['lead_name']);
            if ($lead !== null) {
                $actionArgs['lead_id'] = (int) $lead->id;
                $actionArgs['lead_name'] = (string) $lead->name;
                $actionArgs['lead_email'] = $lead->email;
            }
        }

        if (isset($actionArgs['to_email']) && is_string($actionArgs['to_email']) && trim($actionArgs['to_email']) !== '') {
            $actionArgs['to'] = [[
                'email' => strtolower(trim($actionArgs['to_email'])),
                'name' => is_string($actionArgs['lead_name'] ?? null) ? trim((string) $actionArgs['lead_name']) : null,
            ]];
        }

        if (! isset($actionArgs['to']) || ! is_array($actionArgs['to'])) {
            $email = trim((string) ($actionArgs['to_email'] ?? $actionArgs['email'] ?? $actionArgs['lead_email'] ?? ''));
            if ($email !== '') {
                $actionArgs['to'] = [['email' => $email, 'name' => $actionArgs['to_name'] ?? $actionArgs['lead_name'] ?? null]];
            }
        }

        if (isset($actionArgs['lead_id']) && ! isset($actionArgs['company_id'])) {
            $lead = Lead::query()
                ->where('company_id', $companyId)
                ->find((int) $actionArgs['lead_id']);

            if ($lead) {
                $actionArgs['lead_name'] = (string) $lead->name;
                $actionArgs['lead_email'] = $lead->email;

                if (empty($actionArgs['to']) && is_string($lead->email) && trim($lead->email) !== '') {
                    $actionArgs['to'] = [['email' => strtolower(trim($lead->email)), 'name' => (string) $lead->name]];
                }
            }
        }

        if (isset($actionArgs['body_text']) && is_string($actionArgs['body_text'])) {
            $senderName = $this->resolveSenderName($userId);
            $leadName = is_string($actionArgs['lead_name'] ?? null) ? (string) $actionArgs['lead_name'] : null;
            $actionArgs['body_text'] = $this->personalizeBody($actionArgs['body_text'], $senderName, $leadName);
        }

        if (! isset($actionArgs['body_html']) && isset($actionArgs['body_text'])) {
            $actionArgs['body_html'] = '<p>' . nl2br(e((string) $actionArgs['body_text'])) . '</p>';
        }

        return $actionArgs;
    }

    /**
     * @param  array<string,mixed>  $args
     * @return array<int,string>
     */
    public function warningCodes(array $args): array
    {
        $codes = [];

        if (! isset($args['lead_id']) || (int) ($args['lead_id'] ?? 0) <= 0) {
            $codes[] = 'lead_unresolved';
        }

        $to = is_array($args['to'] ?? null) ? $args['to'] : [];
        $hasRecipient = collect($to)->contains(
            static fn (mixed $recipient): bool => is_array($recipient)
                && filter_var(trim((string) ($recipient['email'] ?? '')), FILTER_VALIDATE_EMAIL) !== false,
        );

        if (! $hasRecipient) {
            $fallbackEmail = trim((string) ($args['lead_email'] ?? $args['to_email'] ?? ''));
            if ($fallbackEmail === '' || filter_var($fallbackEmail, FILTER_VALIDATE_EMAIL) === false) {
                $codes[] = 'recipient_email_missing';
            }
        }

        return $codes;
    }

    /**
     * @return array{gmail_ready: bool, requires_connection: bool, requires_gmail_reconnect: bool}
     */
    public function gmailIntegrationStatus(int $companyId, ?int $userId = null): array
    {
        if ($userId !== null && $userId > 0) {
            $userConnection = UserCalendarConnection::query()
                ->where('company_id', $companyId)
                ->where('user_id', $userId)
                ->where('status', 'active')
                ->whereNull('disconnected_at')
                ->first();

            if ($userConnection !== null) {
                $gmailEnabled = GoogleScopeHelper::connectionHasGmailScopes($userConnection);

                return [
                    'gmail_ready' => $gmailEnabled,
                    'requires_connection' => false,
                    'requires_gmail_reconnect' => ! $gmailEnabled,
                ];
            }
        }

        $connection = CompanyCalendarConnection::query()
            ->where('company_id', $companyId)
            ->where('status', 'active')
            ->whereNull('disconnected_at')
            ->first();

        if ($connection === null) {
            return [
                'gmail_ready' => false,
                'requires_connection' => true,
                'requires_gmail_reconnect' => false,
            ];
        }

        $gmailEnabled = GoogleScopeHelper::connectionHasGmailScopes($connection);

        return [
            'gmail_ready' => $gmailEnabled,
            'requires_connection' => false,
            'requires_gmail_reconnect' => ! $gmailEnabled,
        ];
    }

    /**
     * @param  array<string, string>  $entities
     */
    private function resolveLead(
        string $message,
        int $companyId,
        array $entities,
        string $conversationSummary,
        ?string $threadId,
        ?int $userId,
    ): ?Lead {
        if (isset($entities['lead_id']) && (int) $entities['lead_id'] > 0) {
            return Lead::query()
                ->where('company_id', $companyId)
                ->find((int) $entities['lead_id']);
        }

        $candidateNames = [];

        $messageName = $this->extractLeadNameFromMessage($message);
        if (is_string($messageName) && $messageName !== '') {
            $candidateNames[] = $messageName;
        }

        foreach ($this->extractLeadNamesFromThread($threadId, $companyId, $userId) as $name) {
            $candidateNames[] = $name;
        }

        foreach ($this->extractLeadNamesFromConversation($conversationSummary) as $name) {
            $candidateNames[] = $name;
        }

        $labeledName = $this->extractLabeledValue($message, ['lead', 'lead name', 'customer', 'client', 'business']);
        if (is_string($labeledName) && trim($labeledName) !== '') {
            $candidateNames[] = trim($labeledName);
        }

        $candidateNames = array_values(array_unique(array_filter(
            array_map(static fn (string $name): string => trim($name), $candidateNames),
            static fn (string $name): bool => $name !== '' && strlen($name) >= 2,
        )));

        foreach ($candidateNames as $candidateName) {
            $lead = $this->resolveLeadByName($companyId, $candidateName);
            if ($lead !== null) {
                return $lead;
            }
        }

        return null;
    }

    private function resolveLeadByName(int $companyId, string $name): ?Lead
    {
        $trimmed = trim($name);
        if ($trimmed === '') {
            return null;
        }

        $exact = Lead::query()
            ->where('company_id', $companyId)
            ->whereRaw('LOWER(name) = ?', [strtolower($trimmed)])
            ->first();

        if ($exact !== null) {
            return $exact;
        }

        return Lead::query()
            ->where('company_id', $companyId)
            ->where(function ($query) use ($trimmed): void {
                $query->where('name', 'like', '%' . $trimmed . '%')
                    ->orWhereRaw('LOWER(name) LIKE ?', ['%' . strtolower($trimmed) . '%']);
            })
            ->orderByRaw('CASE WHEN LOWER(name) LIKE ? THEN 0 ELSE 1 END', [strtolower($trimmed) . '%'])
            ->first();
    }

    private function extractLeadNameFromMessage(string $message): ?string
    {
        $patterns = [
            '/\b(?:send|write|draft)\s+(?:a\s+)?(?:follow[\s-]?up\s+)?(?:email|mail|message)\s+(?:to|for|with)\s+(.+?)(?:\?|\.|$)/i',
            '/\b(?:follow[\s-]?up)\s+(?:with|to)\s+(.+?)(?:\?|\.|$)/i',
            '/\b(?:send)\s+(?:a\s+)?follow[\s-]?up\s+(?:to|with)\s+(.+?)(?:\?|\.|$)/i',
            '/\b(?:email|mail|message|contact|reach\s+out\s+to)\s+(.+?)(?:\?|\.|$)/i',
        ];

        foreach ($patterns as $pattern) {
            if (preg_match($pattern, $message, $matches) !== 1) {
                continue;
            }

            $candidate = $this->cleanLeadNameToken((string) ($matches[1] ?? ''));
            if ($candidate !== '') {
                return $candidate;
            }
        }

        return null;
    }

    /**
     * @return array<int, string>
     */
    private function extractLeadNamesFromThread(?string $threadId, ?int $companyId, ?int $userId): array
    {
        if (! is_string($threadId) || $threadId === '' || $companyId === null || $userId === null) {
            return [];
        }

        $thread = $this->conversationMemoryService->getThread($companyId, $userId, $threadId);
        if (! is_array($thread)) {
            return [];
        }

        $names = [];
        $messages = is_array($thread['messages'] ?? null) ? $thread['messages'] : [];

        foreach (array_reverse($messages) as $msg) {
            if (! is_array($msg)) {
                continue;
            }

            $payload = is_array($msg['payload'] ?? null) ? $msg['payload'] : [];
            $items = is_array($payload['items'] ?? null) ? $payload['items'] : [];

            foreach ($items as $item) {
                if (! is_array($item)) {
                    continue;
                }

                $name = trim((string) ($item['name'] ?? ''));
                if ($name !== '') {
                    $names[] = $name;
                }
            }
        }

        return array_values(array_unique($names));
    }

    /**
     * @return array<int, string>
     */
    private function extractLeadNamesFromConversation(string $conversationSummary): array
    {
        if (trim($conversationSummary) === '') {
            return [];
        }

        $names = [];
        if (preg_match_all('/\b\d+\.\s+([^—\-\n]+?)\s*(?:—|-)/u', $conversationSummary, $matches) > 0) {
            foreach ($matches[1] as $match) {
                $name = $this->cleanLeadNameToken((string) $match);
                if ($name !== '') {
                    $names[] = $name;
                }
            }
        }

        return array_values(array_unique($names));
    }

    private function cleanLeadNameToken(string $token): string
    {
        $cleaned = trim($token);
        $cleaned = preg_replace('/\s+/', ' ', $cleaned) ?? $cleaned;
        $cleaned = rtrim($cleaned, ',.;:!?');
        $cleaned = preg_replace('/\b(about|regarding|on|for|the|a|an|please|thanks|thank\s+you)\b$/i', '', $cleaned) ?? $cleaned;

        return trim($cleaned);
    }

    private function resolveSenderName(?int $userId): string
    {
        if ($userId === null || $userId <= 0) {
            return '';
        }

        $user = User::query()->find($userId);

        return trim((string) ($user?->name ?? ''));
    }

    private function personalizeBody(string $body, string $senderName, ?string $leadName): string
    {
        $replacements = [];

        if ($senderName !== '') {
            $replacements['/[{\[]\s*your\s*name\s*[}\]]/i'] = $senderName;
            $replacements['/\{\{\s*your_name\s*\}\}/i'] = $senderName;
            $replacements['/\{\{\s*sender_name\s*\}\}/i'] = $senderName;
            $replacements['/\[Your Name\]/'] = $senderName;
        }

        if (is_string($leadName) && trim($leadName) !== '') {
            $replacements['/[{\[]\s*lead\s*name\s*[}\]]/i'] = $leadName;
            $replacements['/\{\{\s*lead_name\s*\}\}/i'] = $leadName;
            $replacements['/\[Lead Name\]/'] = $leadName;
            $replacements['/\[Company Name\]/'] = $leadName;
        }

        foreach ($replacements as $pattern => $replacement) {
            $body = preg_replace($pattern, $replacement, $body) ?? $body;
        }

        return $body;
    }

    private function inferSubjectFromMessage(string $message, ?string $leadName): string
    {
        if (preg_match('/\bregarding\s+(.+?)(?:\.|$)/i', $message, $matches) === 1) {
            return 'Regarding ' . trim((string) $matches[1]);
        }

        if (is_string($leadName) && trim($leadName) !== '') {
            return 'Follow-up: ' . trim($leadName);
        }

        return 'Follow-up';
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

    private function extractBodyBlock(string $message): ?string
    {
        if (preg_match('/\bbody\s*:\s*([\s\S]+)$/i', $message, $matches) === 1) {
            return trim((string) $matches[1]);
        }

        return null;
    }

    private function draftWithAi(
        string $message,
        string $conversationSummary,
        string $recipientEmail,
        ?string $leadName,
        string $senderName,
        int $companyId,
        ?int $userId = null,
    ): string {
        $leadLabel = is_string($leadName) && trim($leadName) !== '' ? trim($leadName) : 'the lead';
        $signature = $senderName !== '' ? $senderName : 'Your team';

        $userPrompt = "Draft a concise professional CRM follow-up email based on this request.\n"
            . "Lead: {$leadLabel}\n"
            . "Recipient email: {$recipientEmail}\n"
            . "Sender name for signature: {$signature}\n"
            . "Request: {$message}\n"
            . "Context: {$conversationSummary}\n"
            . "Sign the email with the sender name. Do not use placeholder tokens like [Your Name].";

        try {
            $result = $this->aiProviderRouter->generateForPurpose(
                purpose: 'operational',
                systemPrompt: 'You write polished business emails for CRM follow-up. Use the provided sender name in the sign-off.',
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

            $draft = trim((string) ($result?->text ?? ''));

            return $this->personalizeBody($draft, $senderName, $leadName);
        } catch (\Throwable) {
            $greeting = is_string($leadName) && trim($leadName) !== ''
                ? 'Dear ' . trim($leadName) . ' Team,'
                : 'Hello,';

            return $this->personalizeBody(
                $greeting . "\n\n"
                . "I wanted to follow up regarding our recent conversation. Please let me know if you have any updates or questions.\n\n"
                . "Best regards,\n"
                . ($senderName !== '' ? $senderName : 'Your team'),
                $senderName,
                $leadName,
            );
        }
    }
}
