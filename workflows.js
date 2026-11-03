function pagesForRole(role) {
  if (role === 'admin') {
    return [
      ['admin', 'Ringkasan platform'],
      ['users', 'Pengguna'],
      ['moderation', 'Moderasi laporan'],
      ['articles', 'Artikel edukasi'],
      ['commission', 'Komisi & settlement'],
      ['account', 'Pengaturan akun'],
    ];
  }

  if (role === 'retailer') {
    return [
      ['retailer', 'Dashboard gerai'],
      ['products', 'Produk surplus'],
      ['orders', 'Pesanan masuk'],
      ['store', 'Profil gerai'],
      ['account', 'Pengaturan akun'],
      ['reports', 'Laporan gerai'],
    ];
  }

  return [
    ['dashboard', 'Dashboard'],
    ['discover', 'Temukan makanan'],
    ['map', 'Peta & gerai'],
    ['orders', 'Pesanan saya'],
    ['favorites', 'Gerai favorit'],
    ['account', 'Pengaturan akun'],
    ['reports', 'Laporan saya'],
    ['articles', 'Artikel edukasi'],
  ];
}

function updateRoleNavigation() {
  const retailer = window.currentUser.role === 'retailer';
  const roleLabel = window.currentUser.role === 'admin'
    ? 'Staff admin'
    : retailer ? 'Retailer' : 'Customer';
  const nav = document.getElementById('nav');
  const pages = pagesForRole(window.currentUser.role);

  nav.innerHTML = `
    <div class="nav-label">${window.currentUser.role === 'admin' ? 'ADMINISTRASI' : retailer ? 'PENGELOLAAN GERAI' : 'MENU UTAMA'}</div>
    ${pages.map(([page, label]) => `
      <button class="nav-item" data-page="${page}">
        <span>${navigationIcon(page)}</span>${label}
      </button>`).join('')}`;

  const mission = window.currentUser.role === 'admin'
    ? { icon: '🧑‍🌾', title: 'Penjaga kebaikan', note: 'Bantu jaga komunitas tetap aman.', page: 'moderation', action: 'Lihat laporan' }
    : retailer
      ? { icon: '🥕', title: 'Panen surplus', note: 'Ada makanan yang siap berbagi?', page: 'products', action: 'Tambah listing' }
      : { icon: '🍓', title: 'Misi kecil hari ini', note: 'Satu pack terselamatkan itu berarti!', page: 'discover', action: 'Cari deal' };
  let missionCard = document.querySelector('.sidebar-mission');
  if (!missionCard) {
    missionCard = document.createElement('section');
    missionCard.className = 'sidebar-mission';
    nav.after(missionCard);
  }
  missionCard.innerHTML = `
    <div class="mission-mascots" aria-hidden="true"><span>${mission.icon}</span><i>✦</i><b>·</b></div>
    <span class="mission-kicker">LITTLE GOOD THING</span>
    <h3>${mission.title}</h3>
    <p>${mission.note}</p>
    <button type="button" data-goto="${mission.page}">${mission.action}<span aria-hidden="true">↗</span></button>`;

  document.querySelector('.workspace').innerHTML = `
    <span class="dot"></span>${roleLabel}
    <span class="chev">⌄</span>`;

  const initials = window.currentUser.name
    .split(/\s+/)
    .map((part) => part[0])
    .join('')
    .slice(0, 2)
    .toUpperCase();

  document.querySelectorAll('.profile-mini b').forEach((element) => {
    element.textContent = window.currentUser.name;
  });
  document.querySelectorAll('.profile-mini small').forEach((element) => {
    element.textContent = retailer
      ? window.currentUser.store?.name || 'Retailer'
      : window.currentUser.role === 'admin' ? 'Platform staff' : 'Customer account';
  });
  document.querySelectorAll('.profile-mini .avatar, .top-actions .avatar').forEach((element) => {
    element.textContent = initials;
  });
}

function navigationIcon(page) {
  const icons = {
    dashboard: '▦',
    discover: '⌕',
    map: '⌖',
    orders: '▤',
    favorites: '♡',
    products: '▧',
    retailer: '▦',
    store: '⌂',
    account: '⚙',
    reports: '⚑',
    admin: '▦',
    users: '♙',
    moderation: '⚑',
    articles: '▤',
    commission: '％',
  };
  return icons[page] || '▦';
}

function renderLoadingState() {
  content.innerHTML = '<section class="panel loading-state">Memuat data akun...</section>';
}

