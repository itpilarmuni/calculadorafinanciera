#!/usr/bin/env python3
import requests
import pandas as pd
from io import BytesIO
import json
import sys

def main():
    url = 'https://www.provinciafondos.com.ar/valorCuotaParte.php?id=1'
    headers = {'User-Agent': 'Mozilla/5.0'}
    resp = requests.get(url, headers=headers)
    resp.raise_for_status()

    # ------- 1) Intento leer como XLSX ----------
    try:
        df = pd.read_excel(
            BytesIO(resp.content),
            sheet_name=0,
            engine='openpyxl'
        )
    except ValueError as e:
        print("⚠️ Warning: no parece un XLSX válido:", e, file=sys.stderr)
        print("👉 Intentando extraer la tabla via read_html...", file=sys.stderr)
        # Fallback: parsear HTML y tomar la primera tabla
        tables = pd.read_html(resp.text)
        if not tables:
            raise RuntimeError("No se encontró ninguna tabla en la página")
        df = tables[0]

    # ------- 2) Asegurar nombres de columna  ---------
    # Esperamos dos columnas: Fecha y Valor Cuota Parte
    cols = list(df.columns[:2])
    df = df.rename(columns={
        cols[0]: 'Fecha',
        cols[1]: 'Valor Cuota Parte'
    })

    # ------- 3) Procesar fechas y ordenar ----------
    df['Fecha'] = pd.to_datetime(df['Fecha'], dayfirst=True, errors='coerce')
    df = df.dropna(subset=['Fecha']).sort_values('Fecha').reset_index(drop=True)

    if len(df) < 2:
        raise RuntimeError("No hay suficientes filas válidas tras procesar fechas")

    # ------- 4) Calcular variación entre últimos 2 días ----------
    ult = df.tail(2).reset_index(drop=True)
    v0 = ult.loc[0, 'Valor Cuota Parte']
    v1 = ult.loc[1, 'Valor Cuota Parte']
    variacion = (v1 - v0) / v0 * 100

    # ------- 5) Preparar JSON de salida ----------
    payload = {
        "historial": df.assign(
            Fecha=lambda d: d['Fecha'].dt.strftime('%Y-%m-%d')
        ).to_dict(orient='records'),
        "variacion": round(variacion, 4)
    }

    # ------- 6) Guardar en disco ----------
    out_file = 'fci_data.json'
    with open(out_file, 'w', encoding='utf-8') as f:
        json.dump(payload, f, ensure_ascii=False, indent=2)

    print(f"✅ {out_file} actualizado: {len(df)} registros, variación = {payload['variacion']}%")

if __name__ == '__main__':
    main()
