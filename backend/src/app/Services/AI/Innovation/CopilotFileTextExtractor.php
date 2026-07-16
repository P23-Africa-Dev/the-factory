<?php

declare(strict_types=1);

namespace App\Services\AI\Innovation;

use Illuminate\Http\UploadedFile;
use OpenSpout\Reader\XLSX\Reader as XlsxReader;
use Smalot\PdfParser\Parser as PdfParser;
use ZipArchive;

final class CopilotFileTextExtractor
{
    private const MAX_CHARS = 12000;

    public function extract(UploadedFile $file, string $extension): ?string
    {
        $path = $file->getRealPath();
        if (! is_string($path) || $path === '') {
            return null;
        }

        return $this->extractFromPath($path, $extension);
    }

    public function extractFromPath(string $path, string $extension): ?string
    {
        if ($path === '' || ! is_file($path)) {
            return null;
        }

        $extension = strtolower(trim($extension));
        $isSpreadsheet = in_array($extension, ['xlsx', 'xls', 'csv'], true);

        $text = match ($extension) {
            'txt', 'csv' => $this->readPlainText($path),
            'pdf' => $this->extractPdfText($path),
            'docx' => $this->extractDocxText($path),
            'doc' => $this->extractLegacyDocText($path),
            'xlsx', 'xls' => $this->extractSpreadsheetText($path, $extension),
            default => null,
        };

        if (! is_string($text)) {
            return null;
        }

        $normalized = $isSpreadsheet
            ? trim($text)
            : trim(preg_replace('/[ \t]+/u', ' ', preg_replace('/\R+/u', "\n", $text) ?? '') ?? '');

        if ($normalized === '') {
            return null;
        }

        return mb_substr($normalized, 0, self::MAX_CHARS);
    }

    private function readPlainText(string $path): ?string
    {
        $contents = @file_get_contents($path);

        return is_string($contents) ? $contents : null;
    }

    private function extractPdfText(string $path): ?string
    {
        try {
            $parser = new PdfParser();
            $pdf = $parser->parseFile($path);
            $text = trim($pdf->getText());

            if ($text !== '') {
                return $text;
            }
        } catch (\Throwable) {
            // Fall through to legacy extraction.
        }

        return $this->extractPdfTextLegacy($path);
    }

    private function extractPdfTextLegacy(string $path): ?string
    {
        $bytes = @file_get_contents($path);
        if (! is_string($bytes) || $bytes === '') {
            return null;
        }

        $chunks = [];

        if (preg_match_all('/stream\r?\n(.*?)\r?\nendstream/s', $bytes, $streams) > 0) {
            foreach ($streams[1] as $stream) {
                $decoded = $this->decodePdfStream($stream);
                if ($decoded === null) {
                    continue;
                }

                if (preg_match_all('/\((?:\\\\.|[^\\\\)])*\)\s*Tj/', $decoded, $matches) > 0) {
                    foreach ($matches[0] as $match) {
                        if (preg_match('/\((.*)\)\s*Tj/s', $match, $inner) === 1) {
                            $chunks[] = $this->decodePdfString((string) $inner[1]);
                        }
                    }
                }
            }
        }

        $text = trim(implode(' ', array_filter($chunks, static fn(string $chunk): bool => $chunk !== '')));

        return $text !== '' ? $text : null;
    }

    private function decodePdfStream(string $stream): ?string
    {
        $stream = ltrim($stream);

        foreach ([
            static fn(string $value): ?string => @gzuncompress($value) ?: null,
            static fn(string $value): ?string => @gzinflate($value) ?: null,
            static fn(string $value): ?string => strlen($value) > 2 ? (@gzinflate(substr($value, 2)) ?: null) : null,
        ] as $decoder) {
            $decoded = $decoder($stream);
            if (is_string($decoded) && $decoded !== '') {
                return $decoded;
            }
        }

        return $stream;
    }

    private function decodePdfString(string $value): string
    {
        return str_replace(
            ['\\n', '\\r', '\\t', '\\(', '\\)', '\\\\'],
            ["\n", "\r", "\t", '(', ')', '\\'],
            $value,
        );
    }

    private function extractDocxText(string $path): ?string
    {
        $xml = $this->readArchiveMember($path, 'word/document.xml');
        if (! is_string($xml) || $xml === '') {
            return null;
        }

        $xml = preg_replace('/<w:tab\/>/', "\t", $xml) ?? $xml;
        $xml = preg_replace('/<\/w:p>/', "\n", $xml) ?? $xml;
        $text = strip_tags($xml);
        $text = html_entity_decode($text, ENT_QUOTES | ENT_XML1, 'UTF-8');

        return trim($text) !== '' ? $text : null;
    }

