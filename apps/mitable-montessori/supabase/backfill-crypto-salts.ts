/**
 * One-shot backfill: insert a `school_crypto_salts` row for any `schools`
 * row that's missing one. Needed because /api/schools/register did not
 * create the salt before this fix landed, leaving any school created via
 * the live signup flow unable to bootstrap (/api/v1/sync/pull 500s).
 *
 * Safe to re-run — it inserts only for schools without a salt.
 *
 * Usage:
 *   pnpm tsx supabase/backfill-crypto-salts.ts
 *
 * Reads NEXT_PUBLIC_SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY from .env.local
 */
import { createClient } from "@supabase/supabase-js";
import { randomBytes } from "node:crypto";
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const envPath = join(here, "..", ".env.local");
for (const line of readFileSync(envPath, "utf8").split("\n")) {
  const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
  if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^"(.*)"$/, "$1");
}

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !serviceKey) {
  console.error("Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY");
  process.exit(1);
}

async function main() {
  const supabase = createClient(url!, serviceKey!, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  const { data: schools, error: schoolsErr } = await supabase
    .from("schools")
    .select("id, name");
  if (schoolsErr) throw schoolsErr;

  const { data: salts, error: saltsErr } = await supabase
    .from("school_crypto_salts")
    .select("school_id");
  if (saltsErr) throw saltsErr;

  const haveSalt = new Set((salts ?? []).map((r) => r.school_id as string));
  const missing = (schools ?? []).filter((s) => !haveSalt.has(s.id as string));

  console.log(
    `→ ${schools?.length ?? 0} schools total, ${haveSalt.size} have salt, ${missing.length} missing`
  );

  for (const s of missing) {
    const salt = randomBytes(32).toString("base64");
    const { error } = await supabase
      .from("school_crypto_salts")
      .insert({ school_id: s.id, salt });
    if (error) {
      console.error(`  ✗ ${s.name} (${s.id}): ${error.message}`);
    } else {
      console.log(`  ✓ ${s.name} (${s.id})`);
    }
  }

  console.log("done.");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
