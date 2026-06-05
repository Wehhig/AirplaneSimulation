using Microsoft.AspNetCore.SignalR;
using Samoloty.Hubs;
using Samoloty.Models;

namespace Samoloty.Services;

public class AirportService
{
    private readonly object _lock = new();
    private readonly Random _random = new();
    private readonly IHubContext<AirportHub> _hubContext;

    private List<Airplane> _airplanes = new();
    private List<string> _logs = new();
    private SemaphoreSlim _runwaySemaphore = new(2, 2);
    private SemaphoreSlim _gateSemaphore = new(3, 3);
    private bool[] _runwayBusy = new bool[2];
    private bool[] _gateBusy = new bool[3];
    private CancellationTokenSource _cancellation = new();

    private bool _isRunning;
    private bool _autoMode = true;
    private string _speedMode = "Normal";
    private int _nextId = 1;
    private int _nextGate = 1;
    private int _servedPlanes;
    private int _simulationId;
    private DateTime? _startedAt;

    private const int RunwayCount = 2;
    private const int GateCount = 3;
    private const int MaxActivePlanes = 12;

    public AirportService(IHubContext<AirportHub> hubContext)
    {
        _hubContext = hubContext;
    }

    public AirportState GetState()
    {
        lock (_lock)
        {
            var planes = _airplanes
                .Select(p => new Airplane
                {
                    Id = p.Id,
                    FlightNumber = p.FlightNumber,
                    Status = p.Status,
                    IsEmergency = p.IsEmergency,
                    RunwayNumber = p.RunwayNumber,
                    GateNumber = p.GateNumber,
                    CreatedAt = p.CreatedAt,
                    UpdatedAt = p.UpdatedAt
                })
                .ToList();

            var activePlanes = _airplanes.Count(p => p.Status != "Departed" && p.Status != "Cancelled");
            var waiting = _airplanes.Count(p => p.Status == "WaitingForRunway");
            var landing = _airplanes.Count(p => p.Status == "Landing");
            var takingOff = _airplanes.Count(p => p.Status == "TakingOff");

            var stats = new AirportStats
            {
                IsRunning = _isRunning,
                AutoMode = _autoMode,
                SpeedMode = _speedMode,
                AirportLoad = GetAirportLoad(activePlanes, waiting, landing, takingOff),
                RunwayCount = RunwayCount,
                AvailableRunways = _runwaySemaphore.CurrentCount,
                BusyRunways = RunwayCount - _runwaySemaphore.CurrentCount,
                TotalPlanes = _airplanes.Count,
                ActivePlanes = activePlanes,
                EmergencyPlanes = _airplanes.Count(p => p.IsEmergency && p.Status != "Departed" && p.Status != "Cancelled"),
                InAir = _airplanes.Count(p => p.Status == "Flying"),
                Waiting = waiting,
                Landing = landing,
                AtGate = _airplanes.Count(p => p.Status == "AtGate" || p.Status == "PreparingDeparture"),
                TakingOff = takingOff,
                Departed = _airplanes.Count(p => p.Status == "Departed"),
                ServedPlanes = _servedPlanes,
                SimulationSeconds = GetSimulationSeconds(),
                TrafficLimit = MaxActivePlanes
            };

            return new AirportState
            {
                Airplanes = planes,
                Logs = _logs.ToList(),
                Stats = stats
            };
        }
    }

    public void StartSimulation()
    {
        int currentSimulationId;

        lock (_lock)
        {
            if (_isRunning)
            {
                AddLog("Simulation is already running");
                SendState();
                return;
            }

            _isRunning = true;
            _cancellation = new CancellationTokenSource();
            _startedAt = DateTime.Now;
            currentSimulationId = _simulationId;
            AddLog("Simulation started");
        }

        SendState();
        Task.Run(() => GeneratePlanes(currentSimulationId, _cancellation.Token));
    }

    public void StopSimulation()
    {
        lock (_lock)
        {
            if (!_isRunning)
            {
                AddLog("Simulation is already stopped");
                SendState();
                return;
            }

            _isRunning = false;
            _simulationId++;
            _cancellation.Cancel();
            _startedAt = null;
            AddLog("Simulation stopped");
        }

        SendState();
    }

