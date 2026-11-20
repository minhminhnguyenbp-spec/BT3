/* PhoneZone - AJAX
 * - Danh sách sản phẩm: nạp bằng AJAX từ data/products.json (không reload trang)
 * - Chi tiết sản phẩm : nạp theo yêu cầu từ data/<id>.json khi người dùng bấm vào sản phẩm
 * - Lọc / sắp xếp / tìm kiếm: xử lý ngay trên dữ liệu đã tải, không gọi lại server
 * Dùng fetch() (AJAX hiện đại, thay cho XMLHttpRequest). Cần chạy qua web server (localhost).
 */
'use strict';

const LIST_URL = 'data/products.json';
const detailUrl = id => 'data/' + encodeURIComponent(id) + '.json';
const CART_KEY = 'phonezone_cart';

/* ---------- Tiện ích ---------- */
const $ = (sel, root = document) => root.querySelector(sel);
const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const money = n => String(n).replace(/\B(?=(\d{3})+(?!\d))/g, '.') + 'đ';
const discount = p => p.oldPrice > p.price ? Math.round((1 - p.price / p.oldPrice) * 100) : 0;
const norm = s => String(s).toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/đ/g, 'd');

/* ---------- AJAX ---------- */
const cache = new Map();
async function getJSON(url) {
  if (cache.has(url)) return cache.get(url);
  let res;
  try {
    res = await fetch(url, { headers: { Accept: 'application/json' } });
  } catch (e) {
    throw new Error(location.protocol === 'file:'
      ? 'Không thể tải dữ liệu khi mở file trực tiếp. Hãy chạy website qua localhost (ví dụ: python -m http.server).'
      : 'Không thể kết nối. Hãy kiểm tra mạng và thử lại.');
  }
  if (!res.ok) throw new Error('Không tìm thấy dữ liệu (' + res.status + ').');
  const data = await res.json();
  cache.set(url, data);
  return data;
}
const loadList = () => getJSON(LIST_URL);

/* ---------- Giỏ hàng (localStorage) ---------- */
const Cart = {
  read() { try { return JSON.parse(localStorage.getItem(CART_KEY)) || []; } catch { return []; } },
  write(items) { try { localStorage.setItem(CART_KEY, JSON.stringify(items)); } catch { /* bỏ qua */ } updateCartCount(); },
  add(id, qty = 1) {
    const items = this.read();
    const it = items.find(i => i.id === id);
    it ? it.qty = Math.min(10, it.qty + qty) : items.push({ id, qty });
    this.write(items);
  },
  setQty(id, qty) { this.write(this.read().map(i => i.id === id ? { ...i, qty } : i)); },
  remove(id) { this.write(this.read().filter(i => i.id !== id)); },
  count() { return this.read().reduce((s, i) => s + i.qty, 0); }
};
function updateCartCount() {
  const strong = $('.cart-link strong');
  if (!strong) return;
  let badge = $('.cart-count', strong);
  if (!badge) { badge = document.createElement('span'); badge.className = 'cart-count'; strong.append(badge); }
  const n = Cart.count();
  badge.textContent = n;
  badge.hidden = n === 0;
}

/* ---------- Thông báo nhỏ ---------- */
function toast(msg) {
  let t = $('#toast');
  if (!t) { t = document.createElement('div'); t.id = 'toast'; t.setAttribute('role', 'status'); document.body.append(t); }
  t.textContent = msg;
  t.classList.add('show');
  clearTimeout(toast.timer);
  toast.timer = setTimeout(() => t.classList.remove('show'), 2200);
}

/* ---------- Giao diện: card, skeleton, lỗi ---------- */
function cardHTML(p) {
  const d = discount(p);
  const href = 'details.html?id=' + encodeURIComponent(p.id);
  return `<article class="market-card" id="${esc(p.id)}" data-basic-card="${esc(p.id)}">
    <div class="card-media">
      ${d ? `<span class="deal-badge">-${d}%</span>` : ''}
      <a href="${href}" data-basic="${esc(p.id)}" aria-label="Xem nhanh ${esc(p.name)}"><img src="${esc(p.image)}" alt="${esc(p.name)}" loading="lazy"></a>
    </div>
    <div class="card-body">
      <p class="brand-label">${esc(p.brand)}${p.tag ? ` <span class="tag-chip">${esc(p.tag)}</span>` : ''}</p>
      <h3><a href="${href}" data-basic="${esc(p.id)}">${esc(p.name)}</a></h3>
      <p class="card-short">${esc(p.short)}</p>
      <p class="price-row"><span class="price">${money(p.price)}</span>${p.oldPrice > p.price ? ` <span class="old-price">${money(p.oldPrice)}</span>` : ''}</p>
      <div class="card-actions">
        <a class="btn btn-secondary" href="${href}" data-product="${esc(p.id)}">Xem chi tiết</a>
        <button class="btn" type="button" data-add="${esc(p.id)}">Thêm vào giỏ</button>
      </div>
    </div>
  </article>`;
}
const skeletonCards = n => Array.from({ length: n }, () =>
  '<div class="market-card skeleton" aria-hidden="true"><div class="sk-img"></div><div class="sk-line"></div><div class="sk-line short"></div><div class="sk-line"></div></div>').join('');