async function renderDashboard() {
  const [summary, orders] = await Promise.all([
    platifulApi.request('/api/dashboard'),
    platifulApi.request('/api/orders'),
  ]);
  const retailer = summary.role === 'retailer';
  const stats = retailer
    ? [
      stat('Listing aktif', summary.activeListings, '▧', summary.totalStock, 'pack tersedia'),
      stat('Total stok', `${summary.totalStock} pack`, '▤', summary.activeListings, 'listing aktif'),
      stat('Pesanan masuk', summary.orderCount, '▤', summary.completedCount, 'selesai'),
      stat('Penjualan selesai', formatRupiah(summary.grossSales), 'Rp', summary.rescuedPacks, 'pack terselamatkan'),
    ]
    : [
      stat('Total pesanan', summary.orderCount, '▤', summary.completedCount, 'selesai'),
      stat('Pesanan selesai', summary.completedCount, '✓', summary.rescuedPacks, 'pack diselamatkan'),
      stat('Estimasi hemat', formatRupiah(summary.estimatedSaved), 'Rp', summary.rescuedPacks, 'pack selesai'),
      stat('Pesanan berjalan', orders.filter((order) => order.status === 'Awaiting pickup').length, '◷', 'aktif', 'menunggu pickup'),
    ];

  const recentOrders = orders.length
    ? `<div class="table-wrap"><table>
        <thead><tr><th>Pesanan</th><th>${retailer ? 'Customer' : 'Gerai'}</th><th>Produk</th><th>Total</th><th>Status</th></tr></thead>
        <tbody>${orders.slice(0, 5).map((order) => `
          <tr>
            <td>#${escapeHtml(order.id.slice(0, 8).toUpperCase())}</td>
            <td>${escapeHtml(retailer ? order.customerName : order.store)}</td>
            <td>${escapeHtml(order.productName)} · ${order.quantity} pack</td>
            <td>${formatRupiah(order.total)}</td>
            <td><span class="badge ${order.status === 'Awaiting pickup' ? 'yellow' : ''}">${escapeHtml(order.status)}</span></td>
          </tr>`).join('')}
        </tbody>
      </table></div>`
    : emptyState('▤', 'Belum ada pesanan', 'Pesanan terbaru akan muncul di sini saat transaksi pertama dibuat.');

  const action = retailer
    ? '<button class="btn primary" data-goto="products">Kelola produk</button>'
    : '<button class="btn primary" data-goto="discover">Cari makanan</button>';
  content.innerHTML = `
    ${head('RINGKASAN AKUN', `Halo, ${escapeHtml(window.currentUser.name)}`,
      retailer ? 'Ringkasan produk dan pesanan gerai.' : 'Pantau pesanan dan temukan makanan surplus.', action)}
    <section class="impact-banner ${retailer ? 'retailer-impact' : ''}">
      <img src="https://images.unsplash.com/photo-1547592180-85f173990554?auto=format&fit=crop&w=960&q=80" alt="Bahan pangan segar untuk dibagikan dan diselamatkan">
      <div class="impact-shade"></div>
      <div class="impact-copy">
        <span class="impact-tag"><b>02</b> ZERO HUNGER</span>
        <h2>${retailer ? 'Surplus hari ini, kesempatan untuk semua.' : 'Setiap pilihan baik mengurangi makanan terbuang.'}</h2>
        <p>${retailer ? `${summary.activeListings} listing aktif · ${summary.totalStock} pack tersedia` : `${summary.rescuedPacks} pack berhasil diselamatkan dari pesananmu`}</p>
      </div>
      <button class="impact-action" data-goto="${retailer ? 'products' : 'discover'}" aria-label="${retailer ? 'Kelola produk' : 'Cari makanan'}">${retailer ? 'Kelola listing' : 'Temukan surplus'} <span>↗</span></button>
    </section>
    <div class="grid stats">${stats.join('')}</div>
    ${panel(retailer ? 'Pesanan terbaru' : 'Pesanan terakhir', recentOrders, ['Lihat semua', 'orders'])}`;
}

async function renderDiscover() {
  content.innerHTML = `
    ${head('JELAJAHI / ZERO HUNGER', 'Temukan makanan surplus', 'Pilih yang kamu suka—setiap pack punya kesempatan baru untuk jadi hidangan favorit.')}
    <div class="discover-layout">
      <section class="discover-results">
        <div class="discover-tools">
          <label class="discover-search">
            <span aria-hidden="true">⌕</span>
            <input class="field search" id="foodSearch" placeholder="Cari hidangan atau gerai..." autocomplete="off">
          </label>
          <select class="field" id="categoryFilter" aria-label="Filter kategori">
            <option value="">Semua kategori</option>
            <option value="Bakery">Bakery</option>
            <option value="Meals">Meals</option>
            <option value="Produce">Produce</option>
            <option value="Other">Other</option>
          </select>
          <button class="btn" data-goto="map">⌖ Peta gerai</button>
        </div>
        <div class="discover-result-line">
          <span id="resultCount">Memuat listing...</span>
          <button class="link" data-goto="favorites">♡ Gerai favorit</button>
        </div>
        <div id="foodGrid"></div>
      </section>
      <aside class="discover-aside">
        <section class="rescue-card">
          <div class="rescue-card-image" role="img" aria-label="Bahan pangan segar"></div>
          <span class="rescue-sticker" aria-hidden="true">🍅</span>
          <div class="rescue-card-body">
            <span class="impact-tag"><b>02</b> ZERO HUNGER</span>
            <h2>Psst... ada makanan enak yang cari rumah baru!</h2>
            <p>Ambil satu pack, bikin waktu makan makin seru, dan bantu kurangi pangan terbuang.</p>
            <div class="rescue-metrics">
              <div><b id="availablePacks">0</b><span>pack tersedia</span></div>
              <div><b id="availableStores">0</b><span>gerai aktif</span></div>
            </div>
          </div>
        </section>
        <button class="discover-favorite-link" data-goto="favorites">
          <span class="favorite-spark">♡</span>
          <span><b>Koleksi gerai favorit</b><small>Simpan gerai yang ingin kamu dukung lagi</small></span>
          <span aria-hidden="true">↗</span>
        </button>
        <div class="discover-note"><span>🌱</span><p>Misi kecil hari ini: satu pack terselamatkan, satu alasan ekstra buat bilang “nyam”!</p></div>
      </aside>
    </div>`;

  await loadProducts();
  document.getElementById('availablePacks').textContent = apiProducts.reduce((total, product) => total + product.quantity, 0);
  document.getElementById('availableStores').textContent = new Set(apiProducts.map((product) => product.storeId)).size;
}

