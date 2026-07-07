<?php

declare(strict_types=1);

namespace App\Services\AI;

use App\Services\AI\Policy\ToolPolicyService;
use App\Services\AI\Providers\AiGenerationResult;
use App\Services\AI\Providers\AiProviderRouter;
use Illuminate\Support\Str;

class LlmIntentRouter
{
    public function __construct(
        private readonly AiProviderRouter $aiProviderRouter,
        private readonly ToolPolicyService $toolPolicyService,
    ) {}

    /**
     * @param  array<int, array{role:string,content:string}>  $recentMessages
     * @return array{type:string,tool:?string,confidence:float,extracted_entities:array<string,string>}|null
     */
    public function route(
        string $message,
        string $role,
        array $recentMessages = [],
        ?int $companyId = null,
        ?int $userId = null,
        ?string $sessionId = null,
    ): ?array {
        $allowedTools = $this->toolPolicyService->allowedToolsForRole($role);
        if ($allowedTools === []) {
            return null;
        }

        $toolCatalog = $this->buildToolCatalog($allowedTools);
        $recent = collect($recentMessages)
            ->take(-4)
            ->map(static fn (array $item): string => sprintf('%s: %s', $item['role'] ?? 'user', Str::limit((string) ($item['content'] ?? ''), 180)))
            ->implode("\n");

        $systemPrompt = <<<'PROMPT'
You are ELY's intent router for a workforce CRM and operations platform.
Classify the user's latest message into one of:
- tool: fetch read-only operational data
- action: create/update/send something that needs confirmation
- chat: general conversation without a specific tool

Return ONLY valid JSON with keys:
intent, tool, confidence, extracted_entities

Rules:
- tool must be one of the allowed tools listed, or null for chat
- confidence is 0.0 to 1.0
- extracted_entities is an object of simple strings (agent, date, timeframe, lead, project, etc.)
- Prefer a concrete tool/action when the user clearly wants operational help
- Use chat only when no listed tool/action fits
PROMPT;

        $userPrompt = "Allowed tools and actions:\n{$toolCatalog}\n\nRecent conversation:\n{$recent}\n\nLatest user message:\n{$message}";

        $result = $this->aiProviderRouter->generateForPurpose(
            purpose: 'routing',
            systemPrompt: $systemPrompt,
            userPrompt: $userPrompt,
            options: [
                'company_id' => $companyId,
                'max_tokens' => 220,
                'temperature' => 0,
                '_log' => [
                    'company_id' => $companyId,
                    'user_id' => $userId,
                    'session_id' => $sessionId,
                    'intent_type' => 'routing',
                    'routing_purpose' => 'routing',
                    'user_prompt' => mb_substr($message, 0, 10000),
                ],
            ],
        );

        if (! $result instanceof AiGenerationResult || ! $result->isSuccessful()) {
            return null;
        }

        return $this->parseRouterResponse((string) $result->text, $allowedTools);
    }

    /**
     * @param  array<int, string>  $allowedTools
     */
    private function buildToolCatalog(array $allowedTools): string
    {
        $descriptions = [
            'crm.top_leads' => 'List or count CRM leads / pipeline',
            'crm.stale_leads' => 'Leads not contacted recently',
            'crm.follow_up_summary' => 'Follow-up recommendations',
            'tasks.overdue' => 'Overdue or due-today tasks',
            'planning.daily' => 'Plan my day / priorities',
            'meetings.today' => 'Meetings today / calendar',
            'attendance.today_summary' => 'Attendance snapshot',
            'dashboard.overview' => 'Dashboard / KPI snapshot',
            'kpi.team_performance' => 'Team performance ranking',
            'tracking.active_agents' => 'Active agents / where is agent',
            'projects.at_risk_summary' => 'Projects at risk',
            'org.users' => 'List organization users',
            'tasks.create' => 'Create a task',
            'tasks.reassign' => 'Reassign a task',
            'meetings.schedule' => 'Schedule a meeting',
            'kpis.create' => 'Create a KPI',
            'crm.create_lead' => 'Add CRM lead',
            'crm.send_email' => 'Send CRM email',
            'crm.log_visit' => 'Log a field visit',
            'projects.create' => 'Create a project',
            'notifications.send' => 'Send notification',
        ];

        $lines = [];
        foreach ($allowedTools as $tool) {
            $lines[] = '- ' . $tool . ': ' . ($descriptions[$tool] ?? 'Platform tool');
        }

        return implode("\n", $lines);
    }

    /**
     * @param  array<int, string>  $allowedTools
     * @return array{type:string,tool:?string,confidence:float,extracted_entities:array<string,string>}|null
     */
    private function parseRouterResponse(string $raw, array $allowedTools): ?array
    {
        $json = $this->extractJsonObject($raw);
        if ($json === null) {
            return null;
        }

        $intent = strtolower(trim((string) ($json['intent'] ?? 'chat')));
        if (! in_array($intent, ['tool', 'action', 'chat'], true)) {
            $intent = 'chat';
        }

        $tool = isset($json['tool']) && is_string($json['tool']) ? trim($json['tool']) : null;
        if ($tool === '' || ($tool !== null && ! in_array($tool, $allowedTools, true))) {
            $tool = null;
            if ($intent !== 'chat') {
                $intent = 'chat';
            }
        }

        if ($intent === 'chat') {
            $tool = null;
        }

        $confidence = (float) ($json['confidence'] ?? 0.0);
        $confidence = max(0.0, min(1.0, $confidence));

        $entities = [];
        if (is_array($json['extracted_entities'] ?? null)) {
            foreach ($json['extracted_entities'] as $key => $value) {
                if (is_string($key) && is_scalar($value)) {
                    $entities[$key] = trim((string) $value);
                }
            }
        }

        return [
            'type' => $intent,
            'tool' => $tool,
            'confidence' => $confidence,
            'extracted_entities' => $entities,
        ];
    }

    /**
     * @return array<string, mixed>|null
     */
    private function extractJsonObject(string $raw): ?array
    {
        $trimmed = trim($raw);
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
