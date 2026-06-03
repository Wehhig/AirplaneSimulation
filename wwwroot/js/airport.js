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

function showTab(tabName) {
    document.getElementById("simulation-view").classList.remove("active");
    document.getElementById("admin-view").classList.remove("active");
    document.getElementById("simulation-tab").classList.remove("active");
    document.getElementById("admin-tab").classList.remove("active");

    document.getElementById(tabName + "-view").classList.add("active");
    document.getElementById(tabName + "-tab").classList.add("active");
}

function renderState(state) {
    renderStats(state.stats);
    renderPlanesTable(state.airplanes);
    renderLogs(state.logs);
    renderPlaneMap(state.airplanes);
}

function renderStats(stats) {
    document.getElementById("stat-running").textContent = stats.isRunning ? "Yes" : "No";
    document.getElementById("stat-runways").textContent = stats.availableRunways + " / " + stats.runwayCount;
    document.getElementById("stat-air").textContent = stats.inAir;
    document.getElementById("stat-waiting").textContent = stats.waiting;
    document.getElementById("stat-landing").textContent = stats.landing;
    document.getElementById("stat-served").textContent = stats.servedPlanes;

    document.getElementById("state-active").textContent = stats.activePlanes;
    document.getElementById("state-gate").textContent = stats.atGate;
    document.getElementById("state-takingoff").textContent = stats.takingOff;
    document.getElementById("state-departed").textContent = stats.departed;

    const pill = document.getElementById("airport-status-pill");

    if (!stats.isRunning) {
        pill.textContent = "Stopped";
        pill.className = "status-pill stopped";
    } else if (stats.availableRunways === 0) {
        pill.textContent = "Busy";
        pill.className = "status-pill busy";
    } else {
        pill.textContent = "Normal";
        pill.className = "status-pill normal";
    }
}

function renderPlanesTable(planes) {
    const table = document.getElementById("planes-table");
    table.innerHTML = "";

    for (const plane of planes) {
        const row = document.createElement("tr");

        row.innerHTML =
            "<td>" + plane.flightNumber + "</td>" +
            "<td><span class='status-badge " + plane.status + "'>" + plane.status + "</span></td>" +
            "<td>" + valueOrDash(plane.runwayNumber) + "</td>" +
            "<td>" + valueOrDash(plane.gateNumber) + "</td>" +
            "<td>" + formatTime(plane.updatedAt) + "</td>";

        table.appendChild(row);
    }
}

function renderLogs(logs) {
    const logBox = document.getElementById("event-log");
    const recentLogBox = document.getElementById("recent-log");

    logBox.innerHTML = "";
    recentLogBox.innerHTML = "";

    for (const log of logs) {
        const item = document.createElement("div");
        item.textContent = log;
        logBox.appendChild(item);
    }

    for (const log of logs.slice(0, 8)) {
        const item = document.createElement("div");
        item.textContent = log;
        recentLogBox.appendChild(item);
    }
}

function renderPlaneMap(planes) {
    const layer = document.getElementById("plane-layer");
    const activePlanes = planes.filter(function (plane) {
        return plane.status !== "Departed" && plane.status !== "Cancelled";
    });

    const activeIds = activePlanes.map(function (plane) {
        return "plane-" + plane.id;
    });

    const existing = Array.from(layer.querySelectorAll(".plane"));

    for (const item of existing) {
        if (!activeIds.includes(item.id)) {
            item.remove();
        }
    }

    for (const plane of activePlanes) {
        const position = getPlanePosition(plane);
        let planeElement = document.getElementById("plane-" + plane.id);

        if (planeElement === null) {
            planeElement = document.createElement("div");
            planeElement.id = "plane-" + plane.id;
            planeElement.className = "plane";
            planeElement.innerHTML =
                "<div class='plane-symbol'>✈</div>" +
                "<div class='plane-label'></div>";
            layer.appendChild(planeElement);
        }

        const symbol = planeElement.querySelector(".plane-symbol");
        const label = planeElement.querySelector(".plane-label");

        planeElement.className = "plane status-" + plane.status;
        planeElement.style.left = percent(position.x, 900);
        planeElement.style.top = percent(position.y, 480);
        symbol.style.transform = "rotate(" + position.rotation + "deg)";
        label.textContent = plane.flightNumber;
    }
}

function getPlanePosition(plane) {
    if (plane.status === "Flying") {
        return holdingPosition(plane.id, 0);
    }

    if (plane.status === "WaitingForRunway") {
        return holdingPosition(plane.id, 35);
    }

    if (plane.status === "Landing") {
        const runwayY = getRunwayY(plane.runwayNumber);
        return { x: 625, y: runwayY, rotation: 40 };
    }

    if (plane.status === "TaxiingToGate") {
        const gate = getGatePosition(plane.gateNumber);
        return { x: gate.x, y: 330, rotation: 90 };
    }

    if (plane.status === "AtGate") {
        const gate = getGatePosition(plane.gateNumber);
        return { x: gate.x, y: 365, rotation: 0 };
    }

    if (plane.status === "PreparingDeparture") {
        const gate = getGatePosition(plane.gateNumber);
        return { x: gate.x, y: 365, rotation: 0 };
    }

    if (plane.status === "TakingOff") {
        const runwayY = getRunwayY(plane.runwayNumber);
        return { x: 760, y: runwayY - 20, rotation: 25 };
    }

    return { x: 270, y: 110, rotation: 0 };
}

function holdingPosition(id, shift) {
    const places = [
        { x: 120, y: 108, rotation: -15 },
        { x: 270, y: 50, rotation: 5 },
        { x: 425, y: 115, rotation: 20 },
        { x: 270, y: 170, rotation: 0 },
        { x: 175, y: 155, rotation: -5 },
        { x: 365, y: 65, rotation: 12 }
    ];

    const index = (id + shift) % places.length;
    return places[index];
}

function getRunwayY(runway) {
    if (runway === 2) {
        return 283;
    }

    return 253;
}

function getGatePosition(gate) {
    if (gate === 1) {
        return { x: 335, y: 365 };
    }

    if (gate === 2) {
        return { x: 465, y: 365 };
    }

    if (gate === 3) {
        return { x: 595, y: 365 };
    }

    return { x: 465, y: 365 };
}

function percent(value, max) {
    return (value / max * 100) + "%";
}

function valueOrDash(value) {
    if (value === null || value === undefined) {
        return "-";
    }

    return value;
}

function formatTime(value) {
    if (!value) {
        return "-";
    }

    const date = new Date(value);
    return date.toLocaleTimeString();
}
