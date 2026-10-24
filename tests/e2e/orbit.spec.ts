import { test as base, expect, type Page } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import { fixtureUser, api, localConfig } from "../local";

const test = base.extend<{ account: Awaited<ReturnType<typeof fixtureUser>> }>({
  account: async ({ context }, run) => {
    const account = await fixtureUser();
    await context.addCookies(
      account.cookies.map(({ name, value }) => ({
        name,
        value,
        domain: "localhost",
        path: "/",
        sameSite: "Lax" as const,
      })),
    );
    await run(account);
    await account.cleanup();
  },
});

async function metric(page: Page, label: string, value: number) {
  await expect(
    page
      .locator(".metric")
      .filter({ has: page.getByRole("heading", { name: label, exact: true }) })
      .locator(".metric-value"),
  ).toHaveText(String(value));
}

async function addProject(page: Page, name: string) {
  await page.getByRole("button", { name: "New project", exact: true }).click();
  await page.getByRole("textbox", { name: "Project name" }).fill(name);
  await page.getByRole("button", { name: "Save", exact: true }).click();
  await expect(page.getByRole("dialog")).not.toBeVisible();
  await expect(
    page.getByRole("heading", { name: name.trim(), exact: true }),
  ).toBeVisible();
}

test("persistent project/task lifecycle, all statuses, live totals, and confirmed cascade", async ({
  page,
  account,
}) => {
  await page.goto("/");
  await metric(page, "Total projects", 0);
  await metric(page, "Total tasks", 0);
  await metric(page, "Tasks completed", 0);
  await expect(
    page.getByRole("heading", { name: "Make room for an idea." }),
  ).toBeVisible();
  await addProject(page, "  Synthetic launch  ");
  await metric(page, "Total projects", 1);
  await page.reload();
  await expect(
    page.getByRole("heading", { name: "Synthetic launch", exact: true }),
  ).toBeVisible();
  await page
    .getByRole("button", {
      name: "Rename project Synthetic launch",
      exact: true,
    })
    .click();
  await page
    .getByRole("textbox", { name: "Project name" })
    .fill("Synthetic studio");
  await page.getByRole("button", { name: "Save", exact: true }).click();
  await page
    .getByRole("link", { name: "Synthetic studio", exact: true })
    .click();
  await expect(
    page.getByRole("heading", { name: "A fresh start." }),
  ).toBeVisible();
  await page.getByRole("button", { name: "New task", exact: true }).click();
  await page.getByRole("textbox", { name: "Task title" }).fill("First step");
  await page.getByRole("button", { name: "Save", exact: true }).click();
  await metric(page, "Total tasks", 1);
  await expect(
    page.getByRole("combobox", { name: "Status for First step" }),
  ).toHaveValue("todo");
  for (const status of ["doing", "done", "todo", "done"]) {
    await page
      .getByRole("combobox", { name: "Status for First step" })
      .selectOption(status);
    await metric(page, "Tasks completed", status === "done" ? 1 : 0);
    await expect(
      page.getByRole("combobox", { name: "Status for First step" }),
    ).toBeEnabled();
  }
  await page.getByRole("button", { name: "Rename task First step" }).click();
  await page
    .getByRole("textbox", { name: "Task title" })
    .fill("A meaningful step");
  await page.getByRole("button", { name: "Save", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "A meaningful step" }),
  ).toBeVisible();
  await page.reload();
  await expect(
    page.getByRole("combobox", { name: "Status for A meaningful step" }),
  ).toHaveValue("done");
  const stored = await api("tasks?select=title,status", "GET", account.token);
  expect(stored.data).toEqual([{ title: "A meaningful step", status: "done" }]);
  await page
    .getByRole("button", { name: "Delete project", exact: true })
    .click();
  await expect(page.getByRole("dialog")).toContainText(
    "All of this project’s tasks will also be deleted.",
  );
  await page.getByRole("button", { name: "Cancel", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "A meaningful step" }),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "Delete project", exact: true })
    .click();
  await page.getByRole("button", { name: "Delete permanently" }).click();
  await expect(page).toHaveURL(/\/projects$/);
  await metric(page, "Total projects", 0);
  await metric(page, "Total tasks", 0);
  expect((await api("tasks", "GET", account.token)).data).toEqual([]);
});

