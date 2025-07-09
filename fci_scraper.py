import pandas as pd
import json
import os
import time
import glob
from datetime import datetime, timedelta, timezone

# Importaciones para Selenium (para FCI)
from selenium import webdriver
from selenium.webdriver.chrome.service import Service
from selenium.webdriver.common.by import By
from selenium.webdriver.chrome.options import Options
from webdriver_manager.chrome import ChromeDriverManager
from selenium.webdriver.support.ui import WebDriverWait
from selenium.webdriver.support import expected_conditions as EC

# Importaciones para Plazos Fijos (BCRA)
import requests
from bs4 import BeautifulSoup
import re
import urllib3 # Para desactivar advertencias de SSL (si usas verify=False)

# URL de la página de Banco Provincia Fondos (para FCI)
URL_PROVINCIA_FONDOS = "https://www.provinciafondos.com.ar/valorCuotaParte.php?id=1"

# URL de la página de plazos fijos del BCRA
URL_BCRA = "https://www.bcra.gob.ar/BCRAyVos/Plazos_fijos_online.asp"
TABLE_SELECTOR = "table.table-BCRA" # Selector CSS para la tabla de tasas

def fetch_and_process_fci_excel_real_scrape():
    """
    Navega a la página de Banco Provincia Fondos, descarga el archivo Excel
    y extrae los datos requeridos para Banco Provincia FCI.
    """
    download_dir = os.path.join(os.getcwd(), "downloads")
    os.makedirs(download_dir, exist_ok=True)

    chrome_options = Options()
    chrome_options.add_argument("--headless")
    chrome_options.add_argument("--no-sandbox")
    chrome_options.add_argument("--disable-dev-shm-usage")
    chrome_options.add_experimental_option("prefs", {
        "download.default_directory": download_dir,
        "download.prompt_for_download": False,
        "download.directory_upgrade": True,
        "plugins.always_open_pdf_externally": True
    })

    driver = None
    try:
        service = Service(ChromeDriverManager().install())
        driver = webdriver.Chrome(service=service, options=chrome_options)
        print(f"[FCI Scraper] Navegando a: {URL_PROVINCIA_FONDOS}")
        driver.get(URL_PROVINCIA_FONDOS)

        excel_button = WebDriverWait(driver, 20).until(
            EC.element_to_be_clickable((By.CSS_SELECTOR, 'a.dt-button.buttons-excel.buttons-html5'))
        )
        print("[FCI Scraper] Botón 'Excel' encontrado. Clickeando...")
        excel_button.click()

        downloaded_file = None
        timeout_seconds = 60
        start_time = time.time()
        while time.time() - start_time < timeout_seconds:
            list_of_files = glob.glob(os.path.join(download_dir, '*.xlsx'))
            if list_of_files:
                latest_file = max(list_of_files, key=os.path.getmtime)
                if not latest_file.endswith(('.crdownload', '.tmp')):
                    downloaded_file = latest_file
                    break
            time.sleep(1)

        if not downloaded_file:
            raise Exception(f"No se pudo descargar el archivo Excel después de {timeout_seconds} segundos.")

        print(f"[FCI Scraper] Archivo Excel descargado: {os.path.basename(downloaded_file)}")

        df = pd.read_excel(downloaded_file)

        col_fecha = 'Fecha'
        col_valor_cuota = 'Valor Cuota Parte'

        if col_fecha not in df.columns or col_valor_cuota not in df.columns:
            raise Exception(f"Columnas '{col_fecha}' o '{col_valor_cuota}' no encontradas en el Excel descargado.")

        df[col_fecha] = pd.to_datetime(df[col_fecha], errors='coerce', format='%d/%m/%Y')
        df.dropna(subset=[col_fecha], inplace=True)
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
        print(f"[FCI Scraper] Error durante el scrapeo o procesamiento de FCI: {e}")
        return None
    finally:
        if driver:
            driver.quit()
        if os.path.exists(download_dir):
            for file_name in os.listdir(download_dir):
                file_path = os.path.join(download_dir, file_name)
                try:
                    if os.path.isfile(file_path):
                        os.remove(file_path)
                except Exception as e:
                    print(f"Error al limpiar archivo {file_path}: {e}")
            os.rmdir(download_dir)


