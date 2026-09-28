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
    'pdf', 'doc', 'docx', 'zip',
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

function structuredText(value) {
  return String(value || '')
    .replace(/\r\n?/g, '\n')
    .replace(/[\t\f\v ]+/g, ' ')
    .replace(/ *\n */g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
    .slice(0, TEXT_LIMIT);
}

function unreadableDocumentError(extension) {
  const labels = {
    pdf: 'PDF',
    doc: 'Word',
    docx: 'Word',
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
  if (['ppt', 'pptx'].includes(extension)) {
    throw new ValidationError('PowerPoint files (.pptx, .ppt) are analyzed in Presentation Coach. Please upload PDF, Word, text, code, or ZIP files here.');
  }
  if (!file?.buffer?.length || !ALLOWED_BY_KIND[kind]?.has(extension)) {
    throw new ValidationError(`Upload a supported ${kind} file.`);
  }
  const detected = await detectFileType(file.buffer).catch(() => undefined);
  const detectedExtension = detected?.ext;
  if (detectedExtension && extension !== detectedExtension && !(extension === 'docx' && detectedExtension === 'zip')) {
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

async function pdfTextWithPageMarkers(buffer) {
  try {
    let pageNumber = 0;
    let accumulatedLength = 0;
    const parsed = await pdfParse(buffer, {
      max: 30,
      pagerender: async (page) => {
        pageNumber += 1;
        if (pageNumber > 30 || accumulatedLength >= TEXT_LIMIT) {
          return '';
        }
        const content = await page.getTextContent({ normalizeWhitespace: true, disableCombineTextItems: false });
        const pageText = content.items
          .map((item) => String(item.str || '').trim())
          .filter(Boolean)
          .join(' ');
        accumulatedLength += pageText.length;
        return `\n[Page ${pageNumber}]\n${pageText}`;
      },
    });
    const parsedText = text(parsed.text);
    if (parsedText.length >= 10) return parsedText;
  } catch (err) {
    // fallback to stream extraction if pdfParse errors out
  }

  // Raw text stream string fallback
  try {
    const rawString = buffer.toString('latin1');
    const matches = rawString.match(/\(([^()\\]|\\[\s\S])*\)/g) || [];
    const extracted = matches
      .map((m) => m.slice(1, -1).replace(/\\([0-7]{3})/g, (_, oct) => String.fromCharCode(parseInt(oct, 8))).replace(/\\(.)/g, '$1'))
      .filter((t) => t.trim().length > 1)
      .join(' ');
    const fallbackText = text(extracted);
    if (fallbackText.length >= 10) return fallbackText;
  } catch (err) {
    // ignore
  }

  throw unreadableDocumentError('pdf');
}

async function docxTextWithXmlFallback(buffer) {
  let extracted = '';
  try {
    const parsed = await mammoth.extractRawText({ buffer });
    extracted = text(parsed.value);
  } catch (err) {
    // fallback to XML extraction
  }
  if (!extracted || extracted.length < 5) {
    try {
      const archive = new AdmZip(buffer);
      const docXml = archive.getEntry('word/document.xml')?.getData()?.toString('utf8');
      if (docXml) extracted = xmlText(docXml);
    } catch (err) {
      // ignore
    }
  }
  if (extracted && extracted.length >= 2) return extracted;
  throw unreadableDocumentError('docx');
}

async function extractText(file, kind) {
  const extension = await validate(file, kind);
  if (!['pdf', 'doc', 'docx', 'zip'].includes(extension)) {
    return { extension, text: text(file.buffer.toString('utf8').replace(/\u0000/g, '')) };
  }
  try {
    if (extension === 'pdf') {
      return { extension, text: await pdfTextWithPageMarkers(file.buffer) };
    }
    if (extension === 'docx') {
      return { extension, text: await docxTextWithXmlFallback(file.buffer) };
    }
    if (extension === 'doc') {
      const extracted = await new WordExtractor().extract(file.buffer);
      return { extension, text: text([extracted.getHeaders(), extracted.getBody(), extracted.getFootnotes(), extracted.getEndnotes()].filter(Boolean).join('\n')) };
    }
    if (extension === 'zip') return { extension, text: archiveText(file.buffer) };
  } catch (error) {
    if (error instanceof ValidationError) throw error;
    throw unreadableDocumentError(extension);
  }
  throw new ValidationError('This file format is not supported.');
}

module.exports = { extractText };
