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
    const fciVariacionChartCanvasElement = document.getElementById('fciVariacionChart'); // New Chart element

    let fciVariacionChart; // To hold the Chart instance for FCI variations

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
        let value = input.value.replace(/\./g, ''); // Remove existing dots
        value = value.replace(/[^0-9]/g, ''); // Keep only numbers
        if (value) {
            input.value = parseFloat(value).toLocaleString('es-AR', {minimumFractionDigits: 0, maximumFractionDigits: 0}).replace(/,/g, '.');
        }
    }

    montoInput && montoInput.addEventListener('input', () => formatMonto(montoInput));
    montoInput && montoInput.addEventListener('blur', () => formatMonto(montoInput)); // Format on blur too

    // --- FUNCIONES DE CÁLCULO ---
    function calcularInteres(monto, tasaMensualDecimal, dias) {
        // La tasaMensualDecimal ahora es en realidad la variación diaria porcentual
        // Necesitamos ajustarla para que sea una tasa diaria efectiva si se usa para N días
        // O si es la variación diaria, simplemente la aplicamos para 1 día
        // Asumiendo que el rendimiento_mensual_estimado_pct ahora es la 'variacion_diaria_pct'
        // y se aplica día a día.
        const tasaDiariaDecimal = tasaMensualDecimal / 100; // Ya es diaria, solo convertir a decimal

        let interesGanado = 0;
        let capitalFinal = parseFloat(monto);

        for (let i = 0; i < dias; i++) {
            capitalFinal *= (1 + tasaDiariaDecimal);
        }
        interesGanado = capitalFinal - parseFloat(monto);
        return { interesGanado, capitalFinal };
    }

    // --- CARGAR DATOS (Plazos Fijos y FCI) ---
    async function cargarDatos() {
        // Cargar datos de Plazos Fijos
        try {
            const responsePf = await fetch('tasas_bancos.json');
            const dataPf = await responsePf.json();
            console.log("Datos de Plazos Fijos cargados:", dataPf);
            if (lastUpdatedP) {
                lastUpdatedP.textContent = `Última actualización: ${new Date(dataPf.ultima_actualizacion).toLocaleString('es-AR')}`;
            }
            window.tasasBancosData = dataPf; // Store PF data globally
        } catch (error) {
            console.error('Error al cargar datos de plazos fijos:', error);
            // Manejar error, quizás mostrar un mensaje al usuario
        }

        // Cargar datos de FCI
        try {
            const responseFci = await fetch('fci_data.json');
            const dataFci = await responseFci.json();
            console.log("Datos de FCI cargados:", dataFci);
            // Guarda los datos de FCI globalmente o pásalos a la función de cálculo
            window.fciData = dataFci;
        } catch (error) {
            console.error('Error al cargar datos de FCI:', error);
            window.fciData = []; // Asegurarse de que no sea undefined
        }
    }

    // --- MOSTRAR RESULTADOS ---
    function calcularYMostrarResultados() {
        const monto = parseFloat(montoInput.value.replace(/\./g, '')); // Remove thousand separators for calculation
        const dias = parseInt(diasInput.value, 10);

        if (isNaN(monto) || monto <= 0 || isNaN(dias) || dias <= 0) {
            alert('Por favor, ingresa un monto y una cantidad de días válidos.');
            return;
        }

        // Limpiar resultados anteriores
        if (resultadosPfBody) resultadosPfBody.innerHTML = '';
        if (resultadosFciBody) resultadosFciBody.innerHTML = '';
        if (resumenGananciasDiv) resumenGananciasDiv.innerHTML = '<h4>Resumen de Ganancias Estimadas:</h4>';


        // Calcular y mostrar resultados de FCI (Solo Banco Provincia FCI)
        if (window.fciData && resultadosFciBody) {
            const bancoProvinciaFCI = window.fciData.find(fci => fci.nombre === 'Banco Provincia FCI');

            if (bancoProvinciaFCI) {
                const { interesGanado, capitalFinal } = calcularInteres(monto, bancoProvinciaFCI.rendimiento_mensual_estimado_pct, dias);

                const row = resultadosFciBody.insertRow();
                const logoCell = row.insertCell();
                const nombreCell = row.insertCell();
                const rendimientoCell = row.insertCell();
                const interesCell = row.insertCell();
                const capitalCell = row.insertCell();

                logoCell.innerHTML = `<img src="${bancoProvinciaFCI.logo}" alt="${bancoProvinciaFCI.nombre}" class="fci-logo">`;
                nombreCell.textContent = bancoProvinciaFCI.nombre;
                rendimientoCell.textContent = `${bancoProvinciaFCI.rendimiento_mensual_estimado_pct.toFixed(4)}% Diaria`; // Now it's daily
                interesCell.textContent = interesGanado.toLocaleString('es-AR', { style: 'currency', currency: 'ARS' });
                capitalCell.textContent = capitalFinal.toLocaleString('es-AR', { style: 'currency', currency: 'ARS' });

                // Add to summary
                if (resumenGananciasDiv) {
                    const p = document.createElement('p');
                    p.innerHTML = `<strong>${bancoProvinciaFCI.nombre}:</strong> <span style="color: #27ae60;">+ ${interesGanado.toLocaleString('es-AR', { style: 'currency', currency: 'ARS' })}</span>`;
                    resumenGananciasDiv.appendChild(p);
                }

                // Render FCI Variation Chart
                if (fciVariacionChartCanvasElement && bancoProvinciaFCI.variacion_historica_diaria) {
                    renderFciVariacionChart(bancoProvinciaFCI.variacion_historica_diaria);
                }
            } else {
                console.warn("No se encontró 'Banco Provincia FCI' en los datos.");
            }
        }

        // Calculation and display for Plazos Fijos (remains unchanged as per request)
        if (window.tasasBancosData && resultadosPfBody) {
            window.tasasBancosData.tasas.forEach(banco => {
                const tnaDecimal = banco.tna / 100;
                // Convert TNA to daily rate for simple interest
                const tasaDiariaDecimal = tnaDecimal / 365;
                const interesGanado = monto * tasaDiariaDecimal * dias;
                const capitalFinal = monto + interesGanado;

                const row = resultadosPfBody.insertRow();
                row.insertCell().textContent = banco.entidad;
                row.insertCell().textContent = `${banco.tna.toFixed(2)}%`;
                row.insertCell().textContent = interesGanado.toLocaleString('es-AR', { style: 'currency', currency: 'ARS' });
                row.insertCell().textContent = capitalFinal.toLocaleString('es-AR', { style: 'currency', currency: 'ARS' });

                // Add to summary
                if (resumenGananciasDiv) {
                    const p = document.createElement('p');
                    p.innerHTML = `<strong>${banco.entidad} (Plazo Fijo):</strong> <span style="color: #27ae60;">+ ${interesGanado.toLocaleString('es-AR', { style: 'currency', currency: 'ARS' })}</span>`;
                    resumenGananciasDiv.appendChild(p);
                }
            });
        }
    }

    // --- RENDER FCI VARIATION CHART ---
    function renderFciVariacionChart(chartData) {
        const ctx = fciVariacionChartCanvasElement.getContext('2d');

        // Destroy existing chart if it exists
        if (fciVariacionChart) {
            fciVariacionChart.destroy();
        }

        // Sort data by date
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
                        type: 'category', // Use 'category' for date strings
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
                                return value.toFixed(2) + '%';
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


    // --- EVENT LISTENERS ---
    calcularBtn && calcularBtn.addEventListener('click', calcularYMostrarResultados);
    cargarDatos(); // Load initial data
});
