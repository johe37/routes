"use client";

import { ACTIVITY_DEFAULTS } from "@/lib/activity";
import {
  displayToMeters,
  formatChip,
  formatDistance,
  formatDuration,
  metersToDisplay,
  type Units,
} from "@/lib/format";
import type { Activity, GeneratedRoute, RouteShape } from "@/lib/generators/types";
import { estimateDurationSeconds } from "@/lib/pace";
import { Bike, Footprints, Loader2, RotateCcw } from "lucide-react";
import type { ReactNode, RefObject } from "react";

type SheetMode = "compose" | "summary";

type Props = {
  sheetRef: RefObject<HTMLElement | null>;
  mode: SheetMode;
  activity: Activity;
  shape: RouteShape;
  targetMeters: number;
  units: Units;
  canGenerate: boolean;
  loading: boolean;
  error: string | null;
  route: GeneratedRoute | null;
  onActivity: (activity: Activity) => void;
  onShape: (shape: RouteShape) => void;
  onTargetMeters: (meters: number) => void;
  onUnits: (units: Units) => void;
  onGenerate: () => void;
  onRegenerate: () => void;
  onNew: () => void;
  onEdit: () => void;
};

function Segmented<T extends string>({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: T;
  options: { value: T; label: string; icon?: ReactNode }[];
  onChange: (v: T) => void;
}) {
  return (
    <div role="radiogroup" aria-label={label} className="seg">
      {options.map((opt) => {
        const selected = opt.value === value;
        return (
          <button
            key={opt.value}
            type="button"
            role="radio"
            aria-checked={selected}
            className={selected ? "seg-btn is-on" : "seg-btn"}
            onClick={() => onChange(opt.value)}
          >
            {opt.icon}
            {opt.label}
          </button>
        );
      })}
    </div>
  );
}

export function GenerateSheet({
  sheetRef,
  mode,
  activity,
  shape,
  targetMeters,
  units,
  canGenerate,
  loading,
  error,
  route,
  onActivity,
  onShape,
  onTargetMeters,
  onUnits,
  onGenerate,
  onRegenerate,
  onNew,
  onEdit,
}: Props) {
  const limits = ACTIVITY_DEFAULTS[activity];
  const displayValue = Number(metersToDisplay(targetMeters, units).toFixed(2));
  const minDisplay = metersToDisplay(limits.minMeters, units);
  const maxDisplay = metersToDisplay(limits.maxMeters, units);

  return (
    <section ref={sheetRef} className="sheet" data-mode={mode} aria-label="Route controls">
      <button
        type="button"
        className="sheet-handle"
        aria-label={mode === "summary" ? "Edit route" : "Collapse"}
        onClick={() => {
          if (mode === "summary") onEdit();
        }}
      />

      {mode === "summary" && route ? (
        <Summary
          route={route}
          targetMeters={targetMeters}
          units={units}
          loading={loading}
          error={error}
          onRegenerate={onRegenerate}
          onNew={onNew}
          onEdit={onEdit}
        />
      ) : (
        <div className="sheet-body">
          <div className="sheet-kicker">
            <span className="wordmark">Loop</span>
            <span className="muted">Distance routes</span>
          </div>

          <Segmented
            label="Activity"
            value={activity}
            onChange={onActivity}
            options={[
              {
                value: "run" as const,
                label: "Run",
                icon: <Footprints size={16} strokeWidth={2.2} aria-hidden />,
              },
              {
                value: "bike" as const,
                label: "Bike",
                icon: <Bike size={16} strokeWidth={2.2} aria-hidden />,
              },
            ]}
          />

          <div className="distance-block">
            <div className="distance-head">
              <span className="field-label">Distance</span>
              <div role="radiogroup" aria-label="Units" className="units">
                {(["km", "mi"] as const).map((u) => (
                  <button
                    key={u}
                    type="button"
                    role="radio"
                    aria-checked={units === u}
                    className={units === u ? "unit is-on" : "unit"}
                    onClick={() => onUnits(u)}
                  >
                    {u}
                  </button>
                ))}
              </div>
            </div>
            <div className="chips">
              {limits.chipsMeters.map((m) => {
                const on = Math.abs(m - targetMeters) < 1;
                return (
                  <button
                    key={m}
                    type="button"
                    className={on ? "chip is-on" : "chip"}
                    onClick={() => onTargetMeters(m)}
                  >
                    {formatChip(m, units)}
                  </button>
                );
              })}
            </div>
            <label className="custom-distance">
              <span className="sr-only">Custom distance in {units}</span>
              <input
                type="number"
                inputMode="decimal"
                min={Number(minDisplay.toFixed(1))}
                max={Number(maxDisplay.toFixed(0))}
                step={units === "mi" ? 0.5 : 0.5}
                value={displayValue}
                onChange={(e) => {
                  const n = Number(e.target.value);
                  if (!Number.isFinite(n) || n <= 0) return;
                  const meters = displayToMeters(n, units);
                  const clamped = Math.min(
                    limits.maxMeters,
                    Math.max(limits.minMeters, meters),
                  );
                  onTargetMeters(clamped);
                }}
              />
              <span className="custom-suffix">{units}</span>
            </label>
          </div>

          <Segmented
            label="Shape"
            value={shape}
            onChange={onShape}
            options={[
              { value: "loop" as const, label: "Loop" },
              { value: "out_and_back" as const, label: "Out & back" },
            ]}
          />

          {error ? <p className="error-msg">{error}</p> : null}

          <button
            type="button"
            className="generate-btn"
            disabled={!canGenerate || loading}
            onClick={onGenerate}
          >
            {loading ? (
              <>
                <Loader2 size={18} className="spin" aria-hidden />
                Finding a route…
              </>
            ) : (
              "Generate route"
            )}
          </button>
          {!canGenerate ? (
            <p className="hint">Tap the map or use your location first.</p>
          ) : null}
        </div>
      )}
    </section>
  );
}

