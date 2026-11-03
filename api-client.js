const platifulApi = {
  async request(path, options = {}) {
    let response;
    try {
      response = await fetch(path, {
        headers: { 'Content-Type': 'application/json' },
        ...options,
      });
    } catch {
      throw new Error('Backend PLATIFUL tidak terhubung. Jalankan server dengan `npm start` dari folder Back end.');
    }

    const responseText = await response.text();
    const notBackendPort = window.location.port && window.location.port !== '3000';
    let data;
    try {
      data = responseText ? JSON.parse(responseText) : {};
    } catch {
      data = null;
    }
    // Live Server (port 5500) tidak punya /api: balasannya kosong/HTML, bukan JSON dari backend.
    if (data === null || (notBackendPort && !response.ok && !data.error)) {
      if (notBackendPort) {
        throw new Error('Kamu membuka lewat Live Server (port ' + window.location.port + '). Jalankan backend (npm start di folder Back end), lalu buka http://localhost:3000.');
      }
      throw new Error('Server mengirim respons yang tidak dikenali. Pastikan backend PLATIFUL berjalan di port 3000.');
    }

    if (!response.ok) {
      throw new Error(data.error || 'Permintaan gagal.');
    }

    return data;
  },
};

window.platifulApi = platifulApi;

let apiProducts = [];

function escapeHtml(value) {
  return String(value ?? '').replace(/[&<>"']/g, (character) => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;',
  })[character]);
}

function formatRupiah(amount) {
  return new Intl.NumberFormat('id-ID', {
    style: 'currency',
    currency: 'IDR',
    maximumFractionDigits: 0,
  }).format(amount || 0);
}

function foodEmoji(product) {
  const description = `${product.name} ${product.category}`.toLowerCase();
  if (description.includes('bread') || description.includes('roti')) return '🍞';
  if (description.includes('pastry') || description.includes('croissant')) return '🥐';
  if (description.includes('meal') || description.includes('rice')) return '🍱';
  return '🥗';
}

function renderFoodCards(products) {
  const foodGrid = document.getElementById('foodGrid');
  if (!foodGrid) return;

  const resultCount = document.getElementById('resultCount');
  if (resultCount) {
    resultCount.innerHTML = `<b>${products.length}</b> surplus untuk dijelajahi`;
  }

  if (products.length === 0) {
    foodGrid.innerHTML = emptyState('⌕', 'Belum ada yang cocok', 'Coba kata kunci atau kategori lain untuk menemukan surplus yang tersedia.');
    return;
  }

  foodGrid.innerHTML = `
    <div class="grid cards deal-grid ${products.length === 1 ? 'single-deal' : ''}">
      ${products.map((product, index) => `
        <article class="food-card deal-card">
          <div class="deal-photo deal-photo-${index % 4}">
            <img src="${foodImage(product, index)}" alt="${escapeHtml(product.name)}" loading="lazy">
            <div class="deal-photo-shade"></div>
            <span class="deal-badge">${product.quantity < 3 ? '⚡ Tinggal sedikit' : '💚 Yuk diselamatkan'}</span>
            <span class="deal-emoji" aria-hidden="true">${foodEmoji(product)}</span>
            <span class="deal-discount">-${discountPercent(product)}%</span>
          </div>
          <div class="food-info">
            <div class="deal-store"><span class="store-pin">⌂</span><span>${escapeHtml(product.store)}</span><span class="deal-stock">${product.quantity} pack</span></div>
            <h3>${escapeHtml(product.name)}</h3>
            <div class="deal-price-row">
              <div class="price"><b>${formatRupiah(product.price)}</b><del>${formatRupiah(product.originalPrice)}</del></div>
              <span class="deal-savings">✨ Yeay, hemat ${formatRupiah(product.originalPrice - product.price)}</span>
            </div>
            <div class="food-foot">
              <label class="quantity-picker">
                <span>Pack</span>
                <input type="number" min="1" max="${product.quantity}" value="1" data-order-quantity="${escapeHtml(product.id)}">
              </label>
              <button class="btn primary reserve-deal" data-product-id="${escapeHtml(product.id)}">Ambil deal <span aria-hidden="true">😋 →</span></button>
            </div>
            <details class="product-details">
              <summary>Detail produk</summary>
              <p>Kategori: ${escapeHtml(product.category)}</p>
              <p>${product.expiryDate ? `Kedaluwarsa: ${escapeHtml(product.expiryDate)}` : 'Tanggal kedaluwarsa belum dicantumkan'}</p>
              <p>${product.pickupStart || product.pickupEnd
                ? `Waktu pengambilan: ${escapeHtml(product.pickupStart || 'Mulai tersedia')}–${escapeHtml(product.pickupEnd || 'Tidak ditentukan')}`
                : 'Waktu pengambilan belum dicantumkan'}</p>
              ${product.storeOpenTime && product.storeCloseTime
                ? `<p>Jam operasional gerai: ${escapeHtml(product.storeOpenTime)}–${escapeHtml(product.storeCloseTime)}</p>` : ''}
              <p>${product.halal ? 'Informasi halal tersedia' : 'Informasi halal belum tersedia'}</p>
              ${product.reviewCount ? `<p>Rating gerai: ${escapeHtml(product.rating)} dari 5 (${product.reviewCount} ulasan)</p>` : ''}
              ${(product.reviews || []).slice(0, 3).map((review) => `
                <blockquote class="product-review">
                  <b>${escapeHtml(review.customerName)}</b> · ${'★'.repeat(review.rating)}
                  <p>${escapeHtml(review.comment || 'Tanpa komentar')}</p>
                </blockquote>`).join('')}
              <p>${escapeHtml(product.store)} · ${product.quantity} pack tersedia</p>
            </details>
            <details class="report-box">
              <summary>Laporkan listing</summary>
              <form class="report-form" data-product-id="${escapeHtml(product.id)}">
                <select class="field" name="reason" required>
                  <option value="">Pilih alasan</option>
                  <option>Food safety</option>
                  <option>Incorrect information</option>
                  <option>Other</option>
                </select>
                <input class="field" name="details" maxlength="500" placeholder="Detail tambahan (opsional)">
                <button class="btn sm" type="submit">Kirim laporan</button>
              </form>
            </details>
          </div>
        </article>`).join('')}
    </div>`;
}