    public void ResetSimulation()
    {
        lock (_lock)
        {
            _isRunning = false;
            _simulationId++;
            _cancellation.Cancel();
            _cancellation = new CancellationTokenSource();
            _airplanes = new List<Airplane>();
            _logs = new List<string>();
            _runwaySemaphore = new SemaphoreSlim(RunwayCount, RunwayCount);
            _gateSemaphore = new SemaphoreSlim(GateCount, GateCount);
            _runwayBusy = new bool[RunwayCount];
            _gateBusy = new bool[GateCount];
            _nextId = 1;
            _nextGate = 1;
            _servedPlanes = 0;
            _startedAt = null;
            AddLog("Simulation reset");
        }

        SendState();
    }

    public void AddPlane()
    {
        AddPlaneInternal(false);
    }

    public void AddEmergencyPlane()
    {
        AddPlaneInternal(true);
    }

    private void AddPlaneInternal(bool emergency)
    {
        int currentSimulationId;
        CancellationToken token;

        lock (_lock)
        {
            if (!_isRunning)
            {
                AddLog("Cannot add plane because simulation is stopped");
                SendState();
                return;
            }

            if (!emergency && GetActivePlaneCountUnsafe() >= MaxActivePlanes)
            {
                AddLog("Airport traffic limit reached");
                SendState();
                return;
            }

            currentSimulationId = _simulationId;
            token = _cancellation.Token;
        }

        var plane = CreatePlane(emergency);

        SendState();
        Task.Run(() => ProcessPlane(plane.Id, currentSimulationId, token));
    }

    public void SetSpeed(string speed)
    {
        lock (_lock)
        {
            if (speed != "Slow" && speed != "Normal" && speed != "Fast")
            {
                return;
            }

            if (_isRunning)
            {
                AddLog("Stop simulation before changing speed");
                SendState();
                return;
            }

            _speedMode = speed;
            AddLog($"Simulation speed changed to {speed}");
        }

        SendState();
    }

    public void SetAutoMode(bool enabled)
    {
        lock (_lock)
        {
            _autoMode = enabled;

            if (enabled)
            {
                AddLog("Auto mode enabled");
            }
            else
            {
                AddLog("Auto mode disabled");
            }
        }

        SendState();
    }

    public void ClearDeparted()
    {
        lock (_lock)
        {
            _airplanes = _airplanes
                .Where(p => p.Status != "Departed" && p.Status != "Cancelled")
                .ToList();

            AddLog("Departed planes removed from table");
        }

        SendState();
    }

    private async Task GeneratePlanes(int simulationId, CancellationToken token)
    {
        while (IsTaskActive(simulationId, token))
        {
            if (IsAutoModeEnabled())
            {
                AddPlane();
            }

            try
            {
                await Task.Delay(ScaleTime(GetRandomNumber(9000, 15000)), token);
            }
            catch
            {
                return;
            }
        }
    }

    private Airplane CreatePlane(bool emergency)
    {
        Airplane plane;

        lock (_lock)
        {
            plane = new Airplane
            {
                Id = _nextId,
                FlightNumber = CreateFlightNumber(_nextId, emergency),
                Status = "Flying",
                IsEmergency = emergency,
                CreatedAt = DateTime.Now,
                UpdatedAt = DateTime.Now
            };

            _nextId++;
            _airplanes.Add(plane);

            if (emergency)
            {
                AddLog($"{plane.FlightNumber} declared emergency");
            }
            else
            {
                AddLog($"{plane.FlightNumber} appeared in the air");
            }
        }

        return plane;
    }

