let lastState = null;
let clientPlanes = {};
let currentAutoMode = true;

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
    clientPlanes = {};
    const state = await sendPost("/Airport/Reset");
    renderState(state);
}

async function addPlane() {
    const state = await sendPost("/Airport/AddPlane");
    renderState(state);
}

async function setSpeed(speed) {
    const state = await sendPost("/Airport/SetSpeed?speed=" + speed);
    renderState(state);
}

async function toggleAutoMode() {
    const state = await sendPost("/Airport/SetAutoMode?enabled=" + !currentAutoMode);
    renderState(state);
}

async function clearDeparted() {
    const state = await sendPost("/Airport/ClearDeparted");
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
    renderQueue(state.airplanes);
    preparePlaneElements(state.airplanes);
}

function renderStats(stats) {
    currentAutoMode = stats.autoMode;

    document.getElementById("stat-running").textContent = stats.isRunning ? "Yes" : "No";
    document.getElementById("stat-runways").textContent = stats.availableRunways + " / " + stats.runwayCount;
    document.getElementById("stat-air").textContent = stats.inAir;
    document.getElementById("stat-waiting").textContent = stats.waiting;
    document.getElementById("stat-load").textContent = stats.airportLoad;
    document.getElementById("stat-served").textContent = stats.servedPlanes;

    document.getElementById("state-active").textContent = stats.activePlanes;
    document.getElementById("state-gate").textContent = stats.atGate;
    document.getElementById("state-takingoff").textContent = stats.takingOff;
    document.getElementById("state-departed").textContent = stats.departed;
    document.getElementById("state-auto").textContent = stats.autoMode ? "On" : "Off";
    document.getElementById("state-speed").textContent = stats.speedMode;

    const autoButton = document.getElementById("auto-mode-button");
    autoButton.textContent = stats.autoMode ? "Auto Mode: ON" : "Auto Mode: OFF";

    if (stats.autoMode) {
        autoButton.classList.add("active-control");
    } else {
        autoButton.classList.remove("active-control");
    }

    updateSpeedButtons(stats.speedMode);

    const pill = document.getElementById("airport-status-pill");

    if (!stats.isRunning) {
        pill.textContent = "Stopped";
        pill.className = "status-pill stopped";
    } else if (stats.airportLoad === "High") {
        pill.textContent = "High load";
        pill.className = "status-pill busy";
    } else if (stats.availableRunways === 0) {
        pill.textContent = "Busy";
        pill.className = "status-pill busy";
    } else {
        pill.textContent = "Normal";
        pill.className = "status-pill normal";
    }
}

