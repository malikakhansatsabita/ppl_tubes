const { hashPassword, verifyPassword } = require('../auth');
const { isProductExpired, toMinuteOfDay } = require('../product-pricing');

async function handleAccountRequest(request, response, url, user, dependencies) {
  const { readData, writeData, dataFiles, readRequestBody, sendJson } = dependencies;

  if (request.method === 'GET' && url.pathname === '/api/dashboard') {
    const orders = readData(dataFiles.orders).filter((order) => user.role === 'retailer'
      ? order.storeId === user.id
      : order.customerId === user.id);
    const completedOrders = orders.filter((order) => order.status === 'Completed');
    const allProducts = readData(dataFiles.products);
    const products = user.role === 'retailer'
      ? allProducts.filter((product) => product.storeId === user.id)
      : allProducts;
    const rescuedPacks = completedOrders.reduce((sum, order) => sum + order.quantity, 0);
    const estimatedSavings = completedOrders.reduce((sum, order) => {
      const quantity = Number(order.quantity);
      const product = allProducts.find((item) => item.id === order.productId);
      const originalUnitPrice = order.originalPrice ?? product?.originalPrice;
      const originalTotal = Number(originalUnitPrice) * quantity;
      return sum + (Number.isFinite(originalTotal)
        ? Math.max(0, originalTotal - Number(order.total || 0))
        : 0);
    }, 0);

    sendJson(response, 200, {
      role: user.role,
      orderCount: orders.length,
      completedCount: completedOrders.length,
      rescuedPacks,
      estimatedSaved: estimatedSavings,
      activeListings: products.filter((product) =>
        product.quantity > 0 && !isProductExpired(product)).length,
      totalStock: products.reduce((sum, product) => sum + product.quantity, 0),
      grossSales: completedOrders.reduce((sum, order) => sum + order.total, 0),
    });
    return true;
  }

  if (request.method === 'GET' && url.pathname === '/api/stores') {
    const stores = readData(dataFiles.users)
      .filter((account) => account.role === 'retailer' && account.store)
      .map((account) => ({
        id: account.id,
        name: account.store.name,
        address: account.store.address,
        latitude: account.store.latitude,
        longitude: account.store.longitude,
        description: account.store.description,
        openTime: account.store.openTime || '',
        closeTime: account.store.closeTime || '',
        productCount: readData(dataFiles.products)
          .filter((product) => product.storeId === account.id &&
            product.quantity > 0 && !isProductExpired(product)).length,
      }));
    sendJson(response, 200, stores);
    return true;
  }

  if (request.method === 'GET' && url.pathname === '/api/favorites') {
    const favoriteIds = user.favorites || [];
    const stores = readData(dataFiles.users)
      .filter((account) => favoriteIds.includes(account.id) && account.role === 'retailer')
      .map((account) => ({
        id: account.id,
        name: account.store?.name || account.name,
        address: account.store?.address || '',
        latitude: account.store?.latitude ?? null,
        longitude: account.store?.longitude ?? null,
        openTime: account.store?.openTime || '',
        closeTime: account.store?.closeTime || '',
      }));
    sendJson(response, 200, stores);
    return true;
  }

  if (request.method === 'GET' && url.pathname === '/api/account') {
    sendJson(response, 200, {
      name: user.name,
      email: user.email,
      role: user.role,
      phone: user.phone || '',
    });
    return true;
  }

  if (request.method === 'PUT' && url.pathname === '/api/account') {
    const body = await readRequestBody(request);
    const name = String(body.name || '').trim();
    const phone = String(body.phone || '').trim();
    if (name.length < 2) {
      sendJson(response, 400, { error: 'Nama minimal terdiri dari 2 karakter.' });
      return true;
    }

    const users = readData(dataFiles.users);
    const account = users.find((item) => item.id === user.id);
    account.name = name;
    account.phone = phone;
    writeData(dataFiles.users, users);
    sendJson(response, 200, { name, email: account.email, role: account.role, phone });
    return true;
  }

  if (request.method === 'PUT' && url.pathname === '/api/account/password') {
    const body = await readRequestBody(request);
    const currentPassword = String(body.currentPassword || '');
    const newPassword = String(body.newPassword || '');
    if (!verifyPassword(currentPassword, user)) {
      sendJson(response, 400, { error: 'Password saat ini tidak sesuai.' });
      return true;
    }
    if (newPassword.length < 8) {
      sendJson(response, 400, { error: 'Password baru minimal 8 karakter.' });
      return true;
    }

    const users = readData(dataFiles.users);
    const account = users.find((item) => item.id === user.id);
    Object.assign(account, hashPassword(newPassword));
    writeData(dataFiles.users, users);
    sendJson(response, 200, { ok: true });
    return true;
  }

  const favoriteMatch = url.pathname.match(/^\/api\/favorites\/([^/]+)$/);
  if (favoriteMatch && ['PUT', 'DELETE'].includes(request.method)) {
    const retailer = readData(dataFiles.users)
      .find((account) => account.id === favoriteMatch[1] && account.role === 'retailer');
    if (!retailer || retailer.id === user.id) {
      sendJson(response, 404, { error: 'Gerai tidak ditemukan.' });
      return true;
    }

    const users = readData(dataFiles.users);
    const currentUser = users.find((account) => account.id === user.id);
    const favorites = new Set(currentUser.favorites || []);
    if (request.method === 'PUT') favorites.add(retailer.id);
    else favorites.delete(retailer.id);
    currentUser.favorites = [...favorites];
    writeData(dataFiles.users, users);
    sendJson(response, 200, { favorites: currentUser.favorites });
    return true;
  }

  if (request.method === 'GET' && url.pathname === '/api/store') {
    if (user.role !== 'retailer') {
      sendJson(response, 403, { error: 'Fitur ini khusus retailer.' });
    } else {
      sendJson(response, 200, user.store || {});
    }
    return true;
  }

  if (request.method === 'PUT' && url.pathname === '/api/store') {
    if (user.role !== 'retailer') {
      sendJson(response, 403, { error: 'Fitur ini khusus retailer.' });
      return true;
    }

    const body = await readRequestBody(request);
    const store = {
      openTime: String(body.openTime || ''),
      closeTime: String(body.closeTime || ''),
      name: String(body.name || '').trim(),
      address: String(body.address || '').trim(),
      description: String(body.description || '').trim(),
      phone: String(body.phone || '').trim(),
      latitude: body.latitude === '' || body.latitude == null ? null : Number(body.latitude),
      longitude: body.longitude === '' || body.longitude == null ? null : Number(body.longitude),
    };
    if (!store.name || !store.address) {
      sendJson(response, 400, { error: 'Nama dan alamat gerai wajib diisi.' });
      return true;
    }
    if ((store.latitude == null) !== (store.longitude == null) ||
        (store.latitude != null && (!Number.isFinite(store.latitude) || store.latitude < -90 || store.latitude > 90)) ||
        (store.longitude != null && (!Number.isFinite(store.longitude) || store.longitude < -180 || store.longitude > 180))) {
      sendJson(response, 400, { error: 'Koordinat harus diisi berpasangan dan berada dalam rentang yang valid.' });
      return true;
    }
    const hasOpenTime = store.openTime !== '';
    const hasCloseTime = store.closeTime !== '';
    const openMinute = toMinuteOfDay(store.openTime);
    const closeMinute = toMinuteOfDay(store.closeTime);
    if (hasOpenTime !== hasCloseTime ||
        (hasOpenTime && (openMinute === null || closeMinute === null || closeMinute <= openMinute))) {
      sendJson(response, 400, { error: 'Jam buka dan tutup harus valid, berpasangan, dan jam tutup setelah jam buka.' });
      return true;
    }

    const users = readData(dataFiles.users);
    const userIndex = users.findIndex((item) => item.id === user.id);
    users[userIndex].store = store;
    writeData(dataFiles.users, users);

    const products = readData(dataFiles.products);
    products.filter((product) => product.storeId === user.id)
      .forEach((product) => { product.store = store.name; });
    writeData(dataFiles.products, products);
    sendJson(response, 200, store);
    return true;
  }

  return false;
}

module.exports = handleAccountRequest;