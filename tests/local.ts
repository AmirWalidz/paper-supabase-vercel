import { execFileSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import { createClient } from "@supabase/supabase-js";
import { createServerClient } from "@supabase/ssr";

let cached: { url: string; key: string; adminKey: string } | undefined;

export function localConfig() {
  if (cached) return cached;
  const status = JSON.parse(
    execFileSync(
      "npx",
      ["--no-install", "supabase", "status", "--output", "json"],
      { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] },
    ),
  );
  const url = new URL(status.API_URL);
  if (!["localhost", "127.0.0.1"].includes(url.hostname))
    throw new Error("Test fixtures are restricted to local Supabase.");
  cached = {
    url: url.origin,
    key: status.ANON_KEY as string,
    adminKey: status.SERVICE_ROLE_KEY as string,
  };
  return cached;
}

export async function fixtureUser() {
  const config = localConfig();
  const admin = createClient(config.url, config.adminKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const email = `orbit-${randomUUID()}@example.test`;
  const password = randomUUID();
  const created = await admin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
  });
  if (created.error || !created.data.user)
    throw new Error("Local fixture user creation failed.");
  const client = createClient(config.url, config.key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  async function signIn() {
    const signed = await client.auth.signInWithPassword({ email, password });
    if (signed.error || !signed.data.session)
      throw new Error("Local fixture sign-in failed.");
    const cookies: {
      name: string;
      value: string;
      options: Record<string, unknown>;
    }[] = [];
    const ssr = createServerClient(config.url, config.key, {
      cookies: {
        getAll: () => [],
        setAll: (values) => {
          cookies.push(...values);
        },
      },
    });
    const restored = await ssr.auth.setSession(signed.data.session);
    if (restored.error)
      throw new Error("Local fixture session creation failed.");
    return { session: signed.data.session, cookies };
  }
  const signed = await signIn();
  return {
    id: created.data.user.id,
    token: signed.session.access_token,
    client,
    cookies: signed.cookies,
    async reconnect() {
      return (await signIn()).cookies;
    },
    async cleanup() {
      await client.auth.signOut();
      const result = await admin.auth.admin.deleteUser(created.data.user!.id);
      if (result.error) throw new Error("Local fixture cleanup failed.");
    },
  };
}

export async function api(
  path: string,
  method = "GET",
  token?: string,
  body?: unknown,
  prefer = "return=representation",
) {
  const config = localConfig();
  const response = await fetch(`${config.url}/rest/v1/${path}`, {
    method,
    headers: {
      apikey: config.key,
      Authorization: `Bearer ${token || config.key}`,
      "Content-Type": "application/json",
      Prefer: prefer,
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const text = await response.text();
  return {
    status: response.status,
    data: text ? JSON.parse(text) : null,
    range: response.headers.get("content-range"),
  };
}
