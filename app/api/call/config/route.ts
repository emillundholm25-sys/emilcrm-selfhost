import { NextResponse } from "next/server";
import { authEnabled } from "@/lib/auth";
import { llmEnabled } from "@/lib/llm";
import { cloudtalkEnabled } from "@/lib/cloudtalk";

// Capability flags so the UI can hide/disable features whose server-only
// secrets aren't set. Session-gated by proxy.ts when auth is on. The flags
// mirror the strict gate on /api/call/{script,start}: AI + calling report as
// unavailable until the login gate is configured (they spend money), and
// `authRequired` tells the UI to explain why.

export async function GET() {
  const authed = authEnabled();
  return NextResponse.json({
    ok: true,
    llm: llmEnabled() && authed,
    cloudtalk: cloudtalkEnabled() && authed,
    authRequired: !authed && (llmEnabled() || cloudtalkEnabled()),
  });
}
