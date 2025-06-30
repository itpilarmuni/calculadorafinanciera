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
    const simulacionDetalladaPfDiv = document.getElementById('simulacionDetalladaPf');
    let rendimientoGeneralChartInstance;
    let graficosBancosInstancias = {};

    const plazosFijosFijos = [30, 60, 90, 180, 365];
    let tasasBancosData = null;
    let fciData = null;

    // Lógica de Pestañas
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

    async function cargarDatos() {
        try {
            const versionCache = new Date().getTime();
            const responseTasas = await fetch('tasas_bancos.json?v=' + versionCache, { cache: 'no-store' });
            if (!responseTasas.ok) throw new Error(`Error al cargar tasas_bancos.json`);
            tasasBancosData = await responseTasas.json();
            
            const responseFci = await fetch('fci_data.json?v=' + versionCache, { cache: 'no-store' });
            if (!responseFci.ok) throw new Error(`Error al cargar fci_data.json`);
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
            alert("Los datos aún no están cargados. Por favor, espere.");
            return;
        }

        const monto = parseFloat(montoInput.value);
        const dias = parseInt(diasInput.value);

        if (isNaN(monto) || monto <= 0 || isNaN(dias) || dias <= 0) {
            alert("Por favor, ingrese un monto y días válidos y mayores a cero.");
            return;
        }

        if(resultadosPfBody) resultadosPfBody.innerHTML = '';
        if(resultadosFciBody) resultadosFciBody.innerHTML = '';
        if(resumenGananciasDiv) resumenGananciasDiv.innerHTML = '<h3>Detalle de Ganancias (para Plazo Seleccionado):</h3>';
        if(simulacionDetalladaPfDiv) simulacionDetalladaPfDiv.innerHTML = '<h2>Simulación Detallada de Plazos Fijos por Banco y Plazo</h2>';
        
        Object.values(graficosBancosInstancias).forEach(chart => { if(chart && typeof chart.destroy === 'function') chart.destroy(); });
        graficosBancosInstancias = {};
        if (rendimientoGeneralChartInstance && typeof rendimientoGeneralChartInstance.destroy === 'function') {
            rendimientoGeneralChartInstance.destroy();
        }

        const resultadosCompletosParaGraficoGeneral = [];

        if (tasasBancosData.tasas && tasasBancosData.tasas.length > 0) {
            tasasBancosData.tasas.forEach((banco, index) => {
                const tna = parseFloat(banco.tna);
                const interesGanado = monto * (tna / 100 / 365) * dias;
                const capitalMasInteres = monto + interesGanado;
                
                const row = resultadosPfBody.insertRow();
                row.insertCell().textContent = banco.banco;
                row.insertCell().textContent = tna.toFixed(2);
                row.insertCell().textContent = interesGanado.toLocaleString('es-AR', { style: 'currency', currency: 'ARS' });
                row.insertCell().textContent = capitalMasInteres.toLocaleString('es-AR', { style: 'currency', currency: 'ARS' });
                resultadosCompletosParaGraficoGeneral.push({nombre: banco.banco, valorFinal: capitalMasInteres, interesGanado: interesGanado, tipo: 'PF'});
                
                generarSimulacionPorBanco(banco, monto, index);
            });
        }
        
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
                const row = resultadosFciBody.insertRow();
                const logoCell = row.insertCell();
                if (fci.logo) {
                    const img = document.createElement('img');
                    img.src = fci.logo; img.alt = fci.nombre; img.style.maxWidth = '30px'; img.style.verticalAlign = 'middle';
                    img.onerror = function() { this.style.display='none'; logoCell.textContent = '-';};
                    logoCell.appendChild(img);
                } else { logoCell.textContent = '-'; }
                row.insertCell().textContent = fci.nombre;
                row.insertCell().textContent = rendimientoMensualPct.toFixed(2);
                row.insertCell().textContent = interesGanado.toLocaleString('es-AR', { style: 'currency', currency: 'ARS' });
                row.insertCell().textContent = capitalMasInteres.toLocaleString('es-AR', { style: 'currency', currency: 'ARS' });
                resultadosCompletosParaGraficoGeneral.push({nombre: fci.nombre, valorFinal: capitalMasInteres, interesGanado: interesGanado, tipo: 'FCI'});
            });
        }
        
        actualizarGraficoGeneralYResumen(resultadosCompletosParaGraficoGeneral, monto);
    }

    function generarSimulacionPorBanco(banco, montoInicial, bancoIndex) {
        if (!simulacionDetalladaPfDiv) return;

        const tnaBanco = parseFloat(banco.tna);
        const resultadosPorPlazo = [];
        plazosFijosFijos.forEach(plazoDias => {
            const interes = montoInicial * (tnaBanco / 100 / 365) * plazoDias;
            resultadosPorPlazo.push({
                plazo: plazoDias,
                interesGanado: interes,
                capitalMasInteres: montoInicial + interes
            });
        });

        let filasTablaHTML = '';
        resultadosPorPlazo.forEach(res => {
            filasTablaHTML += `
                <tr>
                    <td>${res.plazo}</td>
                    <td>${res.interesGanado.toLocaleString('es-AR', { style: 'currency', currency: 'ARS' })}</td>
                    <td>${res.capitalMasInteres.toLocaleString('es-AR', { style: 'currency', currency: 'ARS' })}</td>
                </tr>
            `;
        });

        const canvasId = `chartBanco_${bancoIndex}`;
        const bancoHTML = `
            <div class="banco-simulacion-container">
                <h3>${banco.banco} (TNA: ${tnaBanco.toFixed(2)}%)</h3>
                <div class="simulacion-layout">
                    <div class="simulacion-tabla-container">
                        <table>
                            <thead>
                                <tr>
                                    <th>Plazo (días)</th>
                                    <th>Interés Ganado (ARS)</th>
                                    <th>Capital + Interés (ARS)</th>
                                </tr>
                            </thead>
                            <tbody>
                                ${filasTablaHTML}
                            </tbody>
                        </table>
                    </div>
                    <div class="simulacion-grafico-container">
                        <canvas id="${canvasId}"></canvas>
                    </div>
                </div>
            </div>
        `;
        
        simulacionDetalladaPfDiv.insertAdjacentHTML('beforeend', bancoHTML);
        
        setTimeout(() => {
            renderizarGraficoBanco(canvasId, resultadosPorPlazo, montoInicial);
        }, 0);
    }

    function renderizarGraficoBanco(canvasId, data, montoBase) {
        const canvasElement = document.getElementById(canvasId);
        if (!canvasElement) { console.error(`[RGB] Canvas con ID ${canvasId} no encontrado.`); return; }
        const ctxBanco = canvasElement.getContext('2d');
        if (!ctxBanco) { console.error(`[RGB] Contexto 2D no obtenido para ${canvasId}.`); return; }
        
        const labels = data.map(item => `${item.plazo} días`);
        const valoresFinales = data.map(item => item.capitalMasInteres);

        if (graficosBancosInstancias[canvasId] && typeof graficosBancosInstancias[canvasId].destroy === 'function') {
            graficosBancosInstancias[canvasId].destroy();
        }

        graficosBancosInstancias[canvasId] = new Chart(ctxBanco, {
            type: 'bar',
            data: { labels: labels, datasets: [{ label: 'Monto Final (ARS)', data: valoresFinales, backgroundColor: 'rgba(255, 159, 64, 0.7)', borderColor: 'rgba(255, 159, 64, 1)', borderWidth: 1 }] },
            options: { 
                responsive: true, maintainAspectRatio: false,
                scales: {
                    y: { beginAtZero: false, min: montoBase * 0.99, title: { display: true, text: 'Monto Final (ARS)' }, ticks: { callback: function(value) { return value.toLocaleString('es-AR', { style: 'currency', currency: 'ARS', minimumFractionDigits:0 }); } } },
                    x: { title: { display: true, text: 'Plazo' } }
                },
                plugins: {
                    title: { display: false }, legend: { display: false },
                    tooltip: {
                        callbacks: {
                            label: function(context) {
                                let label = context.dataset.label || '';
                                if (label) { label += ': '; }
                                if (context.parsed.y !== null) label += new Intl.NumberFormat('es-AR', { style: 'currency', currency: 'ARS' }).format(context.parsed.y);
                                const currentItemData = data[context.dataIndex];
                                if (currentItemData) label += ` (Ganancia: ${new Intl.NumberFormat('es-AR', { style: 'currency', currency: 'ARS' }).format(currentItemData.interesGanado)})`;
                                return label;
                            }
                        }
                    }
                }
            }
        });
    }

    // ***** FUNCIÓN MODIFICADA CON LOGS DE DEPURACIÓN *****
    function actualizarGraficoGeneralYResumen(resultados, montoBase) {
        console.log("[AGGR] Iniciando actualización de gráfico general. Resultados recibidos:", resultados.length); // DEBUG
        console.log("[AGGR] Contenido de 'resultados':", resultados); // DEBUG

        if (!rendimientoChartCanvasElement) { console.error("[AGGR] Elemento canvas para gráfico general no encontrado."); return; }
        const ctxGeneral = rendimientoChartCanvasElement.getContext('2d');
        if (!ctxGeneral) { console.error("[AGGR] Contexto para el gráfico general no encontrado."); return; }

        if (rendimientoGeneralChartInstance && typeof rendimientoGeneralChartInstance.destroy === 'function') {
            rendimientoGeneralChartInstance.destroy();
        }

        resultados.sort((a, b) => b.valorFinal - a.valorFinal);

        const labels = resultados.map(r => r.nombre);
        const dataValoresFinales = resultados.map(r => r.valorFinal);
        
        console.log("[AGGR] 'labels' para el gráfico:", labels); // DEBUG
        console.log("[AGGR] 'data' para el gráfico:", dataValoresFinales); // DEBUG
        
        if (labels.length === 0 || dataValoresFinales.length === 0) {
            console.warn("[AGGR] Los datos para el gráfico están vacíos. No se renderizará el gráfico.");
            return; // No intentar renderizar un gráfico sin datos
        }

        const backgroundColors = resultados.map(r => r.tipo === 'PF' ? 'rgba(54, 162, 235, 0.7)' : 'rgba(75, 192, 192, 0.7)');
        const borderColors = resultados.map(r => r.tipo === 'PF' ? 'rgba(54, 162, 235, 1)' : 'rgba(75, 192, 192, 1)');

        rendimientoGeneralChartInstance = new Chart(ctxGeneral, {
            type: 'bar',
            data: { 
                labels: labels, 
                datasets: [{ 
                    label: 'Capital + Interés (ARS)', 
                    data: dataValoresFinales, 
                    backgroundColor: backgroundColors, 
                    borderColor: borderColors, 
                    borderWidth: 1 
                }] 
            },
            options: { 
                responsive: true, maintainAspectRatio: true,
                scales: {
                    y: { beginAtZero: false, min: montoBase * 0.98, title: { display: true, text: 'Monto Final (ARS)' }, ticks: { callback: function(value) { return value.toLocaleString('es-AR', { style: 'currency', currency: 'ARS', minimumFractionDigits:0 }); } } },
                    x: { title: { display: true, text: 'Instrumento Financiero' } }
                },
                plugins: {
                    legend: { display: false },
                    tooltip: {
                        callbacks: {
                            label: function(context) {
                                let label = context.dataset.label || '';
                                if (label) { label += ': '; }
                                if (context.parsed.y !== null) label += new Intl.NumberFormat('es-AR', { style: 'currency', currency: 'ARS' }).format(context.parsed.y);
                                const item = resultados[context.dataIndex];
                                label += ` (Ganancia: ${new Intl.NumberFormat('es-AR', { style: 'currency', currency: 'ARS' }).format(item.interesGanado)})`;
                                if (item.tipo === 'PF') {
                                    const bancoData = tasasBancosData.tasas.find(b => b.banco === item.nombre);
                                    if(bancoData) label += ` (TNA: ${bancoData.tna.toFixed(2)}%)`;
                                } else if (item.tipo === 'FCI') {
                                    const fciItem = fciData.find(f => f.nombre === item.nombre);
                                    if(fciItem) label += ` (Rend. Mensual Est.: ${fciItem.rendimiento_mensual_estimado_pct.toFixed(2)}%)`;
                                }
                                return label;
                            }
                        }
                    }
                }
            }
        });
        console.log("[AGGR] Gráfico general renderizado.");

        if (resumenGananciasDiv) {
            resumenGananciasDiv.innerHTML = '<h3>Detalle de Ganancias (para Plazo Seleccionado):</h3>';
            resultados.forEach(resultado => {
                const p = document.createElement('p');
                const gananciaFormateada = resultado.interesGanado.toLocaleString('es-AR', { style: 'currency', currency: 'ARS' });
                p.textContent = `${resultado.nombre} - Total Ganado: ${gananciaFormateada}`;
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
        
    cargarDatos();
});