def fetch_data_bcra():
    """
    Obtiene los datos de plazos fijos desde la web del BCRA.
    """
    print(f"[BCRA Scraper] Obteniendo datos desde: {URL_BCRA}")
    try:
        # Desactivar advertencias solo si estás usando verify=False
        # Esto es por si el sitio del BCRA tiene problemas de certificado no estándar.
        # En un entorno de producción ideal, verify debería ser True con certificados válidos.
        urllib3.disable_warnings(urllib3.exceptions.InsecureRequestWarning)

        response = requests.get(URL_BCRA, timeout=20, verify=False)
        response.raise_for_status() # Lanza una excepción para errores HTTP (4xx o 5xx)
    except requests.exceptions.SSLError as e:
        print(f"[BCRA Scraper] Error SSL específico: {e}")
        print("[BCRA Scraper] Esto puede deberse a problemas de certificado. Intenta con verify=False si el sitio lo requiere, pero ten precaución.")
        return None
    except requests.exceptions.RequestException as e:
        print(f"[BCRA Scraper] Error al obtener la página del BCRA: {e}")
        return None

    soup = BeautifulSoup(response.text, 'lxml') # Usar 'lxml' por rendimiento
    table = soup.select_one(TABLE_SELECTOR)

    if not table:
        print(f"[BCRA Scraper] Error: No se encontró la tabla con el selector '{TABLE_SELECTOR}'.")
        return None

    datos_bancos = []
    # Las filas de datos suelen estar en <tbody>, y omitimos la fila de encabezado si está en <thead>
    for row in table.find_all('tr')[1:]: # Saltar la primera fila que es el encabezado
        cols = row.find_all('td')
        if len(cols) >= 3: # Asegurarse de que hay suficientes columnas
            entidad = cols[0].get_text(strip=True)
            tna_str = cols[2].get_text(strip=True) # La TNA suele ser la tercera columna (índice 2)

            # Extraer solo los números de la TNA, eliminando signos de porcentaje y comas decimales
            tna_valor = re.search(r'\d[\d,.]*', tna_str)
            if tna_valor:
                tna_valor = tna_valor.group(0).replace('.', '').replace(',', '.') # Eliminar puntos de miles, cambiar coma decimal por punto
                try:
                    tna = float(tna_valor)
                except ValueError:
                    tna = 0.0 # Valor por defecto si no se puede convertir
            else:
                tna = 0.0

            if entidad: # Solo agregar si la entidad tiene nombre
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

    # Para tasas_bancos.json, necesitamos una estructura específica
    if filename == "tasas_bancos.json":
        output = {
            "ultima_actualizacion": datetime.now(timezone.utc).isoformat(),
            "tasas": data
        }
    else: # Para fci_data.json, la data ya viene con la estructura deseada (array)
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
    datos_fci_actualizados = fetch_and_process_fci_excel_real_scrape()
    if datos_fci_actualizados:
        save_to_json(datos_fci_actualizados, "fci_data.json")
    else:
        print("[FCI Scraper] No se pudieron obtener los datos de FCI para actualizar.")

    # --- Scrapeo de Plazos Fijos ---
    print("\n--- Iniciando scrapeo de Plazos Fijos ---")
    tasas_completas = fetch_data_bcra()

    if tasas_completas:
        # Limitar la lista a los primeros 5 bancos como en tu script original
        tasas_limitadas = tasas_completas[:5]
        save_to_json(tasas_limitadas, "tasas_bancos.json")
    else:
        print("[BCRA Scraper] No se pudieron obtener datos de Plazos Fijos. Se guardará un JSON vacío.")
        save_to_json([], "tasas_bancos.json") # Guardar un array vacío si no hay datos
