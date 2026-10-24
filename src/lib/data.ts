import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "./database.types";
import { PAGE_SIZE } from "./validation";

export async function loadWorkspace(
  client: SupabaseClient<Database>,
  view: "overview" | "projects" | "tasks",
  page: number,
  projectId?: string,
) {
  const size = view === "overview" ? 3 : PAGE_SIZE;
  const start = page * size;
  const [projectsCount, tasksCount, completedCount, projects, project, tasks] =
    await Promise.all([
      client.from("projects").select("id", { count: "exact", head: true }),
      client.from("tasks").select("id", { count: "exact", head: true }),
      client
        .from("tasks")
        .select("id", { count: "exact", head: true })
        .eq("status", "done"),
      view !== "tasks"
        ? client
            .from("projects")
            .select("*")
            .order("created_at", { ascending: false })
            .order("id", { ascending: false })
            .range(start, start + size)
        : null,
      projectId
        ? client.from("projects").select("*").eq("id", projectId).maybeSingle()
        : null,
      projectId
        ? client
            .from("tasks")
            .select("*")
            .eq("project_id", projectId)
            .order("created_at", { ascending: false })
            .order("id", { ascending: false })
            .range(start, start + size)
        : null,
    ]);
  for (const result of [
    projectsCount,
    tasksCount,
    completedCount,
    projects,
    project,
    tasks,
  ]) {
    if (result?.error) throw result.error;
  }
  return {
    totals: {
      projects: projectsCount.count ?? 0,
      tasks: tasksCount.count ?? 0,
      completed: completedCount.count ?? 0,
    },
    projects: projects?.data?.slice(0, size) ?? [],
    project: project?.data ?? null,
    tasks: tasks?.data?.slice(0, size) ?? [],
    hasNext:
      (view === "tasks"
        ? (tasks?.data?.length ?? 0)
        : (projects?.data?.length ?? 0)) > size,
  };
}
