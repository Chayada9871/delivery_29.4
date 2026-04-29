import { NextResponse } from "next/server";
import { calculateDistanceKm } from "@/lib/maps";

const ROUTING_PROVIDER_URL = process.env.ROUTE_DISTANCE_PROVIDER_URL || "https://router.project-osrm.org";

function normalizePoint(point = {}) {
  const lat = Number(point.lat);
  const lng = Number(point.lng);
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
  return { lat, lng };
}

function buildFallbackPayload(origin, destination) {
  return {
    distanceKm: calculateDistanceKm(origin.lat, origin.lng, destination.lat, destination.lng),
    durationMinutes: null,
    source: "air",
  };
}

export async function POST(request) {
  try {
    const payload = await request.json();
    const origin = normalizePoint(payload?.origin || payload?.from);
    const destination = normalizePoint(payload?.destination || payload?.to);

    if (!origin || !destination) {
      return NextResponse.json(
        { message: "origin and destination coordinates are required" },
        { status: 400 }
      );
    }

    const fallbackPayload = buildFallbackPayload(origin, destination);
    const routeUrl = `${ROUTING_PROVIDER_URL.replace(/\/$/, "")}/route/v1/driving/${origin.lng},${origin.lat};${destination.lng},${destination.lat}?overview=false&alternatives=false&steps=false`;

    try {
      const response = await fetch(routeUrl, {
        cache: "no-store",
        headers: {
          Accept: "application/json",
        },
      });

      if (!response.ok) {
        return NextResponse.json(fallbackPayload);
      }

      const routePayload = await response.json();
      const distanceMeters = Number(routePayload?.routes?.[0]?.distance);
      const durationSeconds = Number(routePayload?.routes?.[0]?.duration);

      if (!Number.isFinite(distanceMeters) || distanceMeters <= 0) {
        return NextResponse.json(fallbackPayload);
      }

      return NextResponse.json({
        distanceKm: distanceMeters / 1000,
        durationMinutes: Number.isFinite(durationSeconds) ? durationSeconds / 60 : null,
        source: "road",
      });
    } catch {
      return NextResponse.json(fallbackPayload);
    }
  } catch {
    return NextResponse.json({ message: "invalid request payload" }, { status: 400 });
  }
}
