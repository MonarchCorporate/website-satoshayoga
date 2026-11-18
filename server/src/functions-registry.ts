// Dispatch for the ported edge functions (served under /functions/v1/<name>).
import { config } from "./config";
import { handlers } from "../functions/index";

export async function invokeFunction(name: string, req: Request): Promise<Response> {
  const h = handlers[name];
  if (!h) return new Response(JSON.stringify({ error: "Function not found" }), { status: 404, headers: { "Content-Type": "application/json" } });
  try {
    return await h(req);
  } catch (e: any) {
    console.error(`[fn:${name}] unhandled error`, e);
    return new Response(JSON.stringify({ error: e?.message ?? "Internal error" }), { status: 500, headers: { "Content-Type": "application/json" } });
  }
}

export function functionNames() {
  return Object.keys(handlers);
}

/**
 * Some functions call each other via fetch(`${SUPABASE_URL}/functions/v1/...`).
 * Route those calls in-process instead of over the network.
 */
export function installFetchInterceptor() {
  const original = globalThis.fetch.bind(globalThis);
  const prefix = `${config.siteUrl}/functions/v1/`;
  globalThis.fetch = (async (input: any, init?: any) => {
    const url = typeof input === "string" ? input : input instanceof URL ? input.toString() : input?.url;
    if (typeof url === "string" && url.startsWith(prefix)) {
      const name = url.slice(prefix.length).split(/[?#/]/)[0];
      const req = input instanceof Request ? new Request(input, init) : new Request(url, init);
      return invokeFunction(name, req);
    }
    return original(input, init);
  }) as typeof fetch;
}
