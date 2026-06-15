import "server-only";
import { cookies } from "next/headers";

/**
 * Anonymous per-user identity.
 *
 * Every visitor is assigned a random `pid` cookie by middleware.ts on their
 * first request. That id namespaces their portfolio in storage so each browser
 * sees its own private holdings, seeded from the bundled demo portfolio on
 * first use. No login required.
 */
export const PID_COOKIE = "pid";

// Fallback identity used only if a request somehow arrives without a cookie
// (e.g. a direct API hit before the page set one). Shares a single namespace.
export const DEFAULT_USER_ID = "shared";

/** Read + sanitise the current visitor's portfolio id from the request cookie. */
export function getUserId(): string {
  const raw = cookies().get(PID_COOKIE)?.value ?? "";
  const clean = raw.replace(/[^a-zA-Z0-9_-]/g, "");
  return clean.length >= 8 ? clean : DEFAULT_USER_ID;
}
