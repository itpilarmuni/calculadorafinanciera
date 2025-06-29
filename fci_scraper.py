import requests
import pandas as pd
from datetime import datetime, timezone
import json
import io

# URL del informe diario de rendimientos de fondos de Renta Mixta de CAFCI
# Esta URL es un buen punto de partida, ya que suele contener fondos como los que buscamos.
URL_CAFCI = "https://www.cafci.com.ar/informe-diario-fondo-t.html?id=5&exclude="

# Nombres de los fondos que nos interesan (pueden ser partes del nombre)
FONDOS_DE_INTERES = {
    "1810 RF MIXTA A": "Banco Provincia FCI", # "1810" es el FCI de BAPRO
    "Alpha Renta Mixta A": "ICBC Alpha FCI" # "Alpha Renta Mixta" es el de ICBC
}

# Columnas que nos interesan del informe de CAFCI
COLUMNA_FONDO = 'Fondo'
COLUMNA_RENDIMIENTO_MENSUAL = 'Rendimiento Mes'

def fetch_and_process_fci_data():
    """
    Obtiene los datos de rendimientos de FCI desde la web de CAFCI,
    los procesa y devuelve los datos de los fondos de interés.
    """
    print(f"[FCI Scraper] Obteniendo datos desde: {URL_CAFCI}")
    try:
        response = requests.get(URL_CAFCI, timeout=20)
        response.raise_for_status()
    except requests.exceptions.RequestException as e:
        print(f"[FCI Scraper] Error al obtener la página de CAFCI: {e}")
        return None

    print("[FCI Scraper] Página obtenida. Buscando tablas de datos...")
    
    # pandas.read_html es excelente para leer tablas directamente de una URL
    try:
        tablas = pd.read_html(io.StringIO(response.text), thousands='.', decimal=',')
        if not tablas:
            print("[FCI Scraper] No se encontraron tablas en la página de CAFCI.")
            return None
        
        # Asumimos que la tabla que nos interesa es la primera con datos relevantes.
        # Esto podría necesitar ajuste si la página cambia.
        df = tablas[0] 
        print(f"[FCI Scraper] Tabla encontrada con {len(df)} filas.")
        # print(df.head()) # Descomentar para depurar y ver las primeras filas de la tabla

    except Exception as e:
        print(f"[FCI Scraper] Error al procesar la tabla con pandas: {e}")
        return None

    # Verificar que las columnas necesarias existen en el DataFrame
    if COLUMNA_FONDO not in df.columns or COLUMNA_RENDIMIENTO_MENSUAL not in df.columns:
        print(f"[FCI Scraper] Error: No se encontraron las columnas esperadas ('{COLUMNA_FONDO}', '{COLUMNA_RENDIMIENTO_MENSUAL}').")
        print("Columnas disponibles:", df.columns.tolist())
        return None

    resultados_fci = []
    
    for nombre_cafci, nombre_app in FONDOS_DE_INTERES.items():
        # Buscar una fila donde el nombre del fondo contenga el nombre que buscamos
        fila_fondo = df[df[COLUMNA_FONDO].str.contains(nombre_cafci, case=False, na=False)]
        
        if not fila_fondo.empty:
            # Tomar el primer resultado si hay varios
            rendimiento_str = fila_fondo.iloc[0][COLUMNA_RENDIMIENTO_MENSUAL]
            
            try:
                # El rendimiento suele venir como "x.xx %". Necesitamos quitar el '%' y convertir a float.
                rendimiento_pct = float(str(rendimiento_str).replace('%', '').strip())
                
                print(f"[FCI Scraper] Encontrado '{nombre_app}': Rendimiento Mensual = {rendimiento_pct}%")

                # Replicar la estructura de nuestro fci_data.json
                # Las rutas de los logos se mantienen, ya que están en nuestro repo
                logo_path = ""
                if "Provincia" in nombre_app:
                    logo_path = "imagenes/PCIA.jpg"
                elif "ICBC" in nombre_app:
                    logo_path = "imagenes/LOGO-ICBC-VERTICAL-copy-01-1.png"

                resultados_fci.append({
                    "nombre": nombre_app,
                    "logo": logo_path,
                    "rendimiento_mensual_estimado_pct": rendimiento_pct
                })

            except (ValueError, TypeError) as e:
                print(f"[FCI Scraper] No se pudo convertir el rendimiento '{rendimiento_str}' para '{nombre_app}'. Error: {e}")
        else:
            print(f"[FCI Scraper] No se encontró el fondo que contenga '{nombre_cafci}' en la tabla.")

    return resultados_fci

def save_to_json(data, filename="fci_data.json"):
    """
    Guarda los datos en un archivo JSON, sobrescribiendo el existente.
    """
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
    datos_fci_actualizados = fetch_and_process_fci_data()
    # Solo sobrescribimos el archivo si el scraping fue exitoso
    if datos_fci_actualizados:
        save_to_json(datos_fci_actualizados)
    else:
        print("[FCI Scraper] El scraping de FCI falló. El archivo fci_data.json no fue modificado.")
