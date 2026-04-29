"use client";

import { useEffect, useMemo, useState } from "react";
import { AppShell } from "@/components/ui/Shell";
import { EmptyState } from "@/components/ui/EmptyState";
import { SectionCard, StatCard } from "@/components/ui/Cards";
import { StatusBadge, ToneBadge } from "@/components/ui/Badge";
import { useAppState } from "@/lib/app-state";
import { buildDispatchRows, getOpenOrders } from "@/lib/selectors";
import { buildMapRouteDistanceSummary, resolveMapRouteDistanceSummary } from "@/lib/maps";
import { formatCurrency, formatDate } from "@/lib/format";

function Notice({ message, tone = "success" }) {
  const classes =
    tone === "error"
      ? "border-rose-200 bg-rose-50 text-rose-700"
      : tone === "warning"
        ? "border-amber-200 bg-amber-50 text-amber-700"
        : "border-emerald-200 bg-emerald-50 text-emerald-700";

  return <div className={`border px-4 py-3 text-sm font-medium ${classes}`}>{message}</div>;
}

function formatDistanceLabel(value, fallback = "ยังคำนวณไม่ได้") {
  return Number.isFinite(value) ? `${value.toFixed(1)} กม.` : fallback;
}

function RouteMetric({ label, value, tone = "slate" }) {
  const toneClasses =
    tone === "brand"
      ? "border-brand-200 bg-brand-50 text-brand-800"
      : tone === "success"
        ? "border-emerald-200 bg-emerald-50 text-emerald-800"
        : tone === "warning"
          ? "border-amber-200 bg-amber-50 text-amber-800"
          : "border-slate-200 bg-slate-50 text-slate-700";

  return (
    <div className={`grid grid-cols-[112px,1fr] gap-3 border px-3 py-2 text-xs ${toneClasses}`}>
      <div className="font-medium text-slate-500">{label}</div>
      <div className="font-semibold">{value}</div>
    </div>
  );
}

