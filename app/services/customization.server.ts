import { randomUUID } from "node:crypto";

type CustomizationSession = {
  id: string;
  shop: string;
  productId: string;
  variantId: string;
  configJson: Record<string, unknown> | null;
  summaryText: string | null;
  previewUrl: string | null;
  status: "draft" | "completed";
  expiresAt: string;
  createdAt: string;
  updatedAt?: string;
};

const sessions = new Map<string, CustomizationSession>();

export async function createCustomizationSession(input: {
  shop: string;
  productId: string;
  variantId: string;
}) {
  const id = `cfgsess_${randomUUID()}`;
  const expiresAt = new Date(Date.now() + 1000 * 60 * 30).toISOString();

  const session: CustomizationSession = {
    id,
    shop: input.shop,
    productId: input.productId,
    variantId: input.variantId,
    configJson: null,
    summaryText: null,
    previewUrl: null,
    status: "draft",
    createdAt: new Date().toISOString(),
    expiresAt,
  };

  sessions.set(id, session);
  return session;
}

export async function getCustomizationSession(sessionId: string) {
  return sessions.get(sessionId) ?? null;
}

export async function saveCustomization(input: {
  sessionId: string;
  configJson: Record<string, unknown>;
  summaryText: string;
  previewUrl?: string;
}) {
  const existing = sessions.get(input.sessionId);

  if (!existing) {
    throw new Response("Session not found", { status: 404 });
  }

  const updated: CustomizationSession = {
    ...existing,
    configJson: input.configJson,
    summaryText: input.summaryText,
    previewUrl: input.previewUrl ?? null,
    status: "completed",
    updatedAt: new Date().toISOString(),
  };

  sessions.set(input.sessionId, updated);

  return {
    id: updated.id,
    summaryText: updated.summaryText ?? "",
    previewUrl: updated.previewUrl ?? undefined,
  };
}
