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
    const fciVariacionChartCanvasElement = document.getElementById('fciVariacionChart');

    let fciVariacionChart;
    let rendimientoChart;

    // ***** LÓGICA DE PESTAÑAS *****
    const tabLinks = document.querySelectorAll('.tab-link');
    const tabContents = document.querySelectorAll('.tab-content');

    tabLinks.forEach(link => {
        link.addEventListener('click', () => {
            tabLinks.forEach(l => l.classList.remove('active'));
            tabContents.forEach(c => c.classList.remove('active'));

            const tabId = link.getAttribute('data-tab');
            const tabContent = document.getElementById(tabId);
            link.classList.add('active');
            if (tabContent) tabContent.classList.add('active');
            else console.error("No se encontró el contenido de la pestaña para:", tabId);
        });
    });

    // Activar la primera pestaña por defecto al cargar
    if (tabLinks.length > 0) {
        tabLinks[0].classList.add('active');
        if (tabContents.length > 0) {
            tabContents[0].classList.add('active');
        }
    }

    // --- FUNCIÓN PARA FORMATEAR MONTO CON PUNTOS DE MILES ---
    function formatMonto(input) {
        let value = input.value.replace(/[^0-9,.]/g, '');
        value = value.replace(/\./g, '').replace(/,/g, '');

        if (value) {
            input.value = new Intl.NumberFormat('es-AR', {
                minimumFractionDigits: 0,
                maximumFractionDigits: 0,
                useGrouping: true
            }).format(parseFloat(value));
        } else {
            input.value = '';
        }
    }

    montoInput && montoInput.addEventListener('input', () => formatMonto(montoInput));
    montoInput && montoInput.addEventListener('blur', () => formatMonto(montoInput));

    // --- FUNCIONES DE CÁLCULO ---
    function calcularInteres(monto, tasaDiariaPorcentual, dias) {
        const isSimpleInterest = interesSimpleFciCheckbox && interesSimpleFciCheckbox.checked;
        const tasaDiariaDecimal = tasaDiariaPorcentual / 100;

        let interesGanado = 0;
        let capitalFinal = parseFloat(monto);

        if (isSimpleInterest) {
            interesGanado = monto * tasaDiariaDecimal * dias;
            capitalFinal = monto + interesGanado;
        } else {
            for (let i = 0; i < dias; i++) {
                capitalFinal *= (1 + tasaDiariaDecimal);
            }
            interesGanado = capitalFinal - parseFloat(monto);
        }
        return { interesGanado, capitalFinal };
    }

    // --- CARGAR DATOS (Plazos Fijos y FCI) ---
    async function cargarDatos() {
        try {
            const responsePf = await fetch('tasas_bancos.json');
            const dataPf = await responsePf.json();
            console.log("Datos de Plazos Fijos cargados:", dataPf);
            if (lastUpdatedP) {
                lastUpdatedP.textContent = `Última actualización: ${new Date(dataPf.ultima_actualizacion).toLocaleString('es-AR')}`;
            }
            window.tasasBancosData = dataPf;
        } catch (error) {
            console.error('Error al cargar datos de plazos fijos:', error);
        }

        try {
            const responseFci = await fetch('fci_data.json');
            const dataFci = await responseFci.json();
            console.log("Datos de FCI cargados:", dataFci);
            window.fciData = dataFci;
        } catch (error) {
            console.error('Error al cargar datos de FCI:', error);
            window.fciData = [];
        }
    }

    // --- MOSTRAR RESULTADOS ---
    function calcularYMostrarResultados() {
        const montoString = montoInput.value.replace(/\./g, '').replace(/,/g, '');
        const monto = parseFloat(montoString);
        const dias = parseInt(diasInput.value, 10);

        if (isNaN(monto) || monto <= 0 || isNaN(dias) || dias <= 0) {
            alert('Por favor, ingresa un monto y una cantidad de días válidos.');
            return;
        }

        if (resultadosPfBody) resultadosPfBody.innerHTML = '';
        if (resultadosFciBody) resultadosFciBody.innerHTML = '';
        if (resumenGananciasDiv) resumenGananciasDiv.innerHTML = '<h4>Resumen de Ganancias Estimadas:</h4>';

        const all_results_for_chart = [];

        // Calcular y mostrar resultados de Plazos Fijos
        if (window.tasasBancosData && resultadosPfBody) {
            window.tasasBancosData.tasas.forEach(banco => {
                const tnaDecimal = banco.tna / 100;
                const tasaDiariaDecimal = tnaDecimal / 365;
                const interesGanado = monto * tasaDiariaDecimal * dias;
                const capitalFinal = monto + interesGanado;

                const row = resultadosPfBody.insertRow();
                row.insertCell().textContent = banco.entidad;
                row.insertCell().textContent = `${banco.tna.toFixed(2)}%`;
                row.insertCell().textContent = interesGanado.toLocaleString('es-AR', { style: 'currency', currency: 'ARS' });
                row.insertCell().textContent = capitalFinal.toLocaleString('es-AR', { style: 'currency', currency: 'ARS' });

                if (resumenGananciasDiv) {
                    const p = document.createElement('p');
                    p.innerHTML = `<strong>${banco.entidad} (Plazo Fijo):</strong> <span style="color: #27ae60;">+ ${interesGanado.toLocaleString('es-AR', { style: 'currency', currency: 'ARS' })}</span>`;
                    resumenGananciasDiv.appendChild(p);
                }
                all_results_for_chart.push({ name: banco.entidad + ' (PF)', gain: interesGanado });
            });
        }

        // Calcular y mostrar resultados de FCI (Solo Banco Provincia FCI)
        if (window.fciData && resultadosFciBody) {
            const bancoProvinciaFCI = window.fciData.find(fci => fci.nombre === 'Banco Provincia FCI');

            if (bancoProvinciaFCI) {
                // Usamos rendimiento_diario_actual_pct para el cálculo de interés (la tasa base)
                // y rendimiento_mensual_estimado_pct para la visualización mensual.
                const { interesGanado, capitalFinal } = calcularInteres(monto, bancoProvinciaFCI.rendimiento_diario_actual_pct, dias);

                const row = resultadosFciBody.insertRow();
                const logoCell = row.insertCell();
                const nombreCell = row.insertCell();
                const rendimientoDiarioCell = row.insertCell(); // Celda para Rend. Diario
                const rendimientoMensualCell = row.insertCell(); // Celda para Rend. Mensual Est.
                const interesCell = row.insertCell();
                const capitalCell = row.insertCell();

                logoCell.innerHTML = `<img src="${bancoProvinciaFCI.logo}" alt="${bancoProvinciaFCI.nombre}" class="fci-logo">`;
                nombreCell.textContent = bancoProvinciaFCI.nombre;
                // Mostrar el rendimiento diario en la nueva columna
                rendimientoDiarioCell.textContent = `${bancoProvinciaFCI.rendimiento_diario_actual_pct.toFixed(4)}%`;
                // Mostrar el rendimiento mensual en la columna existente
                rendimientoMensualCell.textContent = `${bancoProvinciaFCI.rendimiento_mensual_estimado_pct.toFixed(4)}%`;
                interesCell.textContent = interesGanado.toLocaleString('es-AR', { style: 'currency', currency: 'ARS' });
                capitalCell.textContent = capitalFinal.toLocaleString('es-AR', { style: 'currency', currency: 'ARS' });

                if (resumenGananciasDiv) {
                    const p = document.createElement('p');
                    p.innerHTML = `<strong>${bancoProvinciaFCI.nombre}:</strong> <span style="color: #27ae60;">+ ${interesGanado.toLocaleString('es-AR', { style: 'currency', currency: 'ARS' })}</span>`;
                    resumenGananciasDiv.appendChild(p);
                }
                all_results_for_chart.push({ name: bancoProvinciaFCI.nombre, gain: interesGanado });


                if (fciVariacionChartCanvasElement && bancoProvinciaFCI.variacion_historica_diaria) {
                    renderFciVariacionChart(bancoProvinciaFCI.variacion_historica_diaria);
                }
            } else {
                console.warn("No se encontró 'Banco Provincia FCI' en los datos.");
            }
        }

        if (rendimientoChartCanvasElement && all_results_for_chart.length > 0) {
            renderRendimientoChart(all_results_for_chart);
        }
    }

    // --- RENDER FCI VARIATION CHART ---
    function renderFciVariacionChart(chartData) {
        const ctx = fciVariacionChartCanvasElement.getContext('2d');

        if (fciVariacionChart) {
            fciVariacionChart.destroy();
        }

        chartData.sort((a, b) => new Date(a.Fecha) - new Date(b.Fecha));

        const labels = chartData.map(d => d.Fecha);
        const data = chartData.map(d => d['Variacion Diaria (%)']);

        fciVariacionChart = new Chart(ctx, {
            type: 'line',
            data: {
                labels: labels,
                datasets: [{
                    label: 'Variación Diaria (%)',
                    data: data,
                    borderColor: 'rgb(75, 192, 192)',
                    tension: 0.1,
                    fill: false
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                scales: {
                    x: {
                        type: 'category',
                        title: {
                            display: true,
                            text: 'Fecha',
                            font: { family: "'Poppins', sans-serif" }
                        },
                        ticks: {
                            font: { family: "'Poppins', sans-serif" }
                        }
                    },
                    y: {
                        title: {
                            display: true,
                            text: 'Variación Diaria (%)',
                            font: { family: "'Poppins', sans-serif" }
                        },
                        beginAtZero: false,
                        ticks: {
                            callback: function(value) {
                                return value.toFixed(4) + '%';
                            },
                            font: { family: "'Poppins', sans-serif" }
                        }
                    }
                },
                plugins: {
                    legend: {
                        display: true,
                        position: 'top',
                        labels: {
                            font: { family: "'Poppins', sans-serif" }
                        }
                    },
                    tooltip: {
                        callbacks: {
                            label: function(context) {
                                return `Variación: ${context.parsed.y.toFixed(4)}%`;
                            }
                        }
                    }
                }
            }
        });
    }

    // --- RENDERIZAR GRÁFICO DE BARRAS DE RENDIMIENTOS COMPARATIVO ---
    function renderRendimientoChart(allResults) {
        const ctx = rendimientoChartCanvasElement.getContext('2d');

        if (rendimientoChart) {
            rendimientoChart.destroy();
        }

        allResults.sort((a, b) => b.gain - a.gain);

        const labels = allResults.map(res => res.name);
        const data = allResults.map(res => res.gain);

        rendimientoChart = new Chart(ctx, {
            type: 'bar',
            data: {
                labels: labels,
                datasets: [{
                    label: 'Ganancia Estimada (ARS)',
                    data: data,
                    backgroundColor: 'rgba(75, 192, 192, 0.6)',
                    borderColor: 'rgba(75, 192, 192, 1)',
                    borderWidth: 1
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                scales: {
                    y: {
                        beginAtZero: true,
                        title: {
                            display: true,
                            text: 'Ganancia (ARS)',
                            font: { family: "'Poppins', sans-serif" }
                        },
                        ticks: {
                            callback: function(value) {
                                return value.toLocaleString('es-AR', { style: 'currency', currency: 'ARS', minimumFractionDigits: 0, maximumFractionDigits: 0 });
                            },
                            font: { family: "'Poppins', sans-serif" }
                        }
                    },
                    x: {
                        title: {
                            display: true,
                            text: 'Inversión',
                            font: { family: "'Poppins', sans-serif" }
                        },
                        ticks: {
                            font: { family: "'Poppins', sans-serif" }
                        }
                    }
                },
                plugins: {
                    legend: {
                        display: false
                    },
                    tooltip: {
                        callbacks: {
                            label: function(context) {
                                let label = context.dataset.label || '';
                                if (label) label += ': ';
                                if (context.parsed.y !== null) {
                                    label += context.parsed.y.toLocaleString('es-AR', { style: 'currency', currency: 'ARS' });
                                }
                                return label;
                            }
                        }
                    }
                }
            }
        });
    }

    // --- EVENT LISTENERS ---
    calcularBtn && calcularBtn.addEventListener('click', calcularYMostrarResultados);
    cargarDatos();
});
