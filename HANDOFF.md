# HANDOFF: 2026-10-15 EDNC noncitizen-voting release

Source: https://www.justice.gov/usao-ednc/pr/ednc-unveils-ten-federal-indictments-alleging-noncitizens-voted-2024-election

- Added via data/pending.json intake (AUTO_APPROVE=true, live scan off) and approved: 9 rows, all "Charged" (indicted; release: "An indictment is merely an accusation"): Majano Sosa (illegal alien, El Salvador), Gojcaj McDonald (LPR, former Yugoslavia), Herrmann (LPR, Germany), Fout (LPR, Germany), McKenzie (LPR, Jamaica), Paul (LPR, Haiti), Matthews (LPR, Panama), Abreu-Exia (LPR, Germany), Corbett (LPR, Canada).
- Held as pending: Mervin Sylvester Bogle. His bullet says "lawful permanent resident" but has no alien/non-citizen word (his only count is the false-claim one), so guards.mjs held him. The release headline calls all ten "noncitizens". Approve only if Krennic says so: `node scripts/approve.mjs doj-20261015-mervin-sylvester-bogle`.
- Skipped: James Darius Osborne (release gives no non-citizen status; felon-voting case).
- No photos: this is a multi-defendant release. All defendants are adults and the release says they were arrested.
- Tests and validate passed. Approved count 365 -> 374.
- Then I started the hourly workflow by hand (run 38810063373, approve input left blank) to deploy Pages. Its normal scan added 13 more official rows (Valdez-Flores, Aman Kumar, ... Suvorov). Live feed: 392 rows, 387 approved, 5 pending. Verified on Pages.
