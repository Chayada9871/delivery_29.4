"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { AppShell } from "@/components/ui/Shell";
import { SectionCard, StatCard } from "@/components/ui/Cards";
import { EmptyState } from "@/components/ui/EmptyState";
import { StatusBadge, ToneBadge } from "@/components/ui/Badge";
import { useAppState } from "@/lib/app-state";
import { ROLES, STATUS } from "@/lib/config";
import { buildReturnedHistoryGroups } from "@/lib/selectors";
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

export default function ReturnHistoryClient() {
  const { state, currentUser, updateLineOrderDispatch } = useAppState();
  const router = useRouter();
  const searchParams = useSearchParams();
  const [selectedDate, setSelectedDate] = useState("ALL");
  const [selectedStatus, setSelectedStatus] = useState(() => {
    const value = String(searchParams?.get("status") || "").trim().toUpperCase();
    return value === STATUS.FAILED ? STATUS.FAILED : STATUS.RETURNED;
  });
  const [notice, setNotice] = useState({ message: "", tone: "success" });
  const [busyPoNumber, setBusyPoNumber] = useState("");

  const historyGroups = useMemo(
    () => buildReturnedHistoryGroups(state.lineOrders, selectedStatus),
    [state.lineOrders, selectedStatus]
  );

  useEffect(() => {
    if (selectedDate === "ALL") return;
    if (historyGroups.some((group) => group.date === selectedDate)) return;
    setSelectedDate(historyGroups[0]?.date || "ALL");
  }, [historyGroups, selectedDate]);

  useEffect(() => {
    const value = String(searchParams?.get("status") || "").trim().toUpperCase();
    const nextStatus = value === STATUS.FAILED ? STATUS.FAILED : STATUS.RETURNED;
    setSelectedStatus(nextStatus);
  }, [searchParams]);

  const handleStatusChange = (nextStatus) => {
    setSelectedStatus(nextStatus);
    const params = new URLSearchParams(searchParams?.toString() || "");
    params.set("status", nextStatus);
    router.replace(`/return-history?${params.toString()}`);
  };

  const visibleGroups = useMemo(
    () => (selectedDate === "ALL" ? historyGroups : historyGroups.filter((group) => group.date === selectedDate)),
    [historyGroups, selectedDate]
  );

  const isFailedMode = selectedStatus === STATUS.FAILED;
  const pageDescription = isFailedMode
    ? "รวบรวมเฉพาะรายการที่คนขับปิดผลเป็นส่งไม่สำเร็จ เพื่อใช้ติดตามเหตุผลและตรวจสอบรอบส่งย้อนหลังได้ทันที"
    : "รวบรวมเฉพาะรายการที่คนขับปิดผลเป็นคืนสินค้า เพื่อใช้ติดตามเหตุผลและตรวจสอบรอบส่งย้อนหลังได้ทันที";

  const handleConfirmFailed = async (item) => {
    if (!item?.poNumber) return;
    if (!currentUser || currentUser.role !== ROLES.MANAGER) {
      setNotice({ message: "เฉพาะผู้จัดการเท่านั้นที่ยืนยันส่งไม่สำเร็จได้", tone: "warning" });
      return;
    }

    setBusyPoNumber(item.poNumber);
    const now = new Date().toISOString();
    const result = await updateLineOrderDispatch(item.poNumber, {
      returnReportedAt: now,
      returnHandledBy: String(currentUser?.name || "").trim(),
    });

    setBusyPoNumber("");
    setNotice({
      message: result.ok ? `${item.poNumber} ยืนยันส่งไม่สำเร็จแล้ว` : result.message || `ไม่สามารถยืนยัน ${item.poNumber} ได้`,
      tone: result.ok ? "success" : "error",
    });
  };

  const handleCancelFailed = async (item) => {
    if (!item?.poNumber) return;
    if (!currentUser || currentUser.role !== ROLES.MANAGER) {
      setNotice({ message: "เฉพาะผู้จัดการเท่านั้นที่ยกเลิกส่งไม่สำเร็จได้", tone: "warning" });
      return;
    }

    if (item.routeFinishedAt || item.routeArchived) {
      setNotice({ message: "ยกเลิกส่งไม่สำเร็จได้เฉพาะก่อนปิดรอบส่งเท่านั้น", tone: "warning" });
      return;
    }

    setBusyPoNumber(item.poNumber);
    const result = await updateLineOrderDispatch(item.poNumber, {
      status: STATUS.OUT_FOR_DELIVERY,
      finalStatus: "",
      dispatchStatus: "",
      dispatchDeliveredAt: "",
      returnReportedAt: "",
      returnHandledBy: "",
    });

    setBusyPoNumber("");
    setNotice({
      message: result.ok ? `${item.poNumber} ถูกยกเลิกสถานะส่งไม่สำเร็จแล้ว` : result.message || `ไม่สามารถยกเลิก ${item.poNumber} ได้`,
      tone: result.ok ? "success" : "error",
    });
  };

  return (
    <AppShell
      currentPath="/return-history"
      title="ประวัติการยกเลิก"
      description={pageDescription}
    >
      <div className="space-y-6">
        {notice.message ? <Notice message={notice.message} tone={notice.tone} /> : null}
        <SectionCard
          title="ตัวกรองประวัติการยกเลิก"
          description={
            isFailedMode
              ? "แสดงเฉพาะงานที่ส่งไม่สำเร็จ โดยงานที่ปิดรอบแล้วจะมี snapshot ตอนจบงานครบถ้วนสำหรับตรวจย้อนหลัง"
              : "แสดงเฉพาะงานที่คืนสินค้า โดยงานที่ปิดรอบแล้วจะมี snapshot ตอนจบงานครบถ้วนสำหรับตรวจย้อนหลัง"
          }
        >
          <div className="space-y-4">
            <div>
              <div className="mb-2 text-sm font-semibold text-slate-900">ประเภทสถานะ</div>
              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  className={`rounded-full px-4 py-2 text-sm font-semibold ${
                    selectedStatus === STATUS.RETURNED
                      ? "bg-brand-600 text-white"
                      : "border border-slate-200 bg-white text-slate-700 hover:bg-slate-100"
                  }`}
                  onClick={() => handleStatusChange(STATUS.RETURNED)}
                >
                  คืนสินค้า
                </button>
                <button
                  type="button"
                  className={`rounded-full px-4 py-2 text-sm font-semibold ${
                    selectedStatus === STATUS.FAILED
                      ? "bg-brand-600 text-white"
                      : "border border-slate-200 bg-white text-slate-700 hover:bg-slate-100"
                  }`}
                  onClick={() => handleStatusChange(STATUS.FAILED)}
                >
                  ส่งไม่สำเร็จ
                </button>
              </div>
            </div>
            <div className="grid gap-4 lg:grid-cols-[280px_minmax(0,1fr)]">
              <label className="block">
                <div className="mb-2 text-sm font-semibold text-slate-900">เลือกวันที่จากปฏิทิน</div>
                <input
                  type="date"
                  value={selectedDate === "ALL" ? "" : selectedDate}
                  onChange={(event) => setSelectedDate(event.target.value || "ALL")}
                  list="return-history-dates"
                />
                <datalist id="return-history-dates">
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
                    ทุกวันที่มีการยกเลิก
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
          <SectionCard title="รายการยกเลิก">
            <EmptyState text="ยังไม่มีรายการยกเลิกในประวัติสำหรับตัวกรองที่เลือก" />
          </SectionCard>
        ) : (
          visibleGroups.map((group) => (
            <SectionCard
              key={group.date}
              title={`ประวัติการยกเลิกของวันที่ ${group.date.includes("-") ? formatDate(group.date) : group.date}`}
              description={
                isFailedMode
                  ? "ใช้ตรวจสอบเหตุผลการส่งไม่สำเร็จ เลขไมล์ และข้อมูลรอบส่งย้อนหลังของแต่ละ PO"
                  : "ใช้ตรวจสอบเหตุผลการคืนสินค้า เลขไมล์ และข้อมูลรอบส่งย้อนหลังของแต่ละ PO"
              }
            >
              <div className="grid gap-4 md:grid-cols-3 xl:grid-cols-6">
                <StatCard label={isFailedMode ? "รายการส่งไม่สำเร็จ" : "รายการคืนสินค้า"} value={group.items.length} />
                <StatCard label="รวมจำนวนสินค้า" value={group.totals.quantity.toFixed(1)} />
                <StatCard
                  label={isFailedMode ? "มูลค่าส่งไม่สำเร็จ" : "มูลค่าคืนสินค้า"}
                  value={formatCurrency(group.totals.amount)}
                  tone="warning"
                />
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

              {group.distanceSummary.missingActualRoutes || group.distanceSummary.incompleteExpectedRoutes ? (
                <div className="mt-4 flex flex-wrap gap-2">
                  {group.distanceSummary.missingActualRoutes ? (
                    <ToneBadge tone="warning">บางรอบไม่มีข้อมูลเลขไมล์จริง</ToneBadge>
                  ) : null}
                  {group.distanceSummary.incompleteExpectedRoutes ? (
                    <ToneBadge tone="warning">บางรอบคำนวณกม.คาดการณ์ไม่ได้ครบเพราะพิกัดไม่สมบูรณ์</ToneBadge>
                  ) : null}
                </div>
              ) : null}

              <div className="mt-5 overflow-x-auto border border-slate-200 bg-white">
                <table className="min-w-[1780px] text-left text-sm">
                  <thead className="border-b border-slate-200 bg-slate-50 text-slate-600">
                    <tr>
                      <th className="px-4 py-3 font-semibold">ลำดับ</th>
                      <th className="px-4 py-3 font-semibold">PO / ลูกค้า</th>
                      <th className="px-4 py-3 font-semibold">วันส่ง / ติดต่อ</th>
                      <th className="px-4 py-3 font-semibold">ที่อยู่ / แผนที่</th>
                      <th className="px-4 py-3 font-semibold">มูลค่า / ระยะทาง</th>
                      <th className="px-4 py-3 font-semibold">{isFailedMode ? "เหตุผลส่งไม่สำเร็จ" : "เหตุผลคืนสินค้า"}</th>
                      <th className="px-4 py-3 font-semibold">ข้อมูลรอบส่ง</th>
                      <th className="px-4 py-3 font-semibold">สถานะ</th>
                      {isFailedMode ? <th className="px-4 py-3 font-semibold">การจัดการ</th> : null}
                    </tr>
                  </thead>
                  <tbody>
                    {group.items.map((item) => (
                      <tr key={item.historySnapshot?.historyId || item.poNumber} className="border-b border-slate-200 align-top">
                        <td className="px-4 py-4">
                          <div className="flex h-10 w-10 items-center justify-center border border-violet-100 bg-violet-50 text-sm font-bold text-violet-700">
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
                          <div className="mt-1">ขาคาดการณ์ของจุดนี้ {formatDistanceLabel(item.legDistanceKm)}</div>
                        </td>

                        <td className="px-4 py-4">
                          <div className="min-w-[280px] space-y-3">
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
                                {isFailedMode ? "เหตุผลส่งไม่สำเร็จจากคนขับ" : "เหตุผลคืนสินค้าจากคนขับ"}
                              </div>
                              <div className="mt-1">
                                <ExpandableText value={item.deliveryNote} emptyText="ยังไม่มีการบันทึกเหตุผล" maxLength={100} />
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
                            <div>เวลาเริ่มจุดส่ง: {formatDateTime(item.dispatchStartedAt)}</div>
                            <div>
                              {isFailedMode ? "เวลาปิดผลส่งไม่สำเร็จ" : "เวลาคืนสินค้า"}:{" "}
                              {formatDateTime(item.dispatchDeliveredAt)}
                            </div>
                            {isFailedMode ? (
                              item.returnReportedAt ? (
                                <div>
                                  เวลายืนยันส่งไม่สำเร็จ: {formatDateTime(item.returnReportedAt)}{" "}
                                  {item.returnHandledBy ? `(โดย ${item.returnHandledBy})` : ""}
                                </div>
                              ) : (
                                <div className="text-amber-700">สถานะ: รอยืนยันส่งไม่สำเร็จ</div>
                              )
                            ) : item.returnHandledBy ? (
                              <div>ผู้บันทึกคืนสินค้า: {item.returnHandledBy}</div>
                            ) : null}
                            <div>เวลาปิดรอบส่ง: {formatDateTime(item.routeFinishedAt)}</div>
                            <div>เวลาเก็บเข้าประวัติ: {formatDateTime(item.routeArchivedAt)}</div>
                          </div>
                        </td>

                        <td className="px-4 py-4">
                          <div className="flex min-w-[160px] flex-col gap-2">
                            <StatusBadge status={item.finalStatus || item.status} />
                            {isFailedMode ? (
                              <ToneBadge tone={item.returnReportedAt ? "brand" : "warning"}>
                                {item.returnReportedAt ? "ยืนยันส่งไม่สำเร็จแล้ว" : "ส่งไม่สำเร็จ"}
                              </ToneBadge>
                            ) : (
                              <ToneBadge tone="warning">คืนสินค้าแล้ว</ToneBadge>
                            )}
                          </div>
                        </td>

                        {isFailedMode ? (
                          <td className="px-4 py-4">
                            <div className="flex min-w-[220px] flex-col gap-2">
                              <button
                                type="button"
                                className="border border-brand-200 bg-brand-50 px-3 py-2 text-sm font-semibold text-brand-700 hover:bg-brand-100 disabled:cursor-not-allowed disabled:text-slate-300"
                                onClick={() => handleConfirmFailed(item)}
                                disabled={
                                  busyPoNumber === item.poNumber ||
                                  !currentUser ||
                                  currentUser.role !== ROLES.MANAGER ||
                                  Boolean(item.returnReportedAt)
                                }
                              >
                                {busyPoNumber === item.poNumber ? "กำลังบันทึก..." : "ยืนยันส่งไม่สำเร็จ"}
                              </button>
                              {!item.routeFinishedAt && !item.routeArchived && currentUser?.role === ROLES.MANAGER ? (
                                <button
                                  type="button"
                                  className="border border-slate-200 bg-white px-3 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-100 disabled:cursor-not-allowed disabled:text-slate-300"
                                  onClick={() => handleCancelFailed(item)}
                                  disabled={busyPoNumber === item.poNumber}
                                >
                                  {busyPoNumber === item.poNumber ? "กำลังยกเลิก..." : "ยกเลิกส่งไม่สำเร็จ"}
                                </button>
                              ) : null}
                            </div>
                          </td>
                        ) : null}
                      </tr>
                    ))}
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
