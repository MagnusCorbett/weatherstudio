# Weather Studio

Weather Studio is a desktop-first weather dashboard with stubbed data and an optional live Google Weather API connection.

## Run it

```powershell
npm install
Copy-Item .env.example .env.local
# Edit .env.local and replace the placeholder with your Google Weather demo key.
npm run dev
```

Open <http://localhost:5173>.

The app stays usable with the built-in demo data when `.env.local` is missing, the key is invalid, or the demo quota is paused. The server keeps the key off the browser and caches each location for 10 minutes. City search uses a separate no-key geocoding service so it does not require Google Cloud billing.

Get the no-cost prototyping key from the [Google Weather demo key guide](https://developers.google.com/maps/documentation/weather/demo-key).

Air quality is deliberately marked as a preview because the Google Weather demo key does not provide the separate Air Quality API data.
