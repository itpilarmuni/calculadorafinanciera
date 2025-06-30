document.addEventListener('DOMContentLoaded', () => {
    // --- Referencias a Elementos del DOM ---
    const montoInput = document.getElementById('monto');
    const diasInput = document.getElementById('dias');
    const calcularBtn = document.getElementById('calcularBtn');
    const resultadosPfBody = document.getElementById('resultadosPf')?.getElementsByTagName('tbody')[0];
    const resultadosFciBody = document.getElementById('resultadosFci')?.getElementsByTagName('tbody')[0];
    const lastUpdatedP = document.getElementById('last-updated');
    const rendimientoChartCanvasElement = document.getElementById('rendimientoChart');
    const interesSimpleFciCheckbox = document.getElementById('interesSimpleFciCheckbox');
    const resumenGananciasDiv = document.getElementById('resumenGananciasChart');
    
    // ***** LÓGICA DE PESTAÑAS *****
    const tabLinks = document.querySelectorAll('.tab-link');
    const tabContents = document.querySelectorAll('.tab-content');

    tabLinks.forEach(link => {
        link.addEventListener('click', () => {
            // Quitar clase 'active' de todos los links y contenidos
            tabLinks.forEach(l => l.classList.remove('active'));
            tabContents.forEach(c => c.classList.remove('active'));

            // Añadir clase 'active' al link clickeado y al contenido correspondiente
            const tabId = link.getAttribute('data-tab');
            const tabContent = document.getElementById(tabId);
            
            link.classList.add('active');
            if (tabContent) {
                tabContent.classList.add('active');
            }
        });
    });
    // ***** FIN DE LÓGICA DE PESTAÑAS *****

    let rendimientoGeneralChartInstance;
    let tasasBancosData = null;
    let fciData = null;

    async function cargarDatos() {
        try {
            const versionCache = new Date().getTime();
            const responseTasas = await fetch('tasas_bancos.json?v=' + versionCache, { cache: 'no-store' });
            if (!responseTasas.ok) throw new Error(`Error cargando tasas_bancos.json`);
            tasasBancosData = await responseTasas.json();
            
            const responseFci = await fetch('fci_data.json?v=' + versionCache, { cache: 'no-store' });
            if (!responseFci.ok) throw new Error(`Error cargando fci_data.json`);
            fciData = await responseFci.json();

            if (tasasBancosData && tasasBancosData.ultima_actualizacion && lastUpdatedP) {
                const fechaActualizacion = new Date(tasasBancosData.ultima_actualizacion);
                lastUpdatedP.textContent = `Tasas actualizadas: ${fechaActualizacion.toLocaleString('es-AR', { dateStyle: 'short', timeStyle: 'short' })}`;
            } else if (lastUpdatedP) {
                lastUpdatedP.textContent = "Datos listos para calcular.";
            }
        } catch (error) {
            console.error("Error en cargarDatos:", error);
            if (lastUpdatedP) lastUpdatedP.textContent = `Error al cargar datos.`;
        }
    }

    function calcularYMostrarResultados() {
        if (!montoInput.value || !diasInput.value) {
            alert("Por favor, ingrese Monto a invertir y Cantidad de días.");
            return;
        }
        if (!tasasBancosData || !fciData) {
            alert("Los datos de tasas o FCI aún no están cargados. Por favor, espere o recargue.");
            return;
        }

        const monto = parseFloat(montoInput.value);
        const dias = parseInt(diasInput.value);

        if (isNaN(monto) || monto <= 0 || isNaN(dias) || dias <= 0) {
            alert("Por favor, ingrese un monto y días válidos y mayores a cero.");
            return;
        }

        if (resultadosPfBody) resultadosPfBody.innerHTML = '';
        if (resultadosFciBody) resultadosFciBody.innerHTML = '';
        if (resumenGananciasDiv) resumenGananciasDiv.innerHTML = '<h4><i class="fas fa-hand-holding-usd"></i> Detalle de Ganancias</h4>';
        
        if (rendimientoGeneralChartInstance) {
            rendimientoGeneralChartInstance.destroy();
        }

        const resultadosCompletos = [];

        // Calcular Plazos Fijos
        if (tasasBancosData.tasas && tasasBancosData.tasas.length > 0) {
            tasasBancosData.tasas.forEach(banco => {
                const tna = parseFloat(banco.tna);
                const interesGanado = monto * (tna / 100 / 365) * dias;
                const capitalMasInteres = monto + interesGanado;
                
                if (resultadosPfBody) {
                    const row = resultadosPfBody.insertRow();
                    row.insertCell().textContent = banco.banco;
                    row.insertCell().textContent = tna.toFixed(2);
                    row.insertCell().textContent = interesGanado.toLocaleString('es-AR', { style: 'currency', currency: 'ARS' });
                    row.insertCell().textContent = capitalMasInteres.toLocaleString('es-AR', { style: 'currency', currency: 'ARS' });
                }
                resultadosCompletos.push({nombre: banco.banco, valorFinal: capitalMasInteres, interesGanado: interesGanado, tipo: 'PF'});
            });
        }

        // Calcular FCI
        const usarInteresSimpleParaFCI = interesSimpleFciCheckbox.checked;
        if (fciData && fciData.length > 0) {
            fciData.forEach(fci => {
                const rendimientoMensualPct = parseFloat(fci.rendimiento_mensual_estimado_pct);
                const rendimientoDiarioDecimal = Math.pow(1 + (rendimientoMensualPct / 100), 1/30) - 1;
                let interesGanado, capitalMasInteres;

                if (usarInteresSimpleParaFCI) {
                    interesGanado = monto * rendimientoDiarioDecimal * dias;
                    capitalMasInteres = monto * (1 + rendimientoDiarioDecimal * dias);
                } else {
                    interesGanado = monto * (Math.pow(1 + rendimientoDiarioDecimal, dias) - 1);
                    capitalMasInteres = monto * Math.pow(1 + rendimientoDiarioDecimal, dias);
                }

                if (resultadosFciBody) {
                    const row = resultadosFciBody.insertRow();
                    const logoCell = row.insertCell();
                    if (fci.logo) {
                        const img = document.createElement('img');
                        img.src = fci.logo; img.alt = fci.nombre;
                        img.onerror = function() { this.style.display='none'; logoCell.textContent = '-'; };
                        logoCell.appendChild(img);
                    } else { logoCell.textContent = '-'; }
                    row.insertCell().textContent = fci.nombre;
                    row.insertCell().textContent = rendimientoMensualPct.toFixed(2);
                    row.insertCell().textContent = interesGanado.toLocaleString('es-AR', { style: 'currency', currency: 'ARS' });
                    row.insertCell().textContent = capitalMasInteres.toLocaleString('es-AR', { style: 'currency', currency: 'ARS' });
                }
                resultadosCompletos.push({nombre: fci.nombre, valorFinal: capitalMasInteres, interesGanado: interesGanado, tipo: 'FCI'});
            });
        }
        
        actualizarGraficoGeneralYResumen(resultadosCompletos, monto);
    }

    function actualizarGraficoGeneralYResumen(resultados, montoBase) {
        if (!rendimientoChartCanvasElement) return;
        const ctxGeneral = rendimientoChartCanvasElement.getContext('2d');
        if (!ctxGeneral) return;

        // Para el gráfico y el resumen general, orden de MAYOR a MENOR
        resultados.sort((a, b) => b.interesGanado - a.interesGanado);

        const labels = resultados.map(r => r.nombre);
        const dataValoresFinales = resultados.map(r => r.valorFinal);
        const backgroundColors = resultados.map(r => r.tipo === 'PF' ? '#36a2eb' : '#2ecc71');
        const borderColors = resultados.map(r => r.tipo === 'PF' ? '#36a2eb' : '#2ecc71');

        rendimientoGeneralChartInstance = new Chart(ctxGeneral, {
            type: 'bar',
            data: {
                labels: labels,
                datasets: [{
                    label: 'Capital + Interés (ARS)',
                    data: dataValoresFinales,
                    backgroundColor: backgroundColors,
                    borderColor: borderColors,
                    borderWidth: 1,
                    borderRadius: 5
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                scales: {
                    y: { beginAtZero: false, min: montoBase * 0.98 },
                    x: { ticks: { font: { family: "'Poppins', sans-serif" } } }
                },
                plugins: {
                    legend: { display: false },
                    tooltip: {
                        callbacks: {
                            label: function(context) {
                                let label = context.dataset.label || '';
                                if (label) label += ': ';
                                if (context.parsed.y !== null) label += new Intl.NumberFormat('es-AR', { style: 'currency', currency: 'ARS' }).format(context.parsed.y);
                                return label;
                            }
                        }
                    }
                }
            }
        });

        if (resumenGananciasDiv) {
            // Usar los mismos datos ordenados de mayor a menor para el resumen
            resultados.forEach(resultado => {
                const p = document.createElement('p');
                const gananciaFormateada = resultado.interesGanado.toLocaleString('es-AR', { style: 'currency', currency: 'ARS' });
                p.innerHTML = `<strong>${resultado.nombre}:</strong> <span style="color: #27ae60;">+ ${gananciaFormateada}</span>`;
                resumenGananciasDiv.appendChild(p);
            });
        }
    }

    // --- EVENT LISTENERS ---
    if (calcularBtn) {
        calcularBtn.addEventListener('click', calcularYMostrarResultados);
    }
    
    // Cargar datos al iniciar la página
    cargarDatos();
});
