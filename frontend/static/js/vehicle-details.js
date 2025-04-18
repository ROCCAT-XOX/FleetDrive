// Funktion zum Laden und Anzeigen der Tankkosten für ein Fahrzeug
function loadVehicleFuelCosts() {
    const vehicleId = window.location.pathname.split('/').pop();

    fetch(`/api/fuelcosts/vehicle/${vehicleId}`)
        .then(response => {
            if (!response.ok) throw new Error('Fehler beim Laden der Tankkosten');
            return response.json();
        })
        .then(data => {
            renderVehicleFuelCostsTable(data.fuelCosts || []);
            calculateFuelStatistics(data.fuelCosts || [], data.vehicle);
            createFuelCostsChart(data.fuelCosts || []);
        })
        .catch(error => {
            console.error('Fehler beim Laden der Tankkosten:', error);
            const tableBody = document.getElementById('vehicle-fuel-costs-body');
            if (tableBody) {
                tableBody.innerHTML = `
                    <tr>
                        <td colspan="7" class="py-4 text-center text-gray-500">
                            Fehler beim Laden der Tankkosten: ${error.message}
                        </td>
                    </tr>
                `;
            }
        });

    // Fahrer für das Formular laden
    loadDriversForVehicleFuelCost();
}

// Funktion zum Darstellen der Tankkosten in der Tabelle
function renderVehicleFuelCostsTable(fuelCosts) {
    const tableBody = document.getElementById('vehicle-fuel-costs-body');
    if (!tableBody) return;

    if (!fuelCosts.length) {
        tableBody.innerHTML = `
            <tr>
                <td colspan="7" class="py-4 text-center text-gray-500">
                    Keine Tankkosten gefunden.
                </td>
            </tr>
        `;
        return;
    }

    tableBody.innerHTML = fuelCosts.map(entry => {
        const date = formatDate(entry.date);
        const amount = formatNumber(entry.amount, 2);
        const pricePerUnit = formatCurrency(entry.pricePerUnit);
        const totalCost = formatCurrency(entry.totalCost);

        return `
            <tr class="hover:bg-gray-50">
                <td class="py-3.5 pl-4 pr-3 text-left text-sm text-gray-900 sm:pl-6">${date}</td>
                <td class="px-3 py-3.5 text-left text-sm text-gray-900">${entry.fuelType || '-'}</td>
                <td class="px-3 py-3.5 text-left text-sm text-gray-900">${amount} ${entry.fuelType === 'Elektro' ? 'kWh' : 'L'}</td>
                <td class="px-3 py-3.5 text-left text-sm text-gray-900">${pricePerUnit}</td>
                <td class="px-3 py-3.5 text-left text-sm text-gray-900">${totalCost}</td>
                <td class="px-3 py-3.5 text-left text-sm text-gray-900">${entry.mileage} km</td>
                <td class="relative py-3.5 pl-3 pr-4 sm:pr-6 text-right text-sm font-medium">
                    <button type="button" class="edit-vehicle-fuel-cost-btn text-indigo-600 hover:text-indigo-900 mr-3" data-id="${entry.id}">
                        Bearbeiten
                    </button>
                    <button type="button" class="delete-vehicle-fuel-cost-btn text-red-600 hover:text-red-900" data-id="${entry.id}">
                        Löschen
                    </button>
                </td>
            </tr>
        `;
    }).join('');

    // Event-Listener für Bearbeiten-Buttons
    document.querySelectorAll('.edit-vehicle-fuel-cost-btn').forEach(button => {
        button.addEventListener('click', function() {
            const id = this.getAttribute('data-id');
            openVehicleFuelCostModal(true, id);
        });
    });

    // Event-Listener für Löschen-Buttons
    document.querySelectorAll('.delete-vehicle-fuel-cost-btn').forEach(button => {
        button.addEventListener('click', function() {
            const id = this.getAttribute('data-id');
            if (confirm('Möchten Sie diesen Tankkosteneintrag wirklich löschen?')) {
                deleteVehicleFuelCost(id);
            }
        });
    });
}

// Verbesserte Funktion zum Berechnen der Verbrauchsstatistiken
function calculateFuelStatistics(fuelCosts, vehicle) {
    if (!fuelCosts || !fuelCosts.length) return;

    // Gesamtkosten berechnen
    let totalCosts = 0;
    let totalDistance = 0;
    let totalFuel = 0;

    // Monatliche Kosten für Diagramm
    const monthlyCosts = {};
    const currentYear = new Date().getFullYear();

    // Sortieren nach Datum (älteste zuerst)
    fuelCosts.sort((a, b) => new Date(a.date) - new Date(b.date));

    // Erste Berechnung für Gesamtkosten und monatliche Aufschlüsselung
    fuelCosts.forEach(entry => {
        totalCosts += entry.totalCost;

        // Für das monatliche Kostendiagramm
        const entryDate = new Date(entry.date);
        const monthKey = `${entryDate.getFullYear()}-${entryDate.getMonth() + 1}`;

        if (!monthlyCosts[monthKey]) {
            monthlyCosts[monthKey] = {
                total: 0,
                month: entryDate.toLocaleString('de-DE', { month: 'short' }),
                year: entryDate.getFullYear()
            };
        }

        monthlyCosts[monthKey].total += entry.totalCost;
    });

    // Berechnung der gefahrenen Kilometer und Verbrauch
    for (let i = 1; i < fuelCosts.length; i++) {
        const current = fuelCosts[i];
        const previous = fuelCosts[i-1];

        // Differenz der Kilometerstände berechnen
        const distance = current.mileage - previous.mileage;

        // Nur positive Distanzen berücksichtigen
        if (distance > 0) {
            totalDistance += distance;

            // Verbrauch je nach Kraftstofftyp hinzufügen
            // Wir betrachten nur den Verbrauch zwischen zwei Tankfüllungen mit gleichem Kraftstofftyp
            if (current.fuelType === previous.fuelType &&
                (current.fuelType === 'Diesel' || current.fuelType === 'Benzin' || current.fuelType === 'Gas')) {
                totalFuel += previous.amount; // Der Verbrauch basiert auf der vorherigen Tankfüllung
            }
        }
    }

    // Durchschnittsverbrauch berechnen (L/100km oder kWh/100km)
    let avgConsumption = 0;
    let consumptionUnit = 'L/100km';

    if (totalDistance > 0 && totalFuel > 0) {
        avgConsumption = (totalFuel / totalDistance) * 100;

        if (fuelCosts[0].fuelType === 'Elektro') {
            consumptionUnit = 'kWh/100km';
        }
    }

    // Kosten pro Kilometer berechnen
    const costPerKm = totalDistance > 0 ? totalCosts / totalDistance : 0;

    // Statistik-Elemente aktualisieren
    document.getElementById('avg-consumption').textContent = avgConsumption.toFixed(2);
    document.getElementById('consumption-unit').textContent = consumptionUnit;
    document.getElementById('total-fuel-costs').textContent = formatCurrency(totalCosts);
    document.getElementById('cost-per-km').textContent = formatCurrency(costPerKm) + '/km';

    // Monatliche Kosten ins Vehicle-Statistik-Widget übertragen
    updateMonthlyCostsInStatistics(monthlyCosts);

    // Aktualisiertes Chart erstellen mit monatlichen Daten
    createMonthlyFuelCostsChart(monthlyCosts);
}

// Funktion zum Aktualisieren der monatlichen Kosten in der Fahrzeugstatistik
function updateMonthlyCostsInStatistics(monthlyCosts) {
    // Diese Funktion fügt die Tankkosten zu den Gesamtkosten im Statistik-Tab hinzu
    // Hier müsste der Code ergänzt werden, der die Tankkosten zu den vorhandenen monatlichen Kosten addiert

    // Beispiel:
    const vehicleStatsCost = document.getElementById('vehicle-monthly-costs');
    if (vehicleStatsCost) {
        let totalYearCosts = 0;

        // Aktuelle Jahresdaten summieren
        const currentYear = new Date().getFullYear();
        Object.values(monthlyCosts).forEach(month => {
            if (month.year === currentYear) {
                totalYearCosts += month.total;
            }
        });

        // Gesamtkosten für das laufende Jahr anzeigen
        vehicleStatsCost.textContent = formatCurrency(totalYearCosts);
    }
}

// Funktion zum Erstellen eines verbesserten monatlichen Kosten-Charts
function createMonthlyFuelCostsChart(monthlyCosts) {
    const chartElement = document.getElementById('fuel-costs-chart');
    if (!chartElement || !window.ApexCharts) return;

    // Daten für die letzten 12 Monate extrahieren
    const today = new Date();
    const last12Months = [];

    for (let i = 11; i >= 0; i--) {
        const d = new Date(today);
        d.setMonth(d.getMonth() - i);
        const yearMonth = `${d.getFullYear()}-${d.getMonth() + 1}`;
        const month = d.toLocaleString('de-DE', { month: 'short' });
        const year = d.getFullYear();

        last12Months.push({
            key: yearMonth,
            label: `${month} ${year}`,
            cost: monthlyCosts[yearMonth] ? monthlyCosts[yearMonth].total : 0
        });
    }

    // Chart-Daten vorbereiten
    const categories = last12Months.map(m => m.label);
    const costs = last12Months.map(m => m.cost);

    const options = {
        chart: {
            type: 'bar',
            height: 350,
            toolbar: {
                show: false
            }
        },
        colors: ['#4F46E5'],
        series: [{
            name: 'Tankkosten',
            data: costs
        }],
        xaxis: {
            categories: categories,
            labels: {
                style: {
                    fontSize: '12px'
                }
            }
        },
        yaxis: {
            title: {
                text: 'Kosten (€)'
            }
        },
        tooltip: {
            y: {
                formatter: function(value) {
                    return formatCurrency(value);
                }
            }
        },
        plotOptions: {
            bar: {
                borderRadius: 4,
                dataLabels: {
                    position: 'top'
                }
            }
        },
        dataLabels: {
            enabled: false
        }
    };

    // Chart löschen, falls es bereits existiert
    if (window.fuelCostsChart) {
        window.fuelCostsChart.destroy();
    }

    // Neues Chart erstellen und global speichern
    window.fuelCostsChart = new ApexCharts(chartElement, options);
    window.fuelCostsChart.render();
}

// Funktion zum Aktualisieren der monatlichen Kosten in der Fahrzeugstatistik
function updateMonthlyCostsInStatistics(monthlyCosts) {
    // Diese Funktion fügt die Tankkosten zu den Gesamtkosten im Statistik-Tab hinzu
    // Hier müsste der Code ergänzt werden, der die Tankkosten zu den vorhandenen monatlichen Kosten addiert

    // Beispiel:
    const vehicleStatsCost = document.getElementById('vehicle-monthly-costs');
    if (vehicleStatsCost) {
        let totalYearCosts = 0;

        // Aktuelle Jahresdaten summieren
        const currentYear = new Date().getFullYear();
        Object.values(monthlyCosts).forEach(month => {
            if (month.year === currentYear) {
                totalYearCosts += month.total;
            }
        });

        // Gesamtkosten für das laufende Jahr anzeigen
        vehicleStatsCost.textContent = formatCurrency(totalYearCosts);
    }
}

