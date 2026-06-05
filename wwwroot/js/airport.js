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

initTheme();
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

async function addEmergencyPlane() {
    const state = await sendPost("/Airport/AddEmergencyPlane");
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

function initTheme() {
    const savedTheme = localStorage.getItem("airportTheme");

    if (savedTheme === "dark") {
        document.body.classList.add("dark-mode");
    }

    updateThemeButton();
}

function toggleTheme() {
    document.body.classList.toggle("dark-mode");

    if (document.body.classList.contains("dark-mode")) {
        localStorage.setItem("airportTheme", "dark");
    } else {
        localStorage.setItem("airportTheme", "light");
    }

    updateThemeButton();
}

function updateThemeButton() {
    const button = document.getElementById("theme-button");

    if (button === null) {
        return;
    }

    if (document.body.classList.contains("dark-mode")) {
        button.textContent = "Light mode";
        button.classList.add("active-control");
    } else {
        button.textContent = "Dark mode";
        button.classList.remove("active-control");
    }
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
    document.getElementById("stat-emergency").textContent = stats.emergencyPlanes;
    document.getElementById("stat-served").textContent = stats.servedPlanes;

    document.getElementById("state-active").textContent = stats.activePlanes;
    document.getElementById("state-gate").textContent = stats.atGate;
    document.getElementById("state-takingoff").textContent = stats.takingOff;
    document.getElementById("state-departed").textContent = stats.departed;
    document.getElementById("state-auto").textContent = stats.autoMode ? "On" : "Off";
    document.getElementById("state-speed").textContent = stats.speedMode;

    const autoButton = document.getElementById("auto-mode-button");

    if (autoButton !== null) {
        autoButton.textContent = stats.autoMode ? "Auto Mode: ON" : "Auto Mode: OFF";

        if (stats.autoMode) {
            autoButton.classList.add("active-control");
        } else {
            autoButton.classList.remove("active-control");
        }
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

        const emergencyClass = plane.isEmergency ? " emergency-row" : "";
        const emergencyMark = plane.isEmergency ? " <span class='emergency-mark'>EMG</span>" : "";

        row.className = emergencyClass;

        row.innerHTML =
            "<td>" + plane.flightNumber + emergencyMark + "</td>" +
            "<td><span class='status-badge " + plane.status + emergencyClass + "'>" + plane.status + "</span></td>" +
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
                "<div class='plane-symbol'>" + planeSvg() + "</div>" +
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
    const pointValue = getInitialPoint(plane);

    if (!clientPlanes[key]) {
        clientPlanes[key] = {
            x: pointValue.x,
            y: pointValue.y,
            rotation: pointValue.rotation,
            status: plane.status,
            runway: plane.runwayNumber,
            gate: plane.gateNumber,
            started: Date.now(),
            route: null
        };

        return;
    }

    const visual = clientPlanes[key];

    if (visual.status !== plane.status || visual.runway !== plane.runwayNumber || visual.gate !== plane.gateNumber) {
        visual.status = plane.status;
        visual.runway = plane.runwayNumber;
        visual.gate = plane.gateNumber;
        visual.started = Date.now();
        visual.route = createRouteForStatus(plane, visual);
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
    const pointValue = getPlanePoint(plane, visual);
    const symbol = element.querySelector(".plane-symbol");

    visual.x = pointValue.x;
    visual.y = pointValue.y;
    visual.rotation = pointValue.rotation;

    element.className = "plane status-" + plane.status + (plane.isEmergency ? " emergency-plane" : "");
    element.style.left = percent(pointValue.x, 900);
    element.style.top = percent(pointValue.y, 480);
    symbol.style.transform = "rotate(" + pointValue.rotation + "deg)";
}

function getInitialPoint(plane) {
    const now = Date.now();

    if (plane.status === "Flying" || plane.status === "WaitingForRunway" || plane.status === "Landing") {
        return getOrbitPoint(plane.id, now, 32000, 0);
    }

    if (plane.status === "TaxiingToGate") {
        return getP3(plane.runwayNumber, plane.id);
    }

    if (plane.status === "AtGate" || plane.status === "PreparingDeparture" || plane.status === "TakingOff") {
        return getGateStop(plane.gateNumber, plane.id);
    }

    return {
        x: 270,
        y: 110,
        rotation: 0
    };
}

function createRouteForStatus(plane, visual) {
    if (plane.status === "Landing") {
        return createLandingRoute(plane, visual);
    }

    if (plane.status === "TaxiingToGate") {
        return createTaxiToGateRoute(plane, visual);
    }

    if (plane.status === "AtGate") {
        return createAtGateRoute(plane, visual);
    }

    if (plane.status === "PreparingDeparture") {
        return createPreparingRoute(plane, visual);
    }

    if (plane.status === "TakingOff") {
        return createTakeoffRoute(plane, visual);
    }

    return null;
}

function getPlanePoint(plane, visual) {
    const now = Date.now();
    const time = Math.max(0, now - visual.started);

    if (plane.status === "Flying") {
        return getOrbitPoint(plane.id, now, 32000, 0);
    }

    if (plane.status === "WaitingForRunway") {
        return getOrbitPoint(plane.id, now, 36000, 40);
    }

    if (plane.status === "Landing") {
        if (!visual.route) {
            visual.route = createLandingRoute(plane, visual);
            visual.started = Date.now();
        }

        return getRoutePoint(visual.route, time);
    }

    if (plane.status === "TaxiingToGate") {
        if (!visual.route) {
            visual.route = createTaxiToGateRoute(plane, visual);
            visual.started = Date.now();
        }

        return getRoutePoint(visual.route, time);
    }

    if (plane.status === "AtGate") {
        if (!visual.route) {
            visual.route = createAtGateRoute(plane, visual);
            visual.started = Date.now();
        }

        return getRoutePoint(visual.route, time);
    }

    if (plane.status === "PreparingDeparture") {
        if (!visual.route) {
            visual.route = createPreparingRoute(plane, visual);
            visual.started = Date.now();
        }

        const base = getRoutePoint(visual.route, time);
        const idle = Math.min(time / 1500, 1);

        return {
            x: base.x,
            y: base.y + Math.sin(now / 450) * 2 * idle,
            rotation: base.rotation
        };
    }

    if (plane.status === "TakingOff") {
        if (!visual.route) {
            visual.route = createTakeoffRoute(plane, visual);
            visual.started = Date.now();
        }

        return getRoutePoint(visual.route, time);
    }

    return {
        x: visual.x,
        y: visual.y,
        rotation: visual.rotation
    };
}

function createLandingRoute(plane, visual) {
    const runwayY = getRunwayY(plane.runwayNumber);
    const startAngle = getOrbitAngleFromPoint({ x: visual.x, y: visual.y });
    const exitAngle = getForwardExitAngle(startAngle, 0.62);
    const p1 = getOrbitPointByAngle(exitAngle);
    const p2 = getP2(plane.runwayNumber);
    const p3 = getP3(plane.runwayNumber, plane.id);

    return {
        type: "landing",
        startAngle: startAngle,
        exitAngle: exitAngle,
        p1: p1,
        approach: [
            p1,
            point(480, 168),
            point(575, 185),
            point(660, 225),
            point(730, runwayY - 12),
            p2
        ],
        rollout: [
            p2,
            point(610, runwayY),
            point(480, runwayY),
            point(350, runwayY),
            p3
        ],
        duration: 10500
    };
}

function createTaxiToGateRoute(plane, visual) {
    const gate = getGatePosition(plane.gateNumber);
    const runwayY = getNearestRunwayY(visual.y);
    const start = point(visual.x, visual.y);
    const gateTaxiX = gate.x;

    return route([
        start,
        point(gateTaxiX, runwayY),
        point(gateTaxiX, 330),
        point(gateTaxiX, 350),
        getGateStop(plane.gateNumber, plane.id)
    ], 8500);
}

function createAtGateRoute(plane, visual) {
    return route([
        point(visual.x, visual.y),
        getGateStop(plane.gateNumber, plane.id)
    ], 1800);
}

function createPreparingRoute(plane, visual) {
    return route([
        point(visual.x, visual.y),
        getGateStop(plane.gateNumber, plane.id)
    ], 1200);
}

function createTakeoffRoute(plane, visual) {
    const runwayY = getRunwayY(plane.runwayNumber);
    const gate = getGatePosition(plane.gateNumber);
    const runwayStart = getP3(plane.runwayNumber, plane.id);
    const p6 = getP6(plane.runwayNumber);

    return route([
        point(visual.x, visual.y),
        point(gate.x, 350),
        point(gate.x, 330),
        point(gate.x, runwayY),
        runwayStart,
        point(360, runwayY),
        point(520, runwayY),
        point(705, runwayY),
        p6
    ], 11500);
}

function getRoutePoint(routeData, time) {
    if (routeData.type === "landing") {
        return getLandingRoutePoint(routeData, time);
    }

    return getPolylinePoint(routeData.points, routeData.duration, time);
}

function getLandingRoutePoint(routeData, time) {
    const orbitTime = 3200;
    const approachTime = 3600;
    const rolloutTime = 3700;

    if (time < orbitTime) {
        const progress = smooth(time / orbitTime);
        const angle = routeData.startAngle + (routeData.exitAngle - routeData.startAngle) * progress;
        return getOrbitPointByAngle(angle);
    }

    if (time < orbitTime + approachTime) {
        return getPolylinePoint(routeData.approach, approachTime, time - orbitTime);
    }

    if (time < orbitTime + approachTime + rolloutTime) {
        return getPolylinePoint(routeData.rollout, rolloutTime, time - orbitTime - approachTime);
    }

    const last = routeData.rollout[routeData.rollout.length - 1];
    const beforeLast = routeData.rollout[routeData.rollout.length - 2];

    return {
        x: last.x,
        y: last.y,
        rotation: direction(beforeLast, last)
    };
}

function route(points, duration) {
    const clean = [];

    for (const item of points) {
        clean.push({ x: item.x, y: item.y });
    }

    return {
        type: "polyline",
        points: clean,
        duration: duration
    };
}

function point(x, y) {
    return {
        x: x,
        y: y
    };
}

function getPolylinePoint(points, duration, time) {
    if (points.length === 1) {
        return {
            x: points[0].x,
            y: points[0].y,
            rotation: 0
        };
    }

    const lengths = [];
    let total = 0;

    for (let i = 0; i < points.length - 1; i++) {
        const length = distance(points[i], points[i + 1]);
        lengths.push(length);
        total += length;
    }

    if (total === 0) {
        return {
            x: points[0].x,
            y: points[0].y,
            rotation: 0
        };
    }

    const progress = Math.min(time / duration, 1);
    const targetDistance = total * smooth(progress);
    let current = 0;

    for (let i = 0; i < lengths.length; i++) {
        const next = current + lengths[i];

        if (targetDistance <= next || i === lengths.length - 1) {
            const local = lengths[i] === 0 ? 0 : (targetDistance - current) / lengths[i];
            const a = points[i];
            const b = points[i + 1];
            const x = a.x + (b.x - a.x) * local;
            const y = a.y + (b.y - a.y) * local;
            const rotation = direction(a, b);

            return {
                x: x,
                y: y,
                rotation: rotation
            };
        }

        current = next;
    }

    const last = points[points.length - 1];
    const beforeLast = points[points.length - 2];

    return {
        x: last.x,
        y: last.y,
        rotation: direction(beforeLast, last)
    };
}

function distance(a, b) {
    const dx = b.x - a.x;
    const dy = b.y - a.y;

    return Math.sqrt(dx * dx + dy * dy);
}

function direction(a, b) {
    return Math.atan2(b.y - a.y, b.x - a.x) * 180 / Math.PI;
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

function getOrbitAngleFromPoint(pointValue) {
    const centerX = 270;
    const centerY = 110;
    const radiusX = 170;
    const radiusY = 70;

    return Math.atan2((pointValue.y - centerY) / radiusY, (pointValue.x - centerX) / radiusX);
}

function getForwardExitAngle(startAngle, exitAngle) {
    let result = exitAngle;

    while (result <= startAngle + 0.35) {
        result += Math.PI * 2;
    }

    return result;
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

function getNearestRunwayY(y) {
    const y1 = 253;
    const y2 = 283;

    if (Math.abs(y - y2) < Math.abs(y - y1)) {
        return y2;
    }

    return y1;
}

function getP2(runway) {
    return {
        x: 705,
        y: getRunwayY(runway)
    };
}

function getP3(runway, id) {
    return {
        x: 270,
        y: getRunwayY(runway) + getRunwayStopOffset(id)
    };
}

function getP6(runway) {
    return {
        x: 930,
        y: getRunwayY(runway) - 18
    };
}

function getRunwayStopOffset(id) {
    const offsets = [-5, 0, 5];
    return offsets[id % offsets.length];
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

function getGateStop(gate, id) {
    const gatePosition = getGatePosition(gate);

    return {
        x: gatePosition.x + getSmallOffset(id),
        y: 367
    };
}

function getSmallOffset(id) {
    const offsets = [-14, 0, 14, -7, 7];
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

function planeSvg() {
    return "" +
        "<svg class='plane-icon' viewBox='0 0 100 100' aria-hidden='true'>" +
        "<path d='M90 50 L12 20 L24 43 L6 43 L6 57 L24 57 L12 80 Z'></path>" +
        "<path d='M31 43 L48 31 L44 47 Z'></path>" +
        "<path d='M31 57 L48 69 L44 53 Z'></path>" +
        "</svg>";
}
