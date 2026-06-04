let lastState = null;

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

requestAnimationFrame(animatePlanes);

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
    lastState = state;
    renderStats(state.stats);
    renderPlanesTable(state.airplanes);
    renderLogs(state.logs);
    preparePlaneElements(state.airplanes);
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

function preparePlaneElements(planes) {
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

        const label = planeElement.querySelector(".plane-label");
        label.textContent = plane.flightNumber;
    }
}

function animatePlanes() {
    if (lastState !== null) {
        const activePlanes = lastState.airplanes.filter(function (plane) {
            return plane.status !== "Departed" && plane.status !== "Cancelled";
        });

        for (const plane of activePlanes) {
            const element = document.getElementById("plane-" + plane.id);

            if (element !== null) {
                movePlane(element, plane);
            }
        }
    }

    requestAnimationFrame(animatePlanes);
}

function movePlane(element, plane) {
    const point = getAnimatedPoint(plane);
    const symbol = element.querySelector(".plane-symbol");

    element.className = "plane status-" + plane.status;
    element.style.left = percent(point.x, 900);
    element.style.top = percent(point.y, 480);
    symbol.style.transform = "rotate(" + point.rotation + "deg)";
}

function getAnimatedPoint(plane) {
    const now = Date.now();
    const updatedAt = new Date(plane.updatedAt).getTime();
    const statusTime = Math.max(0, now - updatedAt);

    if (plane.status === "Flying") {
        return getOrbitPoint(plane.id, now, 18000, 0);
    }

    if (plane.status === "WaitingForRunway") {
        return getOrbitPoint(plane.id, now, 25000, 45);
    }

    if (plane.status === "Landing") {
        const runwayY = getRunwayY(plane.runwayNumber);
        const start = getOrbitPoint(plane.id, updatedAt, 25000, 45);
        const middle = { x: 520, y: runwayY - 60, rotation: 45 };
        const end = { x: 645, y: runwayY, rotation: 0 };
        return getPathPoint(statusTime, 12000, [start, middle, end]);
    }

    if (plane.status === "TaxiingToGate") {
        const runwayY = 282;
        const gate = getGatePosition(plane.gateNumber);
        const start = { x: 640, y: runwayY, rotation: 180 };
        const middle = { x: gate.x, y: 330, rotation: 90 };
        const end = { x: gate.x + getSmallOffset(plane.id), y: 357, rotation: 90 };
        return getPathPoint(statusTime, 9000, [start, middle, end]);
    }

    if (plane.status === "AtGate") {
        const gate = getGatePosition(plane.gateNumber);
        return {
            x: gate.x + getSmallOffset(plane.id),
            y: 367,
            rotation: 0
        };
    }

    if (plane.status === "PreparingDeparture") {
        const gate = getGatePosition(plane.gateNumber);
        const lift = Math.sin(now / 500) * 3;

        return {
            x: gate.x + getSmallOffset(plane.id),
            y: 367 + lift,
            rotation: 0
        };
    }

    if (plane.status === "TakingOff") {
        const gate = getGatePosition(plane.gateNumber);
        const runwayY = getRunwayY(plane.runwayNumber);
        const start = { x: gate.x + getSmallOffset(plane.id), y: 357, rotation: 0 };
        const middle = { x: gate.x, y: runwayY, rotation: -90 };
        const runway = { x: 565, y: runwayY, rotation: 0 };
        const end = { x: 840, y: runwayY - 55, rotation: 25 };
        return getPathPoint(statusTime, 12000, [start, middle, runway, end]);
    }

    return { x: 270, y: 110, rotation: 0 };
}

function getOrbitPoint(id, now, duration, angleShift) {
    const centerX = 270;
    const centerY = 110;
    const radiusX = 170;
    const radiusY = 70;
    const slot = id % 6;
    const angle = ((now % duration) / duration) * Math.PI * 2 + slot * 0.8 + angleShift * Math.PI / 180;
    const x = centerX + Math.cos(angle) * radiusX;
    const y = centerY + Math.sin(angle) * radiusY;
    const rotation = angle * 180 / Math.PI + 90;

    return {
        x: x,
        y: y,
        rotation: rotation
    };
}

function getPathPoint(time, duration, points) {
    const progress = Math.min(time / duration, 1);
    const partCount = points.length - 1;
    const full = progress * partCount;
    const index = Math.min(Math.floor(full), partCount - 1);
    const local = full - index;

    return mixPoints(points[index], points[index + 1], smooth(local));
}

function mixPoints(a, b, progress) {
    return {
        x: a.x + (b.x - a.x) * progress,
        y: a.y + (b.y - a.y) * progress,
        rotation: a.rotation + (b.rotation - a.rotation) * progress
    };
}

function smooth(value) {
    return value * value * (3 - 2 * value);
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

function getSmallOffset(id) {
    const offsets = [-18, 0, 18, -9, 9];
    return offsets[id % offsets.length];
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
