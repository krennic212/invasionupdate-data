import test from "node:test";
import assert from "node:assert/strict";
import { isOfficialXPostUrl, isLiveSourceRow, isOfficialRow, isTrustedXPostUrl } from "./rules.mjs";
import { scan, normalizePosts } from "./x-scan.mjs";
import { reserveCalls } from "./x-usage.mjs";

test("official agency X post URL passes the pre-publish source check (case-insensitive, x.com and twitter.com)", () => {
  for (const u of [
    "https://x.com/ICEgov/status/2107199156326449433",
    "https://x.com/ero__phoenix/status/123",
    "https://twitter.com/EroHarlingen/status/123",
    "https://www.twitter.com/HSI_HQ/status/123/",
    "https://mobile.x.com/USAO_SDTX/status/123",
  ]) {
    assert.equal(isOfficialXPostUrl(u), true, u);
    assert.equal(isLiveSourceRow({ sourceUrl: u }), true, u);
  }
  // photo / .gov-only checks are unchanged: an X post is still not an official .gov page
  assert.equal(isOfficialRow({ sourceUrl: "https://x.com/ICEgov/status/1" }), false);
});

test("trusted reporter @BillMelugin_ passes the live-source check (Krennic decision 2026-10-09) but is not an official agency / photo source", () => {
  for (const u of ["https://x.com/BillMelugin_/status/2108569012669907166", "https://x.com/billmelugin_/status/1", "https://twitter.com/BILLMELUGIN_/status/1/"]) {
    assert.equal(isLiveSourceRow({ sourceUrl: u }), true, u);
    assert.equal(isTrustedXPostUrl(u), true, u);
    assert.equal(isOfficialXPostUrl(u), false, u);
  }
  for (const u of ["https://x.com/BillMelugin/status/1", "https://x.com/BillMelugin__/status/1", "https://x.com/BillMelugin_", "https://x.com/BillMelugin_/status/1/photo/1", "http://x.com/BillMelugin_/status/1"]) {
    assert.equal(isLiveSourceRow({ sourceUrl: u }), false, u);
  }
});

test("other reporter / media handles still fail", () => {
  for (const h of ["AliBradleyTV", "FoxNews", "foxnewspolitics", "JennieSTaer", "nypost", "libsoftiktok", "StephenM", "BillMelugin", "BillMelugin__"]) {
    assert.equal(isOfficialXPostUrl(`https://x.com/${h}/status/123`), false, h);
    assert.equal(isLiveSourceRow({ sourceUrl: `https://x.com/${h}/status/123` }), false, h);
  }
});

test("non-status x.com URLs fail", () => {
  for (const u of [
    "https://x.com/ICEgov",
    "https://x.com/ICEgov/",
    "https://x.com/ICEgov/media",
    "https://x.com/ICEgov/status/",
    "https://x.com/ICEgov/status/abc",
    "https://x.com/ICEgov/status/123/photo/1",
    "https://x.com/ICEgov/status/123?ref=evil",
    "https://x.com/search?q=from:ICEgov",
    "http://x.com/ICEgov/status/123",
    "https://x.com/i/web/status/123",
  ]) assert.equal(isLiveSourceRow({ sourceUrl: u }), false, u);
});

test("lookalike handles and hosts fail", () => {
  for (const u of [
    "https://x.com/ICEgov_/status/1",
    "https://x.com/ICEgov2/status/1",
    "https://x.com/IICEgov/status/1",
    "https://x.com/ICEg0v/status/1",
    "https://x.com/ERO_Phoenix/status/1",
    "https://x.com/EROHarlingen1/status/1",
    "https://x.com.evil.com/ICEgov/status/1",
    "https://evilx.com/ICEgov/status/1",
    "https://fx.com/ICEgov/status/1",
    "https://xcom/ICEgov/status/1",
  ]) assert.equal(isLiveSourceRow({ sourceUrl: u }), false, u);
});

