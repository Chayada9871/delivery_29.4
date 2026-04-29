import { APP_CONFIG } from "@/lib/config";

const routeDistanceCache = new Map();

export function parseGoogleMapsCoordinates(value) {
  const url = String(value || "").trim();
  if (!url) return null;

  const source = `${url} ${safeDecodeURIComponent(url)}`;
  const exactCandidates = [
    ...extractCoordinateMatches(source, /!3d(-?\d+(?:\.\d+)?)!4d(-?\d+(?:\.\d+)?)/g, ([, lat, lng]) => ({
      lat,
      lng,
    })),
    ...extractCoordinateMatches(source, /!1d(-?\d+(?:\.\d+)?)!2d(-?\d+(?:\.\d+)?)/g, ([, lng, lat]) => ({
      lat,
      lng,
    })),
    ...extractCoordinateMatches(source, /!2d(-?\d+(?:\.\d+)?)!3d(-?\d+(?:\.\d+)?)/g, ([, lng, lat]) => ({
      lat,
      lng,
    })),
    ...extractCoordinateMatches(source, /destination=(-?\d+(?:\.\d+)?),(-?\d+(?:\.\d+)?)/g, ([, lat, lng]) => ({
      lat,
      lng,
    })),
    ...extractCoordinateMatches(source, /query=(-?\d+(?:\.\d+)?),(-?\d+(?:\.\d+)?)/g, ([, lat, lng]) => ({
      lat,
      lng,
    })),
    ...extractCoordinateMatches(source, /[?&](?:q|ll)=(-?\d+(?:\.\d+)?),(-?\d+(?:\.\d+)?)/g, ([, lat, lng]) => ({
      lat,
      lng,
    })),
  ];

  if (exactCandidates.length) {
    return exactCandidates[exactCandidates.length - 1];
  }

  const viewportMatch = source.match(/@(-?\d+(?:\.\d+)?),(-?\d+(?:\.\d+)?)/);
  return viewportMatch ? buildCoordinate(viewportMatch[1], viewportMatch[2]) : null;
}

function extractCoordinateMatches(source, pattern, mapper) {
  const matches = [];

  for (const match of source.matchAll(pattern)) {
    const point = mapper(match);
    const coordinate = buildCoordinate(point?.lat, point?.lng);
    if (coordinate) matches.push(coordinate);
  }

  return matches;
}

function buildCoordinate(latValue, lngValue) {
  const lat = Number(latValue);
  const lng = Number(lngValue);
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
  return { lat, lng };
}

export function isGoogleMapsShortLink(value) {
  try {
    const url = new URL(String(value || "").trim());
    return /(^|\.)maps\.app\.goo\.gl$/i.test(url.hostname);
  } catch {
    return false;
  }
}

export function isGoogleMapsUrl(value) {
  const source = String(value || "").trim();
  if (!source) return false;

  try {
    const url = new URL(source);
    return (
      /(^|\.)google\.[a-z.]+$/i.test(url.hostname) ||
      /(^|\.)googleusercontent\.com$/i.test(url.hostname) ||
      /(^|\.)maps\.app\.goo\.gl$/i.test(url.hostname) ||
      /(^|\.)goo\.gl$/i.test(url.hostname)
    );
  } catch {
    return false;
  }
}

export function validateMapsUrl(value) {
  const mapsUrl = String(value || "").trim();
  if (!mapsUrl) {
    return {
      level: "warning",
      code: "missing_maps_url",
      message: "ยังไม่มีลิงก์ Google Maps ทีมจัดส่งยังวางแผนได้แบบแมนนวล แต่การจัดเส้นทางจะจำกัด",
    };
  }

  if (!isGoogleMapsUrl(mapsUrl)) {
    return {
      level: "error",
      code: "invalid_maps_url",
      message: "กรุณากรอกลิงก์ Google Maps ที่ถูกต้องสำหรับการจัดส่ง",
    };
  }

  if (!parseGoogleMapsCoordinates(mapsUrl) && !isGoogleMapsShortLink(mapsUrl)) {
    return {
      level: "warning",
      code: "missing_coordinates",
      message: "ลิงก์ Maps นี้ไม่มีพิกัดให้อ่านอัตโนมัติ จุดส่งนี้จึงต้องจัดเส้นทางแบบแมนนวล",
    };
  }

  if (isGoogleMapsShortLink(mapsUrl) && !APP_CONFIG.expandMapsShortLinkEndpoint) {
    return {
      level: "warning",
      code: "short_link_needs_expand",
      message: "ลิงก์ย่อของ Maps ต้องมี endpoint สำหรับขยายลิงก์ก่อนจึงจะอ่านพิกัดอัตโนมัติได้",
    };
  }

  return null;
}

