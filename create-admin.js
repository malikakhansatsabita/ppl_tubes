const { randomUUID } = require('node:crypto');
const {
  close,
  dataFiles,
  ensureDataFiles,
  init,
  readData,
  writeData,
} = require('./storage');
const { hashPassword } = require('./auth');

function createInitialAdmin() {
  const email = String(process.env.PLATIFUL_ADMIN_EMAIL || '').trim().toLowerCase();
  const name = String(process.env.PLATIFUL_ADMIN_NAME || '').trim();
  const password = String(process.env.PLATIFUL_ADMIN_PASSWORD || '');

  if (!email || !name || password.length < 12) {
    throw new Error('Set PLATIFUL_ADMIN_EMAIL, PLATIFUL_ADMIN_NAME, and a PLATIFUL_ADMIN_PASSWORD of at least 12 characters.');
  }
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    throw new Error('PLATIFUL_ADMIN_EMAIL must be a valid email address.');
  }

  ensureDataFiles();
  const users = readData(dataFiles.users);
  if (users.some((user) => user.email === email)) {
    throw new Error('That email already has an account.');
  }

  users.push({
    id: randomUUID(),
    name,
    email,
    role: 'admin',
    ...hashPassword(password),
  });
  writeData(dataFiles.users, users);
}

async function main() {
  await init();
  createInitialAdmin();
  await close();
  console.log('Admin account created. Remove the password environment variable now.');
}

main().catch(async (error) => {
  console.error(error.message);
  try {
    await close();
  } catch (closeError) {
    console.error(`Database cleanup failed: ${closeError.message}`);
  }
  process.exitCode = 1;
});
