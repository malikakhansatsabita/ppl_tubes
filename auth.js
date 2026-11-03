const {
  createHash,
  randomBytes,
  randomUUID,
  scryptSync,
  timingSafeEqual,
} = require('node:crypto');

const SESSION_DURATION = 7 * 24 * 60 * 60 * 1000;

function publicUser(user) {
  const { id, name, email, role, store } = user;
  return { id, name, email, role, ...(store ? { store } : {}) };
}

function getSessionUser(request, { readData, writeData, dataFiles }) {
  const token = request.headers.cookie
    ?.match(/(?:^|;\s*)platiful_session=([^;]+)/)?.[1];
  if (!token) return null;

  const tokenHash = createHash('sha256').update(token).digest('hex');
  const sessions = readData(dataFiles.sessions);
  const session = sessions.find((item) => item.tokenHash === tokenHash);
  if (!session) return null;

  if (session.expiresAt < Date.now()) {
    writeData(dataFiles.sessions, sessions.filter((item) => item !== session));
    return null;
  }

  const user = readData(dataFiles.users).find((account) => account.id === session.userId);
  return user && !user.suspended ? user : null;
}

function issueSession(response, user, dependencies) {
  const { readData, writeData, dataFiles, sendAuthJson } = dependencies;
  const token = randomBytes(32).toString('hex');
  const sessions = readData(dataFiles.sessions)
    .filter((session) => session.expiresAt >= Date.now());

  sessions.push({
    tokenHash: createHash('sha256').update(token).digest('hex'),
    userId: user.id,
    expiresAt: Date.now() + SESSION_DURATION,
  });
  writeData(dataFiles.sessions, sessions);

  const secureCookie = process.env.NODE_ENV === 'production' ? '; Secure' : '';
  sendAuthJson(
    response,
    200,
    { user: publicUser(user) },
    `platiful_session=${token}; HttpOnly; SameSite=Lax; Path=/; Max-Age=604800${secureCookie}`,
  );
}

function hashPassword(password, salt = randomBytes(16).toString('hex')) {
  return {
    salt,
    passwordHash: scryptSync(password, salt, 64).toString('hex'),
  };
}

function verifyPassword(password, user) {
  const actualHash = scryptSync(password, user.salt, 64);
  const savedHash = Buffer.from(user.passwordHash, 'hex');
  return actualHash.length === savedHash.length
    && timingSafeEqual(actualHash, savedHash);
}

async function handleAuthRequest(request, response, url, dependencies) {
  const { readData, writeData, dataFiles, readRequestBody, sendJson, sendAuthJson } = dependencies;

  if (request.method === 'POST' && url.pathname === '/api/auth/register') {
    const body = await readRequestBody(request);
    const name = String(body.name || '').trim();
    const email = String(body.email || '').trim().toLowerCase();
    const password = String(body.password || '');
    const requestedRole = body.role || 'customer';

    if (body.consent !== true) {
      sendJson(response, 400, { error: 'Persetujuan penggunaan data pribadi wajib dicentang.' });
      return true;
    }
    if (!['customer', 'retailer'].includes(requestedRole)) {
      sendJson(response, 400, { error: 'Jenis akun tidak valid.' });
      return true;
    }

    const storeName = String(body.storeName || '').trim();
    const storeAddress = String(body.storeAddress || '').trim();
    const invalidInput = name.length < 2
      || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)
      || password.length < 8
      || (requestedRole === 'retailer' && (!storeName || !storeAddress));

    if (invalidInput) {
      sendJson(response, 400, {
        error: 'Isi data dengan benar. Password minimal 8 karakter; akun retailer memerlukan nama dan alamat gerai.',
      });
      return true;
    }

    const users = readData(dataFiles.users);
    if (users.some((user) => user.email === email)) {
      sendJson(response, 409, { error: 'Email sudah terdaftar. Silakan masuk.' });
      return true;
    }

    const user = {
      id: randomUUID(),
      name,
      email,
      role: requestedRole,
      ...(requestedRole === 'retailer'
        ? { store: { name: storeName, address: storeAddress, description: '', phone: '', latitude: null, longitude: null } }
        : {}),
      ...hashPassword(password),
    };

    users.push(user);
    writeData(dataFiles.users, users);
    issueSession(response, user, dependencies);
    return true;
  }

  if (request.method === 'POST' && url.pathname === '/api/auth/demo') {
    if (process.env.DEMO_LOGIN === 'off') {
      sendJson(response, 403, { error: 'Login cepat dinonaktifkan.' });
      return true;
    }
    const body = await readRequestBody(request);
    const demoUser = readData(dataFiles.users).find((item) => item.role === body.role && /^tester\./.test(item.email) && !item.suspended);
    if (!demoUser) {
      sendJson(response, 404, { error: 'Akun tester untuk peran ini tidak ditemukan.' });
      return true;
    }
    if (demoUser.role === 'retailer' && demoUser.verification?.status !== 'approved') {
      const allUsers = readData(dataFiles.users);
      const target = allUsers.find((item) => item.id === demoUser.id);
      target.verification = { status: 'approved', reason: 'Akun tester', decidedAt: new Date().toISOString() };
      writeData(dataFiles.users, allUsers);
    }
    issueSession(response, demoUser, dependencies);
    return true;
  }

  if (request.method === 'POST' && url.pathname === '/api/auth/login') {
    const body = await readRequestBody(request);
    const email = String(body.email || '').trim().toLowerCase();
    const password = String(body.password || '');
    const user = readData(dataFiles.users).find((item) => item.email === email);

    if (!user || user.suspended || !verifyPassword(password, user)) {
      sendJson(response, 401, { error: 'Email atau password tidak sesuai.' });
      return true;
    }

    issueSession(response, user, dependencies);
    return true;
  }

  if (request.method === 'POST' && url.pathname === '/api/auth/logout') {
    const token = request.headers.cookie
      ?.match(/(?:^|;\s*)platiful_session=([^;]+)/)?.[1];
    if (token) {
      const tokenHash = createHash('sha256').update(token).digest('hex');
      const sessions = readData(dataFiles.sessions)
        .filter((session) => session.tokenHash !== tokenHash);
      writeData(dataFiles.sessions, sessions);
    }

    const secureCookie = process.env.NODE_ENV === 'production' ? '; Secure' : '';
    sendAuthJson(
      response,
      200,
      { ok: true },
      `platiful_session=; HttpOnly; SameSite=Lax; Path=/; Max-Age=0${secureCookie}`,
    );
    return true;
  }

  if (request.method === 'GET' && url.pathname === '/api/auth/me') {
    const user = getSessionUser(request, dependencies);
    sendJson(response, user ? 200 : 401, user
      ? { user: publicUser(user) }
      : { error: 'Belum masuk.' });
    return true;
  }

  return false;
}

module.exports = {
  getSessionUser,
  hashPassword,
  handleAuthRequest,
  verifyPassword,
};