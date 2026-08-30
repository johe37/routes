"use client";

import { GenerateSheet } from "@/components/generate/GenerateSheet";
import { MapCanvas } from "@/components/map/MapCanvas";
import { ACTIVITY_DEFAULTS } from "@/lib/activity";
import type { Units } from "@/lib/format";
import { formatDistance } from "@/lib/format";
import type { Activity, GeneratedRoute, RouteShape } from "@/lib/generators/types";
import { estimateDurationSeconds } from "@/lib/pace";
import { loadPrefs, savePrefs } from "@/lib/prefs";
import { LocateFixed, Loader2 } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";

type Start = { lat: number; lng: number };

export function AppShell() {
  const [activity, setActivity] = useState<Activity>("run");
  const [shape, setShape] = useState<RouteShape>("loop");
  const [targetMeters, setTargetMeters] = useState(
    ACTIVITY_DEFAULTS.run.defaultMeters,
  );
  const [units, setUnits] = useState<Units>("km");
  const [start, setStart] = useState<Start | null>(null);
  const [route, setRoute] = useState<GeneratedRoute | null>(null);
  const [mode, setMode] = useState<"compose" | "summary">("compose");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [gps, setGps] = useState<"idle" | "pending" | "denied">("idle");
  const [hydrated, setHydrated] = useState(false);
  const [showHint, setShowHint] = useState(true);
  const [pad, setPad] = useState(320);
  const [live, setLive] = useState("");
  const sheetRef = useRef<HTMLElement | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  useEffect(() => {
    /* eslint-disable react-hooks/set-state-in-effect -- localStorage hydrate after mount */
    const prefs = loadPrefs();
    if (prefs) {
      setActivity(prefs.activity);
      setShape(prefs.shape);
      setTargetMeters(prefs.targetMeters);
      setUnits(prefs.units);
      if (prefs.lastStart) setStart(prefs.lastStart);
    }
    setHydrated(true);
    /* eslint-enable react-hooks/set-state-in-effect */
  }, []);

  useEffect(() => {
    if (!hydrated) return;
    savePrefs({
      v: 1,
      activity,
      shape,
      targetMeters,
      units,
      lastStart: start ?? undefined,
    });
    document.documentElement.dataset.activity = activity;
  }, [hydrated, activity, shape, targetMeters, units, start]);

  useEffect(() => {
    const el = sheetRef.current;
    if (!el || typeof ResizeObserver === "undefined") return;
    const ro = new ResizeObserver(() => {
      setPad(Math.round(el.getBoundingClientRect().height));
    });
    ro.observe(el);
    setPad(Math.round(el.getBoundingClientRect().height));
    return () => ro.disconnect();
  }, [mode, error, route]);

  const pickStart = useCallback((lat: number, lng: number) => {
    setStart({ lat, lng });
    setShowHint(false);
    setError(null);
  }, []);

  function onActivity(next: Activity) {
    setActivity(next);
    const chips = ACTIVITY_DEFAULTS[next].chipsMeters as readonly number[];
    if (!chips.includes(targetMeters)) {
      setTargetMeters(ACTIVITY_DEFAULTS[next].defaultMeters);
    }
  }

  function requestGps() {
    if (!navigator.geolocation) {
      setGps("denied");
      setError("Location isn't available in this browser. Tap the map instead.");
      return;
    }
    setGps("pending");
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setStart({ lat: pos.coords.latitude, lng: pos.coords.longitude });
        setGps("idle");
        setError(null);
      },
      (err) => {
        setGps("denied");
        if (err.code === err.PERMISSION_DENIED) {
          setError("Location permission denied — tap the map instead.");
        } else {
          setError("Couldn't get your location. Tap the map instead.");
        }
      },
      { enableHighAccuracy: false, timeout: 10_000, maximumAge: 30_000 },
    );
  }

  async function generate() {
    if (!start) return;
    abortRef.current?.abort();
    const ac = new AbortController();
    abortRef.current = ac;
    const timer = setTimeout(() => ac.abort(), 15_000);
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        signal: ac.signal,
        body: JSON.stringify({
          start: { lat: start.lat, lng: start.lng },
          activity,
          shape,
          targetMeters,
          seed: Math.floor(Math.random() * 1_000_000_000),
        }),
      });
      const data = (await res.json()) as {
        route?: GeneratedRoute;
        error?: { message?: string };
      };
      if (!res.ok || !data.route) {
        setError(data.error?.message ?? "Couldn't generate a route.");
        return;
      }
      setRoute(data.route);
      setMode("summary");
      const km = formatDistance(data.route.distanceMeters, units);
      const mins = Math.round(
        estimateDurationSeconds(data.route.distanceMeters, activity) / 60,
      );
      setLive(`Route, ${km}, about ${mins} minutes.`);
    } catch (err) {
      if ((err as Error).name === "AbortError") {
        setError("That took too long. Try again, or move the pin.");
      } else {
        setError("Couldn't reach the routing service. Retry.");
      }
    } finally {
      clearTimeout(timer);
      setLoading(false);
    }
  }

  function onNew() {
    setRoute(null);
    setMode("compose");
    setError(null);
    setLive("Route cleared.");
  }

  return (
    <div className="app-root" data-activity={activity}>
      <MapCanvas
        start={start}
        route={route}
        activity={activity}
        paddingBottom={pad}
        loading={loading}
        onPickStart={pickStart}
      />

      <button
        type="button"
        className="gps-btn"
        onClick={requestGps}
        aria-label="Use my location"
        disabled={gps === "pending"}
      >
        {gps === "pending" ? (
          <Loader2 size={20} className="spin" />
        ) : (
          <LocateFixed size={20} />
        )}
      </button>

      {!start && showHint ? (
        <div className="empty-card">
          <p className="empty-kicker">Ready when you are</p>
          <h1>Where from?</h1>
          <p>Use your location, or tap the map to drop a start pin.</p>
          <button type="button" className="generate-btn" onClick={requestGps}>
            Use my location
          </button>
          <button
            type="button"
            className="ghost-btn ghost-wide"
            onClick={() => setShowHint(false)}
          >
            I&apos;ll tap the map
          </button>
        </div>
      ) : null}

      <GenerateSheet
        sheetRef={sheetRef}
        mode={mode}
        activity={activity}
        shape={shape}
        targetMeters={targetMeters}
        units={units}
        canGenerate={Boolean(start)}
        loading={loading}
        error={error}
        route={route}
        onActivity={onActivity}
        onShape={setShape}
        onTargetMeters={setTargetMeters}
        onUnits={setUnits}
        onGenerate={generate}
        onRegenerate={generate}
        onNew={onNew}
        onEdit={() => setMode("compose")}
      />

      <div className="sr-only" aria-live="polite">
        {live}
      </div>
    </div>
  );
}
