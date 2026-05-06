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

  /* ── Resolve Fabrixa product/variant IDs ──
     Priority order:
       1. data-fabrixa-product-id / data-fabrixa-variant-id on the currently
          selected variant <option> (set via section schema or theme code)
       2. Metafield variant map (JSON stored in wrapper data-variant-map)
       3. Fallback to global window vars if set by theme
  ── */
  function getFabrixaIds() {
    // 1. Try currently selected Shopify variant
    var variantSelect = document.querySelector('[name="id"]');
    var shopifyVariantId = variantSelect ? variantSelect.value : null;

    // 2. Try variant map (JSON metafield: {"shopify_variant_id": {"product_id": X, "variant_id": Y}})
    var mapRaw = wrapper.dataset.variantMap;
    if (mapRaw && shopifyVariantId) {
      try {
        var map = JSON.parse(mapRaw);
        if (map[shopifyVariantId]) {
          return {
            productId:  map[shopifyVariantId].product_id,
            variantId:  map[shopifyVariantId].variant_id,
            shopifyVariantId: shopifyVariantId
          };
        }
      } catch (_) {}
    }

    // 3. Fallback: look for data attributes on the selected <option>
    if (variantSelect && variantSelect.tagName === 'SELECT') {
      var selectedOpt = variantSelect.options[variantSelect.selectedIndex];
      if (selectedOpt) {
        var pid = selectedOpt.dataset.fabrixaProductId;
        var vid = selectedOpt.dataset.fabrixaVariantId;
        if (pid && vid) return { productId: pid, variantId: vid, shopifyVariantId: shopifyVariantId };
      }
    }

    // 4. Block settings fallback (data-product-id / data-variant-id set in theme editor)
    var wPid = wrapper.dataset.productId;
    var wVid = wrapper.dataset.variantId;
    if (wPid && wVid) {
      return { productId: wPid, variantId: wVid, shopifyVariantId: shopifyVariantId };
    }

    // 5. Global fallback (set in theme liquid via window.fabrixaProductId etc.)
    if (window.fabrixaProductId && window.fabrixaVariantId) {
      return {
        productId: window.fabrixaProductId,
        variantId: window.fabrixaVariantId,
        shopifyVariantId: shopifyVariantId
      };
    }

    return null;
  }

  /* ── Build widget URL ── */
  function buildWidgetUrl(ids, cartItemKey) {
    var url = new URL(widgetBaseUrl);
    url.searchParams.set('application_key',       appKey);
    url.searchParams.set('product_id',            ids.productId);
    url.searchParams.set('product_variant_id',    ids.variantId);
    url.searchParams.set('cart_item_key',         cartItemKey);
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
      console.warn('[Fabrixa] Could not resolve product/variant IDs. Check your variant map configuration.');
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
          // Notify theme to refresh cart count / drawer (works with Dawn and most themes)
          document.dispatchEvent(new CustomEvent('cart:refresh'));
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
