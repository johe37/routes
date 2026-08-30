"use client";

import dynamic from "next/dynamic";
import type { MapViewProps } from "@/components/map/MapView";

const MapView = dynamic(() => import("@/components/map/MapView"), {
  ssr: false,
  loading: () => <div className="map-canvas map-skeleton" aria-hidden />,
});

export function MapCanvas(props: MapViewProps) {
  return <MapView {...props} />;
}
