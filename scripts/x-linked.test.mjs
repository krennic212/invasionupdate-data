// Krennic 2026-10-28: "capture with X post only if official". An agency post that names nobody in its own text but links
// an official release (@USAO_NV 2115536771094311377 -> justice.gov/usao-nv/pr/two-aliens-sudan-and-afghanistan-charged-
// illegal-voting) gets its link followed; the release goes through the press-release harvester's parser + guards.
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { normalizePosts, scan } from "./x-scan.mjs";
import { officialReleaseLink } from "./rules.mjs";
import { readLinkedRelease, linkedRows, linksFrom, dojRel, dojTitleQueries } from "./x-linked.mjs";

const NV_URL = "https://www.justice.gov/usao-nv/pr/two-aliens-sudan-and-afghanistan-charged-illegal-voting";
const fixture = JSON.parse(readFileSync(new URL("./fixtures/usao-nv-2026-10-28-two-aliens-illegal-voting.json", import.meta.url), "utf8"));
const harvest = JSON.parse(readFileSync(new URL("../data/harvest.json", import.meta.url), "utf8"));
const review = JSON.parse(readFileSync(new URL("../data/review.json", import.meta.url), "utf8"));
const always = () => true;

/** The real post's shape: raw search response, headline + mentions + t.co link, entities.urls, two graphics. */
function nvResponse({ username = "USAO_NV", id = "2115536771094311377", urls = [{ expanded_url: NV_URL, unwound_url: NV_URL, title: "Two Aliens From Sudan and Afghanistan Charged for Illegal Voting" }], entities = true } = {}) {
  return {
    data: [{
      id, author_id: "900", created_at: "2026-10-28T20:10:00.000Z",
      text: "Two Aliens From Sudan &amp; Afghanistan Charged for Illegal Voting @HSI_HQ @FBILasVegas https://t.co/AbCdEf1234",
      attachments: { media_keys: ["3_1", "3_2"] },
      ...(entities ? { entities: { mentions: [{ username: "HSI_HQ" }, { username: "FBILasVegas" }], urls: urls.map((u) => ({ url: "https://t.co/AbCdEf1234", display_url: "justice.gov/usao-nv/pr/two…", ...u })) } } : {}),
    }],
    includes: { users: [{ id: "900", username }], media: [{ media_key: "3_1", type: "photo", url: "https://pbs.twimg.com/media/A.jpg" }, { media_key: "3_2", type: "photo", url: "https://pbs.twimg.com/media/B.jpg" }] },
  };
}
const scanOf = (resp, existing = []) => scan(normalizePosts(resp), { existing });

test("official @USAO_NV headline post: no named person in the text, its justice.gov release link is listed", () => {
  const res = scanOf(nvResponse());
  assert.equal(res.live.length + res.review.length, 0);
  assert.deepEqual(res.photoCandidates, []);
  assert.equal(res.linkedReleases.length, 1);
  const [l] = res.linkedReleases;
  assert.equal(l.url, NV_URL);
  assert.equal(l.handle, "USAO_NV");
  assert.equal(l.postId, "2115536771094311377");
  assert.equal(l.postUrl, "https://x.com/USAO_NV/status/2115536771094311377");
});

test("expanded_url alone (no unwound_url) is enough; note_tweet entities are read too", () => {
  assert.equal(scanOf(nvResponse({ urls: [{ expanded_url: NV_URL }] })).linkedReleases.length, 1);
  const r = nvResponse({ entities: false });
  r.data[0].note_tweet = { text: r.data[0].text, entities: { urls: [{ url: "https://t.co/x", expanded_url: NV_URL }] } };
  assert.equal(scanOf(r).linkedReleases.length, 1);
});

test("reporter, trusted-reporter, news and unknown accounts: the same link is NOT followed", () => {
  for (const h of ["BillMelugin_", "FoxNews", "JennieSTaer", "libsoftiktok", "SomeRandomUser", "USAO_NVV", "FBILasVegas"]) {
    assert.deepEqual(scanOf(nvResponse({ username: h })).linkedReleases, [], h);
  }
});

