import { NextResponse, type NextRequest } from "next/server";
import { serverClient } from "@/lib/supabase/server";
import { siteUrl } from "@/lib/validation";

export async function GET(request: NextRequest) {
  const code = request.nextUrl.searchParams.get("code");
  const client = await serverClient();
  if (code && client) {
    const { error } = await client.auth.exchangeCodeForSession(code);
    if (!error)
      return NextResponse.redirect(`${siteUrl()}/`, {
        headers: { "Cache-Control": "private, no-store" },
      });
  }
  return NextResponse.redirect(`${siteUrl()}/login?reason=oauth`, {
    headers: { "Cache-Control": "private, no-store" },
  });
}