const post = (id, username, text) => ({ id, username, created_at: "2026-10-08T15:00:00Z", text });

test("x-scan: official post goes live verbatim; reporter, minor, at-large, no-status go to review; dedupe by name", () => {
  const posts = normalizePosts([
    post("11", "ERONewYork", "ERO New York arrested Jose Luis Ramos, a criminal illegal alien from Ecuador charged with assault. https://t.co/x"),
    post("12", "AliBradleyTV", "ICE arrested Pedro Gomez Ruiz, an illegal alien from Honduras charged with robbery."),
    post("13", "ICEgov", "ICE arrested Mario Lopez Diaz, 16, a Mexican national charged with robbery."),
    post("14", "EROHouston", "Carlos Mendez Soto, an illegal alien from Mexico charged with murder, remains at large."),
    post("15", "ICEgov", "ICE arrested Jane Existing, a Mexican national charged with theft."),
    post("16", "ICEgov", "RT @EROHouston: ICE arrested Ana Torres Vega, a Mexican national charged with theft."),
  ]);
  const { live, review, skipped } = scan(posts, { existing: [{ name: "jane  EXISTING" }] });
  assert.deepEqual(live.map((r) => r.name), ["Jose Luis Ramos"]);
  const r = live[0];
  assert.equal(r.crime, "Charged: ERO New York arrested Jose Luis Ramos, a criminal illegal alien from Ecuador charged with assault.");
  assert.equal(r.sourceUrl, "https://x.com/ERONewYork/status/11");
  assert.equal(r.photo, "");
  assert.equal(r.when, "8 Oct 2026");
  assert.equal(r.status, "approved");
  assert.ok(isLiveSourceRow(r));
  assert.deepEqual(review.map((x) => x.name).sort(), ["Carlos Mendez Soto", "Mario Lopez Diaz", "Pedro Gomez Ruiz"]);
  assert.ok(review.every((x) => x.status === "pending" && x.photo === "" && x.reviewReason));
  assert.match(review.find((x) => x.name === "Mario Lopez Diaz").holdReason, /minor/);
  assert.match(review.find((x) => x.name === "Carlos Mendez Soto").holdReason, /at large/);
  assert.match(review.find((x) => x.name === "Pedro Gomez Ruiz").reviewReason, /not an official/);
  assert.equal(skipped.length, 1);
});

test("x-scan: charged is never labeled convicted; picks must be verbatim", () => {
  const p = normalizePosts([post("21", "USAO_SDTX", "Luis Ortega Paz, a citizen of Mexico, was indicted for illegal reentry.")]);
  assert.match(scan(p).live[0].crime, /^Charged: /);
  assert.throws(() => scan(p, { picks: { 21: [{ name: "Luis Ortega Paz", sentence: "Luis Ortega Paz was convicted." }] } }), /verbatim/);
});

test("x-usage: daily cap 999 is never passed", () => {
  const u = { date: "2026-10-08", calls: 998, log: [] };
  assert.equal(reserveCalls(u, 1).calls, 999);
  assert.equal(reserveCalls({ ...u, calls: 999 }, 1), null);
  assert.equal(reserveCalls(u, 2), null);
});

test("'3-time deported' is prior history, never the Removed stage", async () => {
  const { statusFrom } = await import("./parse.mjs");
  assert.notEqual(statusFrom("ICE arrested Jose Doe, a 3-time deported criminal illegal alien, who has been convicted of assault."), "Removed");
  assert.notEqual(statusFrom("ICE arrested Jose Doe, an illegal alien deported three times, charged with reentry."), "Removed");
  assert.notEqual(statusFrom("LA ICE officers arrested Luis Doe, 44, a Mexican gang member removed from the U.S. at least twice and served 7+ years."), "Removed");
  assert.notEqual(statusFrom("Criminal illegal alien Jose Doe was arrested by ICE and on Sept. 9 he was ordered removed by an immigration judge."), "Removed");
  assert.equal(statusFrom("ICE deported Jose Doe, an illegal alien from Mexico."), "Removed");
});

