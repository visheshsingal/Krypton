import { unzipSync, Unzipped } from 'fflate';
import { createWorker, Worker as TesseractWorker } from 'tesseract.js';
import { PromptSecurityEngine } from './scanner';

export interface FileScanAssets {
  pdfWorkerSrc: string;
  tesseractWorkerPath: string;
  tesseractCorePath: string;
  tesseractLangPath: string;
}

export interface ScannedFileResult {
  fileType: string;
  scan: ReturnType<PromptSecurityEngine['scan']>;
}

const MAX_FILE_BYTES = 15 * 1024 * 1024;
const MAX_TEXT_CHARACTERS = 250_000;
const MAX_PDF_PAGES = 30;
const MAX_OCR_PIXELS = 12_000_000;
const MAX_OFFICE_ARCHIVE_BYTES = 50 * 1024 * 1024;
const MAX_OFFICE_ARCHIVE_ENTRIES = 1_000;
const MAX_OFFICE_MEDIA_FILES = 20;

let ocrWorkerPromise: Promise<TesseractWorker> | null = null;

function assertStaticImage(bytes: Uint8Array, extension: string): void {
  const isPng = extension === 'png';
  const isWebp = extension === 'webp';
  if (!isPng && !isWebp) return;

  if (isPng) {
    if (bytes.length < 8) throw new Error('The image file is incomplete.');
    const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
    let offset = 8;
    while (offset + 12 <= bytes.length) {
      const length = view.getUint32(offset, false);
      const type = String.fromCharCode(...bytes.subarray(offset + 4, offset + 8));
      if (type === 'acTL') throw new Error('Animated PNG images cannot be scanned safely.');
      offset += 12 + length;
      if (offset > bytes.length) throw new Error('The PNG image is malformed.');
      if (type === 'IEND') return;
    }
    throw new Error('The PNG image is malformed.');
  }

  if (
    bytes.length < 12 ||
    String.fromCharCode(...bytes.subarray(0, 4)) !== 'RIFF' ||
    String.fromCharCode(...bytes.subarray(8, 12)) !== 'WEBP'
  ) {
    throw new Error('The WebP image is malformed.');
  }
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  let offset = 12;
  while (offset + 8 <= bytes.length) {
    const type = String.fromCharCode(...bytes.subarray(offset, offset + 4));
    const length = view.getUint32(offset + 4, true);
    if (type === 'ANIM' || type === 'ANMF') {
      throw new Error('Animated WebP images cannot be scanned safely.');
    }
    offset += 8 + length + (length & 1);
    if (offset > bytes.length) throw new Error('The WebP image is malformed.');
  }
}

function getExtension(file: File): string {
  return file.name.split('.').pop()?.toLowerCase() || '';
}

function boundedText(value: string): string {
  return value.slice(0, MAX_TEXT_CHARACTERS);
}

async function getOcrWorker(assets: FileScanAssets): Promise<TesseractWorker> {
  if (!ocrWorkerPromise) {
    ocrWorkerPromise = createWorker('eng', 1, {
      workerPath: assets.tesseractWorkerPath,
      corePath: assets.tesseractCorePath,
      langPath: assets.tesseractLangPath,
      gzip: true,
      workerBlobURL: false,
      logger: () => undefined,
    }).catch((error: unknown) => {
      ocrWorkerPromise = null;
      throw error;
    });
  }
  return ocrWorkerPromise;
}

async function recognizeImage(image: Blob | ImageData | HTMLCanvasElement, assets: FileScanAssets): Promise<string> {
  if (image instanceof Blob) {
    const bitmap = await createImageBitmap(image);
    try {
      if (bitmap.width * bitmap.height > MAX_OCR_PIXELS) {
        throw new Error('Images over 12 megapixels cannot be scanned safely.');
      }
    } finally {
      bitmap.close();
    }
  }
  const worker = await getOcrWorker(assets);
  const { data } = await worker.recognize(image);
  return data.text;
}

