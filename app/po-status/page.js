"use client";

import { useMemo, useState } from "react";
import { AppShell } from "@/components/ui/Shell";
import { SectionCard, StatCard } from "@/components/ui/Cards";
import { EmptyState } from "@/components/ui/EmptyState";
import { StatusBadge, ToneBadge } from "@/components/ui/Badge";
import { WorkflowSteps } from "@/components/ui/Workflow";
import { useAppState } from "@/lib/app-state";
import { STATUS, STATUS_LABELS } from "@/lib/config";
import { formatDate } from "@/lib/format";
import { getOperationalStatus, getSafeTransitionError } from "@/lib/workflow";

function Notice({ message, tone = "success" }) {
  const classes =
    tone === "error"
      ? "border-rose-200 bg-rose-50 text-rose-700"
      : "border-emerald-200 bg-emerald-50 text-emerald-700";

  return <div className={`border px-4 py-3 text-sm font-medium ${classes}`}>{message}</div>;
}

function renderWarehouseSignals(item) {
  return (
    <div className="flex flex-wrap gap-2">
      {item.confirmedAt ? <ToneBadge tone="brand">ฝ่ายขายยืนยันแล้ว</ToneBadge> : null}
      {item.preparedAt || item.readyForRouteAt ? <ToneBadge tone="warning">คลังเตรียมเสร็จแล้ว</ToneBadge> : null}
      {item.assignedDriverId ? <ToneBadge tone="success">มอบหมายคนขับแล้ว</ToneBadge> : null}
      {item.routeStartedAt ? <ToneBadge tone="success">เริ่มวิ่งงานแล้ว</ToneBadge> : null}
      {!item.confirmedAt && !item.preparedAt && !item.assignedDriverId ? <ToneBadge>รอขั้นตอนก่อนหน้า</ToneBadge> : null}
    </div>
  );
}

function getWarehouseActionState(item, currentUser) {
  const status = getOperationalStatus(item);
  const role = currentUser?.role;
  const context = {
    actorId: currentUser?.id,
    assignedDriverId: item.assignedDriverId,
    routeStartedAt: item.routeStartedAt,
  };

  if (status === STATUS.LINE_RECEIVED) {
    return {
      kind: "info",
      title: "รอฝ่ายขายยืนยัน PO",
      detail: "คลังยังขยับงานนี้ต่อไม่ได้จนกว่าฝ่ายขายจะยืนยันข้อมูลก่อน",
    };
  }

  if (status === STATUS.CONFIRMED) {
    const error = getSafeTransitionError(item, STATUS.PREPARED, role, context);
    if (!error) {
      return {
        kind: "action",
        nextStatus: STATUS.PREPARED,
        label: "ยืนยันเตรียมสินค้าแล้ว",
        detail: "กดเมื่อหยิบสินค้า ตรวจนับ และแพ็กของสำหรับ PO นี้เสร็จแล้ว",
      };
    }

    return {
      kind: "info",
      title: "รอคลังดำเนินการ",
      detail: error,
    };
  }

  if (status === STATUS.PREPARED) {
    const error = getSafeTransitionError(item, STATUS.CONFIRMED, role, context);
    if (!error) {
      return {
        kind: "action",
        nextStatus: STATUS.CONFIRMED,
        label: "ย้อนกลับเป็นยืนยัน PO",
        detail: "ใช้เมื่อคลังต้องย้อนงานกลับไปขั้นยืนยัน PO ก่อนส่งต่อให้ทีมจัดรถ",
      };
    }

    return {
      kind: "done",
      title: "ส่งต่อทีมจัดรถแล้ว",
      detail: "คลังทำเสร็จแล้ว ขั้นถัดไปคือทีมจัดส่งวางแผน route และมอบหมายคนขับ",
    };
  }

  if (status === STATUS.ASSIGNED) {
    return {
      kind: "done",
      title: "รอคนขับออกวิ่ง",
      detail: "งานนี้ถูกมอบหมายคนขับแล้ว คลังไม่ต้องเปลี่ยนสถานะในหน้านี้",
    };
  }

  if (status === STATUS.OUT_FOR_DELIVERY) {
    return {
      kind: "done",
      title: "กำลังจัดส่ง",
      detail: "คนขับกำลังดำเนินการจัดส่งแล้ว",
    };
  }

  if ([STATUS.DELIVERED, STATUS.FAILED, STATUS.RETURNED].includes(status)) {
    return {
      kind: "done",
      title: "ปิดผลจัดส่งแล้ว",
      detail: "รอเก็บเข้าประวัติในขั้นตอนปิดรอบส่ง",
    };
  }

  return {
    kind: "info",
    title: "ไม่มีการดำเนินการของคลัง",
    detail: "สถานะนี้ไม่ต้องเปลี่ยนจากหน้าคลังสินค้า",
  };
}

