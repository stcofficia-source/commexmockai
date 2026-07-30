const fs = require('fs/promises');
const os = require('os');
const path = require('path');
const { createHash } = require('crypto');
const NodeClam = require('clamscan');
const AdmZip = require('adm-zip');
const CFB = require('cfb');
const env = require('../../config/env');
const logger = require('../../core/logger');
const { ValidationError } = require('../../core/errors');

const MAX_FILE_BYTES = 25 * 1024 * 1024;
const MAX_TOTAL_BYTES = 100 * 1024 * 1024;
const MAX_FILES = 10;
const MAX_ARCHIVE_ENTRIES = 250;
const MAX_ARCHIVE_EXPANDED_BYTES = 40 * 1024 * 1024;
const EICAR_SIGNATURE = 'X5O!P%@AP[4\\PZX54(P^)7CC)7}$EICAR-STANDARD-ANTIVIRUS-TEST-FILE!$H+H*';

const DOCUMENT_EXTENSIONS = new Set([
  'pdf', 'doc', 'docx', 'ppt', 'pptx',
  'txt', 'md', 'markdown', 'csv', 'json', 'xml', 'yaml', 'yml', 'rtf',
]);
const CODE_EXTENSIONS = new Set([
  'js', 'jsx', 'mjs', 'cjs', 'ts', 'tsx', 'php', 'py', 'java', 'c', 'cc', 'cpp',
  'h', 'hpp', 'cs', 'go', 'rs', 'rb', 'swift', 'kt', 'kts', 'sql', 'sh', 'bash',
  'zsh', 'html', 'htm', 'css', 'scss', 'sass', 'less', 'vue', 'svelte', 'dart',
  'gradle', 'properties', 'toml', 'ini', 'env', 'gitignore', 'dockerfile',
]);
const ARCHIVE_EXTENSIONS = new Set(['zip']);
const SUPPORTED_EXTENSIONS = new Set([
  ...DOCUMENT_EXTENSIONS,
  ...CODE_EXTENSIONS,
  ...ARCHIVE_EXTENSIONS,
]);
const TEXT_EXTENSIONS = new Set([
  ...CODE_EXTENSIONS,
  'txt', 'md', 'markdown', 'csv', 'json', 'xml', 'yaml', 'yml', 'rtf',
]);

let scannerPromise;
let fileTypeModulePromise;

async function detectFileType(buffer) {
  fileTypeModulePromise ||= import('file-type');
  const { fileTypeFromBuffer } = await fileTypeModulePromise;
  return fileTypeFromBuffer(buffer);
}

function extensionOf(name) {
  const base = path.basename(String(name || '')).toLowerCase();
  if (base === 'dockerfile') return 'dockerfile';
  if (base === '.env') return 'env';
  if (base === '.gitignore') return 'gitignore';
  return base.includes('.') ? base.split('.').pop() : '';
}

function securityError(message, statusCode = 422) {
  const error = new ValidationError(message);
  error.statusCode = statusCode;
  return error;
}

function validateArchive(buffer) {
  let archive;
  try {
    archive = new AdmZip(buffer);
  } catch {
    throw securityError('The ZIP archive is damaged or cannot be inspected safely.');
  }
  const entries = archive.getEntries();
  if (entries.length > MAX_ARCHIVE_ENTRIES) {
    throw securityError(`ZIP archives may contain at most ${MAX_ARCHIVE_ENTRIES} files.`);
  }
  let expandedBytes = 0;
  for (const entry of entries) {
    const normalized = path.posix.normalize(String(entry.entryName || '').replace(/\\/g, '/'));
    if (normalized.startsWith('../') || normalized.includes('/../') || path.posix.isAbsolute(normalized)) {
      throw securityError('The ZIP archive contains an unsafe file path.');
    }
    expandedBytes += Number(entry.header?.size || 0);
    if (expandedBytes > MAX_ARCHIVE_EXPANDED_BYTES) {
      throw securityError('The ZIP archive expands beyond the safe processing limit.');
    }
  }
}

function validateLegacyOffice(buffer, extension) {
  let container;
  try {
    container = CFB.read(buffer, { type: 'buffer' });
  } catch {
    throw securityError(`The .${extension} document is damaged or cannot be inspected safely.`);
  }
  const paths = (container.FullPaths || []).map((name) => String(name).toLowerCase());
  const expectedStream = extension === 'doc' ? /\/worddocument$/ : /\/powerpoint document$/;
  if (!paths.some((name) => expectedStream.test(name))) {
    throw securityError(`The uploaded file is not a valid .${extension} document.`);
  }
  if (paths.some((name) => /(?:\/vba\/|\/macros?\/|\/_vba_project|\/projectwm$|\/objectpool\/)/i.test(name))) {
    throw securityError('Legacy Office files containing macros or embedded objects are not accepted.');
  }
}

function contentSafetyGate(file, extension) {
  const ascii = file.buffer.toString('latin1');
  if (ascii.includes(EICAR_SIGNATURE)) {
    throw securityError(`${file.originalname} was rejected by the malware safety test.`);
  }
  if (/^MZ/.test(ascii) || file.buffer.subarray(0, 4).equals(Buffer.from([0x7f, 0x45, 0x4c, 0x46]))) {
    throw securityError('Executable files cannot be analyzed.');
  }
  if (extension === 'pdf' && /\/(?:JavaScript|JS|Launch|EmbeddedFile)\b/i.test(ascii)) {
    throw securityError('PDF files containing active scripts, launch actions, or embedded files are not accepted.');
  }
  if (extension === 'zip') validateArchive(file.buffer);
  if (['doc', 'ppt'].includes(extension)) validateLegacyOffice(file.buffer, extension);
}

