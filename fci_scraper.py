#!/usr/bin/env python3
import requests, json
from bs4 import BeautifulSoup
import pandas as pd, sys

def main():
    url = 'https://www.provinciafondos.com.ar/valorCuotaParte.php?id=1'
    resp = requests.get(url, headers={'User-Agent':'Mozilla/5.0'})
    resp.raise_for_status()
    soup = BeautifulSoup(resp.text, 'lxml')
    tbl = soup.find('table', id='listValorCuotaParte')
    if not tbl: sys.exit("❌ Tabla no encontrada")

    # Encuentra índice de "Valor Cuota Parte"
    headers = [th.get_text(strip=True) for th in tbl.find('thead').find_all('th')]
    try: idx = headers.index('Valor Cuota Parte')
    except: sys.exit(f"❌ No hallo 'Valor Cuota Parte' en {headers}")

    rows=[]
    for tr in tbl.find('tbody').find_all('tr'):
        tds = tr.find_all('td')
        fe = pd.to_datetime(tds[0].get_text(strip=True), dayfirst=True, errors='coerce')
        if pd.isna(fe): continue
        vs = tds[idx].get_text(strip=True).replace('.','').replace(',','.')
        try: va = float(vs)
        except: continue
        rows.append({'Fecha':fe,'Valor Cuota Parte':va})

    df = pd.DataFrame(rows).sort_values('Fecha').reset_index(drop=True)
    if len(df)<2: sys.exit("❌ No hay 2 valores")
    u = df.tail(2).reset_index(drop=True)
    v0,v1 = u.loc[0,'Valor Cuota Parte'], u.loc[1,'Valor Cuota Parte']
    var = (v1-v0)/v0*100

    payload={
      "historial":[{"Fecha":d.strftime('%Y-%m-%d'),
                    "Valor Cuota Parte":float(v)}
                   for d,v in zip(df['Fecha'], df['Valor Cuota Parte'])],
      "variacion":round(var,4)
    }
    with open('fci_data.json','w',encoding='utf-8') as f:
      json.dump(payload,f,ensure_ascii=False,indent=2)
    print("✅ fci_data.json OK")

if __name__=='__main__':
    main()

