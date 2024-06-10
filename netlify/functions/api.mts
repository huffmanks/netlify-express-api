import express, { Router } from "express";
import serverless from "serverless-http";

import cors from "cors";
// import chromium from "@sparticuz/chromium";
// import puppeteer from "puppeteer-core";

// chromium.setHeadlessMode = true;
// chromium.setGraphicsMode = false;

const api = express();
api.use(express.json());

//
api.use(
  cors({
    origin: [/^http:\/\/localhost(:\d+)?$/, "https://huffmanks.com"],
  })
);

const router = Router();
router.get("/hello", (req, res) => res.send("Hello World!"));

router.get("/weather-data/:weatherSearch", async (req: express.Request, res: express.Response) => {
  try {
    const weatherSearch = req.params.weatherSearch;
    if (!weatherSearch) {
      throw Error("No search term provided.");
    }

    const GEONAMES_USER = process.env.GEONAMES_USER;
    const OPEN_WEATHER_MAP_API_KEY = process.env.OPEN_WEATHER_MAP_API_KEY;

    function extractZipCode(search: string) {
      const zipCodeRegex = /\b\d{5}\b/;
      const match = search.match(zipCodeRegex);
      return {
        route: match ? "zip?zip=" : "direct?q=",
        query: match ? match[0] : (search += ", US"),
      };
    }

    const { route, query } = extractZipCode(weatherSearch);

    const encodedQuery = route === "zip?zip=" ? query : encodeURIComponent(query);

    const geocodeUrl = `https://api.openweathermap.org/geo/1.0/${route}${encodedQuery}&appid=${OPEN_WEATHER_MAP_API_KEY}`;

    const geoCodeResponse = await fetch(geocodeUrl);
    if (!geoCodeResponse.ok) throw Error("No data found with that location.");

    const geoCodeData = await geoCodeResponse.json();

    const lat = geoCodeData?.[0]?.lat ? geoCodeData[0].lat : geoCodeData.lat;
    const lon = geoCodeData?.[0]?.lon ? geoCodeData[0].lon : geoCodeData.lon;

    if (!lat || !lon) throw Error;

    const timezoneUrl = `http://api.geonames.org/timezoneJSON?lat=${lat}&lng=${lon}&username=${GEONAMES_USER}`;

    const timezoneResponse = await fetch(timezoneUrl);
    const timezoneData = await timezoneResponse.json();

    const encodedTimezone = timezoneData?.timezoneId ? encodeURIComponent(timezoneData.timezoneId) : "auto";

    const weatherUrl = `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}&current=temperature_2m,relative_humidity_2m,apparent_temperature,weather_code,surface_pressure,wind_speed_10m,wind_direction_10m&hourly=temperature_2m,precipitation_probability,weather_code&daily=weather_code,temperature_2m_max,temperature_2m_min,sunrise,sunset,uv_index_max,precipitation_probability_max&temperature_unit=fahrenheit&wind_speed_unit=mph&precipitation_unit=inch&timezone=${encodedTimezone}&forecast_hours=24`;

    const weatherResponse = await fetch(weatherUrl);
    if (!weatherResponse.ok) throw Error;

    const weatherData = await weatherResponse.json();

    res.status(200).send(weatherData);
  } catch (error: any) {
    const message = error?.message ? error.message : error;
    res.status(500).send(message);
  }
});

// router.post("/generate-pdf", async (req, res) => {
//   try {
//     const { htmlContent } = req.body;

//     if (!htmlContent) {
//       return res.status(400).send("Missing htmlContent in request body");
//     }

//     console.log("Starting Puppeteer...");
//     const browser = await puppeteer.launch({
//       args: chromium.args,
//       defaultViewport: chromium.defaultViewport,
//       // executablePath: process.env.CHROME_EXECUTABLE_PATH || (await chromium.executablePath()),
//       executablePath: process.env.CHROME_EXECUTABLE_PATH || (await chromium.executablePath("https://github.com/Sparticuz/chromium/releases/download/v113.0.1/chromium-v113.0.1-pack.tar")),
//     });

//     console.log("Opening new page...");
//     const page = await browser.newPage();

//     console.log("Setting page content...");
//     await page.setContent(htmlContent, { waitUntil: "networkidle0" });

//     console.log("Generating PDF...");
//     const pdfBuffer = await page.pdf({
//       format: "letter",
//       printBackground: true,
//       margin: {
//         top: 40,
//         right: 0,
//         bottom: 40,
//         left: 0,
//       },
//     });

//     console.log("PDF generated successfully");
//     res.type("application/pdf");
//     res.send(pdfBuffer);

//     await browser.close();
//   } catch (error) {
//     console.error("Error generating PDF:", error);
//     res.status(500).send("Internal Server Error");
//   }
// });

api.use("/api/", router);

export const handler = serverless(api);
