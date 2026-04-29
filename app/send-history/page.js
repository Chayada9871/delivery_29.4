"use client";

import { useEffect, useMemo, useState } from "react";
import { AppShell } from "@/components/ui/Shell";
import { SectionCard, StatCard } from "@/components/ui/Cards";
import { EmptyState } from "@/components/ui/EmptyState";
import { StatusBadge, ToneBadge } from "@/components/ui/Badge";
import { useAppState } from "@/lib/app-state";
import { STATUS } from "@/lib/config";
import { buildHistoryGroups } from "@/lib/selectors";
import { buildMapRouteDistanceSummary, resolveMapRouteDistanceSummary } from "@/lib/maps";
import { formatCurrency, formatDate, formatDateTime, formatDistance } from "@/lib/format";

function formatDistanceLabel(value) {
  return value === null || value === undefined ? "-" : `${formatDistance(value)} กม.`;
}

function formatSignedDistance(value) {
  if (value === null || value === undefined) return "-";
  const prefix = value > 0 ? "+" : value < 0 ? "-" : "";
  return `${prefix}${formatDistance(Math.abs(value))} กม.`;
}

function ExpandableText({ value, emptyText = "-", maxLength = 120 }) {
  const [expanded, setExpanded] = useState(false);
  const text = String(value || "").trim();

  if (!text) {
    return <div className="leading-6 text-slate-600">{emptyText}</div>;
  }

  const isLong = text.length > maxLength;
  const preview = isLong ? `${text.slice(0, maxLength).trimEnd()}...` : text;

  return (
    <div className="space-y-2">
      <div className={`leading-6 text-slate-600 ${expanded ? "break-all" : "break-words"}`}>
        {expanded ? text : preview}
      </div>
      {isLong ? (
        <button
          type="button"
          className="border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-100"
          onClick={() => setExpanded((current) => !current)}
        >
          {expanded ? "ย่อข้อความ" : "ดูเพิ่มเติม"}
        </button>
      ) : null}
    </div>
  );
}

function Notice({ message, tone = "success" }) {
  const classes =
    tone === "error"
      ? "border-rose-200 bg-rose-50 text-rose-700"
      : tone === "warning"
        ? "border-amber-200 bg-amber-50 text-amber-700"
        : "border-emerald-200 bg-emerald-50 text-emerald-700";

  return <div className={`border px-4 py-3 text-sm font-medium ${classes}`}>{message}</div>;
}

function buildHistoryRoadItemKey(item = {}) {
  const routeKey = String(item.routeMetric?.routeKey || item.deliveryDate || item.poNumber || "").trim();
  const historyId = String(item.historySnapshot?.historyId || item.poNumber || "").trim();
  return `${routeKey}::${historyId}::${item.routeIndex || ""}`;
}

function sortHistoryRouteItems(left = {}, right = {}) {
  const leftIndex = Number(left.routeIndex);
  const rightIndex = Number(right.routeIndex);

  if (Number.isFinite(leftIndex) && Number.isFinite(rightIndex) && leftIndex !== rightIndex) {
    return leftIndex - rightIndex;
  }

  return String(left.poNumber || "").localeCompare(String(right.poNumber || ""));
}

