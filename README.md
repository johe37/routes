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

Generate follows real streets (foot or bike) using OpenStreetMap routing. No API key is required.

An optional OpenRouteService key improves loop quality (round-trip). Put it in `.env.local` if you have one:

```
ORS_API_KEY=your_key_here
```

The key stays on the server. The browser only talks to `/api/generate`.

## Docker

```bash
docker build -t johe37/routes .
docker run --rm -p 3000:3000 -e ORS_API_KEY=your_key_here johe37/routes
```

`ORS_API_KEY` is optional and read at runtime.

GitHub Actions builds the image on every push and pull request. Pushing a git tag builds and publishes `johe37/routes:<tag>` and `:latest` to Docker Hub. Add a `DOCKERHUB_TOKEN` repository secret (a Docker Hub access token for `johe37`).

## Stack

- Next.js App Router
- MapLibre + OpenFreeMap
- OSM routing (FOSSGIS OSRM) by default; OpenRouteService if a key is set
