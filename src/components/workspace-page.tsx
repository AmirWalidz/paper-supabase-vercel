import { redirect } from "next/navigation";
import { serverClient } from "@/lib/supabase/server";
import { Workspace } from "./workspace";
import { SetupNotice } from "./setup-notice";

export async function WorkspacePage({
  view,
  projectId,
}: {
  view: "overview" | "projects" | "tasks";
  projectId?: string;
}) {
  const client = await serverClient();
  if (!client) return <SetupNotice />;
  const { data, error } = await client.auth.getUser();
  if (
    error &&
    error.status !== 401 &&
    error.status !== 403 &&
    error.name !== "AuthSessionMissingError"
  ) {
    throw new Error(
      "Orbit could not verify your session. Please try again when the connection returns.",
    );
  }
  if (!data.user) redirect("/login?reason=session");
  return (
    <Workspace
      key={`${data.user.id}:${projectId || view}`}
      view={view}
      projectId={projectId}
      userId={data.user.id}
    />
  );
}
