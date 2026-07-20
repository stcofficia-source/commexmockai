const AdmZip = require('adm-zip');
const mammoth = require('mammoth');
const pdfParse = require('pdf-parse');
const { fromBuffer } = require('file-type');
const { ValidationError } = require('../../core/errors');

const TEXT_LIMIT = 30000;
const ALLOWED_BY_KIND = {
  resume: new Set(['pdf', 'doc', 'docx', 'txt']),
  project: new Set(['pdf', 'doc', 'docx', 'ppt', 'pptx']),
};

function extensionOf(name) {
  return String(name || '').split('.').pop().toLowerCase();
}

function text(value) {
  return String(value || '').replace(/\s+/g, ' ').trim().slice(0, TEXT_LIMIT);
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
  const extension = extensionOf(file?.originalname);
  if (!file?.buffer?.length || !ALLOWED_BY_KIND[kind]?.has(extension)) {
    throw new ValidationError(`Upload a supported ${kind} file.`);
  }
  const detected = await fromBuffer(file.buffer).catch(() => undefined);
  const detectedExtension = detected?.ext;
  if (detectedExtension && extension !== detectedExtension && !(extension === 'docx' && detectedExtension === 'zip') && !(extension === 'pptx' && detectedExtension === 'zip')) {
    throw new ValidationError('The file contents do not match its extension.');
  }
  if (['doc', 'ppt'].includes(extension)) {
    throw new ValidationError(`Legacy .${extension} files need conversion. Upload the modern ${extension === 'doc' ? '.docx' : '.pptx'} version instead.`);
  }
  return extension;
}

async function extractText(file, kind) {
  const extension = await validate(file, kind);
  if (extension === 'txt') return { extension, text: text(file.buffer.toString('utf8')) };
  if (extension === 'pdf') {
    const parsed = await pdfParse(file.buffer);
    return { extension, text: text(parsed.text) };
  }
  if (extension === 'docx') {
    const parsed = await mammoth.extractRawText({ buffer: file.buffer });
    return { extension, text: text(parsed.value) };
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
  throw new ValidationError('This file format is not supported.');
}

module.exports = { extractText };
