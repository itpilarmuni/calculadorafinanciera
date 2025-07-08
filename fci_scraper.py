#!/usr/bin/env python3
# -*- coding: utf-8 -*-

import requests
import pandas as pd
from bs4 import BeautifulSoup
import json
import sys
from io import StringIO

def main():
    URL = 'https://www.provinciafondos.com.ar/valorCuotaParte.php?id=1'
    HEADERS = {'User-Agent': 'Mozilla/5.0'}

    # 1) Cargo la página
    resp = requests.get(URL, headers=HEADERS)
    resp.raise_for_status()

    # 2) Extraigo la tabla con el id correcto
    soup = BeautifulSoup(resp.text, 'lxml')
    table = soup.find('table', id='listValorCuotaParte')
    if table is None:
        print("❌ No encontré la tabla #listValorCuotaParte", file=sys.stderr)
        sys.exit(1)

    # 3) Tomo solo la primera fila de encabezado
    thead = table.find('thead')
    header_tr = thead.find('tr')
    col_names = [th.get_text(strip=True) for th in header_tr.find_all('th', recursive=False)]

    # 4) Parseo el cuerpo con pandas sobre el <tbody>
    tbody = table.find('tbody')
    df = pd.read_html(StringIO(str(tbody)), header=None)[0]
    df.columns = col_names[:df.shape[1]]

    # 5) Me quedo solo con Fecha y Valor Cuota Parte
    if not {'Fecha', 'Valor Cuota Parte'}.issubset(df.columns):
        print(f"❌ Faltan columnas esperadas en {col_names}", file=sys.stderr)
        sys.exit(1)
    df = df[['Fecha', 'Valor Cuota Parte']].copy()

    # 6) Limpio y convierto Valor Cuota Parte a float
    df['Valor Cuota Parte'] = (
        df['Valor Cuota Parte']
        .astype(str)
        .str.replace(r'[^\d,.-]', '', regex=True)  # quito todo menos dígitos, coma, punto y guión
        .str.replace(',', '.', regex=False)        # comas → punto decimal
        .astype(float)
    )

    # 7) Parseo Fecha y ordeno
    df['Fecha'] = pd.to_datetime(df['Fecha'], dayfirst=True, errors='coerce')
    df = df.dropna(subset=['Fecha']).sort_values('Fecha').reset_index(drop=True)
    if len(df) < 2:
        print("❌ Menos de dos registros válidos tras limpieza", file=sys.stderr)
        sys.exit(1)

    # 8) Calculo variación entre los dos últimos días
    ult = df.tail(2).reset_index(drop=True)
    v0, v1 = ult.loc[0, 'Valor Cuota Parte'], ult.loc[1, 'Valor Cuota Parte']
    variacion = (v1 - v0) / v0 * 100

    # 9) Preparo JSON de salida
    payload = {
        "historial": df.assign(
            Fecha=df['Fecha'].dt.strftime('%Y-%m-%d')
        ).to_dict(orient='records'),
        "variacion": round(float(variacion), 4)
    }

    # 10) Guardo fci_data.json
    out_file = 'fci_data.json'
    with open(out_file, 'w', encoding='utf-8') as f:
        json.dump(payload, f, ensure_ascii=False, indent=2)

    print(f"✅ {out_file} generado: {len(df)} registros, variación = {payload['variacion']}%")

if __name__ == '__main__':
    main()
