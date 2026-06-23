<?php

declare(strict_types=1);

namespace App\Services\AI\Crm;

use App\Models\Lead;
use App\Models\User;
use App\Services\AI\Providers\AiProviderRouter;
use App\Services\Company\CompanyContextService;
use App\Services\Crm\LeadService;
use Illuminate\Support\Facades\Validator;

class VisitAssistantService
{
    public function __construct(
        private readonly CompanyContextService $companyContextService,
        private readonly AiProviderRouter $aiProviderRouter,
        private readonly LeadService $leadService,
    ) {}

    /**
     * @param  array<string, mixed>  $args
     * @return array<string, mixed>
     */
    public function extractVisitNotes(User $user, int $companyId, array $args = []): array
    {
        $notes = trim((string) ($args['notes'] ?? ''));
        if ($notes === '') {
            return [
                'tool' => 'crm.visit_extract',
                'summary' => 'Please paste your visit notes so I can extract outcomes, opportunities, objections, and follow-up actions.',
                'payload' => ['error' => true, 'reason' => 'missing_notes'],
                'sources' => ['crm.visit_extract'],
            ];
        }

        $systemPrompt = <<<'PROMPT'
You are ELY, your AI Assistant. Extract structured visit intelligence from field notes.
Return valid JSON only with keys: summary, outcomes (array), opportunities (array), objections (array), follow_up_actions (array), suggested_crm_update (string).
Do not invent facts not present in the notes. Use empty arrays when a section has no data.
PROMPT;

        $raw = $this->aiProviderRouter->generateForPurpose(
            purpose: 'operational',
            systemPrompt: $systemPrompt,
            userPrompt: "Visit notes:\n" . $notes,
            options: ['max_tokens' => 800, 'temperature' => 0.1],
        );

        $structured = $this->parseStructuredExtraction($raw, $notes);

        return [
            'tool' => 'crm.visit_extract',
            'summary' => 'Visit notes analyzed. Review the structured extraction and confirm to log against a lead.',
            'payload' => [
                'extraction' => $structured,
                'requires_confirmation' => true,
                'suggested_action_tool' => 'crm.log_visit',
            ],
            'sources' => ['crm.visit_extract'],
        ];
    }

    /**
     * @param  array<string, mixed>  $args
     * @return array<string, mixed>
     */
    public function logVisit(User $user, int $companyId, array $args): array
    {
        $validated = Validator::make($args, [
            'lead_id' => ['required', 'integer', 'exists:leads,id'],
            'summary' => ['required', 'string', 'min:10', 'max:5000'],
            'outcomes' => ['nullable', 'array', 'max:20'],
            'outcomes.*' => ['string', 'max:500'],
            'opportunities' => ['nullable', 'array', 'max:20'],
            'opportunities.*' => ['string', 'max:500'],
            'objections' => ['nullable', 'array', 'max:20'],
            'objections.*' => ['string', 'max:500'],
            'follow_up_actions' => ['nullable', 'array', 'max:20'],
            'follow_up_actions.*' => ['string', 'max:500'],
        ])->validate();

        $lead = Lead::query()->findOrFail((int) $validated['lead_id']);
        $this->leadService->findForUser($user, $lead, $companyId);

        $noteBody = $this->formatVisitNote($validated);
        $this->leadService->addNote($user, $lead, $noteBody, $companyId);

        $followUp = collect($validated['follow_up_actions'] ?? [])->first();
        $lead->update([
            'last_interaction' => $validated['summary'],
            'last_interaction_at' => now(),
            'next_action' => is_string($followUp) && trim($followUp) !== ''
                ? $followUp
                : $lead->next_action,
        ]);

        $this->leadService->addActivity($user, $lead, [
            'type' => 'visit',
            'title' => 'Field visit logged by ELY',
            'description' => $validated['summary'],
            'happened_at' => now()->toIso8601String(),
            'meta' => [
                'outcomes' => $validated['outcomes'] ?? [],
                'opportunities' => $validated['opportunities'] ?? [],
                'objections' => $validated['objections'] ?? [],
                'follow_up_actions' => $validated['follow_up_actions'] ?? [],
            ],
        ], $companyId);

        return [
            'tool' => 'crm.log_visit',
            'summary' => "Visit logged successfully for lead '{$lead->name}'.",
            'payload' => [
                'lead_id' => (int) $lead->id,
                'lead_name' => (string) $lead->name,
            ],
            'sources' => ['crm.log_visit'],
        ];
    }

    /**
     * @return array<string, mixed>
     */
    private function parseStructuredExtraction(?string $raw, string $fallbackNotes): array
    {
        if (is_string($raw) && trim($raw) !== '') {
            $decoded = json_decode(trim($raw), true);
            if (is_array($decoded)) {
                return [
                    'summary' => (string) ($decoded['summary'] ?? ''),
                    'outcomes' => array_values(array_filter((array) ($decoded['outcomes'] ?? []))),
                    'opportunities' => array_values(array_filter((array) ($decoded['opportunities'] ?? []))),
                    'objections' => array_values(array_filter((array) ($decoded['objections'] ?? []))),
                    'follow_up_actions' => array_values(array_filter((array) ($decoded['follow_up_actions'] ?? []))),
                    'suggested_crm_update' => (string) ($decoded['suggested_crm_update'] ?? ''),
                    'provider_parsed' => true,
                ];
            }
        }

        return [
            'summary' => mb_substr($fallbackNotes, 0, 500),
            'outcomes' => [],
            'opportunities' => [],
            'objections' => [],
            'follow_up_actions' => [],
            'suggested_crm_update' => 'Review notes and confirm CRM update manually.',
            'provider_parsed' => false,
        ];
    }

    /**
     * @param  array<string, mixed>  $validated
     */
    private function formatVisitNote(array $validated): string
    {
        $sections = ['Summary: ' . $validated['summary']];

        foreach (['outcomes', 'opportunities', 'objections', 'follow_up_actions'] as $key) {
            $items = array_filter((array) ($validated[$key] ?? []));
            if ($items !== []) {
                $label = ucfirst(str_replace('_', ' ', $key));
                $sections[] = $label . ":\n- " . implode("\n- ", $items);
            }
        }

        return implode("\n\n", $sections);
    }
}