export function getOrderCoordinates(order = {}) {
  const lat = Number(order.destinationLat);
  const lng = Number(order.destinationLng);
  if (Number.isFinite(lat) && Number.isFinite(lng)) return { lat, lng };
  return parseGoogleMapsCoordinates(order.mapsUrl);
}

export async function resolveMapsCoordinates(value) {
  const direct = parseGoogleMapsCoordinates(value);
  if (direct) return { coordinates: direct, finalUrl: String(value || "").trim() };
  if (!isGoogleMapsShortLink(value) || !APP_CONFIG.expandMapsShortLinkEndpoint) return null;

  try {
    const response = await fetch(APP_CONFIG.expandMapsShortLinkEndpoint, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ url: value }),
    });
    if (!response.ok) return null;
    const payload = await response.json();
    const coordinates = payload?.coordinates || parseGoogleMapsCoordinates(payload?.finalUrl || "");
    if (!coordinates) return null;

    return {
      coordinates,
      finalUrl: String(payload?.finalUrl || value),
    };
  } catch {
    return null;
  }
}

export async function resolveDistrictFromCoordinates(lat, lng) {
  if (!APP_CONFIG.reverseGeocodeEndpoint) return null;

  try {
    const response = await fetch(APP_CONFIG.reverseGeocodeEndpoint, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ lat, lng }),
    });
    if (!response.ok) return null;

    const payload = await response.json();
    return {
      district: String(payload?.district || "").trim(),
      province: String(payload?.province || "").trim(),
      displayName: String(payload?.displayName || "").trim(),
    };
  } catch {
    return null;
  }
}

export function calculateDistanceKm(startLat, startLng, endLat, endLng) {
  const earthRadiusKm = 6371;
  const dLat = toRadians(endLat - startLat);
  const dLng = toRadians(endLng - startLng);
  const lat1 = toRadians(startLat);
  const lat2 = toRadians(endLat);
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) * Math.sin(dLng / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return earthRadiusKm * c;
}

function buildCoordinateKey(point = {}) {
  const lat = Number(point.lat);
  const lng = Number(point.lng);
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return "";
  return `${lat.toFixed(6)},${lng.toFixed(6)}`;
}

function buildRouteCacheKey(startPoint, endPoint) {
  const startKey = buildCoordinateKey(startPoint);
  const endKey = buildCoordinateKey(endPoint);
  return startKey && endKey ? `${startKey}->${endKey}` : "";
}

function createEmptyRouteDistanceSummary(origin = APP_CONFIG.hub) {
  return {
    stopCount: 0,
    mappedStopCount: 0,
    missingCoordinatesCount: 0,
    outboundDistanceKm: null,
    returnDistanceKm: null,
    totalDistanceKm: null,
    averageLegDistanceKm: null,
    routePathText: `${origin.name} -> ${origin.name}`,
    routePathDetailText: `${origin.name} -> ${origin.name}`,
    routeLegs: [],
    legByLookupKey: {},
    stopMetricsByLookupKey: {},
    distanceSource: null,
  };
}

function normalizeStop(stop = {}, index = 0) {
  const stepIndex = Number(stop.routeIndex || index + 1);
  return {
    ...stop,
    stepIndex: Number.isFinite(stepIndex) && stepIndex > 0 ? stepIndex : index + 1,
    lookupKey: String(
      stop.lookupKey ||
        stop.historySnapshot?.historyId ||
        stop.poNumber ||
        stop.customerName ||
        `stop-${index + 1}`
    ),
  };
}

function getStopStepLabel(stepIndex) {
  return `จุดที่ ${stepIndex}`;
}

function getStopDisplayLabel(stop = {}, stepIndex = 1) {
  return stop.poNumber || stop.customerName || getStopStepLabel(stepIndex);
}