async function validateFile(file) {
  if (!file?.buffer?.length) throw securityError('Empty files cannot be analyzed.');
  const extension = extensionOf(file.originalname);
  if (!SUPPORTED_EXTENSIONS.has(extension)) {
    throw securityError(`.${extension || 'unknown'} files are not supported. Upload a PDF, DOCX, PPTX, text/code file, or safe ZIP project.`);
  }
  if (file.size > MAX_FILE_BYTES) {
    throw securityError(`${file.originalname} exceeds the 25 MB per-file limit.`);
  }

  const detected = await detectFileType(file.buffer).catch(() => undefined);
  const detectedExtension = String(detected?.ext || '').toLowerCase();
  const officeZip = ['docx', 'pptx'].includes(extension) && detectedExtension === 'zip';
  const legacyOffice = ['doc', 'ppt'].includes(extension) && detectedExtension === 'cfb';
  const plainText = TEXT_EXTENSIONS.has(extension) && !detectedExtension;
  const exact = !detectedExtension || detectedExtension === extension || officeZip || legacyOffice || plainText;
  if (!exact) throw securityError(`${file.originalname} does not match its declared file type.`);

  contentSafetyGate(file, extension);
  return { extension, detectedMime: detected?.mime || file.mimetype || 'application/octet-stream' };
}

async function clamScanner() {
  if (scannerPromise) return scannerPromise;
  scannerPromise = new NodeClam().init({
    removeInfected: false,
    quarantineInfected: false,
    scanRecursively: false,
    clamscan: {
      path: env.CLAMAV_CLAMSCAN_PATH,
      scanArchives: true,
      active: true,
    },
    clamdscan: {
      socket: env.CLAMAV_SOCKET || false,
      host: env.CLAMAV_HOST || false,
      port: env.CLAMAV_HOST ? env.CLAMAV_PORT : false,
      timeout: env.CLAMAV_TIMEOUT_MS,
      localFallback: true,
      path: env.CLAMAV_CLAMDSCAN_PATH,
      multiscan: true,
      active: true,
    },
    preference: env.CLAMAV_SOCKET || env.CLAMAV_HOST ? 'clamdscan' : 'clamscan',
  }).catch((error) => {
    scannerPromise = null;
    throw error;
  });
  return scannerPromise;
}

async function scanWithClam(file) {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'commex-project-scan-'));
  const safeName = path.basename(String(file.originalname || 'upload')).replace(/[^a-zA-Z0-9._-]/g, '-');
  const filePath = path.join(directory, safeName);
  try {
    await fs.writeFile(filePath, file.buffer, { flag: 'wx', mode: 0o600 });
    const scanner = await clamScanner();
    const result = await scanner.isInfected(filePath);
    if (result?.isInfected) {
      throw securityError(`${file.originalname} contains malware and was rejected.`);
    }
    return { engine: 'ClamAV', version: await scanner.getVersion().catch(() => '') };
  } finally {
    await fs.rm(directory, { recursive: true, force: true });
  }
}

async function scanProjectFiles(files) {
  if (!Array.isArray(files) || !files.length) throw securityError('Upload at least one project file.');
  if (files.length > MAX_FILES) throw securityError(`Upload at most ${MAX_FILES} files per critique.`);
  const totalBytes = files.reduce((total, file) => total + Number(file.size || 0), 0);
  if (totalBytes > MAX_TOTAL_BYTES) throw securityError('The combined upload size cannot exceed 100 MB.');

  const results = [];
  for (const file of files) {
    const validated = await validateFile(file);
    let scan = { engine: 'Commex content-safety gate', version: '1' };
    try {
      scan = await scanWithClam(file);
    } catch (error) {
      if (error instanceof ValidationError) throw error;
      if (String(env.PROJECT_UPLOAD_SCAN_MODE).toLowerCase() === 'strict') {
        logger.error({ err: error.message }, 'ClamAV scanner unavailable in strict mode');
        throw securityError('Malware scanning is temporarily unavailable. The upload was not processed.', 503);
      }
      logger.warn({ err: error.message }, 'ClamAV unavailable; compatible content-safety gate used');
    }
    results.push({
      name: file.originalname,
      extension: validated.extension,
      mimeType: validated.detectedMime,
      size: file.size,
      sha256: createHash('sha256').update(file.buffer).digest('hex'),
      scanStatus: 'clean',
      scanEngine: scan.engine,
      scanVersion: String(scan.version || '').slice(0, 120),
      scannedAt: new Date().toISOString(),
    });
  }
  return results;
}

module.exports = {
  CODE_EXTENSIONS,
  DOCUMENT_EXTENSIONS,
  MAX_FILE_BYTES,
  MAX_FILES,
  MAX_TOTAL_BYTES,
  SUPPORTED_EXTENSIONS,
  extensionOf,
  scanProjectFiles,
};
