/**
 * Fabrixa Design Widget — Shopify Integration
 * --------------------------------------------
 * Handles:
 *  - Opening the Fabrixa widget in a modal iframe
 *  - Generating a unique cart_item_key per session/variant
 *  - Receiving postMessage events from the widget iframe
 *  - Displaying the customization preview image
 *  - Persisting cart_item_key to the add-to-cart form
 */

(function () {
  'use strict';

  /* ── Helpers ── */
  function generateUUID() {
    if (typeof crypto !== 'undefined' && crypto.randomUUID) {
      return crypto.randomUUID();
    }
    // Fallback for older browsers
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function (c) {
      var r = (Math.random() * 16) | 0;
      var v = c === 'x' ? r : (r & 0x3) | 0x8;
      return v.toString(16);
    });
  }

  function storageKey(variantId) {
    return 'fabrixa_cart_key_' + variantId;
  }

  function getOrCreateCartItemKey(variantId) {
    try {
      var key = sessionStorage.getItem(storageKey(variantId));
      if (key) return key;
      key = generateUUID();
      sessionStorage.setItem(storageKey(variantId), key);
      return key;
    } catch (_) {
      return generateUUID(); // storage blocked — use ephemeral key
    }
  }

  function resetCartItemKey(variantId) {
    try { sessionStorage.removeItem(storageKey(variantId)); } catch (_) {}
    return getOrCreateCartItemKey(variantId);
  }

  function injectCartKey(key) {
    var form = document.querySelector('form[action="/cart/add"]');
    if (!form) return;
    var existing = form.querySelector('[name="properties[_fabrixa_cart_item_key]"]');
    if (existing) { existing.value = key; return; }
    var input = document.createElement('input');
    input.type = 'hidden';
    input.name = 'properties[_fabrixa_cart_item_key]';
    input.value = key;
    form.appendChild(input);
  }

  /* ── DOM refs ── */
  var wrapper       = document.getElementById('fabrixa-widget-wrapper');
  if (!wrapper) return; // snippet not present on this page

  var openBtn       = document.getElementById('fabrixa-open-btn');
  var modal         = document.getElementById('fabrixa-modal');
  var modalClose    = document.getElementById('fabrixa-modal-close');
  var iframe        = document.getElementById('fabrixa-iframe');
  var loading       = document.getElementById('fabrixa-modal-loading');
  var previewCont   = document.getElementById('fabrixa-preview-container');
  var previewImg    = document.getElementById('fabrixa-preview-img');
  var reEditBtn     = document.getElementById('fabrixa-re-edit-btn');
  var cartKeyInput  = document.getElementById('fabrixa-cart-item-key-input');

  /* ── Config from data attributes ── */
  var appKey        = wrapper.dataset.applicationKey   || '';
  var widgetBaseUrl = wrapper.dataset.widgetBaseUrl    || 'https://dev-widget.fabrixa.com';
  var previewBase   = wrapper.dataset.apiPreviewBase   || 'https://api.fabrixa.com/v2/shop/integration/product-customizations';
  var trustedOrigin = new URL(widgetBaseUrl).origin;

  /* ── Resolve Fabrixa SKU from product metafield (set via Admin Block) ── */
  function getFabrixaIds() {
    var variantSelect = document.querySelector('[name="id"]');
    var shopifyVariantId = variantSelect ? variantSelect.value : null;
    var sku = wrapper.dataset.sku || null;
    return sku ? { sku: sku, shopifyVariantId: shopifyVariantId } : null;
  }

  /* ── Build widget URL ── */
  function buildWidgetUrl(ids, cartItemKey) {
    var url = new URL(widgetBaseUrl);
    url.searchParams.set('application_key', appKey);
    url.searchParams.set('sku',             ids.sku);
    url.searchParams.set('cart_item_key',   cartItemKey);
    return url.toString();
  }

  /* ── Build preview URL ── */
  function buildPreviewUrl(cartItemKey) {
    return previewBase + '/' + encodeURIComponent(cartItemKey) + '/preview?Application-Key=' + encodeURIComponent(appKey);
  }

  /* ── Open modal ── */
  function openModal(cartItemKey, ids) {
    var src = buildWidgetUrl(ids, cartItemKey);
    loading.classList.remove('fabrixa-hidden');
    iframe.src = src;
    modal.style.display = 'flex';
    document.body.classList.add('fabrixa-modal-open');
    modal.focus();
  }

  /* ── Close modal ── */
  function closeModal() {
    modal.style.display = 'none';
    document.body.classList.remove('fabrixa-modal-open');
    iframe.src = '';
  }

  /* ── Show preview ── */
  function showPreview(cartItemKey) {
    var url = buildPreviewUrl(cartItemKey);
    previewImg.src = url;
    previewCont.style.display = 'block';
    openBtn.style.display = 'none';
  }

  /* ── Add customized product to cart via Shopify Cart API ── */
  function getQuantity() {
    var input = document.querySelector('[name="quantity"]');
    var q = input ? parseInt(input.value, 10) : 1;
    return q > 0 ? q : 1;
  }

  function addToCart(shopifyVariantId, cartItemKey, onSuccess, onError) {
    fetch('/cart/add.js', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        items: [{
          id: parseInt(shopifyVariantId, 10),
          quantity: getQuantity(),
          properties: { _fabrixa_cart_item_key: cartItemKey }

        }]
      })
    })
    .then(function (res) {
      if (!res.ok) return res.json().then(function (body) { throw new Error(body.description || res.status); });
      return res.json();
    })
    .then(onSuccess)
    .catch(onError);
  }

  /* ── Refresh cart UI ──
     Fetches fresh section HTML after the cart add so the rendered output
     is guaranteed to include the newly added item. Uses innerHTML on the
     section wrapper (not outerHTML) so the wrapper element stays in place
     while the cart-drawer custom element inside it is replaced and
     re-instantiated by the browser.
  ── */
  function refreshCartUI() {
    fetch('/?sections=cart-drawer,cart-icon-bubble&_t=' + Date.now())
      .then(function (r) { return r.json(); })
      .then(function (data) {
        var parser = new DOMParser();

        // cart-icon-bubble: Dawn renders this with id="cart-icon-bubble"
        if (data['cart-icon-bubble']) {
          var bubbleEl = document.getElementById('cart-icon-bubble');
          if (bubbleEl) {
            var inner = parser.parseFromString(data['cart-icon-bubble'], 'text/html')
                              .querySelector('.shopify-section');
            if (inner) bubbleEl.innerHTML = inner.innerHTML;
          }
        }

        // cart-drawer: update only innerHTML of #CartDrawer (Dawn's selector).
        // Never touch className — changing it triggers the overlay without the
        // open animation and breaks the drawer's internal state.
        if (data['cart-drawer']) {
          var drawerEl = document.querySelector('#CartDrawer');
          if (drawerEl) {
            var newDrawer = parser.parseFromString(data['cart-drawer'], 'text/html')
                                  .querySelector('#CartDrawer');
            if (newDrawer) drawerEl.innerHTML = newDrawer.innerHTML;
          }
        }

        document.dispatchEvent(new CustomEvent('cart:refresh', { bubbles: true }));
        document.dispatchEvent(new CustomEvent('cart:updated', { bubbles: true }));
      })
      .catch(function () {});
  }

  /* ── Update hidden input for cart ── */
  function setCartKey(key) {
    cartKeyInput.value = key;
    injectCartKey(key);
  }

  /* ── iframe loaded — hide spinner ── */
  iframe.addEventListener('load', function () {
    if (iframe.src) {
      loading.classList.add('fabrixa-hidden');
    }
  });

  /* ── Open button click ── */
  openBtn.addEventListener('click', function () {
    var ids = getFabrixaIds();
    if (!ids) {
      console.warn('[Fabrixa] Could not resolve SKU. Check your block settings or variant map configuration.');
      alert('Customizer is not configured for this product yet.');
      return;
    }
    var cartItemKey = getOrCreateCartItemKey(ids.shopifyVariantId || 'default');
    setCartKey(cartItemKey);
    openModal(cartItemKey, ids);
  });

  /* ── Re-edit button ── */
  reEditBtn.addEventListener('click', function () {
    var ids = getFabrixaIds();
    if (!ids) return;
    var cartItemKey = getOrCreateCartItemKey(ids.shopifyVariantId || 'default');
    setCartKey(cartItemKey);
    openModal(cartItemKey, ids);
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

  /* ── postMessage listener from Fabrixa widget ── */
  window.addEventListener('message', function (event) {
    // Security: only trust messages from the Fabrixa widget origin
    if (event.origin !== trustedOrigin) return;

    if (event.data === 'customizationFinished') {
      console.log('[Fabrixa] Customization saved.');
      closeModal();

      var ids = getFabrixaIds();
      var cartItemKey = cartKeyInput.value || getOrCreateCartItemKey(
        ids ? (ids.shopifyVariantId || 'default') : 'default'
      );

      showPreview(cartItemKey);

      if (ids && ids.shopifyVariantId) {
        addToCart(ids.shopifyVariantId, cartItemKey, function (cartData) {
          console.log('[Fabrixa] Added to cart.');
          refreshCartUI();
          document.dispatchEvent(new CustomEvent('fabrixa:addedToCart', {
            detail: { cartItemKey: cartItemKey, cart: cartData }
          }));
          document.dispatchEvent(new CustomEvent('fabrixa:customizationFinished', {
            detail: { cartItemKey: cartItemKey }
          }));
        }, function (err) {
          console.error('[Fabrixa] Add to cart failed:', err.message);
          document.dispatchEvent(new CustomEvent('fabrixa:customizationFinished', {
            detail: { cartItemKey: cartItemKey, cartError: err.message }
          }));
        });
      } else {
        document.dispatchEvent(new CustomEvent('fabrixa:customizationFinished', {
          detail: { cartItemKey: cartItemKey }
        }));
      }
    }

    if (event.data === 'closeButtonClicked') {
      console.log('[Fabrixa] Widget back button clicked.');
      closeModal();

      document.dispatchEvent(new CustomEvent('fabrixa:widgetClosed'));
    }
  });

  /* ── React to Shopify variant changes ──
     When the customer switches variant, reset the cart key so a new
     customization session begins for the new variant.
  ── */
  document.addEventListener('change', function (e) {
    if (e.target && e.target.name === 'id') {
      var newShopifyVariantId = e.target.value;
      var newKey = resetCartItemKey(newShopifyVariantId);
      setCartKey(newKey);
      // Hide any previous preview since variant changed
      previewCont.style.display = 'none';
      openBtn.style.display = '';
      console.log('[Fabrixa] Variant changed to', newShopifyVariantId, '— new cart_item_key:', newKey);
    }
  });

  /* ── Init: set cart key for current variant immediately ── */
  (function init() {
    var ids = getFabrixaIds();
    var variantId = ids ? (ids.shopifyVariantId || 'default') : 'default';
    setCartKey(getOrCreateCartItemKey(variantId));
  })();

})();
