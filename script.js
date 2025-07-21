// Theme toggle functionality

function toggleTheme() {
    const body = document.body;
    const themeIcon = document.getElementById('theme-icon');
    
    body.classList.toggle('dark');
    
    if (body.classList.contains('dark')) {
        themeIcon.className = 'fas fa-sun';
        localStorage.setItem('theme', 'dark');
    } else {
        themeIcon.className = 'fas fa-moon';
        localStorage.setItem('theme', 'light');
    }
    
    // Update charts colors when theme changes
    updateChartsTheme();
}

function getChartThemeColors() {
    const styles = getComputedStyle(document.body);
    return {
        text: styles.getPropertyValue('--chart-text').trim() || '#1f2937',
        grid: styles.getPropertyValue('--chart-grid').trim() || '#e5e7eb'
    };
}

// Update charts theme colors
// Update charts theme colors (REEMPLAZO)
function updateChartsTheme() {
    const { text, grid } = getChartThemeColors();

    // Rendimiento Chart
    if (window.rendimientoChart) {
        const c = window.rendimientoChart;
        if (c.options?.scales?.x?.ticks) c.options.scales.x.ticks.color = text;
        if (c.options?.scales?.x?.grid)  c.options.scales.x.grid.color  = grid;
        if (c.options?.scales?.y?.ticks) c.options.scales.y.ticks.color = text;
        if (c.options?.scales?.y?.grid)  c.options.scales.y.grid.color  = grid;
        // Por si en algún momento activás leyenda:
        if (c.options?.plugins?.legend?.labels) {
            c.options.plugins.legend.labels.color = text;
        }
        c.update();
    }

    // FCI Variación Chart
    if (window.fciVariacionChart) {
        const c = window.fciVariacionChart;
        if (c.options?.scales?.x?.ticks) c.options.scales.x.ticks.color = text;
        if (c.options?.scales?.x?.grid)  c.options.scales.x.grid.color  = grid;
        if (c.options?.scales?.y?.ticks) c.options.scales.y.ticks.color = text;
        if (c.options?.scales?.y?.grid)  c.options.scales.y.grid.color  = grid;
        if (c.options?.plugins?.legend?.labels) {
            c.options.plugins.legend.labels.color = text;
        }
        c.update();
    }
}

// Load saved theme
document.addEventListener('DOMContentLoaded', () => {
    const savedTheme = localStorage.getItem('theme');
    if (savedTheme === 'dark') {
        document.body.classList.add('dark');
        document.getElementById('theme-icon').className = 'fas fa-sun';
    }
});

// Form validation functions
function showError(inputId, message) {
    const input = document.getElementById(inputId);
    const errorDiv = document.getElementById(inputId + '-error');
    
    input.classList.add('error');
    errorDiv.textContent = message;
    errorDiv.classList.add('show');
}

function clearError(inputId) {
    const input = document.getElementById(inputId);
    const errorDiv = document.getElementById(inputId + '-error');
    
    input.classList.remove('error');
    errorDiv.classList.remove('show');
    errorDiv.textContent = '';
}

function clearAllErrors() {
    clearError('monto');
    clearError('dias');
}

function validateForm() {
    clearAllErrors();
    let isValid = true;

    const montoInput = document.getElementById('monto');
    const diasInput = document.getElementById('dias');

    // Validate monto
    const montoString = montoInput.value.replace(/\./g, '').replace(/,/g, '');
    const monto = parseFloat(montoString);
    
    if (!montoInput.value.trim()) {
        showError('monto', 'El monto es obligatorio');
        isValid = false;
    } else if (isNaN(monto) || monto <= 0) {
        showError('monto', 'Ingresa un monto válido mayor a 0');
        isValid = false;
    } else if (monto < 1000) {
        showError('monto', 'El monto mínimo es $1.000');
        isValid = false;
    }

    // Validate dias
    const dias = parseInt(diasInput.value, 10);
    
    if (!diasInput.value.trim()) {
        showError('dias', 'Los días son obligatorios');
        isValid = false;
    } else if (isNaN(dias) || dias <= 0) {
        showError('dias', 'Ingresa una cantidad de días válida');
        isValid = false;
    } else if (dias > 365) {
        showError('dias', 'El período máximo es 365 días');
        isValid = false;
    }

    return isValid;
}

