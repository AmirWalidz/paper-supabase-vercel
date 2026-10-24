import test from "node:test";
import assert from "node:assert/strict";
import { validateText, UUID, PAGE_SIZE, siteUrl } from "../src/lib/validation";

test("project and task input is trimmed, required, and bounded by Unicode characters", () => {
  assert.equal(
    validateText(" \nGood work\t ", 120, "Project name"),
    "Good work",
  );
  for (const limit of [120, 200]) {
    assert.throws(() => validateText(" \n\t", limit, "Name"), /required/);
    assert.equal(
      validateText("🪐".repeat(limit), limit, "Name"),
      "🪐".repeat(limit),
    );
    assert.throws(
      () => validateText("a".repeat(limit + 1), limit, "Name"),
      /characters or fewer/,
    );
  }
});

test("IDs and page bounds use explicit formats", () => {
  assert.ok(UUID.test("00000000-0000-0000-0000-000000000001"));
  assert.ok(!UUID.test("not-an-id"));
  assert.equal(PAGE_SIZE, 20);
});

test("OAuth callbacks use a configured origin, never a caller-supplied redirect", () => {
  const previous = process.env.NEXT_PUBLIC_SITE_URL;
  try {
    process.env.NEXT_PUBLIC_SITE_URL = "https://orbit.example.test/untrusted";
    assert.equal(siteUrl(), "https://orbit.example.test");
    process.env.NEXT_PUBLIC_SITE_URL = "http://localhost:3000";
    assert.equal(siteUrl(), "http://localhost:3000");
    for (const value of [
      "http://untrusted.test",
      "javascript:alert(1)",
      "not a URL",
    ]) {
      process.env.NEXT_PUBLIC_SITE_URL = value;
      assert.throws(siteUrl);
    }
  } finally {
    if (previous === undefined) delete process.env.NEXT_PUBLIC_SITE_URL;
    else process.env.NEXT_PUBLIC_SITE_URL = previous;
  }
});
