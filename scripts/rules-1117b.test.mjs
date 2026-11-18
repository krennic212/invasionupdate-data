import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { extractPeople } from "./parse.mjs";
import { atLarge, holdReasons } from "./guards.mjs";

// Krennic 2026-11-17 evening: at-large hold is per person; parser reads detainer lines and
// ICE removal-flight "NAME, 40, of Brazil" lists. Official wording from DHS Nov 10 / Nov 13
// and ICE Nov 17 (Brazil/Colombia removal flight).

const DHS_NOV10 = `WASHINGTON – The United States Department of Homeland Security (DHS) released the following statement after sanctuary politicians in Illinois refused to honor a U.S. Immigration and Customs Enforcement (ICE) detainer for an illegal alien who had been convicted of aggravated battery with use of a deadly weapon. On May 28, ICE lodged a detainer asking Illinois authorities not to release Shageldi Bashimov, an illegal alien from Turkmenistan, who had been convicted for aggravated battery with use of a deadly weapon. He had been sentenced to two years in prison in Chicago. Illinois sanctuary politicians refused to honor the ICE detainer, RELEASING this violent felon back onto the streets without notifying ICE. Bashimov was lawfully admitted to the United States in March 2024, but chose to overstay his permitted time. He is currently at large. Under Governor J.B. Pritzker, Illinois has become a hotbed of illegal alien crime. Some of the recent illegal alien crimes in the sanctuary state include: In August, ICE arrested Hamed Mohammed Hamed Alsaidi, an illegal alien from Jordan, after he had been arrested for having EIGHT Molotov cocktails in his possession in Mokena, Illinois. In June, ICE arrested Giovanna Mercedes Moreno Occhipinti, an illegal alien from Venezuela and former teacher, for her involvement in a Tren de Aragua mass shooting. In October 2025, ICE arrested Radule Bojovic, an illegal alien from Montenegro, who was working as a sworn police officer. In July 2025, ICE arrested Luis Mendoza-Gonzalez, an illegal alien from Mexico. In January 2025, Julio Cucul-Bol, an illegal alien from Guatemala, caused a drunk-driving crash that killed 20-year-old Katie Abraham in Urbana, Illinois.`;

const DHS_NOV13_CA = `In August 2025, ICE lodged a detainer for Harjinder Singh, an illegal alien from India, after he made an illegal U-turn in his semi-truck and killed three people in St. Lucie County, Florida. On November 5, ICE lodged a detainer asking California politicians to not release Julio Cesar Vazquez Hernandez, an illegal alien from Mexico, after he had been arrested by the San Diego County Sheriff’s Office for domestic violence – violation of a restraining order. Despite ICE lodging a detainer with San Diego Central Jail, sanctuary politicians refused to honor it and RELEASED Hernandez back onto the streets. He currently remains at large.`;

const DHS_NOV17_NY = `New York sanctuary politicians refused to honor ICE’s detainer and RELEASED Jaundoo from Rikers Island back onto the streets on November 7. He currently remains at large. In other cases, ICE arrested someone else.`;

