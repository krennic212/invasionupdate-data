# HANDOFF: 2026-10-28 (11:59 PM CDT) X scan follows official release links from agency posts that name nobody (Krennic approved 11:32 PM CT)

- Gap: @USAO_NV 2115536771094311377 (Oct 28, 3:10 PM CT) is only "Two Aliens From Sudan & Afghanistan Charged for Illegal
  Voting @HSI_HQ @FBILasVegas" + a t.co link to justice.gov/usao-nv/pr/two-aliens-sudan-and-afghanistan-charged-illegal-voting;
  the names are only in the release (and the post graphics), so x-scan found nobody. Many USAO / agency posts are headline + link.
- x-scan.mjs: normalizePosts keeps `entities.urls` (unwound_url, else expanded_url; note_tweet entities too). New
  `linkedReleasesFor`: posts by OFFICIAL_X_HANDLES agency accounts only (never TRUSTED_REPORTER / NOT_OFFICIAL / unknown),
  not retweets, that produced no row (no pattern hit, no pick); keeps only `rules.mjs officialReleaseLink` URLs (https,
  OFFICIAL_HOSTS federal agency host, a page path, justice.gov only /pr/<slug>; query/fragment dropped). Output fields
  `linkedReleases` and `linkedMissingEntities` (official nameless posts with a t.co link but no entities saved) in dry run and --write.
- New scripts/x-linked.mjs (`node scripts/x-linked.mjs <run>/write.json [--write]`): reads each release (justice.gov through
  the DOJ press-release API: recent listing, then title search with the X card title / slug words, exact URL match; other
  hosts as HTML like the harvester), then harvest.mjs `rowsFromRelease` (the harvester's per-release loop, extracted
  unchanged and now shared): same parser + all guards + name/aka/short-form dedupe, MAX_AGE_DAYS window, IMMIGRATION
  filter. Rows: sourceUrl = release, via "@Handle <postId>", xPost = post URL, photo "". --write prepends to harvest.json
  (approved, or pending + holdReason), then geo, review prune, tags, severity, meta.
- docs/x-scan.md: post.fields adds `entities`; new step 5b (x-linked dry run + --write on <run>/write.json).
- Checks: live dry run on the real NV post shape: link followed via the DOJ API, 0 new rows (pair already live). On a copy
  without the pair, --write rebuilt the same two rows (same ids, Charged, Nevada, approved). No existing row changed.
- Tests: scripts/x-linked.test.mjs (official post followed; reporter / trusted reporter / news / unknown not followed;
  non-.gov and non-release links ignored; DOJ API exact-URL match; NV dedupes to zero; guards hold at-large / minor and
  drop citizen / no-status people).
- Bill's Oct 28 5 PM CT run: did not complete. /workspace/invasionupdate-xscan/run-2026-10-28-1710 was created at 5:10 PM CT
  and is empty; usage-2026-10-28.json has no search calls after 12:12 PM CT (only "classifier check, no X call" at 5:14 PM CT);
  data/x-scan-state.json still lastRunAt 17:13Z (12:13 PM CT), lastSeenId 2115489198543360243; no x-scan commit after 12:13 PM CT.
  The next run reads from that lastSeenId, so nothing is lost, only delayed.

# HANDOFF: 2026-10-28 (11:00 PM CDT) USAO-NV Yousif + Safi (illegal voting) via data/pending.json + parser pattern H (Krennic approved)

- Source: usao-nv Oct 28, 2026 "Two Aliens From Sudan and Afghanistan Charged for Illegal Voting"
  https://www.justice.gov/usao-nv/pr/two-aliens-sudan-and-afghanistan-charged-illegal-voting (read through the DOJ
  press-release API, uuid dc1cc4ca-...; @USAO_NV X post 2115536771094311377 links it). No photo in the release (X post
  images are graphics, not used).
- Added 2 rows through data/pending.json intake (AUTO_APPROVE=true, live scan off: MAX_LINKS=0 DOJ_PAGES=0 STATE_SOURCES=0
  DAILY_SIGNAL=0), rows built by parse.mjs toRow from the release's own sentences, guards on, none held:
  - Moneir Elzobier Ali Yousif (doj-20261028-moneir-elzobier-ali-yousif): "from Sudan and a lawful permanent resident", voted on
    or about October 29, 2024. Origin Sudan.
  - Khalida Safi (doj-20261028-khalida-safi): "from Afghanistan and a lawful permanent resident", voted on or about November 5,
    2024. Origin Afghanistan.
  - Both: Charged ("Yousif and Safi are each charged with one count of voting by an alien"; criminal information), voting=true,
    tags [], city "Nevada" (the release's only place for the vote: "a federal election in Nevada"; LAS VEGAS is the office
    dateline, not where they voted or live), state-center pin (same as the Oct 26 Moore row). No photo.
