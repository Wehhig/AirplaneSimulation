let currentTab = "simulation";

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

function showTab(name) {
    currentTab = name;

    document.getElementById("view-simulation").classList.remove("active");
    document.getElementById("view-admin").classList.remove("active");
    document.getElementById("tab-simulation").classList.remove("active");
    document.getElementById("tab-admin").classList.remove("active");

    document.getElementById("view-" + name).classList.add("active");
    document.getElementById("tab-" + name).classList.add("active");
}

function renderState(state) {
    renderStats(state.stats);
    renderPlanes(state.airplanes);
    renderLogs(state.logs);
    renderVisualPlanes(state.airplanes);
    renderSidePanel(state.stats, state.logs);
}

function renderStats(stats) {
    document.getElementById("stat-running").textContent = stats.isRunning ? "Yes" : "No";
    document.getElementById("stat-runways").textContent = stats.availableRunways + " / " + stats.runwayCount;
    document.getElementById("stat-in-air").textContent = stats.inAir;
    document.getElementById("stat-waiting").textContent = stats.waiting;
    document.getElementById("stat-landing").textContent = stats.landing;
    document.getElementById("stat-served").textContent = stats.servedPlanes;

    const status = document.getElementById("airport-status");

    if (!stats.isRunning) {
        status.textContent = "Stopped";
        status.className = "airport-status stopped";
    } else if (stats.availableRunways === 0) {
        status.textContent = "Busy";
        status.className = "airport-status busy";
    } else {
        status.textContent = "Running";
        status.className = "airport-status running";
    }
}

function renderSidePanel(stats, logs) {
    document.getElementById("side-active").textContent = stats.activePlanes;
    document.getElementById("side-gate").textContent = stats.atGate;
    document.getElementById("side-taking-off").textContent = stats.takingOff;
    document.getElementById("side-departed").textContent = stats.departed;

    const logBox = document.getElementById("short-event-log");
    logBox.innerHTML = "";

    for (const log of logs.slice(0, 8)) {
        const item = document.createElement("div");
        item.textContent = log;
        logBox.appendChild(item);
    }
}

function renderPlanes(planes) {
    const table = document.getElementById("planes-table");
    table.innerHTML = "";

    for (const plane of planes) {
        const row = document.createElement("tr");

        row.innerHTML =
            "<td>" + plane.flightNumber + "</td>" +
            "<td><span class='status-pill " + getStatusClass(plane.status) + "'>" + plane.status + "</span></td>" +
            "<td>" + valueOrDash(plane.runwayNumber) + "</td>" +
            "<td>" + valueOrDash(plane.gateNumber) + "</td>" +
            "<td>" + formatTime(plane.updatedAt) + "</td>";

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

function renderVisualPlanes(planes) {
    const layer = document.getElementById("plane-layer");
    const activeIds = [];

    for (const plane of planes) {
        if (plane.status === "Departed" || plane.status === "Cancelled") {
            continue;
        }

        activeIds.push("plane-" + plane.id);
        let element = document.getElementById("plane-" + plane.id);

        if (!element) {
            element = document.createElement("div");
            element.id = "plane-" + plane.id;
            element.className = "plane";
            element.innerHTML = "✈<span>" + plane.flightNumber + "</span>";
            layer.appendChild(element);
        }

        const position = getPlanePosition(plane);
        element.className = "plane " + getPlaneClass(plane.status);
        element.style.left = position.x / 10 + "%";
        element.style.top = position.y / 4.2 + "%";
        element.style.transform = "translate(-50%, -50%) rotate(" + position.rotation + "deg)";
    }

    const elements = layer.querySelectorAll(".plane");

    for (const element of elements) {
        if (!activeIds.includes(element.id)) {
            element.remove();
        }
    }
}

function getPlanePosition(plane) {
    if (plane.status === "Flying") {
        const positions = [
            { x: 185, y: 75, rotation: -20 },
            { x: 310, y: 45, rotation: 10 },
            { x: 430, y: 90, rotation: 35 },
            { x: 310, y: 145, rotation: 180 }
        ];

        return positions[plane.id % positions.length];
    }

    if (plane.status === "WaitingForRunway") {
        return { x: 300, y: 95, rotation: 0 };
    }

    if (plane.status === "Landing") {
        if (plane.runwayNumber === 2) {
            return { x: 580, y: 225, rotation: 0 };
        }

        return { x: 520, y: 197, rotation: 0 };
    }

    if (plane.status === "TaxiingToGate") {
        return getGatePosition(plane.gateNumber, 282, 90);
    }

    if (plane.status === "AtGate") {
        return getGatePosition(plane.gateNumber, 318, 90);
    }

    if (plane.status === "PreparingDeparture") {
        return getGatePosition(plane.gateNumber, 300, 0);
    }

    if (plane.status === "TakingOff") {
        if (plane.runwayNumber === 2) {
            return { x: 760, y: 225, rotation: 0 };
        }

        return { x: 760, y: 197, rotation: 0 };
    }

    return { x: 90, y: 360, rotation: 0 };
}

function getGatePosition(gate, y, rotation) {
    if (gate === 1) {
        return { x: 372, y: y, rotation: rotation };
    }

    if (gate === 2) {
        return { x: 512, y: y, rotation: rotation };
    }

    return { x: 652, y: y, rotation: rotation };
}

function getPlaneClass(status) {
    if (status === "Flying") return "plane-flying";
    if (status === "WaitingForRunway") return "plane-waiting";
    if (status === "Landing") return "plane-landing";
    if (status === "TaxiingToGate") return "plane-taxi";
    if (status === "AtGate") return "plane-gate";
    if (status === "PreparingDeparture") return "plane-preparing";
    if (status === "TakingOff") return "plane-taking-off";
    return "";
}

function getStatusClass(status) {
    if (status === "Flying") return "status-blue";
    if (status === "WaitingForRunway") return "status-yellow";
    if (status === "Landing") return "status-orange";
    if (status === "TaxiingToGate") return "status-gray";
    if (status === "AtGate") return "status-green";
    if (status === "PreparingDeparture") return "status-purple";
    if (status === "TakingOff") return "status-red";
    if (status === "Departed") return "status-dark";
    return "status-gray";
}

function formatTime(value) {
    if (!value) {
        return "-";
    }

    const date = new Date(value);
    return date.toLocaleTimeString();
}

function valueOrDash(value) {
    if (value === null || value === undefined) {
        return "-";
    }

    return value;
}
