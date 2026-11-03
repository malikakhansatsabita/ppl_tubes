const { randomUUID } = require('node:crypto');

async function handleProductRequest(request, response, url, user, dependencies) {
  const { readData, writeData, dataFiles, readRequestBody, sendJson } = dependencies;

  if (request.method === 'GET' && url.pathname === '/api/reports') {
    const reports = readData(dataFiles.reports);
    const visibleReports = user.role === 'retailer'
      ? reports.filter((report) => report.storeId === user.id)
      : reports.filter((report) => report.reporterId === user.id);
    sendJson(response, 200, visibleReports);
    return true;
  }

  if (request.method === 'GET' && url.pathname === '/api/products') {
    const products = readData(dataFiles.products);
    const category = url.searchParams.get('category');
    const search = (url.searchParams.get('search') || '').toLowerCase();
    const visibleProducts = products.filter((product) => {
      if (!product.storeId) return false;
      if (user.role === 'retailer' ? product.storeId !== user.id : product.quantity < 1) return false;
      const matchesCategory = !category || product.category === category;
      const matchesSearch = `${product.name} ${product.store}`.toLowerCase().includes(search);
      return matchesCategory && matchesSearch;
    });

    sendJson(response, 200, visibleProducts);
    return true;
  }

  if (request.method === 'POST' && url.pathname === '/api/reports') {
    const body = await readRequestBody(request);
    const product = readData(dataFiles.products)
      .find((item) => item.id === body.productId && item.quantity > 0);
    const reason = String(body.reason || '').trim();
    const details = String(body.details || '').trim();
    if (!product || !['Food safety', 'Incorrect information', 'Other'].includes(reason)) {
      sendJson(response, 400, { error: 'Pilih produk aktif dan alasan laporan yang valid.' });
      return true;
    }

    const reports = readData(dataFiles.reports);
    const report = {
      id: randomUUID(),
      productId: product.id,
      productName: product.name,
      storeId: product.storeId,
      reporterId: user.id,
      reason,
      details,
      status: 'Open',
      createdAt: new Date().toISOString(),
    };
    reports.unshift(report);
    writeData(dataFiles.reports, reports);
    sendJson(response, 201, report);
    return true;
  }

  if (request.method === 'POST' && url.pathname === '/api/products') {
    if (user.role !== 'retailer' || !user.store) {
      sendJson(response, 403, { error: 'Hanya retailer yang sudah mengatur gerainya dapat menambahkan produk.' });
      return true;
    }

    const body = await readRequestBody(request);
    const productInput = validateProduct(body);
    if (productInput.error) {
      sendJson(response, 400, { error: productInput.error });
      return true;
    }

    const product = {
      id: randomUUID(),
      ...productInput.value,
      store: user.store.name,
      storeId: user.id,
    };
    const products = readData(dataFiles.products);
    products.unshift(product);
    writeData(dataFiles.products, products);
    sendJson(response, 201, product);
    return true;
  }

  const productMatch = url.pathname.match(/^\/api\/products\/([^/]+)$/);
  if (productMatch && request.method === 'PATCH') {
    if (user.role !== 'retailer') {
      sendJson(response, 403, { error: 'Fitur ini khusus retailer.' });
      return true;
    }

    const products = readData(dataFiles.products);
    const product = products.find((item) => item.id === productMatch[1]);
    if (!product || product.storeId !== user.id) {
      sendJson(response, 404, { error: 'Produk tidak ditemukan.' });
      return true;
    }

    const body = await readRequestBody(request);
    const productInput = validateProduct({ ...product, ...body }, true);
    if (productInput.error) {
      sendJson(response, 400, { error: productInput.error });
      return true;
    }

    Object.assign(product, productInput.value);
    writeData(dataFiles.products, products);
    sendJson(response, 200, product);
    return true;
  }

  return false;
}

function validateProduct(input, allowZeroStock = false) {
  const value = {
    name: String(input.name || '').trim(),
    category: String(input.category || '').trim(),
    price: Number(input.price),
    originalPrice: Number(input.originalPrice),
    quantity: Number(input.quantity),
  };
  const minimumStock = allowZeroStock ? 0 : 1;
  const valid = value.name
    && value.category
    && Number.isFinite(value.price)
    && value.price >= 1
    && Number.isFinite(value.originalPrice)
    && value.originalPrice >= value.price
    && Number.isInteger(value.quantity)
    && value.quantity >= minimumStock;

  return valid
    ? { value }
    : { error: 'Periksa nama, kategori, harga, harga normal, dan stok produk.' };
}

module.exports = handleProductRequest;
