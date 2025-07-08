document.addEventListener('DOMContentLoaded', () => {
  // Pestañas (sin cambios)
  const tabLinks = document.querySelectorAll('.tab-link');
  const tabContents = document.querySelectorAll('.tab-content');
  tabLinks.forEach(link => {
    link.addEventListener('click', () => {
      tabLinks.forEach(l => l.classList.remove('active'));
      tabContents.forEach(c => c.classList.remove('active'));
      link.classList.add('active');
      document.getElementById(link.dataset.tab).classList.add('active');
    });
  });
  document.querySelector('.tab-link.active').click();

  // Referencias
  const montoInput = document.getElementById('monto');
  const diasInput = document.getElementById('dias');
  const calcularBtn = document.getElementById('calcularBtn');
  const lastUpdatedP = document.getElementById('last-updated');
  let tasasBancosData = null;
  let fciData = null;

  // Formateo miles
  function formatMiles(str) {
    let digits = str.replace(/\D/g, '');
    return digits.replace(/\B(?=(\d{3})+(?!\d))/g, '.');
  }

  // Carga de datos JSON
  async function cargarDatos() {
    try {
      const cacheBuster = new Date().getTime();
      const opt = { cache: 'no-store' };
      // Tasas Bancos
      const respT = await fetch(`tasas_bancos.json?cb=${cacheBuster}`, opt);
      tasasBancosData = await respT.json();
      // FCI
      const respF = await fetch(`fci_data.json?cb=${cacheBuster}`, opt);
      fciData = await respF.json();
      lastUpdatedP.textContent = 'Datos listos para calcular.';
      // Inicializa FCI: var y gráfico
      document.getElementById('fci-var').textContent =
        fciData.variacion.toFixed(2) + '%';
      drawFCIChart(fciData.historial);
    } catch (e) {
      console.error('Error al cargar datos:', e);
      lastUpdatedP.textContent = 'Error al cargar datos.';
    }
  }

  // Cálculo Plazo Fijo (sin cambios en estructura, usando tasasBancosData)
  function calcularPlazosFijos(monto, dias) {
    return tasasBancosData.tasas.map(b => {
      const tna = parseFloat(b.tna);
      const interes = monto * (tna/100/365) * dias;
      return { banco: b.banco, tna, interes, total: monto + interes };
    }).sort((a,b) => a.total - b.total);
  }

  // Cálculo FCI: muestra valor estimado hoy
  function calcFCIValue() {
    const imp = parseFloat(montoInput.value.replace(/\./g, '')) || 0;
    const valHoy = imp * (1 + fciData.variacion/100);
    document.getElementById('fci-valor').textContent = valHoy.toFixed(2);
  }

  // Dibuja gráfico mensual de variaciones
  function drawFCIChart(hist) {
    const hoy = new Date();
    const primerDia = new Date(hoy.getFullYear(), hoy.getMonth(), 1);
    const dataMes = hist.filter(d => new Date(d.Fecha) >= primerDia);
    const labels = dataMes.map(d => d.Fecha);
    const cambios = dataMes.map((d,i,arr) =>
      i === 0 ? 0 : (d['Valor Cuota Parte'] - arr[i-1]['Valor Cuota Parte'])
        / arr[i-1]['Valor Cuota Parte'] * 100
    );
    new Chart(document.getElementById('fci-chart'), {
      type: 'line',
      data: { labels, datasets: [{
        label: 'Variación diaria (%)',
        data: cambios, fill: false, borderWidth: 2, pointRadius: 3
      }] },
      options: { scales: { y: { ticks: { callback: v => v.toFixed(2) + '%' } } } }
    });
  }

  // Eventos
  montoInput.addEventListener('input', e => {
    e.target.value = formatMiles(e.target.value);
    calcFCIValue();
  });
  diasInput.addEventListener('input', () => {});  // no cambia FCI
  calcularBtn.addEventListener('click', () => {
    if (!montoInput.value || !diasInput.value) {
      alert('Ingrese monto y días válidos.');
      return;
    }
    const monto = parseFloat(montoInput.value.replace(/\./g, ''));
    const dias = parseInt(diasInput.value);
    // Calcula PF
    const pfRes = calcularPlazosFijos(monto, dias);
    const pfBody = document.getElementById('resultadosPf').getElementsByTagName('tbody')[0];
    pfBody.innerHTML = '';
    pfRes.forEach(r => {
      const row = pfBody.insertRow();
      row.insertCell().textContent = r.banco;
      row.insertCell().textContent = r.tna.toFixed(2);
      row.insertCell().textContent = r.interes.toLocaleString('es-AR', { style: 'currency', currency: 'ARS' });
      row.insertCell().textContent = r.total.toLocaleString('es-AR', { style: 'currency', currency: 'ARS' });
    });
    // Actualiza FCI
    calcFCIValue();
  });

  // Inicial
  cargarDatos();
});
