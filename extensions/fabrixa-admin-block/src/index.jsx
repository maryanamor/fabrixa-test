/** @jsxImportSource preact */
import "@shopify/ui-extensions/preact";
import { render } from "preact";
import { useState, useEffect, useCallback } from "preact/hooks";

export default async () => {
  render(<FabrixaProductBlock />, document.body);
};

function FabrixaProductBlock() {
  const productId = shopify.data.selected[0]?.id;
  const [sku, setSku] = useState("");
  const [savedSku, setSavedSku] = useState(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [banner, setBanner] = useState(null);

  useEffect(() => {
    if (!productId) return;
    shopify
      .query(
        `query GetFabrixaSku($id: ID!) {
          product(id: $id) {
            fabrixaSku: metafield(namespace: "$app", key: "fabrixa_sku") {
              value
            }
          }
        }`,
        { variables: { id: productId } }
      )
      .then(({ data: res }) => {
        const val = res?.product?.fabrixaSku?.value ?? "";
        setSku(val);
        setSavedSku(val);
        setLoading(false);
      });
  }, [productId]);

  const handleSave = useCallback(async () => {
    setSaving(true);
    setBanner(null);

    // Ensure the metafield definition has PUBLIC_READ storefront access so
    // Liquid templates can read it on the storefront.
    const { data: defData } = await shopify.query(
      `query {
        metafieldDefinitions(first: 1, ownerType: PRODUCT, namespace: "$app", key: "fabrixa_sku") {
          nodes { id access { storefront } }
        }
      }`
    );
    const def = defData?.metafieldDefinitions?.nodes?.[0];

    if (!def) {
      await shopify.query(
        `mutation {
          metafieldDefinitionCreate(definition: {
            name: "Fabrixa SKU"
            namespace: "$app"
            key: "fabrixa_sku"
            type: "single_line_text_field"
            ownerType: PRODUCT
            access: { admin: MERCHANT_READ_WRITE, storefront: PUBLIC_READ }
          }) { createdDefinition { id } userErrors { field message } }
        }`
      );
    } else if (def.access?.storefront !== "PUBLIC_READ") {
      await shopify.query(
        `mutation UpdateDef($id: ID!) {
          metafieldDefinitionUpdate(definition: {
            id: $id
            access: { admin: MERCHANT_READ_WRITE, storefront: PUBLIC_READ }
          }) { updatedDefinition { id } userErrors { field message } }
        }`,
        { variables: { id: def.id } }
      );
    }

    const { data: res } = await shopify.query(
      `mutation SetFabrixaSku($ownerId: ID!, $value: String!) {
        metafieldsSet(metafields: [{ ownerId: $ownerId, namespace: "$app", key: "fabrixa_sku", value: $value }]) {
          metafields { value }
          userErrors { field message }
        }
      }`,
      { variables: { ownerId: productId, value: sku } }
    );
    const errors = res?.metafieldsSet?.userErrors;
    if (errors?.length) {
      setBanner({ tone: "critical", text: errors[0].message });
    } else {
      setSavedSku(sku);
      setBanner({ tone: "success", text: "SKU saved." });
    }
    setSaving(false);
  }, [productId, sku]);

  if (loading) {
    return (
      <s-admin-block heading="Fabrixa Customizer">
        <s-spinner />
      </s-admin-block>
    );
  }

  return (
    <s-admin-block heading="Fabrixa Customizer">
      <s-stack direction="block" gap="base">
        {banner && (
          <s-banner tone={banner.tone} dismissible>
            {banner.text}
          </s-banner>
        )}
        <s-text-field
          label="Fabrixa SKU"
          value={sku}
          onInput={(e) => setSku(e.target.value)}
          placeholder="e.g. MY-PRODUCT-SKU"
          details="The SKU from your Fabrixa account that links this product to its customizer"
        />
        <s-button
          variant="primary"
          onClick={handleSave}
          {...(saving ? { loading: true } : {})}
          {...(sku === savedSku || saving ? { disabled: true } : {})}
        >
          Save
        </s-button>
      </s-stack>
    </s-admin-block>
  );
}