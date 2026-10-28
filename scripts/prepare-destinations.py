"""Build the bundled region/city suggestion index from official GeoNames dumps.
Usage: python3 scripts/prepare-destinations.py PATH_TO_DOWNLOADED_DUMPS
Required: cities15000.zip, admin1CodesASCII.txt, countryInfo.txt
Source: https://download.geonames.org/export/dump/ (CC BY 4.0)
"""
import json, sys, zipfile
from pathlib import Path
source = Path(sys.argv[1])
countries = {}
for line in (source / 'countryInfo.txt').read_text().splitlines():
    if line and not line.startswith('#'):
        f = line.split('\t'); countries[f[0]] = f[4]
regions = {}
for line in (source / 'admin1CodesASCII.txt').read_text().splitlines():
    f = line.split('\t'); regions[f[0]] = f[1]
cities = []
with zipfile.ZipFile(source / 'cities15000.zip') as archive:
    for line in archive.read('cities15000.txt').decode().splitlines():
        f = line.split('\t')
        aliases = list(dict.fromkeys([f[1], f[2]] + [a for a in f[3].split(',') if a and not a.isnumeric()]))
        cities.append([f[2] or f[1], f[8]+'.'+f[10], f[8], int(f[14]), '|'.join(aliases)])
cities.sort(key=lambda x: -x[3])
output = Path(__file__).resolve().parent.parent / 'public/data/destinations.json'
output.write_text(json.dumps({'countries':countries, 'regions':regions, 'cities':cities}, ensure_ascii=False, separators=(',',':')))
print(f'{len(cities)} cities, {len(regions)} regions, {len(countries)} countries/territories; {output.stat().st_size:,} bytes')
