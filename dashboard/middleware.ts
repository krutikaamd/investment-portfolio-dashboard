import { NextResponse, type NextRequest } from "next/server";

/**
 * Middleware does two things, in order:
 *
 * 1. Optional HTTP Basic auth (site-wide gate).
 *    - If DASHBOARD_PASSWORD is unset, this is a no-op (open access).
 *    - If set, every non-static request must include a matching
 *      `Authorization: Basic <base64>` header. DASHBOARD_USER is optional
 *      (defaults to "admin").
 *    Configure in Vercel → Settings → Environment Variables:
 *      DASHBOARD_PASSWORD = <strong password>
 *      DASHBOARD_USER     = <username>  (optional)
 *
 * 2. Anonymous per-user identity.
 *    Assigns every visitor a random `pid` cookie used to namespace their
 *    private portfolio. Generated on first request; expiry refreshed on each
 *    subsequent request (sliding 1-year window) so active users keep their
 *    portfolio while abandoned ones can be garbage-collected.
 */
const PID_COOKIE = "pid";
const ONE_YEAR_SECONDS = 60 * 60 * 24 * 365;

function requireBasicAuth(req: NextRequest): NextResponse | null {
  const password = process.env.DASHBOARD_PASSWORD;
  if (!password) return null; // auth disabled

  const expectedUser = process.env.DASHBOARD_USER ?? "admin";
  const header = req.headers.get("authorization");
  if (header?.startsWith("Basic ")) {
    try {
      const decoded = atob(header.slice(6).trim());
      const idx = decoded.indexOf(":");
      const user = idx >= 0 ? decoded.slice(0, idx) : "";
      const pass = idx >= 0 ? decoded.slice(idx + 1) : "";
      if (user === expectedUser && pass === password) return null; // ok
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

function withPidCookie(req: NextRequest, res: NextResponse): NextResponse {
  const existing = req.cookies.get(PID_COOKIE)?.value;
  const id = existing && existing.length >= 8 ? existing : crypto.randomUUID();
  res.cookies.set(PID_COOKIE, id, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    maxAge: ONE_YEAR_SECONDS,
    path: "/",
  });
  return res;
}

export function middleware(req: NextRequest) {
  const denied = requireBasicAuth(req);
  if (denied) return denied;
  return withPidCookie(req, NextResponse.next());
}

export const config = {
  // Apply to everything except Next.js internals + static assets.
  matcher: ["/((?!_next/static|_next/image|favicon.ico|robots.txt).*)"],
};
