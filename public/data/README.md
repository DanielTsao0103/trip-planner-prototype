# Destination data

`destinations.json` derives from GeoNames cities15000, admin1CodesASCII and countryInfo dumps, downloaded October 28, 2026.
It includes 34,191 populated places (cities over 15,000 people and administrative capitals), 3,865 first-level administrative regions and 252 country/territory records. Alternate names support searches in local scripts and transliterations. Population ranks cities within a country or region; it is not a tourism ranking.

Source: https://download.geonames.org/export/dump/
License: Creative Commons Attribution 4.0 — https://creativecommons.org/licenses/by/4.0/
Attribution: GeoNames — https://www.geonames.org/
Rebuild: download those three files, then run `python3 scripts/prepare-destinations.py /path/to/dumps`.

Smaller places and other geographic features use the Photon public search service, powered by OpenStreetMap. Only the typed destination query is sent. Requests are debounced, cancelled on edits and cached per browser session. No device location is requested. If online search fails, the bundled index remains usable and users can still enter a destination manually.

Photon: https://github.com/komoot/photon
OpenStreetMap attribution/license: https://www.openstreetmap.org/copyright
The public Photon endpoint has no availability guarantee and may throttle traffic; use a hosted provider or your own instance before substantial production use. Geographic coverage and names depend on the upstream datasets; no provider guarantees every location.
