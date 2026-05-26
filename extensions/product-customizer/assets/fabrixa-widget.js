(function () {
  'use strict';

  var cfg = window.__fabrixa;
  if (!cfg || !cfg.sku) return;

  var form = document.querySelector('form[action="/cart/add"]');
  if (!form) return;

  var trustedOrigin = new URL(cfg.widgetBaseUrl).origin;

  /* ── Cart key ── */
  function cartKey(variantId) {
    var k = 'fabrixa_key_' + variantId;
    try {
      return sessionStorage.getItem(k) || (function () {
        var v = crypto.randomUUID ? crypto.randomUUID() : Math.random().toString(36).slice(2);
        sessionStorage.setItem(k, v);
        return v;
      })();
    } catch (_) { return Math.random().toString(36).slice(2); }
  }

  function resetCartKey(variantId) {
    try { sessionStorage.removeItem('fabrixa_key_' + variantId); } catch (_) {}
    return cartKey(variantId);
  }

  function variantId() {
    var s = document.querySelector('[name="id"]');
    return s ? s.value : 'default';
  }

  function setHiddenKey(key) {
    var el = form.querySelector('[name="properties[_fabrixa_cart_item_key]"]');
    if (el) { el.value = key; return; }
    el = document.createElement('input');
    el.type = 'hidden';
    el.name = 'properties[_fabrixa_cart_item_key]';
    el.value = key;
    form.appendChild(el);
  }

  /* ── Build UI ── */
  var btn = document.createElement('button');
  btn.type = 'button';
  btn.className = 'fabrixa-customize-btn';
  btn.setAttribute('aria-label', 'Open design customizer');
  btn.innerHTML =
    '<svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 20h9"/><path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4 12.5-12.5z"/></svg> ' +
    (cfg.buttonLabel || 'Customize this product');

  var preview = document.createElement('div');
  preview.className = 'fabrixa-preview-container';
  preview.style.display = 'none';
  preview.setAttribute('aria-live', 'polite');
  preview.innerHTML =
    '<div class="fabrixa-preview-header">' +
      '<span class="fabrixa-preview-label">Your customization</span>' +
      '<button type="button" class="fabrixa-re-edit-btn" id="fabrixa-re-edit-btn">Edit again</button>' +
    '</div>' +
    '<img id="fabrixa-preview-img" class="fabrixa-preview-img" src="" alt="Customized product preview" loading="lazy" />';

  var modal = document.createElement('div');
  modal.id = 'fabrixa-modal';
  modal.className = 'fabrixa-modal';
  modal.setAttribute('role', 'dialog');
  modal.setAttribute('aria-modal', 'true');
  modal.style.display = 'none';
  modal.innerHTML =
    '<div class="fabrixa-modal-inner">' +
      '<button type="button" class="fabrixa-modal-close" id="fabrixa-modal-close" aria-label="Close customizer">&times;</button>' +
      '<div class="fabrixa-modal-loading" id="fabrixa-modal-loading"><div class="fabrixa-spinner"></div><span>Loading customizer…</span></div>' +
      '<iframe id="fabrixa-iframe" name="FabrixaDesignWidget" class="fabrixa-iframe" src="" frameborder="0" allowfullscreen title="Fabrixa Design Widget"></iframe>' +
    '</div>';

  form.insertAdjacentElement('afterend', preview);
  form.insertAdjacentElement('afterend', btn);
  document.body.appendChild(modal);

  var iframe     = document.getElementById('fabrixa-iframe');
  var loading    = document.getElementById('fabrixa-modal-loading');
  var previewImg = document.getElementById('fabrixa-preview-img');
  var reEditBtn  = document.getElementById('fabrixa-re-edit-btn');
  var modalClose = document.getElementById('fabrixa-modal-close');

  setHiddenKey(cartKey(variantId()));

  /* ── URL builders ── */
  function widgetUrl(key) {
    var url = new URL(cfg.widgetBaseUrl);
    url.searchParams.set('application_key', cfg.appKey);
    url.searchParams.set('sku', cfg.sku);
    url.searchParams.set('cart_item_key', key);
    return url.toString();
  }

  function previewUrl(key) {
    return 'https://api.fabrixa.com/v2/shop/integration/product-customizations/' +
      encodeURIComponent(key) + '/preview?Application-Key=' + encodeURIComponent(cfg.appKey);
  }

  /* ── Modal ── */
  function openModal(key) {
    loading.classList.remove('fabrixa-hidden');
    iframe.src = widgetUrl(key);
    modal.style.display = 'flex';
    document.body.classList.add('fabrixa-modal-open');
  }

  function closeModal() {
    modal.style.display = 'none';
    document.body.classList.remove('fabrixa-modal-open');
    iframe.src = '';
  }

  /* ── Cart refresh ── */
  function refreshCartUI() {
    fetch('/?sections=cart-drawer,cart-icon-bubble&_t=' + Date.now())
      .then(function (r) { return r.json(); })
      .then(function (data) {
        var p = new DOMParser();
        if (data['cart-icon-bubble']) {
          var el = document.getElementById('cart-icon-bubble');
          if (el) { var s = p.parseFromString(data['cart-icon-bubble'], 'text/html').querySelector('.shopify-section'); if (s) el.innerHTML = s.innerHTML; }
        }
        if (data['cart-drawer']) {
          var dr = document.querySelector('#CartDrawer');
          if (dr) { var nd = p.parseFromString(data['cart-drawer'], 'text/html').querySelector('#CartDrawer'); if (nd) dr.innerHTML = nd.innerHTML; }
        }
        document.dispatchEvent(new CustomEvent('cart:refresh', { bubbles: true }));
        document.dispatchEvent(new CustomEvent('cart:updated', { bubbles: true }));
      }).catch(function () {});
  }

  /* ── Events ── */
  iframe.addEventListener('load', function () { if (iframe.src) loading.classList.add('fabrixa-hidden'); });

  btn.addEventListener('click', function () {
    var key = cartKey(variantId());
    setHiddenKey(key);
    openModal(key);
  });

  reEditBtn.addEventListener('click', function () { openModal(cartKey(variantId())); });

  modalClose.addEventListener('click', closeModal);
  modal.addEventListener('click', function (e) { if (e.target === modal) closeModal(); });
  document.addEventListener('keydown', function (e) { if (e.key === 'Escape' && modal.style.display !== 'none') closeModal(); });

  document.addEventListener('change', function (e) {
    if (e.target && e.target.name === 'id') {
      var newKey = resetCartKey(e.target.value);
      setHiddenKey(newKey);
      preview.style.display = 'none';
      btn.style.display = '';
    }
  });

  window.addEventListener('message', function (event) {
    if (event.origin !== trustedOrigin) return;

    if (event.data === 'customizationFinished') {
      closeModal();
      var key = (form.querySelector('[name="properties[_fabrixa_cart_item_key]"]') || {}).value || cartKey(variantId());
      previewImg.src = previewUrl(key);
      preview.style.display = 'block';
      btn.style.display = 'none';

      var vid = variantId();
      if (vid && vid !== 'default') {
        var qty = parseInt(((document.querySelector('[name="quantity"]') || {}).value || '1'), 10);
        fetch('/cart/add.js', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ items: [{ id: parseInt(vid, 10), quantity: qty || 1, properties: { _fabrixa_cart_item_key: key } }] })
        })
          .then(function (r) { return r.json(); })
          .then(function (cart) {
            refreshCartUI();
            document.dispatchEvent(new CustomEvent('fabrixa:addedToCart', { detail: { cartItemKey: key, cart: cart } }));
          })
          .catch(function (err) {
            document.dispatchEvent(new CustomEvent('fabrixa:error', { detail: { error: err.message } }));
          });
      }
      document.dispatchEvent(new CustomEvent('fabrixa:customizationFinished', { detail: { cartItemKey: key } }));
    }

    if (event.data === 'closeButtonClicked') {
      closeModal();
      document.dispatchEvent(new CustomEvent('fabrixa:widgetClosed'));
    }
  });
})();