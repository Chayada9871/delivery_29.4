import { APP_CONFIG, ROLES, STATUS, STATUS_LABELS } from "@/lib/config";
import { calculateDistanceKm, getOrderCoordinates } from "@/lib/maps";
import { calculateSelectedTotals, getOrderDataIssues } from "@/lib/validation";
import {
  FINAL_DELIVERY_STATUSES,
  getCompletedStatus,
  getOperationalStatus,
  isArchived,
} from "@/lib/workflow";

export function getTodayKey() {
  return new Intl.DateTimeFormat("sv-SE", { timeZone: "Asia/Bangkok" }).format(new Date());
}

export function getOrderTotals(order = {}) {
  return calculateSelectedTotals(order.selectedProducts || []);
}

export function enrichOrder(order = {}) {
  const coordinates = getOrderCoordinates(order);
  return {
    ...order,
    status: getOperationalStatus(order),
    finalStatus: getCompletedStatus(order),
    coordinates,
    distanceFromHubKm: coordinates
      ? calculateDistanceKm(APP_CONFIG.hub.lat, APP_CONFIG.hub.lng, coordinates.lat, coordinates.lng)
      : null,
    totals: getOrderTotals(order),
    issues: getOrderDataIssues(order),
  };
}

export function getOpenOrders(orders = []) {
  return orders.filter((order) => !isArchived(order));
}

export function getArchivedOrders(orders = []) {
  return orders.filter((order) => isArchived(order));
}

function getSequenceValue(order = {}) {
  const value = Number(order.deliverySequence);
  return Number.isFinite(value) && value > 0 ? value : null;
}

function stableSort(a, b) {
  const dateCompare = String(a.deliveryDate || "").localeCompare(String(b.deliveryDate || ""));
  if (dateCompare !== 0) return dateCompare;

  const seqA = getSequenceValue(a);
  const seqB = getSequenceValue(b);
  if (seqA !== null || seqB !== null) {
    if (seqA === null) return 1;
    if (seqB === null) return -1;
    if (seqA !== seqB) return seqA - seqB;
  }

  const createdA = Date.parse(a.createdAt || a.updatedAt || "");
  const createdB = Date.parse(b.createdAt || b.updatedAt || "");
  if (Number.isFinite(createdA) && Number.isFinite(createdB) && createdA !== createdB) {
    return createdA - createdB;
  }

  return String(a.poNumber || "").localeCompare(String(b.poNumber || ""));
}

function buildNearestNeighbor(orders = [], origin = APP_CONFIG.hub) {
  const candidates = [...orders].sort(stableSort);
  const withCoordinates = candidates.filter((item) => item.coordinates);
  const withoutCoordinates = candidates.filter((item) => !item.coordinates);
  const ordered = [];
  let currentPoint = { lat: origin.lat, lng: origin.lng };

  while (withCoordinates.length) {
    let bestIndex = 0;
    let bestDistance = Number.POSITIVE_INFINITY;

    withCoordinates.forEach((item, index) => {
      const distance = calculateDistanceKm(
        currentPoint.lat,
        currentPoint.lng,
        item.coordinates.lat,
        item.coordinates.lng
      );

      if (distance < bestDistance) {
        bestIndex = index;
        bestDistance = distance;
      } else if (distance === bestDistance && stableSort(item, withCoordinates[bestIndex]) < 0) {
        bestIndex = index;
      }
    });

    const [next] = withCoordinates.splice(bestIndex, 1);
    ordered.push(next);
    currentPoint = next.coordinates || currentPoint;
  }

  return [...ordered, ...withoutCoordinates];
}

function getPointDistanceKm(startPoint, endPoint) {
  if (!startPoint || !endPoint) return null;
  return calculateDistanceKm(startPoint.lat, startPoint.lng, endPoint.lat, endPoint.lng);
}

function scoreRouteDistance(orders = [], origin = APP_CONFIG.hub) {
  if (!orders.length) return 0;

  let previousPoint = origin;
  let totalDistanceKm = 0;

  for (const order of orders) {
    if (!order.coordinates) return Number.POSITIVE_INFINITY;
    const legDistanceKm = getPointDistanceKm(previousPoint, order.coordinates);
    if (legDistanceKm === null) return Number.POSITIVE_INFINITY;
    totalDistanceKm += legDistanceKm;
    previousPoint = order.coordinates;
  }

  const returnDistanceKm = getPointDistanceKm(previousPoint, APP_CONFIG.hub);
  if (returnDistanceKm === null) return Number.POSITIVE_INFINITY;

  return totalDistanceKm + returnDistanceKm;
}

function improveRouteWithTwoOpt(orders = [], origin = APP_CONFIG.hub) {
  const withCoordinates = orders.filter((item) => item.coordinates);
  const withoutCoordinates = orders.filter((item) => !item.coordinates).sort(stableSort);

  if (withCoordinates.length < 3) return [...withCoordinates, ...withoutCoordinates];

  let bestRoute = [...withCoordinates];
  let bestScore = scoreRouteDistance(bestRoute, origin);
  let improved = true;

  while (improved) {
    improved = false;

    for (let startIndex = 0; startIndex < bestRoute.length - 1; startIndex += 1) {
      for (let endIndex = startIndex + 1; endIndex < bestRoute.length; endIndex += 1) {
        const candidateRoute = [
          ...bestRoute.slice(0, startIndex),
          ...bestRoute.slice(startIndex, endIndex + 1).reverse(),
          ...bestRoute.slice(endIndex + 1),
        ];
        const candidateScore = scoreRouteDistance(candidateRoute, origin);

        if (candidateScore + 0.001 < bestScore) {
          bestRoute = candidateRoute;
          bestScore = candidateScore;
          improved = true;
        }
      }
    }
  }

  return [...bestRoute, ...withoutCoordinates];
}

export function annotateRouteStops(orders = []) {
  let previousCoordinates = APP_CONFIG.hub;
  let previousStopLabel = APP_CONFIG.hub.name;
  let cumulativeDistanceKm = 0;

  return orders.map((order, index) => {
    const legDistanceKm =
      order.coordinates && previousCoordinates
        ? getPointDistanceKm(previousCoordinates, order.coordinates)
        : null;

    if (legDistanceKm !== null) {
      cumulativeDistanceKm += legDistanceKm;
    }

    if (order.coordinates) {
      previousCoordinates = order.coordinates;
    }

    const annotated = {
      ...order,
      routeIndex: index + 1,
      previousStopLabel,
      legDistanceKm,
      cumulativeDistanceKm: legDistanceKm === null ? null : cumulativeDistanceKm,
    };

    if (order.coordinates) {
      previousStopLabel = order.poNumber || `STOP-${index + 1}`;
    }

    return annotated;
  });
}

