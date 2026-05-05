(function () {
  'use strict';

  function generateUUID() {
    if (typeof crypto !== 'undefined' && crypto.randomUUID) {
      return crypto.randomUUID();
    }
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function (c) {
      var r = (Math.random() * 16) | 0;
      var v = c === 'x' ? r : (r & 0x3) | 0x8;
      return v.toString(16);
    });
  }

  function getOrCreateCartItemKey(variantId) {
    var key = 'fabrixa_cart_key_' + variantId;
    try {
      var stored = sessionStorage.getItem(key);
      if (stored) return stored;
      var newKey = generateUUID();
      sessionStorage.setItem(key, newKey);
      return newKey;
    } catch (_) {
      return generateUUID();
    }
  }

  function resetCartItemKey(variantId) {
    try { sessionStorage.removeItem('fabrixa_cart_key_' + variantId); } catch (_) {}
    return getOrCreateCartItemKey(variantId);
  }

  /* ── Inject cart_item_key directly into the theme's Add to Cart form ── */
  function injectCartKey(key) {
    var form = document.querySelector('form[action="/cart/add"]');
    if (!form) return;

    // Update if already exists, otherwise create
    var existing = form.querySelector('[name="properties[_fabrixa_cart_item_key]"]');
    if (existing) {
      existing.value = key;
      return;
    }

    var input = document.createElement('input');
    input.type = 'hidden';
    input.name = 'properties[_fabrixa_cart_item_key]';
    input.value = key;
    form.appendChild(input);
  }

  /* ── DOM refs ── */
  var wrapper = document.getElementById('fabrixa-widget-wrapper');
  if (!wrapper) return;

  var openBtn      = document.getElementById('fabrixa-open-btn');
  var modal        = document.getElementById('fabrixa-modal');
  var modalClose   = document.getElementById('fabrixa-modal-close');
  var iframe       = document.getElementById('fabrixa-iframe');
  var loading      = document.getElementById('fabrixa-modal-loading');
  var previewCont  = document.getElementById('fabrixa-preview-container');
  var previewImg   = document.getElementById('fabrixa-preview-img');
  var reEditBtn    = document.getElementById('fabrixa-re-edit-btn');
  var cartKeyInput = document.getElementById('fabrixa-cart-item-key-input');

  /* ── Config from block settings (via data attributes) ── */
  var appKey           = wrapper.dataset.applicationKey || '';
  var widgetBaseUrl    = wrapper.dataset.widgetBaseUrl  || 'https://dev-widget.fabrixa.com';
  var previewBase      = wrapper.dataset.apiPreviewBase || 'https://api.fabrixa.com/v2/shop/integration/product-customizations';
  var fabrixaProductId = wrapper.dataset.productId      || '';
  var fabrixaVariantId = wrapper.dataset.variantId      || '';
  var trustedOrigin    = new URL(widgetBaseUrl).origin;

  function getShopifyVariantId() {
    var sel = document.querySelector('[name="id"]');
    return sel ? sel.value : 'default';
  }

  function buildWidgetUrl(cartItemKey) {
    var url = new URL(widgetBaseUrl);
    url.searchParams.set('application_key',    appKey);
    url.searchParams.set('product_id',         fabrixaProductId);
    url.searchParams.set('product_variant_id', fabrixaVariantId);
    url.searchParams.set('cart_item_key',      cartItemKey);
    return url.toString();
  }

  function buildPreviewUrl(cartItemKey) {
    return previewBase + '/' + encodeURIComponent(cartItemKey) + '/preview?Application-Key=' + encodeURIComponent(appKey);
  }

  function openModal(cartItemKey) {
    if (!fabrixaProductId || !fabrixaVariantId) {
      alert('Fabrixa Product ID and Variant ID are not configured. Please set them in the theme editor block settings.');
      return;
    }
    loading.classList.remove('fabrixa-hidden');
    iframe.src = buildWidgetUrl(cartItemKey);
    modal.style.display = 'flex';
    document.body.classList.add('fabrixa-modal-open');
  }

  function closeModal() {
    modal.style.display = 'none';
    document.body.classList.remove('fabrixa-modal-open');
    iframe.src = '';
  }

  function showPreview(cartItemKey) {
    previewImg.src = buildPreviewUrl(cartItemKey);
    previewCont.style.display = 'block';
    openBtn.style.display = 'none';
  }

  /* ── iframe load → hide spinner ── */
  iframe.addEventListener('load', function () {
    if (iframe.src) loading.classList.add('fabrixa-hidden');
  });

  /* ── Open button ── */
  openBtn.addEventListener('click', function () {
    var key = getOrCreateCartItemKey(getShopifyVariantId());
    cartKeyInput.value = key;
    injectCartKey(key);
    openModal(key);
  });

  /* ── Re-edit button ── */
  reEditBtn.addEventListener('click', function () {
    var key = getOrCreateCartItemKey(getShopifyVariantId());
    cartKeyInput.value = key;
    injectCartKey(key);
    openModal(key);
  });

  /* ── Close button / overlay click ── */
  modalClose.addEventListener('click', closeModal);
  modal.addEventListener('click', function (e) {
    if (e.target === modal) closeModal();
  });

  /* ── Keyboard: Escape closes modal ── */
  document.addEventListener('keydown', function (e) {
    if (e.key === 'Escape' && modal.style.display !== 'none') closeModal();
  });

  /* ── postMessage from Fabrixa widget ── */
  window.addEventListener('message', function (event) {
    if (event.origin !== trustedOrigin) return;

    if (event.data === 'customizationFinished') {
      closeModal();
      var key = cartKeyInput.value;
      showPreview(key);
      injectCartKey(key);
      document.dispatchEvent(new CustomEvent('fabrixa:customizationFinished', {
        detail: { cartItemKey: key }
      }));
    }

    if (event.data === 'closeButtonClicked') {
      closeModal();
      document.dispatchEvent(new CustomEvent('fabrixa:widgetClosed'));
    }
  });

  /* ── Shopify variant change → reset key ── */
  document.addEventListener('change', function (e) {
    if (e.target && e.target.name === 'id') {
      var newKey = resetCartItemKey(e.target.value);
      cartKeyInput.value = newKey;
      injectCartKey(newKey);
      previewCont.style.display = 'none';
      openBtn.style.display = '';
    }
  });

  /* ── Init: inject key immediately on page load ── */
  var initKey = getOrCreateCartItemKey(getShopifyVariantId());
  cartKeyInput.value = initKey;
  injectCartKey(initKey);

})();