test("xLabel: an arrest with no formal charge is Arrested, never Charged", async () => {
  const { xLabel } = await import("./x-scan.mjs");
  assert.equal(xLabel("ICE arrested Juan Perez, a criminal illegal alien from Cuba with a final order of removal."), "Arrested");
  assert.equal(xLabel("ERO New Orleans arrested Marlon Romero Medina, a criminal illegal alien from Honduras, in Smyrna, TN last week."), "Arrested");
  assert.equal(xLabel("Juan Perez, a Mexican national, was arrested and charged with illegal reentry."), "Charged");
  assert.equal(xLabel("Juan Perez, a Mexican national, was indicted for illegal reentry."), "Charged");
  assert.equal(xLabel("Juan Perez, an illegal alien from Mexico, convicted of assault."), "Convicted");
  const { holdReasonsForRow } = await import("./guards.mjs");
  assert.deepEqual(holdReasonsForRow({ name: "Juan Perez", crime: "Arrested: ICE arrested Juan Perez, a criminal illegal alien from Cuba.", usa: "" }), []);
});

test("pick hold: a reviewer hold sends the row to review even when the guards pass", () => {
  const post = { id: "2108316663837839652", username: "FBI", created_at: "2026-10-08T22:00:37.000Z",
    text: "Richard Molina-Ovalle of Worcester and Jose Molina-Ovalle, a Dominican national unlawfully residing in Worcester, were charged in an indictment with conspiracy." };
  const sentence = post.text;
  const out = scan(normalizePosts([post]), { existing: [], picks: { [post.id]: [{ name: "Richard Molina-Ovalle", sentence, hold: "non-citizen wording describes the co-defendant" }] } });
  assert.equal(out.live.some((r) => r.name === "Richard Molina-Ovalle"), false);
  const held = out.review.find((r) => r.name === "Richard Molina-Ovalle");
  assert.ok(held && held.status === "pending" && /reviewer hold/.test(held.holdReason));
});

test("x-queries: every official handle and trusted reporter is in exactly one query and each query fits the X limit", async () => {
  const { buildQueries, MAX_QUERY } = await import("./x-queries.mjs");
  const qs = buildQueries();
  for (const q of qs) assert.ok(q.length <= MAX_QUERY);
  const all = qs.flatMap((q) => [...q.matchAll(/from:([A-Za-z0-9_]+)/g)].map((m) => m[1]));
  const { LIVE_X_HANDLES } = await import("./x-handles.mjs");
  assert.deepEqual([...all].sort(), [...LIVE_X_HANDLES].sort());
  assert.ok(all.includes("BillMelugin_"), "trusted reporter is scanned");
  for (const h of ["AliBradleyTV", "FoxNews", "nypost"]) assert.ok(!all.includes(h), h);
});

test("x-scan: trusted reporter @BillMelugin_ goes live, guards still hold, no photo candidate", () => {
  const posts = normalizePosts([
    { ...post("21", "BillMelugin_", "ICE arrested Pedro Gomez Ruiz, an illegal alien from Honduras charged with robbery."), media: [{ type: "photo", url: "https://pbs.twimg.com/media/a.jpg" }] },
    post("22", "BillMelugin_", "ICE arrested Mario Lopez Diaz, 16, a Mexican national charged with robbery."),
    post("23", "BillMelugin_", "Carlos Mendez Soto, an illegal alien from Mexico charged with murder, remains at large."),
    post("24", "BillMelugin_", "Police arrested Juan Perez Lara for robbery."),
  ]);
  const { live, review, photoCandidates } = scan(posts, { existing: [] });
  assert.deepEqual(live.map((r) => r.name), ["Pedro Gomez Ruiz"]);
  assert.equal(live[0].sourceUrl, "https://x.com/BillMelugin_/status/21");
  assert.equal(live[0].crime, "Charged: ICE arrested Pedro Gomez Ruiz, an illegal alien from Honduras charged with robbery.");
  assert.equal(live[0].photo, "");
  assert.ok(isLiveSourceRow(live[0]));
  assert.deepEqual((photoCandidates || []).length, 0);
  assert.ok(review.every((x) => x.status === "pending" && x.holdReason));
  assert.ok(review.some((x) => x.name === "Mario Lopez Diaz"));
  assert.ok(review.some((x) => x.name === "Carlos Mendez Soto"));
});

