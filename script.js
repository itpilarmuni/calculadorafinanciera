// formatea miles: "12345" → "12.345"
function formatMiles(str) {
  let s = str.replace(/\D/g,'');
  return s.replace(/\B(?=(\d{3})+(?!\d))/g,'.');
}

// ———————————————————
//  Plazo Fijo
// ———————————————————
const pfMonto = document.getElementById('pf-monto');
const pfDias  = document.getElementById('pf-dias');
const pfTasa  = document.getElementById('pf-tasa');
const pfInter = document.getElementById('pf-interes');
const pfTot   = document.getElementById('pf-total');

pfMonto.addEventListener('input', e => {
  e.target.value = formatMiles(e.target.value);
  calcPF();
});
pfDias.addEventListener('input', calcPF);
pfTasa.addEventListener('input', e => {
  e.target.value = e.target.value.replace(/[^0-9,]/g,'').replace(',','.');
  calcPF();
});

function calcPF() {
  const monto = Number(pfMonto.value.replace(/\./g,'')) || 0;
  const dias  = Number(pfDias.value) || 0;
  const tasa  = Number(pfTasa.value) || 0;
  const interes = monto * (tasa/100) * (dias/365);
  const total   = monto + interes;
  pfInter.textContent = interes.toFixed(2);
  pfTot.textContent   = total.toFixed(2);
}

// ———————————————————
//  FCI
// ———————————————————
const fciMonto = document.getElementById('fci-monto');
const fciVar   = document.getElementById('fci-var');
const fciVal   = document.getElementById('fci-valor');
let fciData;

fciMonto.addEventListener('input', e => {
  e.target.value = formatMiles(e.target.value);
  calcFCI();
});

// cargo JSON generado por scraper
fetch('fci_data.json')
  .then(r=>r.json())
  .then(j=> {
    fciData = j;
    fciVar.textContent = j.variacion.toFixed(2) + '%';
    drawChart(j.historial);
  });

// calcula valor estimado hoy en base a variación
function calcFCI() {
  if(!fciData) return;
  const imp = Number(fciMonto.value.replace(/\./g,'')) || 0;
  const val = imp * (1 + fciData.variacion/100);
  fciVal.textContent = val.toFixed(2);
}

// dibujo gráfico mensual con Chart.js
function drawChart(hist) {
  const hoy = new Date(), primerDia = new Date(hoy.getFullYear(), hoy.getMonth(),1);
  const mes = hist.filter(d=> new Date(d.Fecha)>=primerDia );
  const labels = mes.map(d=>d.Fecha);
  const data   = mes.map((d,i,a)=> i===0?0: ( (d['Valor Cuota Parte']-a[i-1]['Valor Cuota Parte'])/a[i-1]['Valor Cuota Parte'] )*100 );
  new Chart(document.getElementById('fci-chart'), {
    type:'line',
    data:{ labels, datasets:[{ label:'% Var diaria', data, fill:false, borderWidth:2, pointRadius:3 }]},
    options:{ scales:{ y:{ ticks:{ callback:v=>v.toFixed(2)+'%' } }}}
  });
}
