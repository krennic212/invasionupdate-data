import { test } from "node:test";
import assert from "node:assert/strict";
import { peopleFromArticle, placeFromTitle } from "./daily-signal.mjs";

const IOWA = `
## 1. Amilcar Perz-Morfin
Amilcar Perz-Morfin is an illegal alien from Mexico who was arrested by Immigration and Customs Enforcement on Oct. 16.
His criminal history includes a conviction for sexual exploitation of a minor—prostitution, according to the White House.
## 2. Sidney Pino-Becquer
Sidney Pino-Becquer, an illegal alien from Cuba, was arrested by immigration enforcement agents on Oct. 1.
His criminal history includes convictions for child endangerment and assault causing serious injury.
## 3. Axel Sanchez Torres
Axel Sanchez Torres is an illegal alien from Mexico, arrested by Immigration and Customs Enforcement on Oct. 1.
His criminal history includes convictions for domestic abuse and driving while intoxicated.
## 4. Cristian Sneider Garcia-Salas
Cristian Sneider Garcia-Salas is an illegal alien from Colombia, arrested by Immigration and Customs Enforcement on Oct. 7.
His criminal history includes convictions for assault, public intoxication, and possession of a controlled substance.
## 5. Jefri Cap Villagran
Immigration and Customs Enforcement agents arrested Jefri Cap Villagran, an illegal alien from Guatemala, on Oct. 15.
His criminal history includes convictions for operating a motor vehicle to avoid arrest.
`;

test("parses the Iowa exclusive's five named aliens", () => {
  const title = "Meet the Worst Criminal Aliens Arrested in Iowa Ahead of Trump's Midterm Rally";
  const people = peopleFromArticle(IOWA, { title });
  assert.equal(people.length, 5);
  assert.deepEqual(people.map((p) => p.name), [
    "Amilcar Perz-Morfin",
    "Sidney Pino-Becquer",
    "Axel Sanchez Torres",
    "Cristian Sneider Garcia-Salas",
    "Jefri Cap Villagran",
  ]);
  assert.equal(people[0].origin, "Mexico");
  assert.equal(people[1].origin, "Cuba");
  assert.equal(people[4].origin, "Guatemala");
  assert.match(people[0].sentence, /sexual exploitation of a minor/);
  assert.equal(people[0].city, "Iowa");
});

test("a headline with no state leaves the city blank", () => {
  assert.equal(placeFromTitle("ICE Arrests 5 Criminal Illegal Aliens"), "");
});

test("skips a name that is not described as an alien arrest", () => {
  const people = peopleFromArticle("Rep. Ashley Hinson is running in Iowa. Zach Lahn leads.", {
    title: "Arrested in Iowa",
  });
  assert.equal(people.length, 0);
});
