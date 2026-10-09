import test from "node:test";
import assert from "node:assert/strict";
import { pickImage, namesPerson, titleIsMulti, photoProblem, releaseCounts, shapeOk, PHOTO_PREFIX, urlKey } from "./photo-rules.mjs";
import { dedupeRows } from "./dedupe.mjs";

const PAGE = "https://www.ice.gov/news/releases/ice-arrests-guatemalan-alien-convicted-attempted-murder";
const chrome = `
<header><img src="/profiles/iced8_gov/themes/uswds/img/ice_logo.png" alt="DHS Seal and U.S. Immigration and Customs Enforcement"></header>
<img alt="U.S. Immigration and Customs Enforcement" src="/sites/default/files/images/aboutice-mm.jpg">
<img src="https://www.ice.gov/sites/default/files/migrated/images/eFileBanner.jpg" alt="ICE ERO">
<meta property="og:image" content="https://www.ice.gov/sites/default/files/images/dhsIceSocial1.jpg">`;

test("picks the release image whose alt names the person; ignores seals, logos, banners, sidebar art", () => {
  const html = `${chrome}<a href="https://www.ice.gov/sites/default/files/images/250404baltimore.jpg" class="colorbox" title="Edvin Giovanni Ceron-Reyes"><img src="/sites/default/files/images/250404baltimore.jpg" alt="Edvin Giovanni Ceron-Reyes"></a>`;
  assert.equal(pickImage(html, PAGE, "Edvin Giovanni Ceron-Reyes"), "https://www.ice.gov/sites/default/files/images/250404baltimore.jpg");
});

test("file name naming the person counts; 'booking photo' caption counts", () => {
  assert.match(pickImage(`<img src="/sites/default/files/2026-09/Amos%20Sheik%20Massaquoi_0.png" alt="">`, PAGE, "Amos Sheik Massaquoi"), /Massaquoi_0\.png$/);
  assert.match(pickImage(`<figure><img src="/sites/default/files/2026-09/IMG_2231.jpg" alt=""><figcaption>Booking photo</figcaption></figure>`, PAGE, "John Doe"), /IMG_2231\.jpg$/);
});

test("no person-specific image -> no photo (generic alt, seal, logo, map, og:image default)", () => {
  const html = `${chrome}<img src="/sites/default/files/styles/large/public/2026-09/Screenshot%202026-09-14.png.webp" alt="Indiana">
  <img src="/sites/default/files/2026-09/dhs-seal.png" alt="John Doe">
  <img src="/sites/default/files/2026-09/john-doe-logo.png" alt="logo">`;
  assert.equal(pickImage(html, PAGE, "John Doe"), "");
});

test("only the surname is not enough (Garcia must not match another Garcia)", () => {
  assert.equal(namesPerson("Maria Garcia", "Jose Garcia"), false);
  assert.equal(namesPerson("Jose%20Luis%20Garcia.jpg", "Jose Luis Garcia"), true);
});

test("two different person images -> ambiguous -> no photo", () => {
  const html = `<img src="/sites/default/files/a/John%20Doe.jpg" alt="John Doe"><img src="/sites/default/files/a/booking2.jpg" alt="booking photo">`;
  assert.equal(pickImage(html, PAGE, "John Doe"), "");
});

test("images on other sites, theme folders, or X are never used", () => {
  assert.equal(pickImage(`<img src="https://pbs.twimg.com/media/John_Doe.jpg" alt="John Doe">`, PAGE, "John Doe"), "");
  assert.equal(pickImage(`<img src="/themes/custom/img/John%20Doe.jpg" alt="John Doe">`, PAGE, "John Doe"), "");
  assert.equal(pickImage(`<img src="https://justice.gov.evil.com/sites/default/files/John%20Doe.jpg" alt="John Doe">`, PAGE, "John Doe"), "");
});