import { rowsForPost } from "./x-scan.mjs";

test("X scan fills city + lat/lon from the post's own sentence (Mass. / MS)", () => {
  const mk = (id, username, text) => normalizePosts([{ id, username, created_at: "2026-10-09T15:00:00Z", text }])[0];
  const [a] = rowsForPost(mk("2108517077191721359", "EROBoston", "On Oct. 2, ICE Boston arrested Maycon Eleazar De Jesus Barrios, a criminal illegal alien from Guatemala, during targeted operations in Marlborough, Mass. His criminal history includes arrest for assault and battery on a family/household member."));
  assert.equal(a.row.city, "Marlborough, MA");
  assert.equal(typeof a.row.lat, "number");
  const [b] = rowsForPost(mk("1", "ERONewOrleans", "ERO New Orleans arrested Byron Arevalo-Pacheco, a criminal illegal alien from Guatemala, in Yazoo City, MS. His criminal history includes molestation of minor."));
  assert.equal(b.row.city, "Yazoo City, MS");
  const [c] = rowsForPost(mk("2", "ICEgov", "Salvador Parra Lopez, an illegal alien from Mexico, convicted of aiding and abetting possession with intent to distribute a controlled substance."));
  assert.equal(c.row.city, "Not stated");
  assert.equal(c.row.lat, null);
});

test("x-scan: a repeated post id keeps the full-text copy (short then long, and long then short)", async () => {
  const { collapseById } = await import("./x-scan.mjs");
  const short = "ERO Houston arrested Juan Perez Lara, an illegal alien from Mexico. His criminal history includes https://t.co/abc";
  const full = "ERO Houston arrested Juan Perez Lara, an illegal alien from Mexico. His criminal history includes a conviction for aggravated assault in Houston, TX.";
  const shortCopy = { id: "2108558269681729603", username: "EROHouston", created_at: "2026-10-09T14:00:41.000Z", text: short };
  const longCopy = { id: "2108558269681729603", username: "EROHouston", created_at: "2026-10-09T14:00:41.000Z", note_tweet: { text: full }, text: short };
  for (const order of [[shortCopy, longCopy], [longCopy, shortCopy]]) {
    const posts = normalizePosts(order);
    assert.equal(posts.length, 2);
    const one = collapseById(posts);
    assert.equal(one.length, 1);
    assert.equal(one[0].text, full);
    const { live } = scan(posts, { existing: [] });
    assert.equal(live.length, 1);
    assert.match(live[0].text, /conviction for aggravated assault/);
    assert.ok(!/criminal history includes$/.test(live[0].text));
  }
  // also across separate response files (raw API pages), as in a real run
  const page = (p) => ({ data: [p], includes: { users: [{ id: "9", username: "EROHouston" }] } });
  const a = { id: "5", author_id: "9", created_at: "2026-10-09T14:00:41.000Z", text: "short" };
  const b = { ...a, note_tweet: { text: "short but now the much longer full text" } };
  for (const files of [[page(a), page(b)], [page(b), page(a)]]) {
    const one = collapseById(files.flatMap((f) => normalizePosts(f)));
    assert.equal(one.length, 1);
    assert.equal(one[0].text, "short but now the much longer full text");
  }
});
