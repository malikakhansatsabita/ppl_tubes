const { randomUUID } = require('node:crypto');

async function handleAdminRequest(request, response, url, user, dependencies) {
  const { readData, writeData, dataFiles, readRequestBody, sendJson } = dependencies;
  if (!url.pathname.startsWith('/api/admin/')) return false;
  if (user.role !== 'admin') {
    sendJson(response, 403, { error: 'Fitur ini khusus staff admin.' });
    return true;
  }

  if (request.method === 'GET' && url.pathname === '/api/admin/summary') {
    const users = readData(dataFiles.users);
    const reports = readData(dataFiles.reports);
    const orders = readData(dataFiles.orders);
    sendJson(response, 200, {
      userCount: users.length,
      customerCount: users.filter((account) => account.role === 'customer').length,
      retailerCount: users.filter((account) => account.role === 'retailer').length,
      openReports: reports.filter((report) => report.status === 'Open').length,
      orderCount: orders.length,
      grossSales: orders.filter((order) => order.status === 'Completed')
        .reduce((total, order) => total + order.total, 0),
    });
    return true;
  }

  if (request.method === 'GET' && url.pathname === '/api/admin/users') {
    const users = readData(dataFiles.users).map(({ id, name, email, role, suspended, store }) => ({
      id, name, email, role, suspended: Boolean(suspended), storeName: store?.name || '',
    }));
    sendJson(response, 200, users);
    return true;
  }

  const userMatch = url.pathname.match(/^\/api\/admin\/users\/([^/]+)$/);
  if (userMatch && request.method === 'PATCH') {
    const users = readData(dataFiles.users);
    const account = users.find((item) => item.id === userMatch[1]);
    if (!account || account.role === 'admin' || account.id === user.id) {
      sendJson(response, 404, { error: 'Akun tidak ditemukan atau tidak dapat diubah.' });
      return true;
    }
    const body = await readRequestBody(request);
    if (typeof body.suspended !== 'boolean') {
      sendJson(response, 400, { error: 'Status suspend harus berupa boolean.' });
      return true;
    }
    account.suspended = body.suspended;
    writeData(dataFiles.users, users);
    sendJson(response, 200, { id: account.id, suspended: account.suspended });
    return true;
  }

  if (request.method === 'GET' && url.pathname === '/api/admin/reports') {
    sendJson(response, 200, readData(dataFiles.reports));
    return true;
  }

  const reportMatch = url.pathname.match(/^\/api\/admin\/reports\/([^/]+)$/);
  if (reportMatch && request.method === 'PATCH') {
    const body = await readRequestBody(request);
    if (!['Open', 'Resolved', 'Dismissed'].includes(body.status)) {
      sendJson(response, 400, { error: 'Status laporan tidak valid.' });
      return true;
    }
    const reports = readData(dataFiles.reports);
    const report = reports.find((item) => item.id === reportMatch[1]);
    if (!report) {
      sendJson(response, 404, { error: 'Laporan tidak ditemukan.' });
      return true;
    }
    const statusChanged = report.status !== body.status;
    report.status = body.status;
    report.reviewedAt = new Date().toISOString();
    report.reviewedBy = user.id;
    writeData(dataFiles.reports, reports);
    if (statusChanged) {
      const recipients = [...new Set([report.reporterId, report.storeId].filter(Boolean))];
      if (recipients.length) {
        const notifications = readData(dataFiles.notifications);
        recipients.forEach((userId) => notifications.unshift({
          id: randomUUID(),
          userId,
          message: `Status laporan ${report.productName} diperbarui menjadi ${report.status}.`,
          read: false,
          createdAt: new Date().toISOString(),
        }));
        writeData(dataFiles.notifications, notifications);
      }
    }
    sendJson(response, 200, report);
    return true;
  }

  if (request.method === 'GET' && url.pathname === '/api/admin/articles') {
    sendJson(response, 200, readData(dataFiles.articles));
    return true;
  }

  if (request.method === 'POST' && url.pathname === '/api/admin/articles') {
    const body = await readRequestBody(request);
    const title = String(body.title || '').trim();
    const content = String(body.content || '').trim();
    const status = body.status;
    if (title.length < 3 || content.length < 10 || !['Draft', 'Published'].includes(status)) {
      sendJson(response, 400, { error: 'Judul minimal 3 karakter, konten minimal 10 karakter, dan status harus Draft atau Published.' });
      return true;
    }
    const article = {
      id: randomUUID(), title, content, status,
      createdAt: new Date().toISOString(), authorId: user.id,
    };
    const articles = readData(dataFiles.articles);
    articles.unshift(article);
    writeData(dataFiles.articles, articles);
    sendJson(response, 201, article);
    return true;
  }

  const articleMatch = url.pathname.match(/^\/api\/admin\/articles\/([^/]+)$/);
  if (articleMatch && request.method === 'PATCH') {
    const body = await readRequestBody(request);
    const articles = readData(dataFiles.articles);
    const article = articles.find((item) => item.id === articleMatch[1]);
    if (!article) {
      sendJson(response, 404, { error: 'Artikel tidak ditemukan.' });
      return true;
    }
    const title = String(body.title ?? article.title).trim();
    const content = String(body.content ?? article.content).trim();
    const status = body.status ?? article.status;
    if (title.length < 3 || content.length < 10 || !['Draft', 'Published'].includes(status)) {
      sendJson(response, 400, { error: 'Judul, konten, atau status artikel tidak valid.' });
      return true;
    }
    Object.assign(article, { title, content, status, updatedAt: new Date().toISOString() });
    writeData(dataFiles.articles, articles);
    sendJson(response, 200, article);
    return true;
  }

  if (request.method === 'GET' && url.pathname === '/api/admin/commission') {
    const settings = readData(dataFiles.commission);
    sendJson(response, 200, settings[0] || { rate: 5 });
    return true;
  }

  if (request.method === 'PUT' && url.pathname === '/api/admin/commission') {
    const body = await readRequestBody(request);
    const rate = Number(body.rate);
    if (!Number.isFinite(rate) || rate < 0 || rate > 100) {
      sendJson(response, 400, { error: 'Komisi harus berada pada rentang 0 sampai 100 persen.' });
      return true;
    }
    const settings = [{ rate, updatedAt: new Date().toISOString(), updatedBy: user.id }];
    writeData(dataFiles.commission, settings);
    sendJson(response, 200, settings[0]);
    return true;
  }

  if (request.method === 'GET' && url.pathname === '/api/admin/settlements') {
    sendJson(response, 200, readData(dataFiles.settlements));
    return true;
  }

  if (request.method === 'POST' && url.pathname === '/api/admin/settlements') {
    const body = await readRequestBody(request);
    const retailerId = String(body.retailerId || '');
    const amount = Number(body.amount);
    const reference = String(body.reference || '').trim();
    const retailer = readData(dataFiles.users)
      .find((account) => account.id === retailerId && account.role === 'retailer');
    if (!retailer || !Number.isFinite(amount) || amount < 1 || !reference) {
      sendJson(response, 400, { error: 'Pilih retailer dan isi jumlah serta nomor referensi settlement.' });
      return true;
    }
    const settlement = {
      id: randomUUID(), retailerId, retailerName: retailer.store?.name || retailer.name,
      amount, reference, createdAt: new Date().toISOString(), createdBy: user.id,
    };
    const settlements = readData(dataFiles.settlements);
    settlements.unshift(settlement);
    writeData(dataFiles.settlements, settlements);
    sendJson(response, 201, settlement);
    return true;
  }

  sendJson(response, 404, { error: 'Admin API route was not found.' });
  return true;
}

module.exports = handleAdminRequest;
