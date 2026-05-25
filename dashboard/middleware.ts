import { NextRequest, NextResponse } from "next/server";

/**
 * Optional HTTP Basic auth.
 *
 * - If DASHBOARD_PASSWORD is unset, middleware is a no-op (open access).
 * - If set, every non-static request must include `Authorization: Basic <base64>`.
 * - DASHBOARD_USER is optional (defaults to "admin").
 *
 * Configure in Vercel:
 *   Settings → Environment Variables
 *     DASHBOARD_PASSWORD = <strong password>
 *     DASHBOARD_USER     = <username>  (optional)
 */
export function middleware(req: NextRequest) {
  const password = process.env.DASHBOARD_PASSWORD;
  if (!password) {
    return NextResponse.next();
  }
  const expectedUser = process.env.DASHBOARD_USER ?? "admin";

  const header = req.headers.get("authorization");
  if (header?.startsWith("Basic ")) {
    const encoded = header.slice(6).trim();
    try {
      const decoded = atob(encoded);
      const idx = decoded.indexOf(":");
      const user = idx >= 0 ? decoded.slice(0, idx) : "";
      const pass = idx >= 0 ? decoded.slice(idx + 1) : "";
      if (user === expectedUser && pass === password) {
        return NextResponse.next();
      }
    } catch {
      // fall through to 401
    }
  }

  return new NextResponse("Authentication required", {
    status: 401,
    headers: {
      "WWW-Authenticate": 'Basic realm="DCF Dashboard", charset="UTF-8"',
    },
  });
}

export const config = {
  // Apply to everything except Next.js internals + static assets.
  matcher: ["/((?!_next/static|_next/image|favicon.ico|robots.txt).*)"],
};
