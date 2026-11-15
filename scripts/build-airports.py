"""
Genera src/features/study/airports.json a partir de OurAirports (dominio público).

    curl -o airports.csv https://davidmegginson.github.io/ourairports-data/airports.csv
    python3 scripts/build-airports.py airports.csv

Solo aeropuertos grandes y medianos con vuelos regulares y código IATA. Cada
fila: [IATA, ciudad, país ISO, latitud, longitud, grande (1/0)].

El municipio de OurAirports a veces es el pueblo donde está la pista
(«Culleredo» por A Coruña) o el nombre inglés («Seville»): para esos casos, y
para dar los exónimos en español de las ciudades conocidas, hay una tabla de
nombres a mano.
"""

import csv
import json
import sys


NAMES = {
    # España
    'FUE': 'Fuerteventura', 'VDE': 'El Hierro', 'SPC': 'La Palma', 'LPA': 'Gran Canaria',
    'ACE': 'Lanzarote', 'TFS': 'Tenerife Sur', 'TFN': 'Tenerife Norte', 'OVD': 'Asturias',
    'LCG': 'A Coruña', 'IBZ': 'Ibiza', 'XRY': 'Jerez', 'LEN': 'León', 'MAH': 'Menorca',
    'RMU': 'Murcia', 'PMI': 'Palma de Mallorca', 'EAS': 'San Sebastián', 'LEU': 'La Seu d’Urgell',
    'VIT': 'Vitoria', 'SVQ': 'Sevilla', 'CDT': 'Castellón', 'SCQ': 'Santiago de Compostela',
    'LEI': 'Almería', 'BJZ': 'Badajoz', 'GRO': 'Girona', 'REU': 'Reus',
    # Europa y resto, en español
    'LHR': 'Londres', 'LGW': 'Londres', 'STN': 'Londres', 'LTN': 'Londres', 'LCY': 'Londres',
    'CDG': 'París', 'ORY': 'París', 'BVA': 'París', 'FCO': 'Roma', 'CIA': 'Roma',
    'LIS': 'Lisboa', 'OPO': 'Oporto', 'FAO': 'Faro', 'BRU': 'Bruselas', 'CRL': 'Bruselas',
    'AMS': 'Ámsterdam', 'MUC': 'Múnich', 'MXP': 'Milán', 'LIN': 'Milán', 'BGY': 'Bérgamo',
    'VCE': 'Venecia', 'TSF': 'Venecia', 'NAP': 'Nápoles', 'FLR': 'Florencia', 'GVA': 'Ginebra',
    'ZRH': 'Zúrich', 'BSL': 'Basilea', 'VIE': 'Viena', 'PRG': 'Praga', 'WAW': 'Varsovia',
    'WMI': 'Varsovia', 'KRK': 'Cracovia', 'ATH': 'Atenas', 'IST': 'Estambul', 'SAW': 'Estambul',
    'SVO': 'Moscú', 'DME': 'Moscú', 'VKO': 'Moscú', 'CPH': 'Copenhague', 'ARN': 'Estocolmo',
    'BMA': 'Estocolmo', 'OSL': 'Oslo', 'HEL': 'Helsinki', 'BER': 'Berlín', 'FRA': 'Fráncfort',
    'HHN': 'Fráncfort-Hahn', 'HAM': 'Hamburgo', 'CGN': 'Colonia', 'DUS': 'Düsseldorf',
    'STR': 'Stuttgart', 'NUE': 'Núremberg', 'MRS': 'Marsella', 'NCE': 'Niza', 'BOD': 'Burdeos',
    'LYS': 'Lyon', 'TLS': 'Toulouse', 'NTE': 'Nantes', 'LIL': 'Lille', 'EDI': 'Edimburgo',
    'DUB': 'Dublín', 'MAN': 'Mánchester', 'BUD': 'Budapest', 'OTP': 'Bucarest',
    'BEG': 'Belgrado', 'TNG': 'Tánger', 'RAK': 'Marrakech', 'CMN': 'Casablanca',
    'ALG': 'Argel', 'TUN': 'Túnez', 'CAI': 'El Cairo', 'JFK': 'Nueva York', 'EWR': 'Nueva York',
    'LGA': 'Nueva York', 'GRU': 'São Paulo', 'MEX': 'Ciudad de México', 'HAV': 'La Habana',
    'TXL': 'Berlín', 'LUX': 'Luxemburgo', 'MLA': 'Malta', 'LCA': 'Lárnaca', 'SOF': 'Sofía',
    'ZAG': 'Zagreb', 'LJU': 'Liubliana', 'BTS': 'Bratislava', 'VNO': 'Vilna', 'RIX': 'Riga',
    'TLL': 'Tallin', 'KEF': 'Reikiavik', 'TLV': 'Tel Aviv', 'BEY': 'Beirut', 'AMM': 'Amán',
    'PSA': 'Pisa', 'BLQ': 'Bolonia', 'TRN': 'Turín', 'GOA': 'Génova', 'PMO': 'Palermo',
    'CTA': 'Catania', 'CAG': 'Cagliari', 'BRI': 'Bari', 'SKG': 'Salónica', 'HER': 'Heraclión',
    'RHO': 'Rodas', 'CFU': 'Corfú', 'GIB': 'Gibraltar', 'AJA': 'Ajaccio', 'BIA': 'Bastia',
    'PEK': 'Pekín', 'PKX': 'Pekín', 'NRT': 'Tokio', 'HND': 'Tokio', 'KIX': 'Osaka',
    'SVX': 'Ekaterimburgo', 'LED': 'San Petersburgo', 'KBP': 'Kiev', 'MSQ': 'Minsk',
    'LPL': 'Liverpool', 'BHX': 'Birmingham', 'GLA': 'Glasgow', 'BRS': 'Brístol',
    'VRN': 'Verona', 'BVA': 'París', 'FKB': 'Karlsruhe', 'HHN': 'Fráncfort-Hahn',
    'NRN': 'Düsseldorf-Weeze', 'CRL': 'Bruselas', 'TSF': 'Venecia', 'BGY': 'Bérgamo',
    'LGG': 'Lieja', 'LEJ': 'Leipzig', 'FMO': 'Münster', 'PAD': 'Paderborn', 'KSF': 'Kassel',
    'EMA': 'East Midlands', 'MME': 'Teesside', 'SEN': 'Londres', 'NYO': 'Estocolmo',
    'ETZ': 'Metz', 'RNS': 'Rennes', 'CHQ': 'La Canea', 'VBS': 'Brescia', 'TRS': 'Trieste',
    'AOI': 'Ancona', 'EBA': 'Elba', 'OSR': 'Ostrava', 'GRZ': 'Graz', 'LUG': 'Lugano',
    'SKP': 'Skopie', 'CLJ': 'Cluj-Napoca', 'CND': 'Constanza', 'TGM': 'Târgu Mureș',
    'BNX': 'Banja Luka', 'TZL': 'Tuzla', 'BAY': 'Baia Mare', 'KGD': 'Kaliningrado',
    'ARH': 'Arcángel', 'PDL': 'Ponta Delgada', 'FNC': 'Madeira', 'TER': 'Terceira',
    'SMA': 'Santa María', 'GHV': 'Brasov', 'TIA': 'Tirana', 'PRN': 'Pristina',
    'FCN': 'Cuxhaven', 'BLE': 'Borlänge', 'SCR': 'Sälen', 'IEG': 'Zielona Góra',
    'SZZ': 'Szczecin', 'SZY': 'Olsztyn', 'HDF': 'Usedom', 'MXP': 'Milán', 'LIN': 'Milán',
    'ZAG': 'Zagreb', 'WMI': 'Varsovia', 'LYS': 'Lyon', 'MRS': 'Marsella', 'TRN': 'Turín',
    'PSR': 'Pescara', 'RMI': 'Rímini', 'TPS': 'Trápani', 'SUF': 'Lamezia Terme',
    'IOM': 'Isla de Man', 'NOC': 'Knock', 'LSI': 'Shetland', 'MAN': 'Mánchester',
    'KUF': 'Samara', 'GSV': 'Sarátov', 'IAR': 'Yaroslavl', 'ZIA': 'Moscú', 'KVX': 'Kírov',
    'MRV': 'Mineralnye Vody', 'ACH': 'San Galo', 'SOB': 'Hévíz', 'PVK': 'Préveza',
    'OUD': 'Uchda', 'ORN': 'Orán', 'TLM': 'Tremecén', 'NDR': 'Nador', 'TTU': 'Tetuán',
    'AHU': 'Alhucemas', 'FEZ': 'Fez', 'RBA': 'Rabat', 'AGA': 'Agadir', 'ESU': 'Esauira',
    'AAE': 'Annaba', 'CZL': 'Constantina', 'TMR': 'Tamanrasset',
    'NCL': 'Newcastle', 'CWL': 'Cardiff', 'BFS': 'Belfast', 'SNN': 'Shannon', 'ORK': 'Cork',
}


def main(path: str) -> None:
    out = []
    with open(path, encoding='utf-8') as fh:
        for r in csv.DictReader(fh):
            if r['type'] not in ('large_airport', 'medium_airport'):
                continue
            if r['scheduled_service'] != 'yes' or len(r['iata_code']) != 3:
                continue
            iata = r['iata_code']
            city = NAMES.get(iata) or r['municipality'] or r['name']
            # «Olbia (SS)», «Rodez/Marcillac»: solo el nombre de la ciudad.
            city = city.split(',')[0].split('(')[0].split('/')[0].strip()
            out.append([
                iata,
                city,
                r['iso_country'],
                round(float(r['latitude_deg']), 3),
                round(float(r['longitude_deg']), 3),
                1 if r['type'] == 'large_airport' else 0,
            ])
    out.sort(key=lambda row: row[0])
    with open('src/features/study/airports.json', 'w', encoding='utf-8') as fh:
        json.dump(out, fh, ensure_ascii=False, separators=(',', ':'))
    print(len(out), 'aeropuertos')


if __name__ == '__main__':
    main(sys.argv[1])
