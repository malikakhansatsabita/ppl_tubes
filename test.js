const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawn } = require('node:child_process');
const { once } = require('node:events');
const net = require('node:net');
const { hashPassword } = require('./auth');
const {
  canMarkNoShow,
  currentLocalDate,
  effectivePrice,
  isProductExpired,
  validateSchedule,
} = require('./product-pricing');

function runPricingTests() {
  const product = {
    price: 1000,
    minPrice: 500,
    schedule: [{ time: '10:00', price: 800 }, { time: '12:00', price: 600 }],
  };
  assert.equal(effectivePrice(product, new Date(2026, 0, 1, 9, 59)), 1000);
  assert.equal(effectivePrice(product, new Date(2026, 0, 1, 11, 0)), 800);
  assert.equal(effectivePrice(product, new Date(2026, 0, 1, 13, 0)), 600);
  assert.equal(validateSchedule(product.schedule, product.price, product.minPrice), null);
  assert.match(validateSchedule([
    { time: '10:00', price: 700 }, { time: '12:00', price: 800 },
  ], product.price, product.minPrice), /semakin turun/);
  assert.match(validateSchedule([{ time: '25:00', price: 700 }], product.price, product.minPrice), /jam valid/);
  assert.equal(isProductExpired({ expiryDate: '2026-01-01' }, new Date(2026, 0, 1, 12, 0)), false);
  assert.equal(isProductExpired({
    expiryDate: '2026-01-01', pickupEnd: '11:59',
  }, new Date(2026, 0, 1, 12, 0)), true);
  const pickupOrder = {
    status: 'Ready for pickup',
    pickupEnd: '18:00',
    createdAt: new Date(2026, 0, 1, 8, 0).toISOString(),
  };
  assert.equal(canMarkNoShow(pickupOrder, null, new Date(2026, 0, 1, 18, 0)), false);
  assert.equal(canMarkNoShow(pickupOrder, null, new Date(2026, 0, 1, 18, 1)), true);
  assert.equal(canMarkNoShow(
    { ...pickupOrder, status: 'Completed' }, null, new Date(2026, 0, 1, 19, 0),
  ), false);
}

async function reservePort() {
  const listener = net.createServer();
  listener.listen(0, '127.0.0.1');
  await once(listener, 'listening');
  const { port } = listener.address();
  await new Promise((resolve, reject) => listener.close((error) => error ? reject(error) : resolve()));
  return port;
}

async function waitForServer(baseUrl) {
  for (let attempt = 0; attempt < 80; attempt += 1) {
    try {
      const response = await fetch(`${baseUrl}/api/health`);
      if (response.ok) return;
    } catch {
      await new Promise((resolve) => setTimeout(resolve, 100));
    }
  }
  throw new Error('Server did not become ready.');
}

