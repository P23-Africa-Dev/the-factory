<?php

declare(strict_types=1);

namespace App\Services\AI\Crm;

use App\Models\Lead;
use Illuminate\Support\Str;

class VisitLogInferenceService
{
    /**
     * @param  array<string, string>  $entities
     * @return array<string, mixed>
     */
    public function infer(string $message, int $companyId, array $entities = []): array
    {
        $summary = $this->extractLabeledValue($message, ['summary', 'visit summary', 'notes'])
            ?? $this->extractAfterVisitVerb($message)
            ?? trim($message);

        $leadId = $this->resolveLeadId($message, $companyId, $entities);

        return [
            'lead_id' => $leadId,
            'summary' => Str::limit(trim((string) $summary), 5000, ''),
            'outcomes' => $this->extractLabeledValue($message, ['outcomes', 'outcome']),
            'opportunities' => $this->extractLabeledValue($message, ['opportunities', 'opportunity']),
            'objections' => $this->extractLabeledValue($message, ['objections', 'objection']),
            'follow_up_actions' => $this->extractLabeledValue($message, ['follow up', 'follow-up', 'next steps']),
            '__inference' => [
                'lead_unresolved' => $leadId === null,
                'missing_summary' => trim((string) $summary) === '',
            ],
        ];
    }

    /**
     * @param  array<string, mixed>  $actionArgs
     * @return array<string, mixed>
     */
    public function normalizeProvidedArgs(int $companyId, array $actionArgs): array
    {
        $normalized = $actionArgs;

        if (isset($normalized['lead_id']) && is_numeric($normalized['lead_id'])) {
            $leadId = (int) $normalized['lead_id'];
            $exists = Lead::query()
                ->where('company_id', $companyId)
                ->where('id', $leadId)
                ->exists();
            $normalized['lead_id'] = $exists ? $leadId : null;
        }

        foreach (['summary', 'outcomes', 'opportunities', 'objections', 'follow_up_actions'] as $field) {
            if (is_string($normalized[$field] ?? null)) {
                $normalized[$field] = Str::limit(trim((string) $normalized[$field]), 5000, '');
            }
        }

        $normalized['__inference'] = [
            'lead_unresolved' => ($normalized['lead_id'] ?? null) === null,
            'missing_summary' => trim((string) ($normalized['summary'] ?? '')) === '',
        ];

        return $normalized;
    }

    /**
     * @param  array<string, mixed>  $args
     * @return array<int, string>
     */
    public function warningCodes(array $args): array
    {
        $codes = [];
        $inference = is_array($args['__inference'] ?? null) ? $args['__inference'] : [];

        if (($inference['lead_unresolved'] ?? false) === true || ($args['lead_id'] ?? null) === null) {
            $codes[] = 'lead_unresolved';
        }
        if (($inference['missing_summary'] ?? false) === true || trim((string) ($args['summary'] ?? '')) === '') {
            $codes[] = 'missing_summary';
        }

        return $codes;
    }

    /**
     * @param  array<string, string>  $entities
     */
    private function resolveLeadId(string $message, int $companyId, array $entities): ?int
    {
        if (isset($entities['lead_id']) && is_numeric($entities['lead_id'])) {
            $id = (int) $entities['lead_id'];
            $exists = Lead::query()->where('company_id', $companyId)->where('id', $id)->exists();

            return $exists ? $id : null;
        }

        $name = $this->extractLabeledValue($message, ['lead', 'business', 'client', 'company'])
            ?? (isset($entities['lead']) ? (string) $entities['lead'] : null);

        if (! is_string($name) || trim($name) === '') {
            if (preg_match('/\b(?:lead|client|business)\s+([A-Z][\w\'\- ]{1,60})/i', $message, $m) === 1) {
                $name = trim((string) $m[1]);
            }
        }

        if (! is_string($name) || trim($name) === '') {
            return null;
        }

        $match = Lead::query()
            ->where('company_id', $companyId)
            ->where('name', 'like', '%' . trim($name) . '%')
            ->value('id');

        return is_numeric($match) ? (int) $match : null;
    }

    private function extractAfterVisitVerb(string $message): ?string
    {
        if (preg_match('/\b(?:log|record|capture)\s+(?:a\s+)?visit\b[:\-\s]*(.+)$/i', $message, $m) === 1) {
            return trim((string) $m[1]);
        }

        return null;
    }

    /**
     * @param  array<int, string>  $labels
     */
    private function extractLabeledValue(string $message, array $labels): ?string
    {
        foreach ($labels as $label) {
            $escaped = preg_quote($label, '/');
            if (preg_match('/\b' . $escaped . '\b\s*:\s*(.+?)(?=\s*(?:[a-z][a-z\s&\/]{1,30}\s*:|\.|;|\n|$))/i', $message, $m) === 1) {
                $value = trim((string) $m[1]);
                if ($value !== '') {
                    return $value;
                }
            }
        }

        return null;
    }
}