test("task deletion updates counts without deleting its project", async ({
  page,
  account,
}) => {
  const project = (
    await api("projects", "POST", account.token, {
      name: "Delete test",
      owner_id: account.id,
    })
  ).data[0];
  await api("tasks", "POST", account.token, {
    title: "Disposable step",
    status: "done",
    project_id: project.id,
  });
  await page.goto(`/projects/${project.id}`);
  await metric(page, "Tasks completed", 1);
  await page
    .getByRole("button", { name: "Delete task Disposable step" })
    .click();
  await page.getByRole("button", { name: "Delete permanently" }).click();
  await metric(page, "Total tasks", 0);
  await metric(page, "Total projects", 1);
});

test("keyboard dialog focus, Escape restoration, validation, and accessible desktop/mobile", async ({
  page,
  account,
}) => {
  expect(account.id).toBeTruthy();
  await page.goto("/");
  await metric(page, "Total projects", 0);
  const trigger = page.getByRole("button", {
    name: "New project",
    exact: true,
  });
  await trigger.focus();
  await page.keyboard.press("Enter");
  const input = page.getByRole("textbox", { name: "Project name" });
  await expect(input).toBeFocused();
  await input.fill(" ");
  await page.getByRole("button", { name: "Save", exact: true }).click();
  await expect(page.getByRole("dialog").getByRole("alert")).toHaveText(
    "Project name is required.",
  );
  await input.fill("x".repeat(121));
  await page.getByRole("button", { name: "Save", exact: true }).click();
  await expect(page.getByRole("dialog").getByRole("alert")).toHaveText(
    "Project name must be 120 characters or fewer.",
  );
  await page.getByRole("button", { name: "Save", exact: true }).focus();
  await page.keyboard.press("Tab");
  await expect(input).toBeFocused();
  await page.keyboard.press("Shift+Tab");
  await expect(
    page.getByRole("button", { name: "Save", exact: true }),
  ).toBeFocused();
  await page.keyboard.press("Tab");
  await expect(input).toBeFocused();
  await page.keyboard.press("Escape");
  await expect(page.getByRole("dialog")).not.toBeVisible();
  await expect(trigger).toBeFocused();
  expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
  await page.setViewportSize({ width: 390, height: 844 });
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBe(true);
  expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
  await trigger.click();
  expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
});

test("read failure, retry, pending guard, and mutation failure keep truthful state", async ({
  page,
  account,
}) => {
  expect(account.id).toBeTruthy();
  await page.route("**/rest/v1/**", (route) => route.abort());
  await page.goto("/");
  await expect(page.getByRole("main").getByRole("alert")).toContainText(
    "We couldn’t load your saved work",
  );
  await expect(
    page.getByRole("button", { name: "New project", exact: true }),
  ).toBeDisabled();
  await page.unroute("**/rest/v1/**");
  await page.getByRole("button", { name: "Try again" }).click();
  await metric(page, "Total projects", 0);
  await page.getByRole("button", { name: "New project", exact: true }).click();
  await page
    .getByRole("textbox", { name: "Project name" })
    .fill("Retryable idea");
  let release: (() => void) | undefined;
  const gate = new Promise<void>((resolve) => {
    release = resolve;
  });
  await page.route("**/rest/v1/projects?select=id", async (route) => {
    await gate;
    await route.abort();
  });
  await page.getByRole("button", { name: "Save", exact: true }).click();
  await expect(
    page.getByRole("button", { name: "Saving…", exact: true }),
  ).toBeDisabled();
  await expect(
    page.getByRole("button", { name: "Cancel", exact: true }),
  ).toBeDisabled();
  await page.keyboard.press("Escape");
  await expect(page.getByRole("dialog")).toBeVisible();
  release!();
  await expect(page.getByRole("dialog").getByRole("alert")).toContainText(
    "We couldn’t save this change",
  );
  await expect(page.getByRole("textbox", { name: "Project name" })).toHaveValue(
    "Retryable idea",
  );
  await page.unroute("**/rest/v1/projects?select=id");
  await page.getByRole("button", { name: "Save", exact: true }).click();
  await metric(page, "Total projects", 1);
});

