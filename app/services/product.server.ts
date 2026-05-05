import { authenticate } from "../shopify.server";

type VariantContext = {
  shop: string;
  product: {
    id: string;
    title: string;
    handle: string;
  };
  variant: {
    id: string;
    title: string;
    sku: string | null;
  };
};

const VARIANT_QUERY = `#graphql
  query GetVariantContext($id: ID!) {
    productVariant(id: $id) {
      id
      title
      sku
      product {
        id
        title
        handle
      }
    }
  }
`;

export async function getVariantContext(input: {
  request: Request;
  variantGid: string;
}): Promise<VariantContext> {
  const { admin, session } = await authenticate.public.appProxy(input.request);

  const response = await admin.graphql(VARIANT_QUERY, {
    variables: { id: input.variantGid },
  });

  const { data, errors } = await response.json();

  if (errors?.length || !data?.productVariant) {
    throw new Response(
      `Variant not found: ${input.variantGid}`,
      { status: 404 }
    );
  }

  const { productVariant } = data;

  return {
    shop: session.shop,
    product: {
      id: productVariant.product.id,
      title: productVariant.product.title,
      handle: productVariant.product.handle,
    },
    variant: {
      id: productVariant.id,
      title: productVariant.title,
      sku: productVariant.sku ?? null,
    },
  };
}
