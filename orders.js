const { randomBytes, randomUUID } = require('node:crypto');
const { effectivePrice, isProductExpired } = require('../product-pricing');

async function handleOrderRequest(request, response, url, user, dependencies) {
  const { readData, writeData, dataFiles, readRequestBody, sendJson } = dependencies;
  const orderMatch = url.pathname.match(/^\/api\/orders\/([^/]+)$/);

  if (request.method === 'GET' && url.pathname === '/api/orders') {
    const orders = readData(dataFiles.orders);
    const visibleOrders = user.role === 'retailer'
      ? orders.filter((order) => order.storeId === user.id)
      : orders.filter((order) => order.customerId === user.id);
    sendJson(response, 200, visibleOrders);
    return true;
  }

  if (request.method === 'POST' && url.pathname === '/api/orders') {
    if (user.role !== 'customer') {
      sendJson(response, 403, { error: 'Pemesanan hanya tersedia untuk akun customer.' });
      return true;
    }

    const body = await readRequestBody(request);
    const quantity = Number(body.quantity ?? 1);
    if (!body.productId || !Number.isInteger(quantity) || quantity < 1) {
      sendJson(response, 400, { error: 'Pilih produk dan jumlah pack yang valid.' });
      return true;
    }

    const products = readData(dataFiles.products);
    const product = products.find((item) => item.id === body.productId);
    if (!product) {
      sendJson(response, 404, { error: 'Produk tidak ditemukan.' });
      return true;
    }
    if (!product.price || !product.storeId || product.status === 'Expired' || isProductExpired(product)) {
      sendJson(response, 409, { error: 'Produk ini belum tersedia untuk dipesan.' });
      return true;
    }
    if (product.quantity < quantity) {
      sendJson(response, 409, { error: 'Stok produk tidak mencukupi.' });
      return true;
    }

    const checkoutPrice = effectivePrice(product);
    product.quantity -= quantity;
    const order = {
      id: randomUUID(),
      productId: product.id,
      productName: product.name,
      store: product.store,
      storeId: product.storeId,
      customerId: user.id,
      customerName: user.name,
      quantity,
      total: checkoutPrice * quantity,
      originalPrice: Number(product.originalPrice),
      pickupStart: product.pickupStart || '',
      pickupEnd: product.pickupEnd || '',
      paymentMethod: 'Cash on pickup',
      paymentStatus: 'Pay at pickup',
      status: 'Awaiting pickup',
      pickupCode: createPickupCode(),
      createdAt: new Date().toISOString(),
    };

    const orders = readData(dataFiles.orders);
    orders.unshift(order);
    writeData(dataFiles.products, products);
    writeData(dataFiles.orders, orders);
    notifyOrderParty(dependencies, order.storeId, `Pesanan baru untuk ${order.productName} dari ${order.customerName}.`);
    sendJson(response, 201, order);
    return true;
  }

  if (orderMatch && request.method === 'PATCH') {
    await updateOrderStatus(request, response, orderMatch[1], user, dependencies);
    return true;
  }

  return false;
}

async function updateOrderStatus(request, response, orderId, user, dependencies) {
  const { readData, writeData, dataFiles, readRequestBody, sendJson } = dependencies;
  const body = await readRequestBody(request);
  const orders = readData(dataFiles.orders);
  const order = orders.find((item) => item.id === orderId);
  const ownsOrder = user.role === 'retailer'
    ? order?.storeId === user.id
    : order?.customerId === user.id;

  if (!order || !ownsOrder) {
    sendJson(response, 404, { error: 'Pesanan tidak ditemukan.' });
    return;
  }
  if (!['Awaiting pickup', 'Ready for pickup'].includes(order.status)) {
    sendJson(response, 409, { error: 'Pesanan yang sudah selesai tidak dapat diubah.' });
    return;
  }

  if (user.role === 'retailer') {
    if (body.status === 'Ready for pickup') {
      if (order.status !== 'Ready for pickup') {
        order.status = 'Ready for pickup';
        writeData(dataFiles.orders, orders);
        notifyOrderParty(dependencies, order.customerId, `Pesanan ${order.productName} siap diambil.`);
      }
      sendJson(response, 200, order);
      return;
    }
    const validPickup = body.status === 'Completed'
      && String(body.pickupCode || '') === order.pickupCode;
    if (!validPickup) {
      sendJson(response, 403, { error: 'Kode pickup tidak sesuai atau aksi tidak diizinkan.' });
      return;
    }

    order.status = 'Completed';
    const commissionRate = Number((readData(dataFiles.commission)[0] || { rate: 5 }).rate);
    order.commission = Math.round((order.total || 0) * commissionRate / 100);
    writeData(dataFiles.orders, orders);
    notifyOrderParty(dependencies, order.customerId, `Pesanan ${order.productName} telah selesai diambil.`);
    sendJson(response, 200, order);
    return;
  }

  if (body.status !== 'Cancelled') {
    sendJson(response, 403, { error: 'Customer hanya dapat membatalkan pesanan yang belum diambil.' });
    return;
  }

  const products = readData(dataFiles.products);
  const product = products.find((item) => item.id === order.productId);
  if (product) {
    product.quantity += order.quantity;
    writeData(dataFiles.products, products);
  }

  order.status = 'Cancelled';
  writeData(dataFiles.orders, orders);
  notifyOrderParty(dependencies, order.storeId, `Pesanan ${order.productName} dibatalkan oleh customer.`);
  sendJson(response, 200, order);
}

function notifyOrderParty(dependencies, userId, message) {
  if (!userId) return;
  const { readData, writeData, dataFiles } = dependencies;
  const notifications = readData(dataFiles.notifications);
  notifications.unshift({
    id: randomUUID(),
    userId,
    message,
    read: false,
    createdAt: new Date().toISOString(),
  });
  writeData(dataFiles.notifications, notifications);
}

function createPickupCode() {
  return String(randomBytes(3).readUIntBE(0, 3) % 1_000_000).padStart(6, '0');
}

module.exports = handleOrderRequest;