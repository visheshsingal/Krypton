import { unzipSync } from 'fflate';

const ZIP_END_OF_CENTRAL_DIRECTORY = 0x06054b50;
const ZIP_CENTRAL_DIRECTORY_ENTRY = 0x02014b50;
const ZIP_LOCAL_FILE_HEADER = 0x04034b50;
const MAX_EXTENSION_FILE_BYTES = 15 * 1024 * 1024;

export function readVerifiedExtensionFiles(
  archive: Uint8Array,
  expectedFiles: string[],
  expectedDirectories: string[],
  maxUncompressedBytes: number,
): Record<string, Uint8Array> {
  const view = new DataView(archive.buffer, archive.byteOffset, archive.byteLength);
  const expectedEntries = new Set([
    ...expectedFiles,
    ...expectedDirectories.map((directory) => `${directory}/`),
  ]);
  const minimumOffset = Math.max(0, archive.byteLength - 65_557);
  let endOffset = -1;
  for (let offset = archive.byteLength - 22; offset >= minimumOffset; offset--) {
    if (view.getUint32(offset, true) === ZIP_END_OF_CENTRAL_DIRECTORY) {
      endOffset = offset;
      break;
    }
  }
  if (endOffset < 0 || endOffset + 22 > archive.byteLength) {
    throw new Error('The extension ZIP is invalid.');
  }

  const diskNumber = view.getUint16(endOffset + 4, true);
  const centralDirectoryDisk = view.getUint16(endOffset + 6, true);
  const entriesOnDisk = view.getUint16(endOffset + 8, true);
  const entryCount = view.getUint16(endOffset + 10, true);
  const centralDirectorySize = view.getUint32(endOffset + 12, true);
  const centralDirectoryOffset = view.getUint32(endOffset + 16, true);
  if (
    diskNumber !== 0 ||
    centralDirectoryDisk !== 0 ||
    entriesOnDisk !== entryCount ||
    entryCount !== expectedEntries.size ||
    centralDirectorySize === 0xffffffff ||
    centralDirectoryOffset === 0xffffffff ||
    centralDirectoryOffset + centralDirectorySize > endOffset
  ) {
    throw new Error('The extension ZIP has an invalid or unsupported directory structure.');
  }

  const seenEntries = new Set<string>();
  const entryOffsets: number[] = [];
  let offset = centralDirectoryOffset;
  let totalUncompressedBytes = 0;
  for (let entryIndex = 0; entryIndex < entryCount; entryIndex++) {
    if (offset + 46 > archive.byteLength || view.getUint32(offset, true) !== ZIP_CENTRAL_DIRECTORY_ENTRY) {
      throw new Error('The extension ZIP contains an invalid entry.');
    }

    const flags = view.getUint16(offset + 8, true);
    const compressionMethod = view.getUint16(offset + 10, true);
    const compressedBytes = view.getUint32(offset + 20, true);
    const uncompressedBytes = view.getUint32(offset + 24, true);
    const nameLength = view.getUint16(offset + 28, true);
    const extraLength = view.getUint16(offset + 30, true);
    const commentLength = view.getUint16(offset + 32, true);
    const externalAttributes = view.getUint32(offset + 38, true);
    const localHeaderOffset = view.getUint32(offset + 42, true);
    const entryEnd = offset + 46 + nameLength + extraLength + commentLength;
    if (
      entryEnd > centralDirectoryOffset + centralDirectorySize ||
      (flags & 1) !== 0 ||
      (compressionMethod !== 0 && compressionMethod !== 8) ||
      compressedBytes === 0xffffffff ||
      uncompressedBytes === 0xffffffff ||
      localHeaderOffset === 0xffffffff ||
      uncompressedBytes > MAX_EXTENSION_FILE_BYTES
    ) {
      throw new Error('The extension ZIP contains an encrypted, oversized, or unsupported entry.');
    }

    const name = new TextDecoder('utf-8', { fatal: true }).decode(
      archive.subarray(offset + 46, offset + 46 + nameLength),
    );
    if (!expectedEntries.has(name) || seenEntries.has(name) || name.includes('\\') || name.startsWith('/')) {
      throw new Error('The extension ZIP contains missing, duplicate, or unexpected paths.');
    }
    const isDirectory = name.endsWith('/');
    const fileType = (externalAttributes >>> 16) & 0xf000;
    if (fileType !== 0 && fileType !== (isDirectory ? 0x4000 : 0x8000)) {
      throw new Error('The extension ZIP contains an unsupported filesystem entry.');
    }

    if (localHeaderOffset + 30 > centralDirectoryOffset ||
      view.getUint32(localHeaderOffset, true) !== ZIP_LOCAL_FILE_HEADER) {
      throw new Error('The extension ZIP contains an invalid local file entry.');
    }
    const localNameLength = view.getUint16(localHeaderOffset + 26, true);
    const localExtraLength = view.getUint16(localHeaderOffset + 28, true);
    const dataStart = localHeaderOffset + 30 + localNameLength + localExtraLength;
    if (dataStart + compressedBytes > centralDirectoryOffset) {
      throw new Error('The extension ZIP contains an invalid compressed entry.');
    }

    totalUncompressedBytes += uncompressedBytes;
    if (totalUncompressedBytes > maxUncompressedBytes) {
      throw new Error('The extension ZIP expands beyond the safe installation limit.');
    }
    seenEntries.add(name);
    entryOffsets.push(offset);
    offset = entryEnd;
  }

  if (
    offset !== centralDirectoryOffset + centralDirectorySize ||
    seenEntries.size !== expectedEntries.size
  ) {
    throw new Error('The extension ZIP is incomplete.');
  }

  for (let index = 0; index < entryOffsets.length; index++) {
    const entryOffset = entryOffsets[index];
    const localOffset = view.getUint32(entryOffset + 42, true);
    const centralNameLength = view.getUint16(entryOffset + 28, true);
    const localNameLength = view.getUint16(localOffset + 26, true);
    const centralName = archive.subarray(entryOffset + 46, entryOffset + 46 + centralNameLength);
    const localName = archive.subarray(localOffset + 30, localOffset + 30 + localNameLength);
    if (centralNameLength !== localNameLength || !centralName.every((byte, byteIndex) => byte === localName[byteIndex])) {
      throw new Error('The extension ZIP contains mismatched file paths.');
    }
  }

  const extracted = unzipSync(archive);
  const extractedNames = Object.keys(extracted);
  const extractedFiles = extractedNames.filter((name) => !name.endsWith('/')).sort();
  const extractedDirectories = extractedNames
    .filter((name) => name.endsWith('/'))
    .map((name) => name.slice(0, -1))
    .sort();
  const expectedFileNames = [...expectedFiles].sort();
  if (
    extractedFiles.join('\n') !== expectedFileNames.join('\n') ||
    extractedDirectories.join('\n') !== [...expectedDirectories].sort().join('\n')
  ) {
    throw new Error('The extension ZIP contents do not match its verified file list.');
  }
  return Object.fromEntries(expectedFileNames.map((name) => [name, extracted[name]]));
}
