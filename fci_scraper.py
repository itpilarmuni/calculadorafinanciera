#!/usr/bin/env python3
# -*- coding: utf-8 -*-

import requests
from bs4 import BeautifulSoup
import pandas as pd
import json
import sys

def main():
    URL = 'https://www.provinciafondos.com.ar/valorCuotaParte.php?id=1'
    HEADERS = {'User-Agent': 'Mozilla/5.0'}

    # 1) Descargo la página
    resp = requests.get(URL, headers=HEADERS)
    resp.raise_for_status()

    # 2) Parseo con BeautifulSoup
    soup = BeautifulSoup(resp.text, 'lxml')
    table = soup.find('table', id='listValorCuotaParte')
    if table is None:
        print("❌ No encontré la tabla #listValorCuotaParte", file=sys.stderr)
        sys.exit(1)

    # 3) Recorro cada <tr> en <tbody> y extraigo Fecha y Valor
    data = []
    for tr in table.find('tbody').find_all('tr'):
        tds = tr.find_all('td')
        if len(tds) < 2:
            continue

        fecha_str = tds[0].get_text(strip=True)
        valor_str = tds[1].get_text(strip=True)

        # 4) Parseo Fecha
        try:
            fecha = pd.to_datetime(fecha_str, dayfirst=True, errors='coerce')
        except Exception:
            continue
        if pd.isna(fecha):
            continue

        # 5) Limpio el valor: quito puntos de miles y paso coma → punto
        #    Ej: "1.234,56" → "1234,56" → "1234.56"
        v = valor_str.replace('.', '').replace(',', '.')
        try:
            valor = float(v)
        except ValueError:
            continue

        data.append({'Fecha': fecha, 'Valor Cuota Parte': valor})

    # 6) Paso a DataFrame, ordeno y reclaro índice
    df = pd.DataFrame(data)
    df = df.sort_values('Fecha').reset_index(drop=True)

    if len(df) < 2:
        print("❌ Menos de dos registros válidos tras limpieza", file=sys.stderr)
        sys.exit(1)

    # 7) Calculo variación entre los dos últimos días
    ult = df.tail(2).reset_index(drop=True)
    v0 = ult.loc[0, 'Valor Cuota Parte']
    v1 = ult.loc[1, 'Valor Cuota Parte']
    variacion = (v1 - v0) / v0 * 100

    # 8) Preparo el JSON de salida
    payload = {
        "historial": [
            {"Fecha": d.strftime('%Y-%m-%d'),
             "Valor Cuota Parte": d2}
            for d, d2 in zip(df['Fecha'], df['Valor Cuota Parte'])
        ],
        "variacion": round(variacion, 4)
    }

    # 9) Guardo en fci_data.json
    with open('fci_data.json', 'w', encoding='utf-8') as f:
        json.dump(payload, f, ensure_ascii=False, indent=2)

    print(f"✅ fci_data.json generado: {len(df)} registros, variación = {payload['variacion']}%")

if __name__ == '__main__':
    main()
