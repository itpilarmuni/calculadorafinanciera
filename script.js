document.addEventListener('DOMContentLoaded', () => {
    const montoInput = document.getElementById('monto');
    const diasInput = document.getElementById('dias');
    const calcularBtn = document.getElementById('calcularBtn');
    const resultadosPfBody = document.getElementById('resultadosPf')?.getElementsByTagName('tbody')[0];
    const resultadosFciBody = document.getElementById('resultadosFci')?.getElementsByTagName('tbody')[0];
    const lastUpdatedP = document.getElementById('last-updated');
    const rendimientoChartCanvasElement = document.getElementById('rendimientoChart');
    const interesSimpleFciCheckbox = document.getElementById('interesSimpleFciCheckbox');
    const resumenGananciasDiv = document.getElementById('resumenGananciasChart');
    // const simulacionDetalladaPfDiv = document.getElementById('simulacionDetalladaPf'); // No se usa en esta versión
    let rendimientoGeneralChartInstance;
    // let graficosBancosInstancias = {}; // No se usa en esta versión

    // const plazosFijosFijos = [30, 60, 90, 180, 365]; // No se usa en esta versión

    let tasasBancosData = null;
    let fciData = null;

    console.log("Script.js (Versión Simplificada): DOMContentLoaded.");

    async function cargarDatos() {
        console.log("[CD] Iniciando carga de datos...");
        try {
            const versionCache = new Date().getTime();
            const fetchConfig = { cache: 'no-store' };

            const responseTasas = await fetch('tasas_bancos.json?v=' + versionCache, fetchConfig);
            console.log("[CD] Fetch tasas_bancos.json status:", responseTasas.status);
            if (!responseTasas.ok) throw new Error(`Error cargando tasas_bancos.json (${responseTasas.status}): ${responseTasas.statusText}`);
            tasasBancosData = await responseTasas.json();
            console.log("[CD] tasas_bancos.json cargado.");
            
            const responseFci = await fetch('fci_data.json?v=' + versionCache, fetchConfig);
            console.log("[CD] Fetch fci_data.json status:", responseFci.status);
            if (!responseFci.ok) throw new Error(`Error cargando fci_data.json (${responseFci.status}): ${responseFci.statusText}`);
            fciData = await responseFci.json();
            console.log("[CD] fci_data.json cargado.");

            if (tasasBancosData && tasasBancosData.ultima_actualizacion && lastUpdatedP) {
                const fechaActualizacion = new Date(tasasBancosData.ultima_actualizacion);
                lastUpdatedP.textContent = `Tasas de Plazos Fijos actualizadas el: ${fechaActualizacion.toLocaleString('es-AR', { dateStyle: 'short', timeStyle: 'short' })}`;
            } else if (lastUpdatedP) {
                lastUpdatedP.textContent = "No se pudo determinar la fecha de actualización de tasas.";
            }
            console.log("[CD] Carga de datos finalizada.");
        } catch (error) {
            console.error("[CD] Error en cargarDatos:", error);
            if (lastUpdatedP) lastUpdatedP.textContent = `Error al cargar datos: ${error.message}. Intente recargar.`;
            if (resultadosPfBody) resultadosPfBody.innerHTML = `<tr><td colspan="4">Error al cargar datos de tasas.</td></tr>`;
            if (resultadosFciBody) resultadosFciBody.innerHTML = `<tr><td colspan="5">Error al cargar datos de FCI.</td></tr>`;
        }
    }

    function calcularYMostrarResultados() {
        console.log("[CM] Calcular y mostrar resultados INICIADO (versión simplificada)...");
        if (!montoInput || !diasInput || !tasasBancosData || !fciData || !resultadosPfBody || !resultadosFciBody || !resumenGananciasDiv || !interesSimpleFciCheckbox || !rendimientoChartCanvasElement ) {
            console.error("[CM] Faltan elementos del DOM o datos para calcular. Abortando.");
            alert("Error interno: Faltan elementos o datos. Revise la consola.");
            return;
        }

        if (!montoInput.value && !diasInput.value && document.activeElement !== montoInput && document.activeElement !== diasInput) {
            console.log("[CM] Monto y días vacíos (y no se está editando), no se calcula.");
            return;
        }
         if (!montoInput.value || !diasInput.value) {
            alert("Por favor, ingrese Monto a invertir y Cantidad de días.");
            return;
        }

        const monto = parseFloat(montoInput.value);
        const dias = parseInt(diasInput.value);

        if (isNaN(monto) || monto <= 0 || isNaN(dias) || dias <= 0) {
            alert("Por favor, ingrese un monto y días válidos y mayores a cero.");
            return;
        }

        resultadosPfBody.innerHTML = '';
        resultadosFciBody.innerHTML = '';
        if(resumenGananciasDiv) resumenGananciasDiv.innerHTML = '<h3>Detalle de Ganancias (para Plazo Seleccionado):</h3>';
        
        // No necesitamos limpiar simulacionDetalladaPfDiv aquí porque no lo usamos
        // Object.values(graficosBancosInstancias).forEach(chart => { if(chart && typeof chart.destroy === 'function') chart.destroy(); });
        // graficosBancosInstancias = {};
        if (rendimientoGeneralChartInstance && typeof rendimientoGeneralChartInstance.destroy === 'function') {
            rendimientoGeneralChartInstance.destroy();
        }

        const resultadosCompletosParaGraficoGeneral = [];

        if (tasasBancosData.tasas && tasasBancosData.tasas.length > 0) {
            tasasBancosData.tasas.forEach((banco) => { // No necesitamos 'index' aquí
                const tna = parseFloat(banco.tna);
                const interesGanado = monto * (tna / 100 / 365) * dias;
                const capitalMasInteres = monto + interesGanado;
                
                const row = resultadosPfBody.insertRow();
                row.insertCell().textContent = banco.banco;
                row.insertCell().textContent = tna.toFixed(2);
                row.insertCell().textContent = interesGanado.toLocaleString('es-AR', { style: 'currency', currency: 'ARS' });
                row.insertCell().textContent = capitalMasInteres.toLocaleString('es-AR', { style: 'currency', currency: 'ARS' });

                resultadosCompletosParaGraficoGeneral.push({nombre: banco.banco, valorFinal: capitalMasInteres, interesGanado: interesGanado, tipo: 'PF'});
                // No llamamos a generarSimulacionPorBanco aquí
            });
        } else {
             if(resultadosPfBody) resultadosPfBody.innerHTML = `<tr><td colspan="4">No hay datos de tasas de Plazos Fijos disponibles.</td></tr>`;
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
        } else {
            if(resultadosFciBody) resultadosFciBody.innerHTML = `<tr><td colspan="5">No hay datos de FCI disponibles.</td></tr>`;
        }
        
        actualizarGraficoGeneralYResumen(resultadosCompletosParaGraficoGeneral, monto);
        console.log("[CM] Calcular y mostrar resultados FINALIZADO (versión simplificada).");
    }

    // La función generarSimulacionPorBanco y renderizarGraficoBanco SE ELIMINAN EN ESTA VERSIÓN

    function actualizarGraficoGeneralYResumen(resultados, montoBase) {
        console.log("[AGGR] Actualizando gráfico general y resumen...");
        if (!rendimientoChartCanvasElement) { console.error("[AGGR] Elemento canvas para gráfico general no encontrado."); return; }
        const ctxGeneral = rendimientoChartCanvasElement.getContext('2d');
        if (!ctxGeneral) { console.error("[AGGR] Contexto para el gráfico general no encontrado."); return; }

        if (rendimientoGeneralChartInstance && typeof rendimientoGeneralChartInstance.destroy === 'function') {
            rendimientoGeneralChartInstance.destroy();
        }

        resultados.sort((a, b) => b.valorFinal - a.valorFinal);

        const labels = resultados.map(r => r.nombre);
        const dataValoresFinales = resultados.map(r => r.valorFinal);
        const backgroundColors = resultados.map(r => r.tipo === 'PF' ? 'rgba(54, 162, 235, 0.7)' : 'rgba(75, 192, 192, 0.7)');
        const borderColors = resultados.map(r => r.tipo === 'PF' ? 'rgba(54, 162, 235, 1)' : 'rgba(75, 192, 192, 1)');

        try {
            rendimientoGeneralChartInstance = new Chart(ctxGeneral, {
                type: 'bar',
                data: { labels: labels, datasets: [{ label: 'Capital + Interés (ARS)', data: dataValoresFinales, backgroundColor: backgroundColors, borderColor: borderColors, borderWidth: 1 }] },
                options: { 
                    responsive: true, maintainAspectRatio: true,
                    scales: {
                        y: { beginAtZero: false, min: montoBase * 0.98, title: { display: true, text: 'Monto Final (ARS)' }, ticks: { callback: function(value) { return value.toLocaleString('es-AR', { style: 'currency', currency: 'ARS', minimumFractionDigits:0 }); } } },
                        x: { title: { display: true, text: 'Instrumento Financiero' } }
                    },
                    plugins: {
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
        } catch (e) {
            console.error("[AGGR] Error al crear Chart general:", e);
        }

        if (resumenGananciasDiv) {
            resumenGananciasDiv.innerHTML = '<h3>Detalle de Ganancias (para Plazo Seleccionado):</h3>';
            resultados.forEach(resultado => {
                const p = document.createElement('p');
                const gananciaFormateada = resultado.interesGanado.toLocaleString('es-AR', { style: 'currency', currency: 'ARS' });
                p.textContent = `${resultado.nombre} - Total Ganado: ${gananciaFormateada}`;
                resumenGananciasDiv.appendChild(p);
            });
        } else {
            console.error("[AGGR] Div 'resumenGananciasDiv' no encontrado.");
        }
        console.log("[AGGR] Resumen de ganancias actualizado.");
    }

    // Event Listeners
    if (calcularBtn) {
        calcularBtn.addEventListener('click', calcularYMostrarResultados);
        console.log("Listener para 'calcularBtn' añadido.");
    } else {
        console.error("Botón 'calcularBtn' NO encontrado en el DOM al añadir listener.");
    }
    if (interesSimpleFciCheckbox) {
        interesSimpleFciCheckbox.addEventListener('change', calcularYMostrarResultados);
        console.log("Listener para 'interesSimpleFciCheckbox' añadido.");
    } else {
        console.error("Checkbox 'interesSimpleFciCheckbox' NO encontrado en el DOM al añadir listener.");
    }
    
    // Los listeners de 'input' están COMENTADOS.
    /*
    if (montoInput) {
        montoInput.addEventListener('input', () => { 
            if(montoInput.value && diasInput.value) {
                calcularYMostrarResultados(); 
            }
        });
    }
    if (diasInput) {
        diasInput.addEventListener('input', () => {
            if(montoInput.value && diasInput.value) {
                calcularYMostrarResultados();
            }
        });
    }
    */
    
    cargarDatos();
    console.log("Script.js (Versión Simplificada): Inicializado. Esperando acción del usuario.");
});