function updateSpeedButtons(speedMode) {
    const speeds = ["Slow", "Normal", "Fast"];

    for (const speed of speeds) {
        const button = document.getElementById("speed-" + speed);

        if (button === null) {
            continue;
        }

        if (speed === speedMode) {
            button.classList.add("active-control");
        } else {
            button.classList.remove("active-control");
        }
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

function renderQueue(planes) {
    const queueBox = document.getElementById("landing-queue");

    if (queueBox === null) {
        return;
    }

    queueBox.innerHTML = "";

    const waitingPlanes = planes.filter(function (plane) {
        return plane.status === "WaitingForRunway";
    });

    if (waitingPlanes.length === 0) {
        const empty = document.createElement("div");
        empty.className = "queue-empty";
        empty.textContent = "No aircraft in queue";
        queueBox.appendChild(empty);
        return;
    }

    for (const plane of waitingPlanes) {
        const item = document.createElement("div");
        item.className = "queue-item";
        item.innerHTML =
            "<strong>" + plane.flightNumber + "</strong>" +
            "<span>waiting for runway</span>";

        queueBox.appendChild(item);
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
            const id = item.id.replace("plane-", "");
            delete clientPlanes[id];
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

        prepareClientPlane(plane);
    }
}

function prepareClientPlane(plane) {
    const key = String(plane.id);
    const point = getInitialPoint(plane);

    if (!clientPlanes[key]) {
        clientPlanes[key] = {
            x: point.x,
            y: point.y,
            rotation: point.rotation,
            status: plane.status,
            runway: plane.runwayNumber,
            gate: plane.gateNumber,
            started: Date.now(),
            from: point,
            transition: null
        };

        return;
    }

    const visual = clientPlanes[key];

    if (visual.status !== plane.status || visual.runway !== plane.runwayNumber || visual.gate !== plane.gateNumber) {
        visual.from = {
            x: visual.x,
            y: visual.y,
            rotation: visual.rotation
        };

        visual.status = plane.status;
        visual.runway = plane.runwayNumber;
        visual.gate = plane.gateNumber;
        visual.started = Date.now();
        visual.transition = createTransition(plane, visual);
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
    const key = String(plane.id);

    if (!clientPlanes[key]) {
        prepareClientPlane(plane);
    }

    const visual = clientPlanes[key];
    const point = getAnimatedPoint(plane, visual);
    const symbol = element.querySelector(".plane-symbol");

    visual.x = point.x;
    visual.y = point.y;
    visual.rotation = point.rotation;

    element.className = "plane status-" + plane.status;
    element.style.left = percent(point.x, 900);
    element.style.top = percent(point.y, 480);
    symbol.style.transform = "rotate(" + point.rotation + "deg)";
}

function createTransition(plane, visual) {
    if (plane.status === "Landing") {
        const startAngle = getOrbitAngleFromPoint(visual.from);
        const exitAngle = getForwardExitAngle(startAngle, 0.48);

        return {
            name: "Landing",
            startAngle: startAngle,
            exitAngle: exitAngle
        };
    }

    if (plane.status === "TaxiingToGate") {
        return {
            name: "TaxiingToGate",
            from: visual.from
        };
    }

    if (plane.status === "AtGate") {
        return {
            name: "AtGate",
            from: visual.from
        };
    }

    if (plane.status === "PreparingDeparture") {
        return {
            name: "PreparingDeparture",
            from: visual.from
        };
    }

    if (plane.status === "TakingOff") {
        return {
            name: "TakingOff",
            from: visual.from
        };
    }

    return null;
}

function getInitialPoint(plane) {
    const now = Date.now();

    if (plane.status === "Flying" || plane.status === "WaitingForRunway") {
        return getOrbitPoint(plane.id, now, 24000, 0);
    }

    if (plane.status === "Landing") {
        return getOrbitPoint(plane.id, now, 24000, 0);
    }

    if (plane.status === "TaxiingToGate") {
        return {
            x: 650,
            y: getRunwayY(plane.runwayNumber),
            rotation: 0
        };
    }

    if (plane.status === "AtGate" || plane.status === "PreparingDeparture") {
        const gate = getGatePosition(plane.gateNumber);

        return {
            x: gate.x + getSmallOffset(plane.id),
            y: 367,
            rotation: 0
        };
    }

    if (plane.status === "TakingOff") {
        const gate = getGatePosition(plane.gateNumber);

        return {
            x: gate.x + getSmallOffset(plane.id),
            y: 367,
            rotation: 0
        };
    }

    return {
        x: 270,
        y: 110,
        rotation: 0
    };
}

function getAnimatedPoint(plane, visual) {
    const now = Date.now();
    const statusTime = Math.max(0, now - visual.started);

    if (plane.status === "Flying") {
        return getOrbitPoint(plane.id, now, 26000, 0);
    }

    if (plane.status === "WaitingForRunway") {
        return getOrbitPoint(plane.id, now, 32000, 40);
    }

    if (plane.status === "Landing") {
        return getLandingPoint(plane, visual, statusTime);
    }

    if (plane.status === "TaxiingToGate") {
        return getTaxiToGatePoint(plane, visual, statusTime);
    }

    if (plane.status === "AtGate") {
        return getAtGatePoint(plane, visual, statusTime);
    }

    if (plane.status === "PreparingDeparture") {
        return getPreparingPoint(plane, visual, statusTime, now);
    }

    if (plane.status === "TakingOff") {
        return getTakingOffPoint(plane, visual, statusTime);
    }

    return visual;
}

function getLandingPoint(plane, visual, statusTime) {
    const transition = visual.transition || createTransition(plane, visual);
    const runwayY = getRunwayY(plane.runwayNumber);
    const exit = getOrbitPointByAngle(transition.exitAngle);
    const downwind = { x: 500, y: runwayY - 92, rotation: 45 };
    const finalApproach = { x: 585, y: runwayY - 42, rotation: 25 };
    const touchdown = { x: 650, y: runwayY, rotation: 0 };

    if (statusTime < 4300) {
        const progress = smooth(statusTime / 4300);
        const angle = transition.startAngle + (transition.exitAngle - transition.startAngle) * progress;
        return getOrbitPointByAngle(angle);
    }

    if (statusTime < 9000) {
        return getPathPoint(statusTime - 4300, 4700, [exit, downwind, finalApproach]);
    }

    return getPathPoint(statusTime - 9000, 4200, [finalApproach, touchdown, { x: 690, y: runwayY, rotation: 0 }]);
}

function getTaxiToGatePoint(plane, visual, statusTime) {
    const transition = visual.transition || createTransition(plane, visual);
    const gate = getGatePosition(plane.gateNumber);
    const runwayY = transition.from.y;
    const runwayExit = { x: gate.x, y: runwayY, rotation: 0 };
    const taxiTurn = { x: gate.x, y: 330, rotation: 90 };
    const gateHold = { x: gate.x + getSmallOffset(plane.id), y: 357, rotation: 90 };

    return getPathPoint(statusTime, 9500, [transition.from, runwayExit, taxiTurn, gateHold]);
}

function getAtGatePoint(plane, visual, statusTime) {
    const transition = visual.transition || createTransition(plane, visual);
    const gate = getGatePosition(plane.gateNumber);
    const gateStop = { x: gate.x + getSmallOffset(plane.id), y: 367, rotation: 0 };

    return getPathPoint(statusTime, 2600, [transition.from, gateStop]);
}

function getPreparingPoint(plane, visual, statusTime, now) {
    const transition = visual.transition || createTransition(plane, visual);
    const gate = getGatePosition(plane.gateNumber);
    const base = { x: gate.x + getSmallOffset(plane.id), y: 367, rotation: 0 };
    const lift = Math.sin(now / 450) * 2;

    if (statusTime < 2600) {
        return getPathPoint(statusTime, 2600, [transition.from, base]);
    }

    return {
        x: base.x,
        y: base.y + lift,
        rotation: 0
    };
}

function getTakingOffPoint(plane, visual, statusTime) {
    const transition = visual.transition || createTransition(plane, visual);
    const gate = getGatePosition(plane.gateNumber);
    const runwayY = getRunwayY(plane.runwayNumber);
    const pushback = { x: gate.x + getSmallOffset(plane.id), y: 340, rotation: 180 };
    const taxiToLine = { x: gate.x, y: 320, rotation: -90 };
    const runwayEntry = { x: 470, y: runwayY, rotation: 0 };
    const rolling = { x: 650, y: runwayY, rotation: 0 };
    const climb = { x: 845, y: runwayY - 65, rotation: 25 };

    if (statusTime < 3500) {
        return getPathPoint(statusTime, 3500, [transition.from, pushback, taxiToLine]);
    }

    if (statusTime < 7800) {
        return getPathPoint(statusTime - 3500, 4300, [taxiToLine, runwayEntry]);
    }

    return getPathPoint(statusTime - 7800, 6200, [runwayEntry, rolling, climb]);
}

function getOrbitPoint(id, now, duration, angleShift) {
    const slot = id % 8;
    const angle = ((now % duration) / duration) * Math.PI * 2 + slot * 0.7 + angleShift * Math.PI / 180;

    return getOrbitPointByAngle(angle);
}

function getOrbitPointByAngle(angle) {
    const centerX = 270;
    const centerY = 110;
    const radiusX = 170;
    const radiusY = 70;
    const x = centerX + Math.cos(angle) * radiusX;
    const y = centerY + Math.sin(angle) * radiusY;
    const rotation = angle * 180 / Math.PI + 90;

    return {
        x: x,
        y: y,
        rotation: rotation
    };
}

function getOrbitAngleFromPoint(point) {
    const centerX = 270;
    const centerY = 110;
    const radiusX = 170;
    const radiusY = 70;
    return Math.atan2((point.y - centerY) / radiusY, (point.x - centerX) / radiusX);
}

function getForwardExitAngle(startAngle, exitAngle) {
    let result = exitAngle;

    while (result <= startAngle) {
        result += Math.PI * 2;
    }

    return result;
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
        rotation: mixAngle(a.rotation, b.rotation, progress)
    };
}

function mixAngle(a, b, progress) {
    let diff = ((b - a + 540) % 360) - 180;
    return a + diff * progress;
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
