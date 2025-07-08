// —————————————————————
//  Manejo de pestañas (igual que siempre)
// —————————————————————
document.querySelectorAll('nav ul li a').forEach(a => {
  a.addEventListener('click', e => {
    e.preventDefault();
    const target = a.getAttribute('href').slice(1);
    document.querySelectorAll('.tab-content').forEach(s => s.classList.remove('active'));
    document.getElementById(target).classList.add('active');
  });
});
// Activa la primera pestaña al cargar
document.querySelector('nav ul li a').click();


// —————————————————————
//  Funciones auxiliares
// —————————————————————
function formatMiles(str) {
  let s = str.replace(/\D/g,'');
  return s.replace(/\B(?=(\d{3})+(?!\d))/g,'.');
}


// —————————————————————
//  Cálculo Plazo Fijo (igual a tu lógica, usando tasas_bancos.json)
// —————————————————————
const pfMonto = document.getElementById('pf-monto');
const pfDias  = document.getElementById('pf-dias');
const pfTasa  = document.getElementById('pf-tasa');
const pfInter = document.getElementById('pf-interes');
const pfTot   = document.getElementById('pf-total');

let tasasBancos = [];
fetch('tasas_bancos.json')
  .then(r=>r.json())
  .then(json=> {
    tasasBancos = json;
    // Si quieres preseleccionar la primera:
    pfTasa.value = tasasBancos[0].tasa.toString().replace('.',',');
    calcPF();
  });

pfMonto.addEventListener('input',e=>{
  e.target.value = formatMiles(e.target.value);
  calcPF();
});
pfDias.addEventListener('input', calcPF);
pfTasa.addEventListener('input', e=>{
  e.target.value = e.target.value.replace(/[^0-9,]/g,'').replace(',', '.');
  calcPF();
});

function calcPF(){
  const monto = Number(pfMonto.value.replace(/\./g,''))||0;
  const dias  = Number(pfDias.value)||0;
  const tasa  = Number(pfTasa.value.replace(',','.'))||0;
  const interes = monto*(tasa/100)*(dias/365);
  pfInter.textContent = interes.toFixed(2);
  pfTot.textContent   = (monto+interes).toFixed(2);
}


// —————————————————————
//  Cálculo FCI + Gráfico
// —————————————————————
const fciMonto = document.getElementById('fci-monto');
const fciVar   = document.getElementById('fci-var');
const fciVal   = document.getElementById('fci-valor');
let fciData;

fciMonto.addEventListener('input', e=>{
  e.target.value = formatMiles(e.target.value);
  calcFCI();
});

fetch('fci_data.json')
  .then(r=>r.json())
  .then(j=>{
    fciData = j;
    fciVar.textContent = j.variacion.toFixed(2) + '%';
    drawFCIChart(j.historial);
  });

function calcFCI(){
  if(!fciData) return;
  const imp = Number(fciMonto.value.replace(/\./g,''))||0;
  const val = imp*(1 + fciData.variacion/100);
  fciVal.textContent = val.toFixed(2);
}

function drawFCIChart(hist){
  const hoy = new Date(), primer = new Date(hoy.getFullYear(),hoy.getMonth(),1);
  const mes = hist.filter(d=> new Date(d.Fecha) >= primer);
  const labels = mes.map(d=>d.Fecha);
  const data   = mes.map((d,i,a)=> i===0?0: ((d['Valor Cuota Parte']-a[i-1]['Valor Cuota Parte'])/a[i-1]['Valor Cuota Parte'])*100 );
  new Chart(document.getElementById('fci-chart'),{
    type:'line',
    data:{labels, datasets:[{label:'% var diaria', data, fill:false, borderWidth:2, pointRadius:3}]},
    options:{scales:{y:{ticks:{callback:v=>v.toFixed(2)+'%'}}}}
  });
}