function showError(box, err, retry) {
  box.innerHTML = `<div class="state-box" role="alert"><p>⚠️ ${esc(err.message || 'Đã có lỗi xảy ra.')}</p><button class="btn" type="button">Thử lại</button></div>`;
  $('button', box).onclick = retry;
}

/* ---------- Chi tiết sản phẩm ---------- */
function detailHTML(p) {
  const d = discount(p);
  const save = p.oldPrice - p.price;
  return `<div class="product-detail-panel">
    <div class="detail-gallery">
      <div class="detail-main-image"><img src="${esc(p.image)}" alt="${esc(p.name)}"></div>
      <p class="source"><strong>Nguồn thông tin:</strong> <a href="${esc(p.source.url)}" target="_blank" rel="noopener noreferrer">${esc(p.source.name)}</a></p>
    </div>
    <div class="detail-info">
      <p class="brand-label">${esc(p.brand)}</p>
      <h2 id="detail-title">${esc(p.name)}</h2>
      <p class="price-line"><span class="price big-price">${money(p.price)}</span>${save > 0 ? ` <span class="old-price">${money(p.oldPrice)}</span>` : ''}</p>
      ${save > 0 ? `<p class="deal-box">🏷️ Tiết kiệm <strong>${money(save)}</strong> (-${d}%)</p>` : ''}
      <h3>Mô tả chi tiết</h3>
      <div class="desc">${p.description.map(t => `<p>${esc(t)}</p>`).join('')}</div>
      <h3>Điểm nổi bật</h3>
      <ul class="feature-list">${p.features.map(f => `<li>${esc(f)}</li>`).join('')}</ul>
      <h3>Thông số</h3>
      <table class="spec-table"><tbody>${p.specs.map(s => `<tr><th>${esc(s.label)}</th><td>${esc(s.value)}</td></tr>`).join('')}</tbody></table>
      ${p.storage.length ? `<div class="variant-box"><h3>Chọn dung lượng</h3><div class="option-row" role="radiogroup" aria-label="Dung lượng">${
        p.storage.map((s, i) => `<button type="button" class="opt${i === 0 ? ' active' : ''}" role="radio" aria-checked="${i === 0}">${esc(s)}</button>`).join('')}</div></div>` : ''}
      <div class="buy-box">
        <p><strong>✓ Còn hàng</strong></p>
        <div class="qty-row"><span>Số lượng</span>
          <div class="qty"><button type="button" data-qty="-1" aria-label="Giảm">−</button><input type="number" min="1" max="10" value="1" aria-label="Số lượng"><button type="button" data-qty="1" aria-label="Tăng">+</button></div>
        </div>
        <button class="btn full" type="button" data-add-detail="${esc(p.id)}">Thêm vào giỏ hàng</button>
        <a class="btn btn-buy full" href="contact.html#form">Mua ngay / Liên hệ</a>
      </div>
    </div>
  </div>`;
}

/* gắn sự kiện cho vùng chi tiết (chọn dung lượng, số lượng, thêm giỏ) */
function bindDetail(root) {
  root.addEventListener('click', e => {
    const opt = e.target.closest('.opt');
    if (opt) {
      $$('.opt', root).forEach(o => { o.classList.toggle('active', o === opt); o.setAttribute('aria-checked', o === opt); });
      return;
    }
    const step = e.target.closest('[data-qty]');
    if (step) {
      const input = $('.qty input', root);
      input.value = Math.min(10, Math.max(1, (parseInt(input.value) || 1) + Number(step.dataset.qty)));
      return;
    }
    const add = e.target.closest('[data-add-detail]');
    if (add) {
      const qty = Math.min(10, Math.max(1, parseInt($('.qty input', root).value) || 1));
      Cart.add(add.dataset.addDetail, qty);
      toast('Đã thêm ' + qty + ' sản phẩm vào giỏ hàng');
    }
  });
}