export function summarizeDispatchRoute(orders = []) {
  if (!orders.length) {
    return {
      stopCount: 0,
      mappedStopCount: 0,
      missingCoordinatesCount: 0,
      outboundDistanceKm: null,
      returnDistanceKm: null,
      totalDistanceKm: null,
      averageLegDistanceKm: null,
      routePathText: "",
      routePathDetailText: "",
      routeLegs: [],
    };
  }

  const mappedStops = orders.filter((order) => order.coordinates);
  const missingCoordinatesCount = orders.filter((order) => !order.coordinates).length;
  const outboundDistanceKm = orders.reduce((sum, order) => sum + Number(order.legDistanceKm || 0), 0);
  const lastStopWithCoordinates = [...orders].reverse().find((order) => order.coordinates);
  const routeLegs = orders
    .map((order, index) => ({ order, index }))
    .filter(({ order }) => Number.isFinite(order.legDistanceKm))
    .map(({ order, index }) => ({
      key: `${order.poNumber || "stop"}-${index + 1}`,
      fromStepLabel: index === 0 ? APP_CONFIG.hub.name : `จุดที่ ${index}`,
      toStepLabel: `จุดที่ ${index + 1}`,
      fromLabel: index === 0 ? APP_CONFIG.hub.name : orders[index - 1]?.poNumber || orders[index - 1]?.customerName || `จุดที่ ${index}`,
      toLabel: order.poNumber || order.customerName || `จุดที่ ${index + 1}`,
      distanceKm: Number(order.legDistanceKm),
    }));
  const returnDistanceKm = lastStopWithCoordinates
    ? getPointDistanceKm(lastStopWithCoordinates.coordinates, APP_CONFIG.hub)
    : null;
  const totalDistanceKm =
    missingCoordinatesCount > 0 || returnDistanceKm === null ? null : outboundDistanceKm + returnDistanceKm;
  if (lastStopWithCoordinates && Number.isFinite(returnDistanceKm)) {
    const lastStopIndex = Math.max(orders.findIndex((item) => item.poNumber === lastStopWithCoordinates.poNumber), 0);
    routeLegs.push({
      key: `${lastStopWithCoordinates.poNumber || "stop"}-return`,
      fromStepLabel: `จุดที่ ${lastStopIndex + 1}`,
      toStepLabel: APP_CONFIG.hub.name,
      fromLabel: lastStopWithCoordinates.poNumber || lastStopWithCoordinates.customerName || "จุดสุดท้าย",
      toLabel: APP_CONFIG.hub.name,
      distanceKm: Number(returnDistanceKm),
    });
  }

  const routePathText = [
    APP_CONFIG.hub.name,
    ...orders.map((order, index) => `จุดที่ ${order.routeIndex || index + 1}`),
    APP_CONFIG.hub.name,
  ].join(" -> ");

  const routePathDetailText = [
    APP_CONFIG.hub.name,
    ...orders.map((order, index) => order.poNumber || order.customerName || `STOP-${index + 1}`),
    APP_CONFIG.hub.name,
  ].join(" -> ");

  return {
    stopCount: orders.length,
    mappedStopCount: mappedStops.length,
    missingCoordinatesCount,
    outboundDistanceKm: mappedStops.length ? outboundDistanceKm : null,
    returnDistanceKm,
    totalDistanceKm,
    averageLegDistanceKm: mappedStops.length ? outboundDistanceKm / mappedStops.length : null,
    routePathText,
    routePathDetailText,
    routeLegs,
  };
}

