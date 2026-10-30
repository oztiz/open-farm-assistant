# Åpen plantevernjournal-bro

Dette er første, isolerte byggestein for å oversette en sprøytebehandling fra OFA til Mattilsynets elektroniske plantevernjournal.

## Status og sikkerhetsgrense

- Klienten er hardt låst til Mattilsynets åpne utviklingsmiljø.
- Ingen Supabase-tabeller eller produksjonsdata endres.
- Ingen Maskinporten-nøkler eller andre hemmeligheter brukes.
- Ingenting sendes automatisk. Kall til klienten må gjøres uttrykkelig av kode som legges til senere.
- OFAs egen journal skal forbli hovedregisteret. Mattilsynets returnerte id må lagres separat når databasekoblingen bygges.

Datamodellen er basert på Mattilsynets offentlige repository, commit `9629776a18bfeaa177aa7db9ddd75be64d224426`, inspisert 30. oktober 2026. Oppstrømsmodellen er under utvikling og kan få inkompatible endringer.

## Dataflyt

1. OFA lager en leverandørnøytral `OfaOutdoorTreatment`.
2. `validateOutdoorTreatment` kontrollerer obligatoriske felt og grunnleggende GeoJSON-geometri.
3. `mapOutdoorTreatment` oversetter til Mattilsynets norske feltnavn.
4. En eksplisitt `MattilsynetDevelopmentClient.submitOutdoorUse` kan sende nytteløse testdata til utviklingsmiljøet.
5. `deleteOutdoorUse` kan fjerne testinnlesingen igjen med id-en fra svaret.

## Ikke med i denne versjonen

- Brukergrensesnitt og API-rute i OFA.
- Lagring i Supabase.
- Maskinporten, systembruker og samtykke.
- Staging- eller produksjonsmiljø.
- Automatisk retry. Innsending skal være eksplisitt og sporbar.

## Test

Kjør `npm run test:plantevernjournal`. Testen bruker en lokal falsk HTTP-klient og sender ingen nettverkstrafikk.
