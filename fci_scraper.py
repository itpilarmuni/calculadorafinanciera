import requests
import pandas as pd
import json
import io

# URL de descarga directa de la planilla diaria de CAFCI
# Este enlace descarga el archivo Excel completo.
URL_CAFCI_EXCEL = "https://api.cafci.org.ar/pb_get"

# Nombres de los fondos que nos interesan, tal como aparecen en el Excel
FONDOS_DE_INTERES = {
    "1810 Renta Mixta A": "Banco Provincia FCI",
    "Alpha Renta Mixta A": "ICBC Alpha FCI"
}

def fetch_and_process_fci_excel():
    """
    Descarga el archivo Excel de CAFCI, lo lee con pandas,
    y extrae los datos de los fondos de interés.
    """
    print(f"[FCI Scraper Excel] Descargando planilla desde: {URL_CAFCI_EXCEL}")
    try:
        # Hacemos la solicitud GET para descargar el archivo
        response = requests.get(URL_CAFCI_EXCEL, timeout=60, headers={'User-Agent': 'Mozilla/5.0'})
        response.raise_for_status()
        print("[FCI Scraper Excel] Planilla descargada exitosamente.")
    except requests.exceptions.RequestException as e:
        print(f"[FCI Scraper Excel] Error al descargar el archivo de CAFCI: {e}")
        return None

    try:
        # Leemos el contenido del Excel directamente en pandas sin guardarlo en disco.
        # 'io.BytesIO' permite a pandas leer el contenido binario del Excel.
        # 'header=7' indica que los encabezados de la tabla comienzan en la fila 8 del Excel.
        df = pd.read_excel(io.BytesIO(response.content), header=7)
        
        # Opcional: Imprimir las primeras filas para depuración en los logs de GitHub Actions
        # print("------------------- INICIO DE TABLA EXCEL -------------------")
        # print(df.head().to_string())
        # print("-------------------- FIN DE TABLA EXCEL --------------------")
        
    except Exception as e:
        print(f"[FCI Scraper Excel] Error al leer el archivo Excel con pandas: {e}")
        return None

    # Nombres de las columnas que necesitamos del Excel
    col_fondo = 'Fondo'
    col_rend_mes = 'Rend. del Mes %'

    if col_fondo not in df.columns or col_rend_mes not in df.columns:
        print(f"[FCI Scraper Excel] Error: No se encontraron las columnas esperadas ('{col_fondo}', '{col_rend_mes}').")
        print("Columnas disponibles:", df.columns.tolist())
        return None

    resultados_fci = []
    
    for nombre_cafci, nombre_app in FONDOS_DE_INTERES.items():
        # Buscar la fila exacta que coincida con el nombre del fondo
        fila_fondo = df[df[col_fondo] == nombre_cafci]
        
        if not fila_fondo.empty:
            # iloc[0] toma la primera (y única) fila encontrada
            rendimiento_obj = fila_fondo.iloc[0][col_rend_mes]
            try:
                # El valor puede ser numérico directamente o un string, nos aseguramos
                rendimiento_pct = float(rendimiento_obj)
                
                print(f"[FCI Scraper Excel] ÉXITO: Encontrado '{nombre_app}' con Rendimiento Mensual = {rendimiento_pct}%")

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
                print(f"[FCI Scraper Excel] ERROR al convertir el rendimiento '{rendimiento_obj}' para '{nombre_app}'. Error: {e}")
        else:
            print(f"[FCI Scraper Excel] ADVERTENCIA: No se encontró el fondo '{nombre_cafci}' en el Excel.")

    return resultados_fci

def save_to_json(data, filename="fci_data.json"):
    """ Guarda los datos en un archivo JSON. """
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
        print("[FCI Scraper Excel] El scraping de FCI falló o no encontró datos relevantes. El archivo fci_data.json no fue modificado.")
