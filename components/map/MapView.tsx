"use client";

import { ACCENT } from "@/lib/activity";
import type { Activity, GeneratedRoute } from "@/lib/generators/types";
import {
  Map as MapLibreMap,
  Marker,
  setWorkerUrl,
  type GeoJSONSource,
  type MapMouseEvent,
} from "maplibre-gl";
import { useEffect, useRef } from "react";
import "maplibre-gl/dist/maplibre-gl.css";

if (typeof window !== "undefined") {
  setWorkerUrl("/maplibre/maplibre-gl-worker.mjs");
}

const STYLE =
  process.env.NEXT_PUBLIC_MAP_STYLE_URL ??
  "https://tiles.openfreemap.org/styles/liberty";

const FALLBACK_CENTER: [number, number] = [10.7522, 59.9139];

export type MapViewProps = {
  start: { lat: number; lng: number } | null;
  route: GeneratedRoute | null;
  activity: Activity;
  paddingBottom: number;
  loading: boolean;
  onPickStart: (lat: number, lng: number) => void;
};

function reducedMotion(): boolean {
  return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

function emptyLine(color: string): GeoJSON.Feature {
  return {
    type: "Feature",
    geometry: { type: "LineString", coordinates: [] },
    properties: { color },
  };
}

export default function MapView({
  start,
  route,
  activity,
  paddingBottom,
  loading,
  onPickStart,
}: MapViewProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<MapLibreMap | null>(null);
  const markerRef = useRef<Marker | null>(null);
  const onPickRef = useRef(onPickStart);
  const startRef = useRef(start);
  const routeRef = useRef(route);
  const activityRef = useRef(activity);
  const padRef = useRef(paddingBottom);
  const loadingRef = useRef(loading);

  onPickRef.current = onPickStart;
  startRef.current = start;
  routeRef.current = route;
  activityRef.current = activity;
  padRef.current = paddingBottom;
  loadingRef.current = loading;

  useEffect(() => {
    if (!containerRef.current || mapRef.current) return;

    const map = new MapLibreMap({
      container: containerRef.current,
      style: STYLE,
      center: start
        ? [start.lng, start.lat]
        : FALLBACK_CENTER,
      zoom: start ? 13 : 2.4,
      attributionControl: { compact: true },
      maplibreLogo: false,
      dragRotate: false,
      pitchWithRotate: false,
      maxPitch: 0,
      cooperativeGestures: false,
    });
    map.touchZoomRotate.disableRotation();
    map.keyboard.disableRotation();

    map.on("click", (e: MapMouseEvent) => {
      onPickRef.current(e.lngLat.lat, e.lngLat.lng);
    });

    const onReady = () => {
      try {
        map.setProjection({ type: "mercator" });
      } catch {
        // style may already be mercator
      }
      if (!map.getSource("route")) {
        map.addSource("route", {
          type: "geojson",
          data: emptyLine(ACCENT[activityRef.current]),
        });
        map.addLayer({
          id: "route-casing",
          type: "line",
          source: "route",
          layout: { "line-join": "round", "line-cap": "round" },
          paint: {
            "line-color": "#ffffff",
            "line-width": 9,
            "line-opacity": 0.9,
          },
        });
        map.addLayer({
          id: "route-line",
          type: "line",
          source: "route",
          layout: { "line-join": "round", "line-cap": "round" },
          paint: {
            "line-color": ACCENT[activityRef.current],
            "line-width": 5,
            "line-opacity": 0.95,
          },
        });
      }
      syncRoute(map);
      syncMarker(map);
    };

    if (map.isStyleLoaded()) onReady();
    else map.on("load", onReady);

    mapRef.current = map;
    return () => {
      markerRef.current?.remove();
      markerRef.current = null;
      map.remove();
      mapRef.current = null;
    };
    // init once
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function syncMarker(map: MapLibreMap) {
    const s = startRef.current;
    if (!s) {
      markerRef.current?.remove();
      markerRef.current = null;
      return;
    }
    const className = loadingRef.current ? "start-pin is-loading" : "start-pin";
    if (markerRef.current) {
      markerRef.current.setLngLat([s.lng, s.lat]);
      markerRef.current.getElement().className = className;
    } else {
      const el = document.createElement("div");
      el.className = className;
      markerRef.current = new Marker({ element: el, anchor: "center" })
        .setLngLat([s.lng, s.lat])
        .addTo(map);
    }
  }

  function syncRoute(map: MapLibreMap) {
    const src = map.getSource("route") as GeoJSONSource | undefined;
    if (!src) return;
    const color = ACCENT[activityRef.current];
    if (map.getLayer("route-line")) {
      map.setPaintProperty("route-line", "line-color", color);
      map.setPaintProperty(
        "route-line",
        "line-opacity",
        loadingRef.current && routeRef.current ? 0.4 : 0.95,
      );
    }
    const r = routeRef.current;
    if (!r) {
      src.setData(emptyLine(color));
      return;
    }
    src.setData({
      type: "Feature",
      geometry: {
        type: "LineString",
        coordinates: r.geometry.coordinates.map(([lon, lat]) => [lon, lat]),
      },
      properties: { color },
    });
  }

  function fitOrFly(map: MapLibreMap) {
    const box = map.getContainer().getBoundingClientRect();
    const bottom = Math.min(
      Math.max(padRef.current, 120) + 16,
      Math.max(96, box.height - 200),
    );
    const pad = {
      top: 72,
      left: 28,
      right: 28,
      bottom,
    };
    const duration = reducedMotion() ? 0 : 850;
    const r = routeRef.current;
    if (r) {
      const [minLon, minLat, maxLon, maxLat] = r.bbox;
      const bounds: [[number, number], [number, number]] = [
        [minLon, minLat],
        [maxLon, maxLat],
      ];
      try {
        const camera = map.cameraForBounds(bounds, {
          padding: pad,
          maxZoom: 15,
        });
        if (camera) {
          map.easeTo({ ...camera, duration });
          return;
        }
      } catch {
        // fall through
      }
      map.easeTo({
        center: [(minLon + maxLon) / 2, (minLat + maxLat) / 2],
        zoom: 13,
        duration,
      });
      return;
    }
    const s = startRef.current;
    if (s) {
      map.easeTo({
        center: [s.lng, s.lat],
        zoom: 14,
        duration,
        padding: pad,
      });
    }
  }

  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    const apply = () => {
      syncMarker(map);
      syncRoute(map);
    };
    if (map.isStyleLoaded()) apply();
    else map.once("load", apply);
  }, [start, route, activity, loading]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    const apply = () => {
      fitOrFly(map);
      map.resize();
    };
    if (map.isStyleLoaded()) apply();
    else map.once("load", apply);
  }, [start, route, paddingBottom]);

  return (
    <div
      ref={containerRef}
      className="map-canvas"
      role="application"
      aria-label="Route map"
    />
  );
}
