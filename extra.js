// PBI tambahan: 01 hapus akun, 03 admin, 04 kategori, 05 verifikasi, 06 notifikasi, 07 produk, 08 template,
// 09 tamu, 10 laporan, 13 diskon, 15 ulasan, 17 laporan periode, 18 CSV, 19 pengumuman, 20 no-show, 21 filter
const { randomUUID } = require('node:crypto');
const { hashPassword, verifyPassword } = require('../auth');
const {
  canMarkNoShow,
  currentLocalDate,
  currentMinuteOfDay,
  effectivePrice,
  isProductExpired,
  isValidLocalDate,
  toMinuteOfDay,
  validateSchedule,
} = require('../product-pricing');
let D;
const rd = (k) => D.readData(D.dataFiles[k]);
const wr = (k, v) => D.writeData(D.dataFiles[k], v);
const now = () => new Date().toISOString();
const notify = (userId, message) => { const n = rd('notifications'); n.unshift({ id: randomUUID(), userId, message, read: false, createdAt: now() }); wr('notifications', n); };
const toMin = toMinuteOfDay;
const nowMin = () => currentMinuteOfDay();
const km = (a, b, c, d) => { const r = (x) => x * Math.PI / 180; const h = Math.sin(r(c - a) / 2) ** 2 + Math.cos(r(a)) * Math.cos(r(c)) * Math.sin(r(d - b) / 2) ** 2; return 12742 * Math.asin(Math.sqrt(h)); };
const categories = () => { const c = rd('categories'); return c.length ? c : ['Bakery', 'Meals', 'Produce', 'Other'].map((name) => ({ id: name, name })); };
const strip = ({ salt, passwordHash, ...u }) => u;

function removeUserData(userId) {
  wr('users', rd('users')
    .filter((account) => account.id !== userId)
    .map((account) => ({
      ...account,
      favorites: (Array.isArray(account.favorites) ? account.favorites : [])
        .filter((id) => id !== userId),
    })));
  wr('sessions', rd('sessions').filter((session) => session.userId !== userId));
  wr('products', rd('products').filter((product) => product.storeId !== userId));
  wr('templates', rd('templates').filter((template) => template.ownerId !== userId));
  wr('notifications', rd('notifications').filter((notification) => notification.userId !== userId));
  wr('orders', rd('orders').map((order) => ({
    ...order,
    ...(order.customerId === userId ? { customerId: null, customerName: 'Pengguna dihapus' } : {}),
    ...(order.storeId === userId ? { storeId: null, store: 'Gerai dihapus' } : {}),
  })));
  wr('reviews', rd('reviews').map((review) => ({
    ...review,
    ...(review.customerId === userId ? { customerId: null, customerName: 'Pengguna dihapus' } : {}),
    ...(review.storeId === userId ? { storeId: null } : {}),
  })));
  wr('reports', rd('reports').map((report) => ({
    ...report,
    ...(report.reporterId === userId ? { reporterId: null } : {}),
    ...(report.reviewedBy === userId ? { reviewedBy: null } : {}),
    ...(report.targetUserId === userId
      ? { targetUserId: null, productName: 'Pengguna dihapus' }
      : {}),
    ...(report.storeId === userId ? { storeId: null } : {}),
  })));
  wr('settlements', rd('settlements').map((settlement) => ({
    ...settlement,
    ...(settlement.retailerId === userId ? { retailerId: null, retailerName: 'Gerai dihapus' } : {}),
    ...(settlement.createdBy === userId ? { createdBy: null } : {}),
  })));
  wr('commission', rd('commission').map((setting) => setting.updatedBy === userId
    ? { ...setting, updatedBy: null }
    : setting));
  wr('retailerReports', rd('retailerReports').map((report) => report.retailerId === userId
    ? { ...report, retailerId: null }
    : report));
  wr('articles', rd('articles').map((article) => article.authorId === userId
    ? { ...article, authorId: null }
    : article));
}

