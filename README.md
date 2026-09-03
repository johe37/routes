# Routes

A simple, phone-first web app that generates a **run** or **bike** route of a target distance.

Drop a start pin (GPS or tap the map), pick an activity and distance, generate a loop. No accounts.

## Run it

```bash
npm install
cp .env.example .env.local
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

This app plans the route (distance, loop vs out-and-back, start pin). An external router traces it onto real streets. **No API key is required.** By default that router is public OpenStreetMap routing (FOSSGIS OSRM).

`ORS_API_KEY` is optional. If you set it, loops are generated with [OpenRouteService](https://openrouteservice.org) round-trip instead of OSRM, which is usually rounder and has fewer dead-end stubs. Out-and-back still works either way.

Get a free key from [openrouteservice.org](https://openrouteservice.org) (sign in at [account.heigit.org](https://account.heigit.org)), then put it in `.env.local`:

```
ORS_API_KEY=your_key_here
```

The key is read only on the server. The browser never sees it; it only calls `/api/generate`.

## Docker

```bash
docker build -t johe37/routes .
docker run --rm -p 3000:3000 -e ORS_API_KEY=your_key_here johe37/routes
```

`ORS_API_KEY` is optional and read when the container starts, not baked into the image. Without it, OSRM is used.

GitHub Actions builds the image on every push and pull request. Pushing a git tag builds and publishes `johe37/routes:<tag>` and `:latest` to Docker Hub. Add a `DOCKERHUB_TOKEN` repository secret (a Docker Hub access token for `johe37`).

## Stack

- Next.js App Router
- MapLibre + OpenFreeMap
- OSM routing (FOSSGIS OSRM) by default; OpenRouteService if a key is set