const FLIGHT = `ICE removed more than 140 illegal aliens to Brazil and Colombia. Some of the most egregious offenders on the flight include the following: Alexandre Esdras Pandolfi Soares, 40, of Brazil. He’s been convicted of assault and sexual assault. Jair Fernandes De Oliveira Jr., 27, of Brazil. He’s been convicted of kidnapping, rape, sexual assault and intimidation. Wellison Patrick Viera Serafim, 22, of Brazil. He’s been convicted of aggravated assault and weapon possession. Bekenvawer Aguilar Hurtado, 52, of Colombia. He’s been convicted of drug trafficking and conspiracy to commit drug trafficking. John Alba, 48, of Colombia. He’s been convicted of DUI and hit-and-run. Eddier Antonio Ballen Del Rio, 31, of Colombia. He’s been convicted of conspiracy to commit burglary and possession of criminal tools. Alix Karolayn Cadena Gomez, 21, of Colombia. She’s been convicted of weapon possession and burglary. Nicolas Alejandro Diaz Gonzalez, 29, of Colombia. He’s been convicted of burglary and illegal reentry. Juan David Garzon Laverde, 26, of Colombia. He’s been convicted of alien smuggling. Jorge Hernan-Garcia, 47, of Colombia. He’s been convicted of smuggling cocaine. Andres Felipe Huertas Carabali, 35, of Colombia. He’s been convicted of two counts of driving under the influence. Alex Mauricio Paez Henao, 46, of Colombia. He’s been convicted of assault. Janyer Mauricio Pulido-Osorio, 27, of Colombia. He’s been convicted of a weapon offense, endangering the welfare of a child, and assault. Emilson Yordao Quinonez Hachito, 52, of Colombia. He’s been convicted of drug trafficking. Diony Edith Ramirez Patino, 48, of Colombia. She’s been convicted of statutory rape and sexual assault. Jose Hernando Rodriguez-Eraso, 57, of Colombia. He’s been convicted of murder, use of firearm where death occurs and burglary.`;

const FLIGHT_NAMES = [
  "Alexandre Esdras Pandolfi Soares",
  "Jair Fernandes De Oliveira Jr.",
  "Wellison Patrick Viera Serafim",
  "Bekenvawer Aguilar Hurtado",
  "John Alba",
  "Eddier Antonio Ballen Del Rio",
  "Alix Karolayn Cadena Gomez",
  "Nicolas Alejandro Diaz Gonzalez",
  "Juan David Garzon Laverde",
  "Jorge Hernan-Garcia",
  "Andres Felipe Huertas Carabali",
  "Alex Mauricio Paez Henao",
  "Janyer Mauricio Pulido-Osorio",
  "Emilson Yordao Quinonez Hachito",
  "Diony Edith Ramirez Patino",
  "Jose Hernando Rodriguez-Eraso",
];

describe("at-large hold is per person on a multi-person DHS page (Krennic 2026-11-17)", () => {
  it("does not hold people ICE already arrested when someone else on the page 'is currently at large' (DHS Nov 10, 2026)", () => {
    const arrested = [
      ["Hamed Mohammed Hamed Alsaidi", "In August, ICE arrested Hamed Mohammed Hamed Alsaidi, an illegal alien from Jordan, after he had been arrested for having EIGHT Molotov cocktails in his possession in Mokena, Illinois."],
      ["Giovanna Mercedes Moreno Occhipinti", "In June, ICE arrested Giovanna Mercedes Moreno Occhipinti, an illegal alien from Venezuela and former teacher, for her involvement in a Tren de Aragua mass shooting."],
      ["Radule Bojovic", "In October 2025, ICE arrested Radule Bojovic, an illegal alien from Montenegro, who was working as a sworn police officer."],
      ["Luis Mendoza-Gonzalez", "In July 2025, ICE arrested Luis Mendoza-Gonzalez, an illegal alien from Mexico."],
      ["Julio Cucul-Bol", "In January 2025, Julio Cucul-Bol, an illegal alien from Guatemala, caused a drunk-driving crash that killed 20-year-old Katie Abraham in Urbana, Illinois."],
    ];
    for (const [name, sentence] of arrested) {
      assert.equal(atLarge(sentence, DHS_NOV10, name), false, name);
      assert.ok(!holdReasons({ name, sentence, title: "Sanctuary Insanity", releaseText: DHS_NOV10, label: "Arrested" }).includes("suspect described as still at large"), name);
    }
  });

  it("still holds the person the at-large wording is about (Bashimov, DHS Nov 10)", () => {
    const s = "On May 28, ICE lodged a detainer asking Illinois authorities not to release Shageldi Bashimov, an illegal alien from Turkmenistan, who had been convicted for aggravated battery with use of a deadly weapon.";
    assert.equal(atLarge(s, DHS_NOV10, "Shageldi Bashimov"), true);
    assert.ok(holdReasons({ name: "Shageldi Bashimov", sentence: s, title: "Sanctuary Insanity", releaseText: DHS_NOV10, label: "Arrested" }).includes("suspect described as still at large"));
  });

  it("holds Julio Cesar Vazquez Hernandez and not a detainer co-entry on the same DHS Nov 13 page", () => {
    const julio = "On November 5, ICE lodged a detainer asking California politicians to not release Julio Cesar Vazquez Hernandez, an illegal alien from Mexico, after he had been arrested by the San Diego County Sheriff’s Office for domestic violence – violation of a restraining order. He currently remains at large.";
    const singh = "In August 2025, ICE lodged a detainer for Harjinder Singh, an illegal alien from India, after he made an illegal U-turn in his semi-truck and killed three people in St. Lucie County, Florida.";
    assert.equal(atLarge(julio, DHS_NOV13_CA, "Julio Cesar Vazquez Hernandez"), true);
    assert.equal(atLarge(singh, DHS_NOV13_CA, "Harjinder Singh"), false);
  });

  it("still holds Delon Raymond Jaundoo when the wording is about him (DHS Nov 17)", () => {
    const s = "New York sanctuary politicians refused to honor ICE’s detainer and RELEASED Jaundoo from Rikers Island back onto the streets on November 7. He currently remains at large.";
    assert.equal(atLarge(s, `${s} Other people were arrested.`, "Delon Raymond Jaundoo"), true);
  });
});

