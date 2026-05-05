import { data, type LoaderFunctionArgs } from "react-router";
import { createCustomizationSession } from "../services/customization.server";
import { getVariantContext } from "../services/product.server";
import type { CustomizerSessionResponse } from "../types/customizer";

export async function loader({ request }: LoaderFunctionArgs) {
  const url = new URL(request.url);
  const variantIdParam = url.searchParams.get("variant_id");

  if (!variantIdParam) {
    return data({ error: "Missing variant_id" }, { status: 400 });
  }

  const variantGid = variantIdParam.startsWith("gid://")
    ? variantIdParam
    : `gid://shopify/ProductVariant/${variantIdParam}`;

  const context = await getVariantContext({ request, variantGid });

  const customizationSession = await createCustomizationSession({
    shop: context.shop,
    productId: context.product.id,
    variantId: context.variant.id,
  });

  const payload: CustomizerSessionResponse = {
    sessionId: customizationSession.id,
    iframeUrl: `${process.env.CUSTOMIZER_APP_URL}/frame?session_id=${customizationSession.id}`,
    product: context.product,
    variant: context.variant,
    existingConfig: null,
    expiresAt: customizationSession.expiresAt,
  };

  return data(payload);
}