export default function SendHistoryPage() {
  const { state, markHistoryOrderReturned, isReady, refreshLineOrdersFromSupabase } = useAppState();
  const [selectedDate, setSelectedDate] = useState("ALL");
  const [notice, setNotice] = useState({ message: "", tone: "success" });
  const [busyPoNumber, setBusyPoNumber] = useState("");
  const [roadDistanceState, setRoadDistanceState] = useState({
    groupSummaries: {},
    routeSummaries: {},
    itemMetrics: {},
  });
  const historyGroups = useMemo(() => buildHistoryGroups(state.lineOrders), [state.lineOrders]);

  useEffect(() => {
    if (selectedDate === "ALL") return;
    if (historyGroups.some((group) => group.date === selectedDate)) return;
    setSelectedDate(historyGroups[0]?.date || "ALL");
  }, [historyGroups, selectedDate]);

  useEffect(() => {
    if (!isReady) return;
    void refreshLineOrdersFromSupabase();
  }, [isReady]);

  const visibleGroups = useMemo(
    () => (selectedDate === "ALL" ? historyGroups : historyGroups.filter((group) => group.date === selectedDate)),
    [historyGroups, selectedDate]
  );

  useEffect(() => {
    if (!visibleGroups.length) {
      setRoadDistanceState({ groupSummaries: {}, routeSummaries: {}, itemMetrics: {} });
      return;
    }

    let cancelled = false;

    const buildRoadState = (routeEntries) => {
      const routeSummaries = {};
      const itemMetrics = {};
      const routeKeysByGroup = {};

      routeEntries.forEach((entry) => {
        const sampleItem = entry.items[0];
        const actualDistanceKm = sampleItem?.routeMetric?.actualDistanceKm ?? null;

        routeSummaries[entry.routeKey] = {
          ...(sampleItem?.routeMetric || { routeKey: entry.routeKey }),
          outboundDistanceKm: entry.summary.outboundDistanceKm,
          returnDistanceKm: entry.summary.returnDistanceKm,
          plannedDistanceKm: entry.summary.totalDistanceKm,
          distanceVarianceKm:
            actualDistanceKm === null || entry.summary.totalDistanceKm === null
              ? null
              : actualDistanceKm - entry.summary.totalDistanceKm,
          distanceSource: entry.summary.distanceSource,
        };

        entry.items.forEach((item) => {
          itemMetrics[item.lookupKey] = entry.summary.stopMetricsByLookupKey[item.lookupKey] || null;
        });

        if (!routeKeysByGroup[entry.groupDate]) routeKeysByGroup[entry.groupDate] = [];
        routeKeysByGroup[entry.groupDate].push(entry.routeKey);
      });

      const groupSummaries = visibleGroups.reduce((acc, group) => {
        const routeKeys = routeKeysByGroup[group.date] || [];
        const plannedDistances = routeKeys
          .map((routeKey) => routeSummaries[routeKey]?.plannedDistanceKm)
          .filter((value) => Number.isFinite(value));
        const expectedDistanceKm = plannedDistances.length
          ? plannedDistances.reduce((sum, value) => sum + Number(value || 0), 0)
          : null;
        const actualDistanceKm = group.distanceSummary.actualDistanceKm;

        acc[group.date] = {
          ...group.distanceSummary,
          expectedDistanceKm,
          distanceVarianceKm:
            actualDistanceKm === null || expectedDistanceKm === null ? null : actualDistanceKm - expectedDistanceKm,
          incompleteExpectedRoutes: routeKeys.filter(
            (routeKey) => !Number.isFinite(routeSummaries[routeKey]?.plannedDistanceKm)
          ).length,
        };
        return acc;
      }, {});

      return { groupSummaries, routeSummaries, itemMetrics };
    };

    const routeEntries = visibleGroups.flatMap((group) => {
      const groupedItems = group.items.reduce((acc, item) => {
        const routeKey = String(item.routeMetric?.routeKey || `${group.date}::${item.poNumber || item.routeIndex || ""}`);
        if (!acc[routeKey]) acc[routeKey] = [];
        acc[routeKey].push({
          ...item,
          lookupKey: buildHistoryRoadItemKey(item),
        });
        return acc;
      }, {});

      return Object.entries(groupedItems).map(([routeKey, items]) => ({
        groupDate: group.date,
        routeKey,
        items: [...items].sort(sortHistoryRouteItems),
        summary: buildMapRouteDistanceSummary([...items].sort(sortHistoryRouteItems)),
      }));
    });

    setRoadDistanceState(buildRoadState(routeEntries));

    Promise.all(
      routeEntries.map(async (entry) => ({
        ...entry,
        summary: await resolveMapRouteDistanceSummary(entry.summary),
      }))
    ).then((resolvedEntries) => {
      if (!cancelled) {
        setRoadDistanceState(buildRoadState(resolvedEntries));
      }
    });

    return () => {
      cancelled = true;
    };
  }, [visibleGroups]);

  const displayedGroups = useMemo(
    () =>
      visibleGroups.map((group) => ({
        ...group,
        distanceSummary: roadDistanceState.groupSummaries[group.date] || group.distanceSummary,
        items: group.items.map((item) => {
          const itemKey = buildHistoryRoadItemKey(item);
          const itemMetric = roadDistanceState.itemMetrics[itemKey];
          const routeMetric = roadDistanceState.routeSummaries[item.routeMetric?.routeKey] || item.routeMetric;

          if (!itemMetric && !routeMetric) return item;

          return {
            ...item,
            distanceFromHubKm: itemMetric?.cumulativeDistanceKm ?? item.distanceFromHubKm,
            legDistanceKm: itemMetric?.legDistanceKm ?? item.legDistanceKm,
            previousStopLabel: itemMetric?.previousStopLabel || item.previousStopLabel,
            legFromStepLabel: itemMetric?.legFromStepLabel || item.legFromStepLabel,
            legToStepLabel: itemMetric?.legToStepLabel || item.legToStepLabel,
            routeMetric,
          };
        }),
      })),
    [roadDistanceState, visibleGroups]
  );

  const handleMarkReturned = async (item) => {
    const defaultReason = String(item.deliveryNote || "").trim();
    const response =
      typeof window === "undefined"
        ? defaultReason
        : window.prompt("ระบุเหตุผลการคืนสินค้า", defaultReason || "");

    if (response === null) return;

    const reason = String(response || "").trim();
    if (!reason) {
      setNotice({ message: "กรุณาระบุเหตุผลการคืนสินค้า", tone: "warning" });
      return;
    }

    setBusyPoNumber(item.poNumber);
    const result = await markHistoryOrderReturned(item.poNumber, reason);
    setBusyPoNumber("");
    setNotice({
      message: result.ok
        ? `${item.poNumber} ถูกย้ายไปประวัติการยกเลิกแล้ว`
        : result.message || `ไม่สามารถบันทึกคืนสินค้าให้ ${item.poNumber} ได้`,
      tone: result.ok ? "success" : "error",
    });
  };

  return (
    <AppShell
      currentPath="/send-history"
      title="ประวัติการส่ง"
      description="เก็บ snapshot ของรอบส่งที่ปิดงานแล้ว พร้อมผลลัพธ์สุดท้าย เวลา คนขับ ระยะทางคาดการณ์ ระยะทางวิ่งจริง และรองรับการบันทึกคืนสินค้าจากรายการที่เคยส่งสำเร็จ"
    >
      <div className="space-y-6">
        {notice.message ? <Notice message={notice.message} tone={notice.tone} /> : null}
        <SectionCard
          title="ตัวกรองประวัติ"
          description="หน้านี้จะแสดงเฉพาะรอบส่งที่ปิดงานและย้ายเข้าประวัติแล้วเท่านั้น งานที่ยังไม่เสร็จจะอยู่ในหน้าปฏิบัติการสด"
        >
          <div className="space-y-4">
            <div className="grid gap-4 lg:grid-cols-[280px_minmax(0,1fr)]">
              <label className="block">
                <div className="mb-2 text-sm font-semibold text-slate-900">เลือกวันที่จากปฏิทิน</div>
                <input
                  type="date"
                  value={selectedDate === "ALL" ? "" : selectedDate}
                  onChange={(event) => setSelectedDate(event.target.value || "ALL")}
                  list="send-history-dates"
                />
                <datalist id="send-history-dates">
                  {historyGroups
                    .filter((group) => String(group.date || "").includes("-"))
                    .map((group) => (
                      <option key={group.date} value={group.date} />
                    ))}
                </datalist>
              </label>

              <div>
                <div className="mb-2 text-sm font-semibold text-slate-900">เลือกแบบด่วน</div>
                <div className="flex flex-wrap gap-2">
                  <button
                    type="button"
                    className={`rounded-full px-4 py-2 text-sm font-semibold ${
                      selectedDate === "ALL"
                        ? "bg-brand-600 text-white"
                        : "border border-slate-200 bg-white text-slate-700 hover:bg-slate-100"
                    }`}
                    onClick={() => setSelectedDate("ALL")}
                  >
                    ทุกวันที่เก็บประวัติ
                  </button>
                  {historyGroups.map((group) => (
                    <button
                      key={group.date}
                      type="button"
                      className={`rounded-full px-4 py-2 text-sm font-semibold ${
                        selectedDate === group.date
                          ? "bg-brand-600 text-white"
                          : "border border-slate-200 bg-white text-slate-700 hover:bg-slate-100"
                      }`}
                      onClick={() => setSelectedDate(group.date)}
                    >
                      {group.date.includes("-") ? formatDate(group.date) : group.date}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </SectionCard>

        {!visibleGroups.length ? (
          <SectionCard title="รายการในประวัติ">
            <EmptyState text="ยังไม่มีรอบส่งในประวัติตามตัวกรองที่เลือก" />
          </SectionCard>
        ) : (
          displayedGroups.map((group) => (
            <SectionCard
              key={group.date}
              title={`ประวัติของวันที่ ${group.date.includes("-") ? formatDate(group.date) : group.date}`}
              description="ข้อมูลในประวัติถูกล็อกและเก็บไว้ตามสภาพตอนที่ปิดรอบส่งจริง"
            >
              <div className="grid gap-4 md:grid-cols-3 xl:grid-cols-6">
                <StatCard label="จุดส่งที่เก็บไว้" value={group.items.length} />
                <StatCard label="รวมจำนวนสินค้า" value={group.totals.quantity.toFixed(1)} />
                <StatCard label="มูลค่ารวม" value={formatCurrency(group.totals.amount)} tone="brand" />
                <StatCard
                  label="กม.คาดการณ์ไป-กลับ Sophon"
                  value={formatDistanceLabel(group.distanceSummary.expectedDistanceKm)}
                />
                <StatCard
                  label="กม.วิ่งจริงจากเลขไมล์"
                  value={formatDistanceLabel(group.distanceSummary.actualDistanceKm)}
                  tone="success"
                />
                <StatCard
                  label="ส่วนต่างจริงเทียบแผน"
                  value={formatSignedDistance(group.distanceSummary.distanceVarianceKm)}
                  tone="warning"
                />
              </div>

              {group.hasExceptions ||
              group.incompleteArchive ||
              group.distanceSummary.missingActualRoutes ||
              group.distanceSummary.incompleteExpectedRoutes ? (
                <div className="mt-4 flex flex-wrap gap-2">
                  {group.hasExceptions ? <ToneBadge tone="warning">มีงานส่งไม่สำเร็จ</ToneBadge> : null}
                  {group.incompleteArchive ? <ToneBadge tone="danger">ข้อมูลผลลัพธ์สุดท้ายยังไม่ครบ</ToneBadge> : null}
                  {group.distanceSummary.missingActualRoutes ? (
                    <ToneBadge tone="warning">บางรอบไม่มีข้อมูลเลขไมล์จริง</ToneBadge>
                  ) : null}
                  {group.distanceSummary.incompleteExpectedRoutes ? (
                    <ToneBadge tone="warning">บางรอบคำนวณกม.คาดการณ์ไม่ได้ครบเพราะพิกัดไม่สมบูรณ์</ToneBadge>
                  ) : null}
                </div>
              ) : null}

              <div className="mt-5 overflow-x-auto border border-slate-200 bg-white">
                <table className="min-w-[1760px] text-left text-sm">
                  <thead className="border-b border-slate-200 bg-slate-50 text-slate-600">
                    <tr>
                      <th className="px-4 py-3 font-semibold">ลำดับ</th>
                      <th className="px-4 py-3 font-semibold">PO / ลูกค้า</th>
                      <th className="px-4 py-3 font-semibold">วันส่ง / ติดต่อ</th>
                      <th className="px-4 py-3 font-semibold">ที่อยู่ / แผนที่</th>
                      <th className="px-4 py-3 font-semibold">มูลค่า / ระยะทาง</th>
                      <th className="px-4 py-3 font-semibold">หมายเหตุ</th>
                      <th className="px-4 py-3 font-semibold">ข้อมูล snapshot ตอนปิดรอบส่ง</th>
                      <th className="px-4 py-3 font-semibold">สถานะสุดท้าย</th>
                    </tr>
                  </thead>
                  <tbody>
                    {group.items.map((item) => {
                      const completedStatus = item.finalStatus || item.status;
                      const canMarkReturned = completedStatus === STATUS.DELIVERED;

                      return (
                      <tr key={item.historySnapshot?.historyId || item.poNumber} className="border-b border-slate-200 align-top">
                        <td className="px-4 py-4">
                          <div className="flex h-10 w-10 items-center justify-center border border-brand-100 bg-brand-50 text-sm font-bold text-brand-700">
                            {item.routeIndex || "-"}
                          </div>
                        </td>

                        <td className="px-4 py-4">
                          <div className="font-semibold text-slate-950">{item.poNumber}</div>
                          <div className="mt-1 text-sm text-slate-600">{item.customerName || "-"}</div>
                        </td>

                        <td className="px-4 py-4 text-slate-600">
                          <div>{item.deliveryDate ? formatDate(item.deliveryDate) : "ยังไม่ระบุวันส่ง"}</div>
                          <div className="mt-1 text-xs text-slate-500">{item.contact || "ยังไม่มีข้อมูลติดต่อ"}</div>
                        </td>

                        <td className="px-4 py-4">
                          <div className="min-w-[320px] max-w-[360px] space-y-2">
                            <ExpandableText value={item.address} emptyText="ยังไม่มีที่อยู่จัดส่ง" maxLength={110} />
                            {item.mapsUrl ? (
                              <a
                                href={item.mapsUrl}
                                target="_blank"
                                rel="noreferrer"
                                className="inline-flex border border-brand-200 bg-brand-50 px-3 py-1.5 text-xs font-semibold text-brand-700 hover:bg-brand-100"
                              >
                                เปิดแผนที่
                              </a>
                            ) : (
                              <ToneBadge tone="warning">ไม่มีลิงก์แผนที่</ToneBadge>
                            )}
                          </div>
                        </td>

                        <td className="px-4 py-4 text-slate-600">
                          <div className="font-semibold text-slate-950">{formatCurrency(item.totals.amount)}</div>
                          <div className="mt-1">จำนวน {item.totals.quantity.toFixed(1)}</div>
                          <div className="mt-1">
                            {item.distanceFromHubKm === null
                              ? "ยังไม่มีพิกัด"
                              : `ห่างจากศูนย์ ${item.distanceFromHubKm.toFixed(1)} กม.`}
                          </div>
                          <div className="mt-1">
                            {Number.isFinite(item.legDistanceKm)
                              ? `${item.legFromStepLabel || "Sophon"} -> ${item.legToStepLabel || "จุดนี้"} = ${item.legDistanceKm.toFixed(1)} กม.`
                              : "ยังคำนวณระยะระหว่างจุดไม่ได้"}
                          </div>
                          <div className="mt-1 text-xs text-slate-500">
                            {item.previousStopLabel || "Sophon"}
                            <span className="mx-1 text-slate-400">→</span>
                            {item.poNumber || item.customerName || "-"}
                          </div>
                        </td>

                        <td className="px-4 py-4">
                          <div className="min-w-[260px] space-y-3">
                            <div>
                              <div className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-400">
                                หมายเหตุจากฝ่ายวางแผน
                              </div>
                              <div className="mt-1">
                                <ExpandableText value={item.dispatchNote} emptyText="-" maxLength={90} />
                              </div>
                            </div>
                            <div>
                              <div className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-400">
                                หมายเหตุผลส่งจากคนขับ
                              </div>
                              <div className="mt-1">
                                <ExpandableText value={item.deliveryNote} emptyText="-" maxLength={90} />
                              </div>
                            </div>
                          </div>
                        </td>

                        <td className="px-4 py-4">
                          <div className="min-w-[320px] space-y-2 text-slate-600">
                            <div>ชื่อคนขับ: {item.routeDriverName || "-"}</div>
                            <div>เลขไมล์เริ่มต้น: {item.routeStartKm || "-"}</div>
                            <div>เลขไมล์สิ้นสุด: {item.routeEndKm || "-"}</div>
                            <div>กม.ขาไปตามแผน: {formatDistanceLabel(item.routeMetric?.outboundDistanceKm ?? null)}</div>
                            <div>กม.ขากลับเข้า Sophon: {formatDistanceLabel(item.routeMetric?.returnDistanceKm ?? null)}</div>
                            <div>กม.คาดการณ์รอบนี้ (ไป-กลับ): {formatDistanceLabel(item.routeMetric?.plannedDistanceKm ?? null)}</div>
                            <div>กม.วิ่งจริงรอบนี้: {formatDistanceLabel(item.routeMetric?.actualDistanceKm ?? null)}</div>
                            <div>ส่วนต่างจริงเทียบแผน: {formatSignedDistance(item.routeMetric?.distanceVarianceKm ?? null)}</div>
                            <div>เวลาเริ่มรอบวิ่ง: {formatDateTime(item.routeStartedAt)}</div>
                            <div>เวลาเริ่มจุดส่ง: {formatDateTime(item.dispatchStartedAt)}</div>
                            <div>เวลาปิดผลจุดส่ง: {formatDateTime(item.dispatchDeliveredAt)}</div>
                            <div>เวลาปิดรอบส่ง: {formatDateTime(item.routeFinishedAt)}</div>
                            <div>เวลาเก็บเข้าประวัติ: {formatDateTime(item.routeArchivedAt)}</div>
                          </div>
                        </td>

                        <td className="px-4 py-4">
                          <div className="flex min-w-[150px] flex-col gap-2">
                            <StatusBadge status={completedStatus} />
                            <ToneBadge>อยู่ในประวัติ</ToneBadge>
                            {canMarkReturned ? (
                              <button
                                type="button"
                                className="border border-amber-200 bg-amber-50 px-3 py-2 text-xs font-semibold text-amber-700 hover:bg-amber-100 disabled:cursor-not-allowed disabled:text-slate-300"
                                onClick={() => handleMarkReturned(item)}
                                disabled={busyPoNumber === item.poNumber}
                              >
                                {busyPoNumber === item.poNumber ? "กำลังบันทึก..." : "คืนสินค้า"}
                              </button>
                            ) : null}
                          </div>
                        </td>
                      </tr>
                    )})}
                  </tbody>
                </table>
              </div>
            </SectionCard>
          ))
        )}
      </div>
    </AppShell>
  );
}
