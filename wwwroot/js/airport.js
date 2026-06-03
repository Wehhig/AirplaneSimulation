async function startSimulation() {
    await fetch("/Airport/Start", { method: "POST" });
    await loadState();
}

async function stopSimulation() {
    await fetch("/Airport/Stop", { method: "POST" });
    await loadState();
}

async function resetSimulation() {
    await fetch("/Airport/Reset", { method: "POST" });
    await loadState();
}

async function addPlane() {
    await fetch("/Airport/AddPlane", { method: "POST" });
    await loadState();
}

async function loadState() {
    const response = await fetch("/Airport/State");
    const state = await response.json();

    renderStats(state.stats);
    renderPlanes(state.airplanes);
    renderLogs(state.logs);
}

function renderStats(stats) {
    document.getElementById("stat-running").textContent = stats.isRunning ? "Yes" : "No";
    document.getElementById("stat-runways").textContent = stats.availableRunways + " / " + stats.runwayCount;
    document.getElementById("stat-waiting").textContent = stats.waiting;
    document.getElementById("stat-landing").textContent = stats.landing;
    document.getElementById("stat-gate").textContent = stats.atGate;
    document.getElementById("stat-served").textContent = stats.servedPlanes;
}

function renderPlanes(planes) {
    const table = document.getElementById("planes-table");
    table.innerHTML = "";

    for (const plane of planes) {
        const row = document.createElement("tr");

        row.innerHTML =
            "<td>" + plane.flightNumber + "</td>" +
            "<td>" + plane.status + "</td>" +
            "<td>" + valueOrDash(plane.runwayNumber) + "</td>" +
            "<td>" + valueOrDash(plane.gateNumber) + "</td>";

        table.appendChild(row);
    }
}

function renderLogs(logs) {
    const logBox = document.getElementById("event-log");
    logBox.innerHTML = "";

    for (const log of logs) {
        const item = document.createElement("div");
        item.textContent = log;
        logBox.appendChild(item);
    }
}

function valueOrDash(value) {
    if (value === null || value === undefined) {
        return "-";
    }

    return value;
}

setInterval(loadState, 1000);
loadState();