test("non-.gov and non-release links are ignored", () => {
  for (const u of [
    "https://www.foxnews.com/politics/two-aliens-charged-illegal-voting",
    "https://bit.ly/3abcd", "https://t.co/AbCdEf1234", "https://x.com/USAO_NV/status/1",
    "http://www.justice.gov/usao-nv/pr/two-aliens-sudan-and-afghanistan-charged-illegal-voting",
    "https://www.justice.gov.evil.com/usao-nv/pr/x", "https://justice.gov-news.com/usao-nv/pr/x",
    "https://www.justice.gov/usao-nv", "https://www.justice.gov/", "https://www.dhs.gov/",
    "https://www.justice.gov/usao-nv/media/1234/dl", "https://www.ice.gov/doclib/news/release.pdf",
    "https://www.nv.gov/news/two-aliens", "https://www.whitehouse.gov/briefings/x",
  ]) assert.equal(officialReleaseLink(u), "", u);
  assert.equal(officialReleaseLink(`${NV_URL}?utm_source=twitter#top`), NV_URL);
  assert.equal(officialReleaseLink("https://www.ice.gov/news/releases/ice-arrests-x"), "https://www.ice.gov/news/releases/ice-arrests-x");
  assert.equal(officialReleaseLink("https://www.dhs.gov/news/2026/10/28/dhs-highlights-x"), "https://www.dhs.gov/news/2026/10/28/dhs-highlights-x");
  const res = scanOf(nvResponse({ urls: [{ expanded_url: "https://www.foxnews.com/politics/x" }, { expanded_url: "https://www.whitehouse.gov/x/y" }, { expanded_url: NV_URL }] }));
  assert.deepEqual(res.linkedReleases.map((l) => l.url), [NV_URL]);
  assert.deepEqual(scanOf(nvResponse({ urls: [{ expanded_url: "https://www.foxnews.com/politics/x" }] })).linkedReleases, []);
});

test("an official post that already names a person is handled from its own text; its link is not followed", () => {
  const r = nvResponse();
  r.data[0].text = "Juan Example Perez, an illegal alien from Mexico, was charged with illegal reentry in Las Vegas. https://t.co/AbCdEf1234";
  const res = scanOf(r);
  assert.equal(res.live.length, 1);
  assert.deepEqual(res.linkedReleases, []);
});

test("retweets are never followed; a saved response without entities is flagged", () => {
  const rt = nvResponse();
  rt.data[0].text = `RT @USAO_NV: ${rt.data[0].text}`;
  assert.deepEqual(scanOf(rt).linkedReleases, []);
  const bare = scanOf(nvResponse({ entities: false }));
  assert.deepEqual(bare.linkedReleases, []);
  assert.deepEqual(bare.linkedMissingEntities, ["https://x.com/USAO_NV/status/2115536771094311377"]);
});

test("linksFrom re-checks every URL (a hand-edited non-official link is dropped) and dedupes", () => {
  const out = linksFrom([{ linkedReleases: [{ url: NV_URL, postId: "1", handle: "USAO_NV" }, { url: "https://www.foxnews.com/a/b" }] }, { linkedReleases: [{ url: `${NV_URL}/` }] }]);
  assert.deepEqual(out.map((l) => l.url), [NV_URL]);
});

const fakeDojApi = (results) => async (u) => (/parameters%5Btitle%5D/.test(u) ? { results } : { results: [] });

test("justice.gov is read through the DOJ press-release API (title search fallback), matched on the exact URL", async () => {
  const link = scanOf(nvResponse()).linkedReleases[0];
  assert.deepEqual(dojTitleQueries(link), ["Two Aliens From Sudan and Afghanistan Charged for Illegal Voting", "two aliens"]);
  const decoy = { ...fixture, url: "https://www.justice.gov/usao-nv/pr/two-aliens-somewhere-else" };
  const rel = await readLinkedRelease(link, { fetchJson: fakeDojApi([decoy, fixture]), fetchHtml: () => assert.fail("no HTML fetch for justice.gov") });
  assert.equal(rel.url, NV_URL);
  assert.equal(rel.date, "2026-10-28");
  assert.equal(rel.title, fixture.title);
  const missing = await readLinkedRelease(link, { fetchJson: fakeDojApi([decoy]) });
  assert.match(missing.error, /not found/);
});

