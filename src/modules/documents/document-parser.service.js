const AdmZip = require('adm-zip');
const CFB = require('cfb');
const mammoth = require('mammoth');
const pdfParse = require('pdf-parse');
const WordExtractor = require('word-extractor');
const { ValidationError } = require('../../core/errors');

const TEXT_LIMIT = 60000;
const ALLOWED_BY_KIND = {
  resume: new Set(['pdf', 'doc', 'docx', 'txt']),
  project: new Set([
    'pdf', 'doc', 'docx', 'ppt', 'pptx', 'zip',
    'txt', 'md', 'markdown', 'csv', 'json', 'xml', 'yaml', 'yml', 'rtf',
    'js', 'jsx', 'mjs', 'cjs', 'ts', 'tsx', 'php', 'py', 'java', 'c', 'cc', 'cpp',
    'h', 'hpp', 'cs', 'go', 'rs', 'rb', 'swift', 'kt', 'kts', 'sql', 'sh', 'bash',
    'zsh', 'html', 'htm', 'css', 'scss', 'sass', 'less', 'vue', 'svelte', 'dart',
    'gradle', 'properties', 'toml', 'ini', 'env', 'gitignore', 'dockerfile',
  ]),
};
let fileTypeModulePromise;

async function detectFileType(buffer) {
  fileTypeModulePromise ||= import('file-type');
  const { fileTypeFromBuffer } = await fileTypeModulePromise;
  return fileTypeFromBuffer(buffer);
}

function extensionOf(name) {
  return String(name || '').split('.').pop().toLowerCase();
}

function text(value) {
  return String(value || '').replace(/\s+/g, ' ').trim().slice(0, TEXT_LIMIT);
}

function unreadableDocumentError(extension) {
  const labels = {
    pdf: 'PDF',
    doc: 'Word',
    docx: 'Word',
    ppt: 'PowerPoint',
    pptx: 'PowerPoint',
    zip: 'ZIP archive',
  };
  return new ValidationError(`The ${labels[extension] || 'uploaded'} file is damaged or cannot be read. Export or download a fresh copy and upload it again.`);
}

function xmlText(value) {
  return text(String(value || '')
    .replace(/<a:br\s*\/?>/gi, ' ')
    .replace(/<\/a:p>/gi, '\n')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>'));
}

async function validate(file, kind) {
  const base = String(file?.originalname || '').split(/[\\/]/).pop().toLowerCase();
  const extension = base === 'dockerfile' ? 'dockerfile' : base === '.env' ? 'env' : base === '.gitignore' ? 'gitignore' : extensionOf(file?.originalname);
  if (!file?.buffer?.length || !ALLOWED_BY_KIND[kind]?.has(extension)) {
    throw new ValidationError(`Upload a supported ${kind} file.`);
  }
  const detected = await detectFileType(file.buffer).catch(() => undefined);
  const detectedExtension = detected?.ext;
  if (detectedExtension && extension !== detectedExtension && !(extension === 'docx' && detectedExtension === 'zip') && !(extension === 'pptx' && detectedExtension === 'zip')) {
    throw new ValidationError('The file contents do not match its extension.');
  }
  return extension;
}

function archiveText(buffer) {
  const archive = new AdmZip(buffer);
  const entries = archive.getEntries()
    .filter((entry) => !entry.isDirectory)
    .filter((entry) => !/(^|\/)(node_modules|vendor|dist|build|coverage|\.git)(\/|$)/i.test(entry.entryName))
    .filter((entry) => !/\.(png|jpe?g|gif|webp|ico|pdf|docx?|pptx?|xlsx?|exe|dll|so|dylib|class|jar|woff2?|ttf|otf)$/i.test(entry.entryName))
    .slice(0, 180);
  let remaining = TEXT_LIMIT;
  const blocks = [];
  for (const entry of entries) {
    if (remaining <= 0) break;
    const content = entry.getData().toString('utf8').replace(/\u0000/g, '');
    if (!content.trim()) continue;
    const block = `FILE: ${entry.entryName}\n${content.slice(0, Math.min(12000, remaining))}`;
    blocks.push(block);
    remaining -= block.length;
  }
  return text(blocks.join('\n\n'));
}

function legacyPowerPointText(buffer) {
  const container = CFB.read(buffer, { type: 'buffer' });
  const stream = container.FileIndex?.find((entry) => /\/powerpoint document$/i.test(entry.name || entry.FullPath || ''))
    || container.FileIndex?.find((entry) => /powerpoint document/i.test(entry.name || ''));
  if (!stream?.content?.length) throw new ValidationError('The PowerPoint document does not contain a readable slide stream.');
  const source = Buffer.from(stream.content);
  const values = [];
  for (let offset = 0; offset + 8 <= source.length; offset += 1) {
    const recordType = source.readUInt16LE(offset + 2);
    const length = source.readUInt32LE(offset + 4);
    if (![4000, 4008].includes(recordType) || !length || length > 1024 * 1024 || offset + 8 + length > source.length) continue;
    const body = source.subarray(offset + 8, offset + 8 + length);
    const value = recordType === 4000 ? body.toString('utf16le') : body.toString('latin1');
    const cleaned = value.replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g, ' ').replace(/\s+/g, ' ').trim();
    if (cleaned.length > 1) values.push(cleaned);
    offset += 7 + length;
  }
  const unique = Array.from(new Set(values));
  if (!unique.length) throw new ValidationError('No readable text was found in the PowerPoint document.');
  return text(unique.join('\n'));
}

