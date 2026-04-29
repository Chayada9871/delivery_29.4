"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { AppShell } from "@/components/ui/Shell";
import { EmptyState } from "@/components/ui/EmptyState";
import { SectionCard, SoftCard } from "@/components/ui/Cards";
import { StatusBadge, ToneBadge } from "@/components/ui/Badge";
import { useAppState } from "@/lib/app-state";
import { buildDispatchRows } from "@/lib/selectors";
import { ROLES, STATUS, STATUS_LABELS } from "@/lib/config";
import { formatCurrency, formatDate, formatDateTime } from "@/lib/format";
import { getSafeTransitionError } from "@/lib/workflow";

const FINAL_STATUSES = [STATUS.DELIVERED, STATUS.FAILED, STATUS.RETURNED];
const STOP_RESULT_LABELS = {
  [STATUS.DELIVERED]: "ส่งสำเร็จ",
  [STATUS.FAILED]: "ส่งไม่สำเร็จ",
  [STATUS.RETURNED]: "คืนสินค้า",
};

function Notice({ message, tone = "success" }) {
  const classes =
    tone === "error"
      ? "border-rose-200 bg-rose-50 text-rose-700"
      : tone === "warning"
        ? "border-amber-200 bg-amber-50 text-amber-700"
        : "border-emerald-200 bg-emerald-50 text-emerald-700";

  return <div className={`border px-4 py-3 text-sm font-medium ${classes}`}>{message}</div>;
}

function getTodayKey() {
  return new Intl.DateTimeFormat("sv-SE", { timeZone: "Asia/Bangkok" }).format(new Date());
}

function ExpandableText({ value, limit = 80 }) {
  const [expanded, setExpanded] = useState(false);
  const text = String(value || "").trim();

  if (!text) {
    return <span className="text-slate-400">-</span>;
  }

  if (text.length <= limit) {
    return <span>{text}</span>;
  }

  return (
    <div className="space-y-2">
      <div>{expanded ? text : `${text.slice(0, limit)}...`}</div>
      <button
        type="button"
        className="text-xs font-semibold text-brand-700 hover:text-brand-800"
        onClick={() => setExpanded((current) => !current)}
      >
        {expanded ? "ย่อข้อความ" : "ดูเพิ่มเติม"}
      </button>
    </div>
  );
}

