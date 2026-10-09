/**
 * Official U.S. government agency X accounts whose posts may go live in the public feed.
 * Source: HARVEST_HANDLES in krennic212/invasionupdate (src/lib/harvest.ts), copied 2026-10-09,
 * MINUS the reporter / media / activist / political accounts in NOT_OFFICIAL_X_HANDLES.
 * Matching is case-insensitive and exact (no prefixes / lookalikes).
 * To add a handle: it must be an agency / office account (ICE, ERO, HSI, DHS, DOJ, USAO, CBP, ...),
 * never a reporter, outlet, activist or political account.
 */
export const OFFICIAL_X_HANDLES = [
  "ICEgov", "ICEgovERO", "DHSgov", "DHSGenCounsel", "SecMullinDHS", "SpoxDHS", "HSI_HQ", "EROAtlanta",
  "EROBaltimore", "EROBoston", "ICEBoston", "EROBuffalo", "EROChicago", "ERODallas", "ERODenver",
  "ERODetroit", "EROElPaso", "EroHarlingen", "EROHouston", "EROLosAngeles", "EROMiami", "ERONewOrleans",
  "ERONewYork", "ERONewark", "EROPhiladelphia", "ERO__Phoenix", "EROSaltLakeCity", "EROSanAntonio",
  "EROSanDiego", "EROSanFrancisco", "EROSeattle", "EROSaintPaul", "EROWashington", "HSIAtlanta",
  "HSIMaryland", "HSINewEngland", "HSIBuffalo", "HSI_Charlotte", "HSIChicago", "HSIHouston",
  "HSI_Dallas", "HSI_DC", "HSIDenver", "HSIDetroit", "HSIElPaso", "HSIHonolulu", "HSIKansasCity",
  "HSILasVegas", "HSILosAngeles", "HSI_Miami", "HSI_Nashville", "HSINewOrleans", "HSINewYork",
  "HSINewark", "HSIPhiladelphia", "HSIArizona", "HSISaintPaul", "HSI_SanAntonio", "HSISanDiego",
  "HSISanFrancisco", "HSISanJuan", "HSISeattle", "HSITampa", "TheJusticeDept", "AGPamBondi",
  "DAGToddBlanche", "FBI", "USMarshalsHQ", "DEAHQ", "ATFHQ", "CBP", "CBPgov", "USBPChief",
  "USBPChiefDTM", "USBPChiefELC", "USBPChiefTCA", "USBPChiefRGV", "USBPChiefEPT", "USBPChiefMIP",
  "USBPChiefSDC", "USBPChiefYUM", "USBPChiefDRT", "USBPChiefSWB", "USBPChiefLRT", "USBPChiefBBT",
  "USBPChiefNLL", "usbpdeputychief", "CBPGreatLakes", "CBPArizona", "CBPBuffalo", "CBPChicago",
  "CBPSanDiego", "CBPRGV", "BorderPatrolGov", "DOJFraudDiv", "USAttyEssayli", "DOJRR47", "USAO_ID",
  "USAO_LosAngeles", "USAO_NV", "USAO_AZ", "StateDept", "SecRubio", "TravelGov", "USAttorneys",
  "USAO_MDAL", "NDALnews", "USAO_SDAL", "USAO_AK", "USAO_EDAR", "WDARnews", "EDCAnews", "USAO_NDCA",
  "SDCAnews", "usao_co", "USAO_CT", "USAO_DC", "USAO_DE", "USAO_MDFL", "NDFLnews", "USAO_SDFL",
  "USAO_MDGA", "NDGAnews", "SDGAnews", "USAO_GU", "USAO_HI", "USAO_NDIA", "USAO_SDIA", "USAO_CDIL",
  "NDILnews", "SDILnews", "USAO_NDIN", "SDINnews", "USAO_Kansas", "USAO_EDKY", "WDKYnews", "EDLAnews",
  "MDLAnews", "USAO_WDLA", "USAO_ME", "DMAnews1", "USAO_MD", "USAO_MIE", "usao_wdmi", "DMNnews",
  "USAO_EDMO", "USAO_WDMO", "NDMSNews", "SDMSNews", "USAO_MT", "USAO_EDNC", "usao_mdnc", "USAO_WDNC",
  "USAO_ND", "USAO_NE", "USAO_NH", "USAO_NJ", "USAO_NM", "EDNYnews", "NDNYnews", "SDNYNews", "WDNYnews",
  "NDOHnews", "SDOHnews", "USAO_EDOK", "USAO_NDOK", "USAO_WDOK", "USAO_OR", "USAO_EDPA", "MDPAnews",
  "WDPAnews", "USAO_PR", "USAO_RI", "USAO_SC", "DSDNews1", "USAO_EDTN", "USAO_MDTN", "WDTNNews",
  "USAO_EDTX", "NDTXnews", "USAO_SDTX", "USAO_WDTX", "USAO_UT", "USAO_VT", "EDVAnews", "WDVAnews",
  "USAO_VI", "USAO_EDWA", "WDWAnews", "EDWInews", "USAO_WDWI", "NDWVnews", "SDWVnews", "usaowy",
  "USAtty_Williams", "USAttyMissakian", "usattypirro", "usattybumgarner", "USAttyChattah",
  "usattyellison", "USAttyBishop", "usattygerace", "usattybradford", "USAttyMetcalf", "usattyboucek",
  "usattydunavant", "usattyRaybould", "usattyreitz", "usattysimmons", "usattyholyoak", "usatty_capito",
];

/**
 * Trusted reporter accounts (Krennic decision 2026-10-09): NOT agency accounts, but their posts may
 * put rows live like an official agency post. Every other guard still applies (verbatim wording,
 * stage never overstated, minor / at-large / no non-citizen wording -> held pending, victim names
 * stripped). Photos stay official-only: a trusted reporter's post never supplies a photo.
 */
export const TRUSTED_REPORTER_X_HANDLES = ["BillMelugin_"];

/** Every X account whose posts may go live: official agency accounts + trusted reporters. */
export const LIVE_X_HANDLES = [...OFFICIAL_X_HANDLES, ...TRUSTED_REPORTER_X_HANDLES];

/** In HARVEST_HANDLES but NOT official agency accounts: their posts always go to review.json. */
export const NOT_OFFICIAL_X_HANDLES = [
  "AliBradleyTV", "FoxNews", "foxnewspolitics", "JennieSTaer", "realDailyWire",
  "JustTheNews", "californiapost", "nypost", "MassDailyNews", "RapidResponse47", "libsoftiktok",
  "StephenM", "MatthewTrag", "ScottPresler",
];
