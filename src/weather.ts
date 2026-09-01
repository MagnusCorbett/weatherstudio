import { Cloud, CloudDrizzle, CloudLightning, CloudRain, CloudSun, Sun } from 'lucide-react'
import type { ComponentType } from 'react'

export type WeatherIconComponent = ComponentType<{ size?: number; className?: string; strokeWidth?: number }>

export type LocationCoordinates = {
  label: string
  latitude: number
  longitude: number
}

export type DashboardWeather = {
  source: string
  timeZone: string
  updatedAt: string
  current: {
    temperature: number
    feelsLike: number
    condition: string
    icon: WeatherIconComponent
    windSpeed: number
    windDirection: string
    humidity: number
    pressure: number
    visibility: number
    uvIndex: number
    dewPoint: number
    precipitationChance: number
  }
  hourly: Array<{ time: string; temp: number; icon: WeatherIconComponent; rain: string }>
  forecast: Array<{ day: string; date: string; icon: WeatherIconComponent; high: number; low: number; rain: string; condition: string }>
  sunrise: string
  sunset: string
  alerts: Array<{ title: string; severity?: string; description?: string }>
}

type JsonObject = Record<string, any>

const fallback = (value: unknown, defaultValue = 0) => typeof value === 'number' && Number.isFinite(value) ? value : defaultValue
const pad = (value: number) => String(value).padStart(2, '0')

function iconForCondition(value = ''): WeatherIconComponent {
  const condition = value.toLowerCase()
  if (condition.includes('thunder')) return CloudLightning
  if (condition.includes('rain') || condition.includes('shower')) return CloudRain
  if (condition.includes('drizzle')) return CloudDrizzle
  if (condition.includes('clear') || condition.includes('sunny')) return Sun
  if (condition.includes('cloud')) return CloudSun
  return Cloud
}

function description(value: JsonObject | undefined, fallbackText = 'Partly cloudy') {
  return value?.description?.text || fallbackText
}

function dateValue(date: JsonObject | undefined, intervalStart?: string) {
  if (date?.year && date?.month && date?.day) return `${date.year}-${pad(date.month)}-${pad(date.day)}T12:00:00Z`
  return intervalStart || new Date().toISOString()
}

function formatDay(date: string, timeZone: string, index: number) {
  const parsed = new Date(date)
  return index === 0 ? 'Today' : new Intl.DateTimeFormat('en-US', { weekday: 'short', timeZone }).format(parsed)
}

function formatDate(date: string, timeZone: string) {
  return new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric', timeZone }).format(new Date(date))
}

function formatHour(item: JsonObject, timeZone: string, index: number) {
  if (index === 0) return 'Now'
  const date = item?.interval?.startTime || new Date().toISOString()
  return new Intl.DateTimeFormat('en-US', { hour: 'numeric', minute: '2-digit', timeZone }).format(new Date(date))
}

function convertPressure(millibars: number) {
  return millibars * 0.029529983
}

