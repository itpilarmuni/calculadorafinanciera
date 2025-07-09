import pandas as pd
import json
import os
import time
import glob
from datetime import datetime, timedelta, timezone
import calendar # Importar para obtener días del mes

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
        urllib3.disable_warnings(urllib3.exceptions.InsecureRequestWarning)
        response = requests.get(URL_PROVINCIA_FONDOS, timeout=20, verify=False)
        response.raise_for_status()

    except requests.exceptions.RequestException as e:
        print(f"[FCI Scraper] Error al obtener la página de Banco Provincia Fondos: {e}")
        return None

    soup = BeautifulSoup(response.text, 'lxml')
    table = soup.select_one(TABLE_SELECTOR_FCI)

    if not table:
        print(f"[FCI Scraper] Error: No se encontró la tabla de FCI con el selector '{TABLE_SELECTOR_FCI}'.")
        return None

    try:
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

        if df[col_valor_cuota].dtype == 'object':
             df[col_valor_cuota] = df[col_valor_cuota].astype(str).str.replace('.', '', regex=False).str.replace(',', '.', regex=False)
             df[col_valor_cuota] = pd.to_numeric(df[col_valor_cuota], errors='coerce')


        df[col_fecha] = pd.to_datetime(df[col_fecha], errors='coerce', format='%d/%m/%Y')
        df.dropna(subset=[col_fecha, col_valor_cuota], inplace=True)
        df.sort_values(by=col_fecha, inplace=True)

        # --- Lógica de cálculo de la variación diaria compuesta ---
        df['Valor Cuota Parte Anterior'] = df[col_valor_cuota].shift(1)
        df['Dias Transcurridos'] = (df[col_fecha] - df[col_fecha].shift(1)).dt.days
        
        def calculate_compounded_daily_variation(row):
            if pd.notna(row['Valor Cuota Parte Anterior']) and row['Valor Cuota Parte Anterior'] != 0 and row['Dias Transcurridos'] > 0:
                total_return = (row[col_valor_cuota] / row['Valor Cuota Parte Anterior']) - 1
                if total_return >= -1:
                    return ((1 + total_return)**(1/row['Dias Transcurridos']) - 1) * 100
                else:
                    return -100.0 # Caída del 100% o más
            return 0.0

        df['Variacion Diaria (%)'] = df.apply(calculate_compounded_daily_variation, axis=1)
        
        # --- Cálculo de Rendimiento Diario Actual y Rendimiento Mensual Estimado (EXTRAPOLADO) ---
        rendimiento_diario_actual_pct = 0.0 
        estimated_monthly_return_pct = 0.0
        chart_data = []

        if not df.empty:
            # Obtener el último valor calculado de Variacion Diaria (%) para rendimiento_diario_actual_pct
            last_valid_variation = df['Variacion Diaria (%)'].dropna().iloc[-1] if not df['Variacion Diaria (%)'].dropna().empty else 0.0
            rendimiento_diario_actual_pct = last_valid_variation
            print(f"[FCI Scraper] Variación diaria compuesta actual (%): {rendimiento_diario_actual_pct:.4f}%")

            latest_date_in_data = df[col_fecha].max()
            first_day_of_month = latest_date_in_data.replace(day=1)
            df_current_month = df[df[col_fecha] >= first_day_of_month].copy()
            
            # Asegurarse de que 'Variacion Diaria (%)' está limpia para la suma y promedio
            df_current_month_clean = df_current_month[df_current_month['Variacion Diaria (%)'] != 0].copy()

            # Suma de rendimientos diarios MTD
            sum_daily_returns_mtd = df_current_month_clean['Variacion Diaria (%)'].sum()
            num_data_points_mtd = df_current_month_clean['Variacion Diaria (%)'].count()

            if num_data_points_mtd > 0:
                avg_daily_return_mtd = sum_daily_returns_mtd / num_data_points_mtd
            else:
                avg_daily_return_mtd = 0.0

            # Calcular días restantes en el mes
            total_days_in_month = calendar.monthrange(latest_date_in_data.year, latest_date_in_data.month)[1]
            days_passed_in_month_calendar = latest_date_in_data.day
            remaining_days_in_month = total_days_in_month - days_passed_in_month_calendar

            # Proyección y suma para el estimado mensual
            projected_future_returns = avg_daily_return_mtd * remaining_days_in_month
            estimated_monthly_return_pct = sum_daily_returns_mtd + projected_future_returns

            print(f"[FCI Scraper] Rendimiento mensual estimado (extrapolado) (%): {estimated_monthly_return_pct:.4f}%")
            
            # Preparar datos para el gráfico
            chart_data = df_current_month[[col_fecha, 'Variacion Diaria (%)']].dropna().to_dict(orient='records')
            for item in chart_data:
                item[col_fecha] = item[col_fecha].strftime('%Y-%m-%d')
        else:
            print("[FCI Scraper] No hay datos suficientes para calcular los rendimientos o el gráfico histórico.")

        resultados_fci = [{
            "nombre": "Banco Provincia FCI",
            "logo": "PCIA.jpg",
            "rendimiento_diario_actual_pct": rendimiento_diario_actual_pct,
            "rendimiento_mensual_estimado_pct": estimated_monthly_return_pct, # Ahora es el rendimiento mensual EXTRAPOLADO
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