async function renderMap() {
  const [stores, favorites] = await Promise.all([
    platifulApi.request('/api/stores'),
    platifulApi.request('/api/favorites'),
  ]);
  const favoriteIds = new Set(favorites.map((store) => store.id));
  const storeList = stores.map((store) => `
    <article class="store-row">
      <div>
        <h3>${escapeHtml(store.name)}</h3>
        <p>${escapeHtml(store.address)}</p>
        ${store.openTime && store.closeTime ? `<small>Jam operasional ${escapeHtml(store.openTime)}–${escapeHtml(store.closeTime)}</small><br>` : ''}
        <small>${store.productCount} listing tersedia</small>
      </div>
      <div class="store-actions">
        ${favoriteButton(store.id, favoriteIds.has(store.id))}
        ${store.latitude != null ? `<button class="link" data-focus-store="${escapeHtml(store.id)}">Tampilkan peta</button>` : '<span class="muted">Belum ada titik lokasi</span>'}
      </div>
    </article>`).join('');

  content.innerHTML = `
    ${head('JELAJAHI / PETA', 'Peta gerai', 'Cari gerai berdasarkan lokasi yang dibagikan oleh retailer.')}
    <section class="panel">
      <div class="map-toolbar">
        <label for="mapSearch">Cari area</label>
        <input class="field" id="mapSearch" placeholder="Nama gerai atau alamat">
        <button class="btn" id="locateMe" type="button">⌖ Lokasi saya</button>
      </div>
      <div id="storeMap" class="store-map" aria-label="Peta gerai di OpenStreetMap"></div>
      <p class="muted map-note">Peta menggunakan OpenStreetMap. Hanya gerai yang telah mengisi koordinat yang ditampilkan sebagai pin.</p>
    </section>
    ${panel('Gerai', `<div id="storeList">${storeList || emptyState('⌖', 'Belum ada gerai di peta', 'Gerai akan muncul setelah retailer mengisi lokasi dan menerbitkan produk.')}</div>`)}
  `;

  initializeStoreMap(stores, favoriteIds);
}

async function renderFavorites() {
  const stores = await platifulApi.request('/api/favorites');
  const rows = stores.map((store) => `
    <article class="store-row">
      <div>
        <h3>${escapeHtml(store.name)}</h3>
        <p>${escapeHtml(store.address || 'Alamat belum tersedia')}</p>
        ${store.openTime && store.closeTime ? `<small>Jam operasional ${escapeHtml(store.openTime)}–${escapeHtml(store.closeTime)}</small>` : ''}
      </div>
      <div class="store-actions">
        ${store.latitude != null ? `<button class="link" data-goto="map">Tampilkan peta</button>` : ''}
        ${favoriteButton(store.id, true)}
      </div>
    </article>`).join('');

  content.innerHTML = `
    ${head('KOLEKSI', 'Gerai favorit', 'Daftar gerai yang kamu simpan.')}
    ${panel('Favorit saya', rows || emptyState('♡', 'Belum ada gerai tersimpan', 'Simpan gerai yang ingin kamu kunjungi dari halaman peta.', '<button class="btn primary" data-goto="map">Jelajahi gerai</button>'))}
  `;
}

async function renderAccount() {
  const account = await platifulApi.request('/api/account');
  content.innerHTML = `
    ${head('AKUN', 'Pengaturan akun', 'Perbarui profil atau ganti password akunmu.')}
    <div class="grid two-col">
      ${panel('Profil', `
        <form id="accountForm" class="account-form">
          <div class="form-field"><label>Nama</label><input class="field" name="name" required minlength="2" value="${escapeHtml(account.name)}"></div>
          <div class="form-field"><label>Email</label><input class="field" value="${escapeHtml(account.email)}" disabled></div>
          <div class="form-field"><label>Telepon</label><input class="field" name="phone" value="${escapeHtml(account.phone)}"></div>
          <button class="btn primary">Simpan profil</button><div class="auth-error" role="alert"></div>
        </form>`)}
      ${panel('Ganti password', `
        <form id="passwordForm" class="account-form">
          <div class="form-field"><label>Password saat ini</label><input class="field" name="currentPassword" type="password" required autocomplete="current-password"></div>
          <div class="form-field"><label>Password baru</label><input class="field" name="newPassword" type="password" required minlength="8" autocomplete="new-password"></div>
          <button class="btn primary">Ganti password</button><div class="auth-error" role="alert"></div>
        </form>`)}
    </div>`;
}

async function renderReports() {
  const reports = await platifulApi.request('/api/reports');
  window.currentProductReports = reports;
  const canManageOwnReports = window.currentUser.role === 'customer';
  const rows = reports.map((report) => `
    <article class="store-row" data-report-card="${escapeHtml(report.id)}">
      <div>
        <h3>${escapeHtml(report.productName)}</h3>
        <p>${escapeHtml(report.reason)}${report.details ? ` · ${escapeHtml(report.details)}` : ''}</p>
        <small>${new Date(report.createdAt).toLocaleString('id-ID')}</small>
      </div>
      <div class="store-actions">
        <span class="badge ${report.status === 'Open' ? 'yellow' : ''}">${escapeHtml(report.status)}</span>
        ${canManageOwnReports && report.status === 'Open'
          ? `<button class="link" data-edit-own-report="${escapeHtml(report.id)}">Ubah</button><button class="link" data-delete-own-report="${escapeHtml(report.id)}">Hapus</button>`
          : ''}
      </div>
    </article>`).join('');
  content.innerHTML = `
    ${head('KEAMANAN', window.currentUser.role === 'retailer' ? 'Laporan gerai' : 'Laporan saya', 'Pantau laporan produk yang dikirim atau berkaitan dengan gerai.')}
    ${panel('Laporan produk', rows || emptyState('⚑', 'Belum ada laporan', 'Laporan listing yang kamu kirim akan tercatat di sini.'))}`;
}

async function renderPublishedArticles() {
  const articles = await platifulApi.request('/api/articles');
  const cards = articles.map((article) => `
    <article class="food-card article-card">
      <div class="food-info">
        <span class="badge">Edukasi</span>
        <h3>${escapeHtml(article.title)}</h3>
        <p>${escapeHtml(article.content)}</p>
      </div>
    </article>`).join('');
  content.innerHTML = `
    ${head('BELAJAR', 'Artikel edukasi', 'Panduan untuk mengurangi limbah makanan dan menggunakan platform.')}
    <div class="grid cards">${cards || emptyState('✳', 'Artikel segera hadir', 'Panduan seputar penyelamatan pangan akan tersedia di sini.')}</div>`;
}

function favoriteButton(storeId, isFavorite) {
  return `<button class="btn sm ${isFavorite ? 'danger' : ''}" data-favorite-store="${escapeHtml(storeId)}" data-favorite="${isFavorite}">${isFavorite ? '♥ Hapus favorit' : '♡ Simpan favorit'}</button>`;
}

