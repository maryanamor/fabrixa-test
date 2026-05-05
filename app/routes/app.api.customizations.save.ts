import { data, type ActionFunctionArgs } from "react-router";
import { saveCustomization } from "../services/customization.server";
import type {
  SaveCustomizationRequest,
  SaveCustomizationResponse,
} from "../types/customizer";

export async function action({ request }: ActionFunctionArgs) {
  const body = (await request.json()) as SaveCustomizationRequest;

  if (!body.sessionId || !body.summary?.text || !body.config) {
    return data({ error: "Invalid payload" }, { status: 400 });
  }

  const result = await saveCustomization({
    sessionId: body.sessionId,
    configJson: body.config,
    summaryText: body.summary.text,
    previewUrl: body.previewUrl,
  });

  const response: SaveCustomizationResponse = {
    ok: true,
    configId: result.id,
    summaryText: result.summaryText,
    previewUrl: result.previewUrl,
    parentOrigin: body.parentOrigin,
  };

  return data(response);
}