function Summary({
  route,
  targetMeters,
  units,
  loading,
  error,
  onRegenerate,
  onNew,
  onEdit,
}: {
  route: GeneratedRoute;
  targetMeters: number;
  units: Units;
  loading: boolean;
  error: string | null;
  onRegenerate: () => void;
  onNew: () => void;
  onEdit: () => void;
}) {
  const duration = estimateDurationSeconds(route.distanceMeters, route.activity);
  const drift = Math.round((route.distanceMeters / targetMeters - 1) * 100);
  const showDrift = Math.abs(drift) >= 5;
  const shapeLabel = route.shape === "loop" ? "Loop" : "Out & back";
  const activityLabel = route.activity === "run" ? "Run" : "Bike";

  return (
    <div className="sheet-body summary">
      <div className="summary-top">
        <p className="hero-distance tabular">{formatDistance(route.distanceMeters, units)}</p>
        <button type="button" className="text-btn" onClick={onEdit}>
          Edit
        </button>
      </div>
      <p className="summary-meta">
        {formatDuration(duration)}
        <span aria-hidden> · </span>
        {shapeLabel}
        <span aria-hidden> · </span>
        {activityLabel}
        {showDrift ? (
          <>
            <span aria-hidden> · </span>
            {drift > 0 ? "+" : ""}
            {drift}% vs {formatDistance(targetMeters, units)}
          </>
        ) : null}
      </p>
      {route.distanceSoftMiss || route.warnings[0] ? (
        <p className="soft-miss">{route.warnings[0] ?? "Closest route we found."}</p>
      ) : null}
      {error ? <p className="error-msg">{error}</p> : null}
      <div className="summary-actions">
        <button
          type="button"
          className="generate-btn"
          disabled={loading}
          onClick={onRegenerate}
        >
          {loading ? (
            <>
              <Loader2 size={18} className="spin" aria-hidden />
              Finding another…
            </>
          ) : (
            <>
              <RotateCcw size={16} aria-hidden />
              Regenerate
            </>
          )}
        </button>
        <button type="button" className="ghost-btn" onClick={onNew} disabled={loading}>
          New
        </button>
      </div>
    </div>
  );
}