function discountPercent(product) {
  if (!product.originalPrice || product.originalPrice <= 0) return 0;
  return Math.max(0, Math.round((1 - product.price / product.originalPrice) * 100));
}

function foodImage(product, index) {
  const description = `${product.name} ${product.category}`.toLowerCase();
  if (description.includes('bread') || description.includes('roti')) {
    return 'https://images.unsplash.com/photo-1509440159596-0249088772ff?auto=format&fit=crop&w=960&q=80';
  }
  if (description.includes('pastry') || description.includes('croissant') || description.includes('bakery')) {
    return 'https://images.unsplash.com/photo-1555507036-ab1f4038808a?auto=format&fit=crop&w=960&q=80';
  }
  if (description.includes('meal') || description.includes('rice')) {
    return 'https://images.unsplash.com/photo-1547592180-85f173990554?auto=format&fit=crop&w=960&q=80';
  }
  if (description.includes('produce') || description.includes('vegetable')) {
    return 'https://images.unsplash.com/photo-1540420773420-3366772f4999?auto=format&fit=crop&w=960&q=80';
  }
  return index % 2 === 0
    ? 'https://images.unsplash.com/photo-1512621776951-a57141f2eefd?auto=format&fit=crop&w=960&q=80'
    : 'https://images.unsplash.com/photo-1490645935967-10de6ba17061?auto=format&fit=crop&w=960&q=80';
}

async function loadProducts() {
  apiProducts = await platifulApi.request('/api/products');
  filterApiProducts();
}

function filterApiProducts() {
  const query = (document.getElementById('foodSearch')?.value || '').toLowerCase();
  const category = document.getElementById('categoryFilter')?.value || '';
  const filteredProducts = apiProducts.filter((product) => {
    const matchesText = `${product.name} ${product.store}`.toLowerCase().includes(query);
    return matchesText && (!category || product.category === category);
  });

  renderFoodCards(filteredProducts);
}

document.getElementById('content').addEventListener('input', (event) => {
  if (event.target.id === 'foodSearch') filterApiProducts();
});

document.getElementById('content').addEventListener('change', (event) => {
  if (event.target.id === 'categoryFilter') filterApiProducts();
});

document.getElementById('content').addEventListener('click', async (event) => {
  const reportForm = event.target.closest('.report-form');
  if (reportForm) return;

  const button = event.target.closest('.reserve-deal');
  if (!button) return;

  button.disabled = true;
  const quantityInput = document.querySelector(`[data-order-quantity="${CSS.escape(button.dataset.productId)}"]`);
  const quantity = Number(quantityInput?.value || 1);

  try {
    const order = await platifulApi.request('/api/orders', {
      method: 'POST',
      body: JSON.stringify({ productId: button.dataset.productId, quantity }),
    });
    toast(`Pesanan dibuat · ${formatRupiah(order.total)}`);
    await loadProducts();
  } catch (error) {
    button.disabled = false;
    toast(error.message);
  }
});

document.getElementById('content').addEventListener('submit', async (event) => {
  const form = event.target.closest('.report-form');
  if (!form) return;

  event.preventDefault();
  const submitButton = form.querySelector('button');
  submitButton.disabled = true;
  try {
    await platifulApi.request('/api/reports', {
      method: 'POST',
      body: JSON.stringify({
        productId: form.dataset.productId,
        ...Object.fromEntries(new FormData(form)),
      }),
    });
    form.innerHTML = '<span class="positive">Laporan terkirim. Terima kasih.</span>';
  } catch (error) {
    submitButton.disabled = false;
    toast(error.message);
  }
});