function toFiniteNumber(value) {
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function buildHistoryRouteKey(order = {}) {
  return [
    String(order.deliveryDate || "").trim(),
    String(order.assignedDriverId || order.routeDriverName || "").trim(),
    String(order.routeStartedAt || order.dispatchStartedAt || order.routeArchivedAt || order.poNumber || "").trim(),
    String(order.routeFinishedAt || order.routeArchivedAt || "").trim(),
    String(order.routeStartKm ?? "").trim(),
    String(order.routeEndKm ?? "").trim(),
  ].join("::");
}

function buildHistoryItemKey(order = {}) {
  return [
    buildHistoryRouteKey(order),
    String(order.historySnapshot?.historyId || "").trim(),
    String(order.poNumber || "").trim(),
    String(order.deliverySequence ?? "").trim(),
    String(order.dispatchDeliveredAt || order.updatedAt || order.createdAt || "").trim(),
  ].join("::");
}

function summarizeHistoryRoutes(items = []) {
  const routeMap = items.reduce((acc, item) => {
    const routeKey = buildHistoryRouteKey(item);

    if (!acc[routeKey]) {
      acc[routeKey] = {
        routeKey,
        driverName: item.routeDriverName || "-",
        routeStartedAt: item.routeStartedAt || item.dispatchStartedAt || "",
        routeFinishedAt: item.routeFinishedAt || "",
        routeArchivedAt: item.routeArchivedAt || "",
        routeStartKm: item.routeStartKm ?? "",
        routeEndKm: item.routeEndKm ?? "",
        items: [],
      };
    }

    acc[routeKey].items.push(item);
    return acc;
  }, {});

  const itemLookup = {};
  const routes = Object.values(routeMap)
    .map((route) => {
      const orderedItems = [...route.items].sort((left, right) => stableSort(left, right));
      let currentPoint = APP_CONFIG.hub;
      let outboundDistanceKm = 0;
      let hasMissingExpectedDistance = orderedItems.length === 0;

      orderedItems.forEach((item, index) => {
        const itemKey = buildHistoryItemKey(item);
        const previousItem = index > 0 ? orderedItems[index - 1] : null;
        const previousStopLabel =
          previousItem?.poNumber || previousItem?.customerName || (index > 0 ? `จุดที่ ${index}` : APP_CONFIG.hub.name);
        const legFromStepLabel = index === 0 ? APP_CONFIG.hub.name : `จุดที่ ${index}`;
        const legToStepLabel = `จุดที่ ${index + 1}`;

        if (!item.coordinates) {
          hasMissingExpectedDistance = true;
          itemLookup[itemKey] = {
            routeIndex: index + 1,
            legDistanceKm: null,
            previousStopLabel,
            legFromStepLabel,
            legToStepLabel,
            routeKey: route.routeKey,
          };
          return;
        }

        if (!hasMissingExpectedDistance) {
          const legDistanceKm = calculateDistanceKm(
            currentPoint.lat,
            currentPoint.lng,
            item.coordinates.lat,
            item.coordinates.lng
          );

          outboundDistanceKm += legDistanceKm;
          currentPoint = item.coordinates;
          itemLookup[itemKey] = {
            routeIndex: index + 1,
            legDistanceKm,
            previousStopLabel,
            legFromStepLabel,
            legToStepLabel,
            routeKey: route.routeKey,
          };
          return;
        }

        itemLookup[itemKey] = {
          routeIndex: index + 1,
          legDistanceKm: null,
          previousStopLabel,
          legFromStepLabel,
          legToStepLabel,
          routeKey: route.routeKey,
        };
      });

      const returnDistanceKm =
        !hasMissingExpectedDistance && orderedItems.length
          ? calculateDistanceKm(currentPoint.lat, currentPoint.lng, APP_CONFIG.hub.lat, APP_CONFIG.hub.lng)
          : null;
      const plannedDistanceKm =
        returnDistanceKm === null ? null : Number(outboundDistanceKm) + Number(returnDistanceKm);
      const startKm = toFiniteNumber(route.routeStartKm);
      const endKm = toFiniteNumber(route.routeEndKm);
      const actualDistanceKm =
        startKm !== null && endKm !== null && endKm >= startKm ? endKm - startKm : null;

      return {
        ...route,
        stopCount: orderedItems.length,
        outboundDistanceKm: plannedDistanceKm === null ? null : outboundDistanceKm,
        returnDistanceKm,
        plannedDistanceKm,
        hasMissingExpectedDistance,
        actualDistanceKm,
        distanceVarianceKm:
          actualDistanceKm === null || plannedDistanceKm === null ? null : actualDistanceKm - plannedDistanceKm,
      };
    })
    .sort((left, right) => stableSort(left, right));

  const routeLookup = routes.reduce((acc, route) => {
    acc[route.routeKey] = route;
    return acc;
  }, {});

  const routesWithExpectedDistance = routes.filter((route) => route.plannedDistanceKm !== null);
  const expectedDistanceKm = routesWithExpectedDistance.length
    ? routesWithExpectedDistance.reduce((sum, route) => sum + route.plannedDistanceKm, 0)
    : null;
  const routesWithActualDistance = routes.filter((route) => route.actualDistanceKm !== null);
  const actualDistanceKm = routesWithActualDistance.length
    ? routesWithActualDistance.reduce((sum, route) => sum + route.actualDistanceKm, 0)
    : null;

  return {
    routes,
    routeLookup,
    itemLookup,
    expectedDistanceKm,
    actualDistanceKm,
    distanceVarianceKm:
      actualDistanceKm === null || expectedDistanceKm === null ? null : actualDistanceKm - expectedDistanceKm,
    missingActualRoutes: routes.filter((route) => route.actualDistanceKm === null).length,
    incompleteExpectedRoutes: routes.filter((route) => route.hasMissingExpectedDistance).length,
  };
}

export function buildDispatchRows(orders = [], options = {}) {
  const selectedDate = options.date || "ALL";
  const driverId = String(options.driverId || "").trim();
  const openOrders = getOpenOrders(orders).map(enrichOrder);
  const scopedOrders = openOrders
    .filter((order) => (selectedDate === "ALL" ? true : order.deliveryDate === selectedDate))
    .filter((order) => (driverId ? String(order.assignedDriverId || "") === driverId : true));

  if (selectedDate === "ALL") {
    return scopedOrders.sort(stableSort).map((order) => ({
      ...order,
      routeIndex: getSequenceValue(order),
      legDistanceKm: null,
      previousStopLabel: APP_CONFIG.hub.name,
      cumulativeDistanceKm: null,
    }));
  }

  const sequenced = scopedOrders
    .filter((order) => getSequenceValue(order) !== null)
    .sort((left, right) => Number(left.deliverySequence) - Number(right.deliverySequence));

  const unsequenced = scopedOrders.filter((order) => getSequenceValue(order) === null);
  const lastSequencedWithCoordinates = [...sequenced].reverse().find((order) => order.coordinates);
  const suggested = improveRouteWithTwoOpt(
    buildNearestNeighbor(unsequenced, lastSequencedWithCoordinates?.coordinates || APP_CONFIG.hub),
    lastSequencedWithCoordinates?.coordinates || APP_CONFIG.hub
  );

  return annotateRouteStops([...sequenced, ...suggested]);
}

function getDayKeyFromTimestamp(value) {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return new Intl.DateTimeFormat("sv-SE", { timeZone: "Asia/Bangkok" }).format(date);
}

function isSameOperationalDay(value, dayKey) {
  return Boolean(dayKey) && getDayKeyFromTimestamp(value) === dayKey;
}

function isPastDeliveryDate(value, dayKey) {
  const normalized = String(value || "").trim();
  return Boolean(normalized && dayKey && normalized < dayKey);
}

function getLatestIso(values = []) {
  const latestTimestamp = values.reduce((best, value) => {
    const timestamp = Date.parse(value || "");
    if (!Number.isFinite(timestamp)) return best;
    return best === null || timestamp > best ? timestamp : best;
  }, null);

  return latestTimestamp === null ? "" : new Date(latestTimestamp).toISOString();
}

function percentOf(value, total) {
  if (!total) return 0;
  return Math.round((Number(value || 0) / Number(total || 0)) * 100);
}

function matchesUser(order = {}, user = {}) {
  const userId = String(user.id || "").trim();
  const userName = String(user.name || user.username || "").trim();
  return (
    String(order.assignedDriverId || "").trim() === userId ||
    (!!userName && String(order.routeDriverName || "").trim() === userName)
  );
}

function buildDriverRouteMetrics(orders = [], dayKey = "") {
  const archivedToday = getArchivedOrders(orders)
    .map(enrichOrder)
    .filter((order) => order.deliveryDate === dayKey);
  const routeSummary = summarizeHistoryRoutes(archivedToday);
  const routeOwners = archivedToday.reduce((acc, item) => {
    const routeKey = buildHistoryRouteKey(item);
    if (!acc[routeKey]) {
      acc[routeKey] = {
        driverId: String(item.assignedDriverId || "").trim(),
        driverName: String(item.routeDriverName || "").trim(),
      };
    }
    return acc;
  }, {});

  return routeSummary.routes.reduce((acc, route) => {
    const owner = routeOwners[route.routeKey] || {};
    const lookupKeys = [...new Set([owner.driverId, owner.driverName, route.driverName].filter(Boolean))];

    lookupKeys.forEach((key) => {
      if (!acc[key]) {
        acc[key] = {
          routeCount: 0,
          actualDistanceKm: 0,
          plannedDistanceKm: 0,
          missingActualRoutes: 0,
          latestFinishedAt: "",
        };
      }

      acc[key].routeCount += 1;
      if (route.actualDistanceKm === null) {
        acc[key].missingActualRoutes += 1;
      } else {
        acc[key].actualDistanceKm += route.actualDistanceKm;
      }

      if (route.plannedDistanceKm !== null) {
        acc[key].plannedDistanceKm += route.plannedDistanceKm;
      }

      acc[key].latestFinishedAt = getLatestIso([acc[key].latestFinishedAt, route.routeFinishedAt, route.routeArchivedAt]);
    });

    return acc;
  }, {});
}

export function buildDashboardModel(orders = [], users = []) {
  const todayKey = getTodayKey();
  const enrichedOpenOrders = getOpenOrders(orders).map(enrichOrder);
  const enrichedArchivedOrders = getArchivedOrders(orders).map(enrichOrder);
  const allOrders = [...enrichedOpenOrders, ...enrichedArchivedOrders];
  const drivers = users.filter((user) => user.role === ROLES.DRIVER);
  const salesUsers = users.filter((user) => user.role === ROLES.SALES);
  const warehouseUsers = users.filter((user) => user.role === ROLES.WAREHOUSE);
  const todayOrders = enrichedOpenOrders.filter((order) => order.deliveryDate === todayKey);
  const todayArchived = enrichedArchivedOrders.filter((order) => order.deliveryDate === todayKey);
  const dueTodayAll = allOrders.filter((order) => order.deliveryDate === todayKey);

  const preparedUnassigned = enrichedOpenOrders.filter(
    (order) => order.status === STATUS.PREPARED && !String(order.assignedDriverId || "").trim()
  );
  const inProgress = enrichedOpenOrders.filter((order) => order.status === STATUS.OUT_FOR_DELIVERY);
  const exceptions = enrichedOpenOrders.filter((order) =>
    [STATUS.FAILED, STATUS.RETURNED].includes(order.status)
  );
  const intakeQueue = enrichedOpenOrders.filter((order) =>
    [STATUS.LINE_RECEIVED, STATUS.CONFIRMED].includes(order.status)
  );
  const overdueOrders = enrichedOpenOrders.filter((order) => isPastDeliveryDate(order.deliveryDate, todayKey));
  const confirmedQueue = enrichedOpenOrders.filter((order) => order.status === STATUS.CONFIRMED);
  const assignedWaiting = enrichedOpenOrders.filter((order) => order.status === STATUS.ASSIGNED);
  const completedToday = todayArchived.filter((order) => FINAL_DELIVERY_STATUSES.includes(order.finalStatus));
  const deliveredToday = completedToday.filter((order) => order.finalStatus === STATUS.DELIVERED);
  const exceptionToday = completedToday.filter((order) =>
    [STATUS.FAILED, STATUS.RETURNED].includes(order.finalStatus)
  );
  const dataAlerts = enrichedOpenOrders.filter((order) =>
    order.issues.some((issue) => issue.level === "error" || issue.code === "missing_coordinates")
  );
  const driverRouteMetrics = buildDriverRouteMetrics(orders, todayKey);

  const driverPerformance = drivers
    .map((driver) => {
      const dueToday = dueTodayAll.filter((order) => matchesUser(order, driver));
      const openToday = todayOrders.filter((order) => matchesUser(order, driver));
      const liveStops = openToday.filter((order) => order.status === STATUS.OUT_FOR_DELIVERY).length;
      const waitingStops = openToday.filter((order) => order.status === STATUS.ASSIGNED).length;
      const completedStops = dueToday.filter((order) => FINAL_DELIVERY_STATUSES.includes(order.finalStatus || order.status)).length;
      const deliveredStops = dueToday.filter((order) => (order.finalStatus || order.status) === STATUS.DELIVERED).length;
      const exceptionStops = dueToday.filter((order) =>
        [STATUS.FAILED, STATUS.RETURNED].includes(order.finalStatus || order.status)
      ).length;
      const remainingStops = Math.max(dueToday.length - completedStops, 0);
      const routeMetric =
        driverRouteMetrics[String(driver.id || "").trim()] ||
        driverRouteMetrics[String(driver.name || driver.username || "").trim()] ||
        {
          routeCount: 0,
          actualDistanceKm: 0,
          plannedDistanceKm: 0,
          missingActualRoutes: 0,
          latestFinishedAt: "",
        };
      const latestActivityAt = getLatestIso([
        ...dueToday.map((order) => order.dispatchDeliveredAt),
        ...dueToday.map((order) => order.routeFinishedAt),
        ...dueToday.map((order) => order.routeStartedAt),
        ...dueToday.map((order) => order.updatedAt),
        routeMetric.latestFinishedAt,
      ]);

      let monitorStatus = "ไม่มีงานวันนี้";
      let monitorTone = "slate";
      if (dueToday.length && completedStops === dueToday.length) {
        monitorStatus = "ปิดงานครบ";
        monitorTone = "success";
      } else if (liveStops) {
        monitorStatus = "กำลังวิ่งงาน";
        monitorTone = "brand";
      } else if (waitingStops) {
        monitorStatus = "รอออกส่ง";
        monitorTone = "warning";
      } else if (dueToday.length) {
        monitorStatus = "ติดตามงาน";
        monitorTone = "warning";
      }

      return {
        id: driver.id,
        name: driver.name || driver.username || "-",
        vehicleType: driver.vehicleType || "-",
        area: driver.area || "-",
        maxOrders: driver.maxOrders || "",
        totalStops: dueToday.length,
        liveStops,
        waitingStops,
        completedStops,
        remainingStops,
        deliveredStops,
        exceptionStops,
        completionRate: percentOf(completedStops, dueToday.length),
        actualDistanceKm: routeMetric.actualDistanceKm || 0,
        plannedDistanceKm: routeMetric.plannedDistanceKm || 0,
        routeCount: routeMetric.routeCount || 0,
        missingActualRoutes: routeMetric.missingActualRoutes || 0,
        latestActivityAt,
        monitorStatus,
        monitorTone,
      };
    })
    .sort((left, right) => {
      if (right.totalStops !== left.totalStops) return right.totalStops - left.totalStops;
      if (right.completedStops !== left.completedStops) return right.completedStops - left.completedStops;
      return String(left.name || "").localeCompare(String(right.name || ""));
    });

  const salesPerformance = salesUsers
    .map((user) => {
      const createdOrders = allOrders.filter((order) => String(order.createdById || "").trim() === String(user.id || "").trim());
      const confirmedOrders = allOrders.filter((order) => String(order.confirmedById || "").trim() === String(user.id || "").trim());
      const backlogOrders = enrichedOpenOrders.filter(
        (order) =>
          [STATUS.LINE_RECEIVED, STATUS.CONFIRMED].includes(order.status) &&
          (
            String(order.createdById || "").trim() === String(user.id || "").trim() ||
            String(order.confirmedById || "").trim() === String(user.id || "").trim()
          )
      );
      const overdueOwned = backlogOrders.filter((order) => isPastDeliveryDate(order.deliveryDate, todayKey));

      return {
        id: user.id,
        name: user.name || user.username || "-",
        createdToday: createdOrders.filter((order) => isSameOperationalDay(order.lineReceivedAt || order.createdAt, todayKey)).length,
        confirmedToday: confirmedOrders.filter((order) => isSameOperationalDay(order.confirmedAt, todayKey)).length,
        backlog: backlogOrders.length,
        overdue: overdueOwned.length,
        deliveredToday: deliveredToday.filter(
          (order) =>
            String(order.createdById || "").trim() === String(user.id || "").trim() ||
            String(order.confirmedById || "").trim() === String(user.id || "").trim()
        ).length,
        lastActivityAt: getLatestIso([
          ...createdOrders.map((order) => order.lineReceivedAt || order.createdAt),
          ...confirmedOrders.map((order) => order.confirmedAt),
          ...backlogOrders.map((order) => order.updatedAt),
        ]),
        throughputToday:
          createdOrders.filter((order) => isSameOperationalDay(order.lineReceivedAt || order.createdAt, todayKey)).length +
          confirmedOrders.filter((order) => isSameOperationalDay(order.confirmedAt, todayKey)).length,
      };
    })
    .sort((left, right) => {
      if (right.throughputToday !== left.throughputToday) return right.throughputToday - left.throughputToday;
      if (right.backlog !== left.backlog) return right.backlog - left.backlog;
      return String(left.name || "").localeCompare(String(right.name || ""));
    });

  const warehousePerformance = warehouseUsers
    .map((user) => {
      const preparedOrders = allOrders.filter((order) => String(order.preparedById || "").trim() === String(user.id || "").trim());
      const activePrepared = enrichedOpenOrders.filter(
        (order) =>
          String(order.preparedById || "").trim() === String(user.id || "").trim() &&
          [STATUS.PREPARED, STATUS.ASSIGNED, STATUS.OUT_FOR_DELIVERY].includes(order.status)
      );

      return {
        id: user.id,
        name: user.name || user.username || "-",
        preparedToday: preparedOrders.filter((order) => isSameOperationalDay(order.preparedAt, todayKey)).length,
        activePrepared: activePrepared.length,
        deliveredToday: deliveredToday.filter((order) => String(order.preparedById || "").trim() === String(user.id || "").trim()).length,
        exceptionToday: exceptionToday.filter((order) => String(order.preparedById || "").trim() === String(user.id || "").trim()).length,
        lastActivityAt: getLatestIso([
          ...preparedOrders.map((order) => order.preparedAt),
          ...activePrepared.map((order) => order.updatedAt),
        ]),
        throughputToday: preparedOrders.filter((order) => isSameOperationalDay(order.preparedAt, todayKey)).length,
      };
    })
    .sort((left, right) => {
      if (right.throughputToday !== left.throughputToday) return right.throughputToday - left.throughputToday;
      if (right.activePrepared !== left.activePrepared) return right.activePrepared - left.activePrepared;
      return String(left.name || "").localeCompare(String(right.name || ""));
    });

  const managerAlerts = [
    {
      key: "overdue",
      label: "งานเลยกำหนดส่ง",
      count: overdueOrders.length,
      tone: overdueOrders.length ? "danger" : "success",
      owner: "ฝ่ายขาย / คลัง / จัดรถ",
      detail: overdueOrders.length
        ? "มี PO ที่วันส่งผ่านไปแล้วแต่ยังไม่ปิดงานหรือยังไม่เข้า route history"
        : "ไม่มีงานเปิดที่เลยกำหนดส่ง",
      href: "/line-orders",
      hrefLabel: "เปิดคิวรับเข้า",
    },
    {
      key: "dispatch_wait",
      label: "พร้อมจัดรถแต่ยังไม่มอบหมาย",
      count: preparedUnassigned.length,
      tone: preparedUnassigned.length ? "warning" : "success",
      owner: "ทีมจัดรถ",
      detail: preparedUnassigned.length
        ? "คลังเตรียมสินค้าแล้ว แต่ยังไม่มีคนขับหรือแผนวิ่งสำหรับออกส่ง"
        : "ไม่มีงานพร้อมส่งที่ค้างรอมอบหมาย",
      href: "/send-orders",
      hrefLabel: "เปิดหน้าวางแผนส่ง",
    },
    {
      key: "data_risk",
      label: "คำสั่งซื้อข้อมูลเสี่ยง",
      count: dataAlerts.length,
      tone: dataAlerts.length ? "warning" : "success",
      owner: "ฝ่ายขาย / จัดรถ",
      detail: dataAlerts.length
        ? "มีข้อมูลสำคัญไม่ครบ เช่น พิกัด แผนที่ หรือข้อมูลติดต่อที่กระทบการส่ง"
        : "ไม่พบคำสั่งซื้อที่ข้อมูลเสี่ยงในตอนนี้",
      href: "/send-orders",
      hrefLabel: "ตรวจสอบข้อมูลส่ง",
    },
    {
      key: "today_exception",
      label: "งานมีปัญหาวันนี้",
      count: exceptionToday.length,
      tone: exceptionToday.length ? "danger" : "success",
      owner: "คนขับ / ฝ่ายขาย",
      detail: exceptionToday.length
        ? "วันนี้มีงานส่งไม่สำเร็จหรือคืนสินค้าที่ผู้จัดการควรติดตามต่อ"
        : "วันนี้ยังไม่พบงาน exception จากหน้างาน",
      href: "/return-history",
      hrefLabel: "เปิดประวัติการยกเลิก",
    },
  ];

  const departmentBoard = [
    {
      key: "sales",
      team: "ฝ่ายขาย",
      owner: "รับเข้า / ยืนยัน PO",
      queueNow: intakeQueue.length,
      completedToday: allOrders.filter((order) => isSameOperationalDay(order.confirmedAt, todayKey)).length,
      riskCount: enrichedOpenOrders.filter(
        (order) => [STATUS.LINE_RECEIVED, STATUS.CONFIRMED].includes(order.status) && isPastDeliveryDate(order.deliveryDate, todayKey)
      ).length,
      note:
        intakeQueue.length > 0
          ? "ยังมี PO ที่รอเช็กข้อมูลและยืนยันก่อนส่งต่อคลัง"
          : "คิวฝ่ายขายโล่ง ไม่มี PO รอยืนยัน",
    },
    {
      key: "warehouse",
      team: "คลังสินค้า",
      owner: "เตรียมสินค้า",
      queueNow: confirmedQueue.length,
      completedToday: allOrders.filter((order) => isSameOperationalDay(order.preparedAt, todayKey)).length,
      riskCount: confirmedQueue.filter((order) => isPastDeliveryDate(order.deliveryDate, todayKey)).length,
      note:
        confirmedQueue.length > 0
          ? "มีงานยืนยันแล้วที่ยังรอหยิบ/แพ็กสินค้า"
          : "คิวคลังพร้อม ไม่มีงานยืนยันที่ค้างเตรียม",
    },
    {
      key: "dispatch",
      team: "จัดรถ",
      owner: "วางแผน / มอบหมาย",
      queueNow: preparedUnassigned.length + assignedWaiting.length,
      completedToday: allOrders.filter((order) => isSameOperationalDay(order.assignedAt, todayKey)).length,
      riskCount: preparedUnassigned.filter((order) => order.deliveryDate === todayKey || isPastDeliveryDate(order.deliveryDate, todayKey)).length,
      note:
        preparedUnassigned.length > 0
          ? "มีงานพร้อมส่งที่ยังไม่ถูกจับคู่คนขับหรือจัดลำดับ route"
          : "งานพร้อมส่งถูกดันเข้าคิววิ่งครบแล้ว",
    },
    {
      key: "delivery",
      team: "ขนส่ง",
      owner: "วิ่งงาน / ปิดผล",
      queueNow: todayOrders.filter((order) => [STATUS.ASSIGNED, STATUS.OUT_FOR_DELIVERY].includes(order.status)).length,
      completedToday: completedToday.length,
      riskCount: exceptionToday.length,
      note:
        inProgress.length > 0
          ? "มีงานกำลังวิ่งอยู่ ต้องติดตามปิดผลและเวลาเข้ารอบ"
          : "ไม่มีรถที่กำลังวิ่งสดในตอนนี้",
    },
  ];

  return {
    todayKey,
    counts: {
      openOrders: enrichedOpenOrders.length,
      archivedOrders: enrichedArchivedOrders.length,
      dueToday: dueTodayAll.length,
      overdueOpen: overdueOrders.length,
      lineReceived: enrichedOpenOrders.filter((order) => order.status === STATUS.LINE_RECEIVED).length,
      confirmed: enrichedOpenOrders.filter((order) => order.status === STATUS.CONFIRMED).length,
      prepared: enrichedOpenOrders.filter((order) => order.status === STATUS.PREPARED).length,
      assigned: enrichedOpenOrders.filter((order) => order.status === STATUS.ASSIGNED).length,
      outForDelivery: inProgress.length,
      readyToAssign: preparedUnassigned.length,
      deliveredToday: deliveredToday.length,
      exceptionToday: exceptionToday.length,
      completedToday: completedToday.length,
      closeRateToday: percentOf(completedToday.length, dueTodayAll.length),
    },
    managerAlerts,
    departmentBoard,
    salesPerformance,
    warehousePerformance,
    driverPerformance,
    intakeQueue: intakeQueue.slice(0, 6),
    overdueOrders: overdueOrders.slice(0, 6),
    preparedUnassigned: preparedUnassigned.slice(0, 6),
    inProgress: inProgress.slice(0, 6),
    exceptions: exceptions.slice(0, 6),
    dataAlerts: dataAlerts.slice(0, 6),
    todayArchived: todayArchived.slice(0, 6),
  };
}

const PRODUCT_CATEGORY_FIELDS = [
  "category",
  "category_name",
  "categoryName",
  "main_category",
  "mainCategory",
  "department",
  "group_name",
  "groupName",
  "product_group",
  "productGroup",
  "type",
  "section",
];
const PRODUCT_SUBCATEGORY_FIELDS = [
  "subcategory",
  "subcategory_name",
  "subcategoryName",
  "sub_category",
  "subCategory",
  "family",
  "sub_group",
  "subgroup",
  "class_name",
];
const PRODUCT_IMAGE_FIELDS = [
  "image_url",
  "imageUrl",
  "image",
  "thumbnail",
  "thumbnail_url",
  "thumbnailUrl",
  "photo",
  "photo_url",
  "photoUrl",
  "cover_image",
  "coverImage",
];
const PRODUCT_FEATURED_FIELDS = ["featured", "is_featured", "isFeatured", "featured_flag", "featuredFlag"];
const PRODUCT_PROMOTION_FIELDS = [
  "promotion",
  "is_promotion",
  "isPromotion",
  "promotion_flag",
  "promotionFlag",
  "promo",
  "is_promo",
];
const PRODUCT_CREATED_FIELDS = ["created_at", "createdAt", "created_on", "createdOn", "created_date", "createdDate"];
const PRODUCT_UPDATED_FIELDS = ["updated_at", "updatedAt", "updated_on", "updatedOn", "modified_at", "modifiedAt"];

function getProductRaw(product = {}) {
  return product?.raw && typeof product.raw === "object" ? product.raw : {};
}

function hasProductField(product = {}, fields = []) {
  const raw = getProductRaw(product);
  return fields.some(
    (field) =>
      Object.prototype.hasOwnProperty.call(product, field) || Object.prototype.hasOwnProperty.call(raw, field)
  );
}

function pickProductField(product = {}, fields = []) {
  const raw = getProductRaw(product);
  for (const field of fields) {
    const directValue = product?.[field];
    if (directValue !== undefined && directValue !== null && String(directValue).trim() !== "") return directValue;
    const rawValue = raw?.[field];
    if (rawValue !== undefined && rawValue !== null && String(rawValue).trim() !== "") return rawValue;
  }
  return "";
}

function parseBooleanish(value) {
  if (typeof value === "boolean") return value;
  if (typeof value === "number") return value > 0;
  const normalized = String(value || "")
    .trim()
    .toLowerCase();
  if (!normalized) return false;
  if (["1", "true", "yes", "y", "active", "enabled", "on"].includes(normalized)) return true;
  if (["0", "false", "no", "n", "inactive", "disabled", "off"].includes(normalized)) return false;
  return false;
}

function buildDayRange(dayKey, days = 7) {
  if (!dayKey) return [];
  const start = new Date(`${dayKey}T00:00:00+07:00`);
  if (Number.isNaN(start.getTime())) return [];

  return Array.from({ length: days }, (_, index) => {
    const date = new Date(start);
    date.setUTCDate(start.getUTCDate() - (days - 1 - index));
    return new Intl.DateTimeFormat("sv-SE", { timeZone: "Asia/Bangkok" }).format(date);
  });
}

function sortByLatestTimestamp(items = [], getter) {
  return [...items].sort((left, right) => {
    const leftValue = Date.parse(getter(left) || "");
    const rightValue = Date.parse(getter(right) || "");
    if (Number.isFinite(leftValue) && Number.isFinite(rightValue) && rightValue !== leftValue) return rightValue - leftValue;
    if (Number.isFinite(rightValue)) return 1;
    if (Number.isFinite(leftValue)) return -1;
    return 0;
  });
}

function getOrderNextAction(order = {}) {
  if (order.issues?.length) return order.issues[0].message;
  if (order.status === STATUS.LINE_RECEIVED) return "ฝ่ายขายต้องยืนยัน PO ก่อนส่งต่อคลัง";
  if (order.status === STATUS.CONFIRMED) return "รอคลังเตรียมสินค้า";
  if (order.status === STATUS.PREPARED) return "รอจัดรถและมอบหมายคนขับ";
  if (order.status === STATUS.ASSIGNED) return "รอเริ่มรอบส่ง";
  if (order.status === STATUS.OUT_FOR_DELIVERY) return "ติดตามผลจากคนขับและเวลาปิดจุดส่ง";
  if (order.finalStatus === STATUS.DELIVERED) return "ปิดงานแล้วและพร้อมตรวจประวัติ";
  if ([STATUS.FAILED, STATUS.RETURNED].includes(order.finalStatus)) return "ต้องติดตามเคสปัญหาและการยกเลิก";
  return STATUS_LABELS[order.status] || "ติดตามความคืบหน้ารายการนี้";
}

function buildCatalogInsights(products = []) {
  const normalizedProducts = products.map((product) => {
    const category = String(pickProductField(product, PRODUCT_CATEGORY_FIELDS) || "").trim();
    const subcategory = String(pickProductField(product, PRODUCT_SUBCATEGORY_FIELDS) || "").trim();
    const imageUrl = String(pickProductField(product, PRODUCT_IMAGE_FIELDS) || "").trim();
    const createdAt = String(pickProductField(product, PRODUCT_CREATED_FIELDS) || "").trim();
    const updatedAt = String(pickProductField(product, PRODUCT_UPDATED_FIELDS) || "").trim();
    const lastChangedAt = updatedAt || createdAt;

    return {
      ...product,
      category,
      subcategory,
      imageUrl,
      createdAt,
      updatedAt,
      lastChangedAt,
      hasCategoryField: hasProductField(product, PRODUCT_CATEGORY_FIELDS),
      hasSubcategoryField: hasProductField(product, PRODUCT_SUBCATEGORY_FIELDS),
      hasImageField: hasProductField(product, PRODUCT_IMAGE_FIELDS),
      hasFeaturedField: hasProductField(product, PRODUCT_FEATURED_FIELDS),
      hasPromotionField: hasProductField(product, PRODUCT_PROMOTION_FIELDS),
      hasCatalogTimeField:
        hasProductField(product, PRODUCT_CREATED_FIELDS) || hasProductField(product, PRODUCT_UPDATED_FIELDS),
      isFeatured: parseBooleanish(pickProductField(product, PRODUCT_FEATURED_FIELDS)),
      isPromotion: parseBooleanish(pickProductField(product, PRODUCT_PROMOTION_FIELDS)),
    };
  });

  const totalProducts = normalizedProducts.length;
  const pricedProducts = normalizedProducts.filter((product) => Number(product.price || 0) > 0);
  const outOfStockItems = normalizedProducts.filter((product) => Number(product.availableQty || 0) <= 0);
  const lowStockItems = normalizedProducts.filter((product) => {
    const availableQty = Number(product.availableQty || 0);
    return availableQty > 0 && availableQty <= 5;
  });
  const expiringItems = normalizedProducts.filter((product) => Number(product.batchSummary?.warning || 0) > 0);
  const categoryAvailable = normalizedProducts.some((product) => product.hasCategoryField);
  const subcategoryAvailable = normalizedProducts.some((product) => product.hasSubcategoryField);
  const imageAvailable = normalizedProducts.some((product) => product.hasImageField);
  const featuredAvailable = normalizedProducts.some((product) => product.hasFeaturedField);
  const promotionAvailable = normalizedProducts.some((product) => product.hasPromotionField);
  const catalogTimeAvailable = normalizedProducts.some((product) => product.hasCatalogTimeField);
  const categories = [...new Set(normalizedProducts.map((product) => product.category).filter(Boolean))];
  const subcategories = [...new Set(normalizedProducts.map((product) => product.subcategory).filter(Boolean))];
  const missingPriceItems = normalizedProducts.filter((product) => Number(product.price || 0) <= 0);
  const missingCategoryItems = categoryAvailable
    ? normalizedProducts.filter((product) => !product.category)
    : [];
  const missingImageItems = imageAvailable
    ? normalizedProducts.filter((product) => !product.imageUrl)
    : [];
  const reviewItems = normalizedProducts
    .map((product) => {
      const reasons = [];
      if (Number(product.price || 0) <= 0) reasons.push("ยังไม่ตั้งราคา");
      if (categoryAvailable && !product.category) reasons.push("ยังไม่มีหมวดหมู่");
      if (imageAvailable && !product.imageUrl) reasons.push("ยังไม่มีรูปสินค้า");
      if (Number(product.availableQty || 0) < 0) reasons.push("สต็อกขายได้ติดลบ");
      if (Number(product.batchSummary?.expired || 0) > 0) reasons.push("มี lot หมดอายุค้าง");
      return { ...product, reasons };
    })
    .filter((product) => product.reasons.length)
    .sort((left, right) => right.reasons.length - left.reasons.length || String(left.code || "").localeCompare(String(right.code || "")));

  const topCategories = categoryAvailable
    ? Object.entries(
        normalizedProducts.reduce((acc, product) => {
          if (!product.category) return acc;
          acc[product.category] = (acc[product.category] || 0) + 1;
          return acc;
        }, {})
      )
        .map(([label, value]) => ({ label, value }))
        .sort((left, right) => right.value - left.value || String(left.label).localeCompare(String(right.label)))
        .slice(0, 6)
    : [];
  const recentCatalogChanges = catalogTimeAvailable
    ? sortByLatestTimestamp(
        normalizedProducts.filter((product) => product.lastChangedAt),
        (item) => item.lastChangedAt
      )
        .slice(0, 8)
        .map((product) => ({
          id: product.id || product.code,
          code: product.code,
          name: product.name,
          category: product.category,
          changedAt: product.lastChangedAt,
          changeType: product.updatedAt ? "อัปเดตสินค้า" : "เพิ่มสินค้า",
        }))
    : [];

  return {
    totalProducts,
    totalSellableQty: normalizedProducts.reduce((sum, product) => sum + Number(product.stockOnHand || 0), 0),
    totalAvailableQty: normalizedProducts.reduce((sum, product) => sum + Number(product.availableQty || 0), 0),
    pricedProducts: pricedProducts.length,
    missingPriceCount: missingPriceItems.length,
    lowStockCount: lowStockItems.length,
    outOfStockCount: outOfStockItems.length,
    expiringCount: expiringItems.length,
    reviewCount: reviewItems.length,
    categoryAvailable,
    subcategoryAvailable,
    imageAvailable,
    featuredAvailable,
    promotionAvailable,
    catalogTimeAvailable,
    categoriesCount: categories.length,
    subcategoriesCount: subcategories.length,
    missingCategoryCount: missingCategoryItems.length,
    missingImageCount: missingImageItems.length,
    featuredCount: featuredAvailable ? normalizedProducts.filter((product) => product.isFeatured).length : null,
    promotionCount: promotionAvailable ? normalizedProducts.filter((product) => product.isPromotion).length : null,
    lowStockItems: sortByLatestTimestamp(
      [...lowStockItems, ...outOfStockItems].slice(0, 50),
      (item) => item.updatedAt || item.createdAt
    )
      .sort((left, right) => Number(left.availableQty || 0) - Number(right.availableQty || 0))
      .slice(0, 8),
    reviewItems: reviewItems.slice(0, 8),
    topCategories,
    recentCatalogChanges,
    placeholders: [
      !categoryAvailable ? "หมวดหมู่สินค้า" : "",
      !subcategoryAvailable ? "หมวดย่อยสินค้า" : "",
      !imageAvailable ? "รูปสินค้า" : "",
      !featuredAvailable ? "สถานะ featured" : "",
      !promotionAvailable ? "สถานะโปรโมชัน" : "",
      !catalogTimeAvailable ? "เวลาเพิ่ม/แก้ไขสินค้า" : "",
    ].filter(Boolean),
  };
}

function buildRecentActivity(logs = [], allOrders = []) {
  const recentLogs = sortByLatestTimestamp(logs, (item) => item.timestamp)
    .slice(0, 8)
    .map((item) => ({
      id: item.id,
      title: item.note || "อัปเดต workflow",
      actor: item.actedByName || item.actedByRole || "ระบบ",
      role: item.actedByRole || "",
      time: item.timestamp,
      orderId: item.orderId,
      status: item.status,
    }));

  const recentOrders = sortByLatestTimestamp(allOrders, (item) => item.updatedAt || item.routeArchivedAt || item.createdAt)
    .slice(0, 8)
    .map((item) => ({
      poNumber: item.poNumber,
      customerName: item.customerName,
      amount: item.totals?.amount || 0,
      status: item.status,
      updatedAt: item.updatedAt || item.routeArchivedAt || item.createdAt,
      nextAction: getOrderNextAction(item),
    }));

  return {
    recentLogs,
    recentOrders,
  };
}

function buildOrderStatusBreakdown(allOrders = [], openOrders = [], archivedOrders = []) {
  const exceptionCount = allOrders.filter((order) =>
    [STATUS.FAILED, STATUS.RETURNED].includes(order.finalStatus || order.status)
  ).length;
  const deliveredCount = allOrders.filter((order) => (order.finalStatus || order.status) === STATUS.DELIVERED).length;

  return [
    { key: STATUS.LINE_RECEIVED, label: "รับเข้า", value: openOrders.filter((order) => order.status === STATUS.LINE_RECEIVED).length, tone: "warning" },
    { key: STATUS.CONFIRMED, label: "ยืนยันแล้ว", value: openOrders.filter((order) => order.status === STATUS.CONFIRMED).length, tone: "brand" },
    { key: STATUS.PREPARED, label: "เตรียมแล้ว", value: openOrders.filter((order) => order.status === STATUS.PREPARED).length, tone: "brand" },
    { key: STATUS.ASSIGNED, label: "มอบหมายแล้ว", value: openOrders.filter((order) => order.status === STATUS.ASSIGNED).length, tone: "brand" },
    { key: STATUS.OUT_FOR_DELIVERY, label: "กำลังส่ง", value: openOrders.filter((order) => order.status === STATUS.OUT_FOR_DELIVERY).length, tone: "warning" },
    { key: STATUS.DELIVERED, label: "ส่งสำเร็จ", value: deliveredCount, tone: "success" },
    { key: "EXCEPTION", label: "มีปัญหา", value: exceptionCount, tone: "danger" },
    { key: STATUS.ARCHIVED, label: "เข้า history", value: archivedOrders.length, tone: "slate" },
  ];
}

function buildActivityTrend(allOrders = [], dayKey = "") {
  return buildDayRange(dayKey, 7).map((currentDay) => {
    const received = allOrders.filter((order) => isSameOperationalDay(order.lineReceivedAt || order.createdAt, currentDay)).length;
    const completed = allOrders.filter((order) =>
      isSameOperationalDay(order.routeArchivedAt || order.routeFinishedAt || order.dispatchDeliveredAt, currentDay)
    ).length;
    const exceptions = allOrders.filter(
      (order) =>
        [STATUS.FAILED, STATUS.RETURNED].includes(order.finalStatus || order.status) &&
        isSameOperationalDay(order.routeArchivedAt || order.routeFinishedAt || order.dispatchDeliveredAt, currentDay)
    ).length;

    return {
      dayKey: currentDay,
      received,
      completed,
      exceptions,
    };
  });
}

export function buildManagerDashboardModel({
  orders = [],
  users = [],
  logs = [],
  products = [],
  productLoading = false,
  productError = "",
} = {}) {
  const operational = buildDashboardModel(orders, users);
  const openOrders = getOpenOrders(orders).map(enrichOrder);
  const archivedOrders = getArchivedOrders(orders).map(enrichOrder);
  const allOrders = [...openOrders, ...archivedOrders];
  const catalog = buildCatalogInsights(products);
  const recent = buildRecentActivity(logs, allOrders);

  const summaryCards = [
    {
      label: "สินค้าในระบบ",
      value: productLoading ? "..." : catalog.totalProducts,
      hint: productLoading
        ? "กำลังโหลดข้อมูลจาก stock source"
        : productError
          ? "โหลดข้อมูลสินค้าไม่สำเร็จ"
          : `พร้อมขาย ${catalog.totalAvailableQty.toFixed(1)} หน่วย`,
      tone: "brand",
    },
    {
      label: "หมวดหมู่ / หมวดย่อย",
      value: productLoading ? "..." : catalog.categoryAvailable ? `${catalog.categoriesCount} / ${catalog.subcategoriesCount}` : "-",
      hint: catalog.categoryAvailable ? "นับจาก source products ที่เชื่อมอยู่ตอนนี้" : "ยังไม่มี field หมวดหมู่จาก source products",
      tone: catalog.categoryAvailable ? "success" : "slate",
    },
    {
      label: "ออเดอร์ทั้งหมด",
      value: allOrders.length,
      hint: `คิวเปิด ${operational.counts.openOrders} | เข้า history ${operational.counts.archivedOrders}`,
      tone: "brand",
    },
    {
      label: "งานที่ยังเปิดอยู่",
      value: operational.counts.openOrders,
      hint: `ถึงกำหนดวันนี้ ${operational.counts.dueToday} | เลยกำหนด ${operational.counts.overdueOpen}`,
      tone: operational.counts.overdueOpen ? "warning" : "brand",
    },
    {
      label: "งานที่ปิดแล้ว",
      value: operational.counts.archivedOrders,
      hint: `วันนี้ปิด ${operational.counts.completedToday} | close rate ${operational.counts.closeRateToday}%`,
      tone: "success",
    },
    {
      label: "สินค้า low stock",
      value: productLoading ? "..." : catalog.lowStockCount,
      hint: productLoading ? "กำลังประเมินสต็อกขายได้" : "คงเหลือขายได้ 0.1 ถึง 5.0 หน่วย",
      tone: catalog.lowStockCount ? "warning" : "success",
    },
    {
      label: "สินค้าหมดสต็อก",
      value: productLoading ? "..." : catalog.outOfStockCount,
      hint: productLoading ? "กำลังตรวจของที่ขายไม่ได้" : "available qty น้อยกว่าหรือเท่ากับ 0",
      tone: catalog.outOfStockCount ? "danger" : "success",
    },
    {
      label: "รายการต้องทบทวน",
      value: productLoading ? "..." : catalog.reviewCount,
      hint: productLoading ? "กำลังตรวจราคา/หมวดหมู่/รูป" : "เช่น ยังไม่ตั้งราคา ไม่มีหมวดหมู่ หรือ lot หมดอายุ",
      tone: catalog.reviewCount ? "warning" : "success",
    },
  ];

  const productAlerts = [
    {
      key: "low_stock",
      label: "สินค้าสต็อกต่ำ",
      count: catalog.lowStockCount,
      tone: catalog.lowStockCount ? "warning" : "success",
      owner: "ราคา / คลัง",
      detail: "สินค้าขายได้เหลือน้อยและอาจกระทบการรับ PO ใหม่",
      href: "/pricing",
      hrefLabel: "เปิดหน้าราคาและสต็อก",
    },
    {
      key: "out_of_stock",
      label: "สินค้าหมดสต็อก",
      count: catalog.outOfStockCount,
      tone: catalog.outOfStockCount ? "danger" : "success",
      owner: "คลัง / ฝ่ายขาย",
      detail: "สินค้าที่ available qty ไม่พอขายและควรหลีกเลี่ยงการรับงานเพิ่ม",
      href: "/pricing",
      hrefLabel: "ตรวจสินค้าเสี่ยง",
    },
    {
      key: "price_missing",
      label: "สินค้ายังไม่ตั้งราคา",
      count: catalog.missingPriceCount,
      tone: catalog.missingPriceCount ? "warning" : "success",
      owner: "ผู้จัดการ / ราคา",
      detail: "สินค้าใน source ที่ยังไม่มีราคาขายในระบบ Sophon Driver",
      href: "/pricing",
      hrefLabel: "ตั้งราคาสินค้า",
    },
    {
      key: "catalog_review",
      label: "สินค้าข้อมูลไม่ครบ",
      count: catalog.reviewCount,
      tone: catalog.reviewCount ? "warning" : "success",
      owner: "ผู้จัดการระบบสินค้า",
      detail: "รวมรายการที่ยังต้องทบทวน เช่น ไม่มีราคา ไม่มีหมวดหมู่ หรือมี lot หมดอายุ",
      href: "/pricing",
      hrefLabel: "เปิดรายการทบทวน",
    },
  ];

  const attentionCards = [...operational.managerAlerts, ...productAlerts]
    .filter((item) => Number(item.count || 0) > 0)
    .slice(0, 8);

  const quickActions = [
    { label: "รับออเดอร์ใหม่", hint: "เปิดหน้ารับคำสั่งซื้อจาก Line", href: "/line-orders", tone: "brand" },
    { label: "ติดตามคลังสินค้า", hint: "เช็ก PO ที่รอเตรียมสินค้า", href: "/po-status", tone: "slate" },
    { label: "วางแผนรอบส่ง", hint: "มอบหมายคนขับและจัดลำดับ route", href: "/send-orders", tone: "slate" },
    { label: "ติดตามงานคนขับ", hint: "ดูงานที่กำลังส่งและผลลัพธ์หน้างาน", href: "/driver", tone: "slate" },
    { label: "ตรวจสต็อกและราคา", hint: "ดูสินค้าสต็อกต่ำ ตั้งราคา และเช็ก lot", href: "/pricing", tone: "warning" },
    { label: "จัดการพนักงาน", hint: "เพิ่มบัญชี staff และดูบทบาทใช้งาน", href: "/users", tone: "slate" },
  ];

  const futureModules = [
    "หมวดหมู่สินค้า",
    "โปรโมชัน / แบนเนอร์",
    "ศูนย์ลูกค้า / B2B",
  ];

  const catalogCoverage = [
    {
      label: "ราคาพร้อมใช้งาน",
      value: `${catalog.pricedProducts}/${catalog.totalProducts || 0}`,
      hint: "จำนวนสินค้าที่มีราคาขายในระบบแล้ว",
      tone: catalog.missingPriceCount ? "warning" : "success",
    },
    {
      label: "หมวดหมู่สินค้า",
      value: catalog.categoryAvailable ? catalog.categoriesCount : "-",
      hint: catalog.categoryAvailable ? "จำนวนหมวดหลักที่ใช้งานอยู่" : "ยังไม่พบ field หมวดหมู่ใน source",
      tone: catalog.categoryAvailable ? "brand" : "slate",
    },
    {
      label: "หมวดย่อยสินค้า",
      value: catalog.subcategoryAvailable ? catalog.subcategoriesCount : "-",
      hint: catalog.subcategoryAvailable ? "จำนวนหมวดย่อยที่เชื่อมได้จริง" : "ยังไม่พบ field หมวดย่อยใน source",
      tone: catalog.subcategoryAvailable ? "brand" : "slate",
    },
    {
      label: "featured / promotion",
      value:
        catalog.featuredAvailable || catalog.promotionAvailable
          ? `${catalog.featuredCount ?? 0} / ${catalog.promotionCount ?? 0}`
          : "-",
      hint:
        catalog.featuredAvailable || catalog.promotionAvailable
          ? "จำนวนสินค้าที่ถูกติดสถานะ featured และ promotion"
          : "ยังไม่มี field featured หรือ promotion ใน source",
      tone: catalog.featuredAvailable || catalog.promotionAvailable ? "brand" : "slate",
    },
    {
      label: "รูปสินค้า",
      value: catalog.imageAvailable ? `${catalog.totalProducts - catalog.missingImageCount}/${catalog.totalProducts || 0}` : "-",
      hint: catalog.imageAvailable ? "จำนวนสินค้าที่มีรูปพร้อมใช้งาน" : "ยังไม่พบ field รูปสินค้าใน source",
      tone: catalog.imageAvailable && catalog.missingImageCount ? "warning" : catalog.imageAvailable ? "success" : "slate",
    },
    {
      label: "เวลาเปลี่ยนแปลงสินค้า",
      value: catalog.catalogTimeAvailable ? "พร้อม" : "-",
      hint: catalog.catalogTimeAvailable ? "มี timestamp สำหรับติดตามการเปลี่ยนแปลงล่าสุด" : "ยังไม่มี created_at / updated_at ใน source",
      tone: catalog.catalogTimeAvailable ? "success" : "slate",
    },
  ];

  return {
    generatedAt: new Date().toISOString(),
    todayKey: operational.todayKey,
    summaryCards,
    attentionCards,
    quickActions,
    futureModules,
    orderStatusBreakdown: buildOrderStatusBreakdown(allOrders, openOrders, archivedOrders),
    activityTrend: buildActivityTrend(allOrders, operational.todayKey),
    productHealthBreakdown: [
      { key: "priced", label: "ตั้งราคาแล้ว", value: catalog.pricedProducts, tone: "success" },
      { key: "missing_price", label: "ยังไม่ตั้งราคา", value: catalog.missingPriceCount, tone: "warning" },
      { key: "low_stock", label: "สต็อกต่ำ", value: catalog.lowStockCount, tone: "warning" },
      { key: "out_of_stock", label: "หมดสต็อก", value: catalog.outOfStockCount, tone: "danger" },
      { key: "expiring", label: "lot ใกล้หมดอายุ", value: catalog.expiringCount, tone: "warning" },
    ],
    catalogCoverage,
    catalog,
    recentActivity: recent.recentLogs,
    recentOrders: recent.recentOrders,
    recentCatalogChanges: catalog.recentCatalogChanges,
    productLoading,
    productError,
    operational,
  };
}

function buildArchivedGroups(orders = [], predicate = () => true) {
  const groups = getArchivedOrders(orders)
    .map(enrichOrder)
    .filter((order) => predicate(order))
    .reduce((acc, order) => {
      const key = String(order.deliveryDate || order.routeArchivedAt || "ไม่ระบุวันส่ง");
      if (!acc[key]) acc[key] = [];
      acc[key].push(order);
      return acc;
    }, {});

  return Object.entries(groups)
    .map(([date, items]) => {
      const orderedItems = items.sort((left, right) => stableSort(left, right));
      const distanceSummary = summarizeHistoryRoutes(orderedItems);
      const hasExceptions = orderedItems.some((item) => item.finalStatus && item.finalStatus !== STATUS.DELIVERED);
      const incompleteArchive = orderedItems.some((item) => !item.finalStatus);

      return {
        date,
        items: orderedItems.map((item) => {
          const itemMetric = distanceSummary.itemLookup[buildHistoryItemKey(item)] || {};
          return {
            ...item,
            routeIndex: itemMetric.routeIndex ?? null,
            legDistanceKm: itemMetric.legDistanceKm ?? null,
            previousStopLabel: itemMetric.previousStopLabel || APP_CONFIG.hub.name,
            legFromStepLabel: itemMetric.legFromStepLabel || APP_CONFIG.hub.name,
            legToStepLabel: itemMetric.legToStepLabel || "",
            routeMetric: distanceSummary.routeLookup[buildHistoryRouteKey(item)] || null,
          };
        }),
        totals: orderedItems.reduce(
          (acc, item) => {
            acc.quantity += item.totals.quantity;
            acc.amount += item.totals.amount;
            return acc;
          },
          { quantity: 0, amount: 0 }
        ),
        distanceSummary,
        hasExceptions,
        incompleteArchive,
      };
    })
    .sort((left, right) => String(right.date).localeCompare(String(left.date)));
}

export function buildHistoryGroups(orders = []) {
  return buildArchivedGroups(orders, (order) => getCompletedStatus(order) !== STATUS.RETURNED);
}

export function buildReturnedHistoryGroups(orders = [], completedStatus = STATUS.RETURNED) {
  const groups = orders
    .map(enrichOrder)
    .filter((order) => getCompletedStatus(order) === completedStatus)
    .reduce((acc, order) => {
      const key = String(order.deliveryDate || order.routeArchivedAt || "ไม่ระบุวันส่ง");
      if (!acc[key]) acc[key] = [];
      acc[key].push(order);
      return acc;
    }, {});

  return Object.entries(groups)
    .map(([date, items]) => {
      const orderedItems = items.sort((left, right) => stableSort(left, right));
      const distanceSummary = summarizeHistoryRoutes(orderedItems);

      return {
        date,
        items: orderedItems.map((item) => {
          const itemMetric = distanceSummary.itemLookup[buildHistoryItemKey(item)] || {};
          return {
            ...item,
            routeIndex: itemMetric.routeIndex ?? null,
            legDistanceKm: itemMetric.legDistanceKm ?? null,
            previousStopLabel: itemMetric.previousStopLabel || APP_CONFIG.hub.name,
            legFromStepLabel: itemMetric.legFromStepLabel || APP_CONFIG.hub.name,
            legToStepLabel: itemMetric.legToStepLabel || "",
            routeMetric: distanceSummary.routeLookup[buildHistoryRouteKey(item)] || null,
          };
        }),
        totals: orderedItems.reduce(
          (acc, item) => {
            acc.quantity += item.totals.quantity;
            acc.amount += item.totals.amount;
            return acc;
          },
          { quantity: 0, amount: 0 }
        ),
        distanceSummary,
        hasExceptions: true,
        incompleteArchive: orderedItems.some((item) => !isArchived(item)),
      };
    })
    .sort((left, right) => String(right.date).localeCompare(String(left.date)));
}
