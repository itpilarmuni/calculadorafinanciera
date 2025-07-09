import pandas as pd
import json
import os
import time
import glob
from datetime import datetime, timedelta

# Importaciones para Selenium
from selenium import webdriver
from selenium.webdriver.chrome.service import Service
from selenium.webdriver.common.by import By
from selenium.webdriver.chrome.options import Options
from webdriver_manager.chrome import ChromeDriverManager
from selenium.webdriver.support.ui import WebDriverWait
from selenium.webdriver.support import expected_conditions as EC

# URL de la página de Banco Provincia Fondos
URL_PROVINCIA_FONDOS = "https://www.provinciafondos.com.ar/valorCuotaParte.php?id=1"

def fetch_and_process_fci_excel_real_scrape():
    """
    Navega a la página de Banco Provincia Fondos, descarga el archivo Excel
    y extrae los datos requeridos para Banco Provincia FCI.
    """
    download_dir = os.path.join(os.getcwd(), "downloads")
    os.makedirs(download_dir, exist_ok=True)

    # Configuración de Chrome para modo headless y descargas
    chrome_options = Options()
    chrome_options.add_argument("--headless")  # Ejecutar en segundo plano sin interfaz gráfica
    chrome_options.add_argument("--no-sandbox") # Necesario para entornos de CI/CD como GitHub Actions
    chrome_options.add_argument("--disable-dev-shm-usage") # Recomendado para Docker/CI
    chrome_options.add_experimental_option("prefs", {
        "download.default_directory": download_dir,
        "download.prompt_for_download": False,
        "download.directory_upgrade": True,
        "plugins.always_open_pdf_externally": True
    })

    driver = None
    try:
        # Inicializar el WebDriver de Chrome
        service = Service(ChromeDriverManager().install())
        driver = webdriver.Chrome(service=service, options=chrome_options)
        print(f"[FCI Scraper] Navegando a: {URL_PROVINCIA_FONDOS}")
        driver.get(URL_PROVINCIA_FONDOS)

        # Esperar hasta que el botón de Excel sea clickeable
        # Usamos una espera explícita para asegurar que el elemento esté presente
        excel_button = WebDriverWait(driver, 20).until(
            EC.element_to_be_clickable((By.CSS_SELECTOR, 'a.dt-button.buttons-excel.buttons-html5'))
        )
        print("[FCI Scraper] Botón 'Excel' encontrado. Clickeando...")
        excel_button.click()

        # Esperar a que el archivo se descargue
        # El nombre del archivo suele ser "Provincia Fondos - Sociedad Gerente de Fondos Comunes de Inversión del Grupo Provincia.xlsx"
        # O el navegador podría añadir '(1)' si ya existe uno. Buscamos cualquier .xlsx que aparezca.
        downloaded_file = None
        timeout_seconds = 60
        start_time = time.time()
        while time.time() - start_time < timeout_seconds:
            list_of_files = glob.glob(os.path.join(download_dir, '*.xlsx'))
            if list_of_files:
                # Ordenar por fecha de modificación para obtener el más reciente
                latest_file = max(list_of_files, key=os.path.getmtime)
                # Opcional: verificar que el archivo no sea temporal (.crdownload, .tmp)
                if not latest_file.endswith(('.crdownload', '.tmp')):
                    downloaded_file = latest_file
                    break
            time.sleep(1) # Esperar 1 segundo antes de reintentar

        if not downloaded_file:
            raise Exception(f"No se pudo descargar el archivo Excel después de {timeout_seconds} segundos.")

        print(f"[FCI Scraper] Archivo Excel descargado: {os.path.basename(downloaded_file)}")

        # Leer el archivo descargado con pandas
        # Asumimos que el archivo descargado es el mismo CSV que antes, pero en formato XLSX
        df = pd.read_excel(downloaded_file)

        col_fecha = 'Fecha'
        col_valor_cuota = 'Valor Cuota Parte'

        if col_fecha not in df.columns or col_valor_cuota not in df.columns:
            raise Exception(f"Columnas '{col_fecha}' o '{col_valor_cuota}' no encontradas en el Excel descargado.")

        # Convertir 'Fecha' a datetime, manejando errores (formato esperado: dd/mm/yyyy)
        df[col_fecha] = pd.to_datetime(df[col_fecha], errors='coerce', format='%d/%m/%Y')
        df.dropna(subset=[col_fecha], inplace=True) # Eliminar filas con fechas inválidas
        df.sort_values(by=col_fecha, inplace=True) # Ordenar por fecha

        # Calcular la variación diaria del último día
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

        # Preparar datos para el gráfico (variación diaria histórica del mes actual)
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

        # Construir el JSON final
        resultados_fci = [{
            "nombre": "Banco Provincia FCI",
            "logo": "imagenes/PCIA.jpg", # Asegúrate de que esta ruta sea correcta en tu web
            "rendimiento_mensual_estimado_pct": variacion_diaria_pct, # Este es el rendimiento diario
            "variacion_historica_diaria": chart_data
        }]
        return resultados_fci

    except Exception as e:
        print(f"[FCI Scraper] Error durante el scrapeo o procesamiento: {e}")
        return None
    finally:
        if driver:
            driver.quit() # Asegurarse de cerrar el navegador
        # Limpiar la carpeta de descargas
        if os.path.exists(download_dir):
            for file_name in os.listdir(download_dir):
                file_path = os.path.join(download_dir, file_name)
                try:
                    if os.path.isfile(file_path):
                        os.remove(file_path)
                except Exception as e:
                    print(f"Error al limpiar archivo {file_path}: {e}")
            os.rmdir(download_dir) # Eliminar la carpeta vacía

def save_to_json(data, filename="fci_data.json"):
    if not data:
        print("[FCI Scraper] No se encontraron datos de FCI para guardar. No se modificará el archivo JSON.")
        return
    try:
        with open(filename, "w", encoding="utf-8") as f:
            json.dump(data, f, ensure_ascii=False, indent=2)
        print(f"[FCI Scraper] Datos de FCI guardados exitosamente en: {filename}")
    except Exception as e:
        print(f"[FCI Scraper] Error al guardar el archivo JSON: {e}")

if __name__ == "__main__":
    datos_fci_actualizados = fetch_and_process_fci_excel_real_scrape()
    if datos_fci_actualizados:
        save_to_json(datos_fci_actualizados)
    else:
        print("[FCI Scraper] No se pudieron obtener los datos de FCI para actualizar.")
