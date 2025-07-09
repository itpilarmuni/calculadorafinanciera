import pandas as pd
import json
import os
import time
import glob
from datetime import datetime, timedelta, timezone

# Importaciones para Scrapeo HTML (FCI y Plazos Fijos)
import requests
from bs4 import BeautifulSoup
import re
import urllib3 # Para desactivar advertencias de SSL (si usas verify=False)

# URL de la página de Banco Provincia Fondos (para FCI - ahora parseamos la tabla HTML directamente)
URL_PROVINCIA_FONDOS = "https://www.provinciafondos.com.ar/valorCuotaParte.php?id=1"
TABLE_SELECTOR_FCI = "table#listValorCuotaParte" # Selector CSS para la tabla de FCI en esa página

# URL de la página de plazos fijos del BCRA
URL_BCRA = "https://www.bcra.gob.ar/BCRAyVos/Plazos_fijos_online.asp"
TABLE_SELECTOR_BCRA = "table.table-BCRA" # Selector CSS para la tabla de tasas

def fetch_data_fci_from_html():
    """
    Obtiene los datos de FCI directamente de la tabla HTML en la página de Banco Provincia Fondos.
    """
    print(f"[FCI Scraper] Obteniendo datos de FCI desde la tabla HTML en: {URL_PROVINCIA_FONDOS}")
    try:
        # Desactivar advertencias de SSL si es necesario, como en el scraper de BCRA
        urllib3.disable_warnings(urllib3.exceptions.InsecureRequestWarning)
        response = requests.get(URL_PROVINCIA_FONDOS, timeout=20, verify=False)
        response.raise_for_status() # Lanza una excepción para errores HTTP

    except requests.exceptions.RequestException as e:
        print(f"[FCI Scraper] Error al obtener la página de Banco Provincia Fondos: {e}")
        return None

    soup = BeautifulSoup(response.text, 'lxml')
    table = soup.select_one(TABLE_SELECTOR_FCI)

    if not table:
        print(f"[FCI Scraper] Error: No se encontró la tabla de FCI con el selector '{TABLE_SELECTOR_FCI}'.")
        return None

    # Leer la tabla HTML directamente con pandas
    try:
        # pd.read_html devuelve una lista de DataFrames, buscamos la que contenga nuestras columnas clave
        dfs = pd.read_html(str(table), thousands='.', decimal=',')
        df = None
        for temp_df in dfs:
            if 'Fecha' in temp_df.columns and 'Valor Cuota Parte' in temp_df.columns:
                df = temp_df
                break
        
        if df is None:
            raise Exception("No se encontró una tabla válida con las columnas 'Fecha' y 'Valor Cuota Parte'.")

        print("[FCI Scraper] Tabla HTML de FCI leída exitosamente con pandas.")

        col_fecha = 'Fecha'
        col_valor_cuota = 'Valor Cuota Parte'

        # Asegurarse de que las columnas están en el formato correcto (ej: eliminar puntos de miles para parsear a número)
        # pd.read_html con thousands/decimal debería manejarlo, pero es una doble verificación.
        if df[col_valor_cuota].dtype == 'object': # Si es string, limpiarla
             df[col_valor_cuota] = df[col_valor_cuota].astype(str).str.replace('.', '', regex=False).str.replace(',', '.', regex=False)
             df[col_valor_cuota] = pd.to_numeric(df[col_valor_cuota], errors='coerce')


        df[col_fecha] = pd.to_datetime(df[col_fecha], errors='coerce', format='%d/%m/%Y')
        df.dropna(subset=[col_fecha, col_valor_cuota], inplace=True)
        df.sort_values(by=col_fecha, inplace=True)

        variacion_diaria_pct = 0
        if len(df) >= 2:
            latest_two_days = df.iloc[-2:]
            valor_cuota_reciente = latest_two_days.iloc[1][col_valor_cuota]
            valor_cuota_anterior = latest_two_days.iloc[0][col_valor_cuota]

            if valor_cuota_anterior != 0:
                variacion_diaria_pct = ((valor_cuota_reciente - valor_cuota_anterior) / valor_cuota_anterior) * 100
            print(f"[FCI Scraper] Variación diaria actual (%): {variacion_diaria_pct:.4f}%")
        else:
            print("[FCI Scraper] No hay suficientes datos para calcular la variación diaria actual.")

        chart_data = []
        if not df.empty:
            latest_date_in_data = df[col_fecha].max()
            first_day_of_month = latest_date_in_data.replace(day=1)
            df_current_month = df[df[col_fecha] >= first_day_of_month].copy()

            df_current_month['Valor Cuota Parte Anterior'] = df_current_month[col_valor_cuota].shift(1)
            df_current_month['Variacion Diaria (%)'] = df_current_month.apply(
                lambda row: ((row[col_valor_cuota] - row['Valor Cuota Parte Anterior']) / row['Valor Cuota Parte Anterior']) * 100
                if pd.notna(row['Valor Cuota Parte Anterior']) and row['Valor Cuota Parte Anterior'] != 0 else 0,
                axis=1
            )
            chart_data = df_current_month[[col_fecha, 'Variacion Diaria (%)']].dropna().to_dict(orient='records')
            for item in chart_data:
                item[col_fecha] = item[col_fecha].strftime('%Y-%m-%d')
        else:
            print("[FCI Scraper] No hay datos para generar el gráfico histórico.")

        resultados_fci = [{
            "nombre": "Banco Provincia FCI",
            "logo": "imagenes/PCIA.jpg",
            "rendimiento_mensual_estimado_pct": variacion_diaria_pct,
            "variacion_historica_diaria": chart_data
        }]
        return resultados_fci

    except Exception as e:
        print(f"[FCI Scraper] Error al procesar la tabla HTML de FCI: {e}")
        return None

