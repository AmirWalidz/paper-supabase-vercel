import { notFound } from "next/navigation";
import { WorkspacePage } from "@/components/workspace-page";
import { UUID } from "@/lib/validation";

export const dynamic = "force-dynamic";

export default async function Page({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  if (!UUID.test(id)) notFound();
  return <WorkspacePage view="tasks" projectId={id} />;
}
