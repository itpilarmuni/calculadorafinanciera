// --- Separador de miles en el input ---
const montoInput = document.getElementById('monto');
montoInput.addEventListener('input', e => {
  let digits = e.target.value.replace(/\D/g, '');
  e.target.value = digits.replace(/\B(?=(\d{3})+(?!\d))/g, '.');
});

// Variables globales para FCI
let fciData = null;

// Cargo el JSON generado por el scraper
fetch('fci_data.json')
  .then(r => r.json())
  .then(json => {
    fciData = json;
    // Muestro variación de los últimos dos días
    const elmVar = document.getElementById('variacion-fci');
    elmVar.textContent = json.variacion.toFixed(2) + '%';

    // Una vez cargados los datos, dibujo el gráfico
    drawFciChart(json.historial);
  })
  .catch(err => console.error('Error cargando fci_data.json:', err));

// Cuando cambia el monto, recalculo el valor estimado de hoy
montoInput.addEventListener('input', () => {
  if (!fciData) return;
  const importe = Number(montoInput.value.replace(/\./g, '')) || 0;
  const valorHoy = importe * (1 + fciData.variacion / 100);
  document.getElementById('resultado-fci').textContent =
    valorHoy.toFixed(2);
});

// Función para dibujar el gráfico de variación diaria en el mes actual
function drawFciChart(historial) {
  const hoy = new Date();
  const primerDia = new Date(hoy.getFullYear(), hoy.getMonth(), 1);
  // Filtrado de datos desde el primer día del mes
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
        y: {
          ticks: { callback: v => v.toFixed(2) + '%' }
        }
      }
    }
  });
}

