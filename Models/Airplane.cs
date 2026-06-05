namespace Samoloty.Models;

public class Airplane
{
    public int Id { get; set; }
    public string FlightNumber { get; set; } = "";
    public string Status { get; set; } = "Flying";
    public bool IsEmergency { get; set; }
    public int? RunwayNumber { get; set; }
    public int? GateNumber { get; set; }
    public DateTime CreatedAt { get; set; }
    public DateTime UpdatedAt { get; set; }
}