    private async Task ProcessPlane(int planeId, int simulationId, CancellationToken token)
    {
        int landingRunway = 0;
        int takeoffRunway = 0;
        int gate = 0;
        bool landingRunwayTaken = false;
        bool takeoffRunwayTaken = false;
        bool gateTaken = false;

        try
        {
            var emergency = IsPlaneEmergency(planeId);

            if (emergency)
            {
                await DelayRandom(1200, 2500, token);
            }
            else
            {
                await DelayRandom(5000, 9000, token);
            }

            if (!IsTaskActive(simulationId, token)) return;
            UpdatePlane(planeId, "WaitingForRunway", null, null);
            AddPlaneLog(planeId, "is waiting for runway");
            SendState();

            while (ShouldHoldForEmergency(planeId, emergency) && IsTaskActive(simulationId, token))
            {
                await Task.Delay(800, token);
            }

            AddPlaneLog(planeId, "is waiting for free gate before landing");
            SendState();

            await _gateSemaphore.WaitAsync(token);
            gateTaken = true;
            gate = TakeGate();

            if (!IsTaskActive(simulationId, token)) return;
            UpdatePlane(planeId, "WaitingForRunway", null, gate);
            AddPlaneLog(planeId, $"reserved gate {gate}");
            SendState();

            await _runwaySemaphore.WaitAsync(token);
            landingRunwayTaken = true;
            landingRunway = TakeRunway();

            if (!IsTaskActive(simulationId, token)) return;
            UpdatePlane(planeId, "Landing", landingRunway, gate);

            if (emergency)
            {
                AddPlaneLog(planeId, $"got priority runway {landingRunway} and is landing");
            }
            else
            {
                AddPlaneLog(planeId, $"got runway {landingRunway} and is landing");
            }

            SendState();

            await DelayRandom(9000, 14000, token);

            ReleaseRunway(landingRunway);
            landingRunwayTaken = false;

            if (!IsTaskActive(simulationId, token)) return;
            UpdatePlane(planeId, "TaxiingToGate", null, gate);
            AddPlaneLog(planeId, $"is taxiing to gate {gate}");
            SendState();

            await DelayRandom(7000, 11000, token);

            if (!IsTaskActive(simulationId, token)) return;
            UpdatePlane(planeId, "AtGate", null, gate);
            AddPlaneLog(planeId, $"reached gate {gate}");
            SendState();

            await DelayRandom(12000, 18000, token);

            if (!IsTaskActive(simulationId, token)) return;
            UpdatePlane(planeId, "PreparingDeparture", null, gate);
            AddPlaneLog(planeId, "is preparing for departure");
            SendState();

            await DelayRandom(7000, 11000, token);

            while (ShouldHoldForEmergency(planeId, emergency) && IsTaskActive(simulationId, token))
            {
                await Task.Delay(800, token);
            }

            await _runwaySemaphore.WaitAsync(token);
            takeoffRunwayTaken = true;
            takeoffRunway = TakeRunway();

            if (!IsTaskActive(simulationId, token)) return;
            UpdatePlane(planeId, "TakingOff", takeoffRunway, gate);
            AddPlaneLog(planeId, $"got runway {takeoffRunway} and is taking off");
            SendState();

            await DelayRandom(9000, 14000, token);

            ReleaseRunway(takeoffRunway);
            takeoffRunwayTaken = false;

            if (gateTaken)
            {
                ReleaseGate(gate);
                gateTaken = false;
            }

            if (!IsTaskActive(simulationId, token)) return;
            UpdatePlane(planeId, "Departed", null, null);
            AddPlaneLog(planeId, "departed");

            lock (_lock)
            {
                _servedPlanes++;
            }

            SendState();
        }
        catch
        {
            UpdatePlane(planeId, "Cancelled", null, null);
            SendState();
        }
        finally
        {
            if (landingRunwayTaken)
            {
                ReleaseRunway(landingRunway);
            }

            if (takeoffRunwayTaken)
            {
                ReleaseRunway(takeoffRunway);
            }

            if (gateTaken)
            {
                ReleaseGate(gate);
            }

            SendState();
        }
    }

    private int GetActivePlaneCountUnsafe()
    {
        return _airplanes.Count(p => p.Status != "Departed" && p.Status != "Cancelled");
    }

    private bool IsTaskActive(int simulationId, CancellationToken token)
    {
        lock (_lock)
        {
            return _isRunning && _simulationId == simulationId && !token.IsCancellationRequested;
        }
    }

    private bool IsAutoModeEnabled()
    {
        lock (_lock)
        {
            return _autoMode;
        }
    }

    private bool IsPlaneEmergency(int planeId)
    {
        lock (_lock)
        {
            var plane = _airplanes.FirstOrDefault(p => p.Id == planeId);
            return plane != null && plane.IsEmergency;
        }
    }

    private bool ShouldHoldForEmergency(int planeId, bool emergency)
    {
        lock (_lock)
        {
            if (emergency)
            {
                return false;
            }

            return _airplanes.Any(p =>
                p.Id != planeId &&
                p.IsEmergency &&
                (p.Status == "Flying" || p.Status == "WaitingForRunway" || p.Status == "Landing"));
        }
    }