- Why missed: the release WAS in the DOJ API listing the 22:18Z and 01:42Z runs read (page 1 of sort=created) and passed the
  IMMIGRATION filter ("aliens"), but extractPeople found nobody: each name is "<Name>, from <Country> and a lawful permanent
  resident, voted ..." (no TYPE word after the comma, "from Sudan and" not "from Sudan,"), and the charge is a later sentence.
- Fix (scripts/parse.mjs linkedPeople, new rule H / FROM_STATUS): "<Name>, [age,] from|of <Country> and a lawful/legal
  permanent resident | (illegal) alien | non-citizen" -> the person, origin = that country; label = naming sentence + the next
  sentence in the release that names the surname with charged/indicted (verbatim), else withNowCharge. Linked rule, so no
  title stage. Quoted officials (Chattah, Burke, Delzotto) are never names. Guards unchanged.
  Old vs new parser on the last 400 DOJ API releases + 54 "illegal voting" titles: the only difference is this release.
- Tests: scripts/voting-from-status.test.mjs (real release text in scripts/fixtures/usao-nv-2026-10-28-two-aliens-illegal-voting.json;
  plus negatives and a defendant sharing a quoted official's surname). node --test 237/237; validate OK. Live rows 998 -> 1000
  (approved 974 -> 976).

# HANDOFF: 2026-10-28 (1:00 PM CDT) Melendez-Cereceres via data/pending.json (Krennic approved)

- Added 1 row through data/pending.json intake (AUTO_APPROVE=true, live scan off: MAX_LINKS=0 DOJ_PAGES=0 STATE_SOURCES=0
  DAILY_SIGNAL=0), guards on, not held: Manuel Alejandro Melendez-Cereceres (doj-20261027-manuel-alejandro-melendez-cereceres),
  usao-wdtx Oct 27, 2026 "Alien Smuggling Facilitator Sentenced in El Paso to 9 Years in Federal Prison" (read through the DOJ
  press-release API). crime/text = the release's own sentences, verbatim ("An illegal alien from Mexico was sentenced ... 110
  months ... conspiracy to transport aliens resulting in serious bodily injury"; "... Melendez-Cereceres aka “Monstro,” 42, ...";
  the June 11, 2026 guilty plea; the $672,101 money judgement). Label Convicted (house label for a sentence; there is no
  "Sentenced" label). Origin Mexico, city El Paso, TX. No photo (the release has no image). "Monstro" kept in the text only,
  not as `aka` (a nickname, not a name).
- Why missed: extractPeople / linkedPeople found nobody in this release (pattern E did not link the "An illegal alien from
  Mexico was sentenced" sentence to the next sentence's name). Parser not changed.
- Checks: node --test 226/226; validate OK. Live rows 982 -> 983 (approved 959 -> 960).

# HANDOFF: 2026-10-28 (12:00 PM CDT) DHS Texas thread + recent voting posts (Krennic asked)

- DHS X 2115482690329911417 (Texas thread) = dhs.gov/news/2026/10/28/dhs-highlights-worst-illegal-aliens-arrested-texas: all 5 named
  (Falfan, Falfan Acosta, Lopez Ibarra, Zavala Soto, De La Cruz Lira) were already live from the 16:38Z hourly run. Nothing added.
- Recent official voting posts / DOJ API (7 days): every named person already present (48-aliens OPA, MDFL 6, EDNY 3, MDPA 9, NV
  Moore, MD Rahman, ICE Boston Pharel-Joseph, DHS recap list incl. Migliore = doj-20260615 row). Posts naming nobody skipped.
- Bhengura (x-2101379658272874808-...) Charged -> Convicted: usao-ndtx Oct 28 release (jury verdict Oct 27); city Dallas -> Arlington, TX
  (where he voted, per release); sourceUrl/statusSourceUrl = NDTX, sourceNote keeps the OPA + X source.
- Held pending in harvest.json (not deleted; holdReason on each), from the 16:38Z run's DHS "dozens ... voter fraud crackdown" release:
  - duplicates (duplicateOf): Marva Marie Cook -> doj-20261022-marva-cook; Jaimie Sosa-Sardina -> doj-20261022-jamie-orlando-sosa-sardina.
  - 11 voting rows with no place anywhere in the release (voting-place test failed on them): Matute-Hernandez, Aden Hassan Aden,
    Salazar Garcia, Zapata Perez, Mai Tran, Matute Chaviel, Phath Vorn, Alarcon Duarte, Zelaya-Orellana, Alejandro-Torres, Vazquez Montano.
    Approve with a place if one is published. Gap: harvest.mjs auto-approves DHS voting rows with city "Not stated" (same as Oct 23).
- Not changed: Evelyn Miller stays "Pleaded guilty" (DHS recap says "led to the conviction"; EDPA says pleaded guilty, no sentence).
  Lizabeth Almonte Rosa stays held (DHS: "a naturalized U.S. citizen").

# HANDOFF: 2026-10-28 (11:40 AM CDT) Entered U.S. backfill on live rows (Krennic, one-time enrich)

- Scope: 935 live rows with entered "Not stated". Filled 249 (step 1 row text 157, step 2 own source URL 90, step 3 release
  linked from the X post 2); 686 left "Not stated". Only `entered` changed; tags re-derived (16 live rows gained a tag:
  Entered under Biden 10, Entered under Obama 5, DACA 1). Every filled row with step + source URL: docs/entered-backfill-2026-10-28.md.
- Step 4 (official-site web search per name) stopped after 3 consecutive misses; search.usa.gov 403 / DuckDuckGo 202 not used.
- justice.gov HTML is behind an Akamai interstitial; releases were read through the DOJ press-release API (by title).
  6 justice.gov releases could not be matched in the API (left Not stated).

# HANDOFF: 2026-10-28 (CDT) row tags: CHNV / DACA / Entered under Biden / Entered under Obama (Krennic asked)

- No tags mechanism existed in this repo (the Gang / Transgender tags from the Oct 15 Grok Build prompt are site-side
  regex categories in krennic212/invasionupdate `src/lib/categories.ts`; no groups.json here). New field: `tags`
  (string array, often `[]`) on every row of data/harvest.json and data/review.json, from scripts/tags.mjs `tagsFor()`.
- Rules (full text in docs/x-scan.md "Tags"): only the row's own words (`crime`, `usa`, `entered`, the person's own part of
  `text`); CHNV = "CHNV" / the Cuba-Haiti-Nicaragua-Venezuela parole program, and CHNV also = Entered under Biden; DACA =
  stated as the person's status; Entered under Biden / Obama = entry / release / parole wording tied to the name, or an
  entry date wholly inside Jan 20, 2021 - Jan 19, 2025 / Jan 20, 2009 - Jan 19, 2017. Straddling years (2009, 2017, 2021,
  2025), "Not stated", removal / order / conviction / LPR-since dates never count. Multi-person posts: own sentences only.