async function handle(request, response, url, user, deps) {
  D = deps;
  const { sendJson, readRequestBody } = deps; const m = request.method; const p = url.pathname;
  const send = (c, b) => { sendJson(response, c, b); return true; };
  const q = url.searchParams;

  // ---- publik / tamu (PBI-09, 21, 04, 15)
  if (!user && m === 'GET' && p === '/api/stores') {
    const products = rd('products');
    return send(200, rd('users')
      .filter((account) => account.role === 'retailer' && account.store)
      .map((account) => {
        const availableProducts = products.filter((product) =>
          product.storeId === account.id && product.quantity > 0 && !isProductExpired(product));
        return {
          id: account.id,
          name: account.store.name,
          address: account.store.address,
          latitude: account.store.latitude,
          longitude: account.store.longitude,
          description: account.store.description,
          openTime: account.store.openTime || '',
          closeTime: account.store.closeTime || '',
          productCount: availableProducts.length,
        };
      }));
  }
  if (m === 'GET' && p === '/api/categories') return send(200, categories());
  if (m === 'GET' && p === '/api/reviews') {
    const storeId = q.get('storeId');
    const reviews = rd('reviews')
      .filter((review) => (!storeId || review.storeId === storeId) &&
        (q.get('mine') !== '1' || review.customerId === user?.id))
      .map(({ id, orderId, storeId: reviewStoreId, customerName, rating, comment, createdAt }) => ({
        id, orderId, storeId: reviewStoreId, customerName, rating, comment, createdAt,
      }));
    return send(200, reviews);
  }
  if (m === 'GET' && p === '/api/announcements') return send(200, rd('announcements'));
  if (m === 'GET' && p === '/api/articles') {
    return send(200, rd('articles').filter((article) => article.status === 'Published'));
  }
  if (m === 'GET' && p === '/api/products') {
    const users = rd('users');
    const reviews = rd('reviews');
    const rate = (id) => {
      const storeReviews = reviews.filter((review) => review.storeId === id);
      return {
        rating: storeReviews.length
          ? +(storeReviews.reduce((sum, review) => sum + review.rating, 0) / storeReviews.length).toFixed(1)
          : 0,
        reviewCount: storeReviews.length,
      };
    };
    const search = (q.get('search') || '').trim().toLowerCase();
    const latitude = q.get('lat');
    const longitude = q.get('lng');
    const lat = Number(q.get('lat'));
    const lng = Number(q.get('lng'));
    const radius = q.get('radius') === null ? null : Number(q.get('radius'));
    const maxPrice = q.get('maxPrice') === null ? null : Number(q.get('maxPrice'));
    if (maxPrice !== null && (!Number.isFinite(maxPrice) || maxPrice < 0)) {
      return send(400, { error: 'Batas harga harus berupa angka nol atau lebih.' });
    }
    if (radius !== null && (!Number.isFinite(radius) || radius <= 0 ||
      latitude === null || longitude === null ||
      !Number.isFinite(lat) || lat < -90 || lat > 90 ||
      !Number.isFinite(lng) || lng < -180 || lng > 180)) {
      return send(400, { error: 'Filter jarak memerlukan radius dan koordinat lokasi yang valid.' });
    }
    const products = rd('products');
    const list = products
      .filter((product) => product.storeId &&
        (user?.role === 'retailer' ? product.storeId === user.id : product.quantity > 0))
      .filter((product) => user?.role === 'retailer' || !isProductExpired(product))
      .map((product) => {
        const storeAccount = users.find((account) => account.id === product.storeId);
        return {
          ...product,
          price: effectivePrice(product),
          storeOpenTime: storeAccount?.store?.openTime || '',
          storeCloseTime: storeAccount?.store?.closeTime || '',
          reviews: reviews.filter((review) => review.storeId === product.storeId)
            .map(({ customerId, ...review }) => review),
          ...rate(product.storeId),
        };
      })
      .filter((product) => {
        const store = users.find((account) => account.id === product.storeId)?.store;
        if (q.get('category') && product.category !== q.get('category')) return false;
        if (search && !`${product.name} ${product.store}`.toLowerCase().includes(search)) return false;
        if (maxPrice !== null && product.price > maxPrice) return false;
        if (q.get('halal') === '1' && !product.halal) return false;
        if (q.get('closingSoon') === '1') {
          const end = toMin(product.pickupEnd);
          if (end === null || end - nowMin() > 60 || end < nowMin()) return false;
        }
        if (radius !== null && (!store || store.latitude == null || store.longitude == null ||
          km(lat, lng, store.latitude, store.longitude) > radius)) return false;
        return true;
      });
    return send(200, list);
  }
  if (!user) return false;

  // ---- PBI-01 hapus akun
  if (m === 'DELETE' && p === '/api/account') {
    const b = await readRequestBody(request); const users = rd('users'); const me = users.find((u) => u.id === user.id);
    if (!me || !verifyPassword(String(b.password || ''), me)) return send(403, { error: 'Password tidak sesuai.' });
    if (me.role === 'admin') return send(403, { error: 'Admin tidak dapat menghapus akun sendiri.' });
    removeUserData(user.id);
    return send(200, { deleted: true });
  }
  // ---- PBI-04 kategori
  if ((p === '/api/categories' && m === 'POST') ||
      (/^\/api\/categories\/[^/]+$/.test(p) && ['PATCH', 'DELETE'].includes(m))) {
    if (user.role !== 'admin') return send(403, { error: 'Khusus admin.' });
    let c = categories();
    const id = p.split('/')[3];
    const category = c.find((item) => item.id === id);
    const b = m === 'DELETE' ? {} : await readRequestBody(request);
    const name = String(b.name || '').trim();
    if (m !== 'POST' && !category) return send(404, { error: 'Kategori tidak ditemukan.' });
    if (m !== 'DELETE' && (!name || name.length > 50)) return send(400, { error: 'Nama kategori wajib diisi (maksimal 50 karakter).' });
    if (m !== 'DELETE' && c.some((item) =>
      item.id !== id && item.name.toLowerCase() === name.toLowerCase())) {
      return send(409, { error: 'Nama kategori sudah digunakan.' });
    }
    if (m === 'DELETE' && (
      rd('products').some((product) => product.category === category.name) ||
      rd('templates').some((template) => template.category === category.name)
    )) {
      return send(409, { error: 'Pindahkan produk dan template ke kategori lain sebelum menghapus kategori ini.' });
    }
    if (m === 'POST') c.push({ id: randomUUID(), name });
    else if (m === 'PATCH') {
      c = c.map((item) => (item.id === id ? { ...item, name } : item));
      wr('products', rd('products').map((product) =>
        product.category === category.name ? { ...product, category: name } : product));
      wr('templates', rd('templates').map((template) =>
        template.category === category.name ? { ...template, category: name } : template));
      const users = rd('users');
      users.forEach((account) => {
        if (account.savedFilter?.category === category.name) {
          account.savedFilter.category = name;
        }
      });
      wr('users', users);
    }
    else c = c.filter((item) => item.id !== id);
    wr('categories', c); return send(200, c);
  }
  // ---- PBI-05 verifikasi retailer
  if (p === '/api/verification' && user.role === 'retailer') {
    const users = rd('users'); const me = users.find((u) => u.id === user.id);
    if (m === 'GET') return send(200, me.verification || { status: 'none' });
    if (m === 'POST') {
      const b = await readRequestBody(request);
      const proof = String(b.proof || '').trim();
      if (!proof || proof.length > 2000) return send(400, { error: 'Bukti usaha wajib diisi (maksimal 2.000 karakter).' });
      if (me.verification?.status === 'approved') return send(409, { error: 'Usaha ini sudah terverifikasi.' });
      me.verification = { status: 'pending', proof, submittedAt: now() }; wr('users', users);
      users.filter((u) => u.role === 'admin').forEach((a) => notify(a.id, `Pengajuan verifikasi baru dari ${me.store?.name || me.name}.`)); return send(200, me.verification); }
  }
  if (user.role === 'admin' && m === 'GET' && p === '/api/admin/verifications') return send(200, rd('users').filter((u) => u.verification).map((u) => ({ id: u.id, name: u.store?.name || u.name, ...u.verification })));
  const vm = p.match(/^\/api\/admin\/verifications\/([^/]+)$/);
  if (vm && m === 'PATCH' && user.role === 'admin') {
    const b = await readRequestBody(request); const users = rd('users'); const u = users.find((x) => x.id === vm[1]);
    const st = { approve: 'approved', reject: 'rejected', revoke: 'revoked' }[b.action];
    if (!u || u.role !== 'retailer' || !st) return send(400, { error: 'Retailer atau aksi tidak valid.' });
    if (st !== 'approved' && !String(b.reason || '').trim()) return send(400, { error: 'Alasan wajib diisi.' });
    u.verification = { ...(u.verification || {}), status: st, reason: b.reason || '', decidedAt: now() }; wr('users', users);
    notify(u.id, `Verifikasi usaha: ${st}${b.reason ? ` (${b.reason})` : ''}.`);
    if (st !== 'approved') {
      const products = rd('products').map((product) => product.storeId === u.id
        ? { ...product, quantity: 0 }
        : product);
      wr('products', products);
    }
    return send(200, u.verification);
  }
  // ---- PBI-03 admin tambah/hapus akun
  if (user.role === 'admin' && m === 'POST' && p === '/api/admin/admins') {
    const b = await readRequestBody(request); const users = rd('users'); const email = String(b.email || '').toLowerCase().trim();
    const name = String(b.name || '').trim();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || name.length < 2 ||
        String(b.password || '').length < 8 || users.some((u) => u.email === email)) {
      return send(400, { error: 'Nama, email, atau password tidak valid; email tidak boleh duplikat.' });
    }
    const h = hashPassword(String(b.password)); const a = { id: randomUUID(), name, email, role: 'admin', ...h };
    users.push(a); wr('users', users); return send(201, strip(a));
  }
  const du = p.match(/^\/api\/admin\/users\/([^/]+)$/);
  if (user.role === 'admin' && du && m === 'DELETE') {
    if (du[1] === user.id) return send(400, { error: 'Tidak bisa menghapus akun sendiri.' });
    if (!rd('users').some((account) => account.id === du[1])) return send(404, { error: 'Akun tidak ditemukan.' });
    removeUserData(du[1]);
    return send(200, { deleted: true });
  }
  // ---- PBI-06 notifikasi
  if (m === 'GET' && p === '/api/notifications') return send(200, rd('notifications').filter((n) => n.userId === user.id));
  const nm = p.match(/^\/api\/notifications\/([^/]+)$/);
  if (nm && ['PATCH', 'DELETE'].includes(m)) {
    const notifications = rd('notifications');
    const notification = notifications.find((item) => item.id === nm[1] && item.userId === user.id);
    if (!notification) return send(404, { error: 'Notifikasi tidak ditemukan.' });
    wr('notifications', m === 'PATCH'
      ? notifications.map((item) => item === notification ? { ...item, read: true } : item)
      : notifications.filter((item) => item !== notification));
    return send(200, { ok: true });
  }
  // ---- PBI-08 template
  if (user.role === 'retailer' && p === '/api/templates') {
    if (m === 'GET') return send(200, rd('templates').filter((t) => t.ownerId === user.id));
    if (m === 'POST') {
      const body = await readRequestBody(request);
      const template = {
        name: String(body.templateName || body.name || '').trim(),
        category: String(body.category || '').trim(),
        price: Number(body.price),
        originalPrice: Number(body.originalPrice),
        quantity: Number(body.quantity),
        minPrice: body.minPrice === undefined || body.minPrice === '' ? 0 : Number(body.minPrice),
        pickupStart: String(body.pickupStart || ''),
        pickupEnd: String(body.pickupEnd || ''),
        photo: body.photo || '',
        halal: body.halal === true || body.halal === 'on',
        schedule: body.schedule === undefined ? [] : body.schedule,
      };
      const scheduleError = validateSchedule(template.schedule, template.price, template.minPrice);
      if (!template.name || template.name.length > 100 ||
          !categories().some((category) => category.name === template.category) ||
          !Number.isInteger(template.price) || template.price < 1 ||
          !Number.isInteger(template.originalPrice) || template.originalPrice < template.price ||
          !Number.isInteger(template.quantity) || template.quantity < 1 ||
          !Number.isInteger(template.minPrice) ||
          (template.pickupStart && toMin(template.pickupStart) === null) ||
          toMin(template.pickupEnd) === null ||
          (template.pickupStart && toMin(template.pickupStart) >= toMin(template.pickupEnd)) ||
          (template.photo && typeof template.photo !== 'string') ||
          typeof template.halal !== 'boolean' || scheduleError) {
        return send(400, { error: scheduleError || 'Data template produk tidak valid.' });
      }
      const templates = rd('templates');
      const saved = { ...template, id: randomUUID(), ownerId: user.id };
      templates.unshift(saved);
      wr('templates', templates);
      return send(201, saved);
    }
  }
  const tm = p.match(/^\/api\/templates\/([^/]+)$/);
  if (tm && m === 'DELETE') {
    if (user.role !== 'retailer') return send(403, { error: 'Fitur ini khusus retailer.' });
    const templates = rd('templates');
    if (!templates.some((template) => template.id === tm[1] && template.ownerId === user.id)) {
      return send(404, { error: 'Template tidak ditemukan.' });
    }
    wr('templates', templates.filter((template) =>
      !(template.id === tm[1] && template.ownerId === user.id)));
    return send(200, { deleted: true });
  }
  // ---- PBI-07 + 13 produk lengkap
  if (user.role === 'retailer' && m === 'POST' && p === '/api/products') {
    const me = rd('users').find((u) => u.id === user.id);
    if (me.verification?.status !== 'approved') return send(403, { error: 'Akun retailer harus terverifikasi admin sebelum memposting produk.' });
    const b = await readRequestBody(request); const n = (v) => Number(v);
    const x = { id: randomUUID(), name: String(b.name || '').trim(), category: String(b.category || '').trim(), price: n(b.price), originalPrice: n(b.originalPrice), quantity: n(b.quantity),
      expiryDate: b.expiryDate || '', pickupStart: b.pickupStart || '', pickupEnd: b.pickupEnd || '', photo: b.photo || '', halal: b.halal === true,
      minPrice: b.minPrice === undefined || b.minPrice === '' ? 0 : n(b.minPrice),
      schedule: b.schedule === undefined ? [] : b.schedule, store: me.store?.name, storeId: me.id };
    const scheduleError = validateSchedule(x.schedule, x.price, x.minPrice);
    const categoryExists = categories().some((category) => category.name === x.category);
    if (!x.name || !categoryExists || !Number.isInteger(x.price) || x.price < 1 ||
        !Number.isInteger(x.originalPrice) || x.originalPrice < x.price ||
        !Number.isInteger(x.quantity) || x.quantity < 1 ||
        !isValidLocalDate(x.expiryDate) || x.expiryDate < currentLocalDate() ||
        toMin(x.pickupEnd) === null ||
        (x.pickupStart && toMin(x.pickupStart) === null) ||
        (x.pickupStart && toMin(x.pickupStart) >= toMin(x.pickupEnd)) ||
        (b.halal !== undefined && typeof b.halal !== 'boolean') ||
        (x.photo && typeof x.photo !== 'string') || scheduleError) {
      return send(400, { error: scheduleError || 'Periksa nama, kategori, harga, stok, tanggal kedaluwarsa, dan jam pengambilan.' });
    }
    const l = rd('products'); l.unshift(x); wr('products', l); return send(201, x);
  }
  const pm = p.match(/^\/api\/products\/([^/]+)$/);
  if (user.role === 'retailer' && pm && m === 'DELETE') {
    const products = rd('products');
    if (!products.some((product) => product.id === pm[1] && product.storeId === user.id)) {
      return send(404, { error: 'Produk tidak ditemukan.' });
    }
    wr('products', products.filter((product) => !(product.id === pm[1] && product.storeId === user.id)));
    return send(200, { deleted: true });
  }
  if (user.role === 'retailer' && pm && m === 'PATCH') {
    const b = await readRequestBody(request); const l = rd('products'); const x = l.find((i) => i.id === pm[1] && i.storeId === user.id); if (!x) return send(404, { error: 'Produk tidak ditemukan.' });
    const updated = { ...x };
    ['name', 'category', 'photo', 'expiryDate', 'pickupStart', 'pickupEnd', 'halal', 'minPrice', 'schedule', 'price', 'originalPrice', 'quantity'].forEach((k) => {
      if (b[k] !== undefined) updated[k] = ['price', 'originalPrice', 'quantity', 'minPrice'].includes(k)
        ? Number(b[k])
        : b[k];
    });
    if (b.active === false) updated.quantity = 0;
    const scheduleError = validateSchedule(updated.schedule, updated.price, updated.minPrice);
    if (scheduleError) return send(400, { error: scheduleError });
    if (!updated.name || !categories().some((category) => category.name === updated.category) ||
        !Number.isInteger(updated.price) ||
        updated.price < 1 || !Number.isFinite(updated.originalPrice) ||
        !Number.isInteger(updated.originalPrice) || updated.originalPrice < updated.price ||
        !Number.isInteger(updated.quantity) ||
        updated.quantity < 0 || !Number.isFinite(updated.minPrice) ||
        updated.minPrice < 0 || updated.minPrice > updated.price ||
        (updated.expiryDate && !isValidLocalDate(updated.expiryDate)) ||
        (updated.pickupStart && toMin(updated.pickupStart) === null) ||
        (updated.pickupEnd && toMin(updated.pickupEnd) === null) ||
        (updated.pickupStart && updated.pickupEnd &&
          toMin(updated.pickupStart) >= toMin(updated.pickupEnd)) ||
        (updated.halal !== undefined && typeof updated.halal !== 'boolean') ||
        (updated.photo && typeof updated.photo !== 'string') || scheduleError) {
      return send(400, { error: scheduleError || 'Periksa nama, kategori, harga, stok, jadwal, dan informasi produk.' });
    }
    const retailer = rd('users').find((account) => account.id === user.id);
    if (updated.quantity > 0 && retailer?.verification?.status !== 'approved') {
      return send(403, { error: 'Akun retailer harus terverifikasi admin sebelum mengaktifkan produk.' });
    }
    Object.assign(x, updated);
    wr('products', l);
    return send(200, x);
  }
  // ---- PBI-21 simpan filter
  if (p === '/api/filters' && ['GET', 'PUT'].includes(m)) {
    const users = rd('users');
    const account = users.find((item) => item.id === user.id);
    if (m === 'PUT') {
      const body = await readRequestBody(request);
      const search = String(body.search || '').trim();
      const category = String(body.category || '');
      const maxPrice = body.maxPrice === '' || body.maxPrice == null
        ? null
        : Number(body.maxPrice);
      const radius = body.radius === '' || body.radius == null
        ? null
        : Number(body.radius);
      const validBoolean = (value) => value === undefined || value === '' || value === false ||
        value === '1' || value === 'true' || value === true;
      if (search.length > 100 ||
          (category && !categories().some((item) => item.name === category)) ||
          (maxPrice !== null && (!Number.isFinite(maxPrice) || maxPrice < 0)) ||
          (radius !== null && (!Number.isFinite(radius) || radius <= 0 || radius > 1000)) ||
          !validBoolean(body.halal) || !validBoolean(body.closingSoon)) {
        return send(400, { error: 'Filter pencarian tidak valid.' });
      }
      account.savedFilter = {
        search,
        category,
        maxPrice: maxPrice === null ? '' : String(maxPrice),
        radius: radius === null ? '' : String(radius),
        halal: body.halal === '1' || body.halal === 'true' || body.halal === true,
        closingSoon: body.closingSoon === '1' || body.closingSoon === 'true' || body.closingSoon === true,
      };
      wr('users', users);
    }
    return send(200, account.savedFilter || {});
  }
  // ---- PBI-15 ulasan
  if (user.role === 'customer' && m === 'POST' && p === '/api/reviews') {
    const b = await readRequestBody(request); const o = rd('orders').find((x) => x.id === b.orderId && x.customerId === user.id); const r = Number(b.rating);
    if (!o || o.status !== 'Completed') return send(400, { error: 'Ulasan hanya untuk pesanan yang sudah selesai.' });
    const comment = String(b.comment || '').trim();
    if (!Number.isInteger(r) || r < 1 || r > 5 || comment.length > 500) {
      return send(400, { error: 'Rating harus 1-5 dan komentar maksimal 500 karakter.' });
    }
    const l = rd('reviews'); if (l.some((x) => x.orderId === o.id)) return send(409, { error: 'Pesanan sudah diulas.' });
    const x = { id: randomUUID(), orderId: o.id, storeId: o.storeId, customerId: user.id, customerName: user.name, rating: r, comment, createdAt: now() }; l.unshift(x); wr('reviews', l); notify(o.storeId, `Ulasan baru (${r}/5) untuk pesananmu.`); return send(201, x);
  }
  const rm = p.match(/^\/api\/reviews\/([^/]+)$/);
  if (rm && ['PATCH', 'DELETE'].includes(m)) {
    const reviews = rd('reviews');
    const review = reviews.find((item) => item.id === rm[1] && item.customerId === user.id);
    if (!review) return send(404, { error: 'Ulasan tidak ditemukan.' });
    if (m === 'DELETE') {
      wr('reviews', reviews.filter((item) => item !== review));
      return send(200, { deleted: true });
    }
    const body = await readRequestBody(request);
    const rating = body.rating === undefined ? review.rating : Number(body.rating);
    const comment = body.comment === undefined ? review.comment : String(body.comment).trim();
    if (!Number.isInteger(rating) || rating < 1 || rating > 5 || comment.length > 500) {
      return send(400, { error: 'Rating harus 1-5 dan komentar maksimal 500 karakter.' });
    }
    Object.assign(review, { rating, comment, updatedAt: now() });
    wr('reviews', reviews);
    return send(200, review);
  }
  // ---- PBI-19 pengumuman
  if (user.role === 'admin' && p === '/api/admin/announcements' && m === 'POST') {
    const body = await readRequestBody(request);
    const title = String(body.title || '').trim();
    const content = String(body.body || '').trim();
    if (!title || title.length > 120 || !content || content.length > 2000) {
      return send(400, { error: 'Judul wajib maksimal 120 karakter dan isi pengumuman maksimal 2.000 karakter.' });
    }
    const announcement = { id: randomUUID(), title, body: content, createdAt: now() };
    const announcements = rd('announcements');
    announcements.unshift(announcement);
    wr('announcements', announcements);
    rd('users').forEach((account) => notify(account.id, `Pengumuman: ${announcement.title}`));
    return send(201, announcement);
  }
  const am = p.match(/^\/api\/admin\/announcements\/([^/]+)$/);
  if (user.role === 'admin' && am && m === 'PATCH') {
    const body = await readRequestBody(request);
    const announcements = rd('announcements');
    const announcement = announcements.find((item) => item.id === am[1]);
    if (!announcement) return send(404, { error: 'Pengumuman tidak ditemukan.' });
    const title = String(body.title ?? announcement.title).trim();
    const content = String(body.body ?? announcement.body).trim();
    if (!title || title.length > 120 || !content || content.length > 2000) {
      return send(400, { error: 'Judul wajib maksimal 120 karakter dan isi pengumuman maksimal 2.000 karakter.' });
    }
    Object.assign(announcement, { title, body: content, updatedAt: now() });
    wr('announcements', announcements);
    return send(200, announcement);
  }
  if (user.role === 'admin' && am && m === 'DELETE') {
    const announcements = rd('announcements');
    if (!announcements.some((announcement) => announcement.id === am[1])) {
      return send(404, { error: 'Pengumuman tidak ditemukan.' });
    }
    wr('announcements', announcements.filter((announcement) => announcement.id !== am[1]));
    return send(200, { ok: true });
  }
  // ---- PBI-20 no-show
  const nsm = p.match(/^\/api\/orders\/([^/]+)\/no-show$/);
  if (user.role === 'retailer' && nsm && m === 'POST') {
    const os = rd('orders'); const o = os.find((x) => x.id === nsm[1] && x.storeId === user.id);
    if (!o) return send(404, { error: 'Pesanan tidak ditemukan.' });
    const product = rd('products').find((item) => item.id === o.productId);
    if (!canMarkNoShow(o, product)) {
      return send(409, { error: 'Pesanan hanya dapat ditandai no-show setelah waktu pengambilan berakhir.' });
    }
    o.status = 'No-show'; wr('orders', os); const pr = rd('products'); const x = pr.find((i) => i.id === o.productId); if (x) { x.quantity += o.quantity; wr('products', pr); }
    const us = rd('users'); const c = us.find((u) => u.id === o.customerId); if (c) { c.noShowCount = (c.noShowCount || 0) + 1; if (c.noShowCount >= 3) { c.suspended = true; notify(c.id, 'Akunmu dibatasi karena 3 kali tidak mengambil pesanan.'); } else notify(c.id, `Pesanan tidak diambil (${c.noShowCount}/3).`); wr('users', us); }
    notify(user.id, `Pesanan ${o.productName} ditandai no-show; stok dikembalikan.`);
    return send(200, o);
  }
  // ---- PBI-17 laporan periode retailer, PBI-18 CSV admin
  if (user.role === 'retailer' && p === '/api/retailer/reports') {
    const l = rd('retailerReports');
    if (m === 'GET') return send(200, l.filter((r) => r.retailerId === user.id));
    if (m === 'POST') {
      const body = await readRequestBody(request);
      const period = String(body.period || '');
      if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(period)) {
        return send(400, { error: 'Pilih periode laporan dengan format bulan dan tahun.' });
      }
      const periodOrders = rd('orders').filter((order) =>
        order.storeId === user.id && String(order.createdAt || '').startsWith(`${period}-`));
      const completed = periodOrders.filter((order) => order.status === 'Completed');
      const products = rd('products').filter((product) => product.storeId === user.id);
      const report = {
        id: randomUUID(),
        retailerId: user.id,
        period,
        orders: periodOrders.length,
        completed: completed.length,
        activeListings: products.filter((product) =>
          product.quantity > 0 && !isProductExpired(product)).length,
        totalStock: products.reduce((sum, product) => sum + Number(product.quantity || 0), 0),
        revenue: completed.reduce((sum, order) => sum + Number(order.total || 0), 0),
        packsSaved: completed.reduce((sum, order) => sum + Number(order.quantity || 0), 0),
        createdAt: now(),
      };
      l.unshift(report);
      wr('retailerReports', l);
      return send(201, report);
    }
  }
  if (user.role === 'admin' && m === 'GET' && p === '/api/admin/export.csv') {
    const os = rd('orders'); const done = os.filter((o) => o.status === 'Completed'); const rate = (rd('commission')[0] || { rate: 5 }).rate;
    const rows = [['metrik', 'nilai'], ['pengguna', rd('users').length], ['pesanan', os.length], ['pesanan_selesai', done.length], ['pack_terselamatkan', done.reduce((s, o) => s + o.quantity, 0)], ['penjualan_kotor', done.reduce((s, o) => s + o.total, 0)], ['komisi_persen', rate], ['komisi_total', done.reduce((s, o) => s + (o.commission || 0), 0)]];
    response.writeHead(200, { 'Content-Type': 'text/csv; charset=utf-8', 'Content-Disposition': 'attachment; filename="statistik-platiful.csv"' }); response.end(rows.map((r) => r.join(',')).join('\n')); return true;
  }
  // ---- PBI-14 komisi per pesanan
  if (user.role === 'admin' && m === 'GET' && p === '/api/admin/commissions') {
    const rate = (rd('commission')[0] || { rate: 5 }).rate;
    const rows = rd('orders').filter((o) => o.status === 'Completed').map((o) => ({ id: o.id, store: o.store, productName: o.productName, total: o.total, commission: o.commission ?? Math.round(o.total * rate / 100), createdAt: o.createdAt }));
    return send(200, { rate, totalCommission: rows.reduce((s, r) => s + r.commission, 0), rows });
  }
  // ---- PBI-10 lapor pengguna + kelola laporan saya
  const okRole = ['customer', 'retailer'].includes(user.role);
  if (okRole && m === 'GET' && p === '/api/report-targets') return send(200, rd('users').filter((u) => u.id !== user.id && u.role !== 'admin').map((u) => ({ id: u.id, name: u.store?.name || u.name, role: u.role })));
  if (okRole && m === 'POST' && p === '/api/user-reports') {
    const b = await readRequestBody(request); const t = rd('users').find((u) => u.id === b.targetUserId);
    const reason = String(b.reason || '').trim();
    const details = String(b.details || '').trim();
    if (!t || t.id === user.id || !reason || reason.length > 200 || details.length > 1000) {
      return send(400, { error: 'Pilih pengguna, isi alasan maksimal 200 karakter, dan batasi detail hingga 1.000 karakter.' });
    }
    const l = rd('reports'); const x = { id: randomUUID(), productId: null, productName: `Pengguna: ${t.store?.name || t.name}`, storeId: t.id, targetUserId: t.id, reporterId: user.id, reason, details, status: 'Open', createdAt: now() };
    l.unshift(x); wr('reports', l); rd('users').filter((u) => u.role === 'admin').forEach((a) => notify(a.id, `Laporan pengguna baru: ${x.productName}`)); return send(201, x);
  }
  if (m === 'GET' && p === '/api/my-reports') {
    return send(200, rd('reports').filter((report) =>
      report.reporterId === user.id && report.targetUserId));
  }
  const mr = p.match(/^\/api\/my-reports\/([^/]+)$/);
  if (mr && ['PATCH', 'DELETE'].includes(m)) {
    const reports = rd('reports');
    const report = reports.find((item) => item.id === mr[1] && item.reporterId === user.id && item.targetUserId);
    if (!report || report.status !== 'Open') return send(409, { error: 'Laporan tidak dapat diubah.' });
    if (m === 'DELETE') {
      wr('reports', reports.filter((item) => item !== report));
      return send(200, { deleted: true });
    }
    const body = await readRequestBody(request);
    const reason = String(body.reason ?? report.reason).trim();
    const details = String(body.details ?? report.details).trim();
    if (!reason || reason.length > 200 || details.length > 1000) {
      return send(400, { error: 'Alasan wajib diisi (maksimal 200 karakter) dan detail maksimal 1.000 karakter.' });
    }
    Object.assign(report, { reason, details, updatedAt: now() });
    wr('reports', reports);
    return send(200, report);
  }
  const productReportMatch = p.match(/^\/api\/reports\/([^/]+)$/);
  if (productReportMatch && ['PATCH', 'DELETE'].includes(m)) {
    const reports = rd('reports');
    const report = reports.find((item) => item.id === productReportMatch[1] &&
      item.reporterId === user.id && item.productId);
    if (!report || report.status !== 'Open') return send(409, { error: 'Laporan tidak dapat diubah.' });
    if (m === 'DELETE') {
      wr('reports', reports.filter((item) => item !== report));
      return send(200, { deleted: true });
    }
    const body = await readRequestBody(request);
    const reason = String(body.reason ?? report.reason).trim();
    const details = String(body.details ?? report.details).trim();
    if (!['Food safety', 'Incorrect information', 'Other'].includes(reason) || details.length > 500) {
      return send(400, { error: 'Pilih alasan laporan yang valid.' });
    }
    Object.assign(report, { reason, details, updatedAt: now() });
    wr('reports', reports);
    return send(200, report);
  }
  return false;
}
function startScheduler(d) {
  D = d;
  const tick = () => { const ps = rd('products'); let ch = false;
    ps.forEach((p) => { const late = isProductExpired(p);
      if (late && p.status !== 'Expired') { p.status = 'Expired'; ch = true; } });
    if (ch) wr('products', ps); };
  tick(); setInterval(tick, 60000).unref();
}
module.exports = handle;
module.exports.startScheduler = startScheduler;
module.exports.effectivePrice = effectivePrice;
module.exports.notify = (d, id, msg) => { D = d; notify(id, msg); };