    private void UpdatePlane(int id, string status, int? runway, int? gate)
    {
        lock (_lock)
        {
            var plane = _airplanes.FirstOrDefault(p => p.Id == id);

            if (plane == null)
            {
                return;
            }

            plane.Status = status;
            plane.RunwayNumber = runway;
            plane.GateNumber = gate;
            plane.UpdatedAt = DateTime.Now;
        }
    }

    private int TakeRunway()
    {
        lock (_lock)
        {
            for (int i = 0; i < _runwayBusy.Length; i++)
            {
                if (!_runwayBusy[i])
                {
                    _runwayBusy[i] = true;
                    return i + 1;
                }
            }

            return 1;
        }
    }

    private void ReleaseRunway(int runway)
    {
        if (runway <= 0)
        {
            return;
        }

        lock (_lock)
        {
            if (runway <= _runwayBusy.Length)
            {
                _runwayBusy[runway - 1] = false;
            }
        }

        try
        {
            _runwaySemaphore.Release();
        }
        catch
        {
        }
    }

    private int TakeGate()
    {
        lock (_lock)
        {
            for (int offset = 0; offset < GateCount; offset++)
            {
                var index = (_nextGate - 1 + offset) % GateCount;

                if (!_gateBusy[index])
                {
                    _gateBusy[index] = true;
                    _nextGate = index + 2;

                    if (_nextGate > GateCount)
                    {
                        _nextGate = 1;
                    }

                    return index + 1;
                }
            }

            return 1;
        }
    }

    private void ReleaseGate(int gate)
    {
        if (gate <= 0)
        {
            return;
        }

        lock (_lock)
        {
            if (gate <= _gateBusy.Length)
            {
                _gateBusy[gate - 1] = false;
            }
        }

        try
        {
            _gateSemaphore.Release();
        }
        catch
        {
        }
    }

    private string CreateFlightNumber(int id, bool emergency)
    {
        if (emergency)
        {
            return $"EMG{100 + id}";
        }

        var prefixes = new[] { "LOT", "WZZ", "RYR", "DLH", "AFR" };
        var prefix = prefixes[GetRandomNumber(0, prefixes.Length)];
        return $"{prefix}{100 + id}";
    }

    private int GetRandomNumber(int min, int max)
    {
        lock (_lock)
        {
            return _random.Next(min, max);
        }
    }

    private async Task DelayRandom(int min, int max, CancellationToken token)
    {
        await Task.Delay(ScaleTime(GetRandomNumber(min, max)), token);
    }

    private int ScaleTime(int value)
    {
        lock (_lock)
        {
            if (_speedMode == "Slow")
            {
                return (int)(value * 1.6);
            }

            if (_speedMode == "Fast")
            {
                return (int)(value * 0.55);
            }

            return value;
        }
    }

    private int GetSimulationSeconds()
    {
        if (!_isRunning || _startedAt == null)
        {
            return 0;
        }

        return (int)(DateTime.Now - _startedAt.Value).TotalSeconds;
    }

    private string GetAirportLoad(int activePlanes, int waiting, int landing, int takingOff)
    {
        if (!_isRunning)
        {
            return "Idle";
        }

        if (_airplanes.Any(p => p.IsEmergency && p.Status != "Departed" && p.Status != "Cancelled"))
        {
            return "Emergency";
        }

        if (waiting >= 3 || activePlanes >= 8)
        {
            return "High";
        }

        if (landing + takingOff >= 2 || activePlanes >= 5)
        {
            return "Medium";
        }

        return "Low";
    }

    private void AddPlaneLog(int planeId, string message)
    {
        lock (_lock)
        {
            var plane = _airplanes.FirstOrDefault(p => p.Id == planeId);

            if (plane == null)
            {
                return;
            }

            AddLog($"{plane.FlightNumber} {message}");
        }
    }

    private void AddLog(string message)
    {
        var text = $"{DateTime.Now:HH:mm:ss}  {message}";
        _logs.Insert(0, text);

        if (_logs.Count > 80)
        {
            _logs.RemoveAt(_logs.Count - 1);
        }
    }

    private void SendState()
    {
        var state = GetState();
        _ = _hubContext.Clients.All.SendAsync("ReceiveAirportState", state);
    }
}