export async function fetchWeather(location: LocationCoordinates): Promise<DashboardWeather> {
  const response = await fetch(`/api/weather?lat=${location.latitude}&lon=${location.longitude}`)
  const payload = await response.json().catch(() => ({}))
  if (!response.ok) throw new Error(payload?.message || 'Unable to load Google Weather data.')

  const current = payload.current || {}
  const hourlyResponse = payload.hourly || {}
  const dailyResponse = payload.daily || {}
  const timeZone = current.timeZone?.id || hourlyResponse.timeZone?.id || dailyResponse.timeZone?.id || 'America/Los_Angeles'
  const forecastDays = dailyResponse.forecastDays || []
  const forecastHours = hourlyResponse.forecastHours || []
  const firstDay = forecastDays[0] || {}
  const daytime = firstDay.daytimeForecast || {}
  const currentCondition = description(current.weatherCondition)

  return {
    source: payload.source || 'Google Weather API',
    timeZone,
    updatedAt: current.currentTime || payload.fetchedAt || new Date().toISOString(),
    current: {
      temperature: fallback(current.temperature?.degrees, 72),
      feelsLike: fallback(current.feelsLikeTemperature?.degrees, 71),
      condition: currentCondition,
      icon: iconForCondition(currentCondition),
      windSpeed: fallback(current.wind?.speed?.value, 9),
      windDirection: String(current.wind?.direction?.cardinal || 'WEST_SOUTHWEST').replaceAll('_', '-'),
      humidity: fallback(current.relativeHumidity, 63),
      pressure: convertPressure(fallback(current.airPressure?.meanSeaLevelMillibars, 1017)),
      visibility: fallback(current.visibility?.distance, 10),
      uvIndex: fallback(current.uvIndex, 4),
      dewPoint: fallback(current.dewPoint?.degrees, 59),
      precipitationChance: fallback(current.precipitation?.probability?.percent, 8),
    },
    hourly: forecastHours.slice(0, 8).map((item: JsonObject, index: number) => {
      const itemCondition = description(item.weatherCondition, currentCondition)
      return {
        time: formatHour(item, timeZone, index),
        temp: fallback(item.temperature?.degrees, 72),
        icon: iconForCondition(itemCondition),
        rain: `${fallback(item.precipitation?.probability?.percent, 0)}%`,
      }
    }),
    forecast: forecastDays.slice(0, 7).map((item: JsonObject, index: number) => {
      const dayDate = dateValue(item.displayDate, item.interval?.startTime)
      const dayCondition = description(item.daytimeForecast?.weatherCondition, description(item.nighttimeForecast?.weatherCondition))
      return {
        day: formatDay(dayDate, timeZone, index),
        date: formatDate(dayDate, timeZone),
        icon: iconForCondition(dayCondition),
        high: fallback(item.maxTemperature?.degrees, 72),
        low: fallback(item.minTemperature?.degrees, 58),
        rain: `${fallback(item.daytimeForecast?.precipitation?.probability?.percent, 0)}%`,
        condition: dayCondition,
      }
    }),
    sunrise: firstDay.sunEvents?.sunriseTime || new Date().toISOString(),
    sunset: firstDay.sunEvents?.sunsetTime || new Date().toISOString(),
    alerts: (payload.alerts?.weatherAlerts || []).map((alert: JsonObject) => ({
      title: alert.alertTitle?.text || alert.eventType || 'Weather alert',
      severity: alert.severity,
      description: alert.description,
    })),
  }
}

export async function geocodeLocation(query: string): Promise<LocationCoordinates[]> {
  const response = await fetch(`/api/geocode?query=${encodeURIComponent(query)}`)
  const payload = await response.json().catch(() => ({}))
  const results = Array.isArray(payload.results) ? payload.results : []
  if (!response.ok || !results.length) throw new Error(payload?.message || 'We could not find that location.')
  return results.map((item: Record<string, unknown>) => ({
    label: String(item.label || 'Unknown location'),
    latitude: Number(item.latitude),
    longitude: Number(item.longitude),
  }))
}

export async function reverseGeocodeLocation(latitude: number, longitude: number): Promise<LocationCoordinates> {
  const response = await fetch(`/api/reverse-geocode?lat=${latitude}&lon=${longitude}`)
  const payload = await response.json().catch(() => ({}))
  if (!response.ok) throw new Error(payload?.message || 'Unable to label your location.')
  return {
    label: payload.label,
    latitude: payload.latitude,
    longitude: payload.longitude,
  }
}

export async function getApproximateLocation(): Promise<LocationCoordinates> {
  const response = await fetch('/api/ip-location')
  const payload = await response.json().catch(() => ({}))
  if (!response.ok) throw new Error(payload?.message || 'Approximate location is unavailable right now.')
  return {
    label: payload.label,
    latitude: payload.latitude,
    longitude: payload.longitude,
  }
}

export function formatClock(value: string, timeZone: string) {
  return new Intl.DateTimeFormat('en-US', { hour: 'numeric', minute: '2-digit', timeZone }).format(new Date(value))
}
