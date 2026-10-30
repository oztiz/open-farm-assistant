import type { MattilsynetOutdoorUse, OfaOutdoorTreatment } from "./types";
import { assertValidOutdoorTreatment } from "./validate";

export function mapOutdoorTreatment(input: OfaOutdoorTreatment): MattilsynetOutdoorUse {
  assertValidOutdoorTreatment(input);
  return {
    arealBehandletOmraade: { enhet: input.treatedArea.unit, verdi: input.treatedArea.value },
    behandledeVekster: input.crops.map(crop => ({
      ...(crop.bbchStage === undefined ? {} : { bbchFase: crop.bbchStage }),
      eppoKode: crop.eppoCode,
      ...(crop.batchNumber === undefined ? {} : { partinummer: crop.batchNumber }),
    })),
    behandler: { etternavn: input.operator.lastName, fornavn: input.operator.firstName },
    behandledeOmraader: input.treatedAreas,
    bruksomraade: input.useArea,
    organisasjonsnummerEier: input.ownerOrganisationNumber,
    organisasjonsnummerSproeyter: input.sprayerOrganisationNumber,
    plantevernmiddel: input.products.map(product => ({
      dosering: { enhet: product.dose.unit, verdi: product.dose.value },
      registreringsnummer: product.registrationNumber,
    })),
    startTid: input.startedAt,
  };
}
