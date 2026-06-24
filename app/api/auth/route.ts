import { NextResponse } from "next/server";
import { authEnabled } from "@/lib/auth";
import { dbConfigured } from "@/lib/db";

// Lightweight status probe so the client can decide whether to show "Log out"
// and surface a backend-status hint.
export async function GET() {
  return NextResponse.json({ authEnabled: authEnabled(), dbConfigured: dbConfigured() });
}