test("multi-defendant release titles are detected", () => {
  assert.ok(titleIsMulti("Two Men Indicted for Drug Conspiracy and Firearms Charges"));
  assert.ok(titleIsMulti("ICE arrests 3 criminal illegal aliens from Guatemala"));
  assert.ok(titleIsMulti("Mexican national and co-defendant sentenced"));
  assert.equal(titleIsMulti("ICE arrests Guatemalan alien convicted of attempted murder"), false);
});

test("banner and icon shapes are rejected", () => {
  assert.equal(shapeOk(1200, 300), false);
  assert.equal(shapeOk(64, 64), false);
  assert.equal(shapeOk(400, 500), true);
});

// ---- pre-publish photo rule ----
const REL = "https://www.ice.gov/news/releases/ice-arrests-guatemalan-alien-convicted-attempted-murder";
const good = { name: "Edvin Giovanni Ceron-Reyes", crime: "Convicted: Edvin Giovanni Ceron-Reyes, a Guatemalan national, convicted of attempted murder.", usa: "ICE release Apr 4, 2025: ICE arrests Guatemalan alien convicted of attempted murder", text: "", status: "approved", sourceUrl: REL, photo: `${PHOTO_PREFIX}edvin-1.jpg`, photoSourceUrl: "https://www.ice.gov/sites/default/files/images/250404baltimore.jpg" };
const ctx = (over = {}) => ({
  counts: releaseCounts([good]),
  checks: { [urlKey(REL)]: { result: "photo", file: "edvin-1.jpg", reviewed: "one adult, no child, no other visible face" } },
  fileBytes: (f) => (f === "edvin-1.jpg" ? 40000 : null),
  ...over,
});

test("a single-person official photo with its file passes", () => {
  assert.equal(photoProblem(good, ctx()), "");
});

test("photo rejected: missing file, hotlink, too big, held, pending, X source, multi-row release, no check", () => {
  assert.match(photoProblem(good, ctx({ fileBytes: () => null })), /does not exist/);
  assert.match(photoProblem({ ...good, photo: good.photoSourceUrl }, ctx()), /Pages/);
  assert.match(photoProblem(good, ctx({ fileBytes: () => 400000 })), /max/);
  assert.match(photoProblem({ ...good, holdReason: "possible minor / juvenile" }, ctx()), /held/);
  assert.match(photoProblem({ ...good, status: "pending" }, ctx()), /not approved/);
  // reporter / news X posts are never an official photo source
  assert.match(photoProblem({ ...good, sourceUrl: "https://x.com/BillMelugin_/status/1" }, ctx()), /official source/);
  // an official X post still needs its own one-row count, its own image and its own reviewed check
  assert.ok(photoProblem({ ...good, sourceUrl: "https://x.com/ICEgov/status/1" }, ctx()));
  assert.match(photoProblem(good, ctx({ counts: releaseCounts([good, { ...good, name: "Other Person", photo: "" }]) })), /more than one row/);
  assert.match(photoProblem(good, ctx({ checks: {} })), /no single-person photo check/);
  assert.match(photoProblem({ ...good, photoSourceUrl: "https://pbs.twimg.com/x.jpg" }, ctx()), /photoSourceUrl/);
  // guard rules withhold photos even on approved rows
  assert.match(photoProblem({ ...good, crime: "Charged: Edvin Giovanni Ceron-Reyes, 16, a Guatemalan national, was charged." }, ctx()), /guard/);
  assert.match(photoProblem({ ...good, crime: "Charged: Edvin Giovanni Ceron-Reyes, a Guatemalan national, remains at large." }, ctx()), /guard/);
  assert.match(photoProblem({ ...good, crime: "Charged: Edvin Giovanni Ceron-Reyes was charged." }, ctx()), /guard/);
});

test("dedupe keeps repo-hosted photos on feed rows, blanks everything else", () => {
  const { rows } = dedupeRows([
    good,
    { ...good, name: "B", photo: "https://pbs.twimg.com/media/b.jpg" },
    { ...good, name: "C", reviewReason: "X post", photo: `${PHOTO_PREFIX}c.jpg` },
  ]);
  assert.deepEqual(rows.map((r) => r.photo), [good.photo, "", ""]);
});