export default function PoStatusPage() {
  const { currentUser, state, updateLineOrderStatus } = useAppState();
  const [query, setQuery] = useState("");
  const [notice, setNotice] = useState({ message: "", tone: "success" });

  const items = useMemo(() => {
    const keyword = String(query || "").trim().toLowerCase();

    return (state.lineOrders || [])
      .filter((item) => getOperationalStatus(item) !== STATUS.ARCHIVED)
      .filter((item) => {
        if (!keyword) return true;

        return [item.poNumber, item.customerName, item.contact, item.address, item.status].some((value) =>
          String(value || "")
            .toLowerCase()
            .includes(keyword)
        );
      })
      .sort((left, right) => {
        const leftStatus = getOperationalStatus(left);
        const rightStatus = getOperationalStatus(right);
        if (leftStatus !== rightStatus) return String(leftStatus).localeCompare(String(rightStatus));
        return String(left.deliveryDate || "").localeCompare(String(right.deliveryDate || ""));
      });
  }, [query, state.lineOrders]);

  const summary = useMemo(
    () =>
      items.reduce(
        (acc, item) => {
          const status = getOperationalStatus(item);
          acc.total += 1;
          acc[status] = (acc[status] || 0) + 1;
          return acc;
        },
        { total: 0 }
      ),
    [items]
  );

  const handleAction = async (poNumber, nextStatus) => {
    const result = await updateLineOrderStatus(poNumber, nextStatus);

    setNotice({
      message: result.ok
        ? `อัปเดต ${poNumber} เป็น ${STATUS_LABELS[nextStatus] || nextStatus} แล้ว`
        : result.message || `ไม่สามารถอัปเดต ${poNumber} ได้`,
      tone: result.ok ? "success" : "error",
    });
  };

  return (
    <AppShell
      currentPath="/po-status"
      title="สถานะ PO"
      description="หน้าคลังใช้สำหรับดูสถานะ PO และกดเฉพาะขั้นตอนที่คลังต้องทำจริง คือยืนยันว่าเตรียมสินค้าแล้ว"
    >
      <div className="space-y-6">
        {notice.message ? <Notice message={notice.message} tone={notice.tone} /> : null}

        <SectionCard
          title="มาตรฐานขั้นตอนงาน"
          description="ทุก PO ใช้ลำดับสถานะชุดเดียวกัน แต่หน้าคลังจะทำงานเฉพาะช่วงหลังฝ่ายขายยืนยันแล้ว"
        >
          <WorkflowSteps status="PREPARED" />
        </SectionCard>

        <SectionCard
          title="ภาพรวมคิวงานคลัง"
          description="ค้นหา PO และดูว่ารายการใดกำลังรอคลังเตรียมสินค้าอยู่"
        >
          <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_repeat(4,160px)]">
            <input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="ค้นหาจาก PO ลูกค้า เบอร์โทร หรือที่อยู่"
            />
            <StatCard label="PO ที่เปิดอยู่" value={summary.total || 0} />
            <StatCard label="รอฝ่ายขาย" value={summary.LINE_RECEIVED || 0} />
            <StatCard label="รอคลังเตรียม" value={summary.CONFIRMED || 0} tone="brand" />
            <StatCard label="คลังเตรียมแล้ว" value={summary.PREPARED || 0} tone="warning" />
          </div>
        </SectionCard>

        <SectionCard
          title="บอร์ดปฏิบัติการคลัง"
          description="คลังสามารถสลับงานระหว่าง ยืนยัน PO และ เตรียมสินค้าแล้ว ได้ตามสิทธิ์ ส่วนแถวอื่นจะแสดงว่ากำลังรอฝ่ายไหน"
        >
          {!items.length ? (
            <EmptyState text="ไม่พบรายการ PO ตามตัวกรองที่เลือก" />
          ) : (
            <div className="overflow-x-auto border border-slate-200 bg-white">
              <table className="min-w-[1320px] w-full text-left text-sm text-slate-700">
                <thead className="bg-slate-50 text-xs uppercase tracking-[0.18em] text-slate-500">
                  <tr>
                    <th className="px-4 py-3 font-semibold">เลขที่ PO</th>
                    <th className="px-4 py-3 font-semibold">ลูกค้า</th>
                    <th className="px-4 py-3 font-semibold">วันส่ง / ติดต่อ</th>
                    <th className="px-4 py-3 font-semibold">ที่อยู่จัดส่ง</th>
                    <th className="px-4 py-3 font-semibold">สถานะ</th>
                    <th className="px-4 py-3 font-semibold">สัญญาณงาน</th>
                    <th className="px-4 py-3 font-semibold">งานของคลัง</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200">
                  {items.map((item) => {
                    const displayStatus = getOperationalStatus(item);
                    const actionState = getWarehouseActionState(item, currentUser);

                    return (
                      <tr key={item.poNumber} className="align-top hover:bg-slate-50/70">
                        <td className="px-4 py-4">
                          <div className="font-semibold text-slate-950">{item.poNumber}</div>
                        </td>
                        <td className="px-4 py-4">
                          <div className="font-medium text-slate-900">{item.customerName || "-"}</div>
                        </td>
                        <td className="px-4 py-4">
                          <div>{item.deliveryDate ? formatDate(item.deliveryDate) : "ยังไม่ระบุวันส่ง"}</div>
                          <div className="mt-1 text-xs text-slate-500">{item.contact || "ยังไม่มีข้อมูลติดต่อ"}</div>
                        </td>
                        <td className="px-4 py-4">
                          <div className="max-w-[340px] whitespace-normal break-words leading-6 text-slate-600">
                            {item.address || "ยังไม่มีที่อยู่จัดส่ง"}
                          </div>
                        </td>
                        <td className="px-4 py-4">
                          <StatusBadge status={displayStatus} />
                        </td>
                        <td className="px-4 py-4">{renderWarehouseSignals(item)}</td>
                        <td className="px-4 py-4">
                          {actionState.kind === "action" ? (
                            <div className="space-y-2">
                              <button
                                type="button"
                                className="bg-slate-950 px-3 py-2 text-sm font-semibold text-white transition hover:bg-slate-800"
                                onClick={() => handleAction(item.poNumber, actionState.nextStatus)}
                              >
                                {actionState.label}
                              </button>
                              <div className="max-w-[320px] text-xs leading-5 text-slate-500">{actionState.detail}</div>
                            </div>
                          ) : (
                            <div className="space-y-2">
                              <ToneBadge tone={actionState.kind === "done" ? "success" : "slate"}>{actionState.title}</ToneBadge>
                              <div className="max-w-[320px] text-xs leading-5 text-slate-500">{actionState.detail}</div>
                            </div>
                          )}
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
