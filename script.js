// ———————————————————
//  Cálculo de Plazo Fijo
// ———————————————————
const pfMontoInput = document.getElementById('pf-monto');
const pfDiasInput = document.getElementById('pf-dias');
const pfTasaInput = document.getElementById('pf-tasa');
const pfResultado = document.getElementById('pf-resultado');
const pfTotal = document.getElementById('pf-total');

// Función para formatear miles
function formatThousands(str) {
  let digits = str.replace(/\D/g, '');
  return digits.replace(/\B(?=(\d{3})+(?!\d))/g, '.');
}

// Aplica formateo cada vez que escribas monto
pfMontoInput.addEventListener('input', e => {
  e.target.value = formatThousands(e.target.value);
  calcPlazoFijo();
});

// También formatea la tasa (opcional)
pfTasaInput.addEventListener('input', e => {
  // cambia coma decimal por punto internamente
  e.target.value = e.target.value.replace(/[^0-9,]/g, '').replace(',', '.');
  calcPlazoFijo();
});

// Cuando cambies días o tasa, recalcula
pfDiasInput.addEventListener('input', calcPlazoFijo);

function calcPlazoFijo() {
  const monto = Number(pfMontoInput.value.replace(/\./g, '')) || 0;
  const dias = Number(pfDiasInput.value) || 0;
  const tasa = Number(pfTasaInput.value) || 0;

  // Fórmula: interés = monto * tasa_anual/100 * (días/365)
  const interes = monto * (tasa / 100) * (dias / 365);
  const total = monto + interes;

  pfResultado.textContent = interes.toFixed(2);
  pfTotal.textContent = total.toFixed(2);
}

// ———————————————————
//  Cálculo de FCI y Gráfico
// ———————————————————
const montoInput = document.getElementById('monto');
const variacionElm = document.getElementById('variacion-fci');
const resultadoFciElm = document.getElementById('resultado-fci');
let fciData = null;

// Separador de miles en input FCI
montoInput.addEventListener('input', e => {
  e.target.value = formatThousands(e.target.value);
  calcFciValue();
});

// Cargo el JSON con datos de FCI
fetch('fci_data.json')
  .then(r => r.json())
  .then(json => {
    fciData = json;
    variacionElm.textContent = json.variacion.toFixed(2) + '%';
    drawFciChart(json.historial);
  })
  .catch(err => console.error('Error cargando fci_data.json:', err));

// Recalcula el valor estimado
function calcFciValue() {
  if (!fciData) return;
  const importe = Number(montoInput.value.replace(/\./g, '')) || 0;
  const valorHoy = importe * (1 + fciData.variacion / 100);
  resultadoFciElm.textContent = valorHoy.toFixed(2);
}

// Dibuja gráfico de variación diaria del mes actual
function drawFciChart(historial) {
  const hoy = new Date();
  const primerDia = new Date(hoy.getFullYear(), hoy.getMonth(), 1);
  const dataMes = historial.filter(item =>
    new Date(item.Fecha) >= primerDia
  );

  const labels = dataMes.map(d => d.Fecha);
  const cambios = dataMes.map((d, i, arr) => {
    if (i === 0) return 0;
    const prev = arr[i - 1]['Valor Cuota Parte'];
    return ((d['Valor Cuota Parte'] - prev) / prev) * 100;
  });

  new Chart(document.getElementById('chartFci'), {
    type: 'line',
    data: {
      labels,
      datasets: [{
        label: 'Variación diaria (%)',
        data: cambios,
        fill: false,
        borderWidth: 2,
        pointRadius: 3
      }]
    },
    options: {
      responsive: true,
      scales: {
        y: { ticks: { callback: v => v.toFixed(2) + '%' } }
      }
    }
  });
}

