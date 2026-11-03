// Tambahan UI untuk PBI 01,02,03,05,06,07,08,12,13,15,18,19,20,21 (tanpa mengubah tampilan lama)
(() => {
  const $ = (s, r = document) => r.querySelector(s);
  const esc = (v) => String(v ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const api = (p, method, body) => platifulApi.request(p, { method: method || 'GET', ...(body ? { body: JSON.stringify(body) } : {}) });
  const fd = (f) => Object.fromEntries(new FormData(f).entries());
  const role = () => window.currentUser?.role;
  const fail = (e) => toast(e.message || 'Terjadi kesalahan.');
  const field = (l, n, t = 'text', v = '', x = '') => `<div class="form-field"><label>${l}</label><input class="field" name="${n}" type="${t}" value="${esc(v)}" ${x}></div>`;
  const btn = (l, a, v, c = '') => `<button class="btn ${c}" type="button" data-x="${a}" data-v="${esc(v)}">${l}</button>`;
  const parseSchedule = (value) => {
    let schedule;
    try {
      schedule = JSON.parse(value || '[]');
    } catch {
      throw new Error('Jadwal diskon harus JSON yang valid, contoh: [{"time":"18:00","price":8000}].');
    }
    if (!Array.isArray(schedule)) throw new Error('Jadwal diskon harus berupa daftar yang valid.');
    return schedule;
  };
  const isPickupWindowOver = (order, products) => {
    const product = products.find((item) => item.id === order.productId);
    const endTime = String(order.pickupEnd || product?.pickupEnd || '');
    const match = /^([01]\d|2[0-3]):([0-5]\d)$/.exec(endTime);
    const createdAt = new Date(order.createdAt);
    if (!match || Number.isNaN(createdAt.getTime())) return false;
    const dateKey = (date) => `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
    const orderDate = dateKey(createdAt);
    const today = dateKey(new Date());
    if (orderDate < today) return true;
    if (orderDate > today) return false;
    const endMinute = Number(match[1]) * 60 + Number(match[2]);
    const currentTime = new Date();
    return currentTime.getHours() * 60 + currentTime.getMinutes() > endMinute;
  };

  const NAV = { all: [['notifications', 'Notifikasi']], retailer: [['verification', 'Verifikasi usaha'], ['templates', 'Template produk'], ['actions', 'Tindakan gerai'], ['reportuser', 'Lapor pengguna'], ['myreports', 'Laporan periode']],
    admin: [['verifs', 'Verifikasi retailer'], ['categories', 'Kategori'], ['announce', 'Pengumuman'], ['admins', 'Kelola admin'], ['commissions', 'Komisi per pesanan']],
    customer: [['filter', 'Filter produk'], ['myreviews', 'Ulasan saya'], ['reportuser', 'Lapor pengguna']] };
  const LABEL = Object.fromEntries(Object.values(NAV).flat());
  const mine = () => [...NAV.all, ...(NAV[role()] || [])];

  const pages = {
    async notifications() {
      const [n, a] = await Promise.all([api('/api/notifications'), api('/api/announcements')]);
      return head('AKTIVITAS', 'Notifikasi', 'Pemberitahuan dan pengumuman platform.') + panel('Pengumuman', a.map((x) => `<div class="activity"><b>${esc(x.title)}</b><p>${esc(x.body)}</p></div>`).join('') || emptyState('✦', 'Belum ada pengumuman', 'Pengumuman admin akan tampil di sini.', '', true))
        + panel('Notifikasi', n.map((x) => `<div class="activity"><span class="badge ${x.read ? '' : 'yellow'}">${x.read ? 'Dibaca' : 'Baru'}</span> ${esc(x.message)} <div class="btn-row">${x.read ? '' : btn('Tandai dibaca', 'nread', x.id)}${btn('Hapus', 'ndel', x.id)}</div></div>`).join('') || emptyState('✦', 'Belum ada notifikasi', 'Notifikasi baru akan muncul di sini.', '', true));
    },
    async verification() {
      const v = await api('/api/verification');
      return head('VERIFIKASI', 'Verifikasi usaha', 'Retailer harus terverifikasi sebelum memposting produk.') + panel('Status', `<p>Status: <span class="badge ${v.status === 'approved' ? '' : 'yellow'}">${esc(v.status)}</span> ${esc(v.reason || '')}</p>
        <form id="xverify"><div class="form-field"><label>Bukti usaha (NIB / tautan foto izin)</label><textarea class="field" name="proof" required>${esc(v.proof || '')}</textarea></div><button class="btn primary" type="submit">Ajukan verifikasi</button></form>`);
    },
    async verifs() {
      const l = await api('/api/admin/verifications');
      return head('ADMIN', 'Verifikasi retailer', 'Setujui, tolak, atau cabut verifikasi.') + panel('Pengajuan', l.map((x) => `<div class="activity"><b>${esc(x.name)}</b> <span class="badge yellow">${esc(x.status)}</span><p>${esc(x.proof)}</p><input class="field" id="r-${x.id}" placeholder="Alasan (wajib untuk tolak/cabut)"><div class="btn-row">${btn('Setujui', 'vapprove', x.id, 'primary')}${btn('Tolak', 'vreject', x.id)}${btn('Cabut', 'vrevoke', x.id)}</div></div>`).join('') || emptyState('✦', 'Belum ada pengajuan', 'Pengajuan retailer akan tampil di sini.', '', true));
    },
    async templates() {
      const l = await api('/api/templates');
      return head('PRODUK', 'Template produk', 'Simpan template dari form produk, pakai ulang di sini.') + panel('Template', l.map((t) => `<div class="activity"><b>${esc(t.name)}</b> · ${esc(t.category)} · Rp ${esc(t.price)}<div class="btn-row">${btn('Pakai (posting)', 'tuse', t.id, 'primary')}${btn('Hapus', 'tdel', t.id)}</div></div>`).join('') || emptyState('✦', 'Belum ada template', 'Gunakan tombol "Simpan sebagai template" di form produk.', '', true));
    },
    async actions() {
      const [o, p] = await Promise.all([api('/api/orders'), api('/api/products')]);
      return head('GERAI', 'Tindakan gerai', 'Penandaan siap diambil, no-show, dan kelola produk.')
        + panel('Pesanan aktif', o.filter((x) => ['Awaiting pickup', 'Ready for pickup'].includes(x.status)).map((x) => `<div class="activity">#${esc(x.id.slice(0, 8))} · ${esc(x.productName || x.product || '')} · <span class="badge yellow">${esc(x.status)}</span><div class="btn-row">${x.status === 'Awaiting pickup' ? btn('Siap diambil', 'oready', x.id) : '<span class="muted">Sudah siap diambil</span>'}${isPickupWindowOver(x, p) ? btn('Tandai no-show', 'onoshow', x.id) : '<button class="btn" type="button" disabled title="Tersedia setelah waktu pengambilan berakhir">Tandai no-show</button>'}</div></div>`).join('') || emptyState('▤', 'Tidak ada pesanan aktif', '', '', true))
        + panel('Kelola produk', p.map((x) => `<div class="activity"><b>${esc(x.name)}</b> · stok ${esc(x.quantity)} ${esc(x.status || '')}<div class="btn-row">${btn('Nonaktifkan', 'poff', x.id)}${btn('Hapus', 'pdel', x.id)}</div></div>`).join('') || emptyState('▤', 'Belum ada produk', '', '', true));
    },
    async categories() {
      const l = await api('/api/categories');
      return head('ADMIN', 'Kategori produk', 'Kelola kategori yang dipakai retailer.') + panel('Kategori', `<form id="xcat" class="btn-row">${field('Kategori baru', 'name', 'text', '', 'required')}<button class="btn primary" type="submit">Tambah</button></form>` + l.map((c) => `<div class="activity">${esc(c.name)} <div class="btn-row">${btn('Ubah', 'cren', c.id)}${btn('Hapus', 'cdel', c.id)}</div></div>`).join(''));
    },
    async announce() {
      const l = await api('/api/announcements');
      return head('ADMIN', 'Pengumuman', 'Kirim pengumuman ke semua pengguna.', '<a class="btn" href="/api/admin/export.csv">Ekspor statistik CSV</a>') + panel('Buat pengumuman', `<form id="xann">${field('Judul', 'title', 'text', '', 'required maxlength=120')}<div class="form-field"><label>Isi</label><textarea class="field" name="body" required maxlength="2000"></textarea></div><button class="btn primary" type="submit">Kirim</button></form>`)
        + panel('Riwayat', l.map((a) => `<div class="activity" data-announcement="${esc(a.id)}"><div><b>${esc(a.title)}</b><p>${esc(a.body)}</p></div><div class="btn-row">${btn('Ubah', 'aedit', a.id)}${btn('Hapus', 'adel', a.id)}</div></div>`).join('') || emptyState('✦', 'Belum ada pengumuman', 'Pengumuman yang dibuat admin akan tampil di sini.', '', true));
    },
    async admins() {
      const f = window.xRole || '';
      const st = window.xStatus || ''; const u = (await api('/api/admin/users')).filter((x) => (!f || x.role === f) && (!st || (st === 'suspended') === Boolean(x.suspended)));
      return head('ADMIN', 'Kelola akun', 'Tambah admin, filter pengguna, hapus akun.') + panel('Tambah admin', `<form id="xadmin">${field('Nama', 'name')}${field('Email', 'email', 'email', '', 'required')}${field('Password (min 8)', 'password', 'password', '', 'required minlength=8')}<button class="btn primary" type="submit">Tambah</button></form>`)
        + panel('Pengguna', `<select class="field" id="xrole"><option value="">Semua peran</option>${['customer', 'retailer', 'admin'].map((r) => `<option ${f === r ? 'selected' : ''}>${r}</option>`).join('')}</select> <select class="field" id="xstatus"><option value="">Semua status</option><option value="active" ${st === 'active' ? 'selected' : ''}>Aktif</option><option value="suspended" ${st === 'suspended' ? 'selected' : ''}>Suspended</option></select>` + u.map((x) => `<div class="activity">${esc(x.name)} · ${esc(x.role)} ${x.suspended ? '<span class="badge yellow">suspended</span>' : ''}${btn('Hapus', 'udel', x.id)}</div>`).join(''));
    },
    async filter() {
      const s = await api('/api/filters'); const c = await api('/api/categories'); window.xFilter = s;
      return head('PENCARIAN', 'Filter produk', 'Filter jarak, kategori, harga, halal, dan waktu tutup.') + panel('Filter', `<form id="xfilter">${field('Cari', 'search', 'text', s.search || '')}<div class="form-field"><label>Kategori</label><select class="field" name="category"><option value="">Semua</option>${c.map((k) => `<option ${s.category === k.name ? 'selected' : ''}>${esc(k.name)}</option>`).join('')}</select></div>${field('Harga maks (Rp)', 'maxPrice', 'number', s.maxPrice || '')}${field('Jarak maks (km)', 'radius', 'number', s.radius || '')}<label><input type="checkbox" name="halal" value="1" ${s.halal ? 'checked' : ''}> Halal</label> <label><input type="checkbox" name="closingSoon" value="1" ${s.closingSoon ? 'checked' : ''}> Tutup ≤ 1 jam</label><div class="btn-row"><button class="btn primary" type="submit">Terapkan</button>${btn('Simpan filter', 'fsave', '')}</div></form><div id="xres"></div>`);
    },
    async myreviews() {
      const [o, r] = await Promise.all([api('/api/orders'), api('/api/reviews?mine=1')]);
      window.currentReviews = r;
      const done = o.filter((x) => x.status === 'Completed');
      return head('ULASAN', 'Ulasan saya', 'Beri rating untuk pesanan yang sudah selesai.') + panel('Pesanan selesai', done.map((order) => {
        const review = r.find((item) => item.orderId === order.id);
        return `<div class="activity" data-review-card="${esc(review?.id || '')}">
          <div>#${esc(order.id.slice(0, 8))} · ${esc(order.store)}
            ${review
              ? `<p>${'★'.repeat(review.rating)} ${esc(review.comment)}</p><div class="btn-row">${btn('Ubah', 'rvedit', review.id)}${btn('Hapus', 'rvdelete', review.id)}</div>`
              : `<form class="xrev" data-id="${esc(order.id)}"><select class="field" name="rating" required>${[5, 4, 3, 2, 1].map((rating) => `<option>${rating}</option>`).join('')}</select><input class="field" name="comment" maxlength="500" placeholder="Komentar (maks. 500 karakter)"><button class="btn primary" type="submit">Kirim</button></form>`}
          </div>
        </div>`;
      }).join('') || emptyState('★', 'Belum ada pesanan selesai', '', '', true));
    },
  };

  Object.assign(pages, {
    async reportuser() {
      const [t, r] = await Promise.all([api('/api/report-targets'), api('/api/my-reports')]);
      window.currentUserReports = r;
      return head('LAPORAN', 'Lapor pengguna', 'Laporkan pengguna bermasalah ke admin.') + panel('Buat laporan', `<form id="xreport"><div class="form-field"><label>Pengguna</label><select class="field" name="targetUserId" required>${t.map((u) => `<option value="${esc(u.id)}">${esc(u.name)} (${esc(u.role)})</option>`).join('')}</select></div>${field('Alasan', 'reason', 'text', '', 'required maxlength=200')}<div class="form-field"><label>Detail</label><textarea class="field" name="details" maxlength="1000"></textarea></div><button class="btn primary" type="submit">Kirim laporan</button></form>`)
        + panel('Laporan saya', r.map((report) => `<div class="activity" data-user-report="${esc(report.id)}"><div><b>${esc(report.productName)}</b><p>${esc(report.reason)} · ${esc(report.details || 'Tanpa detail')}</p><span class="badge yellow">${esc(report.status)}</span></div>${report.status === 'Open' ? `<div class="btn-row">${btn('Ubah', 'redit', report.id)}${btn('Hapus', 'rdel', report.id)}</div>` : ''}</div>`).join('') || emptyState('⚑', 'Belum ada laporan', 'Laporanmu akan tampil di sini.', '', true));
    },
    async myreports() {
      const l = await api('/api/retailer/reports');
      const currentDate = new Date();
      const currentPeriod = `${currentDate.getFullYear()}-${String(currentDate.getMonth() + 1).padStart(2, '0')}`;
      return head('GERAI', 'Laporan periode', 'Simpan ringkasan penjualan per bulan.') + panel('Buat laporan', `<form id="xperiod" class="btn-row">${field('Periode', 'period', 'month', currentPeriod, 'required')}<button class="btn primary" type="submit">Simpan laporan</button></form>`)
        + panel('Riwayat laporan', l.map((report) => `<div class="activity"><div><b>${esc(report.period)}</b><p>Pesanan ${esc(report.orders)} · selesai ${esc(report.completed)} · listing aktif ${esc(report.activeListings)} · stok saat laporan ${esc(report.totalStock)} pack</p><p>Pendapatan Rp ${Number(report.revenue || 0).toLocaleString('id-ID')} · ${esc(report.packsSaved)} pack terselamatkan</p><small>${new Date(report.createdAt).toLocaleString('id-ID')}</small></div></div>`).join('') || emptyState('▤', 'Belum ada laporan', '', '', true));
    },
    async commissions() {
      const d = await api('/api/admin/commissions');
      return head('ADMIN', 'Komisi per pesanan', 'Komisi dari pesanan yang sudah selesai.') + panel(`Total komisi Rp ${esc(d.totalCommission)} (tarif ${esc(d.rate)}%)`, d.rows.map((x) => `<div class="activity">#${esc(x.id.slice(0, 8))} · ${esc(x.store)} · ${esc(x.productName)} · Rp ${esc(x.total)} → komisi <b>Rp ${esc(x.commission)}</b></div>`).join('') || emptyState('%', 'Belum ada pesanan selesai', '', '', true));
    },
  });

  // ===== Halaman tamu (tampilan baru) =====
  const rp = (n) => 'Rp ' + Number(n || 0).toLocaleString('id-ID');
  let guestStores = [];
  let guestMap = null;
  const guestFavoriteKey = 'platiful-guest-favorites';
  const readGuestFavorites = () => {
    let saved;
    try {
      saved = JSON.parse(localStorage.getItem(guestFavoriteKey) || '[]');
    } catch {
      throw new Error('Daftar favorit tamu tidak dapat dibaca dari penyimpanan browser.');
    }
    if (!Array.isArray(saved) || saved.some((id) => typeof id !== 'string')) {
      throw new Error('Format daftar favorit tamu tidak valid.');
    }
    return new Set(saved);
  };
  const writeGuestFavorites = (favorites) => {
    try {
      localStorage.setItem(guestFavoriteKey, JSON.stringify([...favorites]));
    } catch {
      throw new Error('Browser tidak dapat menyimpan favorit. Periksa pengaturan penyimpanan browser.');
    }
  };
  const guestStoreRows = (favoriteOnly = false) => {
    const favorites = readGuestFavorites();
    const visibleStores = guestStores.filter((store) => !favoriteOnly || favorites.has(store.id));
    return visibleStores.map((store) => `<article class="g-store-row">
      <div><b>${esc(store.name)}</b><p>${esc(store.address)}</p>${store.openTime && store.closeTime ? `<small>Jam operasional ${esc(store.openTime)}–${esc(store.closeTime)}</small><br>` : ''}<small>${store.productCount} listing tersedia</small></div>
      <div class="btn-row">
        <button class="btn sm" type="button" data-gfavorite="${esc(store.id)}">${favorites.has(store.id) ? 'Hapus favorit' : 'Simpan favorit'}</button>
        ${store.latitude != null && store.longitude != null ? `<button class="btn sm" type="button" data-gfocus="${esc(store.id)}">Tampilkan peta</button>` : '<span class="muted">Lokasi belum tersedia</span>'}
      </div>
    </article>`).join('') || `<p class="muted">${favoriteOnly ? 'Belum ada gerai favorit yang disimpan.' : 'Belum ada gerai.'}</p>`;
  };
  const card = (x) => {
    const disc = x.originalPrice > x.price ? Math.round((1 - x.price / x.originalPrice) * 100) : 0;
    return `<article class="g-card">
      <div class="g-card-top">
        <span class="g-cat">${esc(x.category)}</span>
        ${x.halal ? '<span class="g-halal">Halal</span>' : ''}
        ${disc ? `<span class="g-disc">-${disc}%</span>` : ''}
      </div>
      <h3>${esc(x.name)}</h3>
      <p class="g-store">⌂ ${esc(x.store)}</p>
      <div class="g-price"><b>${rp(x.price)}</b>${x.originalPrice > x.price ? `<del>${rp(x.originalPrice)}</del>` : ''}</div>
      <div class="g-meta">
        <span>Stok ${esc(x.quantity)} pack</span>
        ${x.pickupEnd ? `<span>Ambil s.d. ${esc(x.pickupEnd)}</span>` : ''}
        ${x.reviewCount ? `<span>★ ${x.rating} (${x.reviewCount})</span>` : ''}
      </div>
      <details class="g-details">
        <summary>Detail produk</summary>
        <p>Kategori: ${esc(x.category)}</p>
        <p>${x.expiryDate ? `Kedaluwarsa: ${esc(x.expiryDate)}` : 'Tanggal kedaluwarsa belum dicantumkan'}</p>
        <p>${x.pickupStart || x.pickupEnd
          ? `Waktu pengambilan: ${esc(x.pickupStart || 'Mulai tersedia')}–${esc(x.pickupEnd || 'Tidak ditentukan')}`
          : 'Waktu pengambilan belum dicantumkan'}</p>
        ${x.storeOpenTime && x.storeCloseTime
          ? `<p>Jam operasional gerai: ${esc(x.storeOpenTime)}–${esc(x.storeCloseTime)}</p>` : ''}
        <p>${x.halal ? 'Informasi halal tersedia' : 'Informasi halal belum tersedia'}</p>
        ${(x.reviews || []).slice(0, 3).map((review) =>
          `<blockquote class="product-review"><b>${esc(review.customerName)}</b> · ${'★'.repeat(review.rating)}<p>${esc(review.comment || 'Tanpa komentar')}</p></blockquote>`).join('')}
        <p>${esc(x.store)} · ${esc(x.quantity)} pack tersedia</p>
      </details>
      <button class="btn primary g-cta" type="button" data-glogin="1">Masuk untuk memesan</button>
    </article>`;
  };
  const loadGuest = async (q) => {
    try {
      const l = await api('/api/products' + (q ? '?' + q : ''));
      $('#xgres').innerHTML = l.length
        ? `<p class="g-count"><b>${l.length}</b> listing tersedia</p><div class="g-grid">${l.map(card).join('')}</div>`
        : '<div class="g-empty"><span>🍃</span><h3>Belum ada produk</h3><p>Coba ubah kata kunci atau kategori.</p></div>';
    } catch (x) { fail(x); }
  };
  const initializeGuestMap = () => {
    const element = $('#xgmap');
    if (!element || !window.L) {
      if (element) element.textContent = 'Peta tidak dapat dimuat. Periksa koneksi internet lalu coba lagi.';
      return;
    }
    const locatedStores = guestStores.filter((store) => store.latitude != null && store.longitude != null);
    if (!guestMap) {
      guestMap = window.L.map(element).setView(
        locatedStores.length ? [locatedStores[0].latitude, locatedStores[0].longitude] : [-2.5, 118],
        locatedStores.length ? 12 : 5,
      );
      window.L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        maxZoom: 19,
        attribution: '&copy; OpenStreetMap contributors',
      }).addTo(guestMap);
    }
    guestMap.invalidateSize();
    guestMap.eachLayer((layer) => {
      if (layer instanceof window.L.Marker) guestMap.removeLayer(layer);
    });
    locatedStores.forEach((store) => {
      window.L.marker([store.latitude, store.longitude])
        .bindPopup(`<b>${esc(store.name)}</b><br>${esc(store.address)}${store.openTime && store.closeTime ? `<br>Jam operasional ${esc(store.openTime)}–${esc(store.closeTime)}` : ''}<br>${store.productCount} listing tersedia`)
        .addTo(guestMap);
    });
  };
  const showGuestView = (view) => {
    document.querySelectorAll('[data-guest-panel]').forEach((panelElement) => {
      panelElement.hidden = panelElement.dataset.guestPanel !== view;
    });
    document.querySelectorAll('[data-gview]').forEach((button) => {
      button.classList.toggle('primary', button.dataset.gview === view);
    });
    try {
      if (view === 'map') {
        $('#xgstores').innerHTML = guestStoreRows();
        initializeGuestMap();
      } else if (view === 'favorites') {
        $('#xgfavorites').innerHTML = guestStoreRows(true);
      }
    } catch (error) {
      fail(error);
    }
  };
  const openGuest = async () => {
    if ($('#xguest')) return;
    let categories;
    try {
      [categories, guestStores] = await Promise.all([api('/api/categories'), api('/api/stores')]);
    } catch (error) {
      fail(error);
      return;
    }
    const o = document.createElement('div'); o.id = 'xguest';
    o.innerHTML = `<div class="g-wrap">
      <header class="g-head">
        <div>
          <span class="g-eyebrow">PLATIFUL · ZERO HUNGER</span>
          <h1>Makanan surplus tersedia</h1>
          <p>Selamatkan makanan enak dengan harga lebih hemat.</p>
        </div>
        <button class="btn primary g-login" type="button" data-glogin="1">Masuk untuk memesan</button>
      </header>
      <nav class="g-navigation" aria-label="Jelajah sebagai tamu">
        <button class="btn primary" type="button" data-gview="foods">Makanan</button>
        <button class="btn" type="button" data-gview="map">Peta & gerai</button>
        <button class="btn" type="button" data-gview="favorites">Favorit gerai</button>
        <button class="btn" type="button" data-gclose="1">Tutup</button>
      </nav>
      <section data-guest-panel="foods">
      <form id="xguestf" class="g-filters">
        <label class="g-search"><span>⌕</span><input class="field" name="search" placeholder="Cari hidangan atau gerai..." autocomplete="off"></label>
        <select class="field" name="category"><option value="">Semua kategori</option>${categories.map((k) => `<option>${esc(k.name)}</option>`).join('')}</select>
        <label class="g-toggle"><input type="checkbox" name="halal" value="1"><span>Halal</span></label>
        <button class="btn primary" type="submit">Terapkan</button>
      </form>
      <div id="xgres"></div>
      </section>
      <section data-guest-panel="map" hidden>
        <p class="muted">Peta dan direktori gerai yang memiliki listing tersedia. Koordinat ditampilkan bila retailer mengisinya.</p>
        <div id="xgmap" class="guest-store-map" aria-label="Peta gerai OpenStreetMap"></div>
        <div id="xgstores"></div>
      </section>
      <section data-guest-panel="favorites" hidden>
        <h2>Gerai favorit di browser ini</h2>
        <p class="muted">Favorit tamu disimpan di browser ini; masuk ke akun untuk menyinkronkannya.</p>
        <div id="xgfavorites"></div>
      </section>
    </div>`;
    document.body.appendChild(o);
    loadGuest('');
  };
  document.addEventListener('click', async (e) => {
    if (e.target.closest('[data-guest]')) await openGuest();
    if (e.target.closest('[data-gclose]')) {
      guestMap?.remove();
      guestMap = null;
      $('#xguest')?.remove();
    }
    if (e.target.closest('[data-glogin]')) {
      guestMap?.remove();
      guestMap = null;
      $('#xguest')?.remove();
      window.render('login');
    }
    const viewButton = e.target.closest('[data-gview]');
    if (viewButton) showGuestView(viewButton.dataset.gview);
    const favoriteButton = e.target.closest('[data-gfavorite]');
    if (favoriteButton) {
      try {
        const favorites = readGuestFavorites();
        const storeId = favoriteButton.dataset.gfavorite;
        if (favorites.has(storeId)) favorites.delete(storeId);
        else favorites.add(storeId);
        writeGuestFavorites(favorites);
        if ($('#xguest') && !document.querySelector('[data-guest-panel="map"]').hidden) {
          $('#xgstores').innerHTML = guestStoreRows();
        }
        if ($('#xguest') && !document.querySelector('[data-guest-panel="favorites"]').hidden) {
          $('#xgfavorites').innerHTML = guestStoreRows(true);
        }
      } catch (error) {
        fail(error);
      }
    }
    const focusButton = e.target.closest('[data-gfocus]');
    if (focusButton && guestMap) {
      const store = guestStores.find((item) => item.id === focusButton.dataset.gfocus);
      if (store?.latitude != null && store?.longitude != null) {
        guestMap.setView([store.latitude, store.longitude], 15);
      }
    }
  });
  document.addEventListener('submit', (e) => { if (e.target.id !== 'xguestf') return; e.preventDefault(); e.stopImmediatePropagation(); loadGuest(new URLSearchParams(Object.entries(fd(e.target)).filter(([, v]) => v)).toString()); }, true);

  const base = window.render;
  window.render = async (page) => {
    if (!pages[page]) return base(page);
    const app = $('#app'); app.dataset.page = page; document.querySelectorAll('.nav-item').forEach((i) => i.classList.toggle('active', i.dataset.page === page));
    $('#crumb').textContent = LABEL[page]; $('#content').innerHTML = '<p>Memuat…</p>'; window.scrollTo({ top: 0 });
    try { $('#content').innerHTML = await pages[page](); } catch (e) { $('#content').innerHTML = `<section class="panel"><div class="panel-head"><h2>Gagal memuat halaman</h2></div><p>${esc(e.message)}</p><p style="color:#91a8a6">Kalau tertulis Not found / tidak ditemukan: server belum direstart dengan file terbaru (Ctrl+C lalu node server.js).</p></section>`; }
  };
  const refresh = () => window.render(document.getElementById('app').dataset.page);

  const addNav = () => { const nav = $('#nav'); if (!nav || !role() || nav.querySelector('[data-xnav]')) return;
    mine().forEach(([p, l]) => nav.insertAdjacentHTML('beforeend', `<button class="nav-item" data-page="${p}" data-xnav="1"><span>✦</span>${l}</button>`)); };

  const original = platifulApi.request.bind(platifulApi);
  platifulApi.request = (path, o = {}) => {
    if (o.body && /\/api\/auth\/register$/.test(path)) {
      o.body = JSON.stringify({ ...JSON.parse(o.body), consent: Boolean($('#xconsent')?.checked) });
    }
    if (o.body && path === '/api/store' && o.method === 'PUT') {
      const form = $('#storeForm');
      o.body = JSON.stringify({
        ...JSON.parse(o.body),
        openTime: form?.openTime?.value || '',
        closeTime: form?.closeTime?.value || '',
      });
    }
    if (o.body && /^\/api\/products(\/|$)/.test(path) &&
        ['POST', 'PATCH'].includes(o.method) && $('#xprod')) {
      const values = fd($('#productForm'));
      const extras = {
        expiryDate: values.expiryDate,
        pickupStart: values.pickupStart,
        pickupEnd: values.pickupEnd,
        photo: values.photo,
        halal: values.halal === 'on',
        minPrice: Number(values.minPrice) || 0,
        schedule: parseSchedule(values.schedule),
      };
      if (o.method === 'PATCH') {
        Object.keys(extras).forEach((key) => {
          if (extras[key] === '') delete extras[key];
        });
      }
      o.body = JSON.stringify({ ...JSON.parse(o.body), ...extras });
    }
    return original(path, o);
  };

  const augment = () => {
    const reg = $('form[data-mode="register"]'); if (reg && !$('#xconsent')) reg.querySelector('button[type="submit"]').insertAdjacentHTML('beforebegin', '<label style="display:block;margin:10px 0;font-size:12px"><input type="checkbox" id="xconsent"> Saya menyetujui penggunaan data pribadi saya sesuai kebijakan platform.</label>');
    const sf = $('#storeForm'); if (sf && !sf.openTime) sf.querySelector('textarea')?.closest('.form-field')?.insertAdjacentHTML('beforebegin', `<div class="form-field"><label>Jam buka</label><input class="field" name="openTime" type="time"></div><div class="form-field"><label>Jam tutup</label><input class="field" name="closeTime" type="time"></div>`);
    const pf = $('#productForm'); if (pf && !$('#xprod')) pf.querySelector('button[type="submit"], button.primary')?.insertAdjacentHTML('beforebegin', `<div id="xprod">${field('Tanggal kedaluwarsa', 'expiryDate', 'date', '', 'required')}${field('Jam pengambilan mulai', 'pickupStart', 'time')}${field('Jam pengambilan selesai', 'pickupEnd', 'time', '', 'required')}${field('Foto (URL)', 'photo')}${field('Harga terendah (Rp)', 'minPrice', 'number')}<div class="form-field"><label>Jadwal diskon (JSON)</label><input class="field" name="schedule" placeholder='[{"time":"18:00","price":8000}]'></div><label><input type="checkbox" name="halal"> Halal</label> <button class="btn" type="button" data-x="tsave">Simpan sebagai template</button></div>`);
    const ac = $('.account-form'); if (ac && role() !== 'admin' && !$('#xdel')) ac.insertAdjacentHTML('afterend', '<section class="panel" id="xdel"><div class="panel-head"><h2>Hapus akun</h2></div><form id="xdelform"><input class="field" name="password" type="password" placeholder="Password untuk konfirmasi" required><button class="btn danger" type="submit">Hapus akun saya</button></form></section>');
    [...document.querySelectorAll('div,p,aside,small')].filter((e) => /Login memakai backend/i.test(e.textContent) && !e.querySelector('div,p,aside,form')).forEach((e) => e.remove());
    const lf = $('form[data-mode="login"]'); if (lf && !$('#xdemo')) lf.insertAdjacentHTML('afterend', '<div id="xdemo" style="margin-top:16px"><p style="font-size:12px;color:#91a8a6;margin:0 0 8px">Masuk cepat dengan akun tester:</p><div class="btn-row"><button class="btn" type="button" data-demo="customer">Customer</button><button class="btn" type="button" data-demo="retailer">Retailer</button><button class="btn primary" type="button" data-demo="admin">Admin</button><button class="btn" type="button" data-guest="1">Lihat sebagai tamu</button></div></div>');
    if (pf && pf.category && !pf.dataset.xcat) { pf.dataset.xcat = '1'; api('/api/categories').then((c) => { const cur = pf.category.value; pf.category.innerHTML = c.map((k) => `<option ${k.name === cur ? 'selected' : ''}>${esc(k.name)}</option>`).join(''); }).catch(() => {}); }
    addNav();
  };
  document.addEventListener('click', async (e) => { const d = e.target.closest('[data-demo]'); if (!d) return; try { await api('/api/auth/demo', 'POST', { role: d.dataset.demo }); location.reload(); } catch (x) { fail(x); } });
  new MutationObserver(augment).observe(document.body, { childList: true, subtree: true });

  document.addEventListener('submit', async (e) => {
    const f = e.target; const run = async (fn) => { e.preventDefault(); e.stopImmediatePropagation(); try { await fn(); } catch (x) { fail(x); } };
    if (f.matches('form[data-mode="register"]') && !$('#xconsent')?.checked) return run(async () => toast('Centang persetujuan data pribadi dulu.'));
    if (f.id === 'xverify') return run(async () => { await api('/api/verification', 'POST', fd(f)); toast('Pengajuan terkirim.'); refresh(); });
    if (f.id === 'xcat') return run(async () => { await api('/api/categories', 'POST', fd(f)); refresh(); });
    if (f.id === 'xann') return run(async () => { await api('/api/admin/announcements', 'POST', fd(f)); toast('Terkirim.'); refresh(); });
    if (f.id === 'xannedit') return run(async () => { await api('/api/admin/announcements/' + encodeURIComponent(f.dataset.announcementId), 'PATCH', fd(f)); toast('Pengumuman diperbarui.'); refresh(); });
    if (f.id === 'xadmin') return run(async () => { await api('/api/admin/admins', 'POST', fd(f)); toast('Admin ditambahkan.'); refresh(); });
    if (f.id === 'xdelform') return run(async () => { if (!confirm('Akun akan dihapus permanen. Lanjut?')) return; await api('/api/account', 'DELETE', fd(f)); location.reload(); });
    if (f.classList.contains('xrev')) return run(async () => { await api('/api/reviews', 'POST', { ...fd(f), orderId: f.dataset.id }); toast('Ulasan terkirim.'); refresh(); });
    if (f.id === 'xrevedit') return run(async () => { await api('/api/reviews/' + encodeURIComponent(f.dataset.reviewId), 'PATCH', { ...fd(f), rating: Number(f.elements.rating.value) }); toast('Ulasan diperbarui.'); refresh(); });
    if (f.id === 'xreport') return run(async () => { await api('/api/user-reports', 'POST', fd(f)); toast('Laporan terkirim.'); refresh(); });
    if (f.id === 'xuserreportedit') return run(async () => { await api('/api/my-reports/' + encodeURIComponent(f.dataset.reportId), 'PATCH', fd(f)); toast('Laporan diperbarui.'); refresh(); });
    if (f.id === 'xperiod') return run(async () => { await api('/api/retailer/reports', 'POST', fd(f)); toast('Laporan disimpan.'); refresh(); });
    if (f.id === 'xfilter') return run(async () => { const q = new URLSearchParams(Object.entries(fd(f)).filter(([, v]) => v)); const go = (pos) => { if (pos) { q.set('lat', pos.coords.latitude); q.set('lng', pos.coords.longitude); } return api('/api/products?' + q).then((l) => { $('#xres').innerHTML = l.map((x) => `<div class="activity"><b>${esc(x.name)}</b> · ${esc(x.store)} · Rp ${esc(x.price)} · stok ${esc(x.quantity)}${x.reviewCount ? ` · ★ ${x.rating} (${x.reviewCount})` : ''}</div>`).join('') || '<p>Tidak ada hasil.</p>'; }).catch(fail); }; if (q.get('radius') && navigator.geolocation) navigator.geolocation.getCurrentPosition(go, () => go(null)); else go(null); });
  }, true);

  document.addEventListener('change', (e) => { if (e.target.id === 'xrole') { window.xRole = e.target.value; refresh(); } if (e.target.id === 'xstatus') { window.xStatus = e.target.value; refresh(); } });

  document.addEventListener('click', async (e) => {
    const b = e.target.closest('[data-x]'); if (!b) return; const id = b.dataset.v; const a = b.dataset.x;
    try {
      if (a === 'nread') await api('/api/notifications/' + id, 'PATCH');
      else if (a === 'ndel') await api('/api/notifications/' + id, 'DELETE');
      else if (a.startsWith('v')) await api('/api/admin/verifications/' + id, 'PATCH', { action: a.slice(1), reason: $('#r-' + id)?.value || '' });
      else if (a === 'tdel') await api('/api/templates/' + id, 'DELETE');
      else if (a === 'tuse') {
        const template = (await api('/api/templates')).find((item) => item.id === id);
        if (!template) throw new Error('Template tidak ditemukan.');
        const { id: _id, ownerId: _ownerId, ...product } = template;
        const pickupEnd = template.pickupEnd || '21:00';
        const pickupEndMatch = /^([01]\d|2[0-3]):([0-5]\d)$/.exec(pickupEnd);
        if (!pickupEndMatch) throw new Error('Jam pickup template tidak valid. Perbarui atau hapus template ini.');
        const date = new Date();
        const pickupEndTime = Number(pickupEndMatch[1]) * 60 + Number(pickupEndMatch[2]);
        if (date.getHours() * 60 + date.getMinutes() >= pickupEndTime) {
          date.setDate(date.getDate() + 1);
        }
        const expiryDate = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
        const schedule = typeof product.schedule === 'string'
          ? parseSchedule(product.schedule)
          : product.schedule || [];
        await api('/api/products', 'POST', {
          ...product,
          name: template.name,
          schedule,
          expiryDate,
          pickupEnd,
        });
        toast('Produk diposting dari template.');
      }
      else if (a === 'tsave') {
        const values = fd($('#productForm'));
        const schedule = parseSchedule(values.schedule);
        await api('/api/templates', 'POST', {
          ...values,
          name: values.name,
          halal: values.halal === 'on',
          schedule,
        });
        toast('Template disimpan.');
        return;
      }
      else if (a === 'oready') await api('/api/orders/' + id, 'PATCH', { status: 'Ready for pickup' });
      else if (a === 'onoshow') await api(`/api/orders/${id}/no-show`, 'POST');
      else if (a === 'poff') await api('/api/products/' + id, 'PATCH', { active: false });
      else if (a === 'pdel') { if (!confirm('Hapus produk ini?')) return; await api('/api/products/' + id, 'DELETE'); }
      else if (a === 'cdel') await api('/api/categories/' + id, 'DELETE');
      else if (a === 'cren') { const n = prompt('Nama kategori baru:'); if (!n) return; await api('/api/categories/' + id, 'PATCH', { name: n }); }
      else if (a === 'adel') await api('/api/admin/announcements/' + id, 'DELETE');
      else if (a === 'aedit') {
        const announcement = b.closest('[data-announcement]');
        if (!announcement) return;
        const item = (await api('/api/announcements')).find((entry) => entry.id === id);
        if (!item) throw new Error('Pengumuman tidak ditemukan.');
        announcement.innerHTML = `<form id="xannedit" data-announcement-id="${esc(id)}">${field('Judul', 'title', 'text', item.title, 'required maxlength=120')}<div class="form-field"><label>Isi</label><textarea class="field" name="body" required maxlength="2000">${esc(item.body)}</textarea></div><div class="btn-row"><button class="btn primary">Simpan</button><button class="btn" type="button" data-x="acancel" data-v="${esc(id)}">Batal</button></div></form>`;
        return;
      }
      else if (a === 'acancel') { refresh(); return; }
      else if (a === 'rvedit') {
        const review = (window.currentReviews || []).find((item) => item.id === id);
        const card = b.closest('[data-review-card]');
        if (!review || !card) return;
        card.querySelector('div').innerHTML = `#${esc(review.orderId.slice(0, 8))}<form id="xrevedit" data-review-id="${esc(id)}"><select class="field" name="rating" required>${[5, 4, 3, 2, 1].map((rating) => `<option value="${rating}" ${review.rating === rating ? 'selected' : ''}>${rating}</option>`).join('')}</select><input class="field" name="comment" maxlength="500" value="${esc(review.comment)}"><div class="btn-row"><button class="btn primary">Simpan</button><button class="btn" type="button" data-x="rvcancel">Batal</button></div></form>`;
        return;
      }
      else if (a === 'rvdelete') { if (!confirm('Hapus ulasan ini?')) return; await api('/api/reviews/' + encodeURIComponent(id), 'DELETE'); }
      else if (a === 'rvcancel') { refresh(); return; }
      else if (a === 'redit') {
        const report = (window.currentUserReports || []).find((item) => item.id === id);
        const card = b.closest('[data-user-report]');
        if (!report || !card) return;
        card.innerHTML = `<form id="xuserreportedit" data-report-id="${esc(id)}">${field('Alasan', 'reason', 'text', report.reason, 'required maxlength=200')}<div class="form-field"><label>Detail</label><textarea class="field" name="details" maxlength="1000">${esc(report.details || '')}</textarea></div><div class="btn-row"><button class="btn primary">Simpan</button><button class="btn" type="button" data-x="rcancel">Batal</button></div></form>`;
        return;
      }
      else if (a === 'rcancel') { refresh(); return; }
      else if (a === 'rdel') { if (!confirm('Hapus laporan ini?')) return; await api('/api/my-reports/' + encodeURIComponent(id), 'DELETE'); }
      else if (a === 'udel') { if (!confirm('Hapus akun ini?')) return; await api('/api/admin/users/' + id, 'DELETE'); }
      else if (a === 'rdel') await api('/api/my-reports/' + id, 'DELETE');
      else if (a === 'fsave') { await api('/api/filters', 'PUT', fd($('#xfilter'))); toast('Filter disimpan.'); return; }
      toast('Berhasil.'); refresh();
    } catch (x) { fail(x); }
  });
})();