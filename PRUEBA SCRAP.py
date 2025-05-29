import requests
from bs4 import BeautifulSoup
# import pandas as pd # Pandas ya no es necesario para la salida JSON simple
from datetime import datetime, timezone # Asegúrate de tener timezone importado
import re
import json
import urllib3 # Para desactivar advertencias de SSL (si usas verify=False)

# URL de la página de plazos fijos del BCRA
URL_BCRA = "https://www.bcra.gob.ar/BCRAyVos/Plazos_fijos_online.asp"

# Selector CSS más específico para la tabla de tasas
TABLE_SELECTOR = "table.table-BCRA" # Actualizado para mayor especificidad

def fetch_data_bcra():
    """
    Obtiene los datos de plazos fijos desde la web del BCRA.
    """
    print(f"Obteniendo datos desde: {URL_BCRA}")
    try:
        # Desactivar advertencias solo si estás usando verify=False
        # Esto es por si el sitio del BCRA tiene problemas de certificado no estándar.
        # En un entorno de producción ideal, verify debería ser True con certificados válidos.
        urllib3.disable_warnings(urllib3.exceptions.InsecureRequestWarning)

        response = requests.get(URL_BCRA, timeout=20, verify=False)
        response.raise_for_status() # Lanza una excepción para errores HTTP (4xx o 5xx)
    except requests.exceptions.SSLError as e:
        print(f"Error SSL específico: {e}")
        print("Esto puede deberse a problemas con los certificados SSL del sitio del BCRA o de tu entorno.")
        print("El script continúa con verify=False, lo cual no es ideal para producción pero puede ser necesario para este sitio.")
        return None
    except requests.exceptions.RequestException as e:
        print(f"Error al obtener la página del BCRA: {e}")
        return None

    print("Página obtenida exitosamente. Procesando datos...")
    soup = BeautifulSoup(response.content, "lxml") # 'lxml' suele ser un parser robusto

    table = soup.select_one(TABLE_SELECTOR)
    if not table:
        print(f"No se encontró la tabla de tasas con el selector '{TABLE_SELECTOR}'. Verifica la estructura de la página.")
        return None

    datos_bancos = []
    # Omitir el encabezado de la tabla (asumiendo que la primera fila es el encabezado)
    for row in table.find_all("tr")[1:]:
        cells = row.find_all("td")
        if len(cells) > 1: # Asegurarse que hay suficientes celdas
            # La primera celda usualmente contiene el nombre del banco
            banco = cells[0].get_text(strip=True)
            if not banco: # Si la primera celda está vacía, podría ser una fila de formato o no un banco
                img_tag = cells[0].find('img')
                if img_tag and img_tag.get('alt'):
                    banco = img_tag.get('alt').strip() # Usar el 'alt' de la imagen si el texto está vacío
                else:
                    continue # Si no hay nombre de banco, saltar esta fila

            tna_valor = None
            # Buscar TNA en las celdas siguientes.
            for i in range(1, len(cells)): # Empezar desde la segunda celda
                potential_tna_text = cells[i].get_text(strip=True)
                if "%" in potential_tna_text:
                    # Limpiar el texto de TNA, quitar espacios extra, reemplazar coma por punto
                    tna_text_cleaned = potential_tna_text.replace("\n", " ").replace("\r", "").strip()
                    # Extraer el número (puede tener decimales con punto o coma)
                    match = re.search(r"(\d+([.,]\d+)?)", tna_text_cleaned)
                    if match:
                        try:
                            tna_valor = float(match.group(1).replace(",", "."))
                            break # TNA encontrada y procesada
                        except ValueError:
                            print(f"No se pudo convertir TNA a número: '{match.group(1)}' para el banco {banco}")
                            tna_valor = None # Asegurar que es None si falla la conversión
            
            if banco and tna_valor is not None:
                # Eliminar "(1)" o leyendas similares del nombre del banco si existen
                banco = re.sub(r'\s*\(\d+\)\s*$', '', banco).strip()
                datos_bancos.append({
                    "banco": banco,
                    "tna": tna_valor
                })
            elif banco and tna_valor is None:
                 print(f"No se encontró TNA válida para el banco: {banco} en la fila: {[c.get_text(strip=True) for c in cells]}")


    if not datos_bancos:
        print("No se pudieron extraer datos de los bancos. La tabla podría estar vacía o la estructura no coincide.")
        return None

    return datos_bancos

def save_to_json(data, filename="tasas_bancos.json"):
    """
    Guarda los datos en un archivo JSON.
    """
    if data is None:
        print("No hay datos para guardar en JSON.")
        # Guardamos una estructura válida pero vacía si data es None
        output = {
            "ultima_actualizacion": datetime.now(timezone.utc).isoformat(),
            "tasas": []
        }
    else:
        output = {
            "ultima_actualizacion": datetime.now(timezone.utc).isoformat(),
            "tasas": data # 'data' ya es la lista de tasas (potencialmente limitada)
        }

    try:
        with open(filename, "w", encoding="utf-8") as f:
            json.dump(output, f, ensure_ascii=False, indent=4)
        print(f"Datos guardados exitosamente en: {filename}")
    except Exception as e:
        print(f"Error al guardar el archivo JSON: {e}")

if __name__ == "__main__":
    tasas_completas = fetch_data_bcra() # Obtenemos todas las tasas

    if tasas_completas:
        # Limitar la lista a los primeros 5 bancos ANTES de guardar
        tasas_limitadas = tasas_completas[:5] 
        save_to_json(tasas_limitadas)
    else:
        # Si fetch_data_bcra() devuelve None (error en scraping), 
        # save_to_json se encargará de guardar un JSON con una lista de tasas vacía.
        save_to_json(None) 
        print("El scraping falló o no se encontraron datos. Se generó un archivo 'tasas_bancos.json' con lista de tasas vacía.")