    private function extractLegacyDocText(string $path): ?string
    {
        $bytes = @file_get_contents($path);
        if (! is_string($bytes) || $bytes === '') {
            return null;
        }

        if (preg_match_all('/[\x20-\x7E]{4,}/', $bytes, $matches) !== 1) {
            return null;
        }

        $text = trim(implode(' ', $matches[0]));

        return $text !== '' ? $text : null;
    }

    private function extractSpreadsheetText(string $path, string $extension): ?string
    {
        if ($extension === 'xlsx') {
            $text = $this->extractSpreadsheetWithOpenSpout($path);
            if (is_string($text) && trim($text) !== '') {
                return $text;
            }

            return $this->extractXlsxViaXml($path);
        }

        return null;
    }

    private function extractSpreadsheetWithOpenSpout(string $path): ?string
    {
        $rows = [];

        try {
            $reader = new XlsxReader();
            $reader->open($path);

            foreach ($reader->getSheetIterator() as $sheet) {
                foreach ($sheet->getRowIterator() as $row) {
                    $cells = [];
                    foreach ($row->getCells() as $cell) {
                        $formatted = $this->formatSpreadsheetValue($cell->getValue());
                        if ($formatted !== '') {
                            $cells[] = $formatted;
                        }
                    }

                    if ($cells !== []) {
                        $rows[] = implode(', ', $cells);
                    }

                    if (count($rows) >= 300) {
                        break 2;
                    }
                }
            }

            $reader->close();
        } catch (\Throwable) {
            return null;
        }

        $text = trim(implode("\n", $rows));

        return $text !== '' ? $text : null;
    }

    private function extractXlsxViaXml(string $path): ?string
    {
        if (class_exists(ZipArchive::class)) {
            $zip = new ZipArchive();
            if ($zip->open($path) === true) {
                $text = $this->buildSpreadsheetTextFromReader(
                    static fn(string $member) => $zip->getFromName($member),
                );
                $zip->close();

                return $text;
            }
        }

        $tempDir = $this->extractArchiveToTemp($path);
        if ($tempDir === null) {
            return null;
        }

        $text = $this->buildSpreadsheetTextFromReader(function (string $member) use ($tempDir): ?string {
            $memberPath = $tempDir . '/' . $member;

            return is_file($memberPath) ? (@file_get_contents($memberPath) ?: null) : null;
        });

        $this->removeDirectory($tempDir);

        return $text;
    }

    /**
     * @param  callable(string): ?string  $readMember
     */
    private function buildSpreadsheetTextFromReader(callable $readMember): ?string
    {
        $sharedXml = $readMember('xl/sharedStrings.xml');
        $sharedStrings = is_string($sharedXml) ? $this->parseSharedStringsXml($sharedXml) : [];
        $rows = [];

        for ($sheetIndex = 1; $sheetIndex <= 10; $sheetIndex++) {
            $sheetXml = $readMember("xl/worksheets/sheet{$sheetIndex}.xml");
            if (! is_string($sheetXml) || $sheetXml === '') {
                if ($sheetIndex === 1) {
                    break;
                }

                continue;
            }

            $sheetRows = $this->parseWorksheetXml($sheetXml, $sharedStrings);
            foreach ($sheetRows as $sheetRow) {
                $rows[] = $sheetRow;
                if (count($rows) >= 300) {
                    break 2;
                }
            }
        }

        $text = trim(implode("\n", $rows));

        return $text !== '' ? $text : null;
    }

    private function readArchiveMember(string $path, string $member): ?string
    {
        if (class_exists(ZipArchive::class)) {
            $zip = new ZipArchive();
            if ($zip->open($path) === true) {
                $contents = $zip->getFromName($member);
                $zip->close();

                return is_string($contents) && $contents !== '' ? $contents : null;
            }
        }

        $tempDir = $this->extractArchiveToTemp($path);
        if ($tempDir === null) {
            return null;
        }

        $memberPath = $tempDir . '/' . $member;
        $contents = is_file($memberPath) ? @file_get_contents($memberPath) : false;
        $this->removeDirectory($tempDir);

        return is_string($contents) && $contents !== '' ? $contents : null;
    }