export default function SendOrdersPage() {
  const { state, drivers, updateLineOrderDispatch, isReady, refreshLineOrdersFromSupabase } = useAppState();
  const [selectedDate, setSelectedDate] = useState("ALL");
  const [drafts, setDrafts] = useState({});
  const [notice, setNotice] = useState({ message: "", tone: "success" });
  const [dragState, setDragState] = useState({ sourcePoNumber: "", targetPoNumber: "", position: "after" });
  const [routeSummary, setRouteSummary] = useState(null);

  const openOrders = useMemo(() => getOpenOrders(state.lineOrders), [state.lineOrders]);
  const availableDates = useMemo(
    () => [...new Set(openOrders.map((order) => order.deliveryDate).filter(Boolean))].sort(),
    [openOrders]
  );

  const driverNameMap = useMemo(
    () =>
      drivers.reduce((acc, driver) => {
        acc[driver.id] = driver.name;
        return acc;
      }, {}),
    [drivers]
  );

  useEffect(() => {
    if (selectedDate !== "ALL" && availableDates.includes(selectedDate)) return;
    setSelectedDate(availableDates[0] || "ALL");
  }, [availableDates, selectedDate]);

  useEffect(() => {
    if (!isReady) return;
    void refreshLineOrdersFromSupabase();
  }, [isReady]);

  const draftOrders = useMemo(
    () =>
      openOrders.map((order) => {
        const draft = drafts[order.poNumber];
        return draft
          ? {
              ...order,
              assignedDriverId: draft.assignedDriverId ?? order.assignedDriverId,
              deliverySequence: draft.deliverySequence ?? order.deliverySequence,
              dispatchNote: draft.dispatchNote ?? order.dispatchNote,
            }
          : order;
      }),
    [drafts, openOrders]
  );

  const rows = useMemo(() => buildDispatchRows(draftOrders, { date: selectedDate }), [draftOrders, selectedDate]);

  useEffect(() => {
    if (selectedDate === "ALL" || !rows.length) {
      setRouteSummary(null);
      return;
    }

    let cancelled = false;
    const nextSummary = buildMapRouteDistanceSummary(
      rows.map((row) => ({
        ...row,
        lookupKey: row.poNumber,
      }))
    );

    const toVisibleSummary = (summary) => ({
      ...summary,
      routeLegs: (summary?.routeLegs || []).filter((leg) => Number.isFinite(leg.distanceKm)),
    });

    setRouteSummary(toVisibleSummary(nextSummary));

    resolveMapRouteDistanceSummary(nextSummary).then((resolvedSummary) => {
      if (!cancelled) {
        setRouteSummary(toVisibleSummary(resolvedSummary));
      }
    });

    return () => {
      cancelled = true;
    };
  }, [rows, selectedDate]);

  const displayedRows = useMemo(
    () =>
      rows.map((row) => {
        const routeMetric = routeSummary?.stopMetricsByLookupKey?.[row.poNumber];
        if (!routeMetric) return row;

        return {
          ...row,
          distanceFromHubKm: routeMetric.cumulativeDistanceKm ?? row.distanceFromHubKm,
          legDistanceKm: routeMetric.legDistanceKm ?? row.legDistanceKm,
          cumulativeDistanceKm: routeMetric.cumulativeDistanceKm ?? row.cumulativeDistanceKm,
        };
      }),
    [rows, routeSummary]
  );

  const hasPendingChanges = useMemo(
    () =>
      rows.some((row) => {
        const draft = drafts[row.poNumber];
        return draft && (draft.assignedDriverId !== undefined || draft.deliverySequence !== undefined || draft.dispatchNote !== undefined);
      }),
    [drafts, rows]
  );

  const stats = useMemo(
    () =>
      rows.reduce(
        (acc, item) => {
          acc.total += 1;
          if (item.status === "PREPARED") acc.prepared += 1;
          if (item.status === "ASSIGNED") acc.assigned += 1;
          if (item.status === "OUT_FOR_DELIVERY") acc.inProgress += 1;
          if (item.issues.some((issue) => issue.code === "missing_coordinates" || issue.code === "missing_maps_url")) {
            acc.missingMaps += 1;
          }
          return acc;
        },
        { total: 0, prepared: 0, assigned: 0, inProgress: 0, missingMaps: 0 }
      ),
    [rows]
  );

  const setDraftValue = (poNumber, field, value) => {
    setDrafts((current) => ({
      ...current,
      [poNumber]: {
        ...current[poNumber],
        [field]: value,
      },
    }));
  };

  const resequenceRows = (orderedRows) => {
    setDrafts((current) => {
      const next = { ...current };
      orderedRows.forEach((row, index) => {
        next[row.poNumber] = {
          ...next[row.poNumber],
          deliverySequence: String(index + 1),
        };
      });
      return next;
    });
  };

  const canReorderRow = (row) =>
    selectedDate !== "ALL" &&
    row &&
    !row.routeStartedAt &&
    !["OUT_FOR_DELIVERY", "DELIVERED", "FAILED", "RETURNED"].includes(row.status);

  const moveRowByDrop = (sourcePoNumber, targetPoNumber, position = "after") => {
    const sourceIndex = rows.findIndex((item) => item.poNumber === sourcePoNumber);
    const targetIndex = rows.findIndex((item) => item.poNumber === targetPoNumber);
    if (sourceIndex < 0 || targetIndex < 0 || sourceIndex === targetIndex) return;

    const reordered = [...rows];
    const [moved] = reordered.splice(sourceIndex, 1);

    let insertionIndex = targetIndex;
    if (sourceIndex < targetIndex) insertionIndex -= 1;
    if (position === "after") insertionIndex += 1;
    insertionIndex = Math.max(0, Math.min(insertionIndex, reordered.length));

    reordered.splice(insertionIndex, 0, moved);
    resequenceRows(reordered);
    setNotice({ message: "ย้ายลำดับจุดส่งแล้ว อย่าลืมกดบันทึกแผน", tone: "warning" });
  };

  const handleDragStart = (event, row) => {
    if (!canReorderRow(row)) return;
    event.dataTransfer.effectAllowed = "move";
    event.dataTransfer.setData("text/plain", row.poNumber);
    setDragState({ sourcePoNumber: row.poNumber, targetPoNumber: "", position: "after" });
  };

  const handleDragOver = (event, row) => {
    if (!canReorderRow(row) || !dragState.sourcePoNumber || dragState.sourcePoNumber === row.poNumber) return;

    event.preventDefault();
    const bounds = event.currentTarget.getBoundingClientRect();
    const midpoint = bounds.top + bounds.height / 2;
    const position = event.clientY < midpoint ? "before" : "after";

    setDragState((current) =>
      current.targetPoNumber === row.poNumber && current.position === position
        ? current
        : { ...current, targetPoNumber: row.poNumber, position }
    );
  };

  const handleDrop = (event, row) => {
    event.preventDefault();

    const sourcePoNumber = dragState.sourcePoNumber || event.dataTransfer.getData("text/plain");
    if (!sourcePoNumber || sourcePoNumber === row.poNumber || !canReorderRow(row)) {
      setDragState({ sourcePoNumber: "", targetPoNumber: "", position: "after" });
      return;
    }

    moveRowByDrop(sourcePoNumber, row.poNumber, dragState.position);
    setDragState({ sourcePoNumber: "", targetPoNumber: "", position: "after" });
  };

  const handleDragEnd = () => {
    setDragState({ sourcePoNumber: "", targetPoNumber: "", position: "after" });
  };

  const handleResetSuggested = () => {
    if (selectedDate === "ALL") {
      setNotice({ message: "กรุณาเลือกวันจัดส่งก่อนคำนวณลำดับเส้นทางใหม่", tone: "warning" });
      return;
    }

    const resetSource = openOrders.map((order) => {
      const lockedByExecution = Boolean(order.routeStartedAt) || ["OUT_FOR_DELIVERY", "DELIVERED", "FAILED", "RETURNED"].includes(order.status);
      if (order.deliveryDate !== selectedDate || lockedByExecution) return order;
      return { ...order, deliverySequence: "" };
    });

    const suggested = buildDispatchRows(resetSource, { date: selectedDate });
    resequenceRows(suggested);
    setNotice({ message: `คำนวณลำดับเส้นทางใหม่สำหรับ ${formatDate(selectedDate)} แล้ว`, tone: "success" });
  };

  const clearSavedDrafts = () => {
    setDrafts((current) => {
      const next = { ...current };
      rows.forEach((row) => {
        delete next[row.poNumber];
      });
      return next;
    });
  };

  const handleSave = async () => {
    if (selectedDate === "ALL") {
      setNotice({ message: "กรุณาเลือกวันจัดส่งก่อนบันทึกแผน", tone: "warning" });
      return;
    }

    for (const row of rows) {
      const plannedDriverId = drafts[row.poNumber]?.assignedDriverId ?? row.assignedDriverId ?? "";
      const plannedSequence = drafts[row.poNumber]?.deliverySequence ?? row.deliverySequence ?? row.routeIndex ?? "";
      const dispatchNote = drafts[row.poNumber]?.dispatchNote ?? row.dispatchNote ?? "";
      const lockedByExecution = Boolean(row.routeStartedAt) || ["OUT_FOR_DELIVERY", "DELIVERED", "FAILED", "RETURNED"].includes(row.status);

      if (lockedByExecution) continue;

      const nextStatus = plannedDriverId
        ? row.status === "PREPARED"
          ? "ASSIGNED"
          : row.status
        : row.status === "ASSIGNED"
          ? "PREPARED"
          : row.status;

      const result = await updateLineOrderDispatch(row.poNumber, {
        assignedDriverId: plannedDriverId,
        deliverySequence: plannedSequence,
        plannedDispatchDate: selectedDate,
        dispatchNote,
        status: nextStatus,
      });

      if (!result.ok) {
        setNotice({ message: result.message || `ไม่สามารถบันทึก ${row.poNumber} ได้`, tone: "error" });
        return;
      }
    }

    clearSavedDrafts();
    setNotice({ message: `บันทึกแผนจัดส่งของวันที่ ${formatDate(selectedDate)} เรียบร้อย`, tone: "success" });
  };

  return (
    <AppShell
      currentPath="/send-orders"
      title="วางแผนจัดส่ง"
      description="ลากแถวเพื่อเปลี่ยนลำดับส่ง มอบหมายคนขับ และดูระยะจากศูนย์รวมถึงระยะระหว่างปลายทางแต่ละจุด"
    >
      <div className="space-y-6">
        {notice.message ? <Notice message={notice.message} tone={notice.tone} /> : null}

        <SectionCard
          title="ตัวกรองวันจัดส่ง"
          description="เลือกวันที่ต้องการวางแผน จากนั้นระบบจะจัด route ตามงานของวันนั้น"
        >
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              className={`px-4 py-2 text-sm font-semibold ${selectedDate === "ALL" ? "bg-brand-600 text-white" : "border border-slate-200 bg-white text-slate-700 hover:bg-slate-100"}`}
              onClick={() => setSelectedDate("ALL")}
            >
              ทุกออเดอร์ที่ยังเปิดอยู่
            </button>
            {availableDates.map((date) => (
              <button
                key={date}
                type="button"
                className={`px-4 py-2 text-sm font-semibold ${selectedDate === date ? "bg-brand-600 text-white" : "border border-slate-200 bg-white text-slate-700 hover:bg-slate-100"}`}
                onClick={() => setSelectedDate(date)}
              >
                {formatDate(date)}
              </button>
            ))}
          </div>
        </SectionCard>

        <SectionCard
          title="สรุปการวางแผน"
          description="ดูจำนวนงานพร้อมส่ง งานที่กำลังวิ่ง และระยะรวมของ route ที่เลือก"
        >
          <div className={`grid gap-4 md:grid-cols-2 ${selectedDate === "ALL" ? "xl:grid-cols-5" : "xl:grid-cols-8"}`}>
            <StatCard label="งานที่แสดงอยู่" value={stats.total} />
            <StatCard label="เตรียมแล้ว" value={stats.prepared} tone="warning" />
            <StatCard label="มอบหมายแล้ว" value={stats.assigned} tone="brand" />
            <StatCard label="กำลังจัดส่ง" value={stats.inProgress} tone="success" />
            <StatCard label="ปัญหาแผนที่" value={stats.missingMaps} hint="ลิงก์แผนที่หรือพิกัดยังไม่ครบ" />
            {selectedDate !== "ALL" ? (
              <>
                <StatCard label="ศูนย์ -> จุดส่งทั้งหมด" value={formatDistanceLabel(routeSummary?.outboundDistanceKm)} tone="brand" />
                <StatCard label="จุดสุดท้าย -> Sophon" value={formatDistanceLabel(routeSummary?.returnDistanceKm)} />
                <StatCard label="ระยะรวมตามแผน" value={formatDistanceLabel(routeSummary?.totalDistanceKm)} tone="success" />
              </>
            ) : null}
          </div>
        </SectionCard>

        <SectionCard
          title="ตารางวางแผนเส้นทาง"
          description="ใช้เมาส์ลากแถวไปวางเหนือหรือใต้แถวอื่นเพื่อเปลี่ยนลำดับส่ง แล้วกดบันทึกแผนเมื่อพร้อม"
          action={
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                className="border border-slate-200 bg-white px-4 py-2.5 text-sm font-semibold text-slate-700 hover:bg-slate-100"
                onClick={handleResetSuggested}
                disabled={!rows.length}
              >
                คำนวณเส้นทางใหม่
              </button>
              <button
                type="button"
                className="bg-brand-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-brand-700 disabled:cursor-not-allowed disabled:bg-slate-300"
                onClick={handleSave}
                disabled={selectedDate === "ALL" || !rows.length || !hasPendingChanges}
              >
                บันทึกแผน
              </button>
            </div>
          }
        >
          {selectedDate !== "ALL" ? (
            <div className="mb-4 space-y-3">
              <div className="border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-600">
                ระบบจะคำนวณ กม.ตามแผนจาก Sophon ไปยังจุดแรก ต่อไปยังจุดถัดไปทีละจุด และกลับเข้า Sophon เสมอ ถ้าลากสลับแถว ระยะจากจุดก่อนหน้าและระยะสะสมจะเปลี่ยนตามทันที
              </div>
              <div className="grid gap-4 border border-slate-200 bg-white px-4 py-4 lg:grid-cols-[minmax(0,1.3fr)_minmax(0,1fr)]">
                <div className="space-y-2">
                  <div className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">ลำดับคำนวณ กม.ตามแผน</div>
                  <div className="text-sm font-semibold text-slate-900">
                    {routeSummary?.routePathText || "Sophon Supermarket -> Sophon Supermarket"}
                  </div>
                  <div className="text-xs text-slate-500">
                    ปลายทางจริง: {routeSummary?.routePathDetailText || "Sophon Supermarket -> Sophon Supermarket"}
                  </div>
                  <div className="text-xs text-slate-500">
                    ระยะรวมของ route นี้ = {formatDistanceLabel(routeSummary?.totalDistanceKm)}
                  </div>
                </div>
                <div className="space-y-2">
                  <div className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">ช่วงระยะทางที่ใช้คำนวณ</div>
                  {routeSummary?.routeLegs?.length ? (
                    <div className="space-y-2">
                      {routeSummary.routeLegs.map((leg) => (
                        <div key={leg.key} className="border border-slate-200 bg-slate-50 px-3 py-2 text-xs text-slate-700">
                          <span className="font-semibold text-slate-900">{leg.fromStepLabel}</span>
                          <span className="mx-2 text-slate-400">→</span>
                          <span className="font-semibold text-slate-900">{leg.toStepLabel}</span>
                          <span className="ml-3 text-slate-500">= {leg.distanceKm.toFixed(1)} กม.</span>
                          <div className="mt-1 text-slate-500">
                            {leg.fromLabel}
                            <span className="mx-2 text-slate-400">→</span>
                            {leg.toLabel}
                          </div>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div className="text-xs text-slate-500">ยังไม่มีข้อมูลพิกัดครบพอสำหรับแสดงช่วงระยะทาง</div>
                  )}
                </div>
              </div>
            </div>
          ) : null}

          {!rows.length ? (
            <EmptyState text="ไม่มีออเดอร์ที่ยังเปิดอยู่ตามตัวกรองที่เลือก" />
          ) : (
            <div className="overflow-x-auto border border-slate-200 bg-white">
              <table className="min-w-[1600px] text-left text-sm">
                <thead className="border-b border-slate-200 bg-slate-50 text-slate-600">
                  <tr>
                    <th className="px-4 py-3 font-semibold">ลำดับ</th>
                    <th className="px-4 py-3 font-semibold">PO / ลูกค้า</th>
                    <th className="px-4 py-3 font-semibold">วันส่ง / ติดต่อ</th>
                    <th className="px-4 py-3 font-semibold">ที่อยู่ / ระยะทาง</th>
                    <th className="px-4 py-3 font-semibold">สถานะ</th>
                    <th className="px-4 py-3 font-semibold">คนขับ</th>
                    <th className="px-4 py-3 font-semibold">หมายเหตุจัดส่ง</th>
                    <th className="px-4 py-3 font-semibold">มูลค่า</th>
                    <th className="px-4 py-3 font-semibold">ลากเรียงลำดับ</th>
                  </tr>
                </thead>
                <tbody>
                  {displayedRows.map((row, index) => {
                    const plannedDriverId = drafts[row.poNumber]?.assignedDriverId ?? row.assignedDriverId ?? "";
                    const dispatchNote = drafts[row.poNumber]?.dispatchNote ?? row.dispatchNote ?? "";
                    const lockedByExecution = Boolean(row.routeStartedAt) || ["OUT_FOR_DELIVERY", "DELIVERED", "FAILED", "RETURNED"].includes(row.status);
                    const canAssign = ["PREPARED", "ASSIGNED"].includes(row.status) && !lockedByExecution;
                    const canReorder = canReorderRow(row);
                    const isDropTarget = dragState.targetPoNumber === row.poNumber && dragState.sourcePoNumber !== row.poNumber;
                    const dropHighlight =
                      isDropTarget && dragState.position === "before"
                        ? "border-t-2 border-t-brand-500"
                        : isDropTarget && dragState.position === "after"
                          ? "border-b-2 border-b-brand-500"
                          : "";

                    return (
                      <tr
                        key={row.poNumber}
                        className={`border-b border-slate-200 align-top ${lockedByExecution ? "bg-slate-50/80" : "bg-white"} ${dropHighlight} ${isDropTarget ? "bg-brand-50/40" : ""}`}
                        onDragOver={(event) => handleDragOver(event, row)}
                        onDrop={(event) => handleDrop(event, row)}
                      >
                        <td className="px-4 py-4">
                          <div className="flex h-11 w-11 items-center justify-center border border-brand-100 bg-brand-50 text-sm font-bold text-brand-700">
                            {row.routeIndex || index + 1}
                          </div>
                          <div className="mt-2 text-xs text-slate-500">จุดส่งที่ {row.routeIndex || index + 1}</div>
                        </td>

                        <td className="px-4 py-4">
                          <div className="font-semibold text-slate-950">{row.poNumber}</div>
                          <div className="mt-1 text-sm text-slate-600">{row.customerName || "-"}</div>
                        </td>

                        <td className="px-4 py-4 text-slate-600">
                          <div>{row.deliveryDate ? formatDate(row.deliveryDate) : "ยังไม่ระบุวันส่ง"}</div>
                          <div className="mt-1 text-xs text-slate-500">{row.contact || "ยังไม่มีข้อมูลติดต่อ"}</div>
                        </td>

                        <td className="px-4 py-4">
                          <div className="max-w-[360px] space-y-3">
                            <div className="text-sm leading-6 text-slate-600">{row.address || "ยังไม่มีที่อยู่จัดส่ง"}</div>

                            <div className="flex flex-wrap gap-2">
                              {row.mapsUrl ? (
                                <a
                                  href={row.mapsUrl}
                                  target="_blank"
                                  rel="noreferrer"
                                  className="inline-flex border border-brand-200 bg-brand-50 px-3 py-1.5 text-xs font-semibold text-brand-700 hover:bg-brand-100"
                                >
                                  เปิดแผนที่
                                </a>
                              ) : (
                                <ToneBadge tone="warning">ยังไม่มีลิงก์แผนที่</ToneBadge>
                              )}
                            </div>

                            <div className="space-y-2">
                              <RouteMetric label="ศูนย์ -> จุดนี้" value={formatDistanceLabel(row.distanceFromHubKm, "ยังไม่มีพิกัด")} tone="brand" />
                              <RouteMetric
                                label="จุดก่อนหน้า"
                                value={
                                  Number.isFinite(row.legDistanceKm)
                                    ? `${
                                        Number(row.routeIndex || index + 1) <= 1
                                          ? "Sophon -> จุดที่ 1"
                                          : `จุดที่ ${Number(row.routeIndex || index + 1) - 1} -> จุดที่ ${Number(row.routeIndex || index + 1)}`
                                      } ${row.legDistanceKm.toFixed(1)} กม.`
                                    : "ยังคำนวณระยะจากจุดก่อนหน้าไม่ได้"
                                }
                                tone={Number.isFinite(row.legDistanceKm) ? "warning" : "slate"}
                              />
                              <RouteMetric label="ระยะสะสม" value={formatDistanceLabel(row.cumulativeDistanceKm, "รอคำนวณ")} tone="success" />
                              {index === displayedRows.length - 1 ? (
                                <RouteMetric label="กลับศูนย์" value={formatDistanceLabel(routeSummary?.returnDistanceKm, "ยังคำนวณไม่ได้")} />
                              ) : null}
                            </div>

                            {row.issues.length ? (
                              <div className="flex flex-wrap gap-2">
                                {row.issues.slice(0, 3).map((issue) => (
                                  <ToneBadge
                                    key={`${row.poNumber}-${issue.code}`}
                                    tone={issue.level === "error" ? "danger" : issue.level === "warning" ? "warning" : "slate"}
                                  >
                                    {issue.message}
                                  </ToneBadge>
                                ))}
                              </div>
                            ) : null}
                          </div>
                        </td>

                        <td className="px-4 py-4">
                          <StatusBadge status={row.status} />
                        </td>

                        <td className="px-4 py-4">
                          <div className="min-w-[220px] space-y-2">
                            <select
                              value={plannedDriverId}
                              onChange={(event) => setDraftValue(row.poNumber, "assignedDriverId", event.target.value)}
                              disabled={!canAssign}
                            >
                              <option value="">ยังไม่มอบหมาย</option>
                              {drivers.map((driver) => (
                                <option key={driver.id} value={driver.id}>
                                  {driver.name}
                                </option>
                              ))}
                            </select>
                            <div className="text-xs text-slate-500">
                              {plannedDriverId ? driverNameMap[plannedDriverId] || plannedDriverId : "ยังไม่ได้เลือกคนขับ"}
                            </div>
                          </div>
                        </td>

                        <td className="px-4 py-4">
                          <div className="min-w-[280px]">
                            <textarea
                              value={dispatchNote}
                              onChange={(event) => setDraftValue(row.poNumber, "dispatchNote", event.target.value)}
                              disabled={lockedByExecution}
                              className="min-h-[88px]"
                            />
                          </div>
                        </td>

                        <td className="px-4 py-4 text-slate-600">
                          <div className="font-semibold text-slate-950">{formatCurrency(row.totals.amount)}</div>
                          <div className="mt-1 text-xs text-slate-500">จำนวน {row.totals.quantity.toFixed(1)}</div>
                        </td>

                        <td className="px-4 py-4">
                          <div className="min-w-[176px] space-y-2">
                            <div
                              draggable={canReorder}
                              onDragStart={(event) => handleDragStart(event, row)}
                              onDragEnd={handleDragEnd}
                              className={`border px-3 py-3 text-center text-sm font-semibold ${
                                canReorder
                                  ? "cursor-grab border-brand-200 bg-brand-50 text-brand-700 active:cursor-grabbing"
                                  : "border-slate-200 bg-slate-50 text-slate-400"
                              }`}
                            >
                              {canReorder ? "ลากแถวนี้เพื่อย้ายลำดับ" : "แถวนี้ล็อกลำดับแล้ว"}
                            </div>
                            <div className="text-[11px] text-slate-500">
                              {isDropTarget
                                ? dragState.position === "before"
                                  ? "ปล่อยเมาส์เพื่อวางก่อนแถวนี้"
                                  : "ปล่อยเมาส์เพื่อวางต่อจากแถวนี้"
                                : canReorder
                                  ? "ลากไปวางเหนือหรือใต้แถวปลายทาง"
                                  : "เริ่มวิ่งงานแล้วจึงสลับไม่ได้"}
                            </div>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </SectionCard>
      </div>
    </AppShell>
  );
}
