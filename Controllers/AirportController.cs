using Microsoft.AspNetCore.Mvc;
using Samoloty.Services;

namespace Samoloty.Controllers;

public class AirportController : Controller
{
    private readonly AirportService _airportService;

    public AirportController(AirportService airportService)
    {
        _airportService = airportService;
    }

    public IActionResult Index()
    {
        return View();
    }

    [HttpGet]
    public IActionResult State()
    {
        return Json(_airportService.GetState());
    }

    [HttpPost]
    public IActionResult Start()
    {
        _airportService.StartSimulation();
        return Json(_airportService.GetState());
    }

    [HttpPost]
    public IActionResult Stop()
    {
        _airportService.StopSimulation();
        return Json(_airportService.GetState());
    }

    [HttpPost]
    public IActionResult Reset()
    {
        _airportService.ResetSimulation();
        return Json(_airportService.GetState());
    }

    [HttpPost]
    public IActionResult AddPlane()
    {
        _airportService.AddPlane();
        return Json(_airportService.GetState());
    }

    [HttpPost]
    public IActionResult SetSpeed(string speed)
    {
        _airportService.SetSpeed(speed);
        return Json(_airportService.GetState());
    }

    [HttpPost]
    public IActionResult SetAutoMode(bool enabled)
    {
        _airportService.SetAutoMode(enabled);
        return Json(_airportService.GetState());
    }

    [HttpPost]
    public IActionResult ClearDeparted()
    {
        _airportService.ClearDeparted();
        return Json(_airportService.GetState());
    }
}