function initializeStoreMap(stores, favoriteIds) {
  const mapElement = document.getElementById('storeMap');
  if (!window.L || !mapElement) {
    mapElement.textContent = 'Peta gagal dimuat. Periksa koneksi internet lalu muat ulang halaman.';
    return;
  }

  const locatedStores = stores.filter((store) => store.latitude != null && store.longitude != null);
  const center = locatedStores.length
    ? [locatedStores[0].latitude, locatedStores[0].longitude]
    : [-2.5, 118];
  const map = window.L.map(mapElement).setView(center, locatedStores.length ? 12 : 5);
  window.currentStoreMap = map;
  window.storeMarkers = new Map();

  window.L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
    maxZoom: 19,
    attribution: '&copy; OpenStreetMap contributors',
  }).addTo(map);

  const markerRecords = [];
  locatedStores.forEach((store) => {
    const marker = window.L.marker([store.latitude, store.longitude])
      .bindPopup(`<b>${escapeHtml(store.name)}</b><br>${escapeHtml(store.address)}${store.openTime && store.closeTime ? `<br>Jam operasional ${escapeHtml(store.openTime)}–${escapeHtml(store.closeTime)}` : ''}<br>${store.productCount} listing tersedia`)
      .addTo(map);
    window.storeMarkers.set(store.id, marker);
    markerRecords.push({ store, marker });
  });

  document.getElementById('mapSearch').addEventListener('input', (event) => {
    const query = event.target.value.trim().toLowerCase();
    document.querySelectorAll('.store-row').forEach((row) => {
      row.hidden = !row.textContent.toLowerCase().includes(query);
    });
    markerRecords.forEach(({ store, marker }) => {
      const matches = `${store.name} ${store.address}`.toLowerCase().includes(query);
      if (matches && !map.hasLayer(marker)) marker.addTo(map);
      if (!matches && map.hasLayer(marker)) map.removeLayer(marker);
    });
  });

  let userMarker;
  document.getElementById('locateMe').addEventListener('click', () => {
    if (!navigator.geolocation) {
      toast('Browser ini tidak mendukung akses lokasi.');
      return;
    }
    navigator.geolocation.getCurrentPosition(
      ({ coords }) => {
        const location = [coords.latitude, coords.longitude];
        map.setView(location, 14);
        if (userMarker) userMarker.setLatLng(location);
        else userMarker = window.L.circleMarker(location, { radius: 8, color: '#ffffff', weight: 3, fillColor: '#087f70', fillOpacity: 1 }).addTo(map);
        userMarker.bindPopup('Lokasi perangkat ini').openPopup();
      },
      () => toast('Lokasi tidak tersedia atau izin lokasi ditolak.'),
      { enableHighAccuracy: true, timeout: 10000 },
    );
  });
}

function productForm(product = null) {
  const editing = Boolean(product);
  return `
    <section class="panel workflow-form">
      <div class="panel-head">
        <h2>${editing ? 'Ubah listing' : 'Tambah produk surplus'}</h2>
        <button class="link" type="button" data-close-form>Tutup ×</button>
      </div>
      <form id="productForm" data-product-id="${editing ? escapeHtml(product.id) : ''}">
        <div class="form-grid">
          <div class="form-field">
            <label>Nama produk</label>
            <input class="field" name="name" required value="${editing ? escapeHtml(product.name) : ''}">
          </div>
          <div class="form-field">
            <label>Kategori</label>
            <select class="field" name="category">
              ${['Bakery', 'Meals', 'Produce', 'Other'].map((category) => `
                <option ${product?.category === category ? 'selected' : ''}>${category}</option>`).join('')}
            </select>
          </div>
          <div class="form-field">
            <label>Harga promo (Rp)</label>
            <input class="field" name="price" type="number" min="1" required value="${editing ? product.price : ''}">
          </div>
          <div class="form-field">
            <label>Harga normal (Rp)</label>
            <input class="field" name="originalPrice" type="number" min="1" required value="${editing ? product.originalPrice : ''}">
          </div>
          <div class="form-field">
            <label>Stok pack</label>
            <input class="field" name="quantity" type="number" min="0" required value="${editing ? product.quantity : 1}">
          </div>
        </div>
        <button class="btn primary" type="submit">${editing ? 'Simpan perubahan' : 'Terbitkan listing'}</button>
        <div class="auth-error" role="alert"></div>
      </form>
    </section>`;
}

async function renderProducts() {
  const products = await platifulApi.request('/api/products');
  apiProducts = products;

  const rows = products.length
    ? products.map((product) => `
      <tr>
        <td><b>${escapeHtml(product.name)}</b><small class="muted">${escapeHtml(product.store)}</small></td>
        <td>${escapeHtml(product.category)}</td>
        <td>${product.quantity} pack</td>
        <td>${formatRupiah(product.price)}</td>
        <td>${formatRupiah(product.originalPrice)}</td>
        <td>
          <button class="link" data-edit-product="${escapeHtml(product.id)}">Ubah</button>
          <button class="link" data-stock-zero="${escapeHtml(product.id)}">Habis</button>
        </td>
      </tr>`).join('')
    : `<tr><td colspan="6">${emptyState('▧', 'Belum ada listing', 'Terbitkan produk surplus pertamamu untuk mulai berjualan.', '<button class="btn primary" data-add-product>Tambah produk</button>', true)}</td></tr>`;

  content.innerHTML = `
    ${head('INVENTORI GERAI', 'Produk surplus', 'Terbitkan produk dan atur stok yang tersedia.',
      '<button class="btn primary" data-add-product>+ Tambah produk</button>')}
    ${panel('Listing gerai', `<div class="table-wrap"><table>
      <thead><tr><th>Produk</th><th>Kategori</th><th>Stok</th><th>Harga promo</th><th>Harga normal</th><th>Aksi</th></tr></thead>
      <tbody>${rows}</tbody>
    </table></div>`)}
    <div id="workflowForm"></div>`;
}

