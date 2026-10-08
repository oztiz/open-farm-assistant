# AgShare (test) – status 8. oktober 2026

Privat plugin er opprettet: [AgShare (test)](https://chatgpt.com/plugins/plugins_6ac7f7b510e0819194e76bdad8cbb5b1).
Plugin-ID: plugins_6ac7f7b510e0819194e76bdad8cbb5b1.
Release: pluginrel_6ac7f7b6731c819185a893bca9af792f. Privat, personlig, versjon 0.1.0.

## Utført
- OFA-test (ovrtuhbuhnxiofmqosou) er gjenopptatt og bekreftet ACTIVE_HEALTHY.
- Supabase OAuth Server er aktiv i OFA-test. Dynamisk klientregistrering er av.
- Site URL er testutgavens Preview-origin; autorisasjonsside er /agshare/connect. Begge er lest tilbake i kontrollpanelet.
- Eksisterende testbruker er bevart. Ingen passord eller produksjonsbrukere er endret.
- Rolle agshare_mcp er opprettet i testprosjektet etter fullført gjenoppretting. Lest tilbake: NOLOGIN, NOINHERIT, ingen bypass RLS/superuser. Authenticator har ikke medlemskap; ingen tabelltilgang i public, auth eller storage.
- Separat GitHub-branch feature/agshare-private-test er opprettet og pushet. Main og feature/agshare-oauth er uendret.
- Branch-spesifikke Vercel Preview-variabler peker til OFA-test. Produksjonsvariablene er ikke endret.
- Preview bruker utelukkende et syntetisk skifte og en syntetisk AB-linje. Ingen produksjonsnøkkel og ingen AgShare-nettverkskall.
- Next.js og eslint-config-next er oppdatert til 16.4.0 bare i testbranchen. Runtime-avhengighetskontrollen har 0 meldte sårbarheter; fem high-poster gjenstår i utviklingsverktøyenes glob-kjede. Ingen tvungen/brytende nedgradering er gjort.
- Bygg, typekontroll, lint og lokale OAuth-tester består.

## Aktiv testadresse
https://open-farm-assistant-git-feature-agshare-private-test-ofa3.vercel.app

Preview-deployment dpl_FgWDQoheiJWCg6Sw4uYxjcY1TWeB er bekreftet READY og target=null (Preview).
Kildecommit: ae64422137950b7d7ecd704df0b5835d900f9ad6.

Offentlig discovery er testet med HTTP 200 på /.well-known/oauth-protected-resource.
Uautentisert POST /api/agshare/mcp gir HTTP 401 med korrekt WWW-Authenticate.

## Gjenstående før innlogging kan brukes
ChatGPT-nettleserfanen krever brukerinnlogging. Den faktiske callback-adressen og OAuth-klientoppsettet er derfor ikke hentet ennå. Ikke anta den gamle connector_platform_oauth_redirect-adressen: testprosjektets discovery annonserer ikke issuer-response-identifikasjon.

AGSHARE_OAUTH_CLIENT_ID og AGSHARE_OAUTH_REDIRECT_URI er ikke satt. Dette er bevisst: token-verifikatoren avviser alle tokens før riktig klient er konfigurert; samtykkesiden viser at oppsett ikke er klart. Den nye token-hooken er ennå ikke installert eller aktivert. Eksisterende test-hook er inspisert og bevares.

Neste steg etter ChatGPT-nettleserinnlogging:
1. Hent pluginens faktiske OAuth-callback og klientregistreringsvalg.
2. Registrer en separat testklient, uten å gi databaseadgang eller aktivere generell dynamisk registrering.
3. Tilpass og test token-hooken mot testklientens ID, eier og MCP-audience; aktiver bare denne i OFA-test. Vanlig OFA-innlogging skal bevares.
4. Sett de to manglende Preview-variablene og deploy ny Preview.
5. Brukeren logger inn på testutgaven og godkjenner lesing; deretter testes initialize/tools-list/field-read gjennom pluginen, nektet skriving, feil bruker, fornyelse og direkte Data API/RPC/Storage-avvisning.
6. Ingen produksjonsutrulling eller ekte AgShare-data før test er fullført og separat avtalt.

Tilbakekalling: Supabase-grant kan trekkes tilbake for å stoppe fornyelse. Offline-verifisert access-token kan virke frem til utløp (høyst 15 minutter). Umiddelbar tilbakekalling krever et ekstra autoritativt oppslag; den er ikke implementert i denne utgaven.

SQL-filen hook-reference.sql er fortsatt en gjennomgåbar mal med plassholdere, ikke en anvendt migrasjon. Ikke kjør den ukritisk eller erstatt eksisterende hooks. Ingen service_role-nøkler, innloggingspassord eller refresh-token er hentet eller delt.

Vedlegg: backend-source.zip, backend.patch, agshare-private-draft.zip (pakken som ble brukt til opprettelsen), og ofa-test-oauth.png.
