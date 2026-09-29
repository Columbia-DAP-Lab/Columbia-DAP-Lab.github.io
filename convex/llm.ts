import { ApiError, FinishReason, GoogleGenAI } from "@google/genai/web";
import { ConvexError } from "convex/values";
import { env } from "./_generated/server";

/**
 * The one place that knows which model provider reads pasted text.
 *
 * Callers hand over a system prompt, the text, and a JSON Schema, and get back
 * parsed JSON that matches the schema. Nothing else in the app imports a provider
 * SDK, so changing provider is a change to this file alone.
 *
 * Today this is Gemini on Google Cloud (Vertex AI, now "Gemini Enterprise Agent
 * Platform"), billed to the lab's Google Cloud project. It authenticates with a
 * Google Cloud API key rather than a service-account JSON key: the key is bound to
 * a service account with only the Vertex AI User role and restricted to the Vertex
 * AI API, and it needs nothing but fetch — so this runs in the default Convex
 * runtime, and the SDK's web build is imported to keep google-auth-library out.
 *
 *   npx convex env set GEMINI_API_KEY <Google Cloud API key>
 *   npx convex env set GEMINI_MODEL gemini-3.1-pro     # optional; see MODEL
 *
 * To move to the Convex AI Gateway instead (no key to manage; needs `ai` and
 * `@convex-dev/ai-sdk-provider`, and the Node runtime):
 *
 *   1. Replace the body of `generateStructured` with
 *        const { object } = await generateObject({
 *          model: convexGateway("<provider>/<model>"),
 *          schema: jsonSchema(request.schema),
 *          system: request.system,
 *          prompt: request.text,
 *        });
 *      keeping the refusal and truncation checks as errors for the caller.
 *   2. Add "use node"; to the top of convex/extract.ts, which exports only an
 *      action for exactly this reason.
 *   3. Remove GEMINI_API_KEY and GEMINI_MODEL from convex/convex.config.ts and the
 *      deployment.
 */

/**
 * Flash rather than Pro: filling a form from an announcement is reading, not
 * reasoning, and the person is waiting on it. GEMINI_MODEL overrides it without a
 * deploy if drafts come back poor.
 */
const MODEL = "gemini-3.8-flash";

export type StructuredRequest = {
  system: string;
  /** Untrusted: whatever the person pasted. */
  text: string;
  schema: Record<string, unknown>;
  maxTokens: number;
};

export type StructuredResult = {
  data: unknown;
  model: string;
  inputTokens: number;
  outputTokens: number;
};

export const isConfigured = () => Boolean(env.GEMINI_API_KEY);

/** Finish reasons that mean the model would not answer, as opposed to ran out of room. */
const DECLINED = new Set<string>([
  FinishReason.SAFETY,
  FinishReason.RECITATION,
  FinishReason.BLOCKLIST,
  FinishReason.PROHIBITED_CONTENT,
  FinishReason.SPII,
]);

export const generateStructured = async (request: StructuredRequest): Promise<StructuredResult> => {
  if (!env.GEMINI_API_KEY) {
    throw new ConvexError("Paste-to-fill is not set up on this deployment yet.");
  }
  // Vertex AI with an API key and no project: the SDK calls the global
  // aiplatform.googleapis.com endpoint with the key in x-goog-api-key.
  // `vertexai`, not the newer `enterprise`: the web build ignores `enterprise` and
  // silently sends the request to the AI Studio API instead.
  const ai = new GoogleGenAI({ vertexai: true, apiKey: env.GEMINI_API_KEY });
  const model = env.GEMINI_MODEL || MODEL;

  let response;
  try {
    response = await ai.models.generateContent({
      model,
      contents: `<pasted>\n${request.text}\n</pasted>`,
      config: {
        systemInstruction: request.system,
        responseMimeType: "application/json",
        responseJsonSchema: request.schema,
        maxOutputTokens: request.maxTokens,
      },
    });
  } catch (error) {
    if (error instanceof ApiError) {
      if (error.status === 429 || error.status >= 500) {
        throw new ConvexError("The model is busy. Try again in a minute.");
      }
      if (error.status === 401 || error.status === 403) {
        console.error("Google Cloud rejected GEMINI_API_KEY", error.status, error.message);
        throw new ConvexError("Paste-to-fill is misconfigured; ask an admin to check the API key.");
      }
      // A 400 here is most likely the schema or the model name; the log says which.
      console.error("Gemini API error", error.status, error.message);
      throw new ConvexError("Could not read the text. Try again, or fill the form by hand.");
    }
    throw error;
  }

  const usage = response.usageMetadata;
  const candidate = response.candidates?.[0];
  console.log("extraction", {
    model,
    finish: candidate?.finishReason,
    blocked: response.promptFeedback?.blockReason,
    input: usage?.promptTokenCount,
    output: usage?.candidatesTokenCount,
    thinking: usage?.thoughtsTokenCount,
  });

  if (response.promptFeedback?.blockReason || (candidate?.finishReason && DECLINED.has(candidate.finishReason))) {
    throw new ConvexError("The model declined to read this text. Fill the form by hand.");
  }
  if (candidate?.finishReason === FinishReason.MAX_TOKENS) {
    throw new ConvexError("That is more than can be read at once. Paste fewer items.");
  }
  const text = response.text;
  if (!text) throw new ConvexError("The model returned nothing usable. Try again.");

  return {
    data: JSON.parse(text),
    model,
    inputTokens: usage?.promptTokenCount ?? 0,
    outputTokens: usage?.candidatesTokenCount ?? 0,
  };
};
