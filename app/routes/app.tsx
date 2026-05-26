import type { HeadersFunction, LoaderFunctionArgs } from "react-router";
import { Outlet, useLoaderData, useRouteError } from "react-router";
import { boundary } from "@shopify/shopify-app-react-router/server";
import { AppProvider } from "@shopify/shopify-app-react-router/react";

import { authenticate } from "../shopify.server";

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { admin } = await authenticate.admin(request);
  await ensureFabrixaSkuDefinition(admin);
  // eslint-disable-next-line no-undef
  return { apiKey: process.env.SHOPIFY_API_KEY || "" };
};

async function ensureFabrixaSkuDefinition(admin: { graphql: Function }) {
  const res = await admin.graphql(`#graphql
    query {
      metafieldDefinitions(first: 1, ownerType: PRODUCT, namespace: "$app", key: "fabrixa_sku") {
        nodes { id access { storefront } }
      }
    }
  `);
  const body = await res.json();
  const def = body.data?.metafieldDefinitions?.nodes?.[0];
  console.log("[Fabrixa] metafield definition:", JSON.stringify(def ?? "not found"));

  if (def?.access?.storefront === "PUBLIC_READ") {
    console.log("[Fabrixa] definition already has PUBLIC_READ — skipping");
    return;
  }

  if (def) {
    const updateRes = await admin.graphql(
      `#graphql
      mutation UpdateDef($id: ID!) {
        metafieldDefinitionUpdate(definition: {
          id: $id
          access: { admin: MERCHANT_READ_WRITE, storefront: PUBLIC_READ }
        }) { updatedDefinition { id access { storefront } } userErrors { field message } }
      }`,
      { variables: { id: def.id } },
    );
    const updateBody = await updateRes.json();
    console.log("[Fabrixa] update result:", JSON.stringify(updateBody.data?.metafieldDefinitionUpdate));
  } else {
    const createRes = await admin.graphql(`#graphql
      mutation {
        metafieldDefinitionCreate(definition: {
          name: "Fabrixa SKU"
          namespace: "$app"
          key: "fabrixa_sku"
          type: "single_line_text_field"
          ownerType: PRODUCT
          access: { admin: MERCHANT_READ_WRITE, storefront: PUBLIC_READ }
        }) { createdDefinition { id access { storefront } } userErrors { field message } }
      }
    `);
    const createBody = await createRes.json();
    console.log("[Fabrixa] create result:", JSON.stringify(createBody.data?.metafieldDefinitionCreate));
  }
}

export default function App() {
  const { apiKey } = useLoaderData<typeof loader>();

  return (
    <AppProvider embedded apiKey={apiKey}>
      <s-app-nav>
        <s-link href="/app">Home</s-link>
        <s-link href="/app/additional">Additional page</s-link>
      </s-app-nav>
      <Outlet />
    </AppProvider>
  );
}

// Shopify needs React Router to catch some thrown responses, so that their headers are included in the response.
export function ErrorBoundary() {
  return boundary.error(useRouteError());
}

export const headers: HeadersFunction = (headersArgs) => {
  return boundary.headers(headersArgs);
};