test("NV release: the pair is already live, so the linked step adds zero rows", async () => {
  const link = scanOf(nvResponse()).linkedReleases[0];
  const rel = await readLinkedRelease(link, { fetchJson: fakeDojApi([fixture]) });
  const res = linkedRows([{ link, rel }], [...harvest, ...review], { isRecent: always });
  assert.deepEqual(res.rows, []);
  assert.equal(res.skipped.length, 1);
  assert.ok(harvest.some((r) => r.id === "doj-20261028-moneir-elzobier-ali-yousif"));
  assert.ok(harvest.some((r) => r.id === "doj-20261028-khalida-safi"));
});

test("NV release without the existing pair: both defendants (no quoted official), sourceUrl = release, via = X post, no photo", async () => {
  const link = scanOf(nvResponse()).linkedReleases[0];
  const rel = await readLinkedRelease(link, { fetchJson: fakeDojApi([fixture]) });
  const existing = [...harvest, ...review].filter((r) => !/yousif|khalida safi/i.test(r.name || ""));
  const res = linkedRows([{ link, rel }], existing, { isRecent: always });
  assert.deepEqual(res.rows.map((r) => r.name), ["Moneir Elzobier Ali Yousif", "Khalida Safi"]);
  for (const r of res.rows) {
    assert.equal(r.status, "approved", r.holdReason);
    assert.equal(r.sourceUrl, NV_URL);
    assert.equal(r.via, "@USAO_NV 2115536771094311377");
    assert.equal(r.xPost, "https://x.com/USAO_NV/status/2115536771094311377");
    assert.equal(r.photo, "");
    assert.match(r.crime, /^Charged: /);
    assert.equal(r.voting, true);
  }
});

test("same guards as the harvester: at large / minor / no non-citizen wording / U.S. citizen", () => {
  const link = { url: "https://www.justice.gov/usao-nv/pr/example", handle: "USAO_NV", postId: "9", postUrl: "https://x.com/USAO_NV/status/9" };
  const rel = (blocks, title = "Illegal Alien Charged") => ({ office: "TheJusticeDept", url: link.url, date: "2026-10-28", title, blocks });
  const run = (blocks, title) => linkedRows([{ link, rel: rel(blocks, title) }], [], { isRecent: always });
  const atLarge = run(["Juan Example Perez, an illegal alien from Mexico, was charged with illegal reentry in Las Vegas. Perez remains at large."]);
  assert.deepEqual(atLarge.rows.map((r) => [r.name, r.status, r.holdReason]), [["Juan Example Perez", "pending", "suspect described as still at large"]]);
  const minor = run(["Pedro Example Lopez, 16, an illegal alien from Honduras, was charged with assault in Las Vegas."]);
  assert.deepEqual(minor.rows.map((r) => [r.status, r.holdReason]), [["pending", "possible minor / juvenile"]]);
  // No non-citizen wording, or a stated U.S. citizen: never a row.
  assert.deepEqual(run(["Jane Q. Example, 45, a U.S. citizen of Reno, was charged with voting fraud in Reno, Nevada."]).rows, []);
  assert.deepEqual(run(["Jane Q. Example, 45, of Reno, was charged with wire fraud in Reno, Nevada."], "Reno Woman Charged With Wire Fraud").rows, []);
  // Stage is never overstated: a charge reads Charged.
  const charged = run(["Juan Example Perez, an illegal alien from Mexico, was charged with illegal reentry in Las Vegas, Nevada."]);
  assert.match(charged.rows[0].crime, /^Charged: /);
  const notRecent = linkedRows([{ link, rel: rel(["Juan Example Perez, an illegal alien from Mexico, was charged in Las Vegas."]) }], [], { isRecent: () => false });
  assert.equal(notRecent.rows.length, 0);
});

test("dojRel keeps the harvester's date rule (America/New_York day of the API date)", () => {
  assert.equal(dojRel(fixture).date, "2026-10-28");
  assert.equal(dojRel(fixture).office, "TheJusticeDept");
});