function finalizeRouteDistanceSummary(summary, routeLegs = []) {
  const normalizedLegs = routeLegs.map((leg) => {
    const distanceKm = Number(leg.distanceKm);
    return {
      ...leg,
      distanceKm: Number.isFinite(distanceKm) ? distanceKm : null,
      distanceSource: leg.distanceSource || (leg.fromCoordinates && leg.toCoordinates ? "air" : null),
    };
  });

  const stopLegs = normalizedLegs.filter((leg) => !leg.isReturnLeg);
  const legByLookupKey = {};
  const stopMetricsByLookupKey = {};
  let cumulativeDistanceKm = 0;
  let cumulativeKnown = true;

  stopLegs.forEach((leg) => {
    const legDistanceKm = Number.isFinite(leg.distanceKm) ? leg.distanceKm : null;
    let nextCumulativeDistanceKm = null;

    if (legDistanceKm !== null && cumulativeKnown) {
      cumulativeDistanceKm += legDistanceKm;
      nextCumulativeDistanceKm = cumulativeDistanceKm;
    } else {
      cumulativeKnown = false;
    }

    legByLookupKey[leg.stopLookupKey] = leg;
    stopMetricsByLookupKey[leg.stopLookupKey] = {
      routeIndex: leg.stopStepIndex,
      previousStopLabel: leg.fromLabel || leg.fromStepLabel,
      legFromStepLabel: leg.fromStepLabel,
      legToStepLabel: leg.toStepLabel,
      legDistanceKm,
      cumulativeDistanceKm: nextCumulativeDistanceKm,
      fromLabel: leg.fromLabel,
      toLabel: leg.toLabel,
      distanceSource: leg.distanceSource || null,
    };
  });

  const mappedStopCount = stopLegs.filter((leg) => leg.toCoordinates).length;
  const missingCoordinatesCount = stopLegs.length - mappedStopCount;
  const outboundKnown = stopLegs.length > 0 && stopLegs.every((leg) => Number.isFinite(leg.distanceKm));
  const outboundDistanceKm = outboundKnown
    ? stopLegs.reduce((sum, leg) => sum + Number(leg.distanceKm || 0), 0)
    : null;
  const returnLeg = normalizedLegs.find((leg) => leg.isReturnLeg) || null;
  const returnDistanceKm = returnLeg && Number.isFinite(returnLeg.distanceKm) ? Number(returnLeg.distanceKm) : null;
  const totalDistanceKm = outboundDistanceKm !== null && returnDistanceKm !== null ? outboundDistanceKm + returnDistanceKm : null;
  const sources = [...new Set(normalizedLegs.map((leg) => leg.distanceSource).filter(Boolean))];

  return {
    ...summary,
    stopCount: stopLegs.length,
    mappedStopCount,
    missingCoordinatesCount,
    routeLegs: normalizedLegs,
    legByLookupKey,
    stopMetricsByLookupKey,
    outboundDistanceKm,
    returnDistanceKm,
    totalDistanceKm,
    averageLegDistanceKm: outboundDistanceKm !== null && stopLegs.length ? outboundDistanceKm / stopLegs.length : null,
    distanceSource:
      sources.length === 1 ? sources[0] : sources.includes("road") ? "mixed" : sources[0] || null,
  };
}

export function buildRouteDistanceSummary(stops = [], origin = APP_CONFIG.hub) {
  const normalizedStops = stops.map((stop, index) => ({
    ...stop,
    stepIndex: Number(stop.routeIndex || index + 1),
    lookupKey:
      String(stop.lookupKey || stop.historySnapshot?.historyId || stop.poNumber || stop.customerName || `stop-${index + 1}`),
  }));
  const routePathText = [origin.name, ...normalizedStops.map((stop) => `จุดที่ ${stop.stepIndex}`), origin.name].join(" -> ");
  const routePathDetailText = [
    origin.name,
    ...normalizedStops.map((stop) => stop.poNumber || stop.customerName || `จุดที่ ${stop.stepIndex}`),
    origin.name,
  ].join(" -> ");

  let previousPoint = origin;
  let previousStepLabel = origin.name;
  let previousLabel = origin.name;
  let outboundDistanceKm = 0;
  let mappedStopCount = 0;
  let missingCoordinatesCount = 0;

  const routeLegs = [];
  const legByLookupKey = {};

  normalizedStops.forEach((stop) => {
    if (!stop.coordinates) {
      missingCoordinatesCount += 1;
      return;
    }

    const distanceKm = calculateDistanceKm(previousPoint.lat, previousPoint.lng, stop.coordinates.lat, stop.coordinates.lng);
    const leg = {
      key: `${stop.lookupKey}-leg`,
      stopLookupKey: stop.lookupKey,
      fromStepLabel: previousStepLabel,
      toStepLabel: `จุดที่ ${stop.stepIndex}`,
      fromLabel: previousLabel,
      toLabel: stop.poNumber || stop.customerName || `จุดที่ ${stop.stepIndex}`,
      fromCoordinates: previousPoint,
      toCoordinates: stop.coordinates,
      distanceKm,
      isReturnLeg: false,
    };

    routeLegs.push(leg);
    legByLookupKey[stop.lookupKey] = leg;
    outboundDistanceKm += distanceKm;
    mappedStopCount += 1;
    previousPoint = stop.coordinates;
    previousStepLabel = `จุดที่ ${stop.stepIndex}`;
    previousLabel = stop.poNumber || stop.customerName || `จุดที่ ${stop.stepIndex}`;
  });

  let returnDistanceKm = null;
  if (mappedStopCount > 0) {
    returnDistanceKm = calculateDistanceKm(previousPoint.lat, previousPoint.lng, origin.lat, origin.lng);
    routeLegs.push({
      key: "return-leg",
      stopLookupKey: "__return__",
      fromStepLabel: previousStepLabel,
      toStepLabel: origin.name,
      fromLabel: previousLabel,
      toLabel: origin.name,
      fromCoordinates: previousPoint,
      toCoordinates: origin,
      distanceKm: returnDistanceKm,
      isReturnLeg: true,
    });
  }

  return {
    stopCount: normalizedStops.length,
    mappedStopCount,
    missingCoordinatesCount,
    outboundDistanceKm: mappedStopCount ? outboundDistanceKm : null,
    returnDistanceKm,
    totalDistanceKm: mappedStopCount && returnDistanceKm !== null ? outboundDistanceKm + returnDistanceKm : null,
    averageLegDistanceKm: mappedStopCount ? outboundDistanceKm / mappedStopCount : null,
    routePathText,
    routePathDetailText,
    routeLegs,
    legByLookupKey,
    distanceSource: "air",
  };
}

