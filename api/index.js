import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import { createClient } from '@supabase/supabase-js';

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());

// Initialize Supabase Client
const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_KEY
);

/* ==========================================================================
   CONVERSION HELPER FUNCTIONS (Imperial -> Metric)
   ========================================================================== */

// Fahrenheit to Celsius
const fToC = (f) => (f !== null && f !== undefined && !isNaN(f)) 
  ? Number((((parseFloat(f) - 32) * 5) / 9).toFixed(1)) 
  : null;

// Inches of Mercury (inHg) to Hectopascals (hPa)
const inHgToHpa = (inHg) => (inHg !== null && inHg !== undefined && !isNaN(inHg)) 
  ? Number((parseFloat(inHg) * 33.8639).toFixed(1)) 
  : null;

// Miles per hour (mph) to Kilometers per hour (km/h)
const mphToKmh = (mph) => (mph !== null && mph !== undefined && !isNaN(mph)) 
  ? Number((parseFloat(mph) * 1.60934).toFixed(1)) 
  : null;

// Inches to Millimeters (mm)
const inToMm = (inches) => (inches !== null && inches !== undefined && !isNaN(inches)) 
  ? Number((parseFloat(inches) * 25.4).toFixed(1)) 
  : null;

/**
 * Fallback: Calculates Dew Point in °C from Temperature (°C) and Humidity (%)
 */
function calcDewPoint(tempC, humidity) {
  if (tempC == null || humidity == null) return null;
  const a = 17.27;
  const b = 237.7;
  const alpha = ((a * tempC) / (b + tempC)) + Math.log(humidity / 100);
  return Number(((b * alpha) / (a - alpha)).toFixed(1));
}

/**
 * Fallback: Calculates Heat Index / Feels Like in °C
 */
function calcFeelsLike(tempC, humidity) {
  if (tempC == null) return null;
  if (humidity == null || tempC < 27) return tempC;
  const c1 = -8.78469475556;
  const c2 = 1.61139411;
  const c3 = 2.33854883889;
  const c4 = -0.14611605;
  const c5 = -0.012308094;
  const c6 = -0.0164248277778;
  const c7 = 0.002211732;
  const c8 = 0.00072546;
  const c9 = -0.000003582;
  const hi = c1 + (c2 * tempC) + (c3 * humidity) + (c4 * tempC * humidity) + 
             (c5 * tempC * tempC) + (c6 * humidity * humidity) + 
             (c7 * tempC * tempC * humidity) + (c8 * tempC * humidity * humidity) + 
             (c9 * tempC * tempC * humidity * humidity);
  return Number(hi.toFixed(1));
}

/**
 * Primary Core Handler: Fetches real-time payload from Ecowitt Cloud API,
 * converts all units to Metric, and inserts record into Supabase.
 */
async function fetchAndStoreWeather() {
  const APP_KEY = process.env.ECOWITT_APP_KEY;
  const API_KEY = process.env.ECOWITT_API_KEY;
  const MAC = process.env.ECOWITT_MAC;

  const url = `https://api.ecowitt.net/api/v3/device/real_time?application_key=${APP_KEY}&api_key=${API_KEY}&mac=${MAC}&call_back=all`;

  const response = await fetch(url);
  const result = await response.json();

  if (result.code !== 0) {
    throw new Error(result.msg || 'Ecowitt API returned an error');
  }

  const d = result.data || {};

  // Extract raw numeric value safely
  const getRaw = (obj) => {
    if (!obj || obj.value === undefined || obj.value === null) return null;
    const parsed = parseFloat(obj.value);
    return isNaN(parsed) ? null : parsed;
  };

  // Convert raw values to metric
  const rawOutdoorTemp = getRaw(d.outdoor?.temperature);
  const tempC = fToC(rawOutdoorTemp);
  const humidity = getRaw(d.outdoor?.humidity);

  const rawIndoorTemp = getRaw(d.indoor?.temperature);
  const indoorTempC = fToC(rawIndoorTemp);
  const indoorHumidity = getRaw(d.indoor?.humidity);

  const record = {
    // Outdoor
    temp_c: tempC,
    humidity: humidity,
    feels_like_c: fToC(getRaw(d.outdoor?.feels_like)) ?? calcFeelsLike(tempC, humidity),
    dew_point_c: fToC(getRaw(d.outdoor?.dew_point)) ?? calcDewPoint(tempC, humidity),

    // Indoor
    indoor_temp_c: indoorTempC,
    indoor_humidity: indoorHumidity,

    // Solar & UVI
    solar_w_m2: getRaw(d.solar_and_uvi?.solar_radiation),
    uvi: getRaw(d.solar_and_uvi?.uvi),

    // Rainfall
    rain_rate_mm: inToMm(getRaw(d.rainfall?.rain_rate)),
    daily_rain_mm: inToMm(getRaw(d.rainfall?.daily)),
    event_rain_mm: inToMm(getRaw(d.rainfall?.event)),
    hourly_rain_mm: inToMm(getRaw(d.rainfall?.hourly)),
    weekly_rain_mm: inToMm(getRaw(d.rainfall?.weekly)),
    monthly_rain_mm: inToMm(getRaw(d.rainfall?.monthly)),
    yearly_rain_mm: inToMm(getRaw(d.rainfall?.yearly)),

    // Wind
    wind_speed_kmh: mphToKmh(getRaw(d.wind?.wind_speed)),
    wind_gust_kmh: mphToKmh(getRaw(d.wind?.wind_gust)),
    wind_dir: getRaw(d.wind?.wind_direction),

    // Pressure
    pressure_rel_hpa: inHgToHpa(getRaw(d.pressure?.relative)),
    pressure_abs_hpa: inHgToHpa(getRaw(d.pressure?.absolute))
  };

  // Insert converted metric record into Supabase
  const { error } = await supabase.from('weather_logs').insert([record]);
  if (error) throw error;

  return record;
}

/* ==========================================================================
   API ENDPOINTS
   ========================================================================== */

// 1. GET Latest Weather Reading
app.get('/api/weather', async (req, res) => {
  try {
    const { data, error } = await supabase
      .from('weather_logs')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(1);

    if (error) throw error;
    res.json({ success: true, data: data && data.length > 0 ? data[0] : null });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// 2. GET Road Passability Conditions
app.get('/api/roads', async (req, res) => {
  try {
    const { data, error } = await supabase.from('road_segments').select('*');
    if (error) throw error;
    res.json({ success: true, data });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// 3. Cron Endpoint (Executed via cron-job.org or direct curl)
app.get('/api/cron/fetch-weather', async (req, res) => {
  try {
    const newRecord = await fetchAndStoreWeather();
    res.json({ success: true, message: 'Saved converted metrics to Supabase', data: newRecord });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

export default app;

// Local Server Development Engine
if (process.env.NODE_ENV !== 'production') {
  app.listen(PORT, () => {
    console.log(`Server running locally on http://localhost:${PORT}`);
  });
}