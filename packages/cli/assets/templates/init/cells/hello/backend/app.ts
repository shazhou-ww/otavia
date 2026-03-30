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
      
      // Handle the API endpoint that the test expects
      if (path === "/api/hello" || path === "/hello") {
        const result = handler();
        return new Response(result.body, { 
          status: result.statusCode,
          headers: { "Content-Type": "application/json" }
        });
      }
      
      // Default handler for root
      if (path === "/" || path === "") {
        const result = handler();
        return new Response(result.body, { 
          status: result.statusCode,
          headers: { "Content-Type": "application/json" }
        });
      }
      
      return new Response("Not Found", { status: 404 });
    },
  };
}