def fetch_data_bcra():
    """
    Obtiene los datos de plazos fijos desde la web del BCRA.
    """
    print(f"[BCRA Scraper] Obteniendo datos desde: {URL_BCRA}")
    try:
        urllib3.disable_warnings(urllib3.exceptions.InsecureRequestWarning)
        response = requests.get(URL_BCRA, timeout=20, verify=False)
        response.raise_for_status()
    except requests.exceptions.SSLError as e:
        print(f"[BCRA Scraper] Error SSL específico: {e}")
        print("[BCRA Scraper] Esto puede deberse a problemas de certificado. Intenta con verify=False si el sitio lo requiere, pero ten precaución.")
        return None
    except requests.exceptions.RequestException as e:
        print(f"[BCRA Scraper] Error al obtener la página del BCRA: {e}")
        return None

    soup = BeautifulSoup(response.text, 'lxml')
    table = soup.select_one(TABLE_SELECTOR_BCRA)

    if not table:
        print(f"[BCRA Scraper] Error: No se encontró la tabla con el selector '{TABLE_SELECTOR_BCRA}'.")
        return None

    datos_bancos = []
    for row in table.find_all('tr')[1:]:
        cols = row.find_all('td')
        if len(cols) >= 3:
            entidad = cols[0].get_text(strip=True)
            tna_str = cols[2].get_text(strip=True)

            tna_valor = re.search(r'\d[\d,.]*', tna_str)
            if tna_valor:
                tna_valor = tna_valor.group(0).replace('.', '').replace(',', '.')
                try:
                    tna = float(tna_valor)
                except ValueError:
                    tna = 0.0
            else:
                tna = 0.0

            if entidad:
                datos_bancos.append({
                    "entidad": entidad,
                    "tna": tna
                })
    return datos_bancos

def save_to_json(data, filename):
    """
    Guarda los datos en un archivo JSON.
    """
    if data is None:
        print(f"[{filename}] No hay datos para guardar en JSON.")
        return

    if filename == "tasas_bancos.json":
        output = {
            "ultima_actualizacion": datetime.now(timezone.utc).isoformat(),
            "tasas": data
        }
    else:
        output = data

    try:
        with open(filename, "w", encoding="utf-8") as f:
            json.dump(output, f, ensure_ascii=False, indent=2)
        print(f"[{filename}] Datos guardados exitosamente en: {filename}")
    except Exception as e:
        print(f"[{filename}] Error al guardar el archivo JSON: {e}")

if __name__ == "__main__":
    # --- Scrapeo de FCI ---
    print("\n--- Iniciando scrapeo de FCI ---")
    datos_fci_actualizados = fetch_data_fci_from_html()
    if datos_fci_actualizados:
        save_to_json(datos_fci_actualizados, "fci_data.json")
    else:
        print("[FCI Scraper] No se pudieron obtener los datos de FCI para actualizar.")

    # --- Scrapeo de Plazos Fijos ---
    print("\n--- Iniciando scrapeo de Plazos Fijos ---")
    tasas_completas = fetch_data_bcra()

    if tasas_completas:
        tasas_limitadas = tasas_completas[:5]
        save_to_json(tasas_limitadas, "tasas_bancos.json")
    else:
        print("[BCRA Scraper] No se pudieron obtener datos de Plazos Fijos. Se guardará un JSON vacío.")
        save_to_json([], "tasas_bancos.json")