// Funktion zum Erstellen eines verbesserten monatlichen Kosten-Charts
function createMonthlyFuelCostsChart(monthlyCosts) {
    const chartElement = document.getElementById('fuel-costs-chart');
    if (!chartElement || !window.ApexCharts) return;

    // Daten für die letzten 12 Monate extrahieren
    const today = new Date();
    const last12Months = [];

    for (let i = 11; i >= 0; i--) {
        const d = new Date(today);
        d.setMonth(d.getMonth() - i);
        const yearMonth = `${d.getFullYear()}-${d.getMonth() + 1}`;
        const month = d.toLocaleString('de-DE', { month: 'short' });
        const year = d.getFullYear();

        last12Months.push({
            key: yearMonth,
            label: `${month} ${year}`,
            cost: monthlyCosts[yearMonth] ? monthlyCosts[yearMonth].total : 0
        });
    }

    // Chart-Daten vorbereiten
    const categories = last12Months.map(m => m.label);
    const costs = last12Months.map(m => m.cost);

    const options = {
        chart: {
            type: 'bar',
            height: 350,
            toolbar: {
                show: false
            }
        },
        colors: ['#4F46E5'],
        series: [{
            name: 'Tankkosten',
            data: costs
        }],
        xaxis: {
            categories: categories,
            labels: {
                style: {
                    fontSize: '12px'
                }
            }
        },
        yaxis: {
            title: {
                text: 'Kosten (€)'
            }
        },
        tooltip: {
            y: {
                formatter: function(value) {
                    return formatCurrency(value);
                }
            }
        },
        plotOptions: {
            bar: {
                borderRadius: 4,
                dataLabels: {
                    position: 'top'
                }
            }
        },
        dataLabels: {
            enabled: false
        }
    };

    // Chart löschen, falls es bereits existiert
    if (window.fuelCostsChart) {
        window.fuelCostsChart.destroy();
    }

    // Neues Chart erstellen und global speichern
    window.fuelCostsChart = new ApexCharts(chartElement, options);
    window.fuelCostsChart.render();
}

// Funktion zum Erstellen des Tankkosten-Charts
function createFuelCostsChart(fuelCosts) {
    if (!fuelCosts || !fuelCosts.length || !window.ApexCharts) return;

    const chartElement = document.getElementById('fuel-costs-chart');
    if (!chartElement) return;

    // Nach Datum sortieren (älteste zuerst)
    fuelCosts.sort((a, b) => new Date(a.date) - new Date(b.date));

    // Daten für das Chart vorbereiten
    const dates = fuelCosts.map(entry => formatDate(entry.date));
    const amounts = fuelCosts.map(entry => entry.amount);
    const costs = fuelCosts.map(entry => entry.totalCost);

    const options = {
        chart: {
            type: 'line',
            height: 350,
            toolbar: {
                show: false
            }
        },
        colors: ['#4F46E5', '#EF4444'],
        series: [
            {
                name: 'Menge',
                type: 'column',
                data: amounts
            },
            {
                name: 'Kosten',
                type: 'line',
                data: costs
            }
        ],
        stroke: {
            curve: 'smooth',
            width: [0, 4]
        },
        xaxis: {
            categories: dates
        },
        yaxis: [
            {
                title: {
                    text: 'Menge (L/kWh)'
                }
            },
            {
                opposite: true,
                title: {
                    text: 'Kosten (€)'
                }
            }
        ],
        tooltip: {
            shared: true,
            intersect: false
        }
    };

    const chart = new ApexCharts(chartElement, options);
    chart.render();
}

// Funktion zum Laden der Fahrer für das Auswahlfeld
function loadDriversForVehicleFuelCost() {
    fetch('/api/drivers')
        .then(response => {
            if (!response.ok) throw new Error('Fehler beim Laden der Fahrer');
            return response.json();
        })
        .then(data => {
            const drivers = data.drivers || [];
            const driverSelect = document.getElementById('vehicle-fuel-driver');

            if (driverSelect) {
                // Erste Option behalten
                const firstOption = driverSelect.firstElementChild;
                driverSelect.innerHTML = '';
                if (firstOption) driverSelect.appendChild(firstOption);

                // Fahrer hinzufügen
                drivers.forEach(driver => {
                    const option = document.createElement('option');
                    option.value = driver.id;
                    option.textContent = `${driver.firstName} ${driver.lastName}`;
                    driverSelect.appendChild(option);
                });
            }
        })
        .catch(error => {
            console.error('Fehler beim Laden der Fahrer:', error);
        });
}

// Funktion zum Öffnen des Modals für Fahrzeug-Tankkosten
function openVehicleFuelCostModal(isEdit = false, id = null) {
    const modal = document.getElementById('vehicle-fuel-cost-modal');
    const modalTitle = document.getElementById('vehicle-fuel-modal-title');
    const form = document.getElementById('vehicle-fuel-cost-form');
    const vehicleId = window.location.pathname.split('/').pop();

    if (!modal || !modalTitle || !form) return;

    // Formular zurücksetzen
    form.reset();

    // Fahrzeug-ID setzen
    document.getElementById('vehicle-fuel-vehicle-id').value = vehicleId;

    // Das heutige Datum als Standard setzen
    document.getElementById('vehicle-fuel-date').value = new Date().toISOString().split('T')[0];

    // Aktuellen Kilometerstand des Fahrzeugs vorausfüllen
    fetch(`/api/vehicles/${vehicleId}`)
        .then(response => response.json())
        .then(data => {
            if (data.vehicle && data.vehicle.mileage) {
                document.getElementById('vehicle-fuel-mileage').value = data.vehicle.mileage;
            }
        })
        .catch(error => {
            console.error('Fehler beim Laden des Fahrzeugkilometerstands:', error);
        });

    if (isEdit && id) {
        modalTitle.textContent = 'Tankkosten bearbeiten';

        // Tankkostendaten laden
        fetch(`/api/fuelcosts/${id}`)
            .then(response => {
                if (!response.ok) throw new Error('Fehler beim Laden der Tankkostendaten');
                return response.json();
            })
            .then(data => {
                const fuelCost = data.fuelCost;

                // Formularfelder füllen
                document.getElementById('vehicle-fuel-date').value = formatDateForInput(fuelCost.date);

                // Fahrer auswählen, falls vorhanden
                if (fuelCost.driverId && !fuelCost.driverId.match(/^0+$/)) {
                    const driverSelect = document.getElementById('vehicle-fuel-driver');
                    if (driverSelect) {
                        // Prüfen, ob die Option bereits existiert
                        const option = Array.from(driverSelect.options).find(option => option.value === fuelCost.driverId);
                        if (option) {
                            driverSelect.value = fuelCost.driverId;
                        } else if (data.driver) {
                            // Wenn nicht, eine neue Option hinzufügen (z.B. für inaktive Fahrer)
                            const newOption = document.createElement('option');
                            newOption.value = fuelCost.driverId;
                            newOption.textContent = `${data.driver.firstName} ${data.driver.lastName}`;
                            driverSelect.appendChild(newOption);
                            driverSelect.value = fuelCost.driverId;
                        }
                    }
                }

                // Weitere Felder füllen
                document.getElementById('vehicle-fuel-type').value = fuelCost.fuelType || 'Diesel';
                document.getElementById('vehicle-fuel-amount').value = fuelCost.amount || '';
                document.getElementById('vehicle-fuel-price-per-unit').value = fuelCost.pricePerUnit || '';
                document.getElementById('vehicle-fuel-total-cost').value = fuelCost.totalCost || '';
                document.getElementById('vehicle-fuel-mileage').value = fuelCost.mileage || '';
                document.getElementById('vehicle-fuel-location').value = fuelCost.location || '';
                document.getElementById('vehicle-fuel-receipt-number').value = fuelCost.receiptNumber || '';
                document.getElementById('vehicle-fuel-notes').value = fuelCost.notes || '';

                // ID zum Formular hinzufügen
                let idInput = form.querySelector('input[name="id"]');
                if (!idInput) {
                    idInput = document.createElement('input');
                    idInput.type = 'hidden';
                    idInput.name = 'id';
                    form.appendChild(idInput);
                }
                idInput.value = id;
            })
            .catch(error => {
                console.error('Fehler:', error);
                closeVehicleFuelCostModal();
                alert('Fehler beim Laden der Tankkostendaten: ' + error.message);
            });
    } else {
        modalTitle.textContent = 'Tankkosten hinzufügen';

        // Versteckte ID entfernen
        const idInput = form.querySelector('input[name="id"]');
        if (idInput) idInput.remove();
    }

    modal.classList.remove('hidden');
}

// Funktion zum Schließen des Modals
function closeVehicleFuelCostModal() {
    const modal = document.getElementById('vehicle-fuel-cost-modal');
    if (modal) modal.classList.add('hidden');
}

// Funktion zum Verarbeiten des Formularabsendens für Fahrzeug-Tankkosten
function handleVehicleFuelCostSubmit(event) {
    event.preventDefault();

    const form = event.target;
    const formData = new FormData(form);
    const fuelCostData = {};

    // Formulardaten sammeln
    for (let [key, value] of formData.entries()) {
        fuelCostData[key] = value;
    }

    // Validierung der Pflichtfelder
    if (!fuelCostData['fuel-date']) {
        alert('Bitte geben Sie ein Datum ein.');
        return;
    }

    if (!fuelCostData.amount || parseFloat(fuelCostData.amount) <= 0) {
        alert('Bitte geben Sie eine gültige Menge ein.');
        return;
    }

    if (!fuelCostData.mileage || parseInt(fuelCostData.mileage) <= 0) {
        alert('Bitte geben Sie einen gültigen Kilometerstand ein.');
        return;
    }

    // Gesamtkosten berechnen, falls nicht angegeben
    if (!fuelCostData['total-cost']) {
        const amount = parseFloat(fuelCostData.amount);
        const pricePerUnit = parseFloat(fuelCostData['price-per-unit']);
        if (amount > 0 && pricePerUnit > 0) {
            fuelCostData['total-cost'] = (amount * pricePerUnit).toFixed(2);
        } else {
            alert('Bitte geben Sie einen Preis pro Einheit oder Gesamtkosten ein.');
            return;
        }
    }

    // Prüfen, ob es eine Bearbeitung ist
    const isEdit = !!fuelCostData.id;

    // API-Daten vorbereiten
    const apiData = {
        vehicleId: fuelCostData.vehicle,
        driverId: fuelCostData.driver || '',
        date: fuelCostData['fuel-date'],
        fuelType: fuelCostData['fuel-type'],
        amount: parseFloat(fuelCostData.amount),
        pricePerUnit: parseFloat(fuelCostData['price-per-unit']),
        totalCost: parseFloat(fuelCostData['total-cost']),
        mileage: parseInt(fuelCostData.mileage),
        location: fuelCostData.location || '',
        receiptNumber: fuelCostData['receipt-number'] || '',
        notes: fuelCostData.notes || ''
    };

    // API-Anfrage senden
    const url = isEdit ? `/api/fuelcosts/${fuelCostData.id}` : '/api/fuelcosts';
    const method = isEdit ? 'PUT' : 'POST';

    fetch(url, {
        method: method,
        headers: {
            'Content-Type': 'application/json'
        },
        body: JSON.stringify(apiData)
    })
        .then(response => {
            if (!response.ok) {
                return response.text().then(text => {
                    throw new Error(text);
                });
            }
            return response.json();
        })
        .then(data => {
            closeVehicleFuelCostModal();
            loadVehicleFuelCosts();
            alert(isEdit ? 'Tankkosten erfolgreich aktualisiert!' : 'Tankkosten erfolgreich hinzugefügt!');
        })
        .catch(error => {
            console.error('Fehler:', error);
            alert('Fehler beim Speichern der Tankkosten: ' + error.message);
        });
}

// Funktion zum Löschen eines Tankkosteneintrags
function deleteVehicleFuelCost(id) {
    fetch(`/api/fuelcosts/${id}`, {
        method: 'DELETE'
    })
        .then(response => {
            if (!response.ok) {
                return response.text().then(text => {
                    throw new Error(text);
                });
            }
            return response.json();
        })
        .then(data => {
            loadVehicleFuelCosts();
            alert('Tankkosten erfolgreich gelöscht!');
        })
        .catch(error => {
            console.error('Fehler:', error);
            alert('Fehler beim Löschen der Tankkosten: ' + error.message);
        });
}

// Hilfsfunktionen für Datums- und Zahlenformatierung
function formatDate(dateString) {
    if (!dateString) return '-';
    const date = new Date(dateString);
    return date.toLocaleDateString('de-DE');
}

