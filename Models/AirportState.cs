namespace Samoloty.Models;

public class AirportState
{
    public List<Airplane> Airplanes { get; set; } = new();
    public List<string> Logs { get; set; } = new();
    public AirportStats Stats { get; set; } = new();
}