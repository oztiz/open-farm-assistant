---
name: agshare
description: Hent brukerens skifter, grenser og AB-linjer fra AgShare gjennom den private AgShare MCP-tilkoblingen.
---

Bruk agshare_list_fields for oversikt og agshare_get_field med riktig field_id for detaljer.
Denne pluginutgaven skal bare lese AgShare. Ikke kall create/update eller forsøk alternative skriveveier.
Data skal ikke lagres i Supabase eller deles videre uten at brukeren ber om det.
Når brukeren ber om lagring i OFA, bruk den separate autoriserte Supabase-pluginen, kontroller mål og les tilbake resultatet.
Ikke be om passord, API-nøkler eller token i chat. Bruk pluginens offisielle OAuth-innlogging.
Rapporter innloggingsfeil som feil, ikke som en tom AgShare-konto.
Hold verdier og koordinater uendret. Si fra dersom data mangler; ikke lag skifter eller AB-linjer ut fra antakelser.
