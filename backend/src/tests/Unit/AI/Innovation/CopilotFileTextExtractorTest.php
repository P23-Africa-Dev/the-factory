<?php

declare(strict_types=1);

namespace Tests\Unit\AI\Innovation;

use App\Services\AI\Innovation\CopilotFileTextExtractor;
use Illuminate\Http\UploadedFile;
use Tests\TestCase;
use ZipArchive;

final class CopilotFileTextExtractorTest extends TestCase
{
    public function test_extracts_plain_text_files(): void
    {
        $file = UploadedFile::fake()->createWithContent('notes.txt', 'Quarterly revenue increased by 12 percent.');

        $text = app(CopilotFileTextExtractor::class)->extract($file, 'txt');

        $this->assertSame('Quarterly revenue increased by 12 percent.', $text);
    }

    public function test_extracts_docx_text(): void
    {
        if (! class_exists(ZipArchive::class)) {
            $this->markTestSkipped('ZipArchive extension is not available in this environment.');
        }

        $path = tempnam(sys_get_temp_dir(), 'ely-docx-');
        $this->assertNotFalse($path);

        $zip = new ZipArchive();
        $zip->open($path, ZipArchive::OVERWRITE);
        $zip->addFromString('word/document.xml', '<w:document><w:body><w:p><w:r><w:t>Meeting notes about payroll approvals</w:t></w:r></w:p></w:body></w:document>');
        $zip->close();

        $file = new UploadedFile($path, 'meeting.docx', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', null, true);

        $text = app(CopilotFileTextExtractor::class)->extract($file, 'docx');

        $this->assertStringContainsString('Meeting notes about payroll approvals', (string) $text);

        @unlink($path);
    }
}
