import { data, type LoaderFunctionArgs } from "react-router";
import { authenticate } from "../shopify.server";

const METAFIELD_QUERY = `#graphql
  query GetFabrixaSku($id: ID!) {
    product(id: $id) {
      fabrixaSku: metafield(namespace: "$app", key: "fabrixa_sku") {
        value
      }
    }
  }
`;

export async function loader({ request }: LoaderFunctionArgs) {
  const url = new URL(request.url);
  const productId = url.searchParams.get("product_id");

  if (!productId) {
    return data({ sku: "" }, { status: 400 });
  }

  const productGid = productId.startsWith("gid://")
    ? productId
    : `gid://shopify/Product/${productId}`;

  const { admin } = await authenticate.public.appProxy(request);

  const response = await admin.graphql(METAFIELD_QUERY, {
    variables: { id: productGid },
  });

  const { data: res } = await response.json();
  const sku = res?.product?.fabrixaSku?.value ?? "";

  return data({ sku });
}