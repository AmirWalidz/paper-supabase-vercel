import { writeFileSync } from "node:fs";
import { localConfig } from "../tests/local";

const config = localConfig();
writeFileSync(
  ".env.local",
  `NEXT_PUBLIC_SUPABASE_URL=${config.url}\nNEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=${config.key}\nNEXT_PUBLIC_SITE_URL=http://localhost:3000\n`,
  { mode: 0o600 },
);
console.log(
  "Wrote ignored .env.local using only local public API configuration.",
);