export function buildMapRouteDistanceSummary(stops = [], origin = APP_CONFIG.hub) {
  const normalizedStops = stops.map((stop, index) => normalizeStop(stop, index));
  if (!normalizedStops.length) return createEmptyRouteDistanceSummary(origin);

  const routePathText = [origin.name, ...normalizedStops.map((stop) => getStopStepLabel(stop.stepIndex)), origin.name].join(
    " -> "
  );
  const routePathDetailText = [
    origin.name,
    ...normalizedStops.map((stop) => getStopDisplayLabel(stop, stop.stepIndex)),
    origin.name,
  ].join(" -> ");

  let previousPoint = origin;
  let previousStepLabel = origin.name;
  let previousLabel = origin.name;
  const routeLegs = [];

  normalizedStops.forEach((stop) => {
    const toStepLabel = getStopStepLabel(stop.stepIndex);
    const toLabel = getStopDisplayLabel(stop, stop.stepIndex);
    const distanceKm =
      previousPoint && stop.coordinates
        ? calculateDistanceKm(previousPoint.lat, previousPoint.lng, stop.coordinates.lat, stop.coordinates.lng)
        : null;

    routeLegs.push({
      key: `${stop.lookupKey}-leg`,
      stopLookupKey: stop.lookupKey,
      stopStepIndex: stop.stepIndex,
      fromStepLabel: previousStepLabel,
      toStepLabel,
      fromLabel: previousLabel,
      toLabel,
      fromCoordinates: previousPoint,
      toCoordinates: stop.coordinates || null,
      distanceKm,
      isReturnLeg: false,
      distanceSource: distanceKm === null ? null : "air",
    });

    previousPoint = stop.coordinates || null;
    previousStepLabel = toStepLabel;
    previousLabel = toLabel;
  });

  routeLegs.push({
    key: "return-leg",
    stopLookupKey: "__return__",
    stopStepIndex: normalizedStops.length + 1,
    fromStepLabel: previousStepLabel,
    toStepLabel: origin.name,
    fromLabel: previousLabel,
    toLabel: origin.name,
    fromCoordinates: previousPoint,
    toCoordinates: previousPoint ? origin : null,
    distanceKm:
      previousPoint && origin
        ? calculateDistanceKm(previousPoint.lat, previousPoint.lng, origin.lat, origin.lng)
        : null,
    isReturnLeg: true,
    distanceSource: previousPoint ? "air" : null,
  });

  return finalizeRouteDistanceSummary(
    {
      routePathText,
      routePathDetailText,
    },
    routeLegs
  );
}