describe("parser: ICE lodged a detainer for NAME (Krennic 2026-11-17)", () => {
  it("reads 'ICE lodged a detainer for NAME, an illegal alien from X'", () => {
    const hits = extractPeople([
      "In June, ICE lodged a detainer for Janio Gionel Velasquez-Muro, an illegal alien from Venezuela, after he was arrested for kidnapping and sexually assaulting a 9-year-old girl in Kane County, Illinois.",
    ]);
    assert.equal(hits.length, 1);
    assert.equal(hits[0].name, "Janio Gionel Velasquez-Muro");
    assert.equal(hits[0].origin, "Venezuela");
  });

  it("reads 'ICE lodged a detainer asking ... not to release NAME, an illegal alien from X'", () => {
    const hits = extractPeople([
      "On May 28, ICE lodged a detainer asking Illinois authorities not to release Shageldi Bashimov, an illegal alien from Turkmenistan, who had been convicted for aggravated battery with use of a deadly weapon.",
      "On November 5, ICE lodged a detainer asking California politicians to not release Julio Cesar Vazquez Hernandez, an illegal alien from Mexico, after he had been arrested by the San Diego County Sheriff’s Office for domestic violence – violation of a restraining order.",
    ]);
    assert.deepEqual(hits.map((h) => [h.name, h.origin]), [
      ["Shageldi Bashimov", "Turkmenistan"],
      ["Julio Cesar Vazquez Hernandez", "Mexico"],
    ]);
  });
});

describe("parser: ICE removal-flight list 'NAME, 40, of Brazil' (Krennic 2026-11-17)", () => {
  it("extracts every person on the ICE Nov 17 Brazil/Colombia removal flight", () => {
    const hits = extractPeople([FLIGHT], { title: "ICE deports plane full of violent criminal illegal aliens to Brazil, Colombia on weekend flight" });
    assert.deepEqual(hits.map((h) => h.name), FLIGHT_NAMES);
    assert.equal(hits[0].origin, "Brazil");
    assert.equal(hits[4].origin, "Colombia");
    assert.ok(hits.every((h) => h.entryLabel === "Removed"));
  });

  it("does not treat a 'Name, 40, of Georgia. He's been convicted' state roundup as a removal flight", () => {
    const hits = extractPeople(
      ["John Doe, 40, of Georgia. He's been convicted of bank fraud. Jane Roe, 39, of Georgia. She's been convicted of theft."],
      { title: "Two Georgians Sentenced" },
    );
    assert.deepEqual(hits.map((h) => h.name), []);
  });
});