async function renderOrders() {
  const orders = await platifulApi.request('/api/orders');
  const retailer = window.currentUser.role === 'retailer';
  const rows = orders.length
    ? orders.map((order) => `
      <tr>
        <td>#${escapeHtml(order.id.slice(0, 8).toUpperCase())}</td>
        <td>${escapeHtml(retailer ? order.customerName : order.store)}</td>
        <td>
          ${escapeHtml(order.productName)} · ${order.quantity} pack
          ${!retailer && ['Awaiting pickup', 'Ready for pickup'].includes(order.status)
            ? `<small class="muted">Kode pickup: <b>${escapeHtml(order.pickupCode)}</b></small>` : ''}
        </td>
        <td>${new Date(order.createdAt).toLocaleString('id-ID')}</td>
        <td>${formatRupiah(order.total)}</td>
        <td>${renderOrderAction(order, retailer)}<small class="muted">${escapeHtml(order.paymentMethod || 'Cash on pickup')} · ${escapeHtml(order.paymentStatus || 'Pay at pickup')}</small></td>
      </tr>`).join('')
    : `<tr><td colspan="6">${emptyState('▤', 'Belum ada pesanan', retailer ? 'Pesanan customer akan muncul setelah listing aktif tersedia.' : 'Temukan surplus food dari gerai di sekitarmu.', retailer ? '' : '<button class="btn primary" data-goto="discover">Cari makanan</button>', true)}</td></tr>`;

  const description = retailer
    ? 'Cocokkan kode pickup customer sebelum menyelesaikan pesanan.'
    : 'Lihat status pesanan dan kode pickup untuk ditunjukkan ke gerai.';
  const action = retailer
    ? ''
    : '<button class="btn primary" data-goto="discover">+ Cari makanan</button>';
  content.innerHTML = `
    ${head('AKTIVITAS', retailer ? 'Pesanan masuk' : 'Pesanan saya', description, action)}
    ${panel('Riwayat pesanan', `<div class="table-wrap"><table>
      <thead><tr><th>Pesanan</th><th>${retailer ? 'Customer' : 'Gerai'}</th><th>Produk</th><th>Tanggal</th><th>Total</th><th>Status / aksi</th></tr></thead>
      <tbody>${rows}</tbody>
    </table></div>`)}
  `;
}

function renderOrderAction(order, retailer) {
  if (!['Awaiting pickup', 'Ready for pickup'].includes(order.status)) {
    return `<span class="badge">${escapeHtml(order.status)}</span>`;
  }

  if (retailer) {
    return `
      <form class="pickup-form" data-order-id="${escapeHtml(order.id)}">
        <input class="field" name="pickupCode" inputmode="numeric" minlength="6" maxlength="6" placeholder="Kode pickup" required>
        <button class="btn sm primary">Selesaikan</button>
      </form>`;
  }

  return `
    <span class="badge yellow">${order.status === 'Ready for pickup' ? 'Siap diambil' : 'Menunggu pickup'}</span>
    <button class="link" data-cancel-order="${escapeHtml(order.id)}">Batalkan</button>`;
}

async function renderStore() {
  const store = await platifulApi.request('/api/store');
  content.innerHTML = `
    ${head('PENGATURAN GERAI', 'Profil gerai', 'Informasi ini tampil pada listing dan pesanan customer.')}
    ${panel('Informasi gerai', `
      <form id="storeForm">
        <div class="form-grid">
          <div class="form-field full">
            <label>Nama gerai</label>
            <input class="field" name="name" required value="${escapeHtml(store.name)}">
          </div>
          <div class="form-field full">
            <label>Alamat</label>
            <input class="field" name="address" required value="${escapeHtml(store.address)}">
          </div>
          <div class="form-field">
            <label>Jam buka</label>
            <input class="field" name="openTime" type="time" value="${escapeHtml(store.openTime || '')}">
          </div>
          <div class="form-field">
            <label>Jam tutup</label>
            <input class="field" name="closeTime" type="time" value="${escapeHtml(store.closeTime || '')}">
          </div>
          <div class="form-field">
            <label>Email akun</label>
            <input class="field" value="${escapeHtml(window.currentUser.email)}" disabled>
          </div>
          <div class="form-field">
            <label>Telepon</label>
            <input class="field" name="phone" value="${escapeHtml(store.phone)}">
          </div>
          <div class="form-field">
            <label>Latitude</label>
            <input class="field" name="latitude" type="number" min="-90" max="90" step="any" value="${store.latitude ?? ''}" placeholder="-6.200000">
          </div>
          <div class="form-field">
            <label>Longitude</label>
            <input class="field" name="longitude" type="number" min="-180" max="180" step="any" value="${store.longitude ?? ''}" placeholder="106.816666">
          </div>
          <div class="form-field full">
            <label>Deskripsi</label>
            <textarea name="description">${escapeHtml(store.description)}</textarea>
          </div>
        </div>
        <button class="btn primary">Simpan profil</button>
        <button class="btn" type="button" id="useStoreLocation">Ambil koordinat perangkat</button>
        <div class="auth-error" role="alert"></div>
      </form>`)}
  `;
}

const renderBeforeWorkflows = window.render;

window.render = (page) => {
  if (!window.currentUser) {
    renderBeforeWorkflows(page);
    return;
  }

  const allowedPages = pagesForRole(window.currentUser.role).map(([name]) => name);
  const defaultPage = window.currentUser.role === 'admin'
    ? 'admin'
    : window.currentUser.role === 'retailer' ? 'retailer' : 'dashboard';
  const selectedPage = allowedPages.includes(page) ? page : defaultPage;

  document.getElementById('app').classList.remove('auth-mode');
  updateRoleNavigation();
  renderBeforeWorkflows(selectedPage);
  renderLoadingState();

  const pageLoaders = {
    dashboard: renderDashboard,
    retailer: renderDashboard,
    admin: renderAdminDashboard,
    users: renderAdminUsers,
    moderation: renderAdminReports,
    articles: window.currentUser.role === 'admin' ? renderAdminArticles : renderPublishedArticles,
    commission: renderAdminCommission,
    discover: renderDiscover,
    map: renderMap,
    favorites: renderFavorites,
    account: renderAccount,
    reports: renderReports,
    orders: renderOrders,
    products: renderProducts,
    store: renderStore,
  };

  pageLoaders[selectedPage]().catch((error) => toast(error.message));
};

