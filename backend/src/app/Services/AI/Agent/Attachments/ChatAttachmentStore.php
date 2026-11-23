<?php

declare(strict_types=1);

namespace App\Services\AI\Agent\Attachments;

use Illuminate\Http\UploadedFile;
use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Facades\Storage;
use Illuminate\Support\Str;
use Illuminate\Validation\ValidationException;

/**
 * Files a user attaches in the ELY chat (for now: CSV lead lists to import).
 * Stored on the private local disk for 24 hours and readable only by the user
 * and company that uploaded them.
 */
class ChatAttachmentStore
{
    public const TTL_HOURS = 24;

    public const MAX_ROWS = 500;

    /** Spreadsheet header (lowercased, spaces/punctuation removed) => lead field. */
    private const HEADER_MAP = [
        'name' => 'name', 'leadname' => 'name', 'businessname' => 'name', 'business' => 'name', 'company' => 'name', 'customer' => 'name', 'fullname' => 'name',
        'email' => 'email', 'emailaddress' => 'email', 'mail' => 'email',
        'phone' => 'phone', 'phonenumber' => 'phone', 'mobile' => 'phone', 'telephone' => 'phone', 'tel' => 'phone',
        'location' => 'location', 'address' => 'location', 'city' => 'location', 'area' => 'location',
        'industry' => 'industry', 'sector' => 'industry',
        'source' => 'source', 'leadsource' => 'source',
        'status' => 'status', 'stage' => 'status',
        'priority' => 'priority',
        'website' => 'website', 'url' => 'website',
        'position' => 'position', 'title' => 'position', 'jobtitle' => 'position', 'role' => 'position',
        'companyname' => 'company_name', 'organisation' => 'company_name', 'organization' => 'company_name',
        'companyemail' => 'company_email',
        'budget' => 'budget_amount', 'budgetamount' => 'budget_amount',
        'currency' => 'budget_currency', 'budgetcurrency' => 'budget_currency',
    ];

    /**
     * @return array{id: string, name: string, rows: int}
     */
    public function put(UploadedFile $file, int $companyId, int $userId): array
    {
        return $this->putContents($file->getClientOriginalName(), (string) file_get_contents($file->getRealPath()), $companyId, $userId);
    }

    /**
     * Store CSV text as an attachment (used by uploads and the eval fixture).
     *
     * @return array{id: string, name: string, rows: int}
     */
    public function putContents(string $name, string $csv, int $companyId, int $userId): array
    {
        $id = (string) Str::ulid();
        $path = "ely-attachments/{$companyId}/{$id}.csv";
        Storage::disk('local')->put($path, $csv);

        $meta = [
            'company_id' => $companyId,
            'user_id' => $userId,
            'path' => $path,
            'name' => mb_substr($name, 0, 180),
        ];
        Cache::put($this->key($id), $meta, now()->addHours(self::TTL_HOURS));

        return ['id' => $id, 'name' => $meta['name'], 'rows' => count($this->parse($path))];
    }

    /** Remove an attachment and its file now instead of waiting for it to expire. */
    public function forget(string $id): void
    {
        $meta = Cache::pull($this->key($id));
        if (is_array($meta) && is_string($meta['path'] ?? null)) {
            Storage::disk('local')->delete($meta['path']);
        }
    }

    /**
     * @return array{company_id: int, user_id: int, path: string, name: string}
     */
    public function get(string $id, int $companyId, int $userId): array
    {
        $meta = Cache::get($this->key($id));
        if (! is_array($meta)
            || (int) $meta['company_id'] !== $companyId
            || (int) $meta['user_id'] !== $userId
            || ! Storage::disk('local')->exists((string) $meta['path'])
        ) {
            throw ValidationException::withMessages([
                'attachment_id' => ['That file was not found or has expired. Attach it again.'],
            ]);
        }

        return $meta;
    }

    /**
     * Lead rows from the attached CSV, with headers mapped to lead fields.
     *
     * @return array{name: string, rows: array<int, array<string, string>>, mapped: array<string, string>, unmapped: array<int, string>}
     */
    public function leadRows(string $id, int $companyId, int $userId): array
    {
        $meta = $this->get($id, $companyId, $userId);
        $raw = $this->parse((string) $meta['path']);
        if ($raw === []) {
            throw ValidationException::withMessages(['attachment_id' => ['The file has no rows to import.']]);
        }

        $headers = array_shift($raw);
        $mapped = [];
        $unmapped = [];
        foreach ($headers as $index => $header) {
            $key = preg_replace('/[^a-z0-9]/', '', strtolower((string) $header)) ?? '';
            if (isset(self::HEADER_MAP[$key]) && ! in_array(self::HEADER_MAP[$key], $mapped, true)) {
                $mapped[$index] = self::HEADER_MAP[$key];
            } elseif (trim((string) $header) !== '') {
                $unmapped[] = (string) $header;
            }
        }

        if (! in_array('name', $mapped, true)) {
            throw ValidationException::withMessages(['attachment_id' => ['The file needs a "Name" column (business or person name).']]);
        }
        if (count($raw) > self::MAX_ROWS) {
            throw ValidationException::withMessages(['attachment_id' => ['Imports are limited to '.self::MAX_ROWS.' rows. Split the file and try again.']]);
        }

        $rows = [];
        foreach ($raw as $cells) {
            $row = [];
            foreach ($mapped as $index => $field) {
                $value = trim((string) ($cells[$index] ?? ''));
                if ($value !== '') {
                    $row[$field] = $value;
                }
            }
            if ($row !== []) {
                $rows[] = $row;
            }
        }

        return [
            'name' => (string) $meta['name'],
            'rows' => $rows,
            'mapped' => array_combine(array_map(static fn (int $i): string => (string) ($headers[$i] ?? ''), array_keys($mapped)), array_values($mapped)) ?: [],
            'unmapped' => $unmapped,
        ];
    }

    /**
     * @return array<int, array<int, string>>
     */
    private function parse(string $path): array
    {
        $contents = (string) Storage::disk('local')->get($path);
        $contents = preg_replace('/^\xEF\xBB\xBF/', '', $contents) ?? $contents;

        $handle = fopen('php://temp', 'r+');
        fwrite($handle, $contents);
        rewind($handle);

        $first = (string) strtok($contents, "\n");
        $delimiter = substr_count($first, ';') > substr_count($first, ',') ? ';' : ',';

        $rows = [];
        while (($cells = fgetcsv($handle, 0, $delimiter, '"', '\\')) !== false) {
            if ($cells === [null]) {
                continue;
            }
            $rows[] = array_map(static fn ($cell): string => (string) $cell, $cells);
            if (count($rows) > self::MAX_ROWS + 1) {
                break;
            }
        }
        fclose($handle);

        return $rows;
    }

    private function key(string $id): string
    {
        return 'ely:attachment:'.$id;
    }
}
