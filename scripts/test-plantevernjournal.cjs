/* eslint-disable @typescript-eslint/no-require-imports */
const { test } = require("node:test");
const assert = require("node:assert/strict");
const { mapOutdoorTreatment } = require("../.plantevernjournal-test-build/mapper.js");
const { MattilsynetDevelopmentClient } = require("../.plantevernjournal-test-build/client.js");

const treatment = {
  sourceId: "fixture-1",
  ownerOrganisationNumber: "987654123",
  sprayerOrganisationNumber: "897456875",
  operator: { firstName: "Tine", lastName: "Hansen" },
  startedAt: "2026-05-18T12:00:00+02:00",
  useArea: "JORDBRUK",
  treatedArea: { unit: "DEKAR", value: 65 },
  crops: [{ eppoCode: "HORVS", bbchStage: "31" }],
  products: [{ registrationNumber: "12345", dose: { unit: "LITER_PER_HEKTAR", value: 0.5 } }],
  treatedAreas: { type: "FeatureCollection", features: [{ type: "Feature", geometry: {
    type: "Polygon", coordinates: [[[11.3, 59.8], [11.31, 59.8], [11.31, 59.81], [11.3, 59.8]]],
  } }] },
};

test("maps an OFA outdoor treatment to Mattilsynet field names", () => {
  const mapped = mapOutdoorTreatment(treatment);
  assert.equal(mapped.arealBehandletOmraade.verdi, 65);
  assert.equal(mapped.behandledeVekster[0].bbchFase, "31");
  assert.equal(mapped.organisasjonsnummerEier, "987654123");
  assert.equal(mapped.plantevernmiddel[0].dosering.enhet, "LITER_PER_HEKTAR");
});

test("rejects invalid organisation numbers and open polygon rings", () => {
  const invalid = structuredClone(treatment);
  invalid.ownerOrganisationNumber = "123";
  invalid.treatedAreas.features[0].geometry.coordinates[0][3] = [11.4, 59.9];
  assert.throws(() => mapOutdoorTreatment(invalid), /ni siffer.*Polygonringen må være lukket/);
});

test("development client is locked to dev and accepts a 201 id", async () => {
  let request;
  const fetcher = async (url, init) => {
    request = { url: String(url), init };
    return new Response(JSON.stringify({ id: "dev-entry-1" }), { status: 201 });
  };
  const client = new MattilsynetDevelopmentClient(fetcher);
  assert.deepEqual(await client.submitOutdoorUse(mapOutdoorTreatment(treatment)), { id: "dev-entry-1" });
  assert.match(request.url, /plantevernjournal-dev\.mattilsynet\.io/);
  assert.equal(request.init.method, "POST");
  assert.throws(() => new MattilsynetDevelopmentClient(fetcher, "https://example.com"), /låst til Mattilsynets utviklingsmiljø/);
});
