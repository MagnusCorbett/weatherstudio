import { useEffect, useMemo, useRef, useState, type ComponentType } from 'react'
import {
  AirVent,
  ChevronDown,
  ChevronRight,
  Cloud,
  CloudDrizzle,
  CloudLightning,
  CloudRain,
  CloudSun,
  Droplets,
  Gauge,
  Globe2,
  Heart,
  LocateFixed,
  MapPin,
  Moon,
  MoreHorizontal,
  Navigation,
  Plus,
  Search,
  Settings,
  ShieldCheck,
  Sun,
  Sunrise,
  Sunset,
  Thermometer,
  Umbrella,
  UserRound,
  Wind,
  X,
} from 'lucide-react'
import { fetchWeather, formatClock, geocodeLocation, getApproximateLocation, reverseGeocodeLocation, type DashboardWeather, type LocationCoordinates, type WeatherIconComponent } from './weather'

type ThemeName = 'mono' | 'light' | 'dark' | 'midnight' | 'aurora' | 'sand' | 'contrast'
type Unit = 'F' | 'C'

const themes: { id: ThemeName; label: string; note: string; swatches: string[] }[] = [
  { id: 'mono', label: 'Monochrome', note: 'Neutral with weather accents', swatches: ['#0b0c0e', '#17191c', '#d9dde3'] },
  { id: 'light', label: 'Daylight', note: 'Warm and clear', swatches: ['#f7f9fc', '#e8eefb', '#4f6ef7'] },
  { id: 'dark', label: 'Moonlight', note: 'Soft dark mode', swatches: ['#121724', '#202b42', '#8da8ff'] },
  { id: 'midnight', label: 'Pitch black', note: 'OLED friendly', swatches: ['#050607', '#101214', '#8ca9ff'] },
  { id: 'aurora', label: 'Aurora', note: 'Cool and electric', swatches: ['#071a22', '#143f4a', '#8cf4d0'] },
  { id: 'sand', label: 'Desert haze', note: 'Calm and golden', swatches: ['#241a14', '#423126', '#f4bd74'] },
  { id: 'contrast', label: 'High contrast', note: 'Maximum clarity', swatches: ['#000000', '#202020', '#f3e500'] },
]

const demoForecast = [
  { day: 'Today', date: 'Oct 24', icon: CloudSun, high: 72, low: 58, rain: '8%', condition: 'Partly cloudy' },
  { day: 'Fri', date: 'Oct 25', icon: Sun, high: 75, low: 59, rain: '2%', condition: 'Sunny' },
  { day: 'Sat', date: 'Oct 26', icon: CloudSun, high: 69, low: 56, rain: '16%', condition: 'Partly cloudy' },
  { day: 'Sun', date: 'Oct 27', icon: CloudRain, high: 64, low: 54, rain: '62%', condition: 'Showers' },
  { day: 'Mon', date: 'Oct 28', icon: CloudDrizzle, high: 66, low: 53, rain: '46%', condition: 'Drizzle' },
  { day: 'Tue', date: 'Oct 29', icon: Sun, high: 71, low: 55, rain: '4%', condition: 'Sunny' },
  { day: 'Wed', date: 'Oct 30', icon: CloudSun, high: 73, low: 57, rain: '11%', condition: 'Partly cloudy' },
]

const demoHourly = [
  { time: 'Now', temp: 72, icon: CloudSun, rain: 'Now' },
  { time: '11 AM', temp: 73, icon: CloudSun, rain: '8%' },
  { time: '12 PM', temp: 74, icon: Sun, rain: '10%' },
  { time: '1 PM', temp: 75, icon: Sun, rain: '4%' },
  { time: '2 PM', temp: 75, icon: CloudSun, rain: '3%' },
  { time: '3 PM', temp: 74, icon: CloudSun, rain: '7%' },
  { time: '4 PM', temp: 72, icon: Cloud, rain: '12%' },
  { time: '5 PM', temp: 69, icon: Cloud, rain: '16%' },
]

const defaultLocations: LocationCoordinates[] = [
  { label: 'San Francisco, CA', latitude: 37.7749, longitude: -122.4194 },
  { label: 'Seattle, WA', latitude: 47.6062, longitude: -122.3321 },
  { label: 'Austin, TX', latitude: 30.2672, longitude: -97.7431 },
]

type SavedLocation = LocationCoordinates & { id: string; pinned: boolean }
type UserProfile = { name: string; initials: string }

