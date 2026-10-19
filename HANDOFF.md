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
