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

  const data = result.data;

  const fToC = (f) => f !== undefined ? Number((((parseFloat(f) - 32) * 5) / 9).toFixed(1)) : null;
  const mphToKmh = (mph) => mph !== undefined ? Number((parseFloat(mph) * 1.60934).toFixed(1)) : null;
  const inToMm = (inches) => inches !== undefined ? Number((parseFloat(inches) * 25.4).toFixed(1)) : null;
  const inHgToHpa = (inHg) => inHg !== undefined ? Number((parseFloat(inHg) * 33.8639).toFixed(1)) : null;

  const record = {
    temp_c: fToC(data.outdoor?.temperature?.value),
    humidity: data.outdoor?.humidity?.value ? parseInt(data.outdoor.humidity.value) : null,
    wind_speed_kmh: mphToKmh(data.wind?.wind_speed?.value),
    wind_dir: data.wind?.wind_direction?.value ? parseInt(data.wind.wind_direction.value) : null,
    rain_rate_mm: inToMm(data.rainfall?.rain_rate?.value),
    daily_rain_mm: inToMm(data.rainfall?.daily?.value),
    pressure_hpa: inHgToHpa(data.pressure?.relative?.value)
  };

  const { error } = await supabase.from('weather_logs').insert([record]);
  if (error) throw error;

  return record;
}

// API Endpoints
app.get('/api/weather', async (req, res) => {
  try {
    const { data, error } = await supabase
      .from('weather_logs')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(1)
      .single();

    if (error) throw error;
    res.json({ success: true, data });
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
    res.json({ success: true, message: 'Saved to Supabase', data: newRecord });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

export default app;

if (process.env.NODE_ENV !== 'production') {
  app.listen(PORT, () => console.log(`Server on http://localhost:${PORT}`));
}