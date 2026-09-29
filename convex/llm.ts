import Anthropic from "@anthropic-ai/sdk";
import { ConvexError } from "convex/values";
import { env } from "./_generated/server";

/**
 * The one place that knows which model provider reads pasted text.
 *
 * Callers hand over a system prompt, the text, and a JSON Schema, and get back
 * parsed JSON that matches the schema. Nothing else in the app imports a provider
 * SDK, so changing provider is a change to this file alone.
 *
 * Today this calls Anthropic directly with ANTHROPIC_API_KEY. To move to the Convex
 * AI Gateway once the Convex plan includes it (no key to manage; needs
 * `ai` and `@convex-dev/ai-sdk-provider`, and the Node runtime):
 *
 *   1. Replace the body of `generateStructured` with
 *        const { object, usage } = await generateObject({
 *          model: convexGateway("anthropic/<model>"),
 *          schema: jsonSchema(request.schema),
 *          system: request.system,
 *          prompt: request.text,
 *        });
 *      keeping the refusal and truncation checks as errors for the caller.
 *   2. Add "use node"; to the top of convex/extract.ts, which exports only an
 *      action for exactly this reason.
 *   3. Remove ANTHROPIC_API_KEY from convex/convex.config.ts and the deployment.
 */

const MODEL = "claude-opus-5-5";

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

export const isConfigured = () => Boolean(env.ANTHROPIC_API_KEY);

export const generateStructured = async (request: StructuredRequest): Promise<StructuredResult> => {
  if (!env.ANTHROPIC_API_KEY) {
    throw new ConvexError("Paste-to-fill is not set up on this deployment yet.");
  }
  const client = new Anthropic({ apiKey: env.ANTHROPIC_API_KEY });

  let response;
  try {
    response = await client.beta.messages.create({
      model: MODEL,
      max_tokens: request.maxTokens,
      // If a safety classifier declines, retry server-side on the model Anthropic
      // recommends for that category rather than failing the paste outright.
      betas: ["server-side-fallback-2026-07-01"],
      fallbacks: "default",
      output_config: {
        effort: "medium",
        format: { type: "json_schema", schema: request.schema },
      },
      system: request.system,
      messages: [{ role: "user", content: `<pasted>\n${request.text}\n</pasted>` }],
    });
  } catch (error) {
    if (error instanceof Anthropic.RateLimitError || error instanceof Anthropic.InternalServerError) {
      throw new ConvexError("The model is busy. Try again in a minute.");
    }
    if (error instanceof Anthropic.AuthenticationError || error instanceof Anthropic.PermissionDeniedError) {
      console.error("Anthropic rejected ANTHROPIC_API_KEY", error.status);
      throw new ConvexError("Paste-to-fill is misconfigured; ask an admin to check the API key.");
    }
    if (error instanceof Anthropic.APIError) {
      console.error("Anthropic API error", error.status, error.message);
      throw new ConvexError("Could not read the text. Try again, or fill the form by hand.");
    }
    throw error;
  }

  console.log("extraction", {
    model: response.model,
    stop: response.stop_reason,
    input: response.usage.input_tokens,
    output: response.usage.output_tokens,
  });

  if (response.stop_reason === "refusal") {
    throw new ConvexError("The model declined to read this text. Fill the form by hand.");
  }
  if (response.stop_reason === "max_tokens") {
    throw new ConvexError("That is more than can be read at once. Paste fewer items.");
  }
  const text = response.content.find((block) => block.type === "text");
  if (text === undefined || text.type !== "text") {
    throw new ConvexError("The model returned nothing usable. Try again.");
  }
  return {
    data: JSON.parse(text.text),
    model: response.model,
    inputTokens: response.usage.input_tokens,
    outputTokens: response.usage.output_tokens,
  };
};
