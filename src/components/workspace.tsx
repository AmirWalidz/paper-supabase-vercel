"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import useSWR from "swr";
import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type FormEvent,
} from "react";
import { browserClient } from "@/lib/supabase/client";
import { loadWorkspace } from "@/lib/data";
import { validateText, PAGE_SIZE } from "@/lib/validation";
import type { Project, Task, TaskStatus } from "@/lib/database.types";
import { Dialog } from "./dialog";

type Editor = {
  type: "project" | "task";
  action: "create" | "rename" | "delete";
  item?: Project | Task;
};
const statusLabels = { todo: "To do", doing: "Doing", done: "Done" };

export function Workspace({
  view,
  projectId,
  userId,
}: {
  view: "overview" | "projects" | "tasks";
  projectId?: string;
  userId: string;
}) {
  const client = browserClient();
  const router = useRouter();
  const [page, setPage] = useState(0);
  const [sessionEnded, setSessionEnded] = useState(false);
  const [editor, setEditor] = useState<Editor | null>(null);
  const [value, setValue] = useState("");
  const [formError, setFormError] = useState("");
  const [pending, setPending] = useState(false);
  const [notice, setNotice] = useState("");
  const busy = useRef(false);

  const expire = useCallback(() => {
    setEditor(null);
    setSessionEnded(true);
  }, []);

  const {
    data,
    error: loadError,
    isLoading,
    isValidating,
    mutate,
  } = useSWR(
    sessionEnded ? null : [userId, view, projectId, page],
    () => loadWorkspace(client, view, page, projectId),
    {
      revalidateOnMount: true,
      revalidateOnFocus: false,
      shouldRetryOnError: false,
      onError(cause) {
        if (["PGRST301", "PGRST303", "42501"].includes(String(cause?.code)))
          expire();
      },
    },
  );
  const loading = isLoading || isValidating;
  const error = loadError
    ? "We couldn’t load your saved work. Check your connection and try again."
    : "";

  useEffect(() => {
    const { data: subscription } = client.auth.onAuthStateChange(
      (_event, session) => {
        if (!session || session.user.id !== userId) expire();
      },
    );
    return () => {
      subscription.subscription.unsubscribe();
    };
  }, [client, userId, expire]);

  async function reload() {
    await mutate().catch(() => undefined);
  }

  function goToPage(next: number) {
    setPage(next);
  }

  function openEditor(next: Editor) {
    setFormError("");
    setValue(
      next.item ? ("name" in next.item ? next.item.name : next.item.title) : "",
    );
    setEditor(next);
  }

  async function verifyUser() {
    const { data, error } = await client.auth.getUser();
    if (
      !data.user &&
      (!error ||
        error.name === "AuthSessionMissingError" ||
        error.status === 401 ||
        error.status === 403)
    ) {
      expire();
      throw new Error("Your session ended. Sign in again to continue.");
    }
    if (error)
      throw new Error(
        "We couldn’t verify your session. Check your connection and try again.",
      );
    if (data.user?.id !== userId) {
      expire();
      throw new Error("Your account changed. Sign in again to continue.");
    }
  }

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy.current || !editor) return;
    busy.current = true;
    setPending(true);
    setFormError("");
    try {
      const text =
        editor.action !== "delete"
          ? validateText(
              value,
              editor.type === "project" ? 120 : 200,
              editor.type === "project" ? "Project name" : "Task title",
            )
          : "";
      await verifyUser();
      let result;
      if (editor.type === "project") {
        if (editor.action === "create")
          result = await client
            .from("projects")
            .insert({ name: text, owner_id: userId })
            .select("id")
            .single();
        else if (editor.action === "rename")
          result = await client
            .from("projects")
            .update({ name: text })
            .eq("id", editor.item!.id)
            .select("id")
            .single();
        else
          result = await client
            .from("projects")
            .delete()
            .eq("id", editor.item!.id)
            .select("id")
            .single();
      } else {
        if (editor.action === "create")
          result = await client
            .from("tasks")
            .insert({ title: text, project_id: projectId! })
            .select("id")
            .single();
        else if (editor.action === "rename")
          result = await client
            .from("tasks")
            .update({ title: text })
            .eq("id", editor.item!.id)
            .select("id")
            .single();
        else
          result = await client
            .from("tasks")
            .delete()
            .eq("id", editor.item!.id)
            .select("id")
            .single();
      }
      if (result.error)
        throw new Error(
          "We couldn’t save this change. Check your connection and retry. If this item was removed elsewhere, close this dialog and refresh.",
        );
      setEditor(null);
      setNotice(
        editor.action === "delete"
          ? "Deleted. Your totals are updating."
          : "Saved. Your totals are updating.",
      );
      if (
        editor.type === "project" &&
        editor.action === "delete" &&
        view === "tasks"
      )
        router.replace("/projects");
      else if (page !== 0) goToPage(0);
      else await reload();
    } catch (cause) {
      setFormError(
        cause instanceof Error
          ? cause.message
          : "We couldn’t save this change. Please try again.",
      );
    } finally {
      busy.current = false;
      setPending(false);
    }
  }

  async function changeStatus(task: Task, status: TaskStatus) {
    if (busy.current) return;
    busy.current = true;
    setPending(true);
    setNotice("Saving task status…");
    try {
      await verifyUser();
      const { error } = await client
        .from("tasks")
        .update({ status })
        .eq("id", task.id)
        .select("id")
        .single();
      if (error) throw error;
      setNotice("Task status saved. Your totals are updating.");
      await reload();
    } catch {
      setNotice(
        "Task status wasn’t saved. Check your connection and try again.",
      );
    } finally {
      busy.current = false;
      setPending(false);
    }
  }

  async function signOut() {
    if (busy.current) return;
    busy.current = true;
    setPending(true);
    try {
      const { error } = await client.auth.signOut({ scope: "local" });
      if (error) throw error;
      expire();
      window.location.replace(`${window.location.origin}/login`);
    } catch {
      setNotice("Sign-out failed. Check your connection and try again.");
      busy.current = false;
      setPending(false);
    }
  }

  if (sessionEnded)
    return (
      <main className="state-page">
        <p className="eyebrow">YOUR WORK IS STILL YOURS</p>
        <h1>Let’s reconnect.</h1>
        <p role="status">
          Your session ended or your account changed. Sign in again to continue.
        </p>
        <a className="primary" href="/login?reason=session">
          Sign in with GitHub
        </a>
      </main>
    );

  const unavailable =
    view === "tasks" && data && !data.project && !loading && !error;
  const blocked = pending || loading || !!error || !!unavailable;

  return (
    <div className="workspace">
      <a className="skip-link" href="#main">
        Skip to content
      </a>
      <header className="navigation">
        <Link className="brand" href="/">
          <span className="orbit-mark" aria-hidden="true" />
          orbit
        </Link>
        <nav aria-label="Main navigation">
          <Link
            href="/"
            aria-current={view === "overview" ? "page" : undefined}
          >
            Overview
          </Link>
          <Link
            href="/projects"
            aria-current={view !== "overview" ? "page" : undefined}
          >
            Projects
          </Link>
        </nav>
        <div className="account">
          <span>Personal workspace</span>
          <button className="text-button" disabled={pending} onClick={signOut}>
            Sign out
          </button>
        </div>
      </header>
      <main id="main">
        <section className="intro">
          <div>
            <p className="eyebrow">
              {view === "overview"
                ? "YOUR WORK / A LITTLE CLARITY"
                : view === "projects"
                  ? "YOUR PROJECTS / ROOM TO MAKE"
                  : "PROJECT / ONE STEP AT A TIME"}
            </p>
            <h1>
              {view === "overview"
                ? "Good work, in motion."
                : view === "projects"
                  ? "Everything you’re making."
                  : data?.project?.name || "Your project"}
            </h1>
            <p className="muted">
              {view === "tasks"
                ? "Small steps. Meaningful progress."
                : "A little clarity for everything you’re making."}
            </p>
          </div>
          <button
            className="primary"
            disabled={blocked}
            onClick={() =>
              openEditor({
                type: view === "tasks" ? "task" : "project",
                action: "create",
              })
            }
          >
            {view === "tasks" ? "New task" : "New project"}
            <span aria-hidden="true">+</span>
          </button>
        </section>
        <section
          className="metrics"
          aria-label="Workspace totals"
          aria-busy={loading}
        >
          <Metric
            label="Total projects"
            value={data?.totals.projects}
            loading={loading || !!error}
            detail="Ideas with a place to grow"
          />
          <Metric
            label="Tasks completed"
            value={data?.totals.completed}
            loading={loading || !!error}
            detail="Every step counts"
          />
          <Metric
            label="Total tasks"
            value={data?.totals.tasks}
            loading={loading || !!error}
            detail="Across your personal projects"
          />
        </section>
        <p className="notice" role="status" aria-live="polite">
          {pending ? "Saving…" : notice}
        </p>
        {error ? (
          <section className="empty" role="alert">
            <h2>A little interruption.</h2>
            <p>{error}</p>
            <button
              className="primary"
              disabled={pending}
              onClick={() => void reload()}
            >
              Try again
            </button>
          </section>
        ) : loading ? (
          <section className="empty" role="status" aria-busy="true">
            <h2>Making space…</h2>
            <p>Loading your saved work.</p>
          </section>
        ) : unavailable ? (
          <section className="empty">
            <h2>Project not available.</h2>
            <p>
              It may have been deleted, or it doesn’t belong to this account.
            </p>
            <Link href="/projects">Back to your projects ↗</Link>
          </section>
        ) : (
          <div
            className={view === "overview" ? "work-area" : "work-area single"}
          >
            <section className="list-section" aria-labelledby="list-heading">
              <div className="section-heading">
                <h2 id="list-heading">
                  {view === "tasks" ? "The next steps" : "In your orbit"}
                </h2>
                {view === "overview" ? (
                  <Link href="/projects">All projects ↗</Link>
                ) : (
                  <button
                    className="text-button"
                    disabled={pending}
                    onClick={() => void reload()}
                  >
                    Refresh
                  </button>
                )}
              </div>
              {view === "tasks" ? (
                <>
                  <div className="project-actions">
                    <Link href="/projects">← All projects</Link>
                    <button
                      disabled={blocked}
                      onClick={() =>
                        openEditor({
                          type: "project",
                          action: "rename",
                          item: data!.project!,
                        })
                      }
                    >
                      Rename project
                    </button>
                    <button
                      className="danger-text"
                      disabled={blocked}
                      onClick={() =>
                        openEditor({
                          type: "project",
                          action: "delete",
                          item: data!.project!,
                        })
                      }
                    >
                      Delete project
                    </button>
                  </div>
                  {data?.tasks.length ? (
                    <ul className="record-list">
                      {data.tasks.map((task, index) => (
                        <li className="record task-row" key={task.id}>
                          <span className="index" aria-hidden="true">
                            {String(page * PAGE_SIZE + index + 1).padStart(
                              2,
                              "0",
                            )}
                          </span>
                          <div className="record-content">
                            <h3>{task.title}</h3>
                            <span className={`task-state state-${task.status}`}>
                              {statusLabels[task.status]}
                            </span>
                          </div>
                          <div className="row-actions">
                            <label
                              className="sr-only"
                              htmlFor={`status-${task.id}`}
                            >
                              Status for {task.title}
                            </label>
                            <select
                              id={`status-${task.id}`}
                              value={task.status}
                              disabled={blocked}
                              onChange={(event) =>
                                void changeStatus(
                                  task,
                                  event.target.value as TaskStatus,
                                )
                              }
                            >
                              <option value="todo">To do</option>
                              <option value="doing">Doing</option>
                              <option value="done">Done</option>
                            </select>
                            <button
                              disabled={blocked}
                              aria-label={`Rename task ${task.title}`}
                              onClick={() =>
                                openEditor({
                                  type: "task",
                                  action: "rename",
                                  item: task,
                                })
                              }
                            >
                              Rename
                            </button>
                            <button
                              className="danger-text"
                              disabled={blocked}
                              aria-label={`Delete task ${task.title}`}
                              onClick={() =>
                                openEditor({
                                  type: "task",
                                  action: "delete",
                                  item: task,
                                })
                              }
                            >
                              Delete
                            </button>
                          </div>
                        </li>
                      ))}
                    </ul>
                  ) : (
                    <Empty
                      title={page ? "No tasks on this page." : "A fresh start."}
                      text={
                        page
                          ? "Go back to see your earlier tasks."
                          : "Add your first task. One small step is all it takes."
                      }
                    />
                  )}
                </>
              ) : data?.projects.length ? (
                <ul className="record-list">
                  {data.projects.map((project, index) => (
                    <li className="record" key={project.id}>
                      <span className="index" aria-hidden="true">
                        {String(page * PAGE_SIZE + index + 1).padStart(2, "0")}
                      </span>
                      <div className="record-content">
                        <h3>
                          <Link href={`/projects/${project.id}`}>
                            {project.name}
                          </Link>
                        </h3>
                        <p className="small muted">Your personal project</p>
                      </div>
                      <div className="row-actions">
                        <button
                          disabled={blocked}
                          aria-label={`Rename project ${project.name}`}
                          onClick={() =>
                            openEditor({
                              type: "project",
                              action: "rename",
                              item: project,
                            })
                          }
                        >
                          Rename
                        </button>
                        <button
                          className="danger-text"
                          disabled={blocked}
                          aria-label={`Delete project ${project.name}`}
                          onClick={() =>
                            openEditor({
                              type: "project",
                              action: "delete",
                              item: project,
                            })
                          }
                        >
                          Delete
                        </button>
                        <Link
                          href={`/projects/${project.id}`}
                          aria-label={`Open project ${project.name}`}
                          className="open-link"
                        >
                          ↗
                        </Link>
                      </div>
                    </li>
                  ))}
                </ul>
              ) : (
                <Empty
                  title={
                    page
                      ? "No projects on this page."
                      : "Make room for an idea."
                  }
                  text={
                    page
                      ? "Go back to see your earlier projects."
                      : "Create your first project and give your next idea a place to grow."
                  }
                />
              )}
              {view !== "overview" && (
                <nav
                  className="pagination"
                  aria-label={`${view === "tasks" ? "Task" : "Project"} pages`}
                >
                  <button
                    disabled={blocked || page === 0}
                    onClick={() => goToPage(page - 1)}
                  >
                    ← Previous
                  </button>
                  <span>Page {page + 1}</span>
                  <button
                    disabled={blocked || !data?.hasNext}
                    onClick={() => goToPage(page + 1)}
                  >
                    Next →
                  </button>
                </nav>
              )}
            </section>
            {view === "overview" && (
              <aside className="focus-panel">
                <p className="eyebrow">A LITTLE FOCUS</p>
                <h2>
                  Make room for
                  <br />
                  the next big idea.
                </h2>
                <p>
                  Your work, at your pace.
                  <br />
                  Start a project. Take a small step.
                </p>
                <button
                  disabled={blocked}
                  onClick={() =>
                    openEditor({ type: "project", action: "create" })
                  }
                >
                  Create a project<span aria-hidden="true">↗</span>
                </button>
              </aside>
            )}
          </div>
        )}
      </main>
      <footer>
        <span>ORBIT / PERSONAL WORKSPACE</span>
        <span>Good work starts with a little clarity.</span>
      </footer>
      {editor && (
        <Dialog
          title={`${editor.action === "create" ? "New" : editor.action === "rename" ? "Rename" : "Delete"} ${editor.type}`}
          pending={pending}
          onClose={() => setEditor(null)}
        >
          <form onSubmit={save} aria-busy={pending}>
            {editor.action === "delete" ? (
              <p className="delete-explanation">
                Delete “{value}”?{" "}
                {editor.type === "project"
                  ? "All of this project’s tasks will also be deleted. "
                  : ""}
                This can’t be undone.
              </p>
            ) : (
              <>
                <label htmlFor="record-name">
                  {editor.type === "project" ? "Project name" : "Task title"}
                </label>
                <input
                  id="record-name"
                  value={value}
                  onChange={(event) => setValue(event.target.value)}
                  disabled={pending}
                  required
                  autoComplete="off"
                  aria-describedby={`name-help${formError ? " form-error" : ""}`}
                  aria-invalid={!!formError}
                />
                <p id="name-help" className="small muted">
                  {editor.type === "project" ? "120" : "200"} characters
                  maximum. Leading and trailing spaces are removed.
                </p>
              </>
            )}
            {formError && (
              <p id="form-error" role="alert" className="error-message">
                {formError}
              </p>
            )}
            <div className="dialog-actions">
              <button
                type="button"
                disabled={pending}
                onClick={() => setEditor(null)}
              >
                Cancel
              </button>
              <button
                className={editor.action === "delete" ? "danger" : "primary"}
                disabled={pending}
                type="submit"
              >
                {pending
                  ? "Saving…"
                  : editor.action === "delete"
                    ? "Delete permanently"
                    : "Save"}
              </button>
            </div>
          </form>
        </Dialog>
      )}
    </div>
  );
}

function Metric({
  label,
  value,
  detail,
  loading,
}: {
  label: string;
  value?: number;
  detail: string;
  loading: boolean;
}) {
  return (
    <div className="metric">
      <h2>{label}</h2>
      <p className="metric-value">
        {loading || value === undefined ? "—" : value.toLocaleString("en-US")}
      </p>
      <p className="small muted">{detail}</p>
    </div>
  );
}

function Empty({ title, text }: { title: string; text: string }) {
  return (
    <div className="empty">
      <h3>{title}</h3>
      <p>{text}</p>
    </div>
  );
}
