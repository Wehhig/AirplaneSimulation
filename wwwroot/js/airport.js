let connection = new signalR.HubConnectionBuilder()
    .withUrl("/airportHub")
    .withAutomaticReconnect()
    .build();

connection.on("ReceiveAirportState", function (state) {
    renderState(state);
});

connection.start().then(function () {
    loadState();
});

async function startSimulation() {
    const state = await sendPost("/Airport/Start");
    renderState(state);
}

async function stopSimulation() {
    const state = await sendPost("/Airport/Stop");
    renderState(state);
}

async function resetSimulation() {
    const state = await sendPost("/Airport/Reset");
    renderState(state);
}

async function addPlane() {
    const state = await sendPost("/Airport/AddPlane");
    renderState(state);
}

async function sendPost(url) {
    const response = await fetch(url, { method: "POST" });
    return await response.json();
}

async function loadState() {
    const response = await fetch("/Airport/State");
    const state = await response.json();
    renderState(state);
}

function renderState(state) {
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