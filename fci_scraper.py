#!/usr/bin/env python3
# -*- coding: utf-8 -*-

import requests
import pandas as pd
from bs4 import BeautifulSoup
import json
import sys

def main():
    URL = 'https://www.provinciafondos.com.ar/valorCuotaParte.php?id=1'
    HEADERS = {'User-Agent': 'Mozilla/5.0'}

    # 1) Pido la página
    resp = requests.get(URL, headers=HEADERS)
    resp.raise_for_status()

    # 2) Extraigo con BeautifulSoup la tabla cuyo id es listValorCuotaParte
    soup = BeautifulSoup(resp.text, 'lxml')
    table = soup.find('table', id='listValorCuotaParte')
    if table is None:
        print("❌ No encontré la tabla #listValorCuotaParte en el HTML", file=sys.stderr)
        sys.exit(1)

    # 3) Uso pandas para leer ese fragmento de HTML
    df = pd.read_html(str(table))[0]

    # 4) Renombro columnas a los nombres que esperamos
    df = df.rename(columns={
        df.columns[0]: 'Fecha',
        df.columns[1]: 'Valor Cuota Parte'
    })

    # 5) Parseo la fecha y ordeno
    df['Fecha'] = pd.to_datetime(df['Fecha'], dayfirst=True, errors='coerce')
    df = df.dropna(subset=['Fecha']).sort_values('Fecha').reset_index(drop=True)

    if len(df) < 2:
        print("❌ Menos de dos filas válidas tras parsear fechas", file=sys.stderr)
        sys.exit(1)

    # 6) Calculo variación entre los dos últimos días
    ult = df.tail(2).reset_index(drop=True)
    v0 = ult.loc[0, 'Valor Cuota Parte']
    v1 = ult.loc[1, 'Valor Cuota Parte']
    variacion = (v1 - v0) / v0 * 100

    # 7) Preparo el payload JSON
    payload = {
        "historial": df.assign(
            Fecha=lambda d: d['Fecha'].dt.strftime('%Y-%m-%d')
        ).to_dict(orient='records'),
        "variacion": round(variacion, 4)
    }

    # 8) Lo guardo en fci_data.json
    with open('fci_data.json', 'w', encoding='utf-8') as f:
        json.dump(payload, f, ensure_ascii=False, indent=2)

    print(f"✅ fci_data.json generado: {len(df)} registros, variación = {payload['variacion']}%")

if __name__ == '__main__':
    main()

