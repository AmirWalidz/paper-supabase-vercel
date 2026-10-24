export const PAGE_SIZE = 20;
export const UUID =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function validateText(value: string, limit: number, label: string) {
  const text = value.trim();
  if (!text) throw new Error(`${label} is required.`);
  if ([...text].length > limit)
    throw new Error(`${label} must be ${limit} characters or fewer.`);
  return text;
}

export function siteUrl() {
  const configured = process.env.NEXT_PUBLIC_SITE_URL;
  if (!configured)
    throw new Error("Configure NEXT_PUBLIC_SITE_URL before signing in.");
  const url = new URL(configured);
  if (
    url.protocol !== "https:" &&
    !(
      url.protocol === "http:" &&
      ["localhost", "127.0.0.1"].includes(url.hostname)
    )
  ) {
    throw new Error(
      "Configure an HTTPS site URL (HTTP is allowed for localhost only).",
    );
  }
  return url.origin;
}
