import type { MattilsynetOutdoorUse } from "./types";

export const MATTILSYNET_DEV_BASE_URL = "https://plantevernjournal-innlesing-api.plantevernjournal-dev.mattilsynet.io";
const DEV_HOST = new URL(MATTILSYNET_DEV_BASE_URL).hostname;
const OUTDOOR_PATH = "/plantevernjournal/innlesing/v1/utendoersbruk";

type FetchLike = typeof fetch;
type Created = { id: string };

export class MattilsynetDevelopmentClient {
  constructor(
    private readonly fetcher: FetchLike = fetch,
    private readonly baseUrl = MATTILSYNET_DEV_BASE_URL,
  ) {
    const url = new URL(baseUrl);
    if (url.protocol !== "https:" || url.hostname !== DEV_HOST || url.pathname !== "/" || url.username || url.password || url.search || url.hash) {
      throw new Error("Denne klienten er låst til Mattilsynets utviklingsmiljø");
    }
  }

  async submitOutdoorUse(payload: MattilsynetOutdoorUse): Promise<Created> {
    const response = await this.fetcher(new URL(OUTDOOR_PATH, this.baseUrl), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    const text = await response.text();
    if (response.status !== 201) throw new Error(`Mattilsynet dev svarte ${response.status}: ${text.slice(0, 500)}`);
    const data = JSON.parse(text) as Partial<Created>;
    if (typeof data.id !== "string" || !data.id) throw new Error("Mattilsynet dev returnerte ikke en id");
    return { id: data.id };
  }

  async deleteOutdoorUse(id: string): Promise<void> {
    if (!/^[a-zA-Z0-9_-]{1,200}$/.test(id)) throw new Error("Ugyldig test-id");
    const response = await this.fetcher(new URL(`${OUTDOOR_PATH}/${id}`, this.baseUrl), { method: "DELETE" });
    if (response.status !== 204) throw new Error(`Mattilsynet dev svarte ${response.status} ved sletting`);
  }
}
