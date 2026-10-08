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
  checks: { [urlKey(REL)]: { result: "photo", file: "edvin-1.jpg" } },
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
  assert.match(photoProblem({ ...good, sourceUrl: "https://x.com/ICEgov/status/1" }, ctx()), /official source/);
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