async function extractPdfText(file: File, assets: FileScanAssets): Promise<string> {
  const pdfjs = await import('pdfjs-dist/legacy/build/pdf.mjs');
  pdfjs.GlobalWorkerOptions.workerSrc = assets.pdfWorkerSrc;
  const loadingTask = pdfjs.getDocument({
    data: new Uint8Array(await file.arrayBuffer()),
    isEvalSupported: false,
    useSystemFonts: false,
  });
  const pdf = await loadingTask.promise;
  if (pdf.numPages > MAX_PDF_PAGES) {
    await pdf.destroy();
    throw new Error(`PDFs over ${MAX_PDF_PAGES} pages cannot be scanned safely.`);
  }

  const pages: string[] = [];
  try {
    for (let pageNumber = 1; pageNumber <= pdf.numPages; pageNumber++) {
      const page = await pdf.getPage(pageNumber);
      const textContent = await page.getTextContent();
      const pageText = textContent.items
        .map((item) => ('str' in item && typeof item.str === 'string' ? item.str : ''))
        .filter(Boolean)
        .join(' ');
      const operatorList = await page.getOperatorList();
      const containsImages = operatorList.fnArray.some((operator) =>
        operator === pdfjs.OPS.paintImageXObject ||
        operator === pdfjs.OPS.paintInlineImageXObject ||
        operator === pdfjs.OPS.paintImageMaskXObject,
      );
      if (pageText.trim() && !containsImages) {
        pages.push(pageText);
        continue;
      }

      const viewport = page.getViewport({ scale: 1.5 });
      if (viewport.width * viewport.height > MAX_OCR_PIXELS) {
        throw new Error('A scanned PDF page is too large to OCR safely.');
      }
      const canvas = document.createElement('canvas');
      canvas.width = Math.ceil(viewport.width);
      canvas.height = Math.ceil(viewport.height);
      const context = canvas.getContext('2d', { willReadFrequently: true });
      if (!context) throw new Error('Local PDF image scanning is unavailable in this browser.');
      await page.render({ canvasContext: context, viewport }).promise;
      pages.push([pageText, await recognizeImage(canvas, assets)].filter(Boolean).join('\n'));
      canvas.width = 0;
      canvas.height = 0;
    }
  } finally {
    await pdf.destroy();
  }
  return boundedText(pages.join('\n'));
}

function unzipOfficeArchive(archive: Uint8Array): Unzipped {
  const view = new DataView(archive.buffer, archive.byteOffset, archive.byteLength);
  const minimumOffset = Math.max(0, archive.byteLength - 65_557);
  let endOfCentralDirectory = -1;
  for (let offset = archive.byteLength - 22; offset >= minimumOffset; offset--) {
    if (view.getUint32(offset, true) === 0x06054b50) {
      endOfCentralDirectory = offset;
      break;
    }
  }
  if (endOfCentralDirectory < 0) throw new Error('The Office document archive is invalid.');

  const entryCount = view.getUint16(endOfCentralDirectory + 10, true);
  const centralDirectorySize = view.getUint32(endOfCentralDirectory + 12, true);
  const centralDirectoryOffset = view.getUint32(endOfCentralDirectory + 16, true);
  if (
    entryCount > MAX_OFFICE_ARCHIVE_ENTRIES ||
    centralDirectorySize === 0xffffffff ||
    centralDirectoryOffset === 0xffffffff ||
    centralDirectoryOffset + centralDirectorySize > endOfCentralDirectory
  ) {
    throw new Error('This Office document archive exceeds safe scanning limits.');
  }

  let totalUncompressedBytes = 0;
  let offset = centralDirectoryOffset;
  for (let entryIndex = 0; entryIndex < entryCount; entryIndex++) {
    if (offset + 46 > archive.byteLength || view.getUint32(offset, true) !== 0x02014b50) {
      throw new Error('The Office document archive is invalid.');
    }
    const flags = view.getUint16(offset + 8, true);
    const uncompressedBytes = view.getUint32(offset + 24, true);
    const nameLength = view.getUint16(offset + 28, true);
    const extraLength = view.getUint16(offset + 30, true);
    const commentLength = view.getUint16(offset + 32, true);
    if ((flags & 1) !== 0 || uncompressedBytes === 0xffffffff) {
      throw new Error('Encrypted or oversized Office archives cannot be scanned safely.');
    }
    if (uncompressedBytes > MAX_FILE_BYTES) {
      throw new Error('An item in this Office document exceeds the safe scanning limit.');
    }
    totalUncompressedBytes += uncompressedBytes;
    if (totalUncompressedBytes > MAX_OFFICE_ARCHIVE_BYTES) {
      throw new Error('This Office document expands beyond the safe scanning limit.');
    }
    offset += 46 + nameLength + extraLength + commentLength;
  }
  if (offset > centralDirectoryOffset + centralDirectorySize) {
    throw new Error('The Office document archive is invalid.');
  }
  return unzipSync(archive);
}

