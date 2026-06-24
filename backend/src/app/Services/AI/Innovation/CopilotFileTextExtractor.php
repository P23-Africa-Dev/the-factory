<?php

declare(strict_types=1);

namespace App\Services\AI\Innovation;

use Illuminate\Http\UploadedFile;
use OpenSpout\Reader\XLSX\Reader as XlsxReader;
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

        $normalized = trim(preg_replace('/\s+/u', ' ', $text) ?? '');

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
        $bytes = @file_get_contents($path);
        if (! is_string($bytes) || $bytes === '') {
            return null;
        }

        $chunks = [];

        if (preg_match_all('/stream\r?\n(.*?)\r?\nendstream/s', $bytes, $streams) === 1) {
            foreach ($streams[1] as $stream) {
                $decoded = $this->decodePdfStream($stream);
                if ($decoded === null) {
                    continue;
                }

                if (preg_match_all('/\((?:\\\\.|[^\\\\)])*\)\s*Tj/', $decoded, $matches) === 1) {
                    foreach ($matches[0] as $match) {
                        if (preg_match('/\((.*)\)\s*Tj/s', $match, $inner) === 1) {
                            $chunks[] = $this->decodePdfString((string) $inner[1]);
                        }
                    }
                }

                if (preg_match_all('/\[(.*?)\]\s*TJ/s', $decoded, $arrayMatches) === 1) {
                    foreach ($arrayMatches[1] as $arrayMatch) {
                        if (preg_match_all('/\((?:\\\\.|[^\\\\)])*\)/', (string) $arrayMatch, $parts) === 1) {
                            foreach ($parts[0] as $part) {
                                $chunks[] = $this->decodePdfString(trim($part, '()'));
                            }
                        }
                    }
                }
            }
        }

        if ($chunks === [] && preg_match_all('/\((?:\\\\.|[^\\\\)])*\)\s*Tj/', $bytes, $directMatches) === 1) {
            foreach ($directMatches[0] as $match) {
                if (preg_match('/\((.*)\)\s*Tj/s', $match, $inner) === 1) {
                    $chunks[] = $this->decodePdfString((string) $inner[1]);
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
        if (! class_exists(ZipArchive::class)) {
            return null;
        }

        $zip = new ZipArchive();
        if ($zip->open($path) !== true) {
            return null;
        }

        $xml = $zip->getFromName('word/document.xml');
        $zip->close();

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
        if ($extension !== 'xlsx') {
            return null;
        }

        $rows = [];

        try {
            $reader = new XlsxReader();
            $reader->open($path);

            foreach ($reader->getSheetIterator() as $sheet) {
                foreach ($sheet->getRowIterator() as $row) {
                    $cells = [];
                    foreach ($row->getCells() as $cell) {
                        $value = trim((string) $cell->getValue());
                        if ($value !== '') {
                            $cells[] = $value;
                        }
                    }

                    if ($cells !== []) {
                        $rows[] = implode(', ', $cells);
                    }

                    if (count($rows) >= 250) {
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
}