/* ---------- Hộp thoại: (1) thông tin cơ bản  ->  (2) chi tiết đầy đủ ---------- */
let dialog, dialogBody, requestId = 0;
function ensureDialog() {
  if (dialog) return;
  dialog = document.createElement('dialog');
  dialog.className = 'quick-detail';
  dialog.setAttribute('aria-label', 'Thông tin sản phẩm');
  dialog.innerHTML = '<button class="quick-close" type="button" aria-label="Đóng">×</button><div class="quick-content" aria-live="polite"></div>';
  document.body.append(dialog);
  dialogBody = $('.quick-content', dialog);
  $('.quick-close', dialog).onclick = () => dialog.close();
  dialog.addEventListener('click', e => { if (e.target === dialog) dialog.close(); }); // bấm nền để đóng
  dialog.addEventListener('close', () => { requestId++; });
  bindDetail(dialogBody);
  dialogBody.addEventListener('click', e => {
    const more = e.target.closest('[data-open-detail]');
    if (more) openProduct(more.dataset.openDetail, true);
    const back = e.target.closest('[data-open-basic]');
    if (back) openBasic(back.dataset.openBasic);
  });
}

/* Bước 1: bấm vào sản phẩm -> chỉ hiện thông tin cơ bản (ảnh, tên, giá, mô tả ngắn) */
function basicHTML(p) {
  const d = discount(p);
  return `<div class="basic-panel">
    <div class="detail-main-image"><img src="${esc(p.image)}" alt="${esc(p.name)}"></div>
    <div class="detail-info">
      <p class="brand-label">${esc(p.brand)}${p.tag ? ` <span class="tag-chip">${esc(p.tag)}</span>` : ''}</p>
      <h2 id="detail-title">${esc(p.name)}</h2>
      <p class="price-line"><span class="price big-price">${money(p.price)}</span>${p.oldPrice > p.price ? ` <span class="old-price">${money(p.oldPrice)}</span> <span class="tag-chip">-${d}%</span>` : ''}</p>
      <p class="basic-short">${esc(p.short)}</p>
      <div class="card-actions">
        <button class="btn" type="button" data-open-detail="${esc(p.id)}">Xem chi tiết</button>
        <button class="btn btn-light" type="button" data-add="${esc(p.id)}">Thêm vào giỏ</button>
      </div>
    </div>
  </div>`;
}
async function openBasic(id) {
  ensureDialog();
  const req = ++requestId;
  dialog.setAttribute('aria-label', 'Thông tin cơ bản sản phẩm');
  if (!dialog.open) dialog.showModal();
  try {
    const p = (await loadList()).find(x => x.id === id);
    if (req !== requestId) return;
    if (!p) throw new Error('Sản phẩm không tồn tại.');
    dialogBody.innerHTML = basicHTML(p);
  } catch (err) {
    if (req !== requestId) return;
    showError(dialogBody, err, () => openBasic(id));
  }
}

/* Bước 2: bấm "Xem chi tiết" -> AJAX tải data/<id>.json rồi hiện đầy đủ (mô tả, thông số...) */
async function openProduct(id, fromBasic = false) {
  ensureDialog();
  const req = ++requestId;
  dialogBody.innerHTML = '<div class="state-box"><div class="spinner"></div><p>Đang tải chi tiết…</p></div>';
  if (!dialog.open) dialog.showModal();
  try {
    const p = await getJSON(detailUrl(id));
    if (req !== requestId) return;
    dialogBody.innerHTML =
      `<p class="quick-back"><button class="link-btn" type="button" data-open-basic="${esc(id)}">← Quay lại</button></p>` +
      detailHTML(p) +
      `<p class="quick-more"><a class="text-link" href="details.html?id=${encodeURIComponent(id)}">Mở trang sản phẩm đầy đủ →</a></p>`;
  } catch (err) {
    if (req !== requestId) return;
    showError(dialogBody, err, () => openProduct(id, fromBasic));
  }
}

/* ---------- Trang chủ: sản phẩm nổi bật ---------- */
async function initFeatured(box) {
  box.innerHTML = skeletonCards(4);
  try {
    const list = await loadList();
    box.innerHTML = list.slice(0, 4).map(cardHTML).join('');
  } catch (err) { showError(box, err, () => initFeatured(box)); }
}

/* ---------- Trang sản phẩm: lọc / sắp xếp / tìm kiếm ---------- */
const PRICE_RANGES = {
  low: { label: 'Dưới 15 triệu', test: p => p < 15e6 },
  mid: { label: '15 - 25 triệu', test: p => p >= 15e6 && p <= 25e6 },
  high: { label: 'Trên 25 triệu', test: p => p > 25e6 }
};