async function fetchRoadDistanceKm(startPoint, endPoint) {
  const cacheKey = buildRouteCacheKey(startPoint, endPoint);
  if (cacheKey && routeDistanceCache.has(cacheKey)) {
    return routeDistanceCache.get(cacheKey);
  }

  const fallbackDistanceKm = calculateDistanceKm(startPoint.lat, startPoint.lng, endPoint.lat, endPoint.lng);

  const request = fetch("/api/route-distance", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      origin: { lat: startPoint.lat, lng: startPoint.lng },
      destination: { lat: endPoint.lat, lng: endPoint.lng },
    }),
  })
    .then(async (response) => {
      if (!response.ok) {
        return { distanceKm: fallbackDistanceKm, source: "air" };
      }

      const payload = await response.json();
      const distanceKm = Number(payload?.distanceKm);
      if (!Number.isFinite(distanceKm) || distanceKm <= 0) {
        return { distanceKm: fallbackDistanceKm, source: "air" };
      }

      return {
        distanceKm,
        source: String(payload?.source || "road").trim() || "road",
      };
    })
    .catch(() => ({ distanceKm: fallbackDistanceKm, source: "air" }));

  if (cacheKey) routeDistanceCache.set(cacheKey, request);
  return request;
}

export async function resolveRoadRouteDistanceSummary(summary) {
  if (!summary?.routeLegs?.length) return summary;

  const resolvedLegs = await Promise.all(
    summary.routeLegs.map(async (leg) => {
      if (!leg.fromCoordinates || !leg.toCoordinates) {
        return {
          ...leg,
          distanceKm: null,
          distanceSource: null,
        };
      }

      const result = await fetchRoadDistanceKm(leg.fromCoordinates, leg.toCoordinates);
      return {
        ...leg,
        distanceKm: result.distanceKm,
        distanceSource: result.source,
      };
    })
  );

  return finalizeRouteDistanceSummary(summary, resolvedLegs);
}

export async function resolveMapRouteDistanceSummary(summary) {
  if (!summary?.routeLegs?.length) return summary;

  const resolvedLegs = await Promise.all(
    summary.routeLegs.map(async (leg) => {
      if (!leg.fromCoordinates || !leg.toCoordinates) {
        return {
          ...leg,
          distanceKm: null,
          distanceSource: null,
        };
      }

      const result = await fetchRoadDistanceKm(leg.fromCoordinates, leg.toCoordinates);
      return {
        ...leg,
        distanceKm: result.distanceKm,
        distanceSource: result.source,
      };
    })
  );

  return finalizeRouteDistanceSummary(summary, resolvedLegs);
}

export function buildAreaKey(lat, lng) {
  const distanceKm = calculateDistanceKm(APP_CONFIG.hub.lat, APP_CONFIG.hub.lng, lat, lng);
  const direction = getCompassDirection(APP_CONFIG.hub.lat, APP_CONFIG.hub.lng, lat, lng);
  const distanceBand =
    distanceKm <= 5 ? "ใกล้ศูนย์" : distanceKm <= 15 ? "โซนใกล้" : distanceKm <= 30 ? "โซนนอก" : "ระยะไกล";
  return `${distanceBand} / ${direction}`;
}

export function buildDistrictArea(locationInfo, lat, lng) {
  const district = String(locationInfo?.district || "").trim();
  const province = String(locationInfo?.province || "").trim();
  if (district && province) return `${district}, ${province}`;
  if (district) return district;
  return buildAreaKey(lat, lng);
}

export function buildRelativeLocationLabel(lat, lng) {
  const direction = getCompassDirection(APP_CONFIG.hub.lat, APP_CONFIG.hub.lng, lat, lng);
  const distanceKm = calculateDistanceKm(APP_CONFIG.hub.lat, APP_CONFIG.hub.lng, lat, lng);
  return `${direction} จากศูนย์ ${distanceKm.toFixed(1)} กม.`;
}

function getCompassDirection(startLat, startLng, endLat, endLng) {
  const bearing = calculateBearing(startLat, startLng, endLat, endLng);
  const directions = ["เหนือ", "ตะวันออกเฉียงเหนือ", "ตะวันออก", "ตะวันออกเฉียงใต้", "ใต้", "ตะวันตกเฉียงใต้", "ตะวันตก", "ตะวันตกเฉียงเหนือ"];
  const index = Math.round(bearing / 45) % 8;
  return directions[index];
}

function calculateBearing(startLat, startLng, endLat, endLng) {
  const lat1 = toRadians(startLat);
  const lat2 = toRadians(endLat);
  const dLng = toRadians(endLng - startLng);
  const y = Math.sin(dLng) * Math.cos(lat2);
  const x =
    Math.cos(lat1) * Math.sin(lat2) -
    Math.sin(lat1) * Math.cos(lat2) * Math.cos(dLng);

  return (toDegrees(Math.atan2(y, x)) + 360) % 360;
}

function safeDecodeURIComponent(value) {
  try {
    return decodeURIComponent(value);
  } catch {
    return String(value || "");
  }
}

function toRadians(value) {
  return value * (Math.PI / 180);
}

function toDegrees(value) {
  return value * (180 / Math.PI);
}
