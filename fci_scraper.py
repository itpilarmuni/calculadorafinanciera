import requests
import pandas as pd
import json

# URL del informe diario de rendimientos de fondos de Renta Mixta de CAFCI
URL_CAFCI = "https://www.cafci.com.ar/informe-diario-fondo-t.html?id=5&exclude="

FONDOS_DE_INTERES = {
    # Nombres clave para buscar en la primera columna de la tabla
    "1810 Renta Mixta A": "Banco Provincia FCI",
    "Alpha Renta Mixta A": "ICBC Alpha FCI"
}

def fetch_and_process_fci_data():
    """
    Obtiene los datos de rendimientos de FCI desde la web de CAFCI,
    imprime la tabla completa para depuración y procesa los datos.
    """
    print(f"[FCI Scraper] Obteniendo datos desde: {URL_CAFCI}")
    try:
        # Añadimos un User-Agent para simular un navegador, a veces ayuda a evitar bloqueos.
        response = requests.get(URL_CAFCI, timeout=20, headers={'User-Agent': 'Mozilla/5.0'})
        response.raise_for_status()
    except requests.exceptions.RequestException as e:
        print(f"[FCI Scraper] Error al obtener la página de CAFCI: {e}")
        return None

    print("[FCI Scraper] Página obtenida. Buscando tablas de datos con pandas...")
    
    try:
        tablas = pd.read_html(response.text, thousands='.', decimal=',')
        if not tablas:
            print("[FCI Scraper] No se encontraron tablas en la página de CAFCI.")
            return None
        
        # Asumimos que la tabla principal es la primera que encuentra pandas
        df = tablas[0]
        
        # ***** LÍNEA CLAVE PARA VER LOS DATOS CRUDOS *****
        # Imprimimos la tabla completa tal como la lee el scraper.
        print("------------------- INICIO DE TABLA SCRAPEADA -------------------")
        print(df.to_string()) # .to_string() asegura que se imprima toda la tabla sin cortar
        print("-------------------- FIN DE TABLA SCRAPEADA --------------------")
        
    except Exception as e:
        print(f"[FCI Scraper] Error al procesar la tabla con pandas: {e}")
        return None

    # Adaptación a posibles cambios en los nombres de las columnas
    if len(df.columns) < 6:
        print(f"[FCI Scraper] La tabla no tiene suficientes columnas. Columnas encontradas: {df.columns.tolist()}")
        return None
    
    # Usamos la posición de las columnas para ser más robustos
    col_fondo = df.columns[0]      # Primera columna para el nombre del fondo
    col_rend_mes = df.columns[5]   # Sexta columna para el rendimiento del mes
    
    print(f"[FCI Scraper] Usando columnas -> Nombre: '{col_fondo}', Rendimiento: '{col_rend_mes}'.")

    resultados_fci = []
    
    for nombre_cafci, nombre_app in FONDOS_DE_INTERES.items():
        # Buscar una fila donde el nombre del fondo contenga el texto clave
        fila_fondo = df[df[col_fondo].str.contains(nombre_cafci, case=False, na=False)]
        
        if not fila_fondo.empty:
            # Tomar el primer resultado si hay varios
            rendimiento_str = fila_fondo.iloc[0][col_rend_mes]
            try:
                # Limpiar y convertir el rendimiento
                rendimiento_pct = float(str(rendimiento_str).replace('%', '').strip())
                print(f"[FCI Scraper] ÉXITO: Encontrado '{nombre_app}' con Rendimiento Mensual = {rendimiento_pct}%")

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
                print(f"[FCI Scraper] ERROR al convertir el rendimiento '{rendimiento_str}' para '{nombre_app}'. Error: {e}")
        else:
            print(f"[FCI Scraper] ADVERTENCIA: No se encontró el fondo que contenga '{nombre_cafci}' en la tabla.")

    return resultados_fci

def save_to_json(data, filename="fci_data.json"):
    """ Guarda los datos en un archivo JSON. """
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
    if datos_fci_actualizados:
        save_to_json(datos_fci_actualizados)
    else:
        print("[FCI Scraper] El scraping de FCI falló o no encontró datos relevantes. El archivo fci_data.json no fue modificado.")
