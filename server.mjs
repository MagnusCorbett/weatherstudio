import { createServer as createHttpServer } from 'node:http'
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { createServer as createViteServer } from 'vite'

const port = Number(process.env.PORT || 5173)
const projectDir = dirname(fileURLToPath(import.meta.url))
const googleWeatherBase = 'https://weather.googleapis.com/v1/'
const cache = new Map()
const cacheTtlMs = 10 * 60 * 1000

function readLocalEnv() {
  try {
    const contents = readFileSync(join(projectDir, '.env.local'), 'utf8')
    return Object.fromEntries(contents.split(/\r?\n/).flatMap((line) => {
      const trimmed = line.trim()
      if (!trimmed || trimmed.startsWith('#')) return []
      const separator = trimmed.indexOf('=')
      if (separator < 0) return []
      const key = trimmed.slice(0, separator).trim()
      const value = trimmed.slice(separator + 1).trim().replace(/^['"]|['"]$/g, '')
      return [[key, value]]
    }))
  } catch {
    return {}
  }
}

function getGoogleWeatherKey() {
  const localEnv = readLocalEnv()
  const configuredKey = process.env.GOOGLE_WEATHER_DEMO_KEY || localEnv.GOOGLE_WEATHER_DEMO_KEY
  return configuredKey && !configuredKey.startsWith('replace_with_') ? configuredKey : ''
}

function sendJson(response, status, payload) {
  response.statusCode = status
  response.setHeader('Content-Type', 'application/json; charset=utf-8')
  response.setHeader('Cache-Control', 'no-store')
  response.end(JSON.stringify(payload))
}

function validCoordinate(value, min, max) {
  const number = Number(value)
  return Number.isFinite(number) && number >= min && number <= max
}

async function googleRequest(path, params) {
  const googleWeatherKey = getGoogleWeatherKey()
  const url = new URL(`${googleWeatherBase}${path}`)
  url.searchParams.set('key', googleWeatherKey)
  for (const [name, value] of Object.entries(params)) url.searchParams.set(name, String(value))

  let response
  try {
    response = await fetch(url)
  } catch (error) {
    const networkError = new Error(`${path}: ${error.message || 'network request failed'}`)
    networkError.status = 502
    throw networkError
  }
  const body = await response.json().catch(() => ({}))
  if (!response.ok) {
    const message = body?.error?.message || `Google Weather API returned ${response.status}`
    const error = new Error(message)
    error.status = response.status
    throw error
  }
  return body
}

async function handleWeather(request, response) {
  const url = new URL(request.url, 'http://localhost')
  const latitude = url.searchParams.get('lat')
  const longitude = url.searchParams.get('lon')

  const googleWeatherKey = getGoogleWeatherKey()
  if (!googleWeatherKey) {
    sendJson(response, 503, {
      code: 'MISSING_DEMO_KEY',
      message: 'Add GOOGLE_WEATHER_DEMO_KEY to .env.local to enable live Google Weather data.',
    })
    return
  }

  if (!validCoordinate(latitude, -90, 90) || !validCoordinate(longitude, -180, 180)) {
    sendJson(response, 400, { code: 'INVALID_LOCATION', message: 'A valid latitude and longitude are required.' })
    return
  }

  const cacheKey = `${Number(latitude).toFixed(3)}:${Number(longitude).toFixed(3)}`
  const cached = cache.get(cacheKey)
  if (cached && cached.expiresAt > Date.now()) {
    sendJson(response, 200, { ...cached.payload, cached: true })
    return
  }

  const location = {
    'location.latitude': Number(latitude),
    'location.longitude': Number(longitude),
    units_system: 'IMPERIAL',
    language_code: 'en',
  }
  const alertLocation = {
    'location.latitude': Number(latitude),
    'location.longitude': Number(longitude),
  }

  try {
    const [current, hourly, daily, alerts] = await Promise.all([
      googleRequest('currentConditions:lookup', location),
      googleRequest('forecast/hours:lookup', { ...location, hours: 24, pageSize: 24 }),
      googleRequest('forecast/days:lookup', { ...location, days: 7, pageSize: 7 }),
      googleRequest('publicAlerts:lookup', { ...alertLocation, pageSize: 5 }),
    ])

    const payload = {
      source: 'Google Weather API',
      fetchedAt: new Date().toISOString(),
      location: { latitude: Number(latitude), longitude: Number(longitude) },
      current,
      hourly,
      daily,
      alerts,
    }
    cache.set(cacheKey, { expiresAt: Date.now() + cacheTtlMs, payload })
    sendJson(response, 200, payload)
  } catch (error) {
    sendJson(response, error.status || 502, {
      code: 'GOOGLE_WEATHER_ERROR',
      message: error.message || 'Unable to load Google Weather data.',
    })
  }
}

async function handleGeocode(request, response) {
  const url = new URL(request.url, 'http://localhost')
  const query = url.searchParams.get('query')?.trim()

  if (!query) {
    sendJson(response, 400, { code: 'MISSING_QUERY', message: 'Enter a city or ZIP code to search.' })
    return
  }

  const geocodeUrl = new URL('https://geocoding-api.open-meteo.com/v1/search')
  geocodeUrl.searchParams.set('name', query)
  geocodeUrl.searchParams.set('count', '8')
  geocodeUrl.searchParams.set('language', 'en')
  geocodeUrl.searchParams.set('format', 'json')
  const geocodeResponse = await fetch(geocodeUrl)
  const body = await geocodeResponse.json().catch(() => ({}))
  const results = Array.isArray(body?.results)
    ? body.results.filter((result) => Number.isFinite(result?.latitude) && Number.isFinite(result?.longitude) && result?.name)
    : []

  if (!geocodeResponse.ok || !results.length) {
    sendJson(response, geocodeResponse.ok ? 404 : geocodeResponse.status, {
      code: 'LOCATION_NOT_FOUND',
      message: 'We could not find that location.',
    })
    return
  }

  const locations = results.map((result) => {
    const region = result.admin1 && result.admin1 !== result.name ? ', ' + result.admin1 : ''
    const country = result.country_code && result.country_code !== 'US' ? ', ' + result.country_code : ''
    return {
      label: String(result.name) + region + country,
      latitude: result.latitude,
      longitude: result.longitude,
    }
  }).filter((location, index, all) => all.findIndex((candidate) => candidate.label === location.label && candidate.latitude === location.latitude && candidate.longitude === location.longitude) === index).slice(0, 8)

  sendJson(response, 200, { results: locations })
}

async function handleReverseGeocode(request, response) {
  const url = new URL(request.url, 'http://localhost')
  const latitude = url.searchParams.get('lat')
  const longitude = url.searchParams.get('lon')

  if (!validCoordinate(latitude, -90, 90) || !validCoordinate(longitude, -180, 180)) {
    sendJson(response, 400, { code: 'INVALID_LOCATION', message: 'A valid latitude and longitude are required.' })
    return
  }

  const reverseUrl = new URL('https://nominatim.openstreetmap.org/reverse')
  reverseUrl.searchParams.set('lat', latitude)
  reverseUrl.searchParams.set('lon', longitude)
  reverseUrl.searchParams.set('format', 'jsonv2')
  reverseUrl.searchParams.set('zoom', '10')
  const reverseResponse = await fetch(reverseUrl, { headers: { 'User-Agent': 'Weather Studio local preview' } })
  const body = await reverseResponse.json().catch(() => ({}))
  const address = body?.address || {}

  if (!reverseResponse.ok) {
    sendJson(response, reverseResponse.status, { code: 'LOCATION_LABEL_ERROR', message: 'We found your location, but could not label it.' })
    return
  }

  const label = address.city || address.town || address.village || address.municipality || address.county || 'Current location'
  const region = address.state && address.state !== label ? `, ${address.state}` : ''
  sendJson(response, 200, { label: `${label}${region}`, latitude: Number(latitude), longitude: Number(longitude) })
}

async function requestApproximateLocation(providerUrl) {
  const locationResponse = await fetch(providerUrl, {
    headers: { Accept: 'application/json', 'User-Agent': 'Weather Studio local preview' },
  })
  const body = await locationResponse.json().catch(() => ({}))
  const [ipInfoLatitude, ipInfoLongitude] = String(body?.loc || '').split(',')
  const latitude = Number(body?.latitude ?? ipInfoLatitude)
  const longitude = Number(body?.longitude ?? ipInfoLongitude)

  if (!locationResponse.ok || body?.error || !validCoordinate(latitude, -90, 90) || !validCoordinate(longitude, -180, 180)) {
    throw new Error('Provider did not return a valid location.')
  }

  const region = body.region_code || body.region || body.regionName
  return {
    label: [body.city, region].filter(Boolean).join(', ') || 'Approximate location',
    latitude,
    longitude,
    approximate: true,
  }
}

async function handleIpLocation(request, response) {
  const providers = ['https://ipapi.co/json/', 'https://ipwho.is/', 'https://ipinfo.io/json']
  for (const provider of providers) {
    try {
      sendJson(response, 200, await requestApproximateLocation(provider))
      return
    } catch {
      // Try the next no-key provider if this network cannot reach the first one.
    }
  }

  sendJson(response, 502, {
    code: 'APPROXIMATE_LOCATION_ERROR',
    message: 'Approximate location is unavailable right now.',
  })
}

const vite = await createViteServer({ server: { middlewareMode: true } })
const server = createHttpServer((request, response) => {
  if (request.url?.startsWith('/api/weather')) {
    handleWeather(request, response)
    return
  }
  if (request.url?.startsWith('/api/geocode')) {
    handleGeocode(request, response).catch((error) => sendJson(response, 502, { code: 'GEOCODE_ERROR', message: error.message || 'Unable to search for that location.' }))
    return
  }
  if (request.url?.startsWith('/api/reverse-geocode')) {
    handleReverseGeocode(request, response).catch((error) => sendJson(response, 502, { code: 'REVERSE_GEOCODE_ERROR', message: error.message || 'Unable to label your location.' }))
    return
  }
  if (request.url?.startsWith('/api/ip-location')) {
    handleIpLocation(request, response).catch((error) => sendJson(response, 502, { code: 'APPROXIMATE_LOCATION_ERROR', message: error.message || 'Approximate location is unavailable right now.' }))
    return
  }
  vite.middlewares.handle(request, response, () => {
    if (!response.writableEnded) sendJson(response, 404, { code: 'NOT_FOUND' })
  })
})

server.listen(port, () => {
  console.log(`Weather Studio running at http://localhost:${port}`)
  console.log(getGoogleWeatherKey() ? 'Google Weather demo key detected.' : 'Google Weather demo key not configured; using stubbed data.')
})

const shutdown = async () => {
  await vite.close()
  server.close(() => process.exit(0))
}
process.on('SIGINT', shutdown)
process.on('SIGTERM', shutdown)
