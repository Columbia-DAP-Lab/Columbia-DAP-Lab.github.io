import OpenAI from "openai";
import { ConvexError } from "convex/values";
import { env } from "./_generated/server";

/**
 * The one place that knows which model provider reads pasted text.
 *
 * Callers hand over a system prompt, the text, and a JSON Schema, and get back
 * parsed JSON that matches the schema. Nothing else in the app imports a provider
 * SDK, so changing provider is a change to this file alone.
 *
 * Today this is OpenAI's GPT-6 Luna, through the Chat Completions API with a strict
 * JSON-schema response format. The OpenAI SDK needs only fetch, so this runs in the
 * default Convex runtime. Any OpenAI-compatible endpoint works by pointing
 * LLM_BASE_URL at it:
 *
 *   OpenAI directly (the default):
 *     npx convex env set LLM_API_KEY <sk-... key from platform.openai.com>
 *
 *   Amazon Bedrock, with a long-term Bedrock API key (ABSK...):
 *     npx convex env set LLM_API_KEY <Bedrock API key>
 *     npx convex env set LLM_BASE_URL https://bedrock-runtime.us-east-1.amazonaws.com/openai/v1
 *     npx convex env set LLM_MODEL us.openai.gpt-6-luna
 *   Use bedrock-runtime rather than bedrock-mantle: Bedrock lists structured
 *   outputs for this model on runtime only, and there the model is named by a
 *   cross-Region inference profile rather than the bare model id.
 *
 * (Gemini on Vertex AI was tried first; Columbia's Google Cloud organization
 * policy iam.managed.disableServiceAccountApiKeyCreation rules out the API key it
 * needs.)
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
 *   3. Remove the LLM_* variables from convex/convex.config.ts and the
 *      deployment.
 */

/**
 * Luna is the family's model for extraction and other focused, high-volume work,
 * and the person is waiting on it. LLM_MODEL overrides it without a deploy.
 */
const MODEL = "gpt-6-luna";

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

export const isConfigured = () => Boolean(env.LLM_API_KEY);

export const generateStructured = async (request: StructuredRequest): Promise<StructuredResult> => {
  if (!env.LLM_API_KEY) {
    throw new ConvexError("Paste-to-fill is not set up on this deployment yet.");
  }
  // Trimmed: a key pasted with a trailing newline fails the provider's format check.
  // An unset base URL means OpenAI's own API.
  // The SDK's defaults (10 minutes, 2 retries) outlast a Convex action's 10-minute
  // limit, which would end in a bare timeout. Reads take seconds; a long paste, a
  // minute or two. Worst case here is two tries of 2 minutes.
  const client = new OpenAI({
    apiKey: env.LLM_API_KEY.trim(),
    baseURL: env.LLM_BASE_URL || undefined,
    timeout: 120_000,
    maxRetries: 1,
  });
  const model = env.LLM_MODEL || MODEL;

  let completion;
  try {
    completion = await client.chat.completions.create({
      model,
      max_completion_tokens: request.maxTokens,
      response_format: {
        type: "json_schema",
        json_schema: { name: "drafts", schema: request.schema, strict: true },
      },
      messages: [
        { role: "system", content: request.system },
        { role: "user", content: `<pasted>\n${request.text}\n</pasted>` },
      ],
    });
  } catch (error) {
    if (error instanceof OpenAI.RateLimitError || error instanceof OpenAI.InternalServerError) {
      throw new ConvexError("The model is busy. Try again in a minute.");
    }
    if (error instanceof OpenAI.AuthenticationError || error instanceof OpenAI.PermissionDeniedError) {
      console.error("The model provider rejected LLM_API_KEY", error.status, error.message);
      throw new ConvexError("Paste-to-fill is misconfigured; ask an admin to check the API key.");
    }
    if (error instanceof OpenAI.APIConnectionTimeoutError) {
      throw new ConvexError("The model took too long. Try again, or paste less.");
    }
    if (error instanceof OpenAI.APIError) {
      // A 400 here is most likely the schema or the model id; the log says which.
      console.error("Model API error", error.status, error.message);
      throw new ConvexError("Could not read the text. Try again, or fill the form by hand.");
    }
    throw error;
  }

  const choice = completion.choices[0];
  console.log("extraction", {
    model: completion.model,
    finish: choice?.finish_reason,
    input: completion.usage?.prompt_tokens,
    output: completion.usage?.completion_tokens,
  });

  if (choice?.message.refusal || choice?.finish_reason === "content_filter") {
    throw new ConvexError("The model declined to read this text. Fill the form by hand.");
  }
  if (choice?.finish_reason === "length") {
    throw new ConvexError("That is more than can be read at once. Paste fewer items.");
  }
  const text = choice?.message.content;
  if (!text) throw new ConvexError("The model returned nothing usable. Try again.");

  let data;
  try {
    data = JSON.parse(text);
  } catch {
    // Length only: the output restates the pasted text, which may be personal.
    console.error("Model returned invalid JSON", { length: text.length, finish: choice?.finish_reason });
    throw new ConvexError("The model returned nothing usable. Try again.");
  }

  return {
    data,
    model: completion.model,
    inputTokens: completion.usage?.prompt_tokens ?? 0,
    outputTokens: completion.usage?.completion_tokens ?? 0,
  };
};