async function extractOfficeMedia(contents: Unzipped, assets: FileScanAssets): Promise<string[]> {
  const images: string[] = [];
  const mediaPaths = Object.keys(contents).filter((name) => /^(?:word|xl|ppt)\/media\/[^/]+$/i.test(name));
  if (mediaPaths.length > MAX_OFFICE_MEDIA_FILES) {
    throw new Error('Office documents with more than 20 embedded images cannot be scanned safely.');
  }
  for (const imagePath of mediaPaths) {
    const bytes = contents[imagePath];
    if (!bytes) continue;
    if (!/\.(?:png|jpe?g|bmp|webp|tiff?)$/i.test(imagePath)) {
      throw new Error('This Office document contains embedded media that Krypton cannot scan safely.');
    }
    if (bytes.byteLength > MAX_FILE_BYTES) {
      throw new Error('An embedded image exceeds the safe scanning limit.');
    }
    const extension = imagePath.split('.').pop()?.toLowerCase() || 'png';
    if (/^tiff?$/i.test(extension)) {
      throw new Error('Embedded TIFF images cannot be scanned safely.');
    }
    assertStaticImage(bytes, extension);
    const mimeType = extension === 'jpg' ? 'image/jpeg' : `image/${extension}`;
    const blobBytes = new Uint8Array(bytes.byteLength);
    blobBytes.set(bytes);
    images.push(await recognizeImage(new Blob([blobBytes.buffer], { type: mimeType }), assets));
  }
  return images;
}

function decodeXmlText(value: string): string {
  return value
    .replace(/&#x([0-9a-f]{1,6});/gi, (_match, code: string) => {
      const point = Number.parseInt(code, 16);
      return point <= 0x10ffff && !(point >= 0xd800 && point <= 0xdfff)
        ? String.fromCodePoint(point)
        : '';
    })
    .replace(/&#(\d{1,7});/g, (_match, code: string) => {
      const point = Number.parseInt(code, 10);
      return point <= 0x10ffff && !(point >= 0xd800 && point <= 0xdfff)
        ? String.fromCodePoint(point)
        : '';
    })
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, '\'')
    .replace(/&amp;/g, '&');
}

function assertSafeOfficeXml(xml: string): void {
  if (xml.length > MAX_FILE_BYTES || /<!DOCTYPE|<!ENTITY/i.test(xml)) {
    throw new Error('This Office document contains XML that cannot be scanned safely.');
  }
  if (typeof DOMParser !== 'undefined') {
    const parsedXml = new DOMParser().parseFromString(xml, 'application/xml');
    if (parsedXml.getElementsByTagName('parsererror').length > 0) {
      throw new Error('This Office document contains malformed XML and cannot be scanned safely.');
    }
  }
}

function extractOfficeXmlText(contents: Unzipped, folder: 'word' | 'ppt'): string {
  const extracted: string[] = [];
  for (const [filePath, bytes] of Object.entries(contents)) {
    if (!filePath.startsWith(`${folder}/`) || !filePath.toLowerCase().endsWith('.xml')) continue;
    const xml = new TextDecoder().decode(bytes);
    assertSafeOfficeXml(xml);
    const textValues = xml.matchAll(/<(?:[a-z0-9_-]+:)?(?:t|delText|f|v)(?:\s[^>]*)?>([\s\S]*?)<\/(?:[a-z0-9_-]+:)?(?:t|delText|f|v)\s*>/gi);
    for (const [, value] of textValues) extracted.push(decodeXmlText(value));
  }
  return boundedText(extracted.join('\n'));
}

