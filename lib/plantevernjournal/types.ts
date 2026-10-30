export type Position = [longitude: number, latitude: number];

export type Geometry =
  | { type: "Point"; coordinates: Position }
  | { type: "LineString"; coordinates: Position[] }
  | { type: "Polygon"; coordinates: Position[][] }
  | { type: "MultiPolygon"; coordinates: Position[][][] };

export type FeatureCollection = {
  type: "FeatureCollection";
  features: Array<{ type: "Feature"; geometry: Geometry }>;
};

export type OfaOutdoorTreatment = {
  sourceId: string;
  ownerOrganisationNumber: string;
  sprayerOrganisationNumber: string;
  operator: { firstName: string; lastName: string };
  startedAt: string;
  useArea: "JORDBRUK";
  treatedArea: { unit: "DEKAR"; value: number };
  crops: Array<{ eppoCode: string; bbchStage?: string; batchNumber?: number }>;
  products: Array<{
    registrationNumber: string;
    dose: { unit: string; value: number };
  }>;
  treatedAreas: FeatureCollection;
};

export type MattilsynetOutdoorUse = {
  arealBehandletOmraade: { enhet: "DEKAR"; verdi: number };
  behandledeVekster: Array<{
    bbchFase?: string;
    eppoKode: string;
    partinummer?: number;
  }>;
  behandler: { etternavn: string; fornavn: string };
  behandledeOmraader: FeatureCollection;
  bruksomraade: "JORDBRUK";
  organisasjonsnummerEier: string;
  organisasjonsnummerSproeyter: string;
  plantevernmiddel: Array<{
    dosering: { enhet: string; verdi: number };
    registreringsnummer: string;
  }>;
  startTid: string;
};

export type ValidationIssue = { path: string; message: string };