- Wired in: x-scan.mjs --write (applyTagsFiles), harvest.mjs (before writing), approve.mjs, workflow step "Tags", npm
  run harvest / npm run tags. validate.mjs fails on missing / unknown / stale tags. After a hand edit: node scripts/tags.mjs.
- Backfill (nothing else on any row changed; verified row-by-row): live CHNV 0, DACA 2, Biden 3, Obama 4; review CHNV 1,
  DACA 0, Biden 11, Obama 5. Not tagged on purpose: Fatoumata Niang (the Biden sentence is Pharilien's, same post),
  Uriel Santiago Perez ("ignored by the Obama administration", not an entry), Armando Vladimir Salgado / Edan Yoel
  Gomez-Rodriguez (re-entry dates not stated, only removal years), Aurelio Roldan Roldan / Bayardo Padilla-Flores /
  Josue Tzunun-Solis ("2021" straddles), Yinke Chen ("2017"), LPR-since dates, Chukwunonso Eze's "deferred action" (not DACA).
- Tests: scripts/tags.test.mjs (rules, boundary dates, negatives, every row's tags == tagsFor()).
- Site: docs/grok-build-tags-prompt.md (badges + filter chips from `tags`); the site itself was not touched.

# HANDOFF: 2026-10-27 (9:40 AM CDT) Krennic decisions on the 3 open items

- Deleted held duplicate "Nevada.Mario Garcia" (dhs-20261026-nevada-mario-garcia); one-time approval recorded in
  scripts/approved-deletions.json, which validate.mjs reads to exempt that id only from the never-shrink check.
  Real Mario Garcia row (dhs-20261026-mario-garcia) untouched.
- city-geo.json: Bonney Lake, WA + alias "Bonny Lake, WA"; alias "Hillsboro, NH"; "Hillsborough, NH" corrected to the
  town (43.115, -71.8949; the old 42.825, -71.655 was not the town, no row used it). Row place text unchanged.
- Palacios Luviano: city San Francisco, CA (field-office placeholder) -> Marysville, CA (39.1417, -121.5225).

# HANDOFF: 2026-10-27 (CDT) name parser, map points, review cleanup, meta auto-stamp (Krennic approved)

- Names: scripts/names.mjs (cleanPersonName strips trailing month / weekday / date words and "Place.Name" joins;
  suspiciousName flags trailing month words, a period inside a name, digits, single word, all-caps headline text).
  parse.mjs sentences() breaks on "Nevada.Mario" (no space after the period); extractPeople / linkedPeople clean names;
  guards.mjs holdReasons holds any suspicious name ("suspicious name: ..."). daily-signal.mjs: a body sentence that cuts
  the hyphenated surname short takes the numbered heading's full name, body spelling kept as aka (harvest.mjs dedupes on it).
  Data: Sidney Pino-Becque -> Sidney Pino-Becquer (heading of the Daily Signal Oct 22 article; aka "Sidney Pino-Becque";
  charge text unchanged). "Nevada.Mario Garcia" (dhs-20261026-nevada-mario-garcia, a second copy of live row
  dhs-20261026-mario-garcia from the same DHS release) held pending with duplicateOf; NOT deleted (Krennic to decide).
  Augui Cajas NOT changed: the ICE Boston Oct 19 release itself prints "Augui Cajas". Pantaleon Chacon Madrid was
  already correct in the feed.
- Map points: lat/lon was only set when a row was written, so rows placed before their city was in city-geo.json, cities
  filled in by hand, and "City, Statename" spellings never got a point. New scripts/geo.mjs (normalized lookup, state
  center for a bare state, then OpenStreetMap Nominatim: no key, real User-Agent, 1 req/s, same state + same name only;
  hits cached in city-geo.json, misses in city-geo-misses.json for 30 days). Runs in the workflow, `npm run harvest` and
  x-scan --write. Backfill: 74 of 76 live rows with a stated place got a point (40 new city-geo entries, 45 geocoder
  calls). Still missing: Bonny Lake, WA (source spelling; the city is "Bonney Lake") and Hillsboro, NH (OSM has the town
  as "Hillsborough"); not guessed. 319 live rows have no stated place and stay off the map. Palacios Luviano: his
  @EROSanFrancisco post says only "in Marysville." (no state), so his city was NOT changed.
- review.json: rules.mjs pruneReviewOfLive (name + aka keys, approved rows only; review rows with an approvalNote kept),
  run by dedupe.mjs (harvest + review) and x-scan --write. Removed 7 review copies of live people: Arellano-Alba, Avila
  Gomez, Velasquez Orozco, Englestad (aka of Engelstad), Carzoli Carrillo, Moralez Diaz, Kantrozyan. Nothing removed
  from harvest.json.
- Meta: write-meta exported writeMetaFile(); npm "pretest", `npm run harvest`, `npm run severity`, approve.mjs and
  x-scan --write all re-stamp it.
- Tests: names.test.mjs, geo.test.mjs, review-prune.test.mjs. 215/215.

# HANDOFF: 2026-10-23 (8:30 PM CDT) 11 missed official rows via data/pending.json (Krennic approved)

- Added through data/pending.json intake (AUTO_APPROVE=true, live scan off: MAX_LINKS=0 DOJ_PAGES=0 STATE_SOURCES=0
  DAILY_SIGNAL=0), rows built with parse.mjs toRow from the release text (verbatim sentences), guards on, none held. No photos
  (no official photo in any of the releases; the PA release is multi-defendant). All Charged.
  - usao-mdpa "Nine Pennsylvania Non-Citizens Charged with Illegally Voting" (Oct 23): Artur Kopacz, Osmal Loy, Yehuda Peer,
    Alfredo Santiesteban, Joyce Donovan, Inna Henry, Nourten Kuruju, Nina Nyawara, Joyce Pitts (charged by information, voting by
    an alien; town and country per release). lat/lon set by hand for Fountain Hill, Merion Station, Luzerne, Effort.
  - usao-ndny Marva Cook (Oct 22): "a German national ... appeared on a charge of voting by an alien. Cook is a lawful permanent
    resident." Label Charged (criminal complaint; toRow read "Arrested" from the title). The complaint sentence ("... not a United
    States citizen ...") is in text only, because its "United States citizen" words trip the citizen override in the label.
  - usao-ma Juana Milagros Peña Peña (Oct 22): Dominican national, SNAP fraud / theft of government money / aggravated identity
    theft, charged by complaint; "over $11,000 in SNAP benefits" in text.
- Why missed: extractPeople has no pattern for "Name, 50, of Town, was charged ... The information alleges that the defendant, a
  citizen of X ..." (status in the next sentence as "the defendant") or "a German national of Syracuse ... appeared on a charge".
  Parser not changed.
- Pre-existing, NOT changed: voting-place.test.mjs fails on 4 DHS rows the 2026-10-23 22:13Z run added from
  dhs.gov/news/2026/10/23/hsi-and-fbi-arrest-ten-aliens-voter-fraud-north-carolina (city "Not stated"; same people as the EDNC
  rows: Majano-Sosa, Fout, McKenzie, plus Andres Garcia). The workflow's Tests step fails until Krennic decides on those rows.

# HANDOFF: 2026-10-20 (11:50 AM CDT) harvest-meta.json always matches harvest.json (Krennic approved)

- Same latent bug as fraudtracker-data (meta stamped only when the job's own run changed data): counts were correct today
  only because a later run happened to re-stamp. write-meta.mjs now stores harvestSha256 and runs on every job run (and once
  before the tests); updatedAt is kept while harvest.json is unchanged, set to the commit time for a pushed edit, now for a
  run's own change. harvest-meta.json counts as a change. checkout fetch-depth 0. Hand edits: run `node scripts/write-meta.mjs`.
- Tests: write-meta.test.mjs + sha256 stamp test + committed meta matches committed harvest.json. 185/185.

# HANDOFF: 2026-10-20 (11:45 AM CDT) X-sourced voting rows -> official releases; state pins (Krennic approved)

- Silvia Delgado Phelps, Staciann Pollion Davis (usao-sdal Oct 8, 2026), Andre's Garcia (usao-wdmo Oct 6), Andrea Catanese
  (usao-mdfl Oct 2), Terrance Patrick Evans (usao-mdfl Sep 30): sourceUrl / statusSourceUrl / via / usa / picked / when / text /
  crime now the DOJ release (sentence verbatim from the release body, DOJ API), office TheJusticeDept, confirmedBy DOJ,
  sourceNote keeps the old X URL. Stage unchanged (Charged); ids unchanged. No voting row cites X any more.
- scripts/state-sources.mjs (shared with fraudtracker-data): stateGeo() now prefers a county named in the release over the
  dateline (Frio County -> Pearsall, Starr County -> Rio Grande City) and falls back to the county seat or state capital
  instead of dropping a person. No live Invasion Update row changed (all state rows already had a printed town).
  city-geo.json + Bartow, Titusville FL. Tests 183/183.

# HANDOFF: 2026-10-20 (11:30 AM CDT) federal, DHS and state voting cases + state election sources in the hourly job (Krennic approved)

- Feed: 564 -> 653 rows (558 -> 647 approved). 82 voting rows (64 federal DOJ/DHS/USCIS, 18 state: FL AG 11, MI AG 5,
  FDLE 1, NH DOJ 1): 79 via data/pending.json (60 auto-approved, 19 guard-held then approved by id with approvalNote quoting
  the release), 3 inserted directly because a review.json copy blocked intake by name (Arellano-Alba, Avila Gomez, Carzoli
  Carillo; approvalNote names the review row). The hourly run then added 7 ICE Boston rows (routine). Voting: 164 unique people.
- The 10 Minnesota rows and Paulo Jorge Silva now cite the official DOJ release (sourceUrl / statusSourceUrl / crime / usa)
  instead of X posts; Silva aka "Paulo Silva". Engelstad aka "Julieta Englestad". Gomez Sr. kept off (Krennic). Still on
  X sources (not changed): Phelps, Davis, Andre's Garcia, Catanese, Evans.
- parse.mjs: nationality-lead roundup pattern ("Pakistani national Jamil Ahmad, 50, ..."), U+2010/2011 hyphens read as
  "-", OF_PLACE also takes "of Fort Myers (Lee County), " / "of Tampa, ", origin from a written-out country ("a United Kingdom
  national"). harvest.mjs skips a shortened roundup name (rules.mjs isShortFormOf). city-geo.json: 31 cities.
- NEW state election sources (scripts/state-sources.mjs, same file as fraudtracker-data): stateReleases() after the DOJ API.
  20 official newsrooms (FL AG, FDLE, TX, MI, NH, NV, PA, KS, GA AG, GA SOS, NC, OH AG, OH SOS, AZ, AL, VA, LA, MO, TN, IA);
  https + exact host + release path; election-crime releases only; MAX_AGE_DAYS window; people only from extractPeople with
  every guard unchanged (so the release must state non-citizen status; citizen-only cases never become rows); rows get
  voting=true, the state agency label (AGENCY), and the person's printed town (else dateline). 180 s budget
  (STATE_BUDGET_MS), STATE_SOURCES=0 off, fail soft (logged). WI DOJ / IN AG not added (JS-only). GA SOS / OH SOS 403 and NC /
  NH listings empty right now (fail soft). harvest.mjs runs main() only as a script (tests import stateRel / stateCityFor).
- HI, WDKY, WDTX, ID, UT, WDLA: read through the DOJ API (all offices); stateFromUsao maps each (test added).
- Tests: scripts/roundup.test.mjs, scripts/state-sources.test.mjs (offline fixtures in scripts/fixtures/); plea.test.mjs
  exempts rows approved over a stage hold. node --test scripts/*.test.mjs: 182/182.
- dedupe / severity / validate OK. severity reports 3 feed-vs-review name matches (Arellano-Alba, Avila Gomez, Velasquez
  Orozco): review copies only, the live rows are the official releases.

# HANDOFF: 2026-10-20 (10:09 AM CDT) "Pleaded guilty" stage (Krennic approved)

- New stage label "Pleaded guilty" for a guilty plea with no conviction / sentence wording (parse.mjs convictLabel /
  PLEA_WORDS / FINAL_CONVICT_WORDS; used by statusFrom, so .gov harvest, X scan and pending intake all get it). Sentenced /
  convicted / found guilty still reads Convicted. A future plea ("expected to plead guilty") is not a stage.
- guards.mjs: stageOk accepts "Pleaded guilty" only with plea / conviction wording; holdReasonsForRow reads the new label.
  severity.mjs: a "Pleaded guilty" row still scores at the conviction stage (scores unchanged).
- Relabeled Convicted -> Pleaded guilty after checking each release / official post (plea only, no sentence yet): Jamil Ahmad
  (EDPA, sentencing Jan 26), Gaye Tyndale-Simpson (OPA/NJ), Celstino Patishtan (usao-md roundup), Fredy Rolando Rivera-Gonzalez
  (@USAO_WDMO + WDMO release), Juan Carlos Paxtor-Chay (@USAO_WDMO + WDMO release, sentencing in Feb), Binghui Liu
  (@DOJFraudDiv + EDCA release), Oleg Korniev (WDNC/OPA; row is still pending, not approved).
- Kept Convicted (source says sentenced / convicted): Encarnacion Lara Gonzalez ("pleaded guilty and was sentenced"), Felix
  Jeronimo-Rojas, Yoirlan Tome-Rojas, Javier Marrero-Pando (ICE headline "CONVICTED OF AGGRAVATED SODOMY").
- Tests: scripts/plea.test.mjs; guards.test.mjs / parse.test.mjs expectations updated (plea -> "Pleaded guilty").
- Site note (krennic212/invasionupdate, not changed): src/lib/status.ts derives its badge from text words, so a "Pleaded guilty"
  row shows "Charged"/"As posted" there unless the site learns the new label.

# HANDOFF: 2026-10-20 (10:06 AM CDT) Ledger-only voting rows checked (Krennic approved)

- Added (voting=true, statusSourceUrl = the release, no photo, guards on):
  - Julieta Engelstad (usao-wdwi, Charged, Hudson, WI): "a citizen of Colombia living in Hudson, Wisconsin". Guards: no hold. Inserted
    directly + approve.mjs because review.json has a reprint/X copy (aka "Julieta Englestad") that blocks pending intake by name.
  - Sara Luma (usao-edwi, Charged by complaint, Sheboygan, WI = where she voted; residence not stated): "Luma was born in North Macedonia
    and is a citizen of that country. She is not a United States citizen." Guard held "not stated to be a non-citizen" (the wording is
    in a later sentence); approved by id per Krennic's rule (release states non-citizen status).
  - Jamil Ahmad (usao-edpa, Convicted = guilty plea, sentencing Jan 26, Philadelphia, PA): "a citizen of Pakistan and a lawful permanent
    resident of the United States". Via data/pending.json (AUTO_APPROVE=true MAX_LINKS=0 DOJ_PAGES=0), no hold.
- Miya Pack and Forrest Scott Woody stay on the Fraud Ledger only (not added here, per Krennic).

# HANDOFF: 2026-10-20 (9:46 AM CDT) voting rows: places filled, cross-post to the Fraud Ledger

- 35 voting rows had city "Not stated"; all filled from the official releases (lat/lon from city-geo.json or set by hand for
  West Adams, Kerman, Daly City, Hayward and the counties): 27 CDCA/OPA California rows ("living in X, California" / "X,
  California, resident"), Chaudhari -> Minnesota (DHS: District of Minnesota indictment), Paulo Jorge Silva and Hacina Saadi ->
  Philadelphia, PA (usao-edpa: "residing in Philadelphia"), Davis -> Clarke County, AL, Andre’s Garcia -> Cass County, MO,
  Catanese -> Pasco County, FL, Evans -> Citrus County, FL (MDFL), Bouchard -> North Carolina (EDNC; no city given).
- voting flag was false on three official voting cases; set true: Bhator Konah Bryant (false claim of citizenship in order to
  vote, usao-mn), Muhammad Khan (provisional ballot, CDCA), Denis Joseph Bouchard (convicted, EDNC). Voting rows: 79.
- "Chis Adam Pettiquoi" renamed to the release's "Chris Adam Pettiquoi" (aka keeps the old spelling).
- statusSourceUrl set to the official release on X-sourced voting rows: the 10 Minnesota rows (usao-mn), Silva (usao-edpa),
  Davis and Phelps (usao-sdal), Andre’s Garcia (usao-wdmo), Catanese and Evans (usao-mdfl).
- Parser: toRow now falls back to placeFromDistrict(sentence, url): the release's locality ("living in X", "X resident", "of X
  County") with the USAO district's state, else the district's state name (state-center lat/lon). VOTING regex adds
  "in order to vote", "when he/she voted", "provisional ballot", "cast a ballot". Test: scripts/voting-place.test.mjs.

# HANDOFF: 2026-10-15 EDNC noncitizen-voting release

Source: https://www.justice.gov/usao-ednc/pr/ednc-unveils-ten-federal-indictments-alleging-noncitizens-voted-2024-election

- Added via data/pending.json intake (AUTO_APPROVE=true, live scan off) and approved: 9 rows, all "Charged" (indicted; release: "An indictment is merely an accusation"): Majano Sosa (illegal alien, El Salvador), Gojcaj McDonald (LPR, former Yugoslavia), Herrmann (LPR, Germany), Fout (LPR, Germany), McKenzie (LPR, Jamaica), Paul (LPR, Haiti), Matthews (LPR, Panama), Abreu-Exia (LPR, Germany), Corbett (LPR, Canada).
- Held as pending: Mervin Sylvester Bogle. His bullet says "lawful permanent resident" but has no alien/non-citizen word (his only count is the false-claim one), so guards.mjs held him. The release headline calls all ten "noncitizens". Approve only if Krennic says so: `node scripts/approve.mjs doj-20261015-mervin-sylvester-bogle`.
- Skipped: James Darius Osborne (release gives no non-citizen status; felon-voting case).
- No photos: this is a multi-defendant release. All defendants are adults and the release says they were arrested.
- Tests and validate passed. Approved count 365 -> 374.
- Then I started the hourly workflow by hand (run 38810063373, approve input left blank) to deploy Pages. Its normal scan added 13 more official rows (Valdez-Flores, Aman Kumar, ... Suvorov). Live feed: 392 rows, 387 approved, 5 pending. Verified on Pages.

# HANDOFF: 2026-10-16 DOJ "16 aliens for illegal voting" (NY 5 + ID 1)

Source: https://www.justice.gov/opa/pr/justice-department-announces-charges-involving-16-aliens-illegal-voting (residences from https://www.justice.gov/usao-ndny/pr/five-non-citizens-arrested-voter-fraud-across-northern-district).
- Added via data/pending.json: Vikki Bradt, Samantha Merkle, Suad Sasic, Jacques Patry, Paula Stitt (NDNY, complaints), Taralynn Bosco (D. Idaho). All "Charged", labels copied word for word from the OPA release. No photos (multi-defendant release).
- NC 10 already present from the EDNC release; Bogle still pending (guard left on; the OPA release calls him "Jamaican national", approve only if Krennic says so).

# HANDOFF: 2026-10-19 DOJ "Operation Protect the Vote" (28 LPRs charged in California)

Source: https://www.justice.gov/opa/pr/justice-department-charges-28-foreign-nationals-california-election-crimes (same list as https://www.justice.gov/usao-cdca/pr/11-foreign-nationals-arrested-california-federal-charges-alleging-they-illegally).
- 27 rows came in through the hourly scan of the CDCA release. 21 went live; 6 were held "not stated to be a non-citizen" because their sentences contain "U.S. citizen" wording (Muñoz, Kaur, Nazarín González, Rivas García, Viduya Adawag, Lwin).
- Krennic approved those 6 on 2026-10-19 (`node scripts/approve.mjs <id>`). Same as the Bogle precedent: the label stays the release's own sentence, the OPA LPR statement and the OPA nationality line are added to `text`, and `statusSourceUrl` = the OPA URL. Stage stays Charged.
- Added Verónica Bullene (aka "Verónica Hernández Martínez"), NDCA, Petaluma, CA, through data/pending.json (auto-approve, guards on, no hold). The label is the OPA sentence. Charged. No photo. The row has `aka`. harvest.mjs now dedupes on name + aka (`nameKeysOf` in scripts/rules.mjs, test scripts/rules-aka.test.mjs), so the alias is never added as a second person.
- Result: 28/28 approved.

# HANDOFF: 2026-10-20 missed-case audit (Oct 16–20) + harvester gap fixes

Krennic chose "add the clear missed cases and fix the harvester gaps" after a list-only audit.

Rows (29 live; nothing removed; existing rows unchanged except the 2 approvals):
- Approved (`node scripts/approve.mjs doj-20261016-gabriel-cezar-menezes,doj-20261016-tadeu-sebastiane-rabelo-alves-barbosa`): Menezes, Barbosa (SDFL; held "not stated to be a non-citizen" only because co-defendant Omar Aliperti De Mello Correa is "a U.S. citizen" in the same sentence; he is NOT added). `statusSourceUrl` = the SDFL release.
- Added via data/pending.json (AUTO_APPROVE=true, live scan off: `MAX_LINKS=0 DOJ_PAGES=0`), rows built by the new parser + `toRow`, guards on, none held:
  - SDFL (same release): Leandro De Avila Goncalves, Joao Andrade De Mello. Convicted.
  - usao-me: Jose Carlos Ferreira (aka "Jose Carlos Ferreria", the release uses both spellings). Convicted.
  - usao-edpa: Mory Kante. Convicted. usao-wdla: Manuel De Jesus Arce Cruz. Charged (complaint). usao-mdfl: Jose Toribio Canales. Convicted.
  - usao-az weekly roundup: Calixtro-Rodriguez, Ramos-Mendez (Mexico), Avendano-Soto (origin "Not stated": group was Guatemala + Mexico). Charged.
  - usao-sdtx: Enrique Roel Pena-Soto. Charged.
  - usao-wdtx: Reyes-Hernandez (aka Aurelio Reyes-Hernandez), Garcia-Soto, Aguilar (aka Miguel Angel Aguilar Bustillo), Masias-Milla, Acosta-Martinez, Gutierres-Cruz, Alhussni — all Charged. Alhussni is a green-card holder, NOT an illegal alien: label quotes "A Lebanese man with a Legal Permanent Resident Card". Torres-Sanchez = "As posted" (release gives no stage for his case; his 5 convictions are past record).
  - DHS Oct 16 deportation flights out of Arizona: 9 rows, Removed, Mexico ("All of the illegal aliens on the deportation flights were from Mexico"). Jaime Velasquez Orozco was blocked at intake by name because an X-only copy sits in review.json (2100272235965555079); the official DHS row was inserted directly with the same guards (no hold) and an approvalNote. dedupe.mjs reports that pair as a "likelyDuplicate" (feed vs review) — expected; the review row is never published.
- Skipped on purpose: Stewart, El Bahnasawy, Tellez-Gonzalez, Perez-Abrego (X-only, no official release).
- Not added (older than Oct 16, outside the audit window; the new parser finds them, all pass guards): Wenjie Xu (usao-wdny, As posted), Alfredo Gallegos Guillen (usao-edwa), Jamil Ahmad (usao-edpa, voting plea, LPR), Orlando Rene Flores-Orellana (usao-sdtx). They will only come in if a run's DOJ window reaches them (DOJ_PAGES default 4 does not); add by hand if wanted.

Parser / guard fixes (scripts/parse.mjs, scripts/guards.mjs; tests in scripts/linked.test.mjs):
- `linkedPeople()` (called at the end of `extractPeople`): status and name in different sentences of the same release.
  - B "Illegal alien from <Country> <Name> (aka <Name>) was …" (WDTX).
  - D "<Name> was … identified as an illegal alien from X".
  - C "<Surname> is a citizen of / is an illegal alien / , an illegal alien" + full name found elsewhere in the release (MDFL, WDLA).
  - E "A/An … national / illegal alien / man with a Legal Permanent Resident Card …" + next sentence naming one person (USAO single-case releases: ME, WDTX).
  - F list releases: intro block ending ":" with alien + deported/removed/arrested, then "<Name>, whose|who|a …" items; origin only from "All of the illegal aliens … were from <Country>" (DHS deportation flights).
  - G Arizona roundup case paragraphs: "… who were determined to be citizens of X" / "one of them, <Surname>," tied to names "charged by criminal complaint" in the same paragraph.
  - Linked hits never borrow the headline's stage (a headline can be about a different defendant); role prefixes ("Co-conspirator", "Defendant") are stripped from names; `aka` is now carried onto rows by `toRow`.
- Stage: "He's now charged with … / He now faces a charge of …" → Charged, and "was convicted in 2023 …" / "previously convicted" before it are past record. "after just being removed" and "as a removed alien" are past record, not the Removed stage. "entered a plea of guilty" = Convicted. House rule unchanged: "has N convictions" still reads Convicted (photo rows depend on it).
- Guards: "lawful/legal permanent resident" and "green card holder" count as stated non-citizen status (same as the existing LPR wording). New `nonCitizenStatedFor(name, sentence)`: in a ";"-separated multi-defendant sentence the citizen check uses the person's own clause, so a co-defendant's "U.S. citizen" no longer holds a "Brazilian national" — and the U.S. citizen himself is still never a row. "<Nationality> national" was already accepted. No guard was loosened (minors, at-large, stage, photo rules untouched).
- ICE.gov newsroom is quiet (funding lapse); nothing depends on it — a list page with no links just adds nothing.
- Checks: `node --test scripts/*.test.mjs` 152 pass / 0 fail; `node scripts/validate.mjs` OK; a dry harvest run on a copy of the feed added 0 rows (no duplicates of the hand-added rows).