async function initCatalog(box) {
  const params = new URLSearchParams(location.search);
  const state = { q: (params.get('q') || '').trim(), category: params.get('category') || '', brands: new Set(), prices: new Set(), sort: 'default' };
  const hash = decodeURIComponent(location.hash.slice(1));
  const qInput = $('#catalog-search');
  const sortSel = $('#sort');
  if (qInput) qInput.value = state.q;
  // header search giữ lại từ khoá
  $$('.search-box input[name="q"]').forEach(i => i.value = state.q);
  $$('.search-box select[name="category"]').forEach(s => s.value = state.category);

  box.innerHTML = skeletonCards(6);
  let list;
  try { list = await loadList(); } catch (err) { return showError(box, err, () => initCatalog(box)); }

  // Bộ lọc thương hiệu tạo từ dữ liệu
  const brands = [...new Set(list.map(p => p.brand))];
  $('#brand-filters').innerHTML = brands.map(b =>
    `<label><input type="checkbox" data-brand="${esc(b)}"> ${esc(b)} <small>(${list.filter(p => p.brand === b).length})</small></label>`).join('');
  $('#price-filters').innerHTML = Object.entries(PRICE_RANGES).map(([k, r]) =>
    `<label><input type="checkbox" data-price="${k}"> ${r.label}</label>`).join('');

  if (hash === 'android') { // liên kết "Android" từ trang chủ: mọi hãng trừ Apple
    brands.filter(b => b !== 'Apple').forEach(b => { state.brands.add(b); const c = $(`[data-brand="${CSS.escape(b)}"]`); if (c) c.checked = true; });
  }

  function apply() {
    const nq = norm(state.q);
    let out = list.filter(p =>
      (!state.category || p.category === state.category) &&
      (!nq || norm(p.name + ' ' + p.brand).includes(nq)) &&
      (!state.brands.size || state.brands.has(p.brand)) &&
      (!state.prices.size || [...state.prices].some(k => PRICE_RANGES[k].test(p.price))));
    if (state.sort === 'asc') out.sort((a, b) => a.price - b.price);
    else if (state.sort === 'desc') out.sort((a, b) => b.price - a.price);
    else if (state.sort === 'name') out.sort((a, b) => a.name.localeCompare(b.name, 'vi'));
    $('#result-count').textContent = out.length + ' kết quả';
    $('#result-query').textContent = state.q ? ` cho “${state.q}”` : '';
    box.innerHTML = out.length ? out.map(cardHTML).join('') :
      '<div class="state-box"><p>😕 Không tìm thấy sản phẩm phù hợp.</p><button class="btn" type="button" id="reset-empty">Xóa bộ lọc</button></div>';
    const r = $('#reset-empty'); if (r) r.onclick = reset;
    const n = state.brands.size + state.prices.size;
    const fc = $('#filter-count'); if (fc) fc.textContent = n ? ` (${n})` : '';
  }
  function reset() {
    state.q = ''; state.category = ''; state.brands.clear(); state.prices.clear(); state.sort = 'default';
    $$('.filter-panel input[type=checkbox]').forEach(c => c.checked = false);
    if (qInput) qInput.value = ''; if (sortSel) sortSel.value = 'default';
    $$('.search-box input[name="q"]').forEach(i => i.value = '');
    $$('.search-box select[name="category"]').forEach(s => s.value = '');
    history.replaceState(null, '', location.pathname);
    apply();
  }

  $('.filter-panel').addEventListener('change', e => {
    const t = e.target;
    if (t.dataset.brand) t.checked ? state.brands.add(t.dataset.brand) : state.brands.delete(t.dataset.brand);
    if (t.dataset.price) t.checked ? state.prices.add(t.dataset.price) : state.prices.delete(t.dataset.price);
    apply();
  });
  sortSel.addEventListener('change', () => { state.sort = sortSel.value; apply(); });
  if (qInput) qInput.addEventListener('input', () => { state.q = qInput.value.trim(); apply(); });
  $('#clear-filters').addEventListener('click', reset);
  const toggle = $('#filter-toggle');
  if (toggle) toggle.addEventListener('click', () => {
    const open = $('.filter-panel').classList.toggle('open');
    toggle.setAttribute('aria-expanded', open);
  });

  apply();
  // cuộn tới sản phẩm khi vào từ liên kết dạng products.html#id
  const target = hash && document.getElementById(hash);
  if (target && target.classList.contains('market-card')) {
    target.scrollIntoView({ block: 'center' });
    target.classList.add('flash');
  }
}