test("project and task pages are bounded while totals cover all records", async ({
  page,
  account,
}) => {
  await api(
    "projects",
    "POST",
    account.token,
    Array.from({ length: 23 }, (_, i) => ({
      name: `Synthetic ${String(i).padStart(2, "0")}`,
      owner_id: account.id,
    })),
    "return=minimal",
  );
  const project = (await api("projects?limit=1", "GET", account.token)).data[0];
  await api(
    "tasks",
    "POST",
    account.token,
    Array.from({ length: 25 }, (_, i) => ({
      title: `Step ${i}`,
      status: i < 5 ? "done" : "todo",
      project_id: project.id,
    })),
    "return=minimal",
  );
  await page.goto("/projects");
  await metric(page, "Total projects", 23);
  await metric(page, "Total tasks", 25);
  await metric(page, "Tasks completed", 5);
  await expect(page.locator(".record-list > li")).toHaveCount(20);
  await page.getByRole("button", { name: "Next →" }).click();
  await expect(page.locator(".record-list > li")).toHaveCount(3);
  await expect(page.getByRole("button", { name: "Next →" })).toBeDisabled();
  await page.getByRole("button", { name: "← Previous" }).click();
  await expect(page.locator(".record-list > li")).toHaveCount(20);
  await page.goto(`/projects/${project.id}`);
  await expect(page.locator(".record-list > li")).toHaveCount(20);
  await page.getByRole("button", { name: "Next →" }).click();
  await expect(page.locator(".record-list > li")).toHaveCount(5);
});

test("private routes reject anonymous or forged sessions and unavailable projects are safe", async ({
  page,
  account,
  browser,
}) => {
  const other = await browser.newContext();
  const anonymous = await other.newPage();
  await anonymous.goto("http://localhost:3000/projects");
  await expect(anonymous).toHaveURL(/\/login\?reason=session/);
  await expect(
    anonymous.getByRole("heading", { name: "Everything you’re making." }),
  ).not.toBeVisible();
  await other.addCookies([
    {
      name: "sb-127-auth-token",
      value: "forged",
      domain: "localhost",
      path: "/",
    },
  ]);
  await anonymous.goto("http://localhost:3000/");
  await expect(anonymous).toHaveURL(/\/login/);
  await other.close();
  const b = await fixtureUser();
  try {
    const privateProject = (
      await api("projects", "POST", b.token, {
        name: "Other account private",
        owner_id: b.id,
      })
    ).data[0];
    await page.goto(`/projects/${privateProject.id}`);
    await expect(
      page.getByRole("heading", { name: "Project not available." }),
    ).toBeVisible();
    await expect(page.getByText("Other account private")).not.toBeVisible();
    await expect(
      page.getByRole("button", { name: "New task", exact: true }),
    ).toBeDisabled();
    await page.goto("/projects/not-a-uuid");
    await expect(
      page.getByRole("heading", { name: "Nothing in this orbit." }),
    ).toBeVisible();
    expect(account.id).not.toBe(b.id);
  } finally {
    await b.cleanup();
  }
});

test("sign-out removes private UI; cleared/expired session cannot render private data", async ({
  page,
  account,
  context,
}) => {
  await page.goto("/");
  await addProject(page, "Persistent after sign-out");
  await page.getByRole("button", { name: "Sign out", exact: true }).click();
  await expect(page).toHaveURL(/\/login$/);
  await page.goto("/");
  await expect(page).toHaveURL(/\/login\?reason=session/);
  expect((await api("projects", "GET", account.token)).data[0].name).toBe(
    "Persistent after sign-out",
  );
  await context.addCookies(
    account.cookies.map(({ name, value }) => ({
      name,
      value,
      domain: "localhost",
      path: "/",
      sameSite: "Lax" as const,
    })),
  );
  await page.goto("/");
  await expect(page).toHaveURL(/\/login\?reason=session/);
  const returningCookies = await account.reconnect();
  await context.addCookies(
    returningCookies.map(({ name, value }) => ({
      name,
      value,
      domain: "localhost",
      path: "/",
      sameSite: "Lax" as const,
    })),
  );
  await page.goto("/");
  await expect(
    page.getByRole("heading", {
      name: "Persistent after sign-out",
      exact: true,
    }),
  ).toBeVisible();
  await context.clearCookies();
  await page.reload();
  await expect(page).toHaveURL(/\/login/);
});

test("GitHub-only login initiates PKCE and handles callback without a code", async ({
  browser,
}) => {
  const context = await browser.newContext();
  const page = await context.newPage();
  await page.goto(
    "http://localhost:3000/auth/callback?next=https://untrusted.test",
  );
  await expect(page).toHaveURL("http://localhost:3000/login?reason=oauth");
  await expect(page.getByRole("main").getByRole("alert")).toContainText(
    "Sign-in wasn’t completed",
  );
  await page.route(`${localConfig().url}/auth/v1/authorize**`, (route) =>
    route.fulfill({
      status: 400,
      contentType: "application/json",
      body: JSON.stringify({ error: "provider_disabled" }),
    }),
  );
  await expect(
    page.getByRole("button", { name: "Continue with GitHub" }),
  ).toBeVisible();
  expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
  await page.getByRole("button", { name: "Continue with GitHub" }).click();
  await expect(page).toHaveURL(
    new RegExp(`${localConfig().url}/auth/v1/authorize`),
  );
  const oauthUrl = new URL(page.url());
  expect(oauthUrl.searchParams.get("provider")).toBe("github");
  expect(oauthUrl.searchParams.get("redirect_to")).toBe(
    "http://localhost:3000/auth/callback",
  );
  expect(oauthUrl.searchParams.get("code_challenge_method")).toBe("s256");
  expect(oauthUrl.searchParams.get("code_challenge")).toBeTruthy();
  await context.close();
});

