import { NextResponse } from "next/server";
import { storageBackend } from "@/lib/portfolio-store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const backend = storageBackend();
  const env = process.env;
  return NextResponse.json(
    {
      backend,
      isServerless: Boolean(env.VERCEL || env.AWS_LAMBDA_FUNCTION_NAME),
      vercel: env.VERCEL ? "yes" : "no",
      vercelEnv: env.VERCEL_ENV ?? null,
      vercelRegion: env.VERCEL_REGION ?? null,
      kvVars: {
        KV_REST_API_URL: Boolean(env.KV_REST_API_URL),
        KV_REST_API_TOKEN: Boolean(env.KV_REST_API_TOKEN),
        UPSTASH_REDIS_REST_URL: Boolean(env.UPSTASH_REDIS_REST_URL),
        UPSTASH_REDIS_REST_TOKEN: Boolean(env.UPSTASH_REDIS_REST_TOKEN),
      },
      authConfigured: Boolean(env.DASHBOARD_PASSWORD),
      nodeVersion: process.version,
      timestamp: new Date().toISOString(),
    },
    {
      headers: { "Cache-Control": "no-store" },
    }
  );
}