/* ---------- Trang chi tiết (details.html?id=...) ---------- */
async function initDetailPage(root) {
  const id = new URLSearchParams(location.search).get('id') || decodeURIComponent(location.hash.slice(1));
  if (!id) { root.innerHTML = '<div class="state-box"><p>Chưa chọn sản phẩm.</p><a class="btn" href="products.html">Xem danh sách sản phẩm</a></div>'; return; }
  root.innerHTML = '<div class="state-box"><div class="spinner"></div><p>Đang tải chi tiết…</p></div>';
  try {
    const [p, list] = await Promise.all([getJSON(detailUrl(id)), loadList()]);
    document.title = p.name + ' - PhoneZone';
    $('#crumb-name').textContent = p.name;
    root.innerHTML = detailHTML(p);
    bindDetail(root);
    const related = list.filter(x => x.id !== p.id).slice(0, 4);
    $('#related').innerHTML = related.map(cardHTML).join('');
    $('#related-section').hidden = false;
  } catch (err) {
    root.innerHTML = '';
    showError(root, err.message.startsWith('Không tìm thấy') ? new Error('Sản phẩm không tồn tại.') : err, () => initDetailPage(root));
  }
}

/* ---------- Trang giỏ hàng ---------- */
async function initCart(box) {
  box.innerHTML = '<div class="state-box"><div class="spinner"></div><p>Đang tải giỏ hàng…</p></div>';
  let list;
  try { list = await loadList(); } catch (err) { return showError(box, err, () => initCart(box)); }
  function render() {
    const items = Cart.read().map(i => ({ ...i, p: list.find(p => p.id === i.id) })).filter(i => i.p);
    const total = items.reduce((s, i) => s + i.p.price * i.qty, 0);
    $('#cart-subtotal').textContent = money(total);
    $('#cart-total').textContent = money(total);
    $('#checkout').classList.toggle('disabled', !items.length);
    box.innerHTML = items.length ? items.map(({ p, qty }) => `
      <article class="cart-item">
        <img src="${esc(p.image)}" alt="${esc(p.name)}" loading="lazy">
        <div class="cart-item-info"><h2>${esc(p.name)}</h2><p>${esc(p.brand)}</p><a class="text-link" href="details.html?id=${encodeURIComponent(p.id)}" data-product="${esc(p.id)}">Xem chi tiết</a></div>
        <div class="cart-item-control"><label>Số lượng
          <select data-cart-qty="${esc(p.id)}">${Array.from({ length: 10 }, (_, k) => `<option${k + 1 === qty ? ' selected' : ''}>${k + 1}</option>`).join('')}</select></label>
          <p class="price">${money(p.price * qty)}</p>
          <button class="link-btn" type="button" data-remove="${esc(p.id)}">Xóa</button></div>
      </article>`).join('') + '<a class="continue-link" href="products.html">← Tiếp tục mua sắm</a>' :
      '<div class="state-box"><p>🛒 Giỏ hàng của bạn đang trống.</p><a class="btn" href="products.html">Mua sắm ngay</a></div>';
  }
  box.addEventListener('change', e => { const s = e.target.closest('[data-cart-qty]'); if (s) { Cart.setQty(s.dataset.cartQty, +s.value); render(); } });
  box.addEventListener('click', e => { const r = e.target.closest('[data-remove]'); if (r) { Cart.remove(r.dataset.remove); render(); } });
  render();
}

/* ---------- Khởi tạo ---------- */
document.addEventListener('click', e => {
  const plain = e.ctrlKey || e.metaKey || e.shiftKey || e.altKey || e.button;
  // "Xem chi tiết" -> chi tiết đầy đủ (AJAX)
  const more = e.target.closest('a[data-product]');
  if (more && !plain) { e.preventDefault(); openProduct(more.dataset.product); return; }
  const add = e.target.closest('button[data-add]');
  if (add) { Cart.add(add.dataset.add); toast('Đã thêm vào giỏ hàng'); return; }
  if (e.target.closest('button, input, select')) return;
  // bấm ảnh / tên / vùng card -> chỉ thông tin cơ bản
  const basic = e.target.closest('a[data-basic]');
  if (basic) { if (!plain) { e.preventDefault(); openBasic(basic.dataset.basic); } return; }
  const card = e.target.closest('[data-basic-card]');
  if (card && !e.target.closest('a') && !dialog?.contains(e.target)) openBasic(card.dataset.basicCard);
});

document.addEventListener('DOMContentLoaded', () => {
  updateCartCount();
  const featured = $('#featured'); if (featured) initFeatured(featured);
  const catalog = $('#product-results'); if (catalog) initCatalog(catalog);
  const detail = $('#detail-root'); if (detail) initDetailPage(detail);
  const cart = $('#cart-items'); if (cart) initCart(cart);
});