function locationId(location: LocationCoordinates) {
  return `${location.latitude.toFixed(4)}:${location.longitude.toFixed(4)}`
}

function makeSavedLocation(location: LocationCoordinates, pinned = false): SavedLocation {
  return { ...location, id: locationId(location), pinned }
}

const defaultSavedLocations = defaultLocations.map((location) => makeSavedLocation(location))

function readStorage(key: string): unknown {
  if (typeof window === 'undefined') return null
  try {
    const value = window.localStorage.getItem(key)
    return value ? JSON.parse(value) : null
  } catch {
    return null
  }
}

function writeStorage(key: string, value: unknown) {
  if (typeof window === 'undefined') return
  try {
    window.localStorage.setItem(key, JSON.stringify(value))
  } catch {
    // Local storage can be unavailable in private browsing; the app still works in memory.
  }
}

function readStoredTheme(): ThemeName {
  const value = readStorage('weatherstudio:theme')
  return typeof value === 'string' && themes.some((item) => item.id === value) ? value as ThemeName : 'mono'
}

function readStoredUnit(): Unit {
  return readStorage('weatherstudio:unit') === 'C' ? 'C' : 'F'
}

function readStoredDecimalPreference() {
  return readStorage('weatherstudio:showDecimals') === true
}

function readStoredLocations(): SavedLocation[] {
  const value = readStorage('weatherstudio:savedLocations')
  if (!Array.isArray(value)) return defaultSavedLocations
  const valid = value.filter((item): item is Record<string, unknown> => {
    return Boolean(item && typeof item === 'object' && typeof item.label === 'string' && Number.isFinite(item.latitude) && Number.isFinite(item.longitude))
  })
  return valid.length ? valid.map((item) => makeSavedLocation({ label: item.label as string, latitude: item.latitude as number, longitude: item.longitude as number }, Boolean(item.pinned))) : defaultSavedLocations
}

function readStoredLocation(): LocationCoordinates {
  const value = readStorage('weatherstudio:selectedLocation')
  if (value && typeof value === 'object' && typeof (value as Record<string, unknown>).label === 'string' && Number.isFinite((value as Record<string, unknown>).latitude) && Number.isFinite((value as Record<string, unknown>).longitude)) {
    const item = value as Record<string, unknown>
    return { label: item.label as string, latitude: item.latitude as number, longitude: item.longitude as number }
  }
  return defaultLocations[0]
}

function readStoredLocationMode(): 'auto' | 'manual' {
  return readStorage('weatherstudio:locationMode') === 'manual' ? 'manual' : 'auto'
}

function initialsForName(name: string) {
  return name.split(/\s+/).filter(Boolean).slice(0, 2).map((part) => part[0]).join('').toUpperCase() || 'JD'
}

function readStoredProfile(): UserProfile {
  const value = readStorage('weatherstudio:profile')
  if (value && typeof value === 'object') {
    const item = value as Record<string, unknown>
    const name = typeof item.name === 'string' && item.name.trim() ? item.name.trim() : 'Jordan Davis'
    const initials = typeof item.initials === 'string' && item.initials.trim() ? item.initials.trim().slice(0, 3).toUpperCase() : initialsForName(name)
    return { name, initials }
  }
  return { name: 'Jordan Davis', initials: 'JD' }
}

function formatTemp(value: number, unit: Unit, showDecimals = false) {
  const converted = unit === 'F' ? value : (value - 32) * (5 / 9)
  return `${showDecimals ? converted.toFixed(1) : Math.round(converted)}°`
}

function formatDuration(milliseconds: number) {
  const minutes = Math.max(0, Math.round(milliseconds / 60000))
  return String(Math.floor(minutes / 60)) + 'h ' + String(minutes % 60) + 'm'
}

function getDaylightStats(sunrise: string, sunset: string, now: number) {
  const sunriseTime = Date.parse(sunrise)
  const sunsetTime = Date.parse(sunset)
  if (!Number.isFinite(sunriseTime) || !Number.isFinite(sunsetTime) || sunsetTime <= sunriseTime) {
    return { progress: 0, durationLabel: '—', remainingLabel: '—' }
  }
  const progress = Math.min(1, Math.max(0, (now - sunriseTime) / (sunsetTime - sunriseTime)))
  const remainingLabel = now < sunriseTime
    ? formatDuration(sunriseTime - now) + ' to sunrise'
    : now <= sunsetTime
      ? formatDuration(sunsetTime - now) + ' left'
      : 'Nighttime'
  return {
    progress,
    durationLabel: formatDuration(sunsetTime - sunriseTime),
    remainingLabel,
  }
}

