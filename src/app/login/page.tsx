import { Login } from "@/components/login";
import { SetupNotice } from "@/components/setup-notice";
import { supabaseConfig } from "@/lib/supabase/config";

export const dynamic = "force-dynamic";

export default async function Page({
  searchParams,
}: {
  searchParams: Promise<{ reason?: string }>;
}) {
  if (!supabaseConfig()) return <SetupNotice />;
  const { reason } = await searchParams;
  return <Login reason={reason} />;
}
