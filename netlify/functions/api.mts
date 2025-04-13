import chromium from "@sparticuz/chromium";
import cors from "cors";
import express, { Router } from "express";
import rateLimit from "express-rate-limit";
import puppeteer from "puppeteer-core";
import serverless from "serverless-http";

chromium.setGraphicsMode = false;
// const isLocal = process.env.NETLIFY_DEV === "true" || process.env.NODE_ENV === "development";
// async function getLocalChromePath() {
//   try {
//     if (isLocal) {
//       return puppeteer.executablePath();
//     } else {
//       const chromePath = await chromium.executablePath();
//       return chromePath || undefined;
//     }
//   } catch (error) {
//     console.error(error);
//     return undefined;
//   }
// }

const api = express();
api.use(express.json({ limit: "10mb" }));

api.use(
  cors({
    origin: [/^http:\/\/localhost(:\d+)?$/, "https://huffmanks.com"],
  })
);

api.use(
  rateLimit({
    windowMs: 15 * 60 * 1000,
    limit: 50,
    standardHeaders: "draft-8",
    legacyHeaders: false,
    skipFailedRequests: true,
    keyGenerator: (req) => {
      const forwarded = req.headers["x-forwarded-for"];
      const ip = typeof forwarded === "string" ? forwarded.split(",")[0].trim() : Array.isArray(forwarded) ? forwarded[0].split(",")[0].trim() : undefined;

      return ip || req.ip || "localhost";
    },
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

router.post("/generate-pdf", async (req, res) => {
  try {
    const { htmlContent } = req.body;

    if (!htmlContent) {
      return res.status(400).send("Missing htmlContent in request body");
    }

    const executablePath = await chromium.executablePath(); //await getLocalChromePath();

    console.log("Starting Puppeteer...");
    const browser = await puppeteer.launch({
      args: chromium.args,
      defaultViewport: chromium.defaultViewport,
      executablePath,
      headless: chromium.headless,
    });

    console.log("Opening new page...");
    const page = await browser.newPage();

    console.log("Setting page content...");
    await page.setContent(htmlContent, { waitUntil: "networkidle0" });

    console.log("Generating PDF...");
    const pdfBuffer = await page.pdf({
      format: "letter",
      printBackground: true,
      margin: {
        top: 40,
        right: 0,
        bottom: 40,
        left: 0,
      },
    });

    console.log("PDF generated successfully");
    res.setHeader("Content-Type", "application/pdf");
    res.setHeader("Content-Disposition", 'inline; filename="generated.pdf"');
    res.status(200);
    res.end(pdfBuffer);

    await browser.close();

    // Create a temp file path
    // const tmpFileName = `tmp-${new Date().toString()}.pdf`;
    // const tmpFilePath = path.join("/tmp", tmpFileName);

    // // Save the PDF
    // fs.writeFileSync(tmpFilePath, pdfBuffer);

    // // Send it
    // res.setHeader("Content-Type", "application/pdf");
    // res.setHeader("Content-Disposition", 'inline; filename="generated.pdf"');
    // res.sendFile(tmpFilePath, (err) => {
    //   // Clean up temp file after response is sent
    //   fs.unlink(tmpFilePath, () => {});
    //   if (err) {
    //     console.error("Error sending file:", err);
    //     res.status(500).end();
    //   }
    // });
  } catch (error) {
    console.error("Error generating PDF:", error);
    res.status(500).send("Internal Server Error");
  }
});

api.use("/api/", router);

export const handler = serverless(api);
