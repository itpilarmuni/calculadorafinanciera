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
    if not table:
        print("❌ No encontré la tabla #listValorCuotaParte", file=sys.stderr)
        sys.exit(1)

    # 3) Extraigo encabezados para conocer índices
    header_cells = table.find('thead').find_all('th')
    headers = [th.get_text(strip=True) for th in header_cells]
    # ¿En qué posición está “Valor Cuota Parte”?
    try:
        idx_valor = headers.index('Valor Cuota Parte')
    except ValueError:
        print(f"❌ No encontré columna 'Valor Cuota Parte' entre {headers}", file=sys.stderr)
        sys.exit(1)

    # 4) Recorro cada fila del body
    data = []
    for tr in table.find('tbody').find_all('tr'):
        tds = tr.find_all('td')
        # Fecha siempre en la primera celda (índice 0)
        fecha_str = tds[0].get_text(strip=True)
        valor_str = tds[idx_valor].get_text(strip=True)

        # Parseo fecha
        fecha = pd.to_datetime(fecha_str, dayfirst=True, errors='coerce')
        if pd.isna(fecha):
            continue

        # Limpio valor: quito miles y convierto coma→punto
        v = valor_str.replace('.', '').replace(',', '.')
        try:
            valor = float(v)
        except ValueError:
            continue

        data.append({'Fecha': fecha, 'Valor Cuota Parte': valor})

    # 5) Paso a DataFrame y ordeno
    df = pd.DataFrame(data)
    df = df.sort_values('Fecha').reset_index(drop=True)

    if len(df) < 2:
        print("❌ Menos de dos registros válidos tras limpieza", file=sys.stderr)
        sys.exit(1)

    # 6) Calculo variación entre los dos últimos días
    ult = df.tail(2).reset_index(drop=True)
    v0, v1 = ult.loc[0, 'Valor Cuota Parte'], ult.loc[1, 'Valor Cuota Parte']
    variacion = (v1 - v0) / v0 * 100

    # 7) Armo el JSON
    payload = {
        "historial": [
            {
              "Fecha": d.strftime('%Y-%m-%d'),
              "Valor Cuota Parte": float(vp)
            }
            for d, vp in zip(df['Fecha'], df['Valor Cuota Parte'])
        ],
        "variacion": round(float(variacion), 4)
    }

    # 8) Guardo en disco
    out_file = 'fci_data.json'
    with open(out_file, 'w', encoding='utf-8') as f:
        json.dump(payload, f, ensure_ascii=False, indent=2)

    print(f"✅ {out_file} generado: {len(df)} registros, variación = {payload['variacion']}%")

if __name__ == '__main__':
    main()

