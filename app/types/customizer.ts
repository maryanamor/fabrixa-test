export type CustomizerSessionResponse = {
  sessionId: string;
  iframeUrl: string;
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
  existingConfig: Record<string, unknown> | null;
  expiresAt: string;
};

export type SaveCustomizationRequest = {
  sessionId: string;
  config: Record<string, unknown>;
  summary: {
    text: string;
    options?: Array<{ key: string; value: string }>;
  };
  previewUrl?: string;
  parentOrigin: string;
};

export type SaveCustomizationResponse = {
  ok: true;
  configId: string;
  summaryText: string;
  previewUrl?: string;
  parentOrigin: string;
};