export default function DriverPage() {
  const { currentUser, drivers, state, updateLineOrderDispatch } = useAppState();
  const router = useRouter();
  const [selectedDriverId, setSelectedDriverId] = useState("");
  const [selectedDate, setSelectedDate] = useState(getTodayKey());
  const [routeForm, setRouteForm] = useState({ startKm: "", endKm: "" });
  const [drafts, setDrafts] = useState({});
  const [notice, setNotice] = useState({ message: "", tone: "success" });
  const [rowNotices, setRowNotices] = useState({});

  const effectiveDriverId = currentUser?.role === ROLES.DRIVER ? currentUser.id : selectedDriverId;

  const availableDates = useMemo(() => {
    return [
      ...new Set(
        state.lineOrders
          .filter((item) => String(item.assignedDriverId || "") === String(effectiveDriverId || ""))
          .filter((item) => item.status !== STATUS.ARCHIVED)
          .map((item) => item.deliveryDate)
          .filter(Boolean)
      ),
    ].sort();
  }, [effectiveDriverId, state.lineOrders]);

  useEffect(() => {
    if (currentUser?.role === ROLES.DRIVER) {
      setSelectedDriverId(currentUser.id);
      return;
    }

    if (!selectedDriverId && drivers.length) {
      setSelectedDriverId(drivers[0].id);
    }
  }, [currentUser?.id, currentUser?.role, drivers, selectedDriverId]);

  useEffect(() => {
    if (!availableDates.length) return;
    if (availableDates.includes(selectedDate)) return;
    setSelectedDate(availableDates[0]);
  }, [availableDates, selectedDate]);

  const rows = useMemo(
    () => buildDispatchRows(state.lineOrders, { driverId: effectiveDriverId, date: selectedDate }),
    [effectiveDriverId, selectedDate, state.lineOrders]
  );

  const routeSnapshot = rows.find((item) => item.routeStartedAt || item.routeDriverName || item.routeStartKm) || null;
  const routeStarted = Boolean(routeSnapshot?.routeStartedAt);
  const routeFinished = Boolean(routeSnapshot?.routeFinishedAt);
  const finalCount = rows.filter((item) => FINAL_STATUSES.includes(item.status)).length;
  const activeStopIndex = useMemo(() => rows.findIndex((item) => !FINAL_STATUSES.includes(item.status)), [rows]);
  const activeStop = activeStopIndex >= 0 ? rows[activeStopIndex] : null;

  const selectedDriverName = useMemo(() => {
    if (routeSnapshot?.routeDriverName) {
      return routeSnapshot.routeDriverName;
    }

    const matchedDriver = drivers.find((driver) => String(driver.id) === String(effectiveDriverId || ""));
    if (matchedDriver?.name) {
      return matchedDriver.name;
    }

    if (currentUser?.role === ROLES.DRIVER) {
      return currentUser?.name || "";
    }

    return "";
  }, [currentUser?.name, currentUser?.role, drivers, effectiveDriverId, routeSnapshot?.routeDriverName]);

  useEffect(() => {
    setRouteForm({
      startKm:
        routeSnapshot?.routeStartKm === 0 || routeSnapshot?.routeStartKm
          ? String(routeSnapshot.routeStartKm)
          : "",
      endKm:
        routeSnapshot?.routeEndKm === 0 || routeSnapshot?.routeEndKm
          ? String(routeSnapshot.routeEndKm)
          : "",
    });
  }, [routeSnapshot?.routeEndKm, routeSnapshot?.routeStartKm]);

  useEffect(() => {
    setRowNotices({});
  }, [effectiveDriverId, selectedDate]);

  const setDraftValue = (poNumber, value) => {
    setDrafts((current) => ({
      ...current,
      [poNumber]: {
        ...current[poNumber],
        deliveryNote: value,
      },
    }));
  };

  const buildTransitionOptions = (row) => ({
    actorId: currentUser?.id,
    assignedDriverId: row.assignedDriverId,
    routeStartedAt: row.routeStartedAt || routeSnapshot?.routeStartedAt || "",
  });

  const handleStartRoute = async () => {
    if (!rows.length) return;

    if (!selectedDriverName.trim()) {
      setNotice({ message: "ไม่พบชื่อคนขับสำหรับรอบส่งนี้", tone: "warning" });
      return;
    }

    if (!routeForm.startKm.trim()) {
      setNotice({ message: "กรุณาระบุเลขไมล์เริ่มต้นก่อนเริ่มรอบส่ง", tone: "warning" });
      return;
    }

    const startedAt = new Date().toISOString();

    for (const row of rows) {
      const result = await updateLineOrderDispatch(row.poNumber, {
        routeDriverName: selectedDriverName.trim(),
        routeStartKm: routeForm.startKm,
        routeStartedAt: startedAt,
      });

      if (!result.ok) {
        setNotice({ message: result.message || `ไม่สามารถเริ่มรอบของ ${row.poNumber} ได้`, tone: "error" });
        return;
      }
    }

    setRowNotices({});
    setNotice({ message: `เริ่มรอบส่งแล้ว ${rows.length} จุดส่ง`, tone: "success" });
  };

  const handleStopUpdate = async (row, nextStatus) => {
    const eventTimestamp = new Date().toISOString();
    const deliveryNote = drafts[row.poNumber]?.deliveryNote ?? row.deliveryNote ?? "";

    if ([STATUS.RETURNED, STATUS.FAILED].includes(nextStatus) && !String(deliveryNote || "").trim()) {
      const message =
        nextStatus === STATUS.FAILED
          ? "กรุณาบันทึกเหตุผลการส่งไม่สำเร็จก่อนปิดผลจุดส่ง"
          : "กรุณาบันทึกเหตุผลการคืนสินค้าก่อนปิดผลจุดส่ง";
      setRowNotices((current) => ({
        ...current,
        [row.poNumber]: {
          message,
          tone: "error",
        },
      }));
      setNotice({ message, tone: "error" });
      return;
    }

    const payload = {
      status: nextStatus,
      deliveryNote,
      routeDriverName: selectedDriverName.trim() || row.routeDriverName || "",
      routeStartKm: routeForm.startKm || row.routeStartKm || "",
      routeStartedAt: row.routeStartedAt || routeSnapshot?.routeStartedAt || eventTimestamp,
    };

    if (nextStatus === STATUS.OUT_FOR_DELIVERY) {
      payload.dispatchStartedAt = row.dispatchStartedAt || eventTimestamp;
    }

    if ([STATUS.DELIVERED, STATUS.FAILED, STATUS.RETURNED].includes(nextStatus)) {
      payload.dispatchStartedAt = row.dispatchStartedAt || eventTimestamp;
      payload.dispatchDeliveredAt = eventTimestamp;
    }

    const result = await updateLineOrderDispatch(row.poNumber, payload);
    const rowMessage = result.ok
      ? `อัปเดต ${row.poNumber} เป็น ${STATUS_LABELS[nextStatus] || nextStatus} แล้ว`
      : result.message || `ไม่สามารถอัปเดต ${row.poNumber} ได้`;

    setRowNotices((current) => ({
      ...current,
      [row.poNumber]: {
        message: rowMessage,
        tone: result.ok ? "success" : "error",
      },
    }));

    setNotice({
      message: rowMessage,
      tone: result.ok ? "success" : "error",
    });

    if (result.ok && nextStatus === STATUS.FAILED) {
      router.push(`/return-history?status=${STATUS.FAILED}&po=${encodeURIComponent(row.poNumber)}`);
    }
  };

  const handleFinishRoute = async () => {
    if (!routeStarted) {
      setNotice({ message: "กรุณาเริ่มรอบส่งก่อนปิดรอบ", tone: "warning" });
      return;
    }

    if (finalCount !== rows.length) {
      setNotice({ message: "ทุกจุดต้องถูกปิดผลก่อนจึงจะปิดรอบส่งได้", tone: "warning" });
      return;
    }

    if (!routeForm.endKm.trim()) {
      setNotice({ message: "กรุณาระบุเลขไมล์สิ้นสุดก่อนปิดรอบส่ง", tone: "warning" });
      return;
    }

    const finishedAt = new Date().toISOString();

    for (const row of rows) {
      const result = await updateLineOrderDispatch(row.poNumber, {
        routeDriverName: selectedDriverName.trim() || row.routeDriverName || "",
        routeStartKm: routeForm.startKm || row.routeStartKm || "",
        routeEndKm: routeForm.endKm,
        routeStartedAt: row.routeStartedAt || routeSnapshot?.routeStartedAt || finishedAt,
        routeFinishedAt: finishedAt,
        routeArchived: true,
        deliveryNote: drafts[row.poNumber]?.deliveryNote ?? row.deliveryNote ?? "",
        dispatchDeliveredAt: row.dispatchDeliveredAt || finishedAt,
      });

      if (!result.ok) {
        setNotice({ message: result.message || `ไม่สามารถย้าย ${row.poNumber} เข้าประวัติได้`, tone: "error" });
        return;
      }
    }

    setNotice({ message: "ปิดรอบส่งและย้ายข้อมูลไปประวัติการส่งแล้ว", tone: "success" });
  };

  const getStopUiState = (row) => {
    const deliveryNote = drafts[row.poNumber]?.deliveryNote ?? row.deliveryNote ?? "";
    const canAct = routeStarted && !routeFinished;
    const isFinal = FINAL_STATUSES.includes(row.status);
    const isActiveStep = activeStop?.poNumber === row.poNumber;
    const transitionOptions = buildTransitionOptions(row);
    const sequenceError =
      canAct && !isFinal && activeStop && !isActiveStep
        ? `รอปิดจุดลำดับ ${activeStop.routeIndex || activeStopIndex + 1} (${activeStop.poNumber}) ก่อน`
        : "";
    const startPointError =
      row.status === STATUS.ASSIGNED
        ? sequenceError || getSafeTransitionError(row, STATUS.OUT_FOR_DELIVERY, currentUser?.role, transitionOptions)
        : "";
    const deliveredError =
      row.status === STATUS.OUT_FOR_DELIVERY
        ? sequenceError || getSafeTransitionError(row, STATUS.DELIVERED, currentUser?.role, transitionOptions)
        : "";
    const failedNoteError =
      row.status === STATUS.OUT_FOR_DELIVERY && !String(deliveryNote || "").trim()
        ? "กรุณาบันทึกเหตุผลการส่งไม่สำเร็จก่อน"
        : "";
    const failedTransitionError =
      row.status === STATUS.OUT_FOR_DELIVERY
        ? sequenceError || getSafeTransitionError(row, STATUS.FAILED, currentUser?.role, transitionOptions)
        : "";
    const inlineNotice = rowNotices[row.poNumber];
    let helperMessage = inlineNotice?.message || "";

    if (!helperMessage) {
      if (!routeStarted) {
        helperMessage = "เริ่มรอบส่งก่อนจึงจะกดปุ่มของแต่ละจุดได้";
      } else if (routeFinished) {
        helperMessage = "รอบส่งนี้ถูกปิดแล้ว";
      } else if (row.status === STATUS.ASSIGNED && startPointError) {
        helperMessage = startPointError;
      } else if (row.status === STATUS.OUT_FOR_DELIVERY && deliveredError) {
        helperMessage = deliveredError;
      } else if (row.status === STATUS.OUT_FOR_DELIVERY && failedTransitionError) {
        helperMessage = failedTransitionError;
      } else if (row.status === STATUS.OUT_FOR_DELIVERY && failedNoteError) {
        helperMessage = failedNoteError;
      } else if (sequenceError) {
        helperMessage = sequenceError;
      }
    }

    return {
      deliveryNote,
      canAct,
      isFinal,
      isActiveStep,
      startPointError,
      deliveredError,
      failedTransitionError,
      inlineNotice,
      helperMessage,
    };
  };
  return (
    <AppShell
      currentPath="/driver"
      title="งานคนขับ"
      description="หน้าปฏิบัติงานสำหรับคนขับ แสดงเฉพาะงานที่ได้รับมอบหมาย และบังคับให้กดทำงานตามลำดับจุดส่งทีละขั้น"
    >
      <div className="space-y-6">
        {notice.message ? <Notice message={notice.message} tone={notice.tone} /> : null}

        <SectionCard
          title="ข้อมูลรอบส่ง"
          description="วันจัดส่งดึงจากแผนที่มอบหมายไว้ ส่วนการทำงานในแต่ละจุดจะปลดปุ่มตามลำดับเส้นทางทีละจุด"
        >
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
            {currentUser?.role === ROLES.DRIVER ? (
              <div className="xl:col-span-2">
                <div className="mb-2 text-sm font-semibold text-slate-900">คนขับ</div>
                <div className="border border-slate-200 bg-slate-50 px-4 py-3 text-sm font-semibold text-slate-900">
                  {currentUser?.name || "-"}
                </div>
              </div>
            ) : (
              <label className="block xl:col-span-2">
                <div className="mb-2 text-sm font-semibold text-slate-900">คนขับ</div>
                <select value={effectiveDriverId} onChange={(event) => setSelectedDriverId(event.target.value)}>
                  <option value="">เลือกคนขับ</option>
                  {drivers.map((driver) => (
                    <option key={driver.id} value={driver.id}>
                      {driver.name}
                    </option>
                  ))}
                </select>
              </label>
            )}

            <div className="xl:col-span-2">
              <div className="mb-2 text-sm font-semibold text-slate-900">วันจัดส่ง</div>
              <div className="border border-slate-200 bg-slate-50 px-4 py-3 text-sm font-semibold text-slate-900">
                {availableDates.length ? formatDate(selectedDate) : "ยังไม่มีวันจัดส่งสำหรับคนขับคนนี้"}
              </div>
              <div className="mt-2 text-xs text-slate-500">หน้าคนขับเปลี่ยนวันจัดส่งไม่ได้ และจะอิงตามวันจากแผนจัดรถเสมอ</div>
            </div>
          </div>

          <div className="mt-5 grid gap-4 xl:grid-cols-[minmax(0,1fr)_320px]">
            <div className="grid gap-4 md:grid-cols-2">
              <label className="block">
                <div className="mb-2 text-sm font-semibold text-slate-900">เลขไมล์เริ่มต้น</div>
                <input
                  type="number"
                  step="0.1"
                  value={routeForm.startKm}
                  onChange={(event) => setRouteForm({ ...routeForm, startKm: event.target.value })}
                  disabled={routeStarted || routeFinished}
                />
              </label>

              <label className="block">
                <div className="mb-2 text-sm font-semibold text-slate-900">เลขไมล์สิ้นสุด</div>
                <input
                  type="number"
                  step="0.1"
                  value={routeForm.endKm}
                  onChange={(event) => setRouteForm({ ...routeForm, endKm: event.target.value })}
                  disabled={!routeStarted || routeFinished}
                />
              </label>
            </div>

            <SoftCard className="bg-white">
              <div className="mb-3">
                <ToneBadge tone={routeFinished ? "success" : routeStarted ? "brand" : "warning"}>
                  {routeFinished ? "ปิดรอบแล้ว" : routeStarted ? "กำลังจัดส่ง" : "รอเริ่มรอบ"}
                </ToneBadge>
              </div>
              <div className="text-sm font-semibold text-slate-950">
                {routeFinished ? "ปิดรอบส่งแล้ว" : routeStarted ? "กำลังวิ่งงาน" : "พร้อมเริ่มรอบส่ง"}
              </div>
                <div className="mt-2 text-sm leading-6 text-slate-500">
                  {routeFinished
                    ? "รอบส่งนี้ปิดงานและถูกย้ายเข้าประวัติแล้ว"
                    : routeStarted
                      ? "เมื่อกดเริ่มรอบแล้ว ระบบจะปลดปุ่มทีละจุดตามลำดับเส้นทาง และจะบันทึกเวลาเริ่มจุดส่งกับเวลาปิดผลของแต่ละจุดให้อัตโนมัติ"
                      : "เริ่มรอบส่งก่อน จึงจะกดปุ่ม เริ่มจุดส่ง ส่งสำเร็จ หรือ ส่งไม่สำเร็จ ของแต่ละรายการได้"}
                </div>
              <div className="mt-3 text-xs text-slate-500">
                คนขับในรอบนี้: {selectedDriverName || "-"} | งานทั้งหมด {rows.length} จุด | ปิดผลแล้ว {finalCount} จุด
              </div>
              <div className="mt-1 text-xs text-slate-500">
                จุดถัดไป: {activeStop ? `ลำดับ ${activeStop.routeIndex || activeStopIndex + 1} (${activeStop.poNumber})` : "ไม่มีจุดค้างในรอบนี้"}
              </div>
              <div className="mt-4 flex flex-wrap gap-2">
                <button
                  type="button"
                  className="bg-brand-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-brand-700 disabled:cursor-not-allowed disabled:bg-slate-300"
                  onClick={handleStartRoute}
                  disabled={routeStarted || routeFinished || !rows.length}
                >
                  เริ่มรอบส่ง
                </button>
                <button
                  type="button"
                  className="border border-slate-200 bg-white px-4 py-2.5 text-sm font-semibold text-slate-700 hover:bg-slate-100 disabled:cursor-not-allowed disabled:text-slate-300"
                  onClick={handleFinishRoute}
                  disabled={!routeStarted || routeFinished || !rows.length}
                >
                  ปิดรอบและเก็บเข้าประวัติ
                </button>
              </div>
            </SoftCard>
          </div>
        </SectionCard>

        <SectionCard
          title="จุดส่งที่ได้รับมอบหมาย"
          description="ใช้ปุ่ม เริ่มจุดส่ง แล้วปิดผลเป็น ส่งสำเร็จ หรือ ส่งไม่สำเร็จ ตามลำดับเท่านั้น ระบบจะปลดล็อกทีละแถวและบันทึกเวลาให้แต่ละจุด"
        >
          {!effectiveDriverId || !rows.length ? (
            <EmptyState text="ไม่มีจุดส่งสำหรับคนขับและวันจัดส่งที่ระบบเลือกไว้" />
          ) : (
            <>
              <div className="grid gap-3 md:hidden">
                {rows.map((row) => {
                  const {
                    deliveryNote,
                    canAct,
                    isFinal,
                    isActiveStep,
                    startPointError,
                    deliveredError,
                    failedTransitionError,
                    inlineNotice,
                    helperMessage,
                  } = getStopUiState(row);

                  return (
                    <article
                      key={row.poNumber}
                      className={`border bg-white p-3 shadow-sm ${
                        isActiveStep && canAct && !isFinal ? "border-brand-300 ring-2 ring-brand-100" : "border-slate-200"
                      }`}
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <div className="text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-400">
                            จุดส่ง {row.routeIndex || "-"}
                          </div>
                          <div className="mt-1 break-words text-base font-bold text-slate-950">{row.poNumber}</div>
                          <div className="mt-1 break-words text-sm text-slate-600">{row.customerName || "-"}</div>
                        </div>
                        <StatusBadge status={row.status} />
                      </div>

                      <div className="mt-3 grid gap-2 text-sm text-slate-600">
                        <div>
                          <span className="font-semibold text-slate-900">วันที่ส่ง: </span>
                          {row.deliveryDate ? formatDate(row.deliveryDate) : "-"}
                        </div>
                        <div>
                          <span className="font-semibold text-slate-900">ติดต่อ: </span>
                          {row.contact || "-"}
                        </div>
                        <div className="leading-6">
                          <span className="font-semibold text-slate-900">ที่อยู่: </span>
                          <ExpandableText value={row.address || "-"} limit={120} />
                        </div>
                      </div>

                      <div className="mt-3 flex flex-wrap gap-2">
                        <ToneBadge>
                          {row.distanceFromHubKm === null ? "-" : `${row.distanceFromHubKm.toFixed(1)} km`}
                        </ToneBadge>
                        <ToneBadge tone="success">{formatCurrency(row.totals.amount)}</ToneBadge>
                        {row.mapsUrl ? (
                          <a
                            href={row.mapsUrl}
                            target="_blank"
                            rel="noreferrer"
                            className="inline-flex border border-brand-200 bg-brand-50 px-3 py-1.5 text-xs font-semibold text-brand-700 hover:bg-brand-100"
                          >
                            แผนที่
                          </a>
                        ) : null}
                      </div>

                      <div className="mt-3">
                        <textarea
                          value={deliveryNote}
                          onChange={(event) => setDraftValue(row.poNumber, event.target.value)}
                          disabled={!canAct || isFinal || (activeStop && !isActiveStep)}
                          placeholder="บันทึกผลการจัดส่ง"
                          className="min-h-[84px]"
                        />
                      </div>

                      <div className="mt-3 grid gap-2">
                        <button
                          type="button"
                          className="bg-brand-600 px-3 py-3 text-sm font-semibold text-white hover:bg-brand-700 disabled:cursor-not-allowed disabled:bg-slate-300"
                          onClick={() => handleStopUpdate(row, STATUS.OUT_FOR_DELIVERY)}
                          disabled={!canAct || row.status !== STATUS.ASSIGNED || Boolean(startPointError)}
                          title={startPointError || ""}
                        >
                          เริ่มจุดส่ง
                        </button>
                        <div className="grid grid-cols-2 gap-2">
                          <button
                            type="button"
                            className="border border-emerald-200 bg-emerald-50 px-3 py-3 text-sm font-semibold text-emerald-700 hover:bg-emerald-100 disabled:cursor-not-allowed disabled:text-slate-300"
                            onClick={() => handleStopUpdate(row, STATUS.DELIVERED)}
                            disabled={!canAct || row.status !== STATUS.OUT_FOR_DELIVERY || Boolean(deliveredError)}
                            title={deliveredError || ""}
                          >
                            ส่งสำเร็จ
                          </button>
                          <button
                            type="button"
                            className="border border-rose-200 bg-rose-50 px-3 py-3 text-sm font-semibold text-rose-700 hover:bg-rose-100 disabled:cursor-not-allowed disabled:text-slate-300"
                            onClick={() => handleStopUpdate(row, STATUS.FAILED)}
                            disabled={!canAct || row.status !== STATUS.OUT_FOR_DELIVERY || Boolean(failedTransitionError)}
                            title={failedTransitionError || ""}
                          >
                            ส่งไม่สำเร็จ
                          </button>
                        </div>
                      </div>

                      {row.dispatchStartedAt || row.dispatchDeliveredAt ? (
                        <div className="mt-3 space-y-1 text-xs text-slate-500">
                          {row.dispatchStartedAt ? <div>เริ่มจุดส่ง: {formatDateTime(row.dispatchStartedAt)}</div> : null}
                          {row.dispatchDeliveredAt ? (
                            <div>{`${STOP_RESULT_LABELS[row.status] || "ปิดผลจุดส่ง"}: ${formatDateTime(row.dispatchDeliveredAt)}`}</div>
                          ) : null}
                        </div>
                      ) : null}

                      {helperMessage ? (
                        <div
                          className={`mt-3 text-xs leading-5 ${
                            inlineNotice?.tone === "error"
                              ? "text-rose-700"
                              : inlineNotice?.tone === "success"
                                ? "text-emerald-700"
                                : "text-amber-700"
                          }`}
                        >
                          {helperMessage}
                        </div>
                      ) : null}
                    </article>
                  );
                })}
              </div>

              <div className="hidden overflow-x-auto border border-slate-200 bg-white md:block">
              <table className="min-w-[1480px] w-full text-left text-sm text-slate-700">
                <thead className="bg-slate-50 text-xs uppercase tracking-[0.18em] text-slate-500">
                  <tr>
                    <th className="px-4 py-3 font-semibold">ลำดับ</th>
                    <th className="px-4 py-3 font-semibold">PO / ลูกค้า</th>
                    <th className="px-4 py-3 font-semibold">วันส่ง / ติดต่อ</th>
                    <th className="px-4 py-3 font-semibold">ที่อยู่และแผนที่</th>
                    <th className="px-4 py-3 font-semibold">ระยะทาง / มูลค่า</th>
                    <th className="px-4 py-3 font-semibold">สถานะและเวลา</th>
                    <th className="px-4 py-3 font-semibold">บันทึกผลการจัดส่ง</th>
                    <th className="px-4 py-3 font-semibold">การดำเนินการ</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200">
                  {rows.map((row) => {
                    const deliveryNote = drafts[row.poNumber]?.deliveryNote ?? row.deliveryNote ?? "";
                    const canAct = routeStarted && !routeFinished;
                    const isFinal = FINAL_STATUSES.includes(row.status);
                    const isActiveStep = activeStop?.poNumber === row.poNumber;
                    const transitionOptions = buildTransitionOptions(row);
                    const sequenceError =
                      canAct && !isFinal && activeStop && !isActiveStep
                        ? `รอปิดจุดลำดับ ${activeStop.routeIndex || activeStopIndex + 1} (${activeStop.poNumber}) ก่อน`
                        : "";
                    const startPointError =
                      row.status === STATUS.ASSIGNED
                        ? sequenceError || getSafeTransitionError(row, STATUS.OUT_FOR_DELIVERY, currentUser?.role, transitionOptions)
                        : "";
                    const deliveredError =
                      row.status === STATUS.OUT_FOR_DELIVERY
                        ? sequenceError || getSafeTransitionError(row, STATUS.DELIVERED, currentUser?.role, transitionOptions)
                        : "";
                    const failedNoteError =
                      row.status === STATUS.OUT_FOR_DELIVERY && !String(deliveryNote || "").trim()
                        ? "กรุณาบันทึกเหตุผลการส่งไม่สำเร็จก่อน"
                        : "";
                    const failedTransitionError =
                      row.status === STATUS.OUT_FOR_DELIVERY
                        ? sequenceError ||
                          getSafeTransitionError(row, STATUS.FAILED, currentUser?.role, transitionOptions)
                        : "";
                    const inlineNotice = rowNotices[row.poNumber];
                    let helperMessage = inlineNotice?.message || "";

                    if (!helperMessage) {
                      if (!routeStarted) {
                        helperMessage = "เริ่มรอบส่งก่อนจึงจะกดปุ่มของแต่ละจุดได้";
                      } else if (routeFinished) {
                        helperMessage = "รอบส่งนี้ถูกปิดแล้ว";
                      } else if (row.status === STATUS.ASSIGNED && startPointError) {
                        helperMessage = startPointError;
                      } else if (row.status === STATUS.OUT_FOR_DELIVERY && deliveredError) {
                        helperMessage = deliveredError;
                      } else if (row.status === STATUS.OUT_FOR_DELIVERY && failedTransitionError) {
                        helperMessage = failedTransitionError;
                      } else if (row.status === STATUS.OUT_FOR_DELIVERY && failedNoteError) {
                        helperMessage = failedNoteError;
                      } else if (sequenceError) {
                        helperMessage = sequenceError;
                      }
                    }

                    return (
                      <tr key={row.poNumber} className="align-top hover:bg-slate-50/70">
                        <td className="px-4 py-4">
                          <div className="space-y-2">
                            <div className="flex h-10 w-10 items-center justify-center bg-brand-50 text-base font-bold text-brand-700">
                              {row.routeIndex || "-"}
                            </div>
                            {isActiveStep && canAct && !isFinal ? (
                              <div className="text-xs font-semibold text-brand-700">จุดที่กำลังทำงาน</div>
                            ) : null}
                          </div>
                        </td>
                        <td className="px-4 py-4">
                          <div className="font-semibold text-slate-950">{row.poNumber}</div>
                          <div className="mt-1 text-sm text-slate-600">{row.customerName || "-"}</div>
                        </td>
                        <td className="px-4 py-4">
                          <div>{row.deliveryDate ? formatDate(row.deliveryDate) : "ยังไม่ระบุวันส่ง"}</div>
                          <div className="mt-1 text-xs text-slate-500">{row.contact || "ยังไม่มีข้อมูลติดต่อ"}</div>
                        </td>
                        <td className="px-4 py-4">
                          <div className="max-w-[320px] whitespace-normal break-words leading-6 text-slate-600">
                            <ExpandableText value={row.address || "ยังไม่มีที่อยู่จัดส่ง"} />
                          </div>
                          <div className="mt-3">
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
                              <ToneBadge tone="warning">ไม่มีลิงก์แผนที่</ToneBadge>
                            )}
                          </div>
                        </td>
                        <td className="px-4 py-4">
                          <div className="flex flex-wrap gap-2">
                            <ToneBadge>
                              {row.distanceFromHubKm === null
                                ? "ยังไม่มีพิกัด"
                                : `ห่างจากศูนย์ ${row.distanceFromHubKm.toFixed(1)} กม.`}
                            </ToneBadge>
                            <ToneBadge tone="success">{formatCurrency(row.totals.amount)}</ToneBadge>
                          </div>
                        </td>
                        <td className="px-4 py-4">
                          <StatusBadge status={row.status} />
                          <div className="mt-3 space-y-1 text-xs text-slate-500">
                            {row.dispatchStartedAt ? <div>เริ่มจุดส่ง: {formatDateTime(row.dispatchStartedAt)}</div> : null}
                            {row.dispatchDeliveredAt ? (
                              <div>{`${STOP_RESULT_LABELS[row.status] || "ปิดผลจุดส่ง"}: ${formatDateTime(row.dispatchDeliveredAt)}`}</div>
                            ) : null}
                          </div>
                        </td>
                        <td className="px-4 py-4">
                          <div className="min-w-[260px]">
                            <textarea
                              value={deliveryNote}
                              onChange={(event) => setDraftValue(row.poNumber, event.target.value)}
                              disabled={!canAct || isFinal || (activeStop && !isActiveStep)}
                              placeholder="บันทึกผลการจัดส่ง"
                            />
                          </div>
                        </td>
                        <td className="px-4 py-4">
                          <div className="flex min-w-[320px] flex-wrap gap-2">
                            <button
                              type="button"
                              className="bg-brand-600 px-3 py-2 text-sm font-semibold text-white hover:bg-brand-700 disabled:cursor-not-allowed disabled:bg-slate-300"
                              onClick={() => handleStopUpdate(row, STATUS.OUT_FOR_DELIVERY)}
                              disabled={!canAct || row.status !== STATUS.ASSIGNED || Boolean(startPointError)}
                              title={startPointError || ""}
                            >
                              เริ่มจุดส่ง
                            </button>
                            <button
                              type="button"
                              className="border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm font-semibold text-emerald-700 hover:bg-emerald-100 disabled:cursor-not-allowed disabled:text-slate-300"
                              onClick={() => handleStopUpdate(row, STATUS.DELIVERED)}
                              disabled={!canAct || row.status !== STATUS.OUT_FOR_DELIVERY || Boolean(deliveredError)}
                              title={deliveredError || ""}
                            >
                              ส่งสำเร็จ
                            </button>
                            <button
                              type="button"
                              className="border border-rose-200 bg-rose-50 px-3 py-2 text-sm font-semibold text-rose-700 hover:bg-rose-100 disabled:cursor-not-allowed disabled:text-slate-300"
                              onClick={() => handleStopUpdate(row, STATUS.FAILED)}
                              disabled={!canAct || row.status !== STATUS.OUT_FOR_DELIVERY || Boolean(failedTransitionError)}
                              title={failedTransitionError || ""}
                            >
                              ส่งไม่สำเร็จ
                            </button>
                          </div>
                          {helperMessage ? (
                            <div
                              className={`mt-3 text-xs leading-5 ${
                                inlineNotice?.tone === "error"
                                  ? "text-rose-700"
                                  : inlineNotice?.tone === "success"
                                    ? "text-emerald-700"
                                    : "text-amber-700"
                              }`}
                            >
                              {helperMessage}
                            </div>
                          ) : null}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            </>
          )}
        </SectionCard>
      </div>
    </AppShell>
  );
}
