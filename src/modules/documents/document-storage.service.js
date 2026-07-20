const fs = require('fs/promises');
const path = require('path');
const { randomUUID } = require('crypto');

const uploadRoot = path.resolve(__dirname, '../../../storage/uploads');

function safeName(name) {
  return String(name || 'document').replace(/[^a-zA-Z0-9._-]/g, '-').slice(-180);
}

async function storeProjectFile(studentId, file) {
  const directory = path.join(uploadRoot, 'project-critiques', String(studentId), randomUUID());
  await fs.mkdir(directory, { recursive: true });
  const filename = `${randomUUID()}-${safeName(file.originalname)}`;
  const absolutePath = path.join(directory, filename);
  await fs.writeFile(absolutePath, file.buffer);
  return { storagePath: path.relative(path.resolve(__dirname, '../../..'), absolutePath).replace(/\\/g, '/') };
}

module.exports = { storeProjectFile };
