import { handler } from "../handler.js";

/**
 * Dev gateway entry: Hono-compatible app shape `{ fetch }` (see `runDevGateway`).
 */
export function createAppForBackend(_env: Record<string, string>): {
  fetch: (req: Request) => Response | Promise<Response>;
} {
  return {
    fetch(req: Request): Response {
      const path = new URL(req.url).pathname.replace(/\/$/, "") || "/";
      if (path === "/" || path === "") {
        const r = handler();
        return new Response(r.body, { status: r.statusCode });
      }
      return new Response("Not Found", { status: 404 });
    },
  };
}
