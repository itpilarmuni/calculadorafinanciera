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
    
    // --- LÓGICA DE PESTAÑAS ---
    const tabLinks = document.querySelectorAll('.tab-link');
    const tabContents = document.querySelectorAll('.tab-content');

    tabLinks.forEach(link => {
        link.addEventListener('click', () => {
            tabLinks.forEach(l => l.classList.remove('active'));
            tabContents.forEach(c => c.classList.remove('active'));

            const tabId = link.getAttribute('data-tab');
            const tabContent = document.getElementById(tabId);
            
            link.classList.add('active');
            if (tabContent) {
                tabContent.classList.add('active');
            }
        });
    });

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

        const resultadosPF = [];
        const resultadosFCI = [];

        // Calcular Plazos Fijos y guardar en array temporal
        if (tasasBancosData.tasas && tasasBancosData.tasas.length > 0) {
            tasasBancosData.tasas.forEach(banco => {
                const tna = parseFloat(banco.tna);
                const interesGanado = monto * (tna / 100 / 365) * dias;
                const capitalMasInteres = monto + interesGanado;
                
                resultadosPF.push({
                    nombre: banco.banco, tna: tna,
                    interesGanado: interesGanado, capitalMasInteres: capitalMasInteres, tipo: 'PF'
                });
            });
        }

        // Calcular FCI y guardar en array temporal
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
                
                resultadosFCI.push({
                    nombre: fci.nombre, logo: fci.logo, rendimientoMensualPct: rendimientoMensualPct,
                    interesGanado: interesGanado, capitalMasInteres: capitalMasInteres, tipo: 'FCI'
                });
            });
        }
        
        // ===== CAMBIO: Ordenar resultados para las tablas de MENOR a MAYOR ganancia =====
        resultadosPF.sort((a, b) => a.interesGanado - b.interesGanado);
        resultadosFCI.sort((a, b) => a.interesGanado - b.interesGanado);

        // Poblar las tablas con los datos ya ordenados
        resultadosPF.forEach(res => {
            if (resultadosPfBody) {
                const row = resultadosPfBody.insertRow();
                row.insertCell().textContent = res.nombre;
                row.insertCell().textContent = res.tna.toFixed(2);
                row.insertCell().textContent = res.interesGanado.toLocaleString('es-AR', { style: 'currency', currency: 'ARS' });
                row.insertCell().textContent = res.capitalMasInteres.toLocaleString('es-AR', { style: 'currency', currency: 'ARS' });
            }
        });

        resultadosFCI.forEach(res => {
            if (resultadosFciBody) {
                const row = resultadosFciBody.insertRow();
                const logoCell = row.insertCell();
                if (res.logo) {
                    const img = document.createElement('img');
                    img.src = res.logo; img.alt = res.nombre;
                    img.onerror = function() { this.style.display='none'; logoCell.textContent = '-'; };
                    logoCell.appendChild(img);
                } else { logoCell.textContent = '-'; }
                row.insertCell().textContent = res.nombre;
                row.insertCell().textContent = res.rendimientoMensualPct.toFixed(2);
                row.insertCell().textContent = res.interesGanado.toLocaleString('es-AR', { style: 'currency', currency: 'ARS' });
                row.insertCell().textContent = res.capitalMasInteres.toLocaleString('es-AR', { style: 'currency', currency: 'ARS' });
            }
        });
        
        // Unir todos los resultados para el gráfico y el resumen general
        const resultadosCompletos = [...resultadosPF, ...resultadosFCI];
        actualizarGraficoGeneralYResumen(resultadosCompletos, monto);
    }
    
    function actualizarGraficoGeneralYResumen(resultados, montoBase) {
        if (!rendimientoChartCanvasElement) return;
        const ctxGeneral = rendimientoChartCanvasElement.getContext('2d');
        if (!ctxGeneral) return;

        // Para el gráfico y el resumen, los mantenemos ordenados de MAYOR a MENOR
        resultados.sort((a, b) => b.interesGanado - a.interesGanado);

        const labels = resultados.map(r => r.nombre);
        const dataValoresFinales = resultados.map(r => r.valorFinal);
        const backgroundColors = resultados.map(r => r.tipo === 'PF' ? '#36a2eb' : '#2ecc71');
        const borderColors = resultados.map(r => r.tipo === 'PF' ? '#36a2eb' : '#2ecc71');
        
        if (rendimientoGeneralChartInstance) {
            rendimientoGeneralChartInstance.destroy();
        }

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
    if (interesSimpleFciCheckbox) {
        interesSimpleFciCheckbox.addEventListener('change', calcularYMostrarResultados);
    }
    
    // Cargar datos al iniciar la página
    cargarDatos();
});