// Loading state functions
function setLoadingState(isLoading) {
    const calcularBtn = document.getElementById('calcularBtn');
    const btnText = calcularBtn.querySelector('.btn-text');
    const btnLoading = calcularBtn.querySelector('.btn-loading');
    
    if (isLoading) {
        calcularBtn.disabled = true;
        btnText.style.display = 'none';
        btnLoading.style.display = 'flex';
    } else {
        calcularBtn.disabled = false;
        btnText.style.display = 'flex';
        btnLoading.style.display = 'none';
    }
}

function showResultsCard() {
    const resultsCard = document.getElementById('results-card');
    resultsCard.style.display = 'block';
    resultsCard.classList.add('show');

    // Scroll to results card smoothly
    setTimeout(() => {
        resultsCard.scrollIntoView({ 
            behavior: 'smooth', 
            block: 'start' 
        });
    }, 100);
}

// Main application functionality
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
    const fciVariacionChartCanvasElement = document.getElementById('fciVariacionChart');

    let fciVariacionChart;
    let rendimientoChart;

    // Clear errors on input
    montoInput.addEventListener('input', () => {
        clearError('monto');
        formatMonto(montoInput);
    });
    
    diasInput.addEventListener('input', () => {
        clearError('dias');
    });

    // Tab functionality
    const tabBtns = document.querySelectorAll('.tab-btn');
    const tabContents = document.querySelectorAll('.tab-content');

    tabBtns.forEach(btn => {
        btn.addEventListener('click', () => {
            tabBtns.forEach(b => b.classList.remove('active'));
            tabContents.forEach(c => c.classList.remove('active'));

            const tabId = btn.getAttribute('data-tab');
            const tabContent = document.getElementById(tabId);
            btn.classList.add('active');
            if (tabContent) tabContent.classList.add('active');
        });
    });

    // Format money input
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

    montoInput && montoInput.addEventListener('blur', () => formatMonto(montoInput));

    // Calculate interest
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

    // Load data
    async function cargarDatos() {
        try {
            const responsePf = await fetch('tasas_bancos.json');
            const dataPf = await responsePf.json();
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
            window.fciData = dataFci;
        } catch (error) {
            console.error('Error al cargar datos de FCI:', error);
            window.fciData = [];
        }
    }

    // Calculate and show results with loading simulation
    async function calcularYMostrarResultados() {
        // Validate form first
        if (!validateForm()) {
            return;
        }

        // Start loading state
        setLoadingState(true);

        // Simulate loading delay
        await new Promise(resolve => setTimeout(resolve, 1500));

        const montoString = montoInput.value.replace(/\./g, '').replace(/,/g, '');
        const monto = parseFloat(montoString);
        const dias = parseInt(diasInput.value, 10);

        if (resultadosPfBody) resultadosPfBody.innerHTML = '';
        if (resultadosFciBody) resultadosFciBody.innerHTML = '';
        if (resumenGananciasDiv) resumenGananciasDiv.innerHTML = '<h4><i class="fas fa-trophy"></i> Resumen de Ganancias Estimadas:</h4>';

        const all_results_for_chart = [];

        // Calculate PF results
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
                    p.innerHTML = `<strong>${banco.entidad} (Plazo Fijo):</strong> <span style="color: var(--success);">+ ${interesGanado.toLocaleString('es-AR', { style: 'currency', currency: 'ARS' })}</span>`;
                    resumenGananciasDiv.appendChild(p);
                }
                all_results_for_chart.push({ name: banco.entidad + ' (PF)', gain: interesGanado });
            });
        }

        // Calculate FCI results
        if (window.fciData && resultadosFciBody) {
            const bancoProvinciaFCI = window.fciData.find(fci => fci.nombre === 'Banco Provincia FCI');

            if (bancoProvinciaFCI) {
                const { interesGanado, capitalFinal } = calcularInteres(monto, bancoProvinciaFCI.rendimiento_diario_actual_pct, dias);

                const row = resultadosFciBody.insertRow();
                const logoCell = row.insertCell();
                const nombreCell = row.insertCell();
                const rendimientoDiarioCell = row.insertCell();
                const rendimientoMensualCell = row.insertCell();
                const interesCell = row.insertCell();
                const capitalCell = row.insertCell();

                logoCell.innerHTML = `<img src="${bancoProvinciaFCI.logo}" alt="${bancoProvinciaFCI.nombre}" class="fci-logo">`;
                nombreCell.textContent = bancoProvinciaFCI.nombre;
                rendimientoDiarioCell.textContent = `${bancoProvinciaFCI.rendimiento_diario_actual_pct.toFixed(4)}%`;
                rendimientoMensualCell.textContent = `${bancoProvinciaFCI.rendimiento_mensual_estimado_pct.toFixed(4)}%`;
                interesCell.textContent = interesGanado.toLocaleString('es-AR', { style: 'currency', currency: 'ARS' });
                capitalCell.textContent = capitalFinal.toLocaleString('es-AR', { style: 'currency', currency: 'ARS' });

                if (resumenGananciasDiv) {
                    const p = document.createElement('p');
                    p.innerHTML = `<strong>${bancoProvinciaFCI.nombre}:</strong> <span style="color: var(--success);">+ ${interesGanado.toLocaleString('es-AR', { style: 'currency', currency: 'ARS' })}</span>`;
                    resumenGananciasDiv.appendChild(p);
                }
                all_results_for_chart.push({ name: bancoProvinciaFCI.nombre, gain: interesGanado });

                if (fciVariacionChartCanvasElement && bancoProvinciaFCI.variacion_historica_diaria) {
                    renderFciVariacionChart(bancoProvinciaFCI.variacion_historica_diaria);
                }
            }
        }

        if (rendimientoChartCanvasElement && all_results_for_chart.length > 0) {
            renderRendimientoChart(all_results_for_chart);
        }

        // End loading state and show results
        setLoadingState(false);
        showResultsCard();
    }

    // Render FCI variation chart
    function renderFciVariacionChart(chartData) {
        const ctx = fciVariacionChartCanvasElement.getContext('2d');
            window.lastFciVariacionChartData = chartData;


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
                    borderColor: '#6366f1',
                    backgroundColor: 'rgba(99, 102, 241, 0.1)',
                    tension: 0.4,
                    fill: true
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: {
                    legend: {
                        labels: {
                            color: document.body.classList.contains('dark') ? '#f9fafb' : '#1f2937'
                        }
                    }
                },
                scales: {
                    x: {
                        ticks: {
                            color: document.body.classList.contains('dark') ? '#f9fafb' : '#1f2937'
                        },
                        grid: {
                            color: document.body.classList.contains('dark') ? '#374151' : '#e5e7eb'
                        }
                    },
                    y: {
                        ticks: {
                            color: document.body.classList.contains('dark') ? '#f9fafb' : '#1f2937'
                        },
                        grid: {
                            color: document.body.classList.contains('dark') ? '#374151' : '#e5e7eb'
                        }
                    }
                }
            }
        });
        window.fciVariacionChart = fciVariacionChart;
    }

    // Render comparison chart
    function renderRendimientoChart(allResults) {
        const ctx = rendimientoChartCanvasElement.getContext('2d');
            window.lastRendimientoChartData = allResults;


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
                    backgroundColor: 'rgba(99, 102, 241, 0.8)',
                    borderColor: '#6366f1',
                    borderWidth: 1,
                    borderRadius: 8
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: {
                    legend: {
                        display: false
                    }
                },
                scales: {
                    x: {
                        ticks: {
                            color: document.body.classList.contains('dark') ? '#f9fafb' : '#1f2937'
                        },
                        grid: {
                            color: document.body.classList.contains('dark') ? '#374151' : '#e5e7eb'
                        }
                    },
                    y: {
                        ticks: {
                            color: document.body.classList.contains('dark') ? '#f9fafb' : '#1f2937'
                        },
                        grid: {
                            color: document.body.classList.contains('dark') ? '#374151' : '#e5e7eb'
                        }
                    }
                }
            }
        });
        window.rendimientoChart = rendimientoChart;
    }

    // Event listeners
    calcularBtn && calcularBtn.addEventListener('click', calcularYMostrarResultados);
    cargarDatos();
});