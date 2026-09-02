<?php

declare(strict_types=1);

namespace App\Services\AI\Crm;

class CrmLeadReadArgsResolver
{
    /**
     * @return array{search?: string, named_leads?: array<int, string>}
     */
    public function resolveFilters(string $message): array
    {
        $args = [];

        $namedLeads = $this->extractNamedLeads($message);
        if ($namedLeads !== []) {
            $args['named_leads'] = $namedLeads;
        }

        $locationSearch = $this->extractLocationSearch($message);
        if ($locationSearch !== null) {
            $args['search'] = $locationSearch;
        }

        return $args;
    }

    private function extractLocationSearch(string $message): ?string
    {
        $patterns = [
            '/\bleads?\s+(?:in|from|at|located\s+in|based\s+in)\s+(?!my\s+crm\b)([a-z][a-z0-9\s,\-]{1,60}?)(?:\?|\.|$|\s+(?:with|that|who|assigned))/i',
            '/\b(?:any|some)\s+leads?\s+in\s+(?!my\s+crm\b)([a-z][a-z0-9\s,\-]{1,60}?)(?:\?|\.|$)/i',
            '/\bhow\s+many\s+leads?\b.{0,30}\bin\s+(?!my\s+crm\b)([a-z][a-z0-9\s,\-]{1,60}?)(?:\?|\.|$)/i',
            '/\bdo\s+i\s+have\b.{0,40}\bleads?\s+in\s+(?!my\s+crm\b)([a-z][a-z0-9\s,\-]{1,60}?)(?:\?|\.|$)/i',
        ];

        foreach ($patterns as $pattern) {
            if (preg_match($pattern, $message, $matches) !== 1) {
                continue;
            }

            $location = $this->cleanLocationToken((string) ($matches[1] ?? ''));
            if ($location !== '') {
                return $location;
            }
        }

        return null;
    }

    /**
     * @return array<int, string>
     */
    private function extractNamedLeads(string $message): array
    {
        $candidates = [];

        if (preg_match('/\bwhat\s+about\b(.+)/i', $message, $matches) === 1) {
            $candidates = $this->splitNamedLeadList((string) ($matches[1] ?? ''));
        } elseif (preg_match('/\bleads?\s+named\b[:\s]+(.+)/i', $message, $matches) === 1) {
            $candidates = $this->splitNamedLeadList((string) ($matches[1] ?? ''));
        } elseif (preg_match('/\b(find|check|lookup|search\s+for)\b.{0,20}\bleads?\b[:\s]+(.+)/i', $message, $matches) === 1) {
            $candidates = $this->splitNamedLeadList((string) ($matches[2] ?? ''));
        }

        return array_values(array_unique(array_filter(
            array_map(fn (string $name): string => trim($name), $candidates),
            fn (string $name): bool => $name !== '' && strlen($name) >= 2,
        )));
    }

    /**
     * @return array<int, string>
     */
    private function splitNamedLeadList(string $raw): array
    {
        $trimmed = trim($raw);
        $trimmed = preg_replace('/[?.!]+$/', '', $trimmed) ?? $trimmed;

        $parts = preg_split('/\s*,\s*|\s+and\s+/i', $trimmed) ?: [];

        return array_values(array_filter(
            array_map(function (string $part): string {
                $name = trim($part);
                $name = preg_replace('/^(the|those|these|and)\s+/i', '', $name) ?? $name;

                return trim($name);
            }, $parts),
            static fn (string $name): bool => $name !== '',
        ));
    }

    private function cleanLocationToken(string $token): string
    {
        $cleaned = trim($token);
        $cleaned = preg_replace('/\s+/', ' ', $cleaned) ?? $cleaned;
        $cleaned = rtrim($cleaned, ',.');

        if ($cleaned === '' || preg_match('/^(my|the|a|an)\s+crm$/i', $cleaned) === 1) {
            return '';
        }

        return $cleaned;
    }
}
