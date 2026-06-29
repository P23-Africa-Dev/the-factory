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

    public function test_extracts_xlsx_via_xml_fallback(): void
    {
        if (! class_exists(ZipArchive::class)) {
            $this->markTestSkipped('ZipArchive extension is not available in this environment.');
        }

        $path = tempnam(sys_get_temp_dir(), 'ely-xlsx-');
        $this->assertNotFalse($path);

        $zip = new ZipArchive();
        $zip->open($path, ZipArchive::OVERWRITE);
        $zip->addFromString('[Content_Types].xml', '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"></Types>');
        $zip->addFromString('xl/sharedStrings.xml', <<<'XML'
<sst xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">
  <si><t>Name</t></si>
  <si><t>Email</t></si>
  <si><t>Jane Doe</t></si>
  <si><t>jane@example.com</t></si>
</sst>
XML);
        $zip->addFromString('xl/worksheets/sheet1.xml', <<<'XML'
<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">
  <sheetData>
    <row r="1">
      <c r="A1" t="s"><v>0</v></c>
      <c r="B1" t="s"><v>1</v></c>
    </row>
    <row r="2">
      <c r="A2" t="s"><v>2</v></c>
      <c r="B2" t="s"><v>3</v></c>
    </row>
  </sheetData>
</worksheet>
XML);
        $zip->close();

        $file = new UploadedFile($path, 'waitlist.xlsx', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', null, true);

        $text = app(CopilotFileTextExtractor::class)->extract($file, 'xlsx');

        $this->assertStringContainsString('Name, Email', (string) $text);
        $this->assertStringContainsString('Jane Doe, jane@example.com', (string) $text);

        @unlink($path);
    }
}
