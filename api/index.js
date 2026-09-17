// Add these additional conversions and fields inside fetchAndStoreWeather() in api/index.js

const record = {
  // Outdoor
  temp_c: fToC(data.outdoor?.temperature?.value),
  humidity: data.outdoor?.humidity?.value ? parseInt(data.outdoor.humidity.value) : null,
  feels_like_c: fToC(data.outdoor?.feels_like?.value),
  dew_point_c: fToC(data.outdoor?.dew_point?.value),
  
  // Indoor
  indoor_temp_c: fToC(data.indoor?.temperature?.value),
  indoor_humidity: data.indoor?.humidity?.value ? parseInt(data.indoor.humidity.value) : null,
  
  // Solar & UVI
  solar_w_m2: data.solar_and_uvi?.solar_radiation?.value ? parseFloat(data.solar_and_uvi.solar_radiation.value) : null,
  uvi: data.solar_and_uvi?.uvi?.value ? parseInt(data.solar_and_uvi.uvi.value) : null,
  
  // Rainfall
  rain_rate_mm: inToMm(data.rainfall?.rain_rate?.value),
  daily_rain_mm: inToMm(data.rainfall?.daily?.value),
  event_rain_mm: inToMm(data.rainfall?.event?.value),
  hourly_rain_mm: inToMm(data.rainfall?.hourly?.value),
  weekly_rain_mm: inToMm(data.rainfall?.weekly?.value),
  monthly_rain_mm: inToMm(data.rainfall?.monthly?.value),
  yearly_rain_mm: inToMm(data.rainfall?.yearly?.value),
  
  // Wind
  wind_speed_kmh: mphToKmh(data.wind?.wind_speed?.value),
  wind_gust_kmh: mphToKmh(data.wind?.gust?.value),
  wind_dir: data.wind?.wind_direction?.value ? parseInt(data.wind.wind_direction.value) : null,
  
  // Pressure
  pressure_rel_hpa: inHgToHpa(data.pressure?.relative?.value),
  pressure_abs_hpa: inHgToHpa(data.pressure?.absolute?.value),
  
  // Battery Status
  battery_sensor_array: data.battery?.sensor_array?.value || 'Normal'
};