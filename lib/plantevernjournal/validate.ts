import type { Geometry, OfaOutdoorTreatment, Position, ValidationIssue } from "./types";

function samePosition(a: Position, b: Position) {
  return a[0] === b[0] && a[1] === b[1];
}

function validPosition(position: Position) {
  const [longitude, latitude] = position;
  return Number.isFinite(longitude) && Number.isFinite(latitude) &&
    longitude >= -180 && longitude <= 180 && latitude >= -90 && latitude <= 90;
}

function geometryIssues(geometry: Geometry, path: string): ValidationIssue[] {
  const issues: ValidationIssue[] = [];
  const checkPositions = (positions: Position[], positionPath: string) => {
    positions.forEach((position, index) => {
      if (!validPosition(position)) issues.push({ path: `${positionPath}[${index}]`, message: "Ugyldig WGS84-koordinat" });
    });
  };
  const checkRing = (ring: Position[], ringPath: string) => {
    checkPositions(ring, ringPath);
    if (ring.length < 4) issues.push({ path: ringPath, message: "En polygonring må ha minst fire punkter" });
    else if (!samePosition(ring[0], ring[ring.length - 1])) issues.push({ path: ringPath, message: "Polygonringen må være lukket" });
  };

  if (geometry.type === "Point") {
    if (!validPosition(geometry.coordinates)) issues.push({ path: `${path}.coordinates`, message: "Ugyldig WGS84-koordinat" });
  } else if (geometry.type === "LineString") {
    checkPositions(geometry.coordinates, `${path}.coordinates`);
    if (geometry.coordinates.length < 2) issues.push({ path: `${path}.coordinates`, message: "En linje må ha minst to punkter" });
  } else if (geometry.type === "Polygon") {
    geometry.coordinates.forEach((ring, index) => checkRing(ring, `${path}.coordinates[${index}]`));
  } else {
    geometry.coordinates.forEach((polygon, polygonIndex) =>
      polygon.forEach((ring, ringIndex) => checkRing(ring, `${path}.coordinates[${polygonIndex}][${ringIndex}]`)));
  }
  return issues;
}

export function validateOutdoorTreatment(input: OfaOutdoorTreatment): ValidationIssue[] {
  const issues: ValidationIssue[] = [];
  const requiredText = (value: string, path: string) => {
    if (!value.trim()) issues.push({ path, message: "Feltet er påkrevd" });
  };
  const orgNumber = (value: string, path: string) => {
    if (!/^\d{9}$/.test(value)) issues.push({ path, message: "Organisasjonsnummer må ha ni siffer" });
  };

  requiredText(input.sourceId, "sourceId");
  orgNumber(input.ownerOrganisationNumber, "ownerOrganisationNumber");
  orgNumber(input.sprayerOrganisationNumber, "sprayerOrganisationNumber");
  requiredText(input.operator.firstName, "operator.firstName");
  requiredText(input.operator.lastName, "operator.lastName");
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})$/.test(input.startedAt) || Number.isNaN(Date.parse(input.startedAt))) {
    issues.push({ path: "startedAt", message: "Tidspunkt må være ISO 8601 med tidssone" });
  }
  if (!(input.treatedArea.value > 0)) issues.push({ path: "treatedArea.value", message: "Behandlet areal må være større enn null" });
  if (input.crops.length === 0) issues.push({ path: "crops", message: "Minst én behandlet vekst er påkrevd" });
  input.crops.forEach((crop, index) => {
    requiredText(crop.eppoCode, `crops[${index}].eppoCode`);
    if (crop.bbchStage !== undefined && !/^\d{2}$/.test(crop.bbchStage)) {
      issues.push({ path: `crops[${index}].bbchStage`, message: "BBCH-fase må ha to siffer" });
    }
  });
  if (input.products.length === 0) issues.push({ path: "products", message: "Minst ett plantevernmiddel er påkrevd" });
  input.products.forEach((product, index) => {
    requiredText(product.registrationNumber, `products[${index}].registrationNumber`);
    requiredText(product.dose.unit, `products[${index}].dose.unit`);
    if (!(product.dose.value > 0)) issues.push({ path: `products[${index}].dose.value`, message: "Dosering må være større enn null" });
  });
  if (input.treatedAreas.features.length === 0) issues.push({ path: "treatedAreas.features", message: "Minst ett kartobjekt er påkrevd" });
  input.treatedAreas.features.forEach((feature, index) => issues.push(...geometryIssues(feature.geometry, `treatedAreas.features[${index}].geometry`)));
  return issues;
}

export function assertValidOutdoorTreatment(input: OfaOutdoorTreatment) {
  const issues = validateOutdoorTreatment(input);
  if (issues.length) throw new Error(issues.map(issue => `${issue.path}: ${issue.message}`).join("; "));
}