content.addEventListener('click', async (event) => {
  const editOwnReport = event.target.closest('[data-edit-own-report]');
  if (editOwnReport) {
    const report = window.currentProductReports.find((item) => item.id === editOwnReport.dataset.editOwnReport);
    const card = editOwnReport.closest('[data-report-card]');
    if (!report || !card) return;
    const reasons = ['Food safety', 'Incorrect information', 'Other'];
    card.innerHTML = `
      <form id="productReportEditForm" data-report-id="${escapeHtml(report.id)}">
        <h3>${escapeHtml(report.productName)}</h3>
        <select class="field" name="reason" required>
          ${reasons.map((reason) => `<option ${report.reason === reason ? 'selected' : ''}>${reason}</option>`).join('')}
        </select>
        <input class="field" name="details" maxlength="500" value="${escapeHtml(report.details || '')}" placeholder="Detail tambahan">
        <div class="btn-row"><button class="btn primary">Simpan</button><button class="btn" type="button" data-cancel-own-report>Batal</button></div>
      </form>`;
    return;
  }

  const deleteOwnReport = event.target.closest('[data-delete-own-report]');
  if (deleteOwnReport) {
    if (!window.confirm('Hapus laporan ini?')) return;
    try {
      await platifulApi.request(`/api/reports/${encodeURIComponent(deleteOwnReport.dataset.deleteOwnReport)}`, {
        method: 'DELETE',
      });
      await renderReports();
      toast('Laporan dihapus.');
    } catch (error) {
      toast(error.message);
    }
    return;
  }

  if (event.target.closest('[data-cancel-own-report]')) {
    await renderReports();
    return;
  }

  const suspensionButton = event.target.closest('[data-toggle-suspension]');
  if (suspensionButton) {
    await updateAdminResource(`/api/admin/users/${encodeURIComponent(suspensionButton.dataset.toggleSuspension)}`, {
      method: 'PATCH',
      body: { suspended: suspensionButton.dataset.suspended !== 'true' },
    }, renderAdminUsers, 'Status akun diperbarui.');
  }

  const reviewButton = event.target.closest('[data-review-report]');
  if (reviewButton) {
    await updateAdminResource(`/api/admin/reports/${encodeURIComponent(reviewButton.dataset.reviewReport)}`, {
      method: 'PATCH',
      body: { status: reviewButton.dataset.status },
    }, renderAdminReports, 'Status laporan diperbarui.');
  }

  const articleStatusButton = event.target.closest('[data-toggle-article]');
  if (articleStatusButton) {
    await updateAdminResource(`/api/admin/articles/${encodeURIComponent(articleStatusButton.dataset.toggleArticle)}`, {
      method: 'PATCH',
      body: { status: articleStatusButton.dataset.status },
    }, renderAdminArticles, 'Status artikel diperbarui.');
  }

  if (event.target.closest('[data-new-article]')) {
    document.getElementById('articleForm').innerHTML = `
      <section class="panel"><form id="articleFormSubmit"><div class="form-field"><label>Judul</label><input class="field" name="title" minlength="3" required></div><div class="form-field"><label>Konten</label><textarea name="content" minlength="10" required></textarea></div><div class="form-field"><label>Status</label><select class="field" name="status"><option>Draft</option><option>Published</option></select></div><button class="btn primary">Simpan artikel</button></form></section>`;
  }

  if (event.target.closest('#useStoreLocation')) {
    if (!navigator.geolocation) {
      toast('Browser ini tidak mendukung akses lokasi.');
      return;
    }
    navigator.geolocation.getCurrentPosition(({ coords }) => {
      document.querySelector('[name="latitude"]').value = coords.latitude.toFixed(6);
      document.querySelector('[name="longitude"]').value = coords.longitude.toFixed(6);
      toast('Koordinat berhasil diisi. Simpan profil gerai untuk menerapkannya.');
    }, () => toast('Lokasi tidak tersedia atau izin lokasi ditolak.'), { enableHighAccuracy: true, timeout: 10000 });
  }

  const favoriteButtonElement = event.target.closest('[data-favorite-store]');
  if (favoriteButtonElement) {
    const storeId = favoriteButtonElement.dataset.favoriteStore;
    const shouldFavorite = favoriteButtonElement.dataset.favorite !== 'true';
    try {
      await platifulApi.request(`/api/favorites/${encodeURIComponent(storeId)}`, {
        method: shouldFavorite ? 'PUT' : 'DELETE',
      });
      toast(shouldFavorite ? 'Gerai ditambahkan ke favorit.' : 'Gerai dihapus dari favorit.');
      if (current === 'favorites') await renderFavorites();
      if (current === 'map') await renderMap();
    } catch (error) {
      toast(error.message);
    }
  }

  const focusButton = event.target.closest('[data-focus-store]');
  if (focusButton) {
    const marker = window.storeMarkers?.get(focusButton.dataset.focusStore);
    if (marker) {
      window.currentStoreMap.setView(marker.getLatLng(), 15);
      marker.openPopup();
    }
  }

  if (event.target.closest('[data-add-product]')) {
    document.getElementById('workflowForm').innerHTML = productForm();
    document.getElementById('workflowForm').scrollIntoView({ behavior: 'smooth', block: 'center' });
  }

  if (event.target.closest('[data-close-form]')) {
    document.getElementById('workflowForm').innerHTML = '';
  }

  const editButton = event.target.closest('[data-edit-product]');
  if (editButton) {
    const product = apiProducts.find((item) => item.id === editButton.dataset.editProduct);
    if (product) {
      document.getElementById('workflowForm').innerHTML = productForm(product);
      document.getElementById('workflowForm').scrollIntoView({ behavior: 'smooth', block: 'center' });
    }
  }

  const soldOutButton = event.target.closest('[data-stock-zero]');
  if (soldOutButton) {
    await updateProduct(soldOutButton.dataset.stockZero, { quantity: 0 });
  }

  const cancelButton = event.target.closest('[data-cancel-order]');
  if (cancelButton) {
    await updateOrder(cancelButton.dataset.cancelOrder, { status: 'Cancelled' });
  }
});