async function request(baseUrl, route, options = {}) {
  const { method = 'GET', body, cookie, expectedStatus = 200 } = options;
  const response = await fetch(`${baseUrl}${route}`, {
    method,
    headers: {
      ...(body ? { 'Content-Type': 'application/json' } : {}),
      ...(cookie ? { Cookie: cookie } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  const data = await response.json();
  assert.equal(response.status, expectedStatus, `${method} ${route}: ${JSON.stringify(data)}`);

  const sessionCookie = response.headers.get('set-cookie')
    ?.match(/platiful_session=[^;]+/)?.[0];
  return { data, cookie: sessionCookie || cookie };
}

async function startServer(backendDirectory, port) {
  const childProcess = spawn(global.process.execPath, ['server.js'], {
    cwd: backendDirectory,
    env: { ...global.process.env, PORT: String(port), PLATIFUL_TEST_MODE: '1' },
    stdio: 'inherit',
  });
  await waitForServer(`http://127.0.0.1:${port}`);
  return childProcess;
}

async function stopServer(server) {
  if (server.exitCode !== null) return;
  server.kill();
  await once(server, 'exit');
}

async function runWorkflowTests() {
  const temporaryRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'platiful-tests-'));
  const backendDirectory = path.join(temporaryRoot, 'Back end');
  const frontendDirectory = path.join(temporaryRoot, 'Front end');
  const port = await reservePort();
  const baseUrl = `http://127.0.0.1:${port}`;
  const expiryDate = (offsetDays) => {
    const date = new Date();
    date.setDate(date.getDate() + offsetDays);
    return currentLocalDate(date);
  };
  let server;

  try {
    fs.cpSync(path.join(__dirname), backendDirectory, { recursive: true });
    fs.cpSync(path.resolve(__dirname, '..', 'Front end'), frontendDirectory, { recursive: true });
    const usersFile = path.join(backendDirectory, 'data', 'users.json');
    fs.writeFileSync(usersFile, JSON.stringify([{
      id: 'test-admin-id', name: 'Test Admin', email: 'admin@example.test', role: 'admin',
      ...hashPassword('AdminPassword123'),
    }], null, 2));
    server = await startServer(backendDirectory, port);

    const retailer = await request(baseUrl, '/api/auth/register', { consent: true,
      method: 'POST',
      body: {
        consent: true,
        name: 'Test Retailer',
        email: 'retailer@example.test',
        password: 'RetailerPassword1',
        role: 'retailer',
        storeName: 'Test Bakery',
        storeAddress: 'Road 1',
      },
    });
    const customer = await request(baseUrl, '/api/auth/register', { consent: true,
      method: 'POST',
      body: { consent: true, name: 'Test Customer', email: 'customer@example.test', password: 'CustomerPassword1' },
    });
    const otherCustomer = await request(baseUrl, '/api/auth/register', { consent: true,
      method: 'POST',
      body: { consent: true, name: 'Other Customer', email: 'other@example.test', password: 'OtherPassword1' },
    });
    await request(baseUrl, '/api/auth/register', { consent: true,
      method: 'POST', expectedStatus: 400,
      body: { consent: true, name: 'Fake Admin', email: 'fake-admin@example.test', password: 'FakeAdminPassword1', role: 'admin' },
    });
    const admin = await request(baseUrl, '/api/auth/login', {
      method: 'POST',
      body: { email: 'admin@example.test', password: 'AdminPassword123' },
    });

    await request(baseUrl, '/api/verification', {
      method: 'POST', cookie: retailer.cookie,
      body: { proof: 'Business registration document' },
    });
    const verification = (await request(baseUrl, '/api/admin/verifications', { cookie: admin.cookie })).data
      .find((item) => item.id === retailer.data.user.id);
    assert.equal(verification.status, 'pending');
    await request(baseUrl, `/api/admin/verifications/${retailer.data.user.id}`, {
      method: 'PATCH', cookie: admin.cookie,
      body: { action: 'reject', reason: 'Submit clearer business details.' },
    });
    assert.ok((await request(baseUrl, '/api/notifications', { cookie: retailer.cookie })).data
      .some((notification) => notification.message.includes('rejected')));
    await request(baseUrl, '/api/verification', {
      method: 'POST', cookie: retailer.cookie,
      body: { proof: 'Updated business registration document' },
    });
    await request(baseUrl, `/api/admin/verifications/${retailer.data.user.id}`, {
      method: 'PATCH', cookie: admin.cookie, body: { action: 'approve' },
    });

    assert.ok((await request(baseUrl, '/api/categories')).data.length > 0);
    assert.ok((await request(baseUrl, '/api/stores')).data.length > 0);
    const newCategory = await request(baseUrl, '/api/categories', {
      method: 'POST', cookie: admin.cookie, body: { name: 'Seasonal' },
    });
    const seasonalCategory = newCategory.data.find((category) => category.name === 'Seasonal');
    await request(baseUrl, `/api/categories/${seasonalCategory.id}`, {
      method: 'PATCH', cookie: admin.cookie, body: { name: 'Seasonal foods' },
    });
    assert.ok((await request(baseUrl, '/api/categories')).data
      .some((category) => category.name === 'Seasonal foods'));
    await request(baseUrl, `/api/categories/${seasonalCategory.id}`, {
      method: 'DELETE', cookie: admin.cookie,
    });

    await request(baseUrl, '/api/products', {
      method: 'POST', cookie: retailer.cookie, expectedStatus: 400,
      body: {
        name: 'Invalid Schedule', category: 'Bakery', price: 12000, originalPrice: 20000,
        quantity: 1, expiryDate: '2026-02-31', pickupEnd: '23:59',
      },
    });
    await request(baseUrl, '/api/products', {
      method: 'POST', cookie: retailer.cookie, expectedStatus: 400,
      body: {
        name: 'Invalid Category', category: 'Unlisted', price: 12000, originalPrice: 20000,
        quantity: 1, expiryDate: expiryDate(1), pickupEnd: '23:59',
      },
    });
    await request(baseUrl, '/api/products', {
      method: 'POST', cookie: retailer.cookie, expectedStatus: 400,
      body: {
        name: 'Expired listing', category: 'Bakery', price: 12000, originalPrice: 20000,
        quantity: 1, expiryDate: expiryDate(-1),
        pickupEnd: '23:59',
      },
    });
    await request(baseUrl, '/api/products', {
      method: 'POST', cookie: retailer.cookie, expectedStatus: 400,
      body: {
        name: 'Invalid Discount', category: 'Bakery', price: 12000, originalPrice: 20000,
        quantity: 1, expiryDate: expiryDate(1), pickupEnd: '23:59',
        minPrice: 5000,
        schedule: [{ time: '10:00', price: 7000 }, { time: '12:00', price: 8000 }],
      },
    });

    const product = await request(baseUrl, '/api/products', {
      method: 'POST',
      cookie: retailer.cookie,
      expectedStatus: 201,
      body: {
        name: 'Bread Box', category: 'Bakery', price: 12000, originalPrice: 20000, quantity: 4,
        expiryDate: expiryDate(1),
        pickupStart: '09:00', pickupEnd: '23:59', halal: true,
        minPrice: 8000, schedule: [{ time: '00:00', price: 10000 }],
      },
    });
    const expiredToday = await request(baseUrl, '/api/products', {
      method: 'POST', cookie: retailer.cookie, expectedStatus: 201,
      body: {
        name: 'Expired today', category: 'Bakery', price: 5000, originalPrice: 7000,
        quantity: 1, expiryDate: expiryDate(0), pickupEnd: '00:01',
      },
    });
    assert.ok(!(await request(baseUrl, '/api/products', { cookie: customer.cookie })).data
      .some((item) => item.id === expiredToday.data.id));
    await request(baseUrl, '/api/orders', {
      method: 'POST', cookie: customer.cookie, expectedStatus: 409,
      body: { productId: expiredToday.data.id },
    });
    await request(baseUrl, '/api/templates', {
      method: 'POST', cookie: retailer.cookie, expectedStatus: 400,
      body: { name: 'Broken template' },
    });
    const template = await request(baseUrl, '/api/templates', {
      method: 'POST', cookie: retailer.cookie, expectedStatus: 201,
      body: {
        name: 'Bread template', category: 'Bakery', price: 12000,
        originalPrice: 20000, quantity: 3, minPrice: 0, pickupStart: '09:00',
        pickupEnd: '23:59', halal: true, schedule: [],
      },
    });
    assert.equal((await request(baseUrl, '/api/templates', { cookie: retailer.cookie })).data.length, 1);
    const bakeryCategory = (await request(baseUrl, '/api/categories')).data
      .find((category) => category.name === 'Bakery');
    await request(baseUrl, `/api/categories/${bakeryCategory.id}`, {
      method: 'DELETE', cookie: admin.cookie, expectedStatus: 409,
    });
    await request(baseUrl, '/api/filters', {
      method: 'PUT', cookie: customer.cookie, body: { category: 'Bakery' },
    });
    await request(baseUrl, `/api/categories/${bakeryCategory.id}`, {
      method: 'PATCH', cookie: admin.cookie, body: { name: 'Fresh bread' },
    });
    assert.equal((await request(baseUrl, '/api/products', { cookie: retailer.cookie })).data
      .find((item) => item.id === product.data.id).category, 'Fresh bread');
    assert.equal((await request(baseUrl, '/api/templates', { cookie: retailer.cookie })).data[0].category, 'Fresh bread');
    assert.equal((await request(baseUrl, '/api/filters', { cookie: customer.cookie })).data.category, 'Fresh bread');
    await request(baseUrl, `/api/categories/${bakeryCategory.id}`, {
      method: 'PATCH', cookie: admin.cookie, body: { name: 'Bakery' },
    });
    await request(baseUrl, '/api/templates', { cookie: customer.cookie, expectedStatus: 404 });
    await request(baseUrl, '/api/templates/template-id', {
      method: 'DELETE', cookie: customer.cookie, expectedStatus: 403,
    });
    await request(baseUrl, `/api/templates/${template.data.id}`, {
      method: 'DELETE', cookie: retailer.cookie,
    });
    await request(baseUrl, `/api/admin/verifications/${retailer.data.user.id}`, {
      method: 'PATCH', cookie: admin.cookie,
      body: { action: 'revoke', reason: 'Business registration expired.' },
    });
    await request(baseUrl, `/api/products/${product.data.id}`, {
      method: 'PATCH', cookie: retailer.cookie, expectedStatus: 403,
      body: { quantity: 4 },
    });
    await request(baseUrl, `/api/admin/verifications/${retailer.data.user.id}`, {
      method: 'PATCH', cookie: admin.cookie, body: { action: 'approve' },
    });
    await request(baseUrl, `/api/products/${product.data.id}`, {
      method: 'PATCH', cookie: retailer.cookie, body: { quantity: 4 },
    });
    await request(baseUrl, '/api/store', {
      method: 'PUT',
      cookie: retailer.cookie,
      body: {
        name: 'Test Bakery', address: 'Road 1', phone: '0812', description: 'Fresh bread',
        latitude: -6.2, longitude: 106.8, openTime: '08:00', closeTime: '18:00',
      },
    });
    await request(baseUrl, '/api/store', {
      method: 'PUT', cookie: retailer.cookie, expectedStatus: 400,
      body: { name: 'Bad hours', address: 'Road 1', openTime: '18:00', closeTime: '08:00' },
    });
    const stores = await request(baseUrl, '/api/stores', { cookie: customer.cookie });
    assert.equal(stores.data[0].latitude, -6.2);
    assert.equal(stores.data[0].openTime, '08:00');
    assert.equal(stores.data[0].closeTime, '18:00');
    await request(baseUrl, '/api/store', {
      method: 'PUT', cookie: retailer.cookie, expectedStatus: 400,
      body: { name: 'Test Bakery', address: 'Road 1', latitude: 120, longitude: 200 },
    });
    await request(baseUrl, `/api/favorites/${retailer.data.user.id}`, {
      method: 'PUT', cookie: customer.cookie,
    });
    assert.equal((await request(baseUrl, '/api/favorites', { cookie: customer.cookie })).data[0].id, retailer.data.user.id);
    assert.equal((await request(baseUrl, '/api/favorites', { cookie: customer.cookie })).data[0].openTime, '08:00');
    await request(baseUrl, '/api/admin/summary', { cookie: customer.cookie, expectedStatus: 403 });
    const adminSummary = await request(baseUrl, '/api/admin/summary', { cookie: admin.cookie });
    assert.equal(adminSummary.data.retailerCount, 1);
    await request(baseUrl, `/api/favorites/${retailer.data.user.id}`, {
      method: 'DELETE', cookie: customer.cookie,
    });
    assert.equal((await request(baseUrl, '/api/favorites', { cookie: customer.cookie })).data.length, 0);
    await request(baseUrl, `/api/favorites/${retailer.data.user.id}`, {
      method: 'PUT', cookie: customer.cookie,
    });
    const report = await request(baseUrl, '/api/reports', {
      method: 'POST', cookie: customer.cookie, expectedStatus: 201,
      body: { productId: product.data.id, reason: 'Incorrect information', details: 'Please verify the description.' },
    });
    assert.equal((await request(baseUrl, '/api/reports', { cookie: customer.cookie })).data[0].id, report.data.id);
    assert.equal((await request(baseUrl, '/api/reports', { cookie: retailer.cookie })).data[0].id, report.data.id);
    await request(baseUrl, `/api/reports/${report.data.id}`, {
      method: 'PATCH', cookie: customer.cookie,
      body: { reason: 'Food safety', details: 'Updated report details.' },
    });
    const reportToDelete = await request(baseUrl, '/api/reports', {
      method: 'POST', cookie: customer.cookie, expectedStatus: 201,
      body: { productId: product.data.id, reason: 'Other', details: 'Duplicate report test.' },
    });
    await request(baseUrl, `/api/reports/${reportToDelete.data.id}`, {
      method: 'DELETE', cookie: customer.cookie,
    });
    await request(baseUrl, `/api/admin/reports/${report.data.id}`, {
      method: 'PATCH', cookie: admin.cookie,
      body: { status: 'Resolved' },
    });
    assert.ok((await request(baseUrl, '/api/notifications', { cookie: customer.cookie })).data
      .some((notification) => notification.message.includes('Resolved')));
    assert.ok((await request(baseUrl, '/api/notifications', { cookie: retailer.cookie })).data
      .some((notification) => notification.message.includes('Resolved')));
    await request(baseUrl, '/api/admin/announcements', {
      method: 'POST', cookie: admin.cookie, expectedStatus: 400,
      body: { title: 'Missing announcement body' },
    });
    const announcement = await request(baseUrl, '/api/admin/announcements', {
      method: 'POST', cookie: admin.cookie, expectedStatus: 201,
      body: { title: 'Store update', body: 'A new platform announcement.' },
    });
    await request(baseUrl, `/api/admin/announcements/${announcement.data.id}`, {
      method: 'PATCH', cookie: admin.cookie,
      body: { title: 'Updated store update', body: 'The announcement was edited.' },
    });
    assert.equal((await request(baseUrl, '/api/announcements', { cookie: customer.cookie })).data[0].title, 'Updated store update');

    await request(baseUrl, '/api/admin/articles', {
      method: 'POST', cookie: admin.cookie, expectedStatus: 400,
      body: { title: 'Invalid status', content: 'This is enough article content.', status: 'Other' },
    });
    await request(baseUrl, '/api/admin/articles', {
      method: 'POST', cookie: admin.cookie, expectedStatus: 201,
      body: { title: 'Food rescue guide', content: 'A practical guide to saving surplus food.', status: 'Published' },
    });
    assert.equal((await request(baseUrl, '/api/articles', { cookie: customer.cookie })).data.length, 1);
    const draft = await request(baseUrl, '/api/admin/articles', {
      method: 'POST', cookie: admin.cookie, expectedStatus: 201,
      body: { title: 'Draft guide', content: 'This content is not published yet.', status: 'Draft' },
    });
    assert.equal((await request(baseUrl, '/api/articles')).data.length, 1);
    await request(baseUrl, `/api/admin/articles/${draft.data.id}`, {
      method: 'PATCH', cookie: admin.cookie, body: { status: 'Published' },
    });
    assert.equal((await request(baseUrl, '/api/articles')).data.length, 2);
    await request(baseUrl, '/api/admin/commission', {
      method: 'PUT', cookie: admin.cookie, body: { rate: 7.5 },
    });
    assert.equal((await request(baseUrl, '/api/admin/commission', { cookie: admin.cookie })).data.rate, 7.5);
    const exportResponse = await fetch(`${baseUrl}/api/admin/export.csv`, {
      headers: { Cookie: admin.cookie },
    });
    assert.equal(exportResponse.status, 200);
    assert.match(exportResponse.headers.get('content-type'), /text\/csv/);
    assert.match(await exportResponse.text(), /penjualan_kotor/);
    await request(baseUrl, '/api/admin/settlements', {
      method: 'POST', cookie: admin.cookie, expectedStatus: 201,
      body: { retailerId: retailer.data.user.id, amount: 120000, reference: 'TX-001' },
    });

    await request(baseUrl, '/api/account', {
      method: 'PUT', cookie: customer.cookie,
      body: { name: 'Updated Customer', phone: '0813' },
    });
    await request(baseUrl, '/api/account/password', {
      method: 'PUT', cookie: customer.cookie,
      body: { currentPassword: 'CustomerPassword1', newPassword: 'ChangedPassword1' },
    });
    await request(baseUrl, '/api/account/password', {
      method: 'PUT', cookie: customer.cookie, expectedStatus: 400,
      body: { currentPassword: 'wrong-password', newPassword: 'AnotherPassword1' },
    });

    const catalog = await request(baseUrl, '/api/products', { cookie: customer.cookie });
    assert.equal(catalog.data[0].id, product.data.id);
    assert.equal(catalog.data[0].price, 10000);
    assert.equal(catalog.data[0].storeOpenTime, '08:00');
    const guestCatalog = await request(baseUrl, '/api/products');
    assert.equal(guestCatalog.data[0].id, product.data.id);
    assert.equal(guestCatalog.data[0].storeCloseTime, '18:00');
    await request(baseUrl, '/api/products?radius=5', { expectedStatus: 400 });
    await request(baseUrl, '/api/filters', {
      method: 'PUT', cookie: customer.cookie, body: { search: 'Bread', maxPrice: '15000' },
    });
    assert.equal((await request(baseUrl, '/api/filters', { cookie: customer.cookie })).data.search, 'Bread');
    await request(baseUrl, '/api/filters', {
      method: 'PUT', cookie: customer.cookie, expectedStatus: 400,
      body: { radius: '-1' },
    });

    const order = await request(baseUrl, '/api/orders', {
      method: 'POST',
      cookie: customer.cookie,
      expectedStatus: 201,
      body: { productId: product.data.id, quantity: 2 },
    });
    await request(baseUrl, '/api/orders', {
      method: 'POST', cookie: customer.cookie, expectedStatus: 400,
      body: { productId: product.data.id, quantity: 0 },
    });
    assert.match(order.data.pickupCode, /^\d{6}$/);
    assert.equal(order.data.total, 20000);
    assert.equal(order.data.originalPrice, 20000);
    assert.equal(order.data.paymentMethod, 'Cash on pickup');
    assert.equal(order.data.paymentStatus, 'Pay at pickup');
    assert.equal((await request(baseUrl, '/api/orders', { cookie: otherCustomer.cookie })).data.length, 0);
    assert.ok((await request(baseUrl, '/api/notifications', { cookie: retailer.cookie })).data
      .some((notification) => notification.message.includes('Pesanan baru')));

    await request(baseUrl, `/api/orders/${order.data.id}`, {
      method: 'PATCH', cookie: customer.cookie, expectedStatus: 403,
      body: { status: 'Completed' },
    });
    await request(baseUrl, `/api/orders/${order.data.id}`, {
      method: 'PATCH', cookie: retailer.cookie, expectedStatus: 403,
      body: { status: 'Completed', pickupCode: '000000' },
    });
    await request(baseUrl, `/api/orders/${order.data.id}`, {
      method: 'PATCH', cookie: retailer.cookie,
      body: { status: 'Ready for pickup' },
    });
    await request(baseUrl, `/api/orders/${order.data.id}/no-show`, {
      method: 'POST', cookie: retailer.cookie, expectedStatus: 409,
    });
    assert.ok((await request(baseUrl, '/api/notifications', { cookie: customer.cookie })).data
      .some((notification) => notification.message.includes('siap diambil')));
    await request(baseUrl, `/api/orders/${order.data.id}`, {
      method: 'PATCH', cookie: retailer.cookie,
      body: { status: 'Completed', pickupCode: order.data.pickupCode },
    });
    const customerDashboard = await request(baseUrl, '/api/dashboard', { cookie: customer.cookie });
    assert.equal(customerDashboard.data.grossSales, 20000);
    assert.equal(customerDashboard.data.estimatedSaved, 20000);
    assert.ok((await request(baseUrl, '/api/notifications', { cookie: customer.cookie })).data
      .some((notification) => notification.message.includes('selesai diambil')));

    const review = await request(baseUrl, '/api/reviews', {
      method: 'POST', cookie: customer.cookie, expectedStatus: 201,
      body: { orderId: order.data.id, rating: 5, comment: 'Great pickup.' },
    });
    await request(baseUrl, `/api/reviews/${review.data.id}`, {
      method: 'PATCH', cookie: customer.cookie,
      body: { rating: 4, comment: 'Updated review.' },
    });
    assert.equal((await request(baseUrl, '/api/reviews?mine=1', { cookie: customer.cookie })).data[0].rating, 4);
    assert.equal((await request(baseUrl, '/api/reviews?mine=1', { cookie: otherCustomer.cookie })).data.length, 0);
    assert.equal((await request(baseUrl, `/api/reviews?storeId=${retailer.data.user.id}`)).data[0].comment, 'Updated review.');
    assert.equal((await request(baseUrl, '/api/products', { cookie: customer.cookie })).data[0].reviews[0].rating, 4);
    await request(baseUrl, `/api/reviews/${review.data.id}`, {
      method: 'DELETE', cookie: customer.cookie,
    });

    const currentPeriod = new Date().toISOString().slice(0, 7);
    const monthlyReport = await request(baseUrl, '/api/retailer/reports', {
      method: 'POST', cookie: retailer.cookie, expectedStatus: 201,
      body: { period: currentPeriod },
    });
    assert.equal(monthlyReport.data.orders, 1);
    assert.equal(monthlyReport.data.completed, 1);
    assert.equal(monthlyReport.data.packsSaved, 2);
    await request(baseUrl, '/api/retailer/reports', {
      method: 'POST', cookie: retailer.cookie, expectedStatus: 400,
      body: { period: '2026-13' },
    });

    const secondOrder = await request(baseUrl, '/api/orders', {
      method: 'POST', cookie: customer.cookie, expectedStatus: 201,
      body: { productId: product.data.id, quantity: 1 },
    });
    assert.equal((await request(baseUrl, '/api/products', { cookie: retailer.cookie })).data
      .find((item) => item.id === product.data.id).price, 10000);
    await request(baseUrl, `/api/orders/${secondOrder.data.id}`, {
      method: 'PATCH', cookie: retailer.cookie,
      body: { status: 'Ready for pickup' },
    });
    await request(baseUrl, `/api/orders/${secondOrder.data.id}`, {
      method: 'PATCH', cookie: customer.cookie,
      body: { status: 'Cancelled' },
    });
    const inventory = await request(baseUrl, '/api/products', { cookie: retailer.cookie });
    assert.equal(inventory.data.find((item) => item.id === product.data.id).quantity, 2);

    await request(baseUrl, '/api/store', {
      method: 'PUT', cookie: retailer.cookie,
      body: { name: 'Updated Bakery', address: 'Road 2', phone: '0812', description: 'Fresh bread' },
    });

    const ordersFile = path.join(backendDirectory, 'data', 'orders.json');
    const persistedOrders = JSON.parse(fs.readFileSync(ordersFile, 'utf8'));
    const missedPickup = {
      id: 'expired-pickup-test',
      productId: product.data.id,
      productName: product.data.name,
      store: 'Updated Bakery',
      storeId: retailer.data.user.id,
      customerId: customer.data.user.id,
      customerName: 'Updated Customer',
      quantity: 1,
      total: 12000,
      pickupEnd: '00:00',
      status: 'Ready for pickup',
      createdAt: '2000-01-01T12:00:00.000Z',
    };
    const repeatedNoShows = Array.from({ length: 3 }, (_, index) => ({
      ...missedPickup,
      id: `repeat-no-show-${index + 1}`,
      customerId: otherCustomer.data.user.id,
      customerName: 'Other Customer',
    }));
    persistedOrders.unshift(missedPickup, ...repeatedNoShows);
    fs.writeFileSync(ordersFile, JSON.stringify(persistedOrders, null, 2));
    await stopServer(server);
    server = await startServer(backendDirectory, port);
    await request(baseUrl, `/api/orders/${missedPickup.id}/no-show`, {
      method: 'POST', cookie: retailer.cookie,
    });
    const postNoShowInventory = await request(baseUrl, '/api/products', { cookie: retailer.cookie });
    assert.equal(postNoShowInventory.data.find((item) => item.id === product.data.id).quantity, 3);
    assert.ok((await request(baseUrl, '/api/notifications', { cookie: customer.cookie })).data
      .some((notification) => notification.message.includes('tidak diambil')));
    for (const noShow of repeatedNoShows) {
      await request(baseUrl, `/api/orders/${noShow.id}/no-show`, {
        method: 'POST', cookie: retailer.cookie,
      });
    }
    await request(baseUrl, '/api/auth/me', {
      cookie: otherCustomer.cookie, expectedStatus: 401,
    });
    const finalNoShowInventory = await request(baseUrl, '/api/products', { cookie: retailer.cookie });
    assert.equal(finalNoShowInventory.data.find((item) => item.id === product.data.id).quantity, 6);

    await stopServer(server);
    server = await startServer(backendDirectory, port);
    const session = await request(baseUrl, '/api/auth/me', { cookie: customer.cookie });
    assert.equal(session.data.user.email, 'customer@example.test');
    await request(baseUrl, '/api/auth/login', {
      method: 'POST', expectedStatus: 200,
      body: { email: 'customer@example.test', password: 'ChangedPassword1' },
    });

    const html = await (await fetch(baseUrl)).text();
    const scripts = [...html.matchAll(/<script src="([^"]+)"/g)].map((match) => match[1]);
    assert.deepEqual(scripts, [
      'https://unpkg.com/leaflet@1.9.4/dist/leaflet.js',
      'script.js?v=2',
      'api-client.js?v=3',
      'auth.js',
      'workflows.js',
      'extras.js?v=1',
    ]);

    await request(baseUrl, '/api/auth/logout', { method: 'POST', cookie: customer.cookie });
    await request(baseUrl, '/api/auth/me', { cookie: customer.cookie, expectedStatus: 401 });
    await request(baseUrl, `/api/admin/users/${otherCustomer.data.user.id}`, {
      method: 'PATCH', cookie: admin.cookie, body: { suspended: true },
    });
    await request(baseUrl, '/api/auth/me', { cookie: otherCustomer.cookie, expectedStatus: 401 });
    await request(baseUrl, '/api/auth/login', {
      method: 'POST', expectedStatus: 401,
      body: { email: 'other@example.test', password: 'OtherPassword1' },
    });
    await request(baseUrl, `/api/admin/users/${otherCustomer.data.user.id}`, {
      method: 'DELETE', cookie: admin.cookie,
    });
    await request(baseUrl, '/api/auth/me', { cookie: otherCustomer.cookie, expectedStatus: 401 });
    console.log('Customer, retailer, guest, notification, report, review, and admin workflow tests passed.');
  } finally {
    if (server) await stopServer(server);
    fs.rmSync(temporaryRoot, { recursive: true, force: true });
  }
}

runPricingTests();
runWorkflowTests().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});