async function pdfTextWithPageMarkers(buffer) {
  let pageNumber = 0;
  const parsed = await pdfParse(buffer, {
    pagerender: async (page) => {
      pageNumber += 1;
      const content = await page.getTextContent({ normalizeWhitespace: true, disableCombineTextItems: false });
      const pageText = content.items
        .map((item) => String(item.str || '').trim())
        .filter(Boolean)
        .join(' ');
      return `\n[Page ${pageNumber}]\n${pageText}`;
    },
  });
  return text(parsed.text);
}

async function extractText(file, kind) {
  const extension = await validate(file, kind);
  if (!['pdf', 'doc', 'docx', 'ppt', 'pptx', 'zip'].includes(extension)) {
    return { extension, text: text(file.buffer.toString('utf8').replace(/\u0000/g, '')) };
  }
  try {
    if (extension === 'pdf') {
      return { extension, text: await pdfTextWithPageMarkers(file.buffer) };
    }
    if (extension === 'docx') {
      const parsed = await mammoth.extractRawText({ buffer: file.buffer });
      return { extension, text: text(parsed.value) };
    }
    if (extension === 'doc') {
      const extracted = await new WordExtractor().extract(file.buffer);
      return { extension, text: text([extracted.getHeaders(), extracted.getBody(), extracted.getFootnotes(), extracted.getEndnotes()].filter(Boolean).join('\n')) };
    }
    if (extension === 'pptx') {
      const archive = new AdmZip(file.buffer);
      const slides = archive.getEntries()
        .filter((entry) => /^ppt\/slides\/slide\d+\.xml$/i.test(entry.entryName))
        .sort((left, right) => left.entryName.localeCompare(right.entryName, undefined, { numeric: true }))
        .map((entry) => xmlText(entry.getData().toString('utf8')))
        .filter(Boolean);
      return { extension, text: text(slides.join('\n')) };
    }
    if (extension === 'ppt') return { extension, text: legacyPowerPointText(file.buffer) };
    if (extension === 'zip') return { extension, text: archiveText(file.buffer) };
  } catch (error) {
    if (error instanceof ValidationError) throw error;
    throw unreadableDocumentError(extension);
  }
  throw new ValidationError('This file format is not supported.');
}

module.exports = { extractText };
