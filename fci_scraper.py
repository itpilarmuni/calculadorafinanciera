#!/usr/bin/env python3
import requests
import pandas as pd
from io import BytesIO
import json

def main():
    # 1) Descarga el Excel desde Provincia Fondos
    url = 'https://www.provinciafondos.com.ar/valorCuotaParte.php?id=1'
    headers = {'User-Agent': 'Mozilla/5.0'}
    resp = requests.get(url, headers=headers)
    resp.raise_for_status()

    # 2) Lectura con pandas
    df = pd.read_excel(BytesIO(resp.content), sheet_name=0)
    # Normalizo nombres de columnas si hace falta
    df.rename(columns={
        df.columns[0]: 'Fecha',
        df.columns[1]: 'Valor Cuota Parte'
    }, inplace=True)

    # 3) Procesamiento de fechas y ordenación
    df['Fecha'] = pd.to_datetime(df['Fecha'], dayfirst=True)
    df = df.sort_values('Fecha').reset_index(drop=True)

    # 4) Cálculo de variación entre los dos días más recientes
    if len(df) < 2:
        raise ValueError("No hay suficientes datos en el Excel para calcular variación.")
    ult = df.tail(2).reset_index(drop=True)
    v0 = ult.loc[0, 'Valor Cuota Parte']
    v1 = ult.loc[1, 'Valor Cuota Parte']
    variacion = (v1 - v0) / v0 * 100

    # 5) Preparar payload JSON
    payload = {
        "historial": df.assign(
            Fecha=lambda d: d['Fecha'].dt.strftime('%Y-%m-%d')
        ).to_dict(orient='records'),
        "variacion": round(variacion, 4)
    }

    # 6) Guardar fci_data.json
    with open('fci_data.json', 'w', encoding='utf-8') as f:
        json.dump(payload, f, ensure_ascii=False, indent=2)

    print("✅ fci_data.json actualizado con", len(df), "registros y variación =", payload['variacion'], "%")

if __name__ == '__main__':
    main()