function WeatherIcon({ icon: Icon, size = 24, className = '' }: { icon: WeatherIconComponent; size?: number; className?: string }) {
  const semanticClass = Icon === Sun
    ? 'icon-sun'
    : Icon === CloudRain || Icon === CloudDrizzle
      ? 'icon-rain'
      : Icon === CloudLightning
        ? 'icon-storm'
        : 'icon-cloud'
  return <Icon size={size} strokeWidth={1.7} className={`${semanticClass} ${className}`.trim()} />
}

function App() {
  const [theme, setTheme] = useState<ThemeName>(readStoredTheme)
  const [unit, setUnit] = useState<Unit>(readStoredUnit)
  const [showDecimals, setShowDecimals] = useState(readStoredDecimalPreference)
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [savedLocations, setSavedLocations] = useState<SavedLocation[]>(readStoredLocations)
  const [selectedLocation, setSelectedLocation] = useState<LocationCoordinates>(readStoredLocation)
  const [locationMode, setLocationMode] = useState<'auto' | 'manual'>(readStoredLocationMode)
  const [profile, setProfile] = useState<UserProfile>(readStoredProfile)
  const [profileEditorOpen, setProfileEditorOpen] = useState(false)
  const [profileDraft, setProfileDraft] = useState<UserProfile>(readStoredProfile)
  const [weather, setWeather] = useState<DashboardWeather | null>(null)
  const [weatherStatus, setWeatherStatus] = useState<'loading' | 'live' | 'demo'>('loading')
  const [now, setNow] = useState(() => Date.now())
  const [weatherError, setWeatherError] = useState('')
  const [search, setSearch] = useState('')
  const [searchError, setSearchError] = useState('')
  const [searching, setSearching] = useState(false)
  const [searchResults, setSearchResults] = useState<LocationCoordinates[]>([])
  const [locationError, setLocationError] = useState('')
  const [locating, setLocating] = useState(false)
  const [locationSource, setLocationSource] = useState<'precise' | 'approximate' | null>(null)
  const autoLocationAttempted = useRef(false)
  const [openPlaceMenuId, setOpenPlaceMenuId] = useState<string | null>(null)
  const searchInputRef = useRef<HTMLInputElement>(null)

  const orderedSavedLocations = useMemo(() => {
    return savedLocations.map((place, index) => ({ place, index })).sort((a, b) => Number(b.place.pinned) - Number(a.place.pinned) || a.index - b.index).map(({ place }) => place)
  }, [savedLocations])
  const isSaved = savedLocations.some((place) => place.id === locationId(selectedLocation))

  useEffect(() => writeStorage('weatherstudio:theme', theme), [theme])
  useEffect(() => writeStorage('weatherstudio:unit', unit), [unit])
  useEffect(() => writeStorage('weatherstudio:showDecimals', showDecimals), [showDecimals])
  useEffect(() => writeStorage('weatherstudio:savedLocations', savedLocations), [savedLocations])
  useEffect(() => writeStorage('weatherstudio:selectedLocation', selectedLocation), [selectedLocation])
  useEffect(() => writeStorage('weatherstudio:locationMode', locationMode), [locationMode])
  useEffect(() => writeStorage('weatherstudio:profile', profile), [profile])
  useEffect(() => {
    const interval = window.setInterval(() => setNow(Date.now()), 60000)
    return () => window.clearInterval(interval)
  }, [])

  useEffect(() => {
    let currentRequest = true
    setWeather(null)
    setWeatherStatus('loading')
    setWeatherError('')
    fetchWeather(selectedLocation)
      .then((data) => {
        if (!currentRequest) return
        setWeather(data)
        setWeatherStatus('live')
      })
      .catch((error: Error) => {
        if (!currentRequest) return
        setWeatherStatus('demo')
        setWeatherError(error.message)
      })
    return () => { currentRequest = false }
  }, [selectedLocation])

  useEffect(() => {
    const query = search.trim()
    if (query.length < 2) {
      setSearchResults([])
      setSearching(false)
      return
    }
    let active = true
    const timer = window.setTimeout(() => {
      setSearching(true)
      geocodeLocation(query)
        .then((matches) => {
          if (!active) return
          setSearchResults(matches)
          if (!matches.length) setSearchError("We could not find that location.")
        })
        .catch((error: Error) => {
          if (!active) return
          setSearchResults([])
          setSearchError(error.message || "We could not find that location.")
        })
        .finally(() => {
          if (active) setSearching(false)
        })
    }, 250)
    return () => {
      active = false
      window.clearTimeout(timer)
    }
  }, [search])

  const current = weather?.current
  const isWeatherLoading = weatherStatus === 'loading'
  const hourlyRows = isWeatherLoading ? [] : weather?.hourly.length ? weather.hourly : demoHourly
  const forecastRows = isWeatherLoading ? [] : weather?.forecast.length ? weather.forecast : demoForecast
  const today = forecastRows[0]
  const fallbackSunrise = new Date(now)
  fallbackSunrise.setHours(7, 24, 0, 0)
  const fallbackSunset = new Date(now)
  fallbackSunset.setHours(18, 18, 0, 0)
  const daylight = getDaylightStats(weather?.sunrise ?? fallbackSunrise.toISOString(), weather?.sunset ?? fallbackSunset.toISOString(), now)

  const submitSearch = () => {
    const query = search.trim()
    if (!query) return
    setSearchError('')
    if (searchResults.length) {
      chooseSearchResult(searchResults[0])
      return
    }
    if (!searching) setSearchError('Choose a location from the results.')
  }

  const handleSearch = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    void submitSearch()
  }

  const selectLocation = (place: LocationCoordinates) => {
    setLocationMode('manual')
    setLocationSource(null)
    setSelectedLocation(place)
    setOpenPlaceMenuId(null)
  }

  const chooseSearchResult = (place: LocationCoordinates) => {
    selectLocation(place)
    setSearch('')
    setSearchResults([])
    setSearchError('')
  }

  const toggleSaved = () => {
    const selectedId = locationId(selectedLocation)
    setSavedLocations((current) => current.some((place) => place.id === selectedId)
      ? current.filter((place) => place.id !== selectedId)
      : [...current, makeSavedLocation(selectedLocation)])
  }

  const addSelectedToSaved = () => {
    const selectedId = locationId(selectedLocation)
    setSavedLocations((current) => current.some((place) => place.id === selectedId)
      ? current
      : [...current, makeSavedLocation(selectedLocation)])
  }

  const togglePinned = (id: string) => {
    setSavedLocations((current) => current.map((place) => place.id === id ? { ...place, pinned: !place.pinned } : place))
    setOpenPlaceMenuId(null)
  }

  const removeSavedLocation = (id: string) => {
    setSavedLocations((current) => current.filter((place) => place.id !== id))
    setOpenPlaceMenuId(null)
  }

  const focusSearch = () => {
    searchInputRef.current?.focus()
  }

  const openProfileEditor = () => {
    setProfileDraft(profile)
    setProfileEditorOpen(true)
  }

  const saveProfile = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    const name = profileDraft.name.trim() || 'Jordan Davis'
    const initials = profileDraft.initials.trim().slice(0, 3).toUpperCase() || initialsForName(name)
    setProfile({ name, initials })
    setProfileEditorOpen(false)
  }

  const useApproximateLocation = async () => {
    try {
      const foundLocation = await getApproximateLocation()
      setSelectedLocation(foundLocation)
      setLocationSource('approximate')
      setLocationError('')
    } catch {
      setLocationError('Windows/browser location is unavailable. Allow Location access, then try again.')
    } finally {
      setLocating(false)
    }
  }

  const locateUser = () => {
    setLocationMode('auto')
    setLocationError('')
    setLocating(true)

    if (!navigator.geolocation) {
      void useApproximateLocation()
      return
    }

    navigator.geolocation.getCurrentPosition(async (position) => {
      const { latitude, longitude } = position.coords
      let foundLocation: LocationCoordinates = { label: 'Current location', latitude, longitude }
      try {
        foundLocation = await reverseGeocodeLocation(latitude, longitude)
      } catch {
        // Weather can still load from coordinates when reverse labeling is unavailable.
      }
      setSelectedLocation(foundLocation)
      setLocationSource('precise')
      setLocating(false)
    }, () => {
      void useApproximateLocation()
    }, { enableHighAccuracy: false, timeout: 6000, maximumAge: 300000 })
  }

  useEffect(() => {
    if (autoLocationAttempted.current || locationMode !== 'auto') return
    autoLocationAttempted.current = true
    locateUser()
  }, [])

  return (
    <div className={`app theme-${theme}`}>
      <aside className="sidebar">
        <div className="brand-row">
          <div className="brand-mark"><CloudSun size={20} /></div>
          <span className="brand-name">weather<span>studio</span></span>
        </div>

        <div className="sidebar-section-heading"><span>Saved places</span></div>
        <div className="saved-places">
          {orderedSavedLocations.map((place, index) => <div className={`place-item ${selectedLocation.label === place.label ? 'selected' : ''}`} key={place.id}>
            <button className="place-select" onClick={() => selectLocation(place)} aria-label={`Show weather for ${place.label}`}>
              <span className={`place-dot ${index % 3 === 1 ? 'blue-dot' : index % 3 === 2 ? 'orange-dot' : 'sun-dot'}`}><CloudSun size={13} /></span>
              <span><strong>{place.label.split(',')[0]}</strong><small>{place.pinned ? 'Pinned · ' : ''}{selectedLocation.label === place.label && weatherStatus === 'live' ? `${formatTemp(weather?.current.temperature ?? 72, unit, showDecimals)} now` : 'Live forecast'}</small></span>
            </button>
            <button className="place-menu-button" onClick={() => setOpenPlaceMenuId(openPlaceMenuId === place.id ? null : place.id)} aria-label={`Options for ${place.label}`} aria-expanded={openPlaceMenuId === place.id}><MoreHorizontal size={16} /></button>
            {openPlaceMenuId === place.id && <div className="place-menu" role="menu"><button role="menuitem" onClick={() => togglePinned(place.id)}>{place.pinned ? 'Unpin from top' : 'Pin to top'}</button><button role="menuitem" onClick={() => removeSavedLocation(place.id)}>Remove place</button></div>}
          </div>)}
          {!orderedSavedLocations.length && <div className="empty-places">No saved places yet.<button onClick={focusSearch}>Search for one</button></div>}
        </div>

        <div className="sidebar-bottom">
          <button className="nav-item" onClick={() => setSettingsOpen(true)}><Settings size={18} /><span>Settings</span></button>
          {profileEditorOpen && <form className="profile-editor" onSubmit={saveProfile}>
            <div className="profile-editor-heading"><strong>Edit profile</strong><button type="button" className="icon-button" onClick={() => setProfileEditorOpen(false)} aria-label="Close profile editor"><X size={15} /></button></div>
            <label>Display name<input value={profileDraft.name} onChange={(event) => setProfileDraft({ ...profileDraft, name: event.target.value })} autoFocus /></label>
            <label>Initials<input value={profileDraft.initials} maxLength={3} onChange={(event) => setProfileDraft({ ...profileDraft, initials: event.target.value.toUpperCase() })} /></label>
            <button className="profile-save" type="submit">Save profile</button>
          </form>}
          <button className="profile-row" onClick={openProfileEditor} aria-expanded={profileEditorOpen} aria-label="Edit profile">
            <div className="avatar">{profile.initials}</div><span><strong>{profile.name}</strong></span><MoreHorizontal size={17} />
          </button>
        </div>
      </aside>

      <main className="main-content">
        <header className="topbar">
          <div className="search-container">
            <form className="search-box" onSubmit={handleSearch}>
              <Search size={17} />
              <input ref={searchInputRef} value={search} onChange={(event) => { setSearch(event.target.value); setSearchError(""); setSearchResults([]) }} onKeyDown={(event) => { if (event.key === 'Enter') { event.preventDefault(); void submitSearch() } }} placeholder={searching ? 'Searching…' : 'Search city or ZIP code'} aria-label="Search city or ZIP code" />
              <kbd>⌘ K</kbd>
            </form>
            {searchResults.length > 0 && <div className="search-results" role="listbox" aria-label="Location search results">
              {searchResults.map((place, index) => {
                const [name, ...details] = place.label.split(",")
                const detail = details.join(",").trim() || "Location"
                return <button key={place.label + place.latitude + place.longitude} type="button" className="search-result" role="option" aria-selected={index === 0} aria-label={place.label} onClick={() => chooseSearchResult(place)}>
                  <span className="search-result-icon"><MapPin size={15} /></span>
                  <span><strong>{name.trim()}</strong><small>{detail}</small></span>
                </button>
              })}
            </div>}
          </div>
          <div className="topbar-actions">
            <button className={`icon-button location-button ${locating ? 'is-loading' : ''}`} onClick={locateUser} disabled={locating} aria-label={locating ? 'Finding current location' : 'Use current location'} title="Use Windows/browser location"><LocateFixed size={18} /></button>
          </div>
        </header>

        <div className="content-wrap">
          <div className="page-heading">
            <div>
              <h1>Sup, here's the weather</h1>
            </div>
            <div className="location-actions"><div className="location-control"><MapPin size={16} /><span>{selectedLocation.label}</span><ChevronDown size={16} /></div>{!isSaved && <button className="add-saved-button" onClick={addSelectedToSaved}><Plus size={14} />Add to saved</button>}</div>
          </div>

          {(weatherStatus === 'demo' || searchError || locationError || locationSource === 'approximate') && <div className="status-banner"><span><ShieldCheck size={15} />{locationError || searchError || (locationSource === 'approximate' ? 'Using an approximate location from your network.' : weatherError || 'Add a Google Weather demo key to load live conditions.')}</span>{locationError || locationSource === 'approximate' ? <span className="status-actions"><button className="status-action" onClick={locateUser}>Try again</button>{locationError && <a className="status-action" href="ms-settings:privacy-location">Windows settings</a>}</span> : <a href="https://developers.google.com/maps/documentation/weather/demo-key" target="_blank" rel="noreferrer">Get demo key <ChevronRight size={13} /></a>}</div>}
          {weather?.alerts.length ? <div className="alert-banner"><CloudLightning size={16} /><span><strong>{weather.alerts[0].title}</strong>{weather.alerts.length > 1 ? ` · ${weather.alerts.length} active alerts` : ''}</span></div> : null}

          <section className="hero-grid">
            <article className="current-card panel-glow">
              <div className="card-topline"><span>Current weather</span><button className={`save-button ${isSaved ? 'saved' : ''}`} onClick={toggleSaved} aria-label={isSaved ? 'Remove saved location' : 'Save location'}><Heart size={17} fill={isSaved ? 'currentColor' : 'none'} />{isSaved ? 'Saved' : 'Save place'}</button></div>
              {isWeatherLoading ? <div className="current-main current-loading"><div className="weather-illustration"><LoadingValue className="loading-weather-icon" /></div><div className="current-temp-wrap"><LoadingValue className="loading-temperature" /><LoadingValue className="loading-condition" /><div className="high-low"><LoadingValue className="loading-high-low" /><span className="muted-separator">/</span><LoadingValue className="loading-high-low loading-low" /></div></div></div> : <div className="current-main"><div className="weather-illustration">{(!current || current.icon === CloudSun) && <div className="sun-orb" />}<WeatherIcon icon={current?.icon ?? CloudSun} size={103} /></div><div className="current-temp-wrap"><div className="current-temp">{formatTemp(current?.temperature ?? 72, unit, showDecimals)}</div><div className="current-condition">{current?.condition ?? 'Partly cloudy'}</div><div className="high-low"><span>H {formatTemp(today?.high ?? 75, unit, showDecimals)}</span><span className="muted-separator">/</span><span className="low-temp">L {formatTemp(today?.low ?? 58, unit, showDecimals)}</span></div></div></div>}
              <div className={`comfort-row ${isWeatherLoading ? 'loading-comfort' : ''}`}><div><Thermometer size={16} /><span>Feels like <strong>{isWeatherLoading ? <LoadingValue className="loading-inline" /> : formatTemp(current?.feelsLike ?? 71, unit, showDecimals)}</strong></span></div><div><Umbrella size={16} /><span>Precipitation <strong>{isWeatherLoading ? <LoadingValue className="loading-inline" /> : `${current?.precipitationChance ?? 8}%`}</strong></span></div><div><Wind size={16} /><span>Wind <strong>{isWeatherLoading ? <LoadingValue className="loading-inline loading-wind" /> : `${current?.windDirection ?? 'WSW'} ${Math.round(current?.windSpeed ?? 9)} mph`}</strong></span></div></div>
            </article>

            <article className="air-card panel-glow">
              <div className="card-topline"><span>Air quality <em className="data-label">Preview</em></span><button className="more-button" aria-label="More air quality options"><MoreHorizontal size={18} /></button></div>
              {isWeatherLoading ? <div className="air-loading"><LoadingValue className="loading-air-score" /><LoadingValue className="loading-air-copy" /><LoadingValue className="loading-air-copy loading-air-copy-short" /></div> : <><div className="air-content"><div className="air-score">32</div><div><div className="air-status"><span className="status-dot" />Good</div><p>Air feels fresh today.<br />A great day to be outside.</p></div></div><div className="air-meter"><span /><span /><span /><span /><span /></div><div className="meter-labels"><span>Good</span><span>Moderate</span><span>Poor</span></div><div className="air-meta"><span>PM2.5 <strong>8.4</strong></span><span>O₃ <strong>22</strong></span><span>NO₂ <strong>11</strong></span></div></>}
            </article>
          </section>

          <section className="section-block hourly-section">
            <div className="section-heading"><div><span className="section-kicker">Today</span><h2>Hourly forecast</h2></div><button className="text-button">Next 24 hours <ChevronRight size={15} /></button></div>
            <div className="hourly-scroll">
              {isWeatherLoading ? Array.from({ length: 8 }, (_, index) => <div className="hour-card loading-hour-card" key={`loading-hour-${index}`}><LoadingValue className="loading-hour-time" /><LoadingValue className="loading-hour-icon" /><LoadingValue className="loading-hour-temp" /><LoadingValue className="loading-hour-rain" /></div>) : hourlyRows.map(({ time, temp, icon: Icon, rain }, index) => <div className={`hour-card ${index === 0 ? 'now' : ''}`} key={`${time}-${index}`}><span className="hour-time">{time}</span><WeatherIcon icon={Icon} size={25} /><strong>{formatTemp(temp, unit, showDecimals)}</strong><span className="hour-rain">{index === 0 ? 'Now' : rain}</span></div>)}
            </div>
          </section>

          <section className="lower-grid">
            <article className="panel forecast-panel">
              <div className="section-heading"><div><span className="section-kicker">This week</span><h2>7-day forecast</h2></div><button className="more-button" aria-label="More forecast options"><MoreHorizontal size={18} /></button></div>
              <div className="forecast-list">{isWeatherLoading ? Array.from({ length: 7 }, (_, index) => <div className="forecast-row loading-forecast-row" key={`loading-forecast-${index}`}><div className="day-name"><LoadingValue className="loading-forecast-day" /><LoadingValue className="loading-forecast-date" /></div><LoadingValue className="loading-forecast-icon" /><LoadingValue className="loading-forecast-condition" /><LoadingValue className="loading-forecast-rain" /><div className="temp-range"><LoadingValue className="loading-forecast-high" /><LoadingValue className="loading-forecast-bar" /><LoadingValue className="loading-forecast-low" /></div></div>) : forecastRows.map(({ day, date, icon: Icon, high, low, rain, condition }) => <div className={`forecast-row ${day === 'Today' ? 'today' : ''}`} key={`${day}-${date}`}><div className="day-name"><strong>{day}</strong><span>{date}</span></div><WeatherIcon icon={Icon} size={23} /><div className="forecast-condition">{condition}</div><div className="rain-chance"><Droplets size={14} />{rain}</div><div className="temp-range"><strong>{formatTemp(high, unit, showDecimals)}</strong><span><i style={{ width: `${Math.max(28, high - low) * 3}px` }} /></span><em>{formatTemp(low, unit, showDecimals)}</em></div></div>)}</div>
            </article>

            <div className="detail-stack">
              <article className="panel details-panel"><div className="section-heading compact"><div><span className="section-kicker">At a glance</span><h2>Details</h2></div><Gauge size={19} /></div><div className="detail-grid">{isWeatherLoading ? Array.from({ length: 6 }, (_, index) => <div className="metric loading-metric" key={`loading-metric-${index}`}><LoadingValue className="loading-metric-icon" /><div><LoadingValue className="loading-metric-label" /><LoadingValue className="loading-metric-value" /><LoadingValue className="loading-metric-sub" /></div></div>) : <><Metric icon={Wind} tone="wind" label="Wind" value={`${Math.round(current?.windSpeed ?? 9)} mph`} sub={current?.windDirection ?? 'WSW'} /><Metric icon={Droplets} tone="water" label="Humidity" value={`${Math.round(current?.humidity ?? 63)}%`} sub="Comfortable" /><Metric icon={EyeIcon} label="Visibility" value={`${Math.round(current?.visibility ?? 10)} mi`} sub="Clear view" /><Metric icon={Gauge} label="Pressure" value={(current?.pressure ?? 30.05).toFixed(2)} sub="inHg" /><Metric icon={Sun} tone="uv" label="UV index" value={`${Math.round(current?.uvIndex ?? 4)}`} sub="Moderate" /><Metric icon={AirVent} tone="wind" label="Dew point" value={formatTemp(current?.dewPoint ?? 59, unit, showDecimals)} sub="Comfortable" /></>}</div></article>
              <article className="panel sun-panel"><div className="section-heading compact"><div><span className="section-kicker">Daylight</span><h2>Sunrise & sunset</h2></div><Sun size={19} className="icon-sun" /></div><div className="sun-times"><div><Sunrise size={20} /><span>Sunrise<strong>{isWeatherLoading ? <LoadingValue className="loading-sun-time" /> : weather ? formatClock(weather.sunrise, weather.timeZone) : '7:24 AM'}</strong></span></div><div><Sunset size={20} /><span>Sunset<strong>{isWeatherLoading ? <LoadingValue className="loading-sun-time" /> : weather ? formatClock(weather.sunset, weather.timeZone) : '6:18 PM'}</strong></span></div></div><div className={`daylight-bar ${isWeatherLoading ? 'loading-daylight-bar' : ''}`}><span style={isWeatherLoading ? undefined : { width: String(daylight.progress * 100) + '%' }} /><i className="sun-position" style={isWeatherLoading ? undefined : { left: String(daylight.progress * 100) + '%' }} /></div><div className="daylight-caption">{isWeatherLoading ? <><LoadingValue className="loading-daylight-caption" /><LoadingValue className="loading-daylight-caption loading-daylight-caption-short" /></> : <><span>{daylight.durationLabel} of daylight</span><span>{daylight.remainingLabel}</span></>}</div></article>
            </div>
          </section>

          <footer className="footer"><span><ShieldCheck size={14} /> {weatherStatus === 'loading' ? 'Loading live weather…' : weatherStatus === 'live' ? 'Google Weather live · Air quality remains a preview' : 'Stubbed weather data · Add a Google demo key to go live'}</span></footer>
        </div>
      </main>

      {settingsOpen && <div className="settings-layer"><button className="settings-scrim" onClick={() => setSettingsOpen(false)} aria-label="Close settings" /><aside className="settings-drawer"><div className="drawer-header"><div><h2>Settings</h2></div><button className="icon-button" onClick={() => setSettingsOpen(false)} aria-label="Close settings"><X size={19} /></button></div><div className="drawer-content"><section className="settings-section"><div className="settings-title"><div className="settings-title-icon"><Moon size={17} /></div><div><strong>Appearance</strong><span>Choose the mood for your forecast.</span></div></div><div className="theme-grid">{themes.map((item) => <button key={item.id} className={`theme-option ${theme === item.id ? 'active' : ''}`} onClick={() => setTheme(item.id)}><div className="theme-swatches">{item.swatches.map((swatch) => <i key={swatch} style={{ background: swatch }} />)}</div><strong>{item.label}</strong><span>{item.note}</span>{theme === item.id && <span className="theme-check">✓</span>}</button>)}</div></section><section className="settings-section"><div className="settings-title"><div className="settings-title-icon"><Globe2 size={17} /></div><div><strong>Units</strong><span>Set your preferred measurements.</span></div></div><div className="segmented"><button className={unit === 'F' ? 'active' : ''} onClick={() => setUnit('F')}>°F <span>Fahrenheit</span></button><button className={unit === 'C' ? 'active' : ''} onClick={() => setUnit('C')}>°C <span>Celsius</span></button></div><div className="precision-control"><span>Precision</span><button className={`toggle ${showDecimals ? 'enabled' : ''}`} onClick={() => setShowDecimals(!showDecimals)} role="switch" aria-checked={showDecimals} aria-label="Precision"><i /></button></div></section><section className="settings-section about-settings"><div className="settings-title"><div className="settings-title-icon"><UserRound size={17} /></div><div><strong>About Weather Studio</strong><span>Version 0.1 · Desktop preview</span></div></div></section></div><div className="drawer-footer"><button className="secondary-button" onClick={() => setSettingsOpen(false)}>Done</button></div></aside></div>}
    </div>
  )
}

function Metric({ icon: Icon, label, value, sub, tone = 'neutral' }: { icon: ComponentType<{ size?: number }>; label: string; value: string; sub: string; tone?: 'neutral' | 'wind' | 'water' | 'uv' }) {
  return <div className={`metric metric-${tone}`}><Icon size={17} /><div><span>{label}</span><strong>{value}</strong><small>{sub}</small></div></div>
}

function LoadingValue({ className = '' }: { className?: string }) {
  return <span className={`loading-value ${className}`.trim()} aria-hidden="true" />
}

function EyeIcon({ size = 17 }: { size?: number }) {
  return <span className="eye-icon" style={{ width: size, height: size }} />
}

export default App
