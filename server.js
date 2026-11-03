const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');

const {
  close: closeStorage,
  checkStorage,
  dataFiles,
  ensureDataFiles,
  flush,
  getStorageStatus,
  init,
  readData,
  writeData,
} = require('./storage');
const { getSessionUser, handleAuthRequest } = require('./auth');
const handleAccountRequest = require('./routes/account');
const handleProductRequest = require('./routes/products');
const handleOrderRequest = require('./routes/orders');
const handleAdminRequest = require('./routes/admin');
const handleExtraRequest = require('./routes/extra');

const PORT = Number(process.env.PORT) || 3000;
const FRONTEND_DIRECTORY = path.resolve(__dirname, '..', 'Front end');
const MIME_TYPES = {
  '.css': 'text/css; charset=utf-8',
  '.html': 'text/html; charset=utf-8',
  '.ico': 'image/x-icon',
  '.jpeg': 'image/jpeg',
  '.jpg': 'image/jpeg',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.svg': 'image/svg+xml',
  '.webp': 'image/webp',
};

function sendJson(response, statusCode, payload) {
  response.writeHead(statusCode, {
    'Content-Type': MIME_TYPES['.json'],
  });
  response.end(JSON.stringify(payload));
}

function sendAuthJson(response, statusCode, payload, cookie) {
  response.writeHead(statusCode, {
    'Content-Type': MIME_TYPES['.json'],
    'Set-Cookie': cookie,
    'Cache-Control': 'no-store',
  });
  response.end(JSON.stringify(payload));
}

function sendAfterWrites(response, send) {
  void flush()
    .then(() => send())
    .catch((error) => {
      console.error(`[Storage] Request response withheld after persistence failure: ${error.message}`);
      if (!response.headersSent) {
        sendJson(response, 503, { error: 'Database persistence failed. Please retry.' });
      }
    });
}

function readRequestBody(request) {
  return new Promise((resolve, reject) => {
    let body = '';

    request.on('data', (chunk) => {
      body += chunk;
      if (body.length > 1_000_000) {
        reject(new Error('Request body is too large.'));
        request.destroy();
      }
    });

    request.on('end', () => {
      try {
        resolve(JSON.parse(body || '{}'));
      } catch {
        reject(new Error('Request body must be valid JSON.'));
      }
    });

    request.on('error', reject);
  });
}

const routeDependencies = {
  dataFiles,
  readData,
  writeData,
  readRequestBody,
  sendJson: (response, statusCode, payload) => sendAfterWrites(
    response,
    () => sendJson(response, statusCode, payload),
  ),
  sendAuthJson: (response, statusCode, payload, cookie) => sendAfterWrites(
    response,
    () => sendAuthJson(response, statusCode, payload, cookie),
  ),
};

async function handleApi(request, response, url) {
  const authHandled = await handleAuthRequest(
    request,
    response,
    url,
    routeDependencies,
  );
  if (authHandled) return;

  if (request.method === 'GET' && url.pathname === '/api/health') {
    let available = true;
    try {
      await checkStorage();
    } catch (error) {
      available = false;
      console.error(`[Storage] Health check failed: ${error.message}`);
    }
    const storage = getStorageStatus();
    sendJson(response, available ? 200 : 503, {
      status: available ? 'ok' : 'error',
      name: 'PLATIFUL API',
      storage: available ? storage.adapter : 'unavailable',
    });
    return;
  }

  const user = getSessionUser(request, routeDependencies);
  if (!user) {
    if (await handleExtraRequest(request, response, url, null, routeDependencies)) return;
    sendJson(response, 401, { error: 'Silakan masuk untuk melanjutkan.' });
    return;
  }

  const routeHandlers = [
    handleExtraRequest,
    handleAccountRequest,
    handleProductRequest,
    handleOrderRequest,
    handleAdminRequest,
  ];

  for (const handleRoute of routeHandlers) {
    const handled = await handleRoute(
      request,
      response,
      url,
      user,
      routeDependencies,
    );
    if (handled) return;
  }

  sendJson(response, 404, { error: 'API route was not found.' });
}

function serveStatic(request, response, url) {
  const pathname = url.pathname === '/'
    ? '/index.html'
    : decodeURIComponent(url.pathname);
  const filePath = path.resolve(FRONTEND_DIRECTORY, `.${pathname}`);

  if (!filePath.startsWith(`${FRONTEND_DIRECTORY}${path.sep}`)) {
    response.writeHead(403);
    response.end('Forbidden');
    return;
  }

  fs.readFile(filePath, (error, content) => {
    if (error) {
      response.writeHead(error.code === 'ENOENT' ? 404 : 500);
      response.end('File not found');
      return;
    }

    const extension = path.extname(filePath);
    response.writeHead(200, {
      'Content-Type': MIME_TYPES[extension] || 'application/octet-stream',
    });
    response.end(content);
  });
}

ensureDataFiles();

const server = http.createServer(async (request, response) => {
  const url = new URL(request.url, `http://${request.headers.host || 'localhost'}`);

  try {
    if (url.pathname.startsWith('/api/')) {
      await handleApi(request, response, url);
      return;
    }

    serveStatic(request, response, url);
  } catch (error) {
    if (!response.headersSent) {
      sendJson(response, 500, { error: error.message || 'Unexpected server error.' });
    }
  }
});

init()
  .then(() => {
    server.listen(PORT, () => {
      handleExtraRequest.startScheduler(routeDependencies);
      console.log(`PLATIFUL is running at http://localhost:${PORT}`);
    });
  })
  .catch((error) => {
    console.error(`\nGagal menginisialisasi database: ${error.message}`);
    console.error('Atur DATABASE_URL untuk PostgreSQL atau konfigurasi DB_* untuk MySQL.');
    process.exit(1);
  });

for (const signal of ['SIGINT', 'SIGTERM']) {
  process.on(signal, () => {
    server.close(async () => {
      try {
        await closeStorage();
      } catch (error) {
        console.error(`[Storage] Shutdown failed: ${error.message}`);
        process.exitCode = 1;
      }
    });
  });
}