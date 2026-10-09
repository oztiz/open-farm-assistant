"use client";
import { useEffect, useState } from "react";
import { createClient, type OAuthAuthorizationDetails } from "@supabase/supabase-js";

type Props = { authorizationId: string; owner: string; clientId: string; callback: string };
export default function Consent({ authorizationId, owner, clientId, callback }: Props) {
  const [details, setDetails] = useState<OAuthAuthorizationDetails | null>(null);
  const [message, setMessage] = useState("Kontrollerer innloggingen …");
  const [busy, setBusy] = useState(false);
  function client() {
    return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
      { auth: { storageKey: "ofa_session", detectSessionInUrl: false, autoRefreshToken: false } });
  }
  async function verifiedClient() {
    const supabase = client();
    const { data, error } = await supabase.auth.getClaims();
    if (error || !data?.claims || data.claims.sub !== owner || data.claims.client_id ||
        data.claims.role !== "authenticated") throw new Error("Logg inn i OFA med eierkontoen, og gå tilbake til denne siden.");
    return supabase;
  }
  function returnToChatGPT(url: string) {
    // Only follow the exact callback approved in configuration, preserving OAuth query values.
    const result = new URL(url), expected = new URL(callback);
    if (result.protocol !== "https:" || result.username || result.password || result.hash ||
        result.origin !== expected.origin || result.pathname !== expected.pathname ||
        ![...expected.searchParams].every(([k, v]) => result.searchParams.get(k) === v)) throw new Error("Ugyldig returadresse.");
    window.location.assign(result.href);
  }
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const supabase = await verifiedClient();
        const { data, error } = await supabase.auth.oauth.getAuthorizationDetails(authorizationId);
        if (error || !data) throw new Error("Forespørselen er utløpt eller ugyldig. Koble til på nytt i ChatGPT.");
        if (cancelled) return;
        if (!("authorization_id" in data)) { returnToChatGPT(data.redirect_url); return; }
        if (data.client.id !== clientId || data.user.id !== owner || data.redirect_uri !== callback ||
            data.authorization_id !== authorizationId) throw new Error("Denne forespørselen gjelder ikke AgShare-pluginen din.");
        setDetails(data); setMessage("");
      } catch (error) { if (!cancelled) setMessage(error instanceof Error ? error.message : "Innloggingen kunne ikke kontrolleres."); }
    })();
    return () => { cancelled = true; };
    // These props are fixed for one authorization transaction.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [authorizationId, owner, clientId, callback]);
  async function decide(approve: boolean) {
    if (!details || busy) return;
    setBusy(true); setMessage("");
    try {
      const supabase = await verifiedClient();
      const response = approve
        ? await supabase.auth.oauth.approveAuthorization(authorizationId, { skipBrowserRedirect: true })
        : await supabase.auth.oauth.denyAuthorization(authorizationId, { skipBrowserRedirect: true });
      if (response.error || !response.data) throw new Error("Kunne ikke behandle valget. Koble til på nytt i ChatGPT.");
      returnToChatGPT(response.data.redirect_url);
    } catch (error) { setMessage(error instanceof Error ? error.message : "Kunne ikke koble til."); setBusy(false); }
  }
  return <main className="mx-auto max-w-xl p-8">
    <h1 className="text-2xl font-semibold">Koble AgShare til ChatGPT</h1>
    <p className="mt-4">ChatGPT kan lese skiftene, grensene og AB-linjene i AgShare-kontoen din. Denne tilkoblingen gir ikke tilgang til å endre AgShare-data eller lese OFA-databasen.</p>
    {message && <p role="status" className="mt-4">{message}</p>}
    {!details && <p className="mt-4"><a href="/" target="_blank" rel="noopener noreferrer">Åpne OFA for å logge inn</a>. Gå deretter tilbake hit og last siden på nytt.</p>}
    {details && <div className="mt-6">
      <p>Forespørsel fra: {details.client.name}</p>
      <p>Identitetstillatelser: {details.scope || "Ingen ekstra profilopplysninger"}</p>
      <div className="mt-4 flex gap-4">
        <button disabled={busy} onClick={() => void decide(true)} className="rounded bg-green-800 px-4 py-2 text-white">Tillat lesing</button>
        <button disabled={busy} onClick={() => void decide(false)} className="rounded border px-4 py-2">Avbryt</button>
      </div>
    </div>}
  </main>;
}
