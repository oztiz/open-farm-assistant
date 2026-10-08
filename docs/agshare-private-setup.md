# AgShare privat plugin – testutgave
Status: lokal implementasjon og pluginpakke klargjort. Ikke lastet opp, ikke deployert, ikke innlogget eller ende-til-ende-verifisert.
Valgt av brukeren: gjenbruk eksisterende OFA-innlogging; Supabase MCP og AgShare MCP forblir separate tilkoblinger.

Første utgave er kun lesing fra AgShare. Skriveverktøy finnes fortsatt for den gamle bridge-integrasjonen i koden, men OAuth-tokenet får dem ikke listet og kan ikke kalle dem. Ingen ny passordinnlogging eller egen OAuth-tokenutstedelse.

Kodekopi bygger på main e07a2d85ea6dacefd272003a6c4f8892ab075823. Den nye feature/agshare-oauth-branchen er ikke endret. Alle endringer er lokale; produksjonen er uendret.

## Implementert
- /agshare/connect: samtykkeside som gjenbruker ofa_session fra OFA på samme origin. Kontrollerer signerte claims og krever førstepartsøkt for riktig eier.
- Supabase SDK behandler samtykke og tokenfornyelse; egen AES-cookie og HMAC-token fjernes fra den nye løsningen ved at de ikke tas med fra feature-branchen.
- MCP verifiserer ES256/RS256 via fast Supabase-JWKS, issuer, konkret MCP-audience, eier, OAuth-client_id og serverutstedt agshare_access=read.
- Maksimal tokenlevetid og alder 15 minutter.
- Isolert database-rolle agshare_mcp kreves i tokenet. Vanlige Supabase-innloggingstoken godtas ikke av MCP.
- OAuth-only virker uten bridge-konfigurasjon. 401 annonserer ressursmetadata.
- Innloggingen er av som standard. AGSHARE_OAUTH_ENABLED må settes uttrykkelig.

## Før aktiv testtilkobling
OFA-test (ovrtuhbuhnxiofmqosou) er INACTIVE ved kontroll. Produksjonsprosjektet er jpdactlurwonltothqim. Vi har ikke gjenopptatt, endret eller opprettet noe Supabase-prosjekt.

1. Gjenoppta OFA-test etter brukerens godkjenning, og bruk en separat Vercel Preview med testprosjektets URL, publishable key og testbruker. Ikke bruk produksjonens AgShare-nøkkel i Preview.
2. Supabase OAuth Server må være aktiv i testprosjektet. Behold eller opprett asymmetriske signeringsnøkler. Ingen nøkkelrotasjon i produksjon.
3. Autorisasjonsside /agshare/connect må være på samme origin som OFA-innloggingen. Eksisterende innlogging følger prosjektets egne regler, inkludert MFA dersom satt opp.
4. Registrer en separat OAuth-klient for AgShare-test med eksakt callback fra ChatGPTs MCP-administrasjon. Bruk en støttet klientregistreringsmetode (forhåndsregistrert klient først hvis tilgjengelig). Ikke anta testfilenes gamle callback.
5. Sett:
   - AGSHARE_OAUTH_ENABLED=true
   - AGSHARE_OAUTH_PUBLIC_ORIGIN=<eksakt HTTPS-origin for testutgaven>
   - AGSHARE_OAUTH_OWNER_USER_ID=<testbrukerens verifiserte UUID>
   - AGSHARE_OAUTH_CLIENT_ID=<faktisk registrert klient-ID>
   - AGSHARE_OAUTH_REDIRECT_URI=<eksakt HTTPS-callback fra ChatGPT>
   - NEXT_PUBLIC_SUPABASE_URL og NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY for OFA-test.
   - AGSHARE_API_KEY bare hvis testutgaven skal kontakte en separat AgShare-testkonto. Ingen produksjonsnøkkel i Preview.
6. Supabase custom access-token hook må settes på testprosjektet slik at bare denne klientens token får MCP-audience, agshare_access=read, role=agshare_mcp og høyst 900 sekunders levetid. SQL-filen er en gjennomgåbar mal med plassholdere, ikke en anvendt migrasjon. Komponer med eventuell eksisterende hook; ikke erstatt den blindt.
7. Rolle agshare_mcp skal ikke kunne brukes av PostgRESTs authenticator og skal ikke ha tabell-, RPC- eller Storage-tilgang. Ikke gi den medlemskap i authenticated/anon eller tilgang til private data. Kontroller også offentlige grants og definer-funksjoner. Den ukjente rollen skal heller ikke få implicit bred tilgang via Storage. Ikke sett innloggingen aktiv før faktiske API-negativtester passerer.
8. Test OAuth-authorize, token, refresh, actual resource/audience og callback/issuer gjennom ChatGPT. Ikke annonser egne agshare-scopes; Supabase støtter dem ikke ennå.
9. Oppdater pluginpakkens MCP-URL til den verifiserte Preview-adressen før testinstallasjon. URL i pakken er det verifiserte produksjonsdomenet, ikke en aktivert ny auth-tjeneste. Ikke last opp denne pakken før faktisk OAuth er på plass.

## Tilbakekalling
Supabase revokeGrant brukes for å stoppe videre fornyelse. Lokal JWT-verifisering garanterer ikke at et allerede utstedt access-token stoppes straks ved tilbakekalling: det kan virke frem til utløp, maksimalt 15 minutter. Hvis umiddelbar tilbakekalling kreves, må en autoritativ grant/session-status kontrolleres ved hvert MCP-kall før utrulling. Slå AGSHARE_OAUTH_ENABLED av og deploy ny konfigurasjon for å stenge denne tilkoblingen helt.

## Verifisering
- Typekontroll bestått.
- ESLint for alle berørte appfiler bestått.
- Next.js produksjonsbuild bestått.
- fire rapporterte lokale testtilfeller bestått; token-testen inkluderer ugyldig signatur, annen eier/klient/issuer/audience, førstepartsrolle, skriveclaims, manglende claims og utløp.
- Mock-integrasjon viser OAuth-only tilkobling, to leseverktøy, 403 på skriveforsøk uten AgShare-kall, 401 med discovery og blokkert fremmed Origin.
- Ekte nettverks-/OAuth-innlogging, SDK-samtykke i nettleseren og direkte Data API/RPC/Storage-avvisning er ikke testet.
- npm audit for runtime-avhengigheter melder 6 poster, inkludert critical for eksisterende Next 16.2.4. Dette er avhengighetsmeldinger, ikke verifisert utnyttbarhet i OFA. Ingen av de nye direkte bibliotekene jose / supabase-js ble flagget. Next og transitivene må vurderes/oppdateres før ny produksjonsutrulling; ingen bred oppgradering er gjort i denne auth-utgaven.

## Leveranser
- backend-source.zip: kodekopi med endringer, uten node_modules, .git, hemmeligheter eller byggoutput.
- backend.patch: samlet diff, inkludert nye filer og lockfil.
- agshare-private-draft.zip: privat pluginpakke, ikke lastet opp. Et pluginarkiv oppretter ikke OAuth-konfigurasjon.
- hook-reference.sql: forslag for testoppsett; ingen SQL er utført.

Kilder:
- https://developers.openai.com/plugins/build/auth
- https://supabase.com/docs/guides/auth/oauth-server/getting-started
- https://supabase.com/docs/guides/auth/oauth-server/oauth-flows
- https://supabase.com/docs/guides/auth/oauth-server/token-security
