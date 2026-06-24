import { NextResponse } from "next/server";
import { writeLicenseKey } from "@/lib/db";
import { clearLicenseCache, licenseStatus, validateKey } from "@/lib/license";

// License status + in-app activation for the sold/self-hosted build.
//   GET  /api/license          → { required, valid, status, message }
//   POST /api/license { key }   → validate against Lemon Squeezy; store if valid

export async function GET() {
  return NextResponse.json(await licenseStatus());
}

export async function POST(req: Request) {
  let body: { key?: string };
  try {
    body = (await req.json()) as { key?: string };
  } catch {
    return NextResponse.json({ ok: false, error: "Invalid JSON body" }, { status: 400 });
  }
  const key = (body.key || "").trim();
  if (!key) return NextResponse.json({ ok: false, error: "Provide a license key." }, { status: 400 });

  const result = await validateKey(key);
  if (!result.valid) {
    return NextResponse.json({ ok: false, ...result });
  }
  try {
    await writeLicenseKey(key);
  } catch {
    return NextResponse.json(
      { ok: false, error: "Validated, but couldn't save the key (is the database configured?)." },
      { status: 500 }
    );
  }
  clearLicenseCache();
  return NextResponse.json({ ok: true, ...result });
}