function formatDateForInput(dateString) {
    if (!dateString) return '';
    const date = new Date(dateString);
    return date.toISOString().split('T')[0];
}

function formatNumber(number, decimals = 0) {
    if (number === undefined || number === null) return '-';
    return parseFloat(number).toLocaleString('de-DE', { minimumFractionDigits: decimals, maximumFractionDigits: decimals });
}

function formatCurrency(number) {
    if (number === undefined || number === null) return '-';
    return parseFloat(number).toLocaleString('de-DE', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + ' €';
}

// Event-Listener für Modal und Formular
document.addEventListener('DOMContentLoaded', function() {
    // "Tankkosten hinzufügen"-Button
    const addFuelCostBtn = document.getElementById('add-vehicle-fuel-cost-btn');
    if (addFuelCostBtn) {
        addFuelCostBtn.addEventListener('click', () => openVehicleFuelCostModal(false));
    }

    // "Schließen"-Button im Modal
    const closeFuelCostBtn = document.getElementById('vehicle-close-fuel-modal-btn');
    if (closeFuelCostBtn) {
        closeFuelCostBtn.addEventListener('click', closeVehicleFuelCostModal);
    }

    // Formular absenden
    const fuelCostForm = document.getElementById('vehicle-fuel-cost-form');
    if (fuelCostForm) {
        fuelCostForm.addEventListener('submit', handleVehicleFuelCostSubmit);
    }

    // Automatische Berechnung im Formular einrichten
    const amountInput = document.getElementById('vehicle-fuel-amount');
    const pricePerUnitInput = document.getElementById('vehicle-fuel-price-per-unit');
    const totalCostInput = document.getElementById('vehicle-fuel-total-cost');

    if (amountInput && pricePerUnitInput && totalCostInput) {
        // Bei Änderung von Menge oder Preis den Gesamtpreis berechnen
        const calculateTotal = () => {
            const amount = parseFloat(amountInput.value) || 0;
            const pricePerUnit = parseFloat(pricePerUnitInput.value) || 0;

            if (amount > 0 && pricePerUnit > 0) {
                totalCostInput.value = (amount * pricePerUnit).toFixed(2);
            }
        };

        amountInput.addEventListener('input', calculateTotal);
        pricePerUnitInput.addEventListener('input', calculateTotal);

        // Bei Änderung des Gesamtpreises den Preis pro Einheit berechnen
        totalCostInput.addEventListener('input', () => {
            const amount = parseFloat(amountInput.value) || 0;
            const totalCost = parseFloat(totalCostInput.value) || 0;

            if (amount > 0 && totalCost > 0) {
                pricePerUnitInput.value = (totalCost / amount).toFixed(3);
            }
        });
    }

    // Initial Tankkosten laden
    loadVehicleFuelCosts();
});

// Event-Listener für den Bearbeiten-Button im Zulassungs-Tab
document.addEventListener('DOMContentLoaded', function() {
    const editRegistrationBtn = document.getElementById('edit-registration-btn');
    if (editRegistrationBtn) {
        editRegistrationBtn.addEventListener('click', openRegistrationModal);
    }

    // Schließen-Button im Registrierungs-Modal
    const closeRegistrationBtn = document.getElementById('close-registration-modal-btn');
    if (closeRegistrationBtn) {
        closeRegistrationBtn.addEventListener('click', closeRegistrationModal);
    }

    // Formular-Absenden-Event
    const registrationForm = document.getElementById('registration-form');
    if (registrationForm) {
        registrationForm.addEventListener('submit', handleRegistrationSubmit);
    }
});

document.addEventListener('DOMContentLoaded', function() {
        // Tab-Funktionalität
        const tabButtons = document.querySelectorAll('.vehicle-tab-btn');
        const tabContents = document.querySelectorAll('.vehicle-tab-content');

        tabButtons.forEach(button => {
            button.addEventListener('click', () => {
                const tabName = button.getAttribute('data-tab');

                // Alle Tabs ausblenden
                tabContents.forEach(content => {
                    content.classList.add('hidden');
                });

                // Alle Tab-Buttons zurücksetzen
                tabButtons.forEach(btn => {
                    btn.classList.remove('border-blue-500', 'text-blue-600');
                    btn.classList.add('border-transparent', 'text-gray-500', 'hover:text-gray-700', 'hover:border-gray-300');
                });

                // Ausgewählten Tab anzeigen
                document.getElementById(tabName).classList.remove('hidden');

                // Aktuellen Button hervorheben
                button.classList.remove('border-transparent', 'text-gray-500', 'hover:text-gray-700', 'hover:border-gray-300');
                button.classList.add('border-blue-500', 'text-blue-600');
            });
        });

        // Parameter aus der URL extrahieren
        const vehicleId = window.location.pathname.split('/').pop();

        // Fahrzeugdaten laden
        loadVehicleData();

        // Event-Listener für die Wartungsmodals
        setupMaintenanceModals();

        // Event-Listener für die Nutzungsmodals
        setupUsageModals();

        // Event-Listener für das Fahrzeug-Bearbeiten-Modal
        setupVehicleEditModal();

        // Funktion zum Laden der Fahrzeugdaten
        function loadVehicleData() {
            fetch(`/api/vehicles/${vehicleId}`)
                .then(response => {
                    if (!response.ok) throw new Error('Fahrzeug nicht gefunden');
                    return response.json();
                })
                .then(data => {
                    const vehicle = data.vehicle;
                    console.log("Geladene Fahrzeugdaten:", vehicle);

                    if (!vehicle) {
                        throw new Error('Keine Fahrzeugdaten in der Antwort');
                    }

                    // Seitentitel und Status aktualisieren
                    updateHeaderInfo(vehicle);

                    // UI mit Fahrzeugdaten aktualisieren
                    updateVehicleDisplay(vehicle);

                    // Wenn ein Fahrer zugewiesen ist, Fahrerdaten laden
                    if (vehicle.currentDriverId &&
                        vehicle.currentDriverId !== '000000000000000000000000') {
                        loadCurrentDriverData(vehicle.currentDriverId);
                    } else {
                        updateCurrentUsageDisplay(null);
                    }

                    // Wartungseinträge laden
                    loadMaintenanceEntries();

                    // Nutzungshistorie laden
                    loadUsageHistory();

                    // Wenn ApexCharts verfügbar ist, Charts erstellen mit echten Fahrzeugdaten
                    if (typeof ApexCharts !== 'undefined') {
                        createCharts(vehicle);
                    }
                })
                .catch(error => {
                    console.error('Fehler beim Laden der Fahrzeugdaten:', error);
                    showNotification('Fehler beim Laden der Fahrzeugdaten', 'error');
                });
        }

        // Funktion zum Aktualisieren des Headers (Titel und Status)
        function updateHeaderInfo(vehicle) {
            const vehicleTitle = document.getElementById('vehicle-title');
            const vehicleStatus = document.getElementById('vehicle-status');

            if (vehicleTitle) {
                vehicleTitle.textContent = `${vehicle.brand} ${vehicle.model} (${vehicle.licensePlate})`;
            }

            if (vehicleStatus) {
                let statusClass, statusText;

                switch (vehicle.status) {
                    case 'available':
                        statusClass = 'bg-green-100 text-green-800';
                        statusText = 'Verfügbar';
                        break;
                    case 'inuse':
                        statusClass = 'bg-red-100 text-red-800';
                        statusText = 'In Benutzung';
                        break;
                    case 'maintenance':
                        statusClass = 'bg-yellow-100 text-yellow-800';
                        statusText = 'In Wartung';
                        break;
                    default:
                        statusClass = 'bg-gray-100 text-gray-800';
                        statusText = vehicle.status || 'Unbekannt';
                }

                vehicleStatus.className = `px-2.5 py-1 inline-flex text-xs leading-5 font-semibold rounded-full ${statusClass}`;
                vehicleStatus.textContent = statusText;
            }
        }

        // Funktion zum Aktualisieren der Fahrzeugdetails im UI
        // Funktion zum Aktualisieren der Fahrzeugdetails im UI
        function updateVehicleDisplay(vehicle) {
            console.log("Aktualisiere Fahrzeugdetails mit:", vehicle); // Debug-Ausgabe

            // Grundlegende Informationen
            setElementText('license-plate-display', vehicle.licensePlate || '-');
            setElementText('brand-model-display', (vehicle.brand + ' ' + vehicle.model) || '-');
            setElementText('year-display', vehicle.year || '-');
            setElementText('color-display', vehicle.color || '-');
            setElementText('vehicle-id-display', vehicle.vehicleId || '-');
            setElementText('vin-display', vehicle.vin || '-');
            setElementText('fuel-type-display', vehicle.fuelType || '-');
            setElementText('mileage-display', vehicle.mileage ? `${vehicle.mileage} km` : '-');

            // Zulassung und Versicherung
            setElementText('registration-date-display', formatDate(vehicle.registrationDate) || '-');
            setElementText('next-inspection-display', formatDate(vehicle.nextInspectionDate) || '-');
            setElementText('insurance-company-display', vehicle.insuranceCompany || '-');
            setElementText('insurance-number-display', vehicle.insuranceNumber || '-');
            setElementText('insurance-type-display', vehicle.insuranceType || '-');
            setElementText('insurance-cost-display', vehicle.insuranceCost ? `${vehicle.insuranceCost} €` : '-');

            // Auch Formulare mit Werten vorausfüllen (für Modals)
            if (document.getElementById('edit-vehicle-form')) {
                document.getElementById('license_plate').value = vehicle.licensePlate || '';
                document.getElementById('model').value = (vehicle.brand + ' ' + vehicle.model) || '';
                document.getElementById('year').value = vehicle.year || '';
                document.getElementById('color').value = vehicle.color || '';
                document.getElementById('vehicle_id').value = vehicle.vehicleId || '';
                document.getElementById('vin').value = vehicle.vin || '';
                document.getElementById('fuel_type').value = vehicle.fuelType || '';
                document.getElementById('current_mileage').value = vehicle.mileage || 0;

                if (vehicle.registrationDate) {
                    document.getElementById('registration_date').value = formatDateForInput(vehicle.registrationDate);
                }

                if (vehicle.nextInspectionDate) {
                    document.getElementById('next_inspection').value = formatDateForInput(vehicle.nextInspectionDate);
                }

                document.getElementById('insurance').value = vehicle.insuranceCompany || '';
                document.getElementById('insurance_number').value = vehicle.insuranceNumber || '';
                document.getElementById('insurance_type').value = vehicle.insuranceType || '';
                document.getElementById('insurance_cost').value = vehicle.insuranceCost || '';
                document.getElementById('vehicle_notes').value = vehicle.notes || '';
            }
        }

// Hilfsfunktion zum Setzen von Text in einem Element
        function setElementText(elementId, text) {
            const element = document.getElementById(elementId);
            if (element) {
                element.textContent = text || '-'; // Fallback auf "-" wenn kein Text vorhanden
            } else {
                console.warn(`Element mit ID ${elementId} nicht gefunden`);
            }
        }

        // Funktion zum Laden und Anzeigen der Daten des aktuellen Fahrers
        function loadCurrentDriverData(driverId) {
            fetch(`/api/drivers/${driverId}`)
                .then(response => {
                    if (!response.ok) throw new Error('Fahrer nicht gefunden');
                    return response.json();
                })
                .then(data => {
                    const driver = data.driver;
                    console.log("Geladene Fahrerdaten:", driver);

                    // Aktive Nutzung abfragen
                    return fetch(`/api/usage/vehicle/${vehicleId}`)
                        .then(response => {
                            if (!response.ok) throw new Error('Nutzungsdaten nicht gefunden');
                            return response.json();
                        })
                        .then(usageData => {
                            // Aktive Nutzung herausfiltern
                            const activeUsage = usageData.usage.find(entry => entry.status === 'active');

                            updateCurrentUsageDisplay(driver, activeUsage);
                            return {driver, activeUsage};
                        });
                })
                .catch(error => {
                    console.error('Fehler beim Laden der Fahrerdaten:', error);
                    updateCurrentUsageDisplay(null);
                });
        }

        // Funktion zum Aktualisieren der Anzeige der aktuellen Nutzung
        function updateCurrentUsageDisplay(driver, activeUsage = null) {
            const currentUsageTab = document.getElementById('current-usage');

            if (!currentUsageTab) return;

            if (!driver) {
                // Kein Fahrer zugewiesen
                currentUsageTab.innerHTML = `
                <div class="bg-white overflow-hidden shadow rounded-lg">
                    <div class="px-4 py-5 sm:px-6 bg-gray-50 border-b border-gray-200">
                        <h3 class="text-lg leading-6 font-medium text-gray-900">Aktuelle Nutzung</h3>
                    </div>
                    <div class="px-4 py-5 sm:p-6 text-center text-gray-500">
                        <p>Dieses Fahrzeug wird derzeit nicht genutzt.</p>
                        <button id="start-usage-btn" type="button" class="mt-4 inline-flex items-center px-4 py-2 border border-transparent shadow-sm text-sm font-medium rounded-md text-white bg-indigo-600 hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500">
                            <svg class="-ml-1 mr-2 h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 6v6m0 0v6m0-6h6m-6 0H6" />
                            </svg>
                            Nutzung starten
                        </button>
                    </div>
                </div>
            `;

                // Event-Listener für den "Nutzung starten"-Button
                const startUsageBtn = document.getElementById('start-usage-btn');
                if (startUsageBtn) {
                    startUsageBtn.addEventListener('click', () => {
                        const usageModal = document.getElementById('usage-modal');
                        if (usageModal) {
                            usageModal.classList.remove('hidden');
                        }
                    });
                }

                return;
            }

            // Fahrer ist zugewiesen, zeige Details an
            let usageStartDate = "Unbekannt";
            let usageEndDate = "Nicht festgelegt";
            let department = "";
            let project = "";

            if (activeUsage) {
                usageStartDate = formatDateTime(activeUsage.startDate);

                if (activeUsage.endDate) {
                    usageEndDate = formatDateTime(activeUsage.endDate);
                }

                department = activeUsage.department || "";
                project = activeUsage.project || activeUsage.purpose || "";
            }

            currentUsageTab.innerHTML = `
            <div class="bg-white overflow-hidden shadow rounded-lg">
                <div class="px-4 py-5 sm:px-6 bg-gray-50 border-b border-gray-200 flex justify-between items-center">
                    <h3 class="text-lg leading-6 font-medium text-gray-900">Aktuelle Nutzung</h3>
                    <button type="button" id="edit-current-usage-btn" class="inline-flex items-center px-3 py-1.5 border border-transparent text-xs font-medium rounded-md text-indigo-700 bg-indigo-100 hover:bg-indigo-200 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500">
                        <svg class="-ml-0.5 mr-1 h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" />
                        </svg>
                        Bearbeiten
                    </button>
                </div>
                <div class="px-4 py-5 sm:p-6">
                    <dl class="grid grid-cols-1 gap-x-4 gap-y-6 sm:grid-cols-2">
                        <div class="sm:col-span-1">
                            <dt class="text-sm font-medium text-gray-500">Aktueller Fahrer</dt>
                            <dd class="mt-1 text-sm text-gray-900">${driver.firstName} ${driver.lastName}</dd>
                        </div>
                        <div class="sm:col-span-1">
                            <dt class="text-sm font-medium text-gray-500">Abteilung</dt>
                            <dd class="mt-1 text-sm text-gray-900">${department || "Nicht angegeben"}</dd>
                        </div>
                        <div class="sm:col-span-1">
                            <dt class="text-sm font-medium text-gray-500">Nutzung seit</dt>
                            <dd class="mt-1 text-sm text-gray-900">${usageStartDate}</dd>
                        </div>
                        <div class="sm:col-span-1">
                            <dt class="text-sm font-medium text-gray-500">Geplante Rückgabe</dt>
                            <dd class="mt-1 text-sm text-gray-900">${usageEndDate}</dd>
                        </div>
                        <div class="sm:col-span-2">
                            <dt class="text-sm font-medium text-gray-500">Projekt/Zweck</dt>
                            <dd class="mt-1 text-sm text-gray-900">${project || "Nicht angegeben"}</dd>
                        </div>
                    </dl>
                </div>
            </div>
        `;

            // Event-Listener für den "Bearbeiten"-Button
            // Event-Listener für den "Bearbeiten"-Button
            const editUsageBtn = document.getElementById('edit-current-usage-btn');
            if (editUsageBtn) {
                editUsageBtn.addEventListener('click', () => {
                    const editUsageModal = document.getElementById('edit-usage-modal');
                    if (editUsageModal) {
                        // Formularelemente mit aktuellen Werten füllen
                        if (activeUsage) {
                            const form = document.getElementById('edit-current-usage-form');
                            if (form) {
                                // Verstecktes Feld für die Nutzungs-ID hinzufügen
                                let idInput = form.querySelector('input[name="usage-id"]');
                                if (!idInput) {
                                    idInput = document.createElement('input');
                                    idInput.type = 'hidden';
                                    idInput.name = 'usage-id';
                                    form.appendChild(idInput);
                                }
                                idInput.value = activeUsage.id || '';

                                // Select-Feld für Fahrer suchen und den aktuellen Fahrer auswählen
                                const driverSelect = form.querySelector('#current-driver');
                                if (driverSelect) {
                                    // Prüfen, ob der Fahrer in der Liste ist, sonst dynamisch hinzufügen
                                    let driverOption = Array.from(driverSelect.options).find(option => option.value === driver.id);

                                    if (!driverOption) {
                                        driverOption = document.createElement('option');
                                        driverOption.value = driver.id;
                                        driverOption.textContent = `${driver.firstName} ${driver.lastName}`;
                                        driverSelect.appendChild(driverOption);
                                    }

                                    driverSelect.value = driver.id;
                                    console.log("Fahrer-ID gesetzt auf:", driver.id); // Debug
                                }

                                // Startdatum und -zeit setzen
                                if (activeUsage.startDate) {
                                    const startDate = new Date(activeUsage.startDate);
                                    const startDateInput = form.querySelector('#current-start-date');
                                    const startTimeInput = form.querySelector('#current-start-time');

                                    if (startDateInput) {
                                        startDateInput.value = formatDateForInput(startDate);
                                        console.log("Startdatum gesetzt auf:", formatDateForInput(startDate)); // Debug
                                    }
                                    if (startTimeInput) {
                                        startTimeInput.value = formatTimeForInput(startDate);
                                        console.log("Startzeit gesetzt auf:", formatTimeForInput(startDate)); // Debug
                                    }
                                }

                                // Enddatum und -zeit setzen
                                if (activeUsage.endDate) {
                                    const endDate = new Date(activeUsage.endDate);
                                    const endDateInput = form.querySelector('#current-end-date');
                                    const endTimeInput = form.querySelector('#current-end-time');

                                    if (endDateInput) endDateInput.value = formatDateForInput(endDate);
                                    if (endTimeInput) endTimeInput.value = formatTimeForInput(endDate);
                                }

                                // Weitere Felder setzen
                                const departmentInput = form.querySelector('#current-department');
                                if (departmentInput && activeUsage.department) {
                                    // Versuche den passenden Wert zu finden oder wähle den ersten aus
                                    const option = Array.from(departmentInput.options).find(opt =>
                                        opt.textContent.toLowerCase() === activeUsage.department.toLowerCase());

                                    if (option) {
                                        departmentInput.value = option.value;
                                    }
                                }

                                const projectInput = form.querySelector('#current-project');
                                if (projectInput) {
                                    projectInput.value = activeUsage.project || activeUsage.purpose || '';
                                }

                                const notesInput = form.querySelector('#current-usage-notes');
                                if (notesInput) {
                                    notesInput.value = activeUsage.notes || '';
                                }

                                // Status setzen, falls vorhanden
                                const statusInput = form.querySelector('#usage-status');
                                if (statusInput) {
                                    statusInput.value = activeUsage.status || 'active';
                                }

                                // Kilometerstand setzen, falls nötig
                                const startMileageInput = document.createElement('input');
                                startMileageInput.type = 'hidden';
                                startMileageInput.name = 'start-mileage';
                                startMileageInput.value = activeUsage.startMileage || 0;
                                form.appendChild(startMileageInput);
                            }
                        }

                        editUsageModal.classList.remove('hidden');
                    }
                });
            }
        }

        // Funktion zum Laden und Anzeigen der Wartungseinträge
        function loadMaintenanceEntries() {
            fetch(`/api/maintenance/vehicle/${vehicleId}`)
                .then(response => {
                    if (!response.ok) throw new Error('Wartungseinträge nicht gefunden');
                    return response.json();
                })
                .then(data => {
                    const maintenanceEntries = data.maintenance || [];
                    console.log("Geladene Wartungseinträge:", maintenanceEntries);

                    updateMaintenanceTable(maintenanceEntries);
                })
                .catch(error => {
                    console.error('Fehler beim Laden der Wartungseinträge:', error);
                    updateMaintenanceTable([]);
                });
        }

        // Funktion zum Aktualisieren der Wartungstabelle
        function updateMaintenanceTable(entries) {
            const tableBody = document.getElementById('maintenance-table-body');
            if (!tableBody) return;

            if (!entries || entries.length === 0) {
                tableBody.innerHTML = `
                <tr>
                    <td colspan="5" class="py-4 text-center text-gray-500">
                        Keine Wartungseinträge gefunden.
                    </td>
                </tr>
            `;
                return;
            }

            // Einträge nach Datum sortieren (neueste zuerst)
            entries.sort((a, b) => new Date(b.date) - new Date(a.date));

            // Tabelle mit Einträgen füllen
            tableBody.innerHTML = entries.map(entry => {
                const date = formatDate(entry.date);
                let type = 'Sonstiges';

                switch (entry.type) {
                    case 'inspection':
                        type = 'Inspektion';
                        break;
                    case 'oil-change':
                        type = 'Ölwechsel';
                        break;
                    case 'tire-change':
                        type = 'Reifenwechsel';
                        break;
                    case 'repair':
                        type = 'Reparatur';
                        break;
                }

                return `
                <tr>
                    <td class="py-3.5 pl-4 pr-3 text-left text-sm text-gray-900 sm:pl-0">${date}</td>
                    <td class="px-3 py-3.5 text-left text-sm text-gray-900">${type}</td>
                    <td class="px-3 py-3.5 text-left text-sm text-gray-900">${entry.mileage} km</td>
                    <td class="px-3 py-3.5 text-left text-sm text-gray-900">${entry.cost ? (entry.cost + ' €') : '-'}</td>
                    <td class="relative py-3.5 pl-3 pr-4 sm:pr-0 text-right">
                        <button class="edit-maintenance-btn text-indigo-600 hover:text-indigo-900" data-id="${entry.id}">
                            Bearbeiten
                        </button>
                    </td>
                </tr>
            `;
            }).join('');

            // Event-Listener für die Bearbeiten-Buttons
            const editButtons = tableBody.querySelectorAll('.edit-maintenance-btn');
            editButtons.forEach(button => {
                button.addEventListener('click', function () {
                    const entryId = this.getAttribute('data-id');
                    openMaintenanceModal(true, entryId);
                });
            });
        }

        // Funktion zum Laden und Anzeigen der Nutzungshistorie
        function loadUsageHistory() {
            fetch(`/api/usage/vehicle/${vehicleId}`)
                .then(response => {
                    if (!response.ok) throw new Error('Nutzungshistorie nicht gefunden');
                    return response.json();
                })
                .then(data => {
                    const usageEntries = data.usage || [];
                    console.log("Geladene Nutzungseinträge:", usageEntries);

                    updateUsageTable(usageEntries);
                })
                .catch(error => {
                    console.error('Fehler beim Laden der Nutzungshistorie:', error);
                    updateUsageTable([]);
                });
        }

        // Funktion zum Aktualisieren der Nutzungstabelle
        function updateUsageTable(entries) {
            const tableBody = document.getElementById('usage-table-body');
            if (!tableBody) return;

            if (!entries || entries.length === 0) {
                tableBody.innerHTML = `
                <tr>
                    <td colspan="5" class="py-4 text-center text-gray-500">
                        Keine Nutzungseinträge gefunden.
                    </td>
                </tr>
            `;
                return;
            }

            // Einträge nach Startdatum sortieren (neueste zuerst)
            entries.sort((a, b) => new Date(b.startDate) - new Date(a.startDate));

            // Tabelle mit Einträgen füllen
            tableBody.innerHTML = entries.map(entry => {
                const startDate = formatDate(entry.startDate);
                const endDate = entry.endDate ? formatDate(entry.endDate) : '-';
                const timeframe = `${startDate} - ${endDate}`;

                // Kilometerstand-Differenz berechnen
                let mileageInfo = `${entry.startMileage} km`;
                if (entry.endMileage && entry.endMileage > entry.startMileage) {
                    const diff = entry.endMileage - entry.startMileage;
                    mileageInfo = `${entry.startMileage} - ${entry.endMileage} km (+${diff} km)`;
                }

                return `
                <tr>
                    <td class="py-3.5 pl-4 pr-3 text-left text-sm text-gray-900 sm:pl-6">${timeframe}</td>
                    <td class="px-3 py-3.5 text-left text-sm text-gray-900">${entry.driverName || '-'}</td>
                    <td class="px-3 py-3.5 text-left text-sm text-gray-900">${entry.project || entry.purpose || '-'}</td>
                    <td class="px-3 py-3.5 text-left text-sm text-gray-900">${mileageInfo}</td>
                    <td class="relative py-3.5 pl-3 pr-4 sm:pr-6 text-right">
                        <button class="edit-usage-btn text-indigo-600 hover:text-indigo-900" data-id="${entry.id}">
                            Bearbeiten
                        </button>
                    </td>
                </tr>
            `;
            }).join('');

            // Event-Listener für die Bearbeiten-Buttons
            const editButtons = tableBody.querySelectorAll('.edit-usage-btn');
            editButtons.forEach(button => {
                button.addEventListener('click', function () {
                    const entryId = this.getAttribute('data-id');
                    openUsageModal(true, entryId);
                });
            });
        }

        // Funktion zum Erstellen der Charts für die Statistikseite
        // Funktion zum Erstellen der Charts für die Statistikseite mit echten Daten
        // Funktion zum Erstellen der Charts für die Statistikseite mit echten Daten
        function createCharts(vehicle) {
            // Charts nur erstellen, wenn der Tab existiert
            if (!document.getElementById('statistics')) return;

            // Versicherungskosten pro Monat berechnen (falls vorhanden)
            // Sicherstellen, dass wir einen numerischen Wert haben
            const insuranceCost = vehicle.insuranceCost ? parseFloat(vehicle.insuranceCost) : 0;
            const monthlyInsuranceCost = insuranceCost / 12;

            // Aktuelle Daten für die letzten 12 Monate generieren
            const currentDate = new Date();
            let costData = []; // Sicherstellen, dass es ein Array ist

            for (let i = 11; i >= 0; i--) {
                const date = new Date(currentDate);
                date.setMonth(currentDate.getMonth() - i);

                const monthName = date.toLocaleDateString('de-DE', {month: 'short'});
                const year = date.getFullYear();

                // Hier könnten in Zukunft weitere Kosten wie Wartung etc. hinzugefügt werden
                costData.push({
                    month: monthName,
                    year: year.toString(),
                    cost: monthlyInsuranceCost.toFixed(2)
                });
            }

            console.log("Generierte Kostendaten:", costData); // Debugging

            // Fahrerdaten - können später aus der echten Nutzungshistorie ermittelt werden
            const driverData = [
                {driver: 'Max Mustermann', usage: 42},
                {driver: 'Erika Musterfrau', usage: 28},
                {driver: 'John Doe', usage: 18},
                {driver: 'Andere', usage: 12}
            ];

            const projectData = [
                {project: 'Digital Transformation', usage: 35},
                {project: 'Vertriebsbesuche', usage: 25},
                {project: 'Schulungen', usage: 20},
                {project: 'Andere', usage: 20}
            ];

            // Kostenchart erstellen
            createCostChart(costData);

            // Fahrer-Pie-Chart erstellen
            createDriverPieChart(driverData);

            // Projekt-Pie-Chart erstellen
            createProjectPieChart(projectData);

            // Kennzahlen aktualisieren
            updateStatisticsSummary(vehicle, costData, driverData);
        }


        // Funktion zum Erstellen des Kostendiagramms
        function createCostChart(data) {
            const chartElement = document.getElementById('costChart');
            if (!chartElement) return;

            const options = {
                chart: {
                    height: 350,
                    type: 'bar',
                    toolbar: {
                        show: false
                    }
                },
                colors: ['#3b82f6'],
                plotOptions: {
                    bar: {
                        columnWidth: '55%',
                        borderRadius: 4
                    }
                },
                dataLabels: {
                    enabled: false
                },
                stroke: {
                    show: true,
                    width: 2,
                    colors: ['transparent']
                },
                xaxis: {
                    categories: data.map(item => `${item.month} ${item.year}`),
                    axisBorder: {
                        show: false
                    },
                    axisTicks: {
                        show: false
                    }
                },
                yaxis: {
                    title: {
                        text: 'Kosten (€)'
                    }
                },
                fill: {
                    opacity: 1
                },
                tooltip: {
                    y: {
                        formatter: function (val) {
                            return val + " €";
                        }
                    }
                }
            };

            const series = [{
                name: 'Kosten',
                data: data.map(item => item.cost)
            }];

            const chart = new ApexCharts(chartElement, {
                ...options,
                series: series
            });

            chart.render();
        }

        // Funktion zum Erstellen des Fahrer-Pie-Charts
        function createDriverPieChart(data) {
            const chartElement = document.getElementById('driverPieChart');
            if (!chartElement) return;

            const options = {
                chart: {
                    type: 'pie',
                    height: 320,
                    toolbar: {
                        show: false
                    }
                },
                colors: ['#3b82f6', '#ef4444', '#f59e0b', '#10b981'],
                labels: data.map(item => item.driver),
                series: data.map(item => item.usage),
                legend: {
                    position: 'bottom'
                },
                tooltip: {
                    y: {
                        formatter: function (val) {
                            return val + "%";
                        }
                    }
                }
            };

            const chart = new ApexCharts(chartElement, options);
            chart.render();
        }

        // Funktion zum Erstellen des Projekt-Pie-Charts
        function createProjectPieChart(data) {
            const chartElement = document.getElementById('projectPieChart');
            if (!chartElement) return;

            const options = {
                chart: {
                    type: 'pie',
                    height: 320,
                    toolbar: {
                        show: false
                    }
                },
                colors: ['#3b82f6', '#ef4444', '#f59e0b', '#10b981'],
                labels: data.map(item => item.project),
                series: data.map(item => item.usage),
                legend: {
                    position: 'bottom'
                },
                tooltip: {
                    y: {
                        formatter: function (val) {
                            return val + "%";
                        }
                    }
                }
            };

            const chart = new ApexCharts(chartElement, options);
            chart.render();
        }

        // Funktion zum Aktualisieren der Statistikzusammenfassung
        // Funktion zur Aktualisierung der Statistikzusammenfassung mit echten Daten
        function updateStatisticsSummary(vehicle, costData, driverData) {
            // Sicherstellen, dass costData ein Array ist, bevor reduce verwendet wird
            if (!Array.isArray(costData)) {
                console.error("costData ist kein Array:", costData);
                costData = []; // Notfallzurücksetzung auf leeres Array
            }

            // Gesamtkosten berechnen mit Fehlerbehandlung
            let totalCost = 0;
            try {
                totalCost = costData.reduce((sum, item) => {
                    // Sicherstellen, dass cost ein numerischer Wert ist
                    const itemCost = parseFloat(item.cost) || 0;
                    return sum + itemCost;
                }, 0);
            } catch (error) {
                console.error("Fehler bei der Berechnung der Gesamtkosten:", error);
            }

            // Reale Daten verwenden wo verfügbar
            const totalKilometers = vehicle.mileage || 0;
            const costPerKm = totalKilometers > 0 ? (totalCost / totalKilometers).toFixed(4) : 0;

            // Auslastung könnte später aus der Nutzungshistorie berechnet werden
            const utilization = 65; // Platzhalter, bis echte Daten verfügbar sind

            // UI aktualisieren
            setElementText('total-kilometers', `${totalKilometers.toLocaleString()} km`);
            setElementText('cost-per-km', `${costPerKm} € / km`);
            setElementText('total-cost', `${totalCost.toLocaleString()} €`);
            setElementText('utilization', `${utilization}%`);
        }

        // === Modal-Funktionen ===

        // Funktion zum Einrichten der Wartungsmodals
        function setupMaintenanceModals() {
            // "Wartung hinzufügen"-Button
            const addMaintenanceBtn = document.getElementById('add-maintenance-btn');
            if (addMaintenanceBtn) {
                addMaintenanceBtn.addEventListener('click', () => openMaintenanceModal(false));
            }

            // Schließen-Buttons für Wartungsmodal
            const closeModalBtns = document.querySelectorAll('.close-modal-btn');
            closeModalBtns.forEach(btn => {
                btn.addEventListener('click', closeMaintenanceModal);
            });

            // Wartungsformular abschicken
            const maintenanceForm = document.getElementById('maintenance-form');
            if (maintenanceForm) {
                maintenanceForm.addEventListener('submit', handleMaintenanceSubmit);
            }
        }

        // Funktion zum Einrichten der Nutzungsmodals
        function setupUsageModals() {
            // "Nutzung hinzufügen"-Button
            const addUsageBtn = document.getElementById('add-usage-btn');
            if (addUsageBtn) {
                addUsageBtn.addEventListener('click', () => openUsageModal(false));
            }

            // Schließen-Buttons für Nutzungsmodal
            const closeModalBtns = document.querySelectorAll('.close-modal-btn');
            closeModalBtns.forEach(btn => {
                btn.addEventListener('click', closeUsageModal);
            });

            // Schließen-Button für aktuelle Nutzung Modal
            const closeCurrentUsageModalBtns = document.querySelectorAll('.close-current-usage-modal-btn');
            closeCurrentUsageModalBtns.forEach(btn => {
                btn.addEventListener('click', closeCurrentUsageModal);
            });

            // Nutzungsformular abschicken
            const usageForm = document.getElementById('usage-form');
            if (usageForm) {
                usageForm.addEventListener('submit', handleUsageSubmit);
            }

            // Formular für aktuelle Nutzung abschicken
            const currentUsageForm = document.getElementById('edit-current-usage-form');
            if (currentUsageForm) {
                currentUsageForm.addEventListener('submit', handleCurrentUsageSubmit);
            }
        }

        // Funktion zum Einrichten des Fahrzeug-Bearbeiten-Modals
        function setupVehicleEditModal() {
            // "Fahrzeug bearbeiten"-Button
            const editVehicleBtn = document.getElementById('edit-vehicle-btn');
            if (editVehicleBtn) {
                editVehicleBtn.addEventListener('click', () => {
                    const editVehicleModal = document.getElementById('edit-vehicle-modal');
                    if (editVehicleModal) {
                        editVehicleModal.classList.remove('hidden');
                    }
                });
            }

            // Schließen-Button für Fahrzeug-Modal
            const closeEditModalBtns = document.querySelectorAll('.close-edit-modal-btn');
            closeEditModalBtns.forEach(btn => {
                btn.addEventListener('click', () => {
                    const editVehicleModal = document.getElementById('edit-vehicle-modal');
                    if (editVehicleModal) {
                        editVehicleModal.classList.add('hidden');
                    }
                });
            });

            // Fahrzeugformular abschicken
            const editVehicleForm = document.getElementById('edit-vehicle-form');
            if (editVehicleForm) {
                editVehicleForm.addEventListener('submit', handleVehicleEditSubmit);
            }
        }

        // Funktion zum Öffnen des Wartungsmodals
        function openMaintenanceModal(isEdit = false, maintenanceId = null) {
            const modal = document.getElementById('maintenance-modal');
            const modalTitle = document.getElementById('maintenance-modal-title');
            const form = document.getElementById('maintenance-form');

            if (!modal || !modalTitle || !form) return;

            // Formulardaten zurücksetzen
            form.reset();

            if (isEdit && maintenanceId) {
                modalTitle.textContent = 'Wartung/Inspektion bearbeiten';

                // Wartungseintrag von der API laden
                fetch(`/api/maintenance/${maintenanceId}`)
                    .then(response => {
                        if (!response.ok) throw new Error('Wartungseintrag nicht gefunden');
                        return response.json();
                    })
                    .then(data => {
                        const maintenance = data.maintenance;

                        // Formularfelder ausfüllen
                        if (maintenance.date) {
                            document.getElementById('maintenance-date').value = formatDateForInput(maintenance.date);
                        }

                        document.getElementById('maintenance-type').value = maintenance.type;
                        document.getElementById('mileage').value = maintenance.mileage || '';
                        document.getElementById('cost').value = maintenance.cost || '';
                        document.getElementById('workshop').value = maintenance.workshop || '';
                        document.getElementById('maintenance-notes').value = maintenance.notes || '';

                        // Verstecktes Feld für die Wartungs-ID hinzufügen
                        let idInput = form.querySelector('input[name="maintenance-id"]');
                        if (!idInput) {
                            idInput = document.createElement('input');
                            idInput.type = 'hidden';
                            idInput.name = 'maintenance-id';
                            form.appendChild(idInput);
                        }
                        idInput.value = maintenanceId;
                    })
                    .catch(error => {
                        console.error('Fehler beim Laden des Wartungseintrags:', error);
                        closeMaintenanceModal();
                        showNotification('Fehler beim Laden des Wartungseintrags', 'error');
                    });
            } else {
                modalTitle.textContent = 'Wartung/Inspektion hinzufügen';

                // Aktuelles Datum vorausfüllen
                const today = new Date();
                document.getElementById('maintenance-date').value = formatDateForInput(today);

                // Das Versteckte ID-Feld entfernen, falls vorhanden
                const idInput = form.querySelector('input[name="maintenance-id"]');
                if (idInput) idInput.remove();
            }

            modal.classList.remove('hidden');
        }

        // Funktion zum Schließen des Wartungsmodals
        function closeMaintenanceModal() {
            const modal = document.getElementById('maintenance-modal');
            if (modal) {
                modal.classList.add('hidden');
            }
        }

        // Verbesserte Funktion zum Laden der Fahrer für das Nutzungsformular
        function openUsageModal(isEdit = false, usageId = null) {
            const modal = document.getElementById('usage-modal');
            if (!modal) return;

            // Modal anzeigen
            modal.classList.remove('hidden');

            // Fahrer für das Formular laden
            loadDriversForUsageForm();

            // Rest der Modal-Initialisierung, abhängig davon ob ein neuer Eintrag oder Bearbeitung
            const modalTitle = document.getElementById('usage-modal-title');
            if (modalTitle) {
                modalTitle.textContent = isEdit ? 'Nutzung bearbeiten' : 'Nutzung eintragen';
            }

            const form = document.getElementById('usage-form');
            if (form) {
                // Formular zurücksetzen
                form.reset();

                // Wenn wir einen vorhandenen Eintrag bearbeiten
                if (isEdit && usageId) {
                    // ID-Feld hinzufügen
                    let idField = form.querySelector('input[name="usage-id"]');
                    if (!idField) {
                        idField = document.createElement('input');
                        idField.type = 'hidden';
                        idField.name = 'usage-id';
                        form.appendChild(idField);
                    }
                    idField.value = usageId;

                    // Daten vom Server laden und Formular vorausfüllen
                    fetch(`/api/usage/${usageId}`)
                        .then(response => response.json())
                        .then(data => {
                            // Formular mit den geladenen Daten füllen
                            // ...
                        })
                        .catch(error => {
                            console.error('Fehler beim Laden der Nutzungsdaten:', error);
                            showNotification('Fehler beim Laden der Nutzungsdaten', 'error');
                        });
                } else {
                    // Neuer Eintrag: Aktuelles Datum/Zeit und Kilometerstand vorausfüllen
                    const now = new Date();
                    const dateInput = form.querySelector('#start-date');
                    const timeInput = form.querySelector('#start-time');

                    if (dateInput) {
                        const year = now.getFullYear();
                        const month = String(now.getMonth() + 1).padStart(2, '0');
                        const day = String(now.getDate()).padStart(2, '0');
                        dateInput.value = `${year}-${month}-${day}`;
                    }

                    if (timeInput) {
                        const hours = String(now.getHours()).padStart(2, '0');
                        const minutes = String(now.getMinutes()).padStart(2, '0');
                        timeInput.value = `${hours}:${minutes}`;
                    }

                    // Aktuellen Kilometerstand vorausfüllen, falls bekannt
                    const mileageInput = form.querySelector('#start-mileage');
                    if (mileageInput) {
                        // Aktuelle Fahrzeugdaten abrufen
                        fetch(`/api/vehicles/${vehicleId}`)
                            .then(response => response.json())
                            .then(data => {
                                if (data.vehicle && data.vehicle.mileage) {
                                    mileageInput.value = data.vehicle.mileage;
                                }
                            })
                            .catch(error => {
                                console.error('Fehler beim Laden des Kilometerstands:', error);
                            });
                    }
                }
            }
        }

        // Funktion zum Schließen des Nutzungsmodals
        function closeUsageModal() {
            const modal = document.getElementById('usage-modal');
            if (modal) {
                modal.classList.add('hidden');
            }
        }

        // Funktion zum Schließen des Modals für aktuelle Nutzung
        function closeCurrentUsageModal() {
            const modal = document.getElementById('edit-usage-modal');
            if (modal) {
                modal.classList.add('hidden');
            }
        }

        // Funktion zum Laden der Fahrer für das Nutzungsformular
        function loadDriversForUsageForm() {
            const driverSelect = document.getElementById('driver');
            if (!driverSelect) {
                console.error("Fahrer-Select-Element nicht gefunden");
                return;
            }

            console.log("Lade Fahrer für das Formular...");

            // Bestehende Optionen löschen, aber die erste Option beibehalten
            const firstOption = driverSelect.firstElementChild;
            driverSelect.innerHTML = '';

            if (firstOption) {
                driverSelect.appendChild(firstOption);
            } else {
                // Standardoption hinzufügen, falls keine existiert
                const defaultOption = document.createElement('option');
                defaultOption.value = '';
                defaultOption.textContent = 'Fahrer auswählen';
                driverSelect.appendChild(defaultOption);
            }

            // Fahrer laden
            fetch('/api/drivers')
                .then(response => {
                    if (!response.ok) {
                        throw new Error(`Fehler beim Laden der Fahrer: ${response.status} ${response.statusText}`);
                    }
                    return response.json();
                })
                .then(data => {
                    console.log("Geladene Fahrerdaten:", data);

                    if (!data.drivers || !Array.isArray(data.drivers) || data.drivers.length === 0) {
                        console.warn("Keine Fahrerdaten verfügbar");
                        return;
                    }

                    // Fahrer zur Auswahlliste hinzufügen
                    data.drivers.forEach(driver => {
                        const option = document.createElement('option');
                        option.value = driver.id;
                        option.textContent = `${driver.firstName} ${driver.lastName}`;
                        driverSelect.appendChild(option);
                        console.log(`Fahrer hinzugefügt: ${driver.firstName} ${driver.lastName} (ID: ${driver.id})`);
                    });
                })
                .catch(error => {
                    console.error("Fehler beim Laden der Fahrer:", error);

                    // Fehlerhafte Option hinzufügen
                    const errorOption = document.createElement('option');
                    errorOption.value = '';
                    errorOption.textContent = 'Fehler beim Laden der Fahrer';
                    errorOption.disabled = true;
                    driverSelect.appendChild(errorOption);

                    // Benutzerbenachrichtigung
                    showNotification('Fehler beim Laden der Fahrer: ' + error.message, 'error');
                });
        }

        // Funktion zur Verarbeitung des Wartungsformulars
        function handleMaintenanceSubmit(event) {
            event.preventDefault();

            const form = event.target;
            const formData = new FormData(form);
            const maintenanceData = {};

            // Formulardaten in ein Objekt umwandeln
            for (let [key, value] of formData.entries()) {
                maintenanceData[key] = value;
            }

            // Prüfen, ob es eine Bearbeitung ist
            const maintenanceId = maintenanceData['maintenance-id'];
            const isEdit = !!maintenanceId;

            // API-Anfrage vorbereiten
            const apiUrl = isEdit ?
                `/api/maintenance/${maintenanceId}` :
                '/api/maintenance';

            const method = isEdit ? 'PUT' : 'POST';

            // Daten in das von der API erwartete Format umwandeln
            const apiData = {
                vehicleId: vehicleId,
                date: maintenanceData['maintenance-date'],
                type: maintenanceData['maintenance-type'],
                mileage: parseInt(maintenanceData.mileage) || 0,
                cost: parseFloat(maintenanceData.cost) || 0,
                workshop: maintenanceData.workshop,
                notes: maintenanceData['maintenance-notes']
            };

            // API-Anfrage senden
            fetch(apiUrl, {
                method: method,
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify(apiData)
            })
                .then(response => {
                    if (!response.ok) throw new Error('Fehler beim Speichern des Wartungseintrags');
                    return response.json();
                })
                .then(data => {
                    closeMaintenanceModal();
                    loadMaintenanceEntries(); // Wartungsliste aktualisieren
                    showNotification(
                        isEdit ? 'Wartungseintrag erfolgreich aktualisiert' :
                            'Wartungseintrag erfolgreich erstellt',
                        'success'
                    );
                })
                .catch(error => {
                    console.error('Fehler:', error);
                    showNotification('Fehler beim Speichern: ' + error.message, 'error');
                });
        }

        // Modifizierte handleUsageSubmit-Funktion, die mit dem Backend-Format kompatibel ist
        function handleUsageSubmit(event) {
            event.preventDefault();

            const form = event.target;
            const formData = new FormData(form);
            const usageData = {};

            // Formulardaten sammeln
            for (let [key, value] of formData.entries()) {
                usageData[key] = value;
            }

            // API-Anfrage vorbereiten
            const usageId = usageData['usage-id'];
            const isEdit = !!usageId;
            const apiUrl = isEdit ? `/api/usage/${usageId}` : '/api/usage';
            const method = isEdit ? 'PUT' : 'POST';

            // Validierung des Fahrers
            if (!usageData.driver) {
                showNotification('Bitte wählen Sie einen Fahrer aus', 'error');
                return;
            }

            // Vereinfachte API-Daten, die exakt dem Format entsprechen, das der Server erwartet
            const apiData = {
                vehicleId: vehicleId,
                driverId: usageData.driver,
                startDate: usageData['start-date'],
                startTime: usageData['start-time'],
                startMileage: parseInt(usageData['start-mileage']) || 0
            };

            // Optionale Felder nur hinzufügen, wenn sie tatsächlich Werte haben
            if (usageData['end-date'] && usageData['end-date'].trim() !== '') {
                apiData.endDate = usageData['end-date'];
            }

            if (usageData['end-time'] && usageData['end-time'].trim() !== '') {
                apiData.endTime = usageData['end-time'];
            }

            if (usageData['end-mileage'] && usageData['end-mileage'].trim() !== '') {
                apiData.endMileage = parseInt(usageData['end-mileage']);
            }

            if (usageData.project && usageData.project.trim() !== '') {
                apiData.purpose = usageData.project; // Das Backend erwartet 'purpose' statt 'project'
            }

            if (usageData['usage-notes'] && usageData['usage-notes'].trim() !== '') {
                apiData.notes = usageData['usage-notes'];
            }

            // Status basierend auf End-Datum/-Zeit setzen
            apiData.status = (usageData['end-date'] && usageData['end-time']) ? 'completed' : 'active';

            console.log("Sende an API:", JSON.stringify(apiData, null, 2));

            // API-Anfrage mit detaillierter Fehlerbehandlung
            fetch(apiUrl, {
                method: method,
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify(apiData)
            })
                .then(response => {
                    console.log("API-Antwort Status:", response.status);

                    return response.text().then(text => {
                        console.log("API-Antwort Text:", text);

                        try {
                            // Versuchen, als JSON zu parsen
                            const data = JSON.parse(text);

                            if (!response.ok) {
                                throw new Error(data.error || 'Fehler beim Speichern des Nutzungseintrags');
                            }

                            return data;
                        } catch (e) {
                            if (!response.ok) {
                                throw new Error('Fehler beim Speichern des Nutzungseintrags: ' + text);
                            }

                            return {}; // Leeres Objekt zurückgeben, wenn kein JSON
                        }
                    });
                })
                .then(data => {
                    closeUsageModal();
                    loadAllData(); // Alle Daten neu laden
                    showNotification(
                        isEdit ? 'Nutzungseintrag erfolgreich aktualisiert' :
                            'Nutzungseintrag erfolgreich erstellt',
                        'success'
                    );
                })
                .catch(error => {

                    // Funktion zur Verarbeitung des Formulars für die aktuelle Nutzung
                    function handleCurrentUsageSubmit(event) {
                        event.preventDefault();

                        const form = event.target;
                        const formData = new FormData(form);
                        const usageData = {};

                        // Formulardaten in ein Objekt umwandeln
                        for (let [key, value] of formData.entries()) {
                            usageData[key] = value;
                        }

                        console.log("Gesammelte Formulardaten für aktuelle Nutzung:", usageData); // Debug-Ausgabe

                        // API-Anfrage vorbereiten
                        const usageId = usageData['usage-id'];
                        if (!usageId) {
                            showNotification('Fehler: Keine Nutzungs-ID gefunden', 'error');
                            return;
                        }

                        // Validierung der Pflichtfelder
                        if (!usageData['current-driver']) {
                            showNotification('Bitte wählen Sie einen Fahrer aus', 'error');
                            return;
                        }

                        if (!usageData['current-start-date'] || !usageData['current-start-time']) {
                            showNotification('Bitte geben Sie Startdatum und Startzeit an', 'error');
                            return;
                        }

                        // Daten in das von der API erwartete Format umwandeln
                        const apiData = {
                            vehicleId: vehicleId,
                            driverId: usageData['current-driver'],
                            startDate: usageData['current-start-date'],
                            startTime: usageData['current-start-time'],
                            endDate: usageData['current-end-date'] || null,
                            endTime: usageData['current-end-time'] || null,
                            project: usageData['current-project'] || "",
                            purpose: usageData['current-project'] || "", // Duplizieren für Kompatibilität
                            department: usageData['current-department'] || "",
                            status: usageData['usage-status'] || 'active',
                            notes: usageData['current-usage-notes'] || "",
                            // Da wir eine bestehende Nutzung bearbeiten, brauchen wir möglicherweise den aktuellen Kilometerstand
                            startMileage: parseInt(usageData['start-mileage'] || 0)
                        };

                        console.log("Sende aktualisierte Nutzungsdaten an API:", apiData); // Debug-Ausgabe

                        // API-Anfrage senden
                        fetch(`/api/usage/${usageId}`, {
                            method: 'PUT',
                            headers: {
                                'Content-Type': 'application/json'
                            },
                            body: JSON.stringify(apiData)
                        })
                            .then(response => {
                                if (!response.ok) {
                                    return response.text().then(text => {
                                        console.error("API-Fehlerantwort:", text);
                                        throw new Error('Fehler beim Aktualisieren der aktuellen Nutzung: ' + text);
                                    });
                                }
                                return response.json();
                            })
                            .then(data => {
                                closeCurrentUsageModal();
                                loadVehicleData(); // Fahrzeugdaten komplett neu laden
                                showNotification('Aktuelle Nutzung erfolgreich aktualisiert', 'success');
                            })
                            .catch(error => {
                                console.error('Fehler:', error);
                                showNotification('Fehler beim Speichern: ' + error.message, 'error');
                            });
                    }

                    // Funktion zur Verarbeitung des Fahrzeug-Bearbeiten-Formulars
                    function handleVehicleEditSubmit(event) {
                        event.preventDefault();

                        const form = event.target;
                        const formData = new FormData(form);
                        const vehicleData = {};

                        // Formulardaten in ein Objekt umwandeln
                        for (let [key, value] of formData.entries()) {
                            vehicleData[key] = value;
                        }

                        console.log("Gesammelte Formulardaten:", vehicleData); // Debug-Ausgabe

                        // Marke und Modell aufteilen
                        let brand = "";
                        let model = "";

                        if (vehicleData.model) {
                            const brandModelParts = vehicleData.model.split(' ');
                            if (brandModelParts.length > 1) {
                                brand = brandModelParts[0];
                                model = brandModelParts.slice(1).join(' ');
                            } else {
                                brand = vehicleData.model;
                            }
                        }

                        // Validierung der Pflichtfelder
                        if (!vehicleData.license_plate) {
                            showNotification('Bitte geben Sie ein Kennzeichen ein', 'error');
                            return;
                        }

                        // Daten in das von der API erwartete Format umwandeln
                        const apiData = {
                            licensePlate: vehicleData.license_plate,
                            brand: brand,
                            model: model,
                            year: parseInt(vehicleData.year) || null,
                            color: vehicleData.color || "",
                            vin: vehicleData.vin || "",
                            fuelType: vehicleData.fuel_type || "",
                            mileage: parseInt(vehicleData.current_mileage) || 0,
                            registrationDate: vehicleData.registration_date || null,
                            nextInspectionDate: vehicleData.next_inspection || null,
                            insuranceCompany: vehicleData.insurance || "",
                            insuranceNumber: vehicleData.insurance_number || "",
                            insuranceType: vehicleData.insurance_type || "",
                            insuranceCost: parseFloat(vehicleData.insurance_cost) || 0,
                            notes: vehicleData.vehicle_notes || ""
                        };

                        console.log("Sende Fahrzeugdaten an API:", apiData); // Debug-Ausgabe

                        // API-Anfrage senden
                        fetch(`/api/vehicles/${vehicleId}`, {
                            method: 'PUT',
                            headers: {
                                'Content-Type': 'application/json'
                            },
                            body: JSON.stringify(apiData)
                        })
                            .then(response => {
                                if (!response.ok) {
                                    return response.text().then(text => {
                                        console.error("API-Fehlerantwort:", text);
                                        throw new Error('Fehler beim Aktualisieren des Fahrzeugs: ' + text);
                                    });
                                }
                                return response.json();
                            })
                            .then(data => {
                                const editVehicleModal = document.getElementById('edit-vehicle-modal');
                                if (editVehicleModal) {
                                    editVehicleModal.classList.add('hidden');
                                }

                                loadVehicleData(); // Fahrzeugdaten komplett neu laden
                                showNotification('Fahrzeug erfolgreich aktualisiert', 'success');
                            })
                            .catch(error => {
                                console.error('Fehler:', error);
                                showNotification('Fehler beim Speichern: ' + error.message, 'error');
                            });
                    }

                    // === Hilfsfunktionen ===

                    // Funktion zum Formatieren von Datumsangaben
                    function formatDate(dateString) {
                        if (!dateString) return '-';

                        const date = new Date(dateString);
                        if (isNaN(date.getTime())) return '-';

                        return date.toLocaleDateString('de-DE', {
                            day: '2-digit',
                            month: '2-digit',
                            year: 'numeric'
                        });
                    }

                    // Funktion zum Formatieren von Datums- und Zeitangaben
                    function formatDateTime(dateString) {
                        if (!dateString) return '-';

                        const date = new Date(dateString);
                        if (isNaN(date.getTime())) return '-';

                        return date.toLocaleDateString('de-DE', {
                            day: '2-digit',
                            month: '2-digit',
                            year: 'numeric'
                        }) + ', ' + date.toLocaleTimeString('de-DE', {
                            hour: '2-digit',
                            minute: '2-digit'
                        }) + ' Uhr';
                    }

                    // Funktion zum Formatieren eines Datums für Input-Felder
                    function formatDateForInput(dateString) {
                        if (!dateString) return '';

                        const date = new Date(dateString);
                        if (isNaN(date.getTime())) return '';

                        const year = date.getFullYear();
                        const month = String(date.getMonth() + 1).padStart(2, '0');
                        const day = String(date.getDate()).padStart(2, '0');

                        return `${year}-${month}-${day}`;
                    }

                    // Funktion zum Formatieren einer Zeit für Input-Felder
                    function formatTimeForInput(dateString) {
                        if (!dateString) return '';

                        const date = new Date(dateString);
                        if (isNaN(date.getTime())) return '';

                        const hours = String(date.getHours()).padStart(2, '0');
                        const minutes = String(date.getMinutes()).padStart(2, '0');

                        return `${hours}:${minutes}`;
                    }

                    // Funktion zum Setzen von Text in einem Element
                    function setElementText(elementId, text) {
                        const element = document.getElementById(elementId);
                        if (element) {
                            element.textContent = text;
                        }
                    }

                    // Funktion zum Anzeigen von Benachrichtigungen (kann je nach UI-Framework angepasst werden)
                    function showNotification(message, type = 'info') {
                        // Hier könnte eine UI-Benachrichtigungsfunktion eingebunden werden
                        console.log(`Benachrichtigung (${type}):`, message);

                        // Einfache Alert-Nachricht, in der Produktion durch ein besseres UI-Element ersetzen
                        if (type === 'error') {
                            alert('Fehler: ' + message);
                        } else if (type === 'success') {
                            alert('Erfolg: ' + message);
                        }
                    }
                });
        }
    }
);

// JavaScript für die Integration von Tankkosten in den Statistik-Tab
document.addEventListener('DOMContentLoaded', function() {
    // Event-Listener für Tab-Wechsel
    const tabButtons = document.querySelectorAll('.vehicle-tab-btn');
    tabButtons.forEach(button => {
        button.addEventListener('click', function() {
            const tabId = this.getAttribute('data-tab');
            if (tabId === 'statistics') {
                // Laden der Kraftstoffstatistiken, wenn der Statistik-Tab ausgewählt wird
                loadFuelStatsForStatisticsTab();
            }
        });
    });

    // Funktion zum Laden der Kraftstoffstatistiken für den Statistik-Tab
    function loadFuelStatsForStatisticsTab() {
        const vehicleId = window.location.pathname.split('/').pop();

        fetch(`/api/fuelcosts/vehicle/${vehicleId}`)
            .then(response => {
                if (!response.ok) throw new Error('Fehler beim Laden der Tankkosten');
                return response.json();
            })
            .then(data => {
                calculateAndDisplayFuelStats(data.fuelCosts || [], data.vehicle);
            })
            .catch(error => {
                console.error('Fehler beim Laden der Tankkosten:', error);
            });
    }

    // Funktion zum Berechnen und Anzeigen der Kraftstoffstatistiken
    function calculateAndDisplayFuelStats(fuelCosts, vehicle) {
        if (!fuelCosts || !fuelCosts.length) return;

        // Gesamtkosten berechnen
        let totalCosts = 0;
        let totalDistance = 0;
        let totalFuel = 0;

        // Monatliche Kosten für Diagramm
        const monthlyCosts = {};
        const currentYear = new Date().getFullYear();

        // Sortieren nach Datum (älteste zuerst)
        fuelCosts.sort((a, b) => new Date(a.date) - new Date(b.date));

        // Erste Berechnung für Gesamtkosten und monatliche Aufschlüsselung
        fuelCosts.forEach(entry => {
            totalCosts += entry.totalCost;

            // Für das monatliche Kostendiagramm
            const entryDate = new Date(entry.date);
            const monthKey = `${entryDate.getFullYear()}-${entryDate.getMonth() + 1}`;

            if (!monthlyCosts[monthKey]) {
                monthlyCosts[monthKey] = {
                    total: 0,
                    month: entryDate.toLocaleString('de-DE', { month: 'short' }),
                    year: entryDate.getFullYear()
                };
            }

            monthlyCosts[monthKey].total += entry.totalCost;
        });

        // Berechnung der gefahrenen Kilometer und Verbrauch
        for (let i = 1; i < fuelCosts.length; i++) {
            const current = fuelCosts[i];
            const previous = fuelCosts[i-1];

            // Differenz der Kilometerstände berechnen
            const distance = current.mileage - previous.mileage;

            // Nur positive Distanzen berücksichtigen
            if (distance > 0) {
                totalDistance += distance;

                // Verbrauch je nach Kraftstofftyp hinzufügen
                if (current.fuelType === previous.fuelType &&
                    (current.fuelType === 'Diesel' || current.fuelType === 'Benzin' || current.fuelType === 'Gas')) {
                    totalFuel += previous.amount; // Der Verbrauch basiert auf der vorherigen Tankfüllung
                }
            }
        }

        // Durchschnittsverbrauch berechnen (L/100km oder kWh/100km)
        let avgConsumption = 0;
        let consumptionUnit = 'L/100km';

        if (totalDistance > 0 && totalFuel > 0) {
            avgConsumption = (totalFuel / totalDistance) * 100;

            if (fuelCosts[0].fuelType === 'Elektro') {
                consumptionUnit = 'kWh/100km';
            }
        }

        // Kosten pro Kilometer berechnen
        const costPerKm = totalDistance > 0 ? totalCosts / totalDistance : 0;

        // Statistik-Elemente aktualisieren
        const statsAvgConsumption = document.getElementById('stats-avg-consumption');
        const statsConsumptionUnit = document.getElementById('stats-consumption-unit');
        const statsTotalFuelCosts = document.getElementById('stats-total-fuel-costs');
        const statsCostPerKm = document.getElementById('stats-cost-per-km');

        if (statsAvgConsumption) statsAvgConsumption.textContent = avgConsumption.toFixed(2);
        if (statsConsumptionUnit) statsConsumptionUnit.textContent = consumptionUnit;
        if (statsTotalFuelCosts) statsTotalFuelCosts.textContent = formatCurrency(totalCosts);
        if (statsCostPerKm) statsCostPerKm.textContent = formatCurrency(costPerKm) + '/km';

        // Diagramm erstellen
        createFuelStatsChart(monthlyCosts);

        // Auch die allgemeinen Statistikfelder aktualisieren
        updateGeneralStatistics(totalDistance, costPerKm, totalCosts);
    }

    // Funktion zum Erstellen des Tankkosten-Charts
    function createFuelStatsChart(monthlyCosts) {
        const chartElement = document.getElementById('stats-fuel-costs-chart');
        if (!chartElement || !window.ApexCharts) return;

        // Daten für die letzten 12 Monate extrahieren
        const today = new Date();
        const last12Months = [];

        for (let i = 11; i >= 0; i--) {
            const d = new Date(today);
            d.setMonth(d.getMonth() - i);
            const yearMonth = `${d.getFullYear()}-${d.getMonth() + 1}`;
            const month = d.toLocaleString('de-DE', { month: 'short' });
            const year = d.getFullYear();

            last12Months.push({
                key: yearMonth,
                label: `${month} ${year}`,
                cost: monthlyCosts[yearMonth] ? monthlyCosts[yearMonth].total : 0
            });
        }

        // Chart-Daten vorbereiten
        const categories = last12Months.map(m => m.label);
        const costs = last12Months.map(m => m.cost);

        const options = {
            chart: {
                type: 'bar',
                height: 350,
                toolbar: {
                    show: false
                }
            },
            colors: ['#4F46E5'],
            series: [{
                name: 'Tankkosten',
                data: costs
            }],
            xaxis: {
                categories: categories,
                labels: {
                    style: {
                        fontSize: '12px'
                    }
                }
            },
            yaxis: {
                title: {
                    text: 'Kosten (€)'
                }
            },
            tooltip: {
                y: {
                    formatter: function(value) {
                        return formatCurrency(value);
                    }
                }
            },
            plotOptions: {
                bar: {
                    borderRadius: 4,
                    dataLabels: {
                        position: 'top'
                    }
                }
            },
            dataLabels: {
                enabled: false
            }
        };

        // Chart löschen, falls es bereits existiert
        if (window.statsChart) {
            window.statsChart.destroy();
        }

        // Neues Chart erstellen und global speichern
        window.statsChart = new ApexCharts(chartElement, options);
        window.statsChart.render();
    }

    // Funktion zur Aktualisierung der allgemeinen Statistiken
    function updateGeneralStatistics(totalDistance, costPerKm, totalCosts) {
        const totalKilometers = document.getElementById('total-kilometers');
        const costPerKmElement = document.getElementById('cost-per-km');
        const totalCostElement = document.getElementById('total-cost');

        if (totalKilometers) totalKilometers.textContent = formatNumber(totalDistance) + ' km';
        if (costPerKmElement) costPerKmElement.textContent = formatCurrency(costPerKm) + '/km';
        if (totalCostElement) totalCostElement.textContent = formatCurrency(totalCosts);
    }

    // Hilfsfunktionen für die Formatierung
    function formatCurrency(number) {
        if (number === undefined || number === null) return '-';
        return parseFloat(number).toLocaleString('de-DE', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + ' €';
    }

    function formatNumber(number, decimals = 0) {
        if (number === undefined || number === null) return '-';
        return parseFloat(number).toLocaleString('de-DE', { minimumFractionDigits: decimals, maximumFractionDigits: decimals });
    }
});

// Funktion zum Öffnen des Modals für Zulassung & Versicherung
function openRegistrationModal() {
    const modal = document.getElementById('registration-modal');
    if (!modal) return;

    const vehicleId = window.location.pathname.split('/').pop();

    // Fahrzeugdaten laden
    fetch(`/api/vehicles/${vehicleId}`)
        .then(response => response.json())
        .then(data => {
            const vehicle = data.vehicle;

            // Formularfelder befüllen
            document.getElementById('registration-date').value = formatDateForInput(vehicle.registrationDate);
            document.getElementById('registration-expiry').value = formatDateForInput(vehicle.registrationExpiry);
            document.getElementById('next-inspection').value = formatDateForInput(vehicle.nextInspectionDate);
            document.getElementById('insurance-company').value = vehicle.insuranceCompany || '';
            document.getElementById('insurance-number').value = vehicle.insuranceNumber || '';
            document.getElementById('insurance-type').value = vehicle.insuranceType || 'Haftpflicht';
            document.getElementById('insurance-expiry').value = formatDateForInput(vehicle.insuranceExpiry);
            document.getElementById('insurance-cost').value = vehicle.insuranceCost || '';

            // Verstecktes Feld für die Vehicle-ID
            let vehicleIdInput = document.querySelector('#registration-form input[name="vehicle-id"]');
            if (!vehicleIdInput) {
                vehicleIdInput = document.createElement('input');
                vehicleIdInput.type = 'hidden';
                vehicleIdInput.name = 'vehicle-id';
                document.getElementById('registration-form').appendChild(vehicleIdInput);
            }
            vehicleIdInput.value = vehicleId;

            // Modal anzeigen
            modal.classList.remove('hidden');
        })
        .catch(error => {
            console.error('Fehler beim Laden der Fahrzeugdaten:', error);
            alert('Fehler beim Laden der Fahrzeugdaten: ' + error.message);
        });
}

// Funktion zum Schließen des Modals
function closeRegistrationModal() {
    const modal = document.getElementById('registration-modal');
    if (modal) {
        modal.classList.add('hidden');
    }
}

// Funktion zur Verarbeitung des Formularabsendens
function handleRegistrationSubmit(event) {
    event.preventDefault();

    const form = event.target;
    const formData = new FormData(form);
    const registrationData = {};

    // Formulardaten sammeln
    for (let [key, value] of formData.entries()) {
        registrationData[key] = value;
    }

    const vehicleId = registrationData['vehicle-id'];
    if (!vehicleId) {
        alert('Fahrzeug-ID fehlt. Bitte laden Sie die Seite neu.');
        return;
    }

    // Aktuelles Fahrzeug abrufen, um den vorhandenen Stand zu erhalten
    fetch(`/api/vehicles/${vehicleId}`)
        .then(response => response.json())
        .then(data => {
            const vehicle = data.vehicle;

            // Daten zusammenführen
            const updateData = {
                registrationDate: registrationData['registration-date'] || null,
                registrationExpiry: registrationData['registration-expiry'] || null,
                nextInspectionDate: registrationData['next-inspection'] || null,
                insuranceCompany: registrationData['insurance-company'] || '',
                insuranceNumber: registrationData['insurance-number'] || '',
                insuranceType: registrationData['insurance-type'] || 'Haftpflicht',
                insuranceExpiry: registrationData['insurance-expiry'] || null,
                insuranceCost: parseFloat(registrationData['insurance-cost']) || 0
            };

            // Fahrzeug aktualisieren (nur die relevanten Felder)
            return fetch(`/api/vehicles/${vehicleId}`, {
                method: 'PUT',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    ...vehicle,
                    ...updateData
                })
            });
        })
        .then(response => {
            if (!response.ok) {
                return response.text().then(text => {
                    throw new Error(text);
                });
            }
            return response.json();
        })
        .then(data => {
            closeRegistrationModal();
            alert('Zulassungs- und Versicherungsdaten erfolgreich aktualisiert!');

            // Anzeige aktualisieren
            updateRegistrationDisplay(data.vehicle);
        })
        .catch(error => {
            console.error('Fehler beim Speichern der Daten:', error);
            alert('Fehler beim Speichern der Daten: ' + error.message);
        });
}

// Funktion zum Aktualisieren der Anzeige im Registration-Tab
function updateRegistrationDisplay(vehicle) {
    // Anzeige der Registrierungsdaten aktualisieren
    document.getElementById('registration-date-display').textContent = formatDate(vehicle.registrationDate) || '-';
    document.getElementById('registration-expiry-display').textContent = formatDate(vehicle.registrationExpiry) || '-';
    document.getElementById('next-inspection-display').textContent = formatDate(vehicle.nextInspectionDate) || '-';
    document.getElementById('insurance-company-display').textContent = vehicle.insuranceCompany || '-';
    document.getElementById('insurance-number-display').textContent = vehicle.insuranceNumber || '-';
    document.getElementById('insurance-type-display').textContent = vehicle.insuranceType || '-';
    document.getElementById('insurance-expiry-display').textContent = formatDate(vehicle.insuranceExpiry) || '-';
    document.getElementById('insurance-cost-display').textContent = vehicle.insuranceCost ? formatCurrency(vehicle.insuranceCost) : '-';
}

// Hilfsfunktion zur Initialisierung des Registrierungstabs
function initRegistrationTab(vehicle) {
    updateRegistrationDisplay(vehicle);
}