// ---- official agency X post photos ----
const POST = "https://x.com/EROHouston/status/2108000000000000001";
const IMG = "https://pbs.twimg.com/media/Gabc123XYZ.jpg";
const xGood = { name: "Juan Carlos Perez", crime: "Charged: ERO Houston arrested Juan Carlos Perez, a criminal illegal alien from Mexico charged with assault.", usa: "ICE X post Oct 8, 2026 (@EROHouston)", text: "@EROHouston Oct 8, 2026, as posted: ERO Houston arrested Juan Carlos Perez, a criminal illegal alien from Mexico charged with assault.", status: "approved", sourceUrl: POST, photo: `${PHOTO_PREFIX}x-1.jpg`, photoSourceUrl: IMG };
const xctx = (over = {}) => ({
  counts: releaseCounts([xGood]),
  checks: { [urlKey(POST)]: { result: "photo", file: "x-1.jpg", image: IMG, reviewed: "single-person booking photo of the named person" } },
  fileBytes: (f) => (f === "x-1.jpg" ? 30000 : null),
  ...over,
});

test("official agency X post photo with a reviewed check passes", () => {
  assert.equal(photoProblem(xGood, xctx()), "");
});

test("X photo rejected: reporter post, non-X image, unreviewed, multi-person post, held / minor, pending, hotlink", () => {
  assert.match(photoProblem({ ...xGood, sourceUrl: "https://x.com/BillMelugin_/status/2108000000000000001" }, xctx()), /official source/);
  assert.match(photoProblem({ ...xGood, sourceUrl: "https://x.com/EROHouston1/status/2108000000000000001" }, xctx()), /official source/);
  assert.match(photoProblem({ ...xGood, photoSourceUrl: "https://nypost.com/a.jpg" }, xctx()), /pbs\.twimg\.com/);
  assert.match(photoProblem({ ...xGood, photoSourceUrl: "https://pbs.twimg.com/profile_images/1/a.jpg" }, xctx()), /pbs\.twimg\.com/);
  assert.match(photoProblem(xGood, xctx({ checks: { [urlKey(POST)]: { result: "photo", file: "x-1.jpg", image: IMG } } })), /reviewed/);
  assert.match(photoProblem(xGood, xctx({ checks: {} })), /no single-person photo check/);
  assert.match(photoProblem(xGood, xctx({ counts: releaseCounts([xGood, { ...xGood, name: "Other Person", photo: "" }]) })), /more than one row/);
  assert.match(photoProblem({ ...xGood, crime: "Charged: ERO Houston arrested Juan Carlos Perez, 16, a Mexican national charged with assault." }, xctx()), /guard/);
  assert.match(photoProblem({ ...xGood, holdReason: "possible minor / juvenile" }, xctx()), /held/);
  assert.match(photoProblem({ ...xGood, status: "pending" }, xctx()), /not approved/);
  assert.match(photoProblem({ ...xGood, photo: IMG }, xctx()), /Pages/);
});

// ---- visual check: no child, no second visible face ----
test("a release photo without a visual check on record is held, not published", () => {
  const checks = { [urlKey(REL)]: { result: "photo", file: "edvin-1.jpg" } };
  assert.match(photoProblem(good, ctx({ checks })), /needs visual check/);
  const held = { [urlKey(REL)]: { result: "held", file: "edvin-1.jpg", why: "needs visual check" } };
  assert.match(photoProblem(good, ctx({ checks: held })), /no single-person photo check/);
});

test("a row with photoHold never carries a photo", () => {
  assert.match(photoProblem({ ...good, photoHold: "second person's face visible" }, ctx()), /photoHold/);
  assert.equal(photoProblem({ ...good, photo: "", photoHold: "needs visual check" }, ctx()), "");
  const { rows } = dedupeRows([{ ...good, photoHold: "needs visual check" }]);
  assert.equal(rows[0].photo, "");
  assert.equal(rows[0].photoSourceUrl, undefined);
});
