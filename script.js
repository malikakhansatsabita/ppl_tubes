const content = document.getElementById('content');
const crumb = document.getElementById('crumb');

let current = 'login';

function head(kicker, title, description, action = '') {
  return `
    <div class="page-head">
      <div>
        <div class="eyebrow">${kicker}</div>
        <h1>${title}</h1>
        <p>${description}</p>
      </div>
      ${action ? `<div class="btn-row">${action}</div>` : ''}
    </div>`;
}

function stat(label, value, icon, delta, footnote) {
  return `
    <div class="stat">
      <div class="stat-top">${label}<span class="stat-icon">${icon}</span></div>
      <div class="stat-value">${value}</div>
      <span class="positive">↗ ${delta}</span>
      <span class="stat-foot">${footnote}</span>
    </div>`;
}

function panel(title, body, link = null) {
  const linkButton = link
    ? `<button class="link" data-goto="${link[1]}">${link[0]} ↗</button>`
    : '';

  return `
    <section class="panel">
      <div class="panel-head"><h2>${title}</h2>${linkButton}</div>
      ${body}
    </section>`;
}

function emptyState(icon, title, description, action = '', compact = false) {
  return `
    <div class="empty-state${compact ? ' compact' : ''}">
      <span class="empty-state-icon" aria-hidden="true">${icon}</span>
      <h3>${title}</h3>
      <p>${description}</p>
      ${action ? `<div class="empty-state-action">${action}</div>` : ''}
    </div>`;
}

function render(page) {
  current = page;
  document.getElementById('app').dataset.page = page;
  document.querySelectorAll('.nav-item').forEach((item) => {
    item.classList.toggle('active', item.dataset.page === page);
  });
  crumb.textContent = pageLabels[page] || 'PLATIFUL';
  content.innerHTML = '';
  window.scrollTo({ top: 0, behavior: 'smooth' });
}

const pageLabels = {
  dashboard: 'Dashboard',
  discover: 'Temukan makanan',
  map: 'Peta gerai',
  orders: 'Pesanan',
  favorites: 'Gerai favorit',
  products: 'Produk surplus',
  retailer: 'Dashboard gerai',
  store: 'Profil gerai',
  account: 'Pengaturan akun',
  reports: 'Laporan',
  admin: 'Ringkasan platform',
  users: 'Pengguna',
  moderation: 'Moderasi laporan',
  articles: 'Artikel edukasi',
  commission: 'Komisi dan settlement',
  login: 'Sign in',
  register: 'Buat akun',
};

function toast(message) {
  const element = document.getElementById('toast');
  element.textContent = message;
  element.classList.add('show');
  clearTimeout(window.toastTimer);
  window.toastTimer = setTimeout(() => element.classList.remove('show'), 2500);
}

document.getElementById('nav').addEventListener('click', (event) => {
  const button = event.target.closest('[data-page]');
  if (button) window.render(button.dataset.page);
});

content.addEventListener('click', (event) => {
  const button = event.target.closest('[data-goto]');
  if (button) window.render(button.dataset.goto);
});

window.render = render;