import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import { createClient } from '@supabase/supabase-js';

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_KEY
);

/**
 * Calculates Dew Point in °C from Temperature (°C) and Humidity (%)
 */
function calcDewPoint(tempC, humidity) {
  if (tempC == null || humidity == null) return null;
  const a = 17.27;
  const b = 237.7;
  const alpha = ((a * tempC) / (b + tempC)) + Math.log(humidity / 100);
  return Number(((b * alpha) / (a - alpha)).toFixed(1));
}

/**
 * Calculates Heat Index / Feels Like in °C
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

async function fetchAndStoreWeather() {
  const APP_KEY = process.env.ECOWITT_APP_KEY;
  const API_KEY = process.env.ECOWITT_API_KEY;
  const MAC = process.env.ECOWITT_MAC;

  const url = `https://api.ecowitt.net/api/v3/device/real_time?application_key=${APP_KEY}&api_key=${API_KEY}&mac=${MAC}&call_back=all`;

  const response = await fetch(url);
  const result = await response.json();

  if (result.code !== 0) throw new Error(result.msg || 'Ecowitt API Error');

  const d = result.data || {};

  // Safely extract numeric values (handling unit strings or raw numbers)
  const getVal = (obj) => {
    if (!obj || obj.value === undefined || obj.value === null) return null;
    const parsed = parseFloat(obj.value);
    return isNaN(parsed) ? null : parsed;
  };

  const tempC = getVal(d.outdoor?.temperature);
  const humidity = getVal(d.outdoor?.humidity);
  const indoorTempC = getVal(d.indoor?.temperature);
  const indoorHumidity = getVal(d.indoor?.humidity);

  const record = {
    // Outdoor
    temp_c: tempC,
    humidity: humidity,
    feels_like_c: getVal(d.outdoor?.feels_like) ?? calcFeelsLike(tempC, humidity),
    dew_point_c: getVal(d.outdoor?.dew_point) ?? calcDewPoint(tempC, humidity),

    // Indoor
    indoor_temp_c: indoorTempC,
    indoor_humidity: indoorHumidity,

    // Solar & UVI
    solar_w_m2: getVal(d.solar_and_uvi?.solar_radiation),
    uvi: getVal(d.solar_and_uvi?.uvi),

    // Rainfall
    rain_rate_mm: getVal(d.rainfall?.rain_rate),
    daily_rain_mm: getVal(d.rainfall?.daily),
    event_rain_mm: getVal(d.rainfall?.event),
    hourly_rain_mm: getVal(d.rainfall?.hourly),
    weekly_rain_mm: getVal(d.rainfall?.weekly),
    monthly_rain_mm: getVal(d.rainfall?.monthly),
    yearly_rain_mm: getVal(d.rainfall?.yearly),

    // Wind
    wind_speed_kmh: getVal(d.wind?.wind_speed),
    wind_gust_kmh: getVal(d.wind?.wind_gust),
    wind_dir: getVal(d.wind?.wind_direction),

    // Pressure
    pressure_rel_hpa: getVal(d.pressure?.relative),
    pressure_abs_hpa: getVal(d.pressure?.absolute)
  };

  const { error } = await supabase.from('weather_logs').insert([record]);
  if (error) throw error;

  return record;
}

// Routes
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

app.get('/api/roads', async (req, res) => {
  try {
    const { data, error } = await supabase.from('road_segments').select('*');
    if (error) throw error;
    res.json({ success: true, data });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

app.get('/api/cron/fetch-weather', async (req, res) => {
  try {
    const newRecord = await fetchAndStoreWeather();
    res.json({ success: true, message: 'Saved reading to Supabase', data: newRecord });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

export default app;

if (process.env.NODE_ENV !== 'production') {
  app.listen(PORT, () => console.log(`Server running on http://localhost:${PORT}`));
}