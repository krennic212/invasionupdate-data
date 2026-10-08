#!/usr/bin/env node
/**
 * Approval gate: mark pending feed rows as approved so the site shows them.
 *
 *   node scripts/approve.mjs all                 # approve every pending row
 *   node scripts/approve.mjs dhs-20261008-ian-clive-burton,ice-20260925-axon-solomon-mejia-ortega
 *
 * Only rows with status "pending" are touched. "all" skips rows held by a hard guard
 * (they carry a holdReason); a held row is approved only when its id is named, which
 * also clears its holdReason. Unknown ids make the run fail
 * (so a typo is never silently ignored). Nothing is ever deleted.
 */
import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

export function approveRows(rows, spec) {
  const want = String(spec || "").trim();
  if (!want) throw new Error('nothing to approve: pass "all" or a comma-separated list of ids');
  const all = want.toLowerCase() === "all";
  const ids = all ? null : new Set(want.split(/[\s,]+/).filter(Boolean));
  const approved = [];
  const out = rows.map((r) => {
    if (r?.status !== "pending") return r;
    if (all && r.holdReason) return r;
    if (!all && !ids.has(r.id)) return r;
    approved.push(r.id);
    const { holdReason, ...rest } = r;
    return { ...rest, status: "approved" };
  });
  const unknown = all ? [] : [...ids].filter((id) => !approved.includes(id));
  return { rows: out, approved, unknown };
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const file = process.env.HARVEST_FILE || "data/harvest.json";
  const rows = JSON.parse(readFileSync(file, "utf8"));
  const { rows: out, approved, unknown } = approveRows(rows, process.argv.slice(2).join(","));
  if (unknown.length) {
    console.error(`No pending row with id: ${unknown.join(", ")}`);
    process.exit(1);
  }
  if (approved.length) writeFileSync(file, `${JSON.stringify(out, null, 2)}\n`);
  console.log(JSON.stringify({ approved: approved.length, ids: approved, stillPending: out.filter((r) => r?.status === "pending").length }));
}