function extractXlsxText(contents: Unzipped): string {
  const sharedStrings: string[] = [];
  const sharedStringsFile = contents['xl/sharedStrings.xml'];
  if (sharedStringsFile) {
    const xml = new TextDecoder().decode(sharedStringsFile);
    assertSafeOfficeXml(xml);
    for (const [, item] of xml.matchAll(/<si(?:\s[^>]*)?>([\s\S]*?)<\/si>/g)) {
      const text = Array.from(item.matchAll(/<t(?:\s[^>]*)?>([\s\S]*?)<\/t>/g), (match) => decodeXmlText(match[1]));
      sharedStrings.push(text.join(''));
    }
  }

  const sheetPaths = Object.keys(contents)
    .filter((name) => /^xl\/worksheets\/sheet\d+\.xml$/i.test(name))
    .sort((left, right) => left.localeCompare(right, undefined, { numeric: true }));
  const extracted: string[] = [];
  for (const sheetPath of sheetPaths) {
    const bytes = contents[sheetPath];
    if (!bytes) continue;
    const xml = new TextDecoder().decode(bytes);
    assertSafeOfficeXml(xml);
    for (const [, attributes, body = ''] of xml.matchAll(/<c\b([^>]*?)(?:\/>|>([\s\S]*?)<\/c>)/g)) {
      const type = attributes.match(/\bt\s*=\s*["']([^"']+)["']/i)?.[1];
      if (type === 'inlineStr') {
        extracted.push(...Array.from(body.matchAll(/<t(?:\s[^>]*)?>([\s\S]*?)<\/t>/g), (match) => decodeXmlText(match[1])));
      }

      const formula = body.match(/<f(?:\s[^>]*)?>([\s\S]*?)<\/f>/)?.[1];
      if (formula !== undefined) extracted.push(decodeXmlText(formula));
      const rawValue = body.match(/<v(?:\s[^>]*)?>([\s\S]*?)<\/v>/)?.[1];
      if (rawValue === undefined) continue;
      const value = decodeXmlText(rawValue);
      if (type === 's') {
        const index = Number.parseInt(value, 10);
        if (!Number.isInteger(index) || index < 0 || index >= sharedStrings.length) {
          throw new Error('This workbook contains an invalid shared-string reference.');
        }
        extracted.push(sharedStrings[index]);
      } else {
        extracted.push(value);
      }
    }
  }
  for (const [filePath, bytes] of Object.entries(contents)) {
    if (!filePath.startsWith('xl/') || !filePath.toLowerCase().endsWith('.xml')) continue;
    if (/^xl\/(?:worksheets\/|sharedStrings\.xml$)/i.test(filePath)) continue;
    const xml = new TextDecoder().decode(bytes);
    assertSafeOfficeXml(xml);
    for (const [, value] of xml.matchAll(/<(?:[a-z0-9_-]+:)?(?:t|f|v|definedName)(?:\s[^>]*)?>([\s\S]*?)<\/(?:[a-z0-9_-]+:)?(?:t|f|v|definedName)\s*>/gi)) {
      extracted.push(decodeXmlText(value));
    }
  }
  return boundedText(extracted.join('\n'));
}

async function extractFileText(file: File, assets: FileScanAssets): Promise<string> {
  const extension = getExtension(file);
  if (file.size === 0) throw new Error('The selected file is empty.');
  if (file.size > MAX_FILE_BYTES) throw new Error('Files larger than 15 MB cannot be scanned safely.');

  if (/^(?:txt|csv|tsv|md|json|xml|html|log|yaml|yml)$/i.test(extension)) {
    return boundedText(await file.text());
  }

  if (extension === 'pdf') return extractPdfText(file, assets);

  if (extension === 'docx') {
    const arrayBuffer = await file.arrayBuffer();
    const contents = unzipOfficeArchive(new Uint8Array(arrayBuffer));
    const [documentText, imageText] = await Promise.all([
      Promise.resolve(extractOfficeXmlText(contents, 'word')),
      extractOfficeMedia(contents, assets),
    ]);
    return boundedText([documentText, ...imageText].join('\n'));
  }

  if (extension === 'xlsx') {
    const arrayBuffer = await file.arrayBuffer();
    const officeContents = unzipOfficeArchive(new Uint8Array(arrayBuffer));
    const [sheetText, imageText] = await Promise.all([
      Promise.resolve(extractXlsxText(officeContents)),
      extractOfficeMedia(officeContents, assets),
    ]);
    return boundedText([sheetText, ...imageText].join('\n'));
  }

  if (extension === 'pptx') {
    const arrayBuffer = await file.arrayBuffer();
    const contents = unzipOfficeArchive(new Uint8Array(arrayBuffer));
    const slideCount = Object.keys(contents).filter((name) => /^ppt\/slides\/slide\d+\.xml$/i.test(name)).length;
    if (slideCount > 100) {
      throw new Error('Presentations with more than 100 slides cannot be scanned safely.');
    }
    const imageText = await extractOfficeMedia(contents, assets);
    return boundedText([extractOfficeXmlText(contents, 'ppt'), ...imageText].join('\n'));
  }

  if (/^(?:png|jpe?g|webp|bmp)$/i.test(extension)) {
    assertStaticImage(new Uint8Array(await file.arrayBuffer()), extension);
    return boundedText(await recognizeImage(file, assets));
  }

  throw new Error(`Unsupported file type ".${extension || 'unknown'}". Use PDF, DOCX, XLSX, PPTX, CSV, text, or a supported image.`);
}

export async function scanFileLocally(
  file: File,
  engine: PromptSecurityEngine,
  assets: FileScanAssets,
): Promise<ScannedFileResult> {
  const extractedText = await extractFileText(file, assets);
  if (!extractedText.trim()) {
    throw new Error('No readable text was found in the selected file. The upload was stopped because it could not be verified.');
  }
  return {
    fileType: getExtension(file),
    scan: engine.scan(extractedText),
  };
}