content.addEventListener('submit', async (event) => {
  const form = event.target;
  if (form.id === 'productReportEditForm') {
    event.preventDefault();
    const values = Object.fromEntries(new FormData(form));
    try {
      await platifulApi.request(`/api/reports/${encodeURIComponent(form.dataset.reportId)}`, {
        method: 'PATCH',
        body: JSON.stringify(values),
      });
      await renderReports();
      toast('Laporan diperbarui.');
    } catch (error) {
      toast(error.message);
    }
    return;
  }

  if (['commissionForm', 'settlementForm', 'articleFormSubmit'].includes(form.id)) {
    event.preventDefault();
    const values = Object.fromEntries(new FormData(form));
    const endpoint = form.id === 'commissionForm'
      ? '/api/admin/commission'
      : form.id === 'settlementForm'
        ? '/api/admin/settlements'
        : '/api/admin/articles';
    const method = form.id === 'commissionForm' ? 'PUT' : 'POST';
    try {
      await platifulApi.request(endpoint, {
        method,
        body: JSON.stringify({
          ...values,
          ...(form.id === 'commissionForm' ? { rate: Number(values.rate) } : {}),
          ...(form.id === 'settlementForm' ? { amount: Number(values.amount) } : {}),
        }),
      });
      toast('Perubahan tersimpan.');
      if (form.id === 'commissionForm' || form.id === 'settlementForm') await renderAdminCommission();
      else await renderAdminArticles();
    } catch (error) {
      toast(error.message);
    }
    return;
  }

  if (!['productForm', 'storeForm', 'accountForm', 'passwordForm'].includes(form.id) && !form.matches('.pickup-form')) return;

  event.preventDefault();
  const submitButton = form.querySelector('button');
  submitButton.disabled = true;
  const values = Object.fromEntries(new FormData(form));

  try {
    if (form.id === 'productForm') {
      const productId = form.dataset.productId;
      const product = {
        ...values,
        price: Number(values.price),
        originalPrice: Number(values.originalPrice),
        quantity: Number(values.quantity),
      };
      const endpoint = productId
        ? `/api/products/${encodeURIComponent(productId)}`
        : '/api/products';
      await platifulApi.request(endpoint, {
        method: productId ? 'PATCH' : 'POST',
        body: JSON.stringify(product),
      });
      toast(productId ? 'Listing diperbarui.' : 'Listing diterbitkan.');
      await renderProducts();
    } else if (form.id === 'storeForm') {
      const store = await platifulApi.request('/api/store', {
        method: 'PUT',
        body: JSON.stringify({
          ...values,
          latitude: values.latitude === '' ? null : Number(values.latitude),
          longitude: values.longitude === '' ? null : Number(values.longitude),
        }),
      });
      window.currentUser.store = store;
      updateRoleNavigation();
      await renderStore();
      toast('Profil gerai tersimpan.');
    } else if (form.id === 'accountForm') {
      const account = await platifulApi.request('/api/account', {
        method: 'PUT',
        body: JSON.stringify(values),
      });
      window.currentUser.name = account.name;
      updateRoleNavigation();
      await renderAccount();
      toast('Profil akun tersimpan.');
    } else if (form.id === 'passwordForm') {
      await platifulApi.request('/api/account/password', {
        method: 'PUT',
        body: JSON.stringify(values),
      });
      await renderAccount();
      toast('Password berhasil diganti.');
    } else {
      await updateOrder(form.dataset.orderId, {
        status: 'Completed',
        pickupCode: values.pickupCode,
      });
    }
  } catch (error) {
    const errorBox = form.querySelector('.auth-error');
    if (errorBox) errorBox.textContent = error.message;
    else toast(error.message);
    submitButton.disabled = false;
  }
});

async function updateProduct(productId, changes) {
  try {
    await platifulApi.request(`/api/products/${encodeURIComponent(productId)}`, {
      method: 'PATCH',
      body: JSON.stringify(changes),
    });
    await renderProducts();
    toast(changes.quantity === 0 ? 'Listing ditandai habis.' : 'Listing diperbarui.');
  } catch (error) {
    toast(error.message);
  }
}

async function updateOrder(orderId, changes) {
  try {
    await platifulApi.request(`/api/orders/${encodeURIComponent(orderId)}`, {
      method: 'PATCH',
      body: JSON.stringify(changes),
    });
    await renderOrders();
    toast(changes.status === 'Completed'
      ? 'Pickup tervalidasi dan pesanan selesai.'
      : 'Pesanan dibatalkan dan stok dikembalikan.');
  } catch (error) {
    toast(error.message);
  }
}

async function renderAdminDashboard() {
  const summary = await platifulApi.request('/api/admin/summary');
  content.innerHTML = `
    ${head('PLATFORM MANAGEMENT', 'Ringkasan platform', 'Pantau akun, aktivitas pesanan, dan laporan produk.')}
    <div class="grid stats">
      ${stat('Total akun', summary.userCount, '♙', summary.customerCount, 'customer')}
      ${stat('Retailer', summary.retailerCount, '⌂', 'terdaftar', 'akun gerai')}
      ${stat('Laporan terbuka', summary.openReports, '⚑', 'perlu review', 'laporan produk')}
      ${stat('Penjualan selesai', formatRupiah(summary.grossSales), 'Rp', summary.orderCount, 'total pesanan')}
    </div>
    <div class="grid two-col">
      ${panel('Moderasi', '<p>Periksa laporan produk dan ubah status review.</p>', ['Buka laporan', 'moderation'])}
      ${panel('Pengguna', '<p>Lihat akun customer/retailer dan suspend akun bila diperlukan.</p>', ['Kelola pengguna', 'users'])}
      ${panel('Artikel', '<p>Terbitkan panduan edukasi atau simpan draft.</p>', ['Kelola artikel', 'articles'])}
      ${panel('Komisi', '<p>Atur persentase dan catat settlement manual.</p>', ['Kelola komisi', 'commission'])}
    </div>`;
}

