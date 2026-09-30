/* eslint-disable */
/**
 * Generated `api` utility.
 *
 * THIS CODE IS AUTOMATICALLY GENERATED.
 *
 * To regenerate, run `npx convex dev`.
 * @module
 */

import type * as admin from "../admin.js";
import type * as authors from "../authors.js";
import type * as authz from "../authz.js";
import type * as content from "../content.js";
import type * as deployHook from "../deployHook.js";
import type * as extract from "../extract.js";
import type * as extractSupport from "../extractSupport.js";
import type * as http from "../http.js";
import type * as llm from "../llm.js";
import type * as migrate from "../migrate.js";
import type * as vocabulary from "../vocabulary.js";

import type {
  ApiFromModules,
  FilterApi,
  FunctionReference,
} from "convex/server";

declare const fullApi: ApiFromModules<{
  admin: typeof admin;
  authors: typeof authors;
  authz: typeof authz;
  content: typeof content;
  deployHook: typeof deployHook;
  extract: typeof extract;
  extractSupport: typeof extractSupport;
  http: typeof http;
  llm: typeof llm;
  migrate: typeof migrate;
  vocabulary: typeof vocabulary;
}>;

/**
 * A utility for referencing Convex functions in your app's public API.
 *
 * Usage:
 * ```js
 * const myFunctionReference = api.myModule.myFunction;
 * ```
 */
export declare const api: FilterApi<
  typeof fullApi,
  FunctionReference<any, "public">
>;

/**
 * A utility for referencing Convex functions in your app's internal API.
 *
 * Usage:
 * ```js
 * const myFunctionReference = internal.myModule.myFunction;
 * ```
 */
export declare const internal: FilterApi<
  typeof fullApi,
  FunctionReference<any, "internal">
>;

export declare const components: {
  rateLimiter: import("@convex-dev/rate-limiter/_generated/component.js").ComponentApi<"rateLimiter">;
};
