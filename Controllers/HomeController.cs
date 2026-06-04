using Microsoft.AspNetCore.Mvc;

namespace Samoloty.Controllers;

public class HomeController : Controller
{
    public IActionResult Index()
    {
        return RedirectToAction("Index", "Airport");
    }
}
