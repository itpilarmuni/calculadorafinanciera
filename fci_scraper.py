import pandas as pd
import json
import requests
import io
from datetime import datetime, timedelta

def fetch_and_process_fci_excel():
    """
    Simulates downloading the Excel file from Banco Provincia, reads it,
    and extracts the required data for Banco Provincia FCI.
    """
    # NOTE: In a real-world scenario, you would use a library like Selenium or Playwright
    # to automate the click on the 'Excel' button at the provided URL:
    # https://www.provinciafondos.com.ar/valorCuotaParte.php?id=1
    # For this exercise, we will assume the provided CSV is the result of that download.
    excel_file_path = 'Provincia Fondos - Sociedad Gerente de Fondos Comunes de Inversión del Grupo Provincia.xlsx - Sheet1.csv'

    print(f"[FCI Scraper Excel] Leyendo datos desde: {excel_file_path}")
    try:
        df = pd.read_csv(excel_file_path)
    except FileNotFoundError:
        print(f"[FCI Scraper Excel] Error: El archivo '{excel_file_path}' no fue encontrado.")
        return None
    except Exception as e:
        print(f"[FCI Scraper Excel] Error al leer el archivo CSV con pandas: {e}")
        return None

    col_fecha = 'Fecha'
    col_valor_cuota = 'Valor Cuota Parte'

    if col_fecha not in df.columns or col_valor_cuota not in df.columns:
        print(f"[FCI Scraper Excel] Error: Las columnas '{col_fecha}' o '{col_valor_cuota}' no se encontraron en el archivo Excel.")
        return None

    # Convert 'Fecha' to datetime, handling potential errors
    df[col_fecha] = pd.to_datetime(df[col_fecha], errors='coerce', format='%d/%m/%Y')

    # Drop rows where 'Fecha' could not be parsed
    df.dropna(subset=[col_fecha], inplace=True)

    # Sort by date to ensure the latest dates are at the end
    df.sort_values(by=col_fecha, inplace=True)

    # Filter for "Banco Provincia FCI" related funds if necessary,
    # but based on the provided CSV name, it seems to be solely from "Provincia Fondos".
    # Assuming we are interested in the main fund represented in this file.
    # For simplicity, we'll assume the primary fund data is what's relevant.

    # Get the two most recent dates and their values for the latest variation
    variacion_diaria_pct = 0
    if len(df) >= 2:
        latest_two_days = df.iloc[-2:]
        fecha_reciente = latest_two_days.iloc[1][col_fecha]
        valor_cuota_reciente = latest_two_days.iloc[1][col_valor_cuota]
        fecha_anterior = latest_two_days.iloc[0][col_fecha]
        valor_cuota_anterior = latest_two_days.iloc[0][col_valor_cuota]

        if valor_cuota_anterior != 0:
            variacion_diaria_pct = ((valor_cuota_reciente - valor_cuota_anterior) / valor_cuota_anterior) * 100
        print(f"[FCI Scraper Excel] Variación diaria (%): {variacion_diaria_pct:.4f}%")
    else:
        print("[FCI Scraper Excel] No hay suficientes datos para calcular la variación diaria.")

    # Filter data for the current month for the chart
    chart_data = []
    if not df.empty:
        latest_date_in_data = df[col_fecha].max()
        first_day_of_month = latest_date_in_data.replace(day=1)
        df_current_month = df[df[col_fecha] >= first_day_of_month].copy()

        # Calculate daily variations for the current month
        df_current_month['Valor Cuota Parte Anterior'] = df_current_month[col_valor_cuota].shift(1)
        df_current_month['Variacion Diaria (%)'] = df_current_month.apply(
            lambda row: ((row[col_valor_cuota] - row['Valor Cuota Parte Anterior']) / row['Valor Cuota Parte Anterior']) * 100
            if pd.notna(row['Valor Cuota Parte Anterior']) and row['Valor Cuota Parte Anterior'] != 0 else 0,
            axis=1
        )

        # Prepare data for the chart (excluding the first day as its variation is 0 due to shift)
        # Only include dates where there was a previous day for comparison
        chart_data = df_current_month[[col_fecha, 'Variacion Diaria (%)']].dropna().to_dict(orient='records')
        # Format date for JSON
        for item in chart_data:
            item[col_fecha] = item[col_fecha].strftime('%Y-%m-%d')
    else:
        print("[FCI Scraper Excel] No hay datos para generar el gráfico histórico.")


    # Prepare data for fci_data.json
    # The 'rendimiento_mensual_estimado_pct' will be the daily variation for now,
    # as monthly calculation wasn't explicitly detailed and this is a daily update.
    # It can be adjusted if a different calculation for estimated monthly is provided.
    resultados_fci = [{
        "nombre": "Banco Provincia FCI",
        "logo": "imagenes/PCIA.jpg",
        "rendimiento_mensual_estimado_pct": variacion_diaria_pct,
        "variacion_historica_diaria": chart_data
    }]

    return resultados_fci

def save_to_json(data, filename="fci_data.json"):
    if not data:
        print("[FCI Scraper Excel] No se encontraron datos de FCI para guardar. No se modificará el archivo JSON.")
        return
    try:
        with open(filename, "w", encoding="utf-8") as f:
            json.dump(data, f, ensure_ascii=False, indent=2)
        print(f"[FCI Scraper Excel] Datos de FCI guardados exitosamente en: {filename}")
    except Exception as e:
        print(f"[FCI Scraper Excel] Error al guardar el archivo JSON: {e}")

if __name__ == "__main__":
    datos_fci_actualizados = fetch_and_process_fci_excel()
    if datos_fci_actualizados:
        save_to_json(datos_fci_actualizados)
    else:
        print("[FCI Scraper Excel] No se pudieron obtener los datos de FCI para actualizar.")

