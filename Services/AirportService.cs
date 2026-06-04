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
    private bool[] _runwayBusy = new bool[2];
    private CancellationTokenSource _cancellation = new();

    private bool _isRunning;
    private int _nextId = 1;
    private int _nextGate = 1;
    private int _servedPlanes;
    private int _simulationId;

    private const int RunwayCount = 2;
    private const int GateCount = 3;

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
                    RunwayNumber = p.RunwayNumber,
                    GateNumber = p.GateNumber,
                    CreatedAt = p.CreatedAt,
                    UpdatedAt = p.UpdatedAt
                })
                .ToList();

            var stats = new AirportStats
            {
                IsRunning = _isRunning,
                RunwayCount = RunwayCount,
                AvailableRunways = _runwaySemaphore.CurrentCount,
                BusyRunways = RunwayCount - _runwaySemaphore.CurrentCount,
                TotalPlanes = _airplanes.Count,
                ActivePlanes = _airplanes.Count(p => p.Status != "Departed" && p.Status != "Cancelled"),
                InAir = _airplanes.Count(p => p.Status == "Flying"),
                Waiting = _airplanes.Count(p => p.Status == "WaitingForRunway"),
                Landing = _airplanes.Count(p => p.Status == "Landing"),
                AtGate = _airplanes.Count(p => p.Status == "AtGate" || p.Status == "PreparingDeparture"),
                TakingOff = _airplanes.Count(p => p.Status == "TakingOff"),
                Departed = _airplanes.Count(p => p.Status == "Departed"),
                ServedPlanes = _servedPlanes
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
            _runwayBusy = new bool[RunwayCount];
            _nextId = 1;
            _nextGate = 1;
            _servedPlanes = 0;
            AddLog("Simulation reset");
        }

        SendState();
    }

    public void AddPlane()
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

            currentSimulationId = _simulationId;
            token = _cancellation.Token;
        }

        var plane = CreatePlane();

        SendState();
        Task.Run(() => ProcessPlane(plane.Id, currentSimulationId, token));
    }

    private async Task GeneratePlanes(int simulationId, CancellationToken token)
    {
        while (IsTaskActive(simulationId, token))
        {
            AddPlane();

            try
            {
                await Task.Delay(GetRandomNumber(9000, 15000), token);
            }
            catch
            {
                return;
            }
        }
    }

    private Airplane CreatePlane()
    {
        Airplane plane;

        lock (_lock)
        {
            plane = new Airplane
            {
                Id = _nextId,
                FlightNumber = CreateFlightNumber(_nextId),
                Status = "Flying",
                CreatedAt = DateTime.Now,
                UpdatedAt = DateTime.Now
            };

            _nextId++;
            _airplanes.Add(plane);
            AddLog($"{plane.FlightNumber} appeared in the air");
        }

        return plane;
    }

    private async Task ProcessPlane(int planeId, int simulationId, CancellationToken token)
    {
        int landingRunway = 0;
        int takeoffRunway = 0;
        bool landingRunwayTaken = false;
        bool takeoffRunwayTaken = false;

        try
        {
            await DelayRandom(5000, 9000, token);

            if (!IsTaskActive(simulationId, token)) return;
            UpdatePlane(planeId, "WaitingForRunway", null, null);
            AddPlaneLog(planeId, "is waiting for runway");
            SendState();

            await _runwaySemaphore.WaitAsync(token);
            landingRunwayTaken = true;
            landingRunway = TakeRunway();

            if (!IsTaskActive(simulationId, token)) return;
            UpdatePlane(planeId, "Landing", landingRunway, null);
            AddPlaneLog(planeId, $"got runway {landingRunway} and is landing");
            SendState();

            await DelayRandom(9000, 14000, token);

            ReleaseRunway(landingRunway);
            landingRunwayTaken = false;

            if (!IsTaskActive(simulationId, token)) return;
            var gate = TakeGate();
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

            SendState();
        }
    }

    private bool IsTaskActive(int simulationId, CancellationToken token)
    {
        lock (_lock)
        {
            return _isRunning && _simulationId == simulationId && !token.IsCancellationRequested;
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
            var gate = _nextGate;
            _nextGate++;

            if (_nextGate > GateCount)
            {
                _nextGate = 1;
            }

            return gate;
        }
    }

    private string CreateFlightNumber(int id)
    {
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
        await Task.Delay(GetRandomNumber(min, max), token);
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
