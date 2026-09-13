# CasaOS

CasaOS is just Docker Compose with a metadata block — `docker-compose.yml` already includes `x-casaos` (port 8081, volume `/DATA/AppData/lanmap:/data`).

Install: copy the repo (or just compose + .env) to the CasaOS app folder, `docker compose up -d`, open port 8081. Data persists in the `lanmap-data` volume; to use the CasaOS path directly, replace the volume with `/DATA/AppData/lanmap:/data`.

Notes: container needs `NET_RAW` (in compose) for ping. Default user is `lanmap` (uid 1000) — make sure the data dir is writable. Coexists with other apps; nothing binds outside 8081.