test("populated Editorial layout and long records stay usable on desktop and mobile", async ({
  page,
  account,
}, testInfo) => {
  const names = [
    "A small beginning",
    "Space for the next idea",
    "Good work in progress",
  ];
  for (const name of names)
    await api("projects", "POST", account.token, {
      name,
      owner_id: account.id,
    });
  const project = (await api("projects?limit=1", "GET", account.token)).data[0];
  await api("tasks", "POST", account.token, [
    { title: "Gather the first ideas", status: "done", project_id: project.id },
    {
      title: "Find a clear direction",
      status: "doing",
      project_id: project.id,
    },
    {
      title: "Make something meaningful",
      status: "todo",
      project_id: project.id,
    },
  ]);
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto("/");
  await metric(page, "Total projects", 3);
  await metric(page, "Total tasks", 3);
  await metric(page, "Tasks completed", 1);
  expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
  await page.screenshot({
    path: testInfo.outputPath("desktop-overview.png"),
    fullPage: true,
  });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto(`/projects/${project.id}`);
  await expect(page.locator(".record-list > li")).toHaveCount(3);
  expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
  await page.screenshot({
    path: testInfo.outputPath("mobile-tasks.png"),
    fullPage: true,
  });
  await page.getByRole("button", { name: "New task", exact: true }).click();
  await page.screenshot({
    path: testInfo.outputPath("mobile-dialog.png"),
    fullPage: true,
  });
  await page.keyboard.press("Escape");
  await api(`projects?id=eq.${project.id}`, "PATCH", account.token, {
    name: "P".repeat(120),
  });
  await api("tasks", "POST", account.token, {
    title: "T".repeat(200),
    project_id: project.id,
  });
  for (const width of [320, 390, 768, 1440]) {
    await page.setViewportSize({ width, height: 900 });
    await page.reload();
    await expect(
      page.getByRole("heading", { name: "P".repeat(120), exact: true }),
    ).toBeVisible();
    await expect(
      page.getByRole("heading", { name: "T".repeat(200), exact: true }),
    ).toBeVisible();
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= window.innerWidth,
      ),
    ).toBe(true);
  }
});

test("sign-out in another tab immediately hides private workspace", async ({
  page,
  account,
  context,
}) => {
  await page.goto("/");
  await addProject(page, "Private across tabs");
  const other = await context.newPage();
  await other.goto("http://localhost:3000/");
  await metric(other, "Total projects", 1);
  await other.getByRole("button", { name: "Sign out", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "Let’s reconnect." }),
  ).toBeVisible();
  await expect(
    page.getByRole("heading", { name: "Private across tabs", exact: true }),
  ).not.toBeVisible();
  expect(account.id).toBeTruthy();
});

test("failed task status write preserves the stored status and totals until retry", async ({
  page,
  account,
}) => {
  const project = (
    await api("projects", "POST", account.token, {
      name: "Status retry",
      owner_id: account.id,
    })
  ).data[0];
  const task = (
    await api("tasks", "POST", account.token, {
      title: "Keep it truthful",
      project_id: project.id,
    })
  ).data[0];
  await page.goto(`/projects/${project.id}`);
  await metric(page, "Tasks completed", 0);
  await page.route("**/rest/v1/tasks?**", (route) =>
    route.request().method() === "PATCH" ? route.abort() : route.continue(),
  );
  const status = page.getByRole("combobox", {
    name: "Status for Keep it truthful",
  });
  await status.selectOption("done");
  await expect(page.getByRole("status")).toContainText(
    "Task status wasn’t saved",
  );
  await expect(status).toHaveValue("todo");
  await metric(page, "Tasks completed", 0);
  expect(
    (await api(`tasks?id=eq.${task.id}`, "GET", account.token)).data[0].status,
  ).toBe("todo");
  await page.unroute("**/rest/v1/tasks?**");
  await status.selectOption("done");
  await metric(page, "Tasks completed", 1);
});