    private function extractArchiveToTemp(string $path): ?string
    {
        $tempDir = sys_get_temp_dir() . '/ely-archive-' . bin2hex(random_bytes(8));
        if (! @mkdir($tempDir) && ! is_dir($tempDir)) {
            return null;
        }

        $command = 'unzip -qq -o ' . escapeshellarg($path) . ' -d ' . escapeshellarg($tempDir) . ' 2>/dev/null';
        $exitCode = 1;
        @exec($command, $output, $exitCode);

        if ($exitCode !== 0) {
            $this->removeDirectory($tempDir);

            return null;
        }

        return $tempDir;
    }

    private function removeDirectory(string $directory): void
    {
        if (! is_dir($directory)) {
            return;
        }

        $items = scandir($directory);
        if (! is_array($items)) {
            return;
        }

        foreach ($items as $item) {
            if ($item === '.' || $item === '..') {
                continue;
            }

            $target = $directory . '/' . $item;
            if (is_dir($target)) {
                $this->removeDirectory($target);
                continue;
            }

            @unlink($target);
        }

        @rmdir($directory);
    }

    /**
     * @return array<int, string>
     */
    private function parseSharedStringsXml(string $sharedXml): array
    {
        $strings = [];
        if (preg_match_all('/<si>(.*?)<\/si>/s', $sharedXml, $items) > 0) {
            foreach ($items[1] as $itemXml) {
                $value = '';
                if (preg_match_all('/<t[^>]*>(.*?)<\/t>/s', (string) $itemXml, $textNodes) > 0) {
                    $value = implode('', array_map(
                        static fn(string $part): string => html_entity_decode(strip_tags($part), ENT_QUOTES | ENT_XML1, 'UTF-8'),
                        $textNodes[1],
                    ));
                }

                $strings[] = trim($value);
            }
        }

        return $strings;
    }

    /**
     * @param  array<int, string>  $sharedStrings
     * @return array<int, string>
     */
    private function parseWorksheetXml(string $sheetXml, array $sharedStrings): array
    {
        $rows = [];

        if (preg_match_all('/<row[^>]*>(.*?)<\/row>/s', $sheetXml, $rowMatches) === 0) {
            return [];
        }

        foreach ($rowMatches[1] as $rowXml) {
            $cells = [];

            if (preg_match_all('/<c\b([^>]*)>(.*?)<\/c>/s', (string) $rowXml, $cellMatches, PREG_SET_ORDER) > 0) {
                foreach ($cellMatches as $cellMatch) {
                    $attributes = (string) $cellMatch[1];
                    $valueXml = (string) $cellMatch[2];
                    $type = null;

                    if (preg_match('/\bt="([^"]+)"/', $attributes, $typeMatch) === 1) {
                        $type = (string) $typeMatch[1];
                    }

                    $rawValue = '';
                    if (preg_match('/<v>(.*?)<\/v>/s', $valueXml, $valueMatch) === 1) {
                        $rawValue = html_entity_decode(strip_tags((string) $valueMatch[1]), ENT_QUOTES | ENT_XML1, 'UTF-8');
                    } elseif (preg_match('/<t[^>]*>(.*?)<\/t>/s', $valueXml, $inlineMatch) === 1) {
                        $rawValue = html_entity_decode(strip_tags((string) $inlineMatch[1]), ENT_QUOTES | ENT_XML1, 'UTF-8');
                    }

                    if ($type === 's' && ctype_digit($rawValue) && isset($sharedStrings[(int) $rawValue])) {
                        $rawValue = $sharedStrings[(int) $rawValue];
                    }

                    $formatted = trim($rawValue);
                    if ($formatted !== '') {
                        $cells[] = $formatted;
                    }
                }
            }

            if ($cells !== []) {
                $rows[] = implode(', ', $cells);
            }
        }

        return $rows;
    }

    private function formatSpreadsheetValue(mixed $value): string
    {
        if ($value === null) {
            return '';
        }

        if ($value instanceof \DateTimeInterface) {
            return $value->format('Y-m-d H:i:s');
        }

        if (is_bool($value)) {
            return $value ? 'true' : 'false';
        }

        if (is_int($value) || is_float($value)) {
            return (string) $value;
        }

        if (is_string($value)) {
            return trim($value);
        }

        if (is_object($value) && method_exists($value, '__toString')) {
            return trim((string) $value);
        }

        return '';
    }
}
