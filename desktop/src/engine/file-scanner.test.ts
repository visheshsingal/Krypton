import { PromptSecurityEngine } from './scanner';
import { FileScanAssets, scanFileLocally } from './file-scanner';
import { strToU8, zipSync } from 'fflate';

const assets: FileScanAssets = {
  pdfWorkerSrc: 'file:///unused/pdf.worker.min.mjs',
  tesseractWorkerPath: 'file:///unused/tesseract-worker.min.js',
  tesseractCorePath: 'file:///unused/tesseract-core/',
  tesseractLangPath: 'file:///unused/tessdata',
};

function createFile(bytes: Uint8Array, name: string): File {
  const buffer = new ArrayBuffer(bytes.byteLength);
  new Uint8Array(buffer).set(bytes);
  return new File([buffer], name);
}

describe('Local file scanner', () => {
  const engine = new PromptSecurityEngine();

  test('detects sensitive text in a selected CSV file', async () => {
    const file = new File(
      ['Name,Account Number\nExample,6465745724872'],
      'records.csv',
      { type: 'text/csv' },
    );

    const result = await scanFileLocally(file, engine, assets);

    expect(result.fileType).toBe('csv');
    expect(result.scan.action).toBe('block');
    expect(result.scan.matches.map((match) => match.ruleCode)).toContain('PII_BANK_ACCOUNT');
  });

  test.each([
    ['DOCX', 'records.docx', () => {
      const documentXml = '<?xml version="1.0" encoding="UTF-8"?><w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body><w:p><w:r><w:t>My account number is 6465745724872</w:t></w:r></w:p></w:body></w:document>';
      return zipSync({
        '[Content_Types].xml': strToU8('<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="xml" ContentType="application/xml"/><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/></Types>'),
        '_rels/.rels': strToU8('<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/></Relationships>'),
        'word/document.xml': strToU8(documentXml),
        'word/header1.xml': strToU8('<w:hdr xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:p><w:r><w:t>My account number is 6465745724872</w:t></w:r></w:p></w:hdr>'),
      });
    }],
    ['PPTX', 'slides.pptx', () => zipSync({
      'ppt/slides/slide1.xml': strToU8('<p:sld xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main" xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main"><a:t>Safe slide text</a:t></p:sld>'),
      'ppt/notesSlides/notesSlide1.xml': strToU8('<p:notes xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main" xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main"><a:t>My account number is 6465745724872</a:t></p:notes>'),
    })],
  ])('detects sensitive text extracted from %s', async (_label, name, createArchive) => {
    const file = createFile(createArchive(), name);

    const result = await scanFileLocally(file, engine, assets);

    expect(result.scan.action).toBe('block');
    expect(result.scan.matches.map((match) => match.ruleCode)).toContain('PII_BANK_ACCOUNT');
  });

  test('detects sensitive text in an XLSX worksheet', async () => {
    const workbook = zipSync({
      'xl/sharedStrings.xml': strToU8('<sst><si><t>Account Number</t></si><si><t>6465745724872</t></si></sst>'),
      'xl/worksheets/sheet1.xml': strToU8('<worksheet><sheetData><row><c r="A1" t="s"><v>0</v></c><c r="B1" t="s"><v>1</v></c><c r="C1"><f>"My account number is 6465745724872"</f><v>0</v></c></row></sheetData></worksheet>'),
    });
    const file = createFile(workbook, 'records.xlsx');

    const result = await scanFileLocally(file, engine, assets);

    expect(result.scan.action).toBe('block');
    expect(result.scan.matches.map((match) => match.ruleCode)).toContain('PII_BANK_ACCOUNT');
  });

  test('allows readable nonsensitive text files', async () => {
    const file = new File(['Explain how a REST API works.'], 'prompt.txt', { type: 'text/plain' });

    const result = await scanFileLocally(file, engine, assets);

    expect(result.scan.hasRisk).toBe(false);
    expect(result.scan.action).toBe('allow');
  });

  test('fails closed for unsupported file types', async () => {
    const file = new File(['content'], 'archive.zip', { type: 'application/zip' });

    await expect(scanFileLocally(file, engine, assets))
      .rejects.toThrow('Unsupported file type ".zip"');
  });

  test('fails closed for animated PNG image content', async () => {
    const bytes = new Uint8Array([
      0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a,
      0x00, 0x00, 0x00, 0x08, 0x61, 0x63, 0x54, 0x4c, 0, 0, 0, 0,
    ]);
    const file = createFile(bytes, 'animated.png');

    await expect(scanFileLocally(file, engine, assets))
      .rejects.toThrow('Animated PNG images cannot be scanned safely.');
  });

  test('fails closed for files larger than the local scanning limit', async () => {
    const file = new File([new Uint8Array(15 * 1024 * 1024 + 1)], 'large.txt');

    await expect(scanFileLocally(file, engine, assets))
      .rejects.toThrow('Files larger than 15 MB cannot be scanned safely.');
  });

  test('fails closed when a supported file contains no readable text', async () => {
    const file = new File(['   \n'], 'empty.csv', { type: 'text/csv' });

    await expect(scanFileLocally(file, engine, assets))
      .rejects.toThrow('No readable text was found');
  });

  test('rejects Office archives with oversized declared entries before extraction', async () => {
    const archive = zipSync({ 'word/document.xml': strToU8('safe text') });
    const centralDirectoryOffset = archive.findIndex((value, index) =>
      value === 0x50 &&
      archive[index + 1] === 0x4b &&
      archive[index + 2] === 0x01 &&
      archive[index + 3] === 0x02,
    );
    expect(centralDirectoryOffset).toBeGreaterThanOrEqual(0);
    new DataView(archive.buffer, archive.byteOffset, archive.byteLength)
      .setUint32(centralDirectoryOffset + 24, 16 * 1024 * 1024, true);
    const file = createFile(archive, 'oversized.docx');

    await expect(scanFileLocally(file, engine, assets))
      .rejects.toThrow('An item in this Office document exceeds the safe scanning limit.');
  });
});
