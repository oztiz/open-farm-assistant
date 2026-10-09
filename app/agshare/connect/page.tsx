import Consent from "./consent";
import { oauthConfig } from "../../api/agshare/mcp/oauth-auth";

export const dynamic = "force-dynamic";
export const metadata = { title: "AgShare – koble til ChatGPT" };
export default async function ConnectPage({ searchParams }: { searchParams: Promise<{ authorization_id?: string | string[] }> }) {
  const config = oauthConfig();
  const { authorization_id: id } = await searchParams;
  const callback = process.env.AGSHARE_OAUTH_REDIRECT_URI;
  if (!config || !config.client || !callback || typeof id !== "string" || !/^[a-zA-Z0-9_-]{1,200}$/.test(id)) {
    return <main><h1>AgShare</h1><p>Innloggingen er ikke klargjort, eller forespørselen er ugyldig.</p></main>;
  }
  return <Consent authorizationId={id} owner={config.owner} clientId={config.client} callback={callback} allowUpdate={config.allowUpdate} />;
}
