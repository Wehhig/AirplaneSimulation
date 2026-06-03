namespace Samoloty.Models;

public class AirportStats
{
    public bool IsRunning { get; set; }
    public int RunwayCount { get; set; }
    public int AvailableRunways { get; set; }
    public int BusyRunways { get; set; }
    public int TotalPlanes { get; set; }
    public int ActivePlanes { get; set; }
    public int InAir { get; set; }
    public int Waiting { get; set; }
    public int Landing { get; set; }
    public int AtGate { get; set; }
    public int TakingOff { get; set; }
    public int Departed { get; set; }
    public int ServedPlanes { get; set; }
}