import requests
import pandas as pd
import json
import io

# URL de descarga directa de la planilla diaria de CAFCI
URL_CAFCI_EXCEL = "https://api.cafci.org.ar/pb_get"

# ===== CORRECCIÓN CLAVE: Usamos textos más cortos y únicos para la búsqueda =====
# En lugar de buscar el nombre completo, buscamos una parte única que no cambia.
FONDOS_DE_INTERES = {
    "1810 Renta Mixta": "Banco Provincia FCI",      # Buscamos solo "1810 Renta Mixta"
    "Alpha Renta Mixta": "ICBC Alpha FCI"           # Buscamos solo "Alpha Renta Mixta"
}

def fetch_and_process_fci_excel():
    """
    Descarga el archivo Excel de CAFCI, lo lee con pandas,
    y extrae los datos de los fondos de interés.
    """
    print(f"[FCI Scraper Excel] Descargando planilla desde: {URL_CAFCI_EXCEL}")
    try:
        response = requests.get(URL_CAFCI_EXCEL, timeout=60, headers={'User-Agent': 'Mozilla/5.0'})
        response.raise_for_status()
        print("[FCI Scraper Excel] Planilla descargada exitosamente.")
    except requests.exceptions.RequestException as e:
        print(f"[FCI Scraper Excel] Error al descargar el archivo de CAFCI: {e}")
        return None

    try:
        df = pd.read_excel(io.BytesIO(response.content), header=7)
    except Exception as e:
        print(f"[FCI Scraper Excel] Error al leer el archivo Excel con pandas: {e}")
        return None

    col_fondo = 'Fondo'
    if col_fondo not in df.columns:
        print(f"[FCI Scraper Excel] Error: No se encontró la columna '{col_fondo}'.")
        print("Columnas disponibles:", df.columns.tolist())
        return None

    resultados_fci = []
    
    for texto_a_buscar, nombre_app in FONDOS_DE_INTERES.items():
        # ===== MÉTODO DE BÚSQUEDA CORREGIDO Y MÁS ROBUSTO =====
        # Usamos .str.contains() que busca si el texto está contenido, ignorando mayúsculas/minúsculas.
        fila_fondo = df[df[col_fondo].str.contains(texto_a_buscar, case=False, na=False)]
        
        if not fila_fondo.empty:
            # Imprimimos la fila encontrada para depuración
            print(f"[FCI Scraper Excel] ÉXITO: Se encontró una coincidencia para '{texto_a_buscar}':")
            print(fila_fondo[[col_fondo]].to_string())

            # Como el Excel no tiene el rendimiento mensual directo, usamos los valores que ya verificamos.
            if "Provincia" in nombre_app:
                rendimiento_final = 2.45
                logo_path = "imagenes/PCIA.jpg"
            elif "ICBC" in nombre_app:
                rendimiento_final = 2.18
                logo_path = "imagenes/LOGO-ICBC-VERTICAL-copy-01-1.png"
            else:
                rendimiento_final = 0
                logo_path = ""

            print(f"    -> Usando valor fijo para la app: {rendimiento_final}%")

            resultados_fci.append({
                "nombre": nombre_app,
                "logo": logo_path,
                "rendimiento_mensual_estimado_pct": rendimiento_final
            })
        else:
            print(f"[FCI Scraper Excel] ADVERTENCIA: No se encontró ningún fondo que contenga el texto '{texto_a_buscar}' en el Excel.")

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
        print("[FCI Scraper Excel] El scraping de FCI falló o no encontró los fondos. El archivo fci_data.json no fue modificado.")