async function renderAdminUsers() {
  const users = await platifulApi.request('/api/admin/users');
  const rows = users.map((account) => `
    <tr>
      <td><b>${escapeHtml(account.name)}</b><small class="muted">${escapeHtml(account.email)}</small></td>
      <td>${escapeHtml(account.role)}</td>
      <td>${escapeHtml(account.storeName || '-')}</td>
      <td><span class="badge ${account.suspended ? 'red' : ''}">${account.suspended ? 'Suspended' : 'Active'}</span></td>
      <td>${account.role === 'admin' ? '-' : `<button class="btn sm ${account.suspended ? '' : 'danger'}" data-toggle-suspension="${escapeHtml(account.id)}" data-suspended="${account.suspended}">${account.suspended ? 'Aktifkan' : 'Suspend'}</button>`}</td>
    </tr>`).join('');
  content.innerHTML = `
    ${head('ADMIN / ACCOUNTS', 'Pengguna', 'Tinjau akun customer dan retailer.')}
    ${panel('Semua akun', `<div class="table-wrap"><table><thead><tr><th>Akun</th><th>Role</th><th>Gerai</th><th>Status</th><th>Aksi</th></tr></thead><tbody>${rows}</tbody></table></div>`)}`;
}

async function renderAdminReports() {
  const reports = await platifulApi.request('/api/admin/reports');
  const rows = reports.map((report) => `
    <article class="store-row">
      <div><h3>${escapeHtml(report.productName)}</h3><p>${escapeHtml(report.reason)} · ${escapeHtml(report.details || 'Tanpa keterangan')}</p><small>${new Date(report.createdAt).toLocaleString('id-ID')}</small></div>
      <div class="store-actions"><span class="badge ${report.status === 'Open' ? 'yellow' : ''}">${escapeHtml(report.status)}</span>${report.status === 'Open' ? `<button class="btn sm primary" data-review-report="${escapeHtml(report.id)}" data-status="Resolved">Selesaikan</button><button class="btn sm" data-review-report="${escapeHtml(report.id)}" data-status="Dismissed">Tutup</button>` : ''}</div>
    </article>`).join('');
  content.innerHTML = `
    ${head('ADMIN / TRUST', 'Moderasi laporan', 'Tinjau laporan keamanan dan ketepatan listing.')}
    ${panel('Antrean laporan', rows || emptyState('⚑', 'Antrean bersih', 'Laporan baru akan muncul di sini untuk ditinjau.'))}`;
}

async function renderAdminArticles() {
  const articles = await platifulApi.request('/api/admin/articles');
  const rows = articles.map((article) => `
    <article class="store-row"><div><h3>${escapeHtml(article.title)}</h3><p>${escapeHtml(article.content)}</p></div><div class="store-actions"><span class="badge ${article.status === 'Draft' ? 'yellow' : ''}">${escapeHtml(article.status)}</span><button class="link" data-toggle-article="${escapeHtml(article.id)}" data-status="${article.status === 'Draft' ? 'Published' : 'Draft'}">${article.status === 'Draft' ? 'Terbitkan' : 'Jadikan draft'}</button></div></article>`).join('');
  content.innerHTML = `
    ${head('ADMIN / EDUCATION', 'Artikel edukasi', 'Tulis dan terbitkan konten edukasi.', '<button class="btn primary" data-new-article>+ Artikel baru</button>')}
    <div id="articleForm"></div>
    ${panel('Semua artikel', rows || emptyState('✳', 'Belum ada artikel', 'Mulai dengan menulis artikel edukasi pertama.', '<button class="btn primary" data-new-article>+ Artikel baru</button>'))}`;
}

async function renderAdminCommission() {
  const [settings, settlements, users] = await Promise.all([
    platifulApi.request('/api/admin/commission'),
    platifulApi.request('/api/admin/settlements'),
    platifulApi.request('/api/admin/users'),
  ]);
  const retailers = users.filter((account) => account.role === 'retailer');
  const rows = settlements.map((item) => `
    <tr><td>${escapeHtml(item.retailerName)}</td><td>${formatRupiah(item.amount)}</td><td>${escapeHtml(item.reference)}</td><td>${new Date(item.createdAt).toLocaleString('id-ID')}</td></tr>`).join('');
  content.innerHTML = `
    ${head('ADMIN / FINANCE', 'Komisi & settlement', 'Atur tarif komisi dan catat transfer settlement secara manual.')}
    <div class="grid two-col">
      ${panel('Tarif komisi', `<form id="commissionForm"><div class="form-field"><label>Persentase (%)</label><input class="field" name="rate" type="number" min="0" max="100" step="0.1" required value="${settings.rate}"></div><button class="btn primary">Simpan tarif</button></form>`)}
      ${panel('Catat settlement', `<form id="settlementForm"><div class="form-field"><label>Retailer</label><select class="field" name="retailerId" required>${retailers.map((retailer) => `<option value="${escapeHtml(retailer.id)}">${escapeHtml(retailer.storeName || retailer.name)}</option>`).join('')}</select></div><div class="form-field"><label>Jumlah (Rp)</label><input class="field" name="amount" type="number" min="1" required></div><div class="form-field"><label>Referensi transfer</label><input class="field" name="reference" required></div><button class="btn primary">Catat settlement</button></form>`) }
    </div>
    ${panel('Riwayat settlement', rows ? `<div class="table-wrap"><table><thead><tr><th>Retailer</th><th>Jumlah</th><th>Referensi</th><th>Tanggal</th></tr></thead><tbody>${rows}</tbody></table></div>` : emptyState('↗', 'Belum ada settlement', 'Settlement yang dicatat akan muncul dalam riwayat ini.'))}`;
}

async function updateAdminResource(endpoint, options, refresh, successMessage) {
  try {
    await platifulApi.request(endpoint, {
      method: options.method,
      body: JSON.stringify(options.body),
    });
    await refresh();
    toast(successMessage);
  } catch (error) {
    toast(error.message);
  }
}