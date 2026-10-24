import test from "node:test";
import assert from "node:assert/strict";
import { api, fixtureUser } from "./local";
import { loadWorkspace } from "../src/lib/data";

test("project vertical slice persists, isolates owners, and checks resulting owner", async () => {
  const a = await fixtureUser();
  const b = await fixtureUser();
  try {
    const created = await api("projects", "POST", a.token, {
      name: "Synthetic project",
      owner_id: a.id,
    });
    assert.equal(created.status, 201);
    const id = created.data[0].id;
    const persisted = await api(`projects?id=eq.${id}`, "GET", a.token);
    assert.equal(persisted.data[0].name, "Synthetic project");
    assert.equal(
      (await api(`projects?id=eq.${id}`, "GET", b.token)).data.length,
      0,
    );
    assert.equal(
      (await api(`projects?id=eq.${id}`, "PATCH", a.token, { owner_id: b.id }))
        .status,
      403,
    );
    assert.equal(
      (
        await api("projects", "POST", b.token, {
          name: "Spoof",
          owner_id: a.id,
        })
      ).status,
      403,
    );
    const renamed = await api(`projects?id=eq.${id}`, "PATCH", a.token, {
      name: "Renamed project",
    });
    assert.equal(renamed.data[0].name, "Renamed project");
    assert.ok(renamed.data[0].updated_at >= created.data[0].updated_at);
    assert.equal(
      (
        await api(`projects?id=eq.${id}`, "PATCH", b.token, {
          name: "Hijack",
          owner_id: b.id,
        })
      ).data.length,
      0,
    );
    assert.equal(
      (await api(`projects?id=eq.${id}`, "DELETE", b.token)).data.length,
      0,
    );
    assert.equal(
      (await api(`projects?id=eq.${id}`, "GET", a.token)).data[0].name,
      "Renamed project",
    );
  } finally {
    await a.cleanup();
    await b.cleanup();
  }
});

test("anonymous and two-user direct API security, constraints, counts, and cascade", async () => {
  const a = await fixtureUser();
  const b = await fixtureUser();
  try {
    const pa = (
      await api("projects", "POST", a.token, { name: "A", owner_id: a.id })
    ).data[0];
    const pb = (
      await api("projects", "POST", b.token, { name: "B", owner_id: b.id })
    ).data[0];
    const ta = (
      await api("tasks", "POST", a.token, {
        title: "A task",
        project_id: pa.id,
      })
    ).data[0];
    const tb = (
      await api("tasks", "POST", b.token, {
        title: "B task",
        project_id: pb.id,
      })
    ).data[0];
    assert.equal(ta.status, "todo");
    for (const [table, id, insert, update] of [
      [
        "projects",
        pa.id,
        { name: "Anonymous", owner_id: a.id },
        { name: "Anonymous" },
      ],
      [
        "tasks",
        ta.id,
        { title: "Anonymous", project_id: pa.id },
        { title: "Anonymous" },
      ],
    ] as const) {
      for (const method of ["GET", "POST", "PATCH", "DELETE"]) {
        const response = await api(
          method === "POST" ? table : `${table}?id=eq.${id}`,
          method,
          undefined,
          method === "POST" ? insert : method === "PATCH" ? update : undefined,
        );
        assert.ok(
          [401, 403].includes(response.status),
          `Anonymous ${method} ${table} denied`,
        );
      }
    }
    assert.deepEqual(
      (await api(`tasks?id=eq.${ta.id}`, "GET", b.token)).data,
      [],
    );
    assert.equal(
      (
        await api("tasks", "POST", b.token, {
          project_id: pa.id,
          title: "Cross insert",
        })
      ).status,
      403,
    );
    assert.deepEqual(
      (
        await api(`tasks?id=eq.${ta.id}`, "PATCH", b.token, {
          title: "Hijack",
          project_id: pb.id,
        })
      ).data,
      [],
    );
    assert.deepEqual(
      (await api(`tasks?id=eq.${ta.id}`, "DELETE", b.token)).data,
      [],
    );
    assert.equal(
      (
        await api(`tasks?id=eq.${ta.id}`, "PATCH", a.token, {
          project_id: pb.id,
        })
      ).status,
      403,
    );
    assert.equal(
      (
        await api("tasks", "POST", a.token, {
          project_id: pb.id,
          title: "Cross parent",
        })
      ).status,
      403,
    );
    assert.equal(
      (
        await api(`projects?id=eq.${pa.id}`, "PATCH", a.token, {
          owner_id: b.id,
        })
      ).status,
      403,
    );
    for (const name of [
      "",
      " ",
      "\t\n",
      "\u00a0",
      "\ufeff",
      "\u2000padded\u2000",
      " padded ",
      "x".repeat(121),
      null,
    ]) {
      assert.equal(
        (await api("projects", "POST", a.token, { name, owner_id: a.id }))
          .status,
        400,
      );
      assert.equal(
        (await api(`projects?id=eq.${pa.id}`, "PATCH", a.token, { name }))
          .status,
        400,
      );
    }
    for (const title of [
      "",
      " ",
      "\t\n",
      "\u00a0",
      "\ufeff",
      "\u2000padded\u2000",
      " padded ",
      "x".repeat(201),
      null,
    ]) {
      assert.equal(
        (await api("tasks", "POST", a.token, { title, project_id: pa.id }))
          .status,
        400,
      );
      assert.equal(
        (await api(`tasks?id=eq.${ta.id}`, "PATCH", a.token, { title })).status,
        400,
      );
    }
    assert.equal(
      (
        await api("projects", "POST", a.token, {
          name: "x".repeat(120),
          owner_id: a.id,
        })
      ).status,
      201,
    );
    assert.equal(
      (
        await api("tasks", "POST", a.token, {
          title: "x".repeat(200),
          project_id: pa.id,
        })
      ).status,
      201,
    );
    for (const status of ["invalid", null, "DONE"]) {
      assert.equal(
        (await api(`tasks?id=eq.${ta.id}`, "PATCH", a.token, { status }))
          .status,
        400,
      );
    }
    assert.equal(
      (
        await api("tasks", "POST", a.token, {
          title: "No parent",
          project_id: null,
        })
      ).status,
      403,
    );
    assert.equal(
      (
        await api("tasks", "POST", a.token, {
          title: "Missing parent",
          project_id: "00000000-0000-0000-0000-000000000001",
        })
      ).status,
      403,
    );
    assert.equal(
      (
        await api("projects", "POST", a.token, {
          name: "No owner",
          owner_id: null,
        })
      ).status,
      403,
    );
    for (const status of ["doing", "done", "todo"]) {
      const changed = await api(`tasks?id=eq.${ta.id}`, "PATCH", a.token, {
        status,
        title: "Renamed task",
      });
      assert.equal(changed.data[0].status, status);
      assert.equal(changed.data[0].title, "Renamed task");
    }
    const bulk = await api(
      "tasks",
      "POST",
      a.token,
      Array.from({ length: 125 }, (_, i) => ({
        project_id: pa.id,
        title: `Synthetic task ${i}`,
        status: i % 2 ? "todo" : "done",
      })),
      "return=minimal",
    );
    assert.equal(bulk.status, 201);
    const firstPage = await loadWorkspace(a.client, "tasks", 0, pa.id);
    const secondPage = await loadWorkspace(a.client, "tasks", 1, pa.id);
    assert.equal(firstPage.tasks.length, 20);
    assert.equal(firstPage.hasNext, true);
    assert.equal(secondPage.tasks.length, 20);
    assert.equal(
      firstPage.tasks.filter((t) => secondPage.tasks.some((s) => s.id === t.id))
        .length,
      0,
    );
    assert.deepEqual(firstPage.totals, {
      projects: 2,
      tasks: 127,
      completed: 63,
    });
    assert.deepEqual((await loadWorkspace(b.client, "overview", 0)).totals, {
      projects: 1,
      tasks: 1,
      completed: 0,
    });
    assert.equal(
      (await api(`tasks?id=eq.${ta.id}`, "DELETE", a.token)).data.length,
      1,
    );
    assert.equal(
      (await api(`projects?id=eq.${pa.id}`, "DELETE", a.token)).data.length,
      1,
    );
    assert.deepEqual(
      (await api(`tasks?project_id=eq.${pa.id}`, "GET", a.token)).data,
      [],
    );
    assert.equal(
      (await api(`tasks?id=eq.${tb.id}`, "GET", b.token)).data.length,
      1,
    );
    assert.deepEqual((await loadWorkspace(a.client, "overview", 0)).totals, {
      projects: 1,
      tasks: 0,
      completed: 0,
    });
  } finally {
    await a.cleanup();
    await b.cleanup();
  }
});
