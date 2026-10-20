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
