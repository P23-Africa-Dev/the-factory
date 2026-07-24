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
        $messageName = $this->extractLeadNameFromMessage($message);
        $lead = $this->resolveLead(
            message: $message,
            companyId: $companyId,
            entities: $entities,
            conversationSummary: $conversationSummary,
            threadId: $threadId,
            userId: $userId,
            preferMessageNameOnly: is_string($messageName) && $messageName !== '',
        );

        $leadId = $lead?->id;
        $leadName = $lead?->name;
        $leadEmail = is_string($lead?->email) ? trim((string) $lead->email) : '';

        $to = $this->extractLabeledValue($message, ['to', 'recipient', 'email to'])
            ?? ($entities['lead_email'] ?? null)
            ?? ($leadEmail !== '' ? $leadEmail : null);

        $labeledSubject = $this->extractLabeledValue($message, ['subject', 'title']);
        $labeledBody = $this->extractLabeledValue($message, ['body', 'message', 'content'])
            ?? $this->extractBodyBlock($message);

        $draftedSubject = null;
        $body = $labeledBody;

        if ($body === null || trim((string) $body) === '') {
            $drafted = $this->draftWithAi(
                message: $message,
                conversationSummary: $conversationSummary,
                recipientEmail: (string) ($to ?? $leadEmail),
                leadName: $leadName,
                senderName: $senderName,
                companyId: $companyId,
                userId: $userId,
            );
            $draftedSubject = $drafted['subject'];
            $body = $drafted['body_text'];
        }

        $parsed = $this->peelSubjectFromBody(trim((string) $body));
        $bodyText = $this->personalizeBody($parsed['body_text'], $senderName, $leadName);

        $subject = $labeledSubject
            ?? $draftedSubject
            ?? $parsed['subject']
            ?? $this->inferSubjectFromMessage($message, $leadName);

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
                'message_named_lead' => $messageName,
            ],
        ];
    }

    /**
     * @return array{subject: string, body_text: string}
     */
    public function regenerateDraft(
        int $companyId,
        ?int $userId,
        ?int $leadId,
        string $toEmail,
        string $subject,
        string $bodyText,
        ?string $userNote = null,
    ): array {
        $lead = $leadId !== null
            ? Lead::query()->where('company_id', $companyId)->find($leadId)
            : null;
        $leadName = is_string($lead?->name) ? (string) $lead->name : null;
        $senderName = $this->resolveSenderName($userId);
        $note = is_string($userNote) ? trim($userNote) : '';

        $request = 'Regenerate a completely new CRM email draft.'
            . ($note !== '' ? " Guidance: {$note}" : '')
            . " Current subject (weak hint only): {$subject}"
            . " Current body (weak hint only): {$bodyText}";

        return $this->composeStructuredDraft(
            request: $request,
            conversationSummary: '',
            recipientEmail: $toEmail,
            leadName: $leadName,
            senderName: $senderName,
            companyId: $companyId,
            userId: $userId,
            mode: 'regenerate',
            fallbackSubject: $subject !== '' ? $subject : $this->inferSubjectFromMessage($request, $leadName),
            fallbackBody: $bodyText,
        );
    }

    /**
     * @return array{subject: string, body_text: string}
     */
    public function enhanceDraft(
        int $companyId,
        ?int $userId,
        ?int $leadId,
        string $toEmail,
        string $subject,
        string $bodyText,
        ?string $userNote = null,
    ): array {
        $lead = $leadId !== null
            ? Lead::query()->where('company_id', $companyId)->find($leadId)
            : null;
        $leadName = is_string($lead?->name) ? (string) $lead->name : null;
        $senderName = $this->resolveSenderName($userId);
        $note = is_string($userNote) ? trim($userNote) : '';

        $request = 'Enhance and polish this CRM email while preserving the user intent and topic.'
            . ($note !== '' ? " Extra guidance: {$note}" : '')
            . " Subject: {$subject}\nBody:\n{$bodyText}";

        return $this->composeStructuredDraft(
            request: $request,
            conversationSummary: '',
            recipientEmail: $toEmail,
            leadName: $leadName,
            senderName: $senderName,
            companyId: $companyId,
            userId: $userId,
            mode: 'enhance',
            fallbackSubject: $subject,
            fallbackBody: $bodyText,
        );
    }

    public function looksLikeEmailReset(string $message): bool
    {
        $normalized = strtolower(trim($message));
        if ($normalized === '') {
            return false;
        }

        return preg_match('/\b(forget|ignore|disregard|reset|start\s+over|clear)\b.{0,40}\b(history|previous|prior|earlier|that|the\s+\d+\s*pm|meeting|context|draft)\b/i', $normalized) === 1
            || preg_match('/\b(forget|ignore|disregard)\s+(our\s+)?history\b/i', $normalized) === 1
            || preg_match('/\bnew\s+email\b/i', $normalized) === 1
            || preg_match('/\breason\s+well\b/i', $normalized) === 1;
    }

    public function looksLikeFreshEmailRequest(string $message): bool
    {
        $normalized = strtolower(trim($message));
        if ($normalized === '') {
            return false;
        }

        return preg_match('/\b(send|write|draft|compose|generate)\b.{0,40}\b(email|mail|message|follow[\s-]?up)\b/i', $normalized) === 1
            || preg_match('/\b(email|mail)\s+(to|for)\b/i', $normalized) === 1
            || preg_match('/\bfollow[\s-]?up\s+(with|to|on)\b/i', $normalized) === 1;
    }

    public function looksLikeEmailFieldCorrection(string $message): bool
    {
        $normalized = strtolower(trim($message));
        if ($normalized === '') {
            return false;
        }

        return preg_match('/\b(change|update|set|fix|correct)\s+(the\s+)?(subject|body|message|content|recipient|to|lead)\b/i', $normalized) === 1
            || preg_match('/\b(subject|body|message)\s*(to|=|:)\s*.+/i', $normalized) === 1
            || preg_match('/\bsend\s+to\s+.+\s+instead\b/i', $normalized) === 1;
    }

    /**
     * @param  array<string, mixed>  $pendingArgs
     * @return array<string, mixed>
     */
    public function patchFromCorrection(string $message, array $pendingArgs, int $companyId, ?int $userId = null): array
    {
        $patched = $pendingArgs;

        if (preg_match('/\b(?:change|update|set|fix)\s+(?:the\s+)?subject\s*(?:to|=|:)?\s*(.+)$/i', $message, $m) === 1) {
            $patched['subject'] = trim((string) $m[1]);
        }

        if (preg_match('/\b(?:change|update|set|fix)\s+(?:the\s+)?(?:body|message|content)\s*(?:to|=|:)?\s*([\s\S]+)$/i', $message, $m) === 1) {
            $patched['body_text'] = trim((string) $m[1]);
        }

        if (preg_match('/\b(?:send\s+to|change\s+(?:the\s+)?(?:lead|recipient)\s+to)\s+(.+?)(?:\?|\.|$)/i', $message, $m) === 1) {
            $name = $this->cleanLeadNameToken((string) $m[1]);
            if ($name !== '') {
                $lead = $this->resolveLeadByName($companyId, $name);
                if ($lead !== null) {
                    $patched['lead_id'] = (int) $lead->id;
                    $patched['lead_name'] = (string) $lead->name;
                    $patched['lead_email'] = $lead->email;
                    if (is_string($lead->email) && trim((string) $lead->email) !== '') {
                        $patched['to'] = [[
                            'email' => strtolower(trim((string) $lead->email)),
                            'name' => (string) $lead->name,
                        ]];
                        $patched['to_email'] = strtolower(trim((string) $lead->email));
                    }
                }
            }
        }

        return $this->normalizeProvidedArgs($companyId, $patched, $userId);
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
            $parsed = $this->peelSubjectFromBody($actionArgs['body_text']);
            if (
                (! isset($actionArgs['subject']) || trim((string) $actionArgs['subject']) === '' || preg_match('/^follow-up:/i', (string) $actionArgs['subject']) === 1)
                && is_string($parsed['subject'])
                && trim($parsed['subject']) !== ''
            ) {
                $actionArgs['subject'] = $parsed['subject'];
            }
            $actionArgs['body_text'] = $this->personalizeBody($parsed['body_text'], $senderName, $leadName);
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
        bool $preferMessageNameOnly = false,
    ): ?Lead {
        if (isset($entities['lead_id']) && (int) $entities['lead_id'] > 0) {
            return Lead::query()
                ->where('company_id', $companyId)
                ->find((int) $entities['lead_id']);
        }

        $messageName = $this->extractLeadNameFromMessage($message);
        $labeledName = $this->extractLabeledValue($message, ['lead', 'lead name', 'customer', 'client', 'business']);

        $messageCandidates = [];
        if (is_string($messageName) && $messageName !== '') {
            $messageCandidates[] = $messageName;
        }
        if (is_string($labeledName) && trim($labeledName) !== '') {
            $messageCandidates[] = trim($labeledName);
        }

        foreach (array_values(array_unique($messageCandidates)) as $candidateName) {
            $lead = $this->resolveLeadByName($companyId, $candidateName);
            if ($lead !== null) {
                return $lead;
            }
        }

        // If the user named a lead explicitly and it did not resolve, do not silently pick another list lead.
        if ($preferMessageNameOnly || $messageCandidates !== []) {
            return null;
        }

        if (preg_match('/\b(them|this\s+lead|that\s+lead|the\s+same\s+lead)\b/i', $message) === 1) {
            $previousEmailLead = $this->findPreviousSendEmailLead($threadId, $companyId, $userId);
            if ($previousEmailLead !== null) {
                return $previousEmailLead;
            }
        }

        $candidateNames = [];
        foreach ($this->extractLeadNamesFromThread($threadId, $companyId, $userId, preferSendEmailPayloads: true) as $name) {
            $candidateNames[] = $name;
        }

        foreach ($this->extractLeadNamesFromConversation($conversationSummary) as $name) {
            $candidateNames[] = $name;
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
        if ($trimmed === '' || strlen($trimmed) < 2) {
            return null;
        }

        $exact = Lead::query()
            ->where('company_id', $companyId)
            ->whereRaw('LOWER(name) = ?', [strtolower($trimmed)])
            ->first();

        if ($exact !== null) {
            return $exact;
        }

        // Prefer prefix match over loose substring; require at least 3 chars for fuzzy.
        if (strlen($trimmed) < 3) {
            return null;
        }

        $prefix = Lead::query()
            ->where('company_id', $companyId)
            ->whereRaw('LOWER(name) LIKE ?', [strtolower($trimmed) . '%'])
            ->orderBy('id')
            ->first();

        if ($prefix !== null) {
            return $prefix;
        }

        $wordBoundary = Lead::query()
            ->where('company_id', $companyId)
            ->whereRaw('LOWER(name) LIKE ?', ['%' . strtolower($trimmed) . '%'])
            ->get()
            ->first(static function (Lead $lead) use ($trimmed): bool {
                return preg_match('/\b' . preg_quote(strtolower($trimmed), '/') . '\b/i', strtolower((string) $lead->name)) === 1;
            });

        return $wordBoundary instanceof Lead ? $wordBoundary : null;
    }

    private function extractLeadNameFromMessage(string $message): ?string
    {
        $patterns = [
            '/\b(?:send|write|draft|compose|generate)\s+(?:an?\s+)?(?:follow[\s-]?up\s+)?(?:email|mail|message)\s+(?:to|for|with|on)\s+(.+?)(?:\?|\.|$)/i',
            '/\b(?:send)\s+(?:an?\s+)?email\s+to\s+(.+?)(?:\?|\.|$)/i',
            '/\b(?:follow[\s-]?up)\s+(?:with|to|on)\s+(.+?)(?:\?|\.|$)/i',
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
    private function extractLeadNamesFromThread(
        ?string $threadId,
        ?int $companyId,
        ?int $userId,
        bool $preferSendEmailPayloads = false,
    ): array {
        if (! is_string($threadId) || $threadId === '' || $companyId === null || $userId === null) {
            return [];
        }

        $thread = $this->conversationMemoryService->getThread($companyId, $userId, $threadId);
        if (! is_array($thread)) {
            return [];
        }

        $sendEmailNames = [];
        $listNames = [];
        $messages = is_array($thread['messages'] ?? null) ? $thread['messages'] : [];

        foreach (array_reverse($messages) as $msg) {
            if (! is_array($msg)) {
                continue;
            }

            $tool = (string) ($msg['tool'] ?? '');
            $payload = is_array($msg['payload'] ?? null) ? $msg['payload'] : [];
            $args = is_array($payload['action_args'] ?? null) ? $payload['action_args'] : [];

            if ($tool === 'crm.send_email') {
                $name = trim((string) ($args['lead_name'] ?? $payload['lead_name'] ?? ''));
                if ($name !== '') {
                    $sendEmailNames[] = $name;
                }
            }

            $items = is_array($payload['items'] ?? null) ? $payload['items'] : [];
            foreach ($items as $item) {
                if (! is_array($item)) {
                    continue;
                }

                $name = trim((string) ($item['name'] ?? ''));
                if ($name !== '') {
                    $listNames[] = $name;
                }
            }
        }

        if ($preferSendEmailPayloads && $sendEmailNames !== []) {
            return array_values(array_unique($sendEmailNames));
        }

        return array_values(array_unique([...$sendEmailNames, ...$listNames]));
    }

    private function findPreviousSendEmailLead(?string $threadId, ?int $companyId, ?int $userId): ?Lead
    {
        if (! is_string($threadId) || $threadId === '' || $companyId === null || $userId === null) {
            return null;
        }

        $thread = $this->conversationMemoryService->getThread($companyId, $userId, $threadId);
        if (! is_array($thread)) {
            return null;
        }

        $messages = is_array($thread['messages'] ?? null) ? $thread['messages'] : [];
        foreach (array_reverse($messages) as $msg) {
            if (! is_array($msg) || (string) ($msg['tool'] ?? '') !== 'crm.send_email') {
                continue;
            }

            $payload = is_array($msg['payload'] ?? null) ? $msg['payload'] : [];
            $args = is_array($payload['action_args'] ?? null) ? $payload['action_args'] : [];
            $leadId = (int) ($args['lead_id'] ?? 0);
            if ($leadId > 0) {
                $lead = Lead::query()->where('company_id', $companyId)->find($leadId);
                if ($lead !== null) {
                    return $lead;
                }
            }

            $name = trim((string) ($args['lead_name'] ?? ''));
            if ($name !== '') {
                $lead = $this->resolveLeadByName($companyId, $name);
                if ($lead !== null) {
                    return $lead;
                }
            }
        }

        return null;
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
        $cleaned = preg_replace('/^(follow[\s-]?up\s+(?:on|with|to)\s+)/i', '', $cleaned) ?? $cleaned;

        // Cut trailing intent clauses before stop-word cleanup.
        $cleaned = preg_replace(
            '/\b(active\s+to|asking|to\s+find\s+out|find\s+out|if\s+we|whether|about|regarding|concerning|soon|on\s+the\s+meeting|by\s+\d).*$/i',
            '',
            $cleaned,
        ) ?? $cleaned;

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
            return 'Regarding ' . Str::limit(trim((string) $matches[1]), 120, '');
        }

        if (preg_match('/\babout\s+(.+?)(?:\.|$)/i', $message, $matches) === 1) {
            $topic = trim((string) $matches[1]);
            if ($topic !== '' && ! preg_match('/^(them|him|her|it|this|that)\b/i', $topic)) {
                return Str::limit(ucfirst($topic), 120, '');
            }
        }

        if (preg_match('/\b(factory\s*23|factory23)\b/i', $message) === 1) {
            return 'Factory23 update';
        }

        if (preg_match('/\bmeeting\b/i', $message) === 1) {
            return 'Following up on our meeting';
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

    /**
     * @return array{subject: ?string, body_text: string}
     */
    private function peelSubjectFromBody(string $body): array
    {
        $trimmed = trim($body);
        if (preg_match('/^\s*subject\s*:\s*(.+?)\s*(?:\r?\n)+([\s\S]*)$/i', $trimmed, $matches) === 1) {
            return [
                'subject' => trim((string) $matches[1]),
                'body_text' => trim((string) $matches[2]),
            ];
        }

        return [
            'subject' => null,
            'body_text' => $trimmed,
        ];
    }

    /**
     * @return array{subject: string, body_text: string}
     */
    private function draftWithAi(
        string $message,
        string $conversationSummary,
        string $recipientEmail,
        ?string $leadName,
        string $senderName,
        int $companyId,
        ?int $userId = null,
    ): array {
        return $this->composeStructuredDraft(
            request: $message,
            conversationSummary: $conversationSummary,
            recipientEmail: $recipientEmail,
            leadName: $leadName,
            senderName: $senderName,
            companyId: $companyId,
            userId: $userId,
            mode: 'draft',
            fallbackSubject: $this->inferSubjectFromMessage($message, $leadName),
            fallbackBody: null,
        );
    }

    /**
     * @return array{subject: string, body_text: string}
     */
    private function composeStructuredDraft(
        string $request,
        string $conversationSummary,
        string $recipientEmail,
        ?string $leadName,
        string $senderName,
        int $companyId,
        ?int $userId,
        string $mode,
        string $fallbackSubject,
        ?string $fallbackBody,
    ): array {
        $leadLabel = is_string($leadName) && trim($leadName) !== '' ? trim($leadName) : 'the lead';
        $signature = $senderName !== '' ? $senderName : 'Your team';
        $contextBlock = trim($conversationSummary) !== ''
            ? "Context (use only if clearly about this lead/email request; ignore unrelated task/CRM bug/meeting talk unless requested):\n{$conversationSummary}\n"
            : "Context: none\n";

        $modeInstruction = match ($mode) {
            'regenerate' => 'Write a fresh email. Treat prior subject/body as weak hints only; do not copy them wholesale.',
            'enhance' => 'Polish the provided subject/body. Keep the same intent and topic. Improve clarity, structure, and professionalism.',
            default => 'Draft from the current Request. Prefer the Request over Context.',
        };

        $userPrompt = "{$modeInstruction}\n"
            . "Lead: {$leadLabel}\n"
            . "Recipient email: {$recipientEmail}\n"
            . "Sender name for signature: {$signature}\n"
            . "Request: {$request}\n"
            . $contextBlock
            . "Respond ONLY with valid JSON: {\"subject\":\"...\",\"body_text\":\"...\"}. "
            . "body_text must be the email body only — never include Subject/To/From headers. "
            . "Sign with the sender name. Do not use placeholder tokens like [Your Name].";

        $systemPrompt = 'You write polished CRM business emails. Respond ONLY with valid JSON containing subject and body_text. Never invent unrelated topics from old chat history.';

        try {
            $result = $this->aiProviderRouter->generateForPurpose(
                purpose: 'operational',
                systemPrompt: $systemPrompt,
                userPrompt: $userPrompt,
                options: [
                    'max_tokens' => 700,
                    'temperature' => $mode === 'enhance' ? 0.3 : 0.4,
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

            $decoded = $this->decodeJsonObject(trim((string) ($result?->text ?? '')));
            if (is_array($decoded)) {
                $subject = Str::limit(trim((string) ($decoded['subject'] ?? '')), 255, '');
                $body = trim((string) ($decoded['body_text'] ?? $decoded['body'] ?? ''));
                $parsed = $this->peelSubjectFromBody($body);
                if ($subject === '' && is_string($parsed['subject'])) {
                    $subject = $parsed['subject'];
                }
                $body = $parsed['body_text'];

                if ($subject !== '' && $body !== '') {
                    return [
                        'subject' => $subject,
                        'body_text' => $this->personalizeBody($body, $senderName, $leadName),
                    ];
                }
            }

            // Fallback: treat raw text as body and peel any Subject header.
            $raw = trim((string) ($result?->text ?? ''));
            if ($raw !== '') {
                $parsed = $this->peelSubjectFromBody($raw);
                return [
                    'subject' => $parsed['subject'] ?? $fallbackSubject,
                    'body_text' => $this->personalizeBody($parsed['body_text'], $senderName, $leadName),
                ];
            }
        } catch (\Throwable) {
            // Fall through to template.
        }

        if (is_string($fallbackBody) && trim($fallbackBody) !== '') {
            $parsed = $this->peelSubjectFromBody($fallbackBody);

            return [
                'subject' => $parsed['subject'] ?? $fallbackSubject,
                'body_text' => $this->personalizeBody($parsed['body_text'], $senderName, $leadName),
            ];
        }

        $greeting = is_string($leadName) && trim($leadName) !== ''
            ? 'Dear ' . trim($leadName) . ','
            : 'Hello,';

        return [
            'subject' => $fallbackSubject,
            'body_text' => $this->personalizeBody(
                $greeting . "\n\n"
                . "I wanted to follow up regarding our recent conversation. Please let me know if you have any updates or questions.\n\n"
                . "Best regards,\n"
                . ($senderName !== '' ? $senderName : 'Your team'),
                $senderName,
                $leadName,
            ),
        ];
    }

    /**
     * @return array<string, mixed>|null
     */
    private function decodeJsonObject(string $text): ?array
    {
        $trimmed = trim($text);
        if ($trimmed === '') {
            return null;
        }

        if (preg_match('/\{[\s\S]*\}/', $trimmed, $matches) === 1) {
            $trimmed = $matches[0];
        }

        $decoded = json_decode($trimmed, true);

        return is_array($decoded) ? $decoded : null;
    }
}
