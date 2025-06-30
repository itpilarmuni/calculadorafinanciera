import requests
import json

# URL de la API de CAFCI para obtener todos los fondos activos con sus datos
URL_API_CAFCI = "https://api.cafci.org.ar/fondo?estado=1&limit=0&include=clase_fondo,ultima_ficha"

# Nombres de las "clases" de los fondos que nos interesan.
FONDOS_DE_INTERES = {
    "1810 Renta Mixta - Clase A": "Banco Provincia FCI",
    "Alpha Renta Mixta - Clase A": "ICBC Alpha FCI"
}

def fetch_fci_data_from_api():
    """
    Obtiene los datos de todos los FCI desde la API de CAFCI, simulando ser un navegador.
    """
    print(f"[FCI Scraper API] Obteniendo datos desde: {URL_API_CAFCI}")
    try:
        # ===== CAMBIO CLAVE: AÑADIR HEADER PARA EVITAR ERROR 403 =====
        headers = {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36'
        }
        response = requests.get(URL_API_CAFCI, timeout=60, headers=headers)
        response.raise_for_status() # Esto lanzará un error para respuestas 4xx o 5xx
        return response.json()
    except requests.exceptions.RequestException as e:
        print(f"[FCI Scraper API] Error al conectar con la API de CAFCI: {e}")
        return None
    except json.JSONDecodeError:
        print("[FCI Scraper API] Error: La respuesta de la API no es un JSON válido.")
        return None

def find_funds_and_extract_performance(api_data):
    """
    Busca los fondos de interés en la respuesta de la API y extrae su rendimiento mensual.
    """
    if not api_data or 'data' not in api_data:
        print("[FCI Scraper API] La respuesta de la API no contiene la sección 'data' esperada.")
        return None

    resultados_fci = []
    
    funds_by_class_name = {
        clase['nombre']: fondo
        for fondo in api_data['data']
        for clase in fondo.get('clase_fondos', [])
    }

    for nombre_clase_cafci, nombre_app in FONDOS_DE_INTERES.items():
        if nombre_clase_cafci in funds_by_class_name:
            fondo_encontrado = funds_by_class_name[nombre_clase_cafci]
            
            if 'ultima_ficha' in fondo_encontrado and fondo_encontrado['ultima_ficha']:
                rendimientos = fondo_encontrado['ultima_ficha'].get('rendimientos', {})
                rendimiento_mensual_str = rendimientos.get('mes')

                if rendimiento_mensual_str is not None:
                    try:
                        rendimiento_pct = float(rendimiento_mensual_str)
                        print(f"[FCI Scraper API] ÉXITO: Encontrado '{nombre_app}' con Rendimiento Mensual = {rendimiento_pct}%")

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
                        print(f"[FCI Scraper API] ERROR al convertir el rendimiento '{rendimiento_mensual_str}' para '{nombre_app}'. Error: {e}")
                else:
                    print(f"[FCI Scraper API] ADVERTENCIA: No se encontró el rendimiento mensual ('mes') para '{nombre_app}'.")
            else:
                print(f"[FCI Scraper API] ADVERTENCIA: El fondo '{nombre_app}' no tiene una 'ultima_ficha' con datos de rendimiento.")
        else:
            print(f"[FCI Scraper API] ADVERTENCIA: No se encontró la clase de fondo '{nombre_clase_cafci}' en los datos de la API.")
            
    return resultados_fci

def save_to_json(data, filename="fci_data.json"):
    """ Guarda los datos en un archivo JSON. """
    if not data:
        print("[FCI Scraper API] No se encontraron datos de FCI para guardar. No se modificará el archivo JSON.")
        return

    try:
        with open(filename, "w", encoding="utf-8") as f:
            json.dump(data, f, ensure_ascii=False, indent=2)
        print(f"[FCI Scraper API] Datos de FCI guardados exitosamente en: {filename}")
    except Exception as e:
        print(f"[FCI Scraper API] Error al guardar el archivo JSON: {e}")

if __name__ == "__main__":
    api_response_data = fetch_fci_data_from_api()
    if api_response_data:
        datos_fci_actualizados = find_funds_and_extract_performance(api_response_data)
        if datos_fci_actualizados:
            save_to_json(datos_fci_actualizados)
        else:
            print("[FCI Scraper API] No se pudo extraer la información de los fondos de interés.")
    else:
        print("[FCI Scraper API] El scraping de FCI falló.")
