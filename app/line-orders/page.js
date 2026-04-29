"use client";

import { useEffect, useMemo, useState } from "react";
import { AppShell } from "@/components/ui/Shell";
import { SectionCard, StatCard } from "@/components/ui/Cards";
import { ProductPicker } from "@/components/sections/ProductPicker";
import { EmptyState } from "@/components/ui/EmptyState";
import { StatusBadge, ToneBadge } from "@/components/ui/Badge";
import { useAppState } from "@/lib/app-state";
import { formatCurrency, formatDate } from "@/lib/format";
import { buildItemsText, calculateSelectedTotals, validateLineOrderDraft } from "@/lib/validation";
import { FINAL_DELIVERY_STATUSES, canDeleteOrder, canEditOrder, getOperationalStatus, getSafeTransitionError } from "@/lib/workflow";
import { generatePurchaseOrderPdf } from "@/lib/pdf";

function createEmptyForm(poNumber = "") {
  return {
    editingId: "",
    poNumber,
    customerName: "",
    contact: "",
    paymentMethod: "Cash on delivery",
    address: "",
    mapsUrl: "",
    landmark: "",
    deliveryDate: "",
    deliveryTimeSlot: "",
    chatNote: "",
  };
}

function Notice({ message, tone = "success" }) {
  const classes =
    tone === "error"
      ? "border-rose-200 bg-rose-50 text-rose-700"
      : tone === "warning"
        ? "border-amber-200 bg-amber-50 text-amber-700"
        : "border-emerald-200 bg-emerald-50 text-emerald-700";

  return <div className={`rounded-[24px] border px-4 py-3 text-sm font-medium ${classes}`}>{message}</div>;
}

function ExpandableText({ value, maxLength = 96, emptyText = "-" }) {
  const [expanded, setExpanded] = useState(false);
  const text = String(value || "").trim();

  if (!text) {
    return <div className="leading-6 text-slate-700">{emptyText}</div>;
  }

  const isLong = text.length > maxLength;
  const preview = isLong ? `${text.slice(0, maxLength).trimEnd()}...` : text;

  return (
    <div className="space-y-2">
      <div className={`leading-6 text-slate-700 ${expanded ? "break-all" : "break-words"}`}>{expanded ? text : preview}</div>
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

export default function LineOrdersPage() {
  const {
    state,
    currentUser,
    selectedProducts,
    submitLineOrder,
    updateLineOrderStatus,
    deleteLineOrder,
    generatePoNumber,
    syncLineProductsFromPo,
  } = useAppState();

  const [notice, setNotice] = useState({ message: "", tone: "success" });
  const [form, setForm] = useState(createEmptyForm());

  const nextPoNumber = useMemo(() => generatePoNumber(), [generatePoNumber]);
  const totals = useMemo(() => calculateSelectedTotals(selectedProducts.line), [selectedProducts.line]);
  const visibleOrders = useMemo(
    () =>
      state.lineOrders.filter((order) => {
        const status = getOperationalStatus(order);
        return status !== "ARCHIVED" && !FINAL_DELIVERY_STATUSES.includes(status);
      }),
    [state.lineOrders]
  );
  const validation = useMemo(
    () =>
      validateLineOrderDraft(
        {
          ...form,
          selectedProducts: selectedProducts.line,
          items: buildItemsText(selectedProducts.line, ""),
        },
        { existingOrders: state.lineOrders }
      ),
    [form, selectedProducts.line, state.lineOrders]
  );
  const stockWarnings = useMemo(
    () => validation.warnings.filter((item) => item.code === "insufficient_stock"),
    [validation.warnings]
  );

  useEffect(() => {
    setForm((current) => {
      if (current.editingId) return current;
      if (current.poNumber === nextPoNumber) return current;
      return { ...current, poNumber: nextPoNumber };
    });
  }, [nextPoNumber]);

  const resetForm = () => {
    setForm(createEmptyForm(generatePoNumber()));
  };

  const handleEdit = (order) => {
    const loaded = syncLineProductsFromPo(order.poNumber) || order;
    setForm({
      editingId: loaded.id || "",
      poNumber: loaded.poNumber || "",
      customerName: loaded.customerName || "",
      contact: loaded.contact || "",
      paymentMethod: loaded.paymentMethod || "Cash on delivery",
      address: loaded.address || "",
      mapsUrl: loaded.mapsUrl || "",
      landmark: loaded.landmark || "",
      deliveryDate: loaded.deliveryDate || "",
      deliveryTimeSlot: loaded.deliveryTimeSlot || "",
      chatNote: loaded.chatNote || "",
    });
    setNotice({ message: `กำลังแก้ไข ${loaded.poNumber}`, tone: "warning" });
  };

  const handleSubmit = async (event) => {
    event.preventDefault();
    const result = await submitLineOrder({
      ...form,
      items: buildItemsText(selectedProducts.line, ""),
    });

    if (!result.ok) {
      setNotice({ message: result.message || "ไม่สามารถบันทึก PO ได้", tone: "error" });
      return;
    }

    setNotice({
      message: form.editingId ? `อัปเดต ${result.record.poNumber} เรียบร้อย` : `สร้าง ${result.record.poNumber} เป็นสถานะรับออเดอร์จากไลน์แล้ว`,
      tone: result.warnings?.length ? "warning" : "success",
    });
    if ((result.warnings || []).some((item) => item.code === "insufficient_stock")) {
      const stockShortageWarnings = result.warnings.filter((item) => item.code === "insufficient_stock");
      setNotice({
        message: `${form.editingId ? "อัปเดต" : "บันทึก"} ${result.record.poNumber} เรียบร้อยแล้ว โดยมีสินค้า ${stockShortageWarnings.length} รายการสต็อกไม่พอ`,
        tone: "warning",
      });
    }
    resetForm();
  };

  const handleConfirm = async (order) => {
    const result = await updateLineOrderStatus(order.poNumber, "CONFIRMED");
    setNotice({
      message: result.ok ? `ยืนยัน ${order.poNumber} เรียบร้อย` : result.message || "ไม่สามารถยืนยัน PO ได้",
      tone: result.ok ? "success" : "error",
    });
  };

  const handleMoveBackToLine = async (order) => {
    const result = await updateLineOrderStatus(order.poNumber, "LINE_RECEIVED");
    setNotice({
      message: result.ok ? `ย้าย ${order.poNumber} กลับไปขั้นรับออเดอร์จากไลน์แล้ว` : result.message || "ไม่สามารถย้อนสถานะ PO ได้",
      tone: result.ok ? "success" : "error",
    });
  };

  const handleDelete = async (order) => {
    if (typeof window !== "undefined") {
      const confirmed = window.confirm(`ต้องการลบ ${order.poNumber} ใช่หรือไม่ การกระทำนี้ไม่สามารถย้อนกลับได้`);
      if (!confirmed) return;
    }

    const result = await deleteLineOrder(order.poNumber);
    setNotice({
      message: result.ok
        ? result.mode === "soft_delete"
          ? `ลบ ${order.poNumber} เรียบร้อยแล้ว และซ่อนออกจากรายการในระบบ`
          : `ลบ ${order.poNumber} เรียบร้อย`
        : result.message || `ไม่สามารถลบ ${order.poNumber} ได้`,
      tone: result.ok ? "success" : "error",
    });
    if (form.poNumber === order.poNumber) resetForm();
  };

  const handleOpenPdf = async (order) => {
    try {
      await generatePurchaseOrderPdf(order, { autoPrint: false });
      setNotice({ message: `เปิด PDF ของ ${order.poNumber} แล้ว`, tone: "success" });
    } catch (error) {
      setNotice({ message: error?.message || "ไม่สามารถสร้างไฟล์ PDF ได้", tone: "error" });
    }
  };

  return (
    <AppShell
      currentPath="/line-orders"
      title="รับออเดอร์จากไลน์"
      description="บันทึกออเดอร์ลูกค้าจาก Line ตรวจสอบข้อมูลสำคัญให้ครบ และสร้าง PO ที่พร้อมส่งต่อไปยังคลังและฝ่ายจัดส่ง"
    >
      <div className="space-y-6">
        {notice.message ? <Notice message={notice.message} tone={notice.tone} /> : null}

        <SectionCard title="สรุปออเดอร์ที่กำลังกรอก" description="ตัวเลขของ PO ที่กำลังจัดเตรียมอยู่ในฟอร์มนี้แบบเรียลไทม์">
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
            <StatCard
              label="เลขที่ PO"
              value={form.poNumber || nextPoNumber}
              hint={form.editingId ? "กำลังแก้ไขข้อมูลเดิม" : "รันอัตโนมัติจากเลข PO ล่าสุดในระบบ"}
              tone="brand"
            />
            <StatCard label="จำนวนบรรทัดสินค้า" value={totals.lines} />
            <StatCard label="รวมจำนวนสินค้า" value={totals.quantity.toFixed(1)} />
            <StatCard label="ยอดประมาณการ" value={formatCurrency(totals.amount)} hint="คำนวณจากสินค้าที่เลือก" tone="success" />
          </div>
        </SectionCard>

        <SectionCard title={form.editingId ? "แก้ไข PO เดิม" : "สร้าง PO ใหม่"} description="กรอกข้อมูลลูกค้า วันส่ง และตำแหน่งจัดส่งให้ครบ เพื่อให้คลังและฝ่ายจัดส่งทำงานต่อได้อย่างไม่สะดุด">
            <form className="space-y-5" onSubmit={handleSubmit} noValidate>
              <div className="grid gap-4 lg:grid-cols-2">
                <label className="block">
                  <div className="mb-2 text-sm font-semibold text-slate-900">ชื่อลูกค้า</div>
                  <input value={form.customerName} onChange={(event) => setForm({ ...form, customerName: event.target.value })} />
                </label>
                <label className="block">
                  <div className="mb-2 text-sm font-semibold text-slate-900">ข้อมูลติดต่อ</div>
                  <input value={form.contact} onChange={(event) => setForm({ ...form, contact: event.target.value })} />
                </label>
                <label className="block">
                  <div className="mb-2 text-sm font-semibold text-slate-900">วิธีชำระเงิน</div>
                  <select value={form.paymentMethod} onChange={(event) => setForm({ ...form, paymentMethod: event.target.value })}>
                    <option value="Cash on delivery">เก็บเงินปลายทาง</option>
                    <option value="Bank transfer">โอนเงิน</option>
                    <option value="Card payment">ชำระผ่านบัตร</option>
                  </select>
                </label>
                <label className="block">
                  <div className="mb-2 text-sm font-semibold text-slate-900">วันที่จัดส่ง</div>
                  <input type="date" value={form.deliveryDate} onChange={(event) => setForm({ ...form, deliveryDate: event.target.value })} />
                </label>
              </div>

              <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
                <label className="block">
                  <div className="mb-2 text-sm font-semibold text-slate-900">ที่อยู่จัดส่ง</div>
                  <textarea value={form.address} onChange={(event) => setForm({ ...form, address: event.target.value })} />
                </label>
                <div className="grid gap-4">
                  <label className="block">
                    <div className="mb-2 text-sm font-semibold text-slate-900">ลิงก์ Google Maps</div>
                    <input
                      type="text"
                      inputMode="url"
                      autoCapitalize="none"
                      value={form.mapsUrl}
                      onChange={(event) => setForm({ ...form, mapsUrl: event.target.value })}
                      placeholder="https://maps.google.com/..."
                    />
                  </label>
                  <label className="block">
                    <div className="mb-2 text-sm font-semibold text-slate-900">จุดสังเกต / หมายเหตุหน้าร้าน</div>
                    <textarea value={form.landmark} onChange={(event) => setForm({ ...form, landmark: event.target.value })} />
                  </label>
                </div>
              </div>

              <ProductPicker context="line" />

              {stockWarnings.length ? (
                <div className="border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-700">
                  <div className="font-semibold">ยังบันทึก PO ได้ แม้สต็อกไม่พอ</div>
                  <div className="mt-1">ระบบจะเก็บรายการไว้พร้อมคำเตือนเรื่องจำนวนที่ขาดในแต่ละสินค้า</div>
                  <div className="mt-2 space-y-1">
                    {stockWarnings.slice(0, 4).map((warning, index) => (
                      <div key={`${warning.field}-${index}`}>{warning.message}</div>
                    ))}
                    {stockWarnings.length > 4 ? <div>และอีก {stockWarnings.length - 4} รายการ</div> : null}
                  </div>
                </div>
              ) : null}

              {validation.errors.length ? (
                <div className="border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
                  <div className="font-semibold">ยังมีข้อมูลที่ต้องแก้ก่อนบันทึก</div>
                  <div className="mt-1 space-y-1">
                    {validation.errors.slice(0, 3).map((error, index) => (
                      <div key={`${error.field}-${index}`}>{error.message}</div>
                    ))}
                  </div>
                </div>
              ) : null}

              <div className="flex flex-wrap gap-3 border-t border-slate-100 pt-4">
                <button
                  type="submit"
                  className="rounded-2xl bg-brand-600 px-5 py-3 text-sm font-semibold text-white hover:bg-brand-700 disabled:cursor-not-allowed disabled:bg-slate-300"
                >
                  {form.editingId ? "บันทึกการแก้ไข" : "บันทึกออเดอร์จากไลน์"}
                </button>
                <button
                  type="button"
                  className="rounded-2xl border border-slate-200 bg-white px-5 py-3 text-sm font-semibold text-slate-700 hover:bg-slate-100"
                  onClick={resetForm}
                >
                  ล้างฟอร์ม
                </button>
              </div>
            </form>
        </SectionCard>

        <SectionCard title="รายการ PO ที่บันทึกแล้ว" description="แสดงเฉพาะ PO ที่ยังอยู่ใน workflow งานที่ปิดผลแล้วหรือเก็บเข้าประวัติจะไม่แสดงในหน้านี้">
          {!visibleOrders.length ? (
            <EmptyState text="ไม่มี PO ที่ยังเปิดอยู่ในหน้ารับออเดอร์" />
          ) : (
            <div className="overflow-x-auto border border-slate-200 bg-white">
              <table className="min-w-[1320px] text-left text-sm">
                <thead className="border-b border-slate-200 bg-slate-50 text-slate-600">
                  <tr>
                    <th className="px-4 py-3 font-semibold">เลขที่ PO</th>
                    <th className="px-4 py-3 font-semibold">ลูกค้า</th>
                    <th className="px-4 py-3 font-semibold">วันที่ส่ง</th>
                    <th className="px-4 py-3 font-semibold">ติดต่อ</th>
                    <th className="px-4 py-3 font-semibold">ที่อยู่จัดส่ง</th>
                    <th className="px-4 py-3 font-semibold">สรุปรายการ</th>
                    <th className="px-4 py-3 font-semibold">สถานะ</th>
                    <th className="px-4 py-3 font-semibold">การจัดการ</th>
                  </tr>
                </thead>
                <tbody>
                  {visibleOrders.map((order) => {
                    const orderTotals = calculateSelectedTotals(order.selectedProducts);
                    const operationalStatus = getOperationalStatus(order);
                    const canConfirm =
                      !getSafeTransitionError(order, "CONFIRMED", currentUser?.role, {
                        actorId: currentUser?.id,
                        assignedDriverId: order.assignedDriverId,
                        routeStartedAt: order.routeStartedAt,
                      });
                    const canMoveBackToLine =
                      !getSafeTransitionError(order, "LINE_RECEIVED", currentUser?.role, {
                        actorId: currentUser?.id,
                        assignedDriverId: order.assignedDriverId,
                        routeStartedAt: order.routeStartedAt,
                      });
                    return (
                      <tr key={order.id} className="border-b border-slate-200 align-top">
                        <td className="px-4 py-4 font-semibold text-slate-950">{order.poNumber}</td>
                        <td className="px-4 py-4 text-slate-700">{order.customerName || "-"}</td>
                        <td className="px-4 py-4 text-slate-700">{order.deliveryDate ? formatDate(order.deliveryDate) : "ยังไม่ระบุวันส่ง"}</td>
                        <td className="px-4 py-4 text-slate-700">{order.contact || "ยังไม่มีข้อมูลติดต่อ"}</td>
                        <td className="px-4 py-4">
                          <div className="max-w-[360px]">
                            <ExpandableText value={order.address} emptyText="ยังไม่มีที่อยู่จัดส่ง" />
                          </div>
                        </td>
                        <td className="px-4 py-4 text-slate-700">
                          <div>{order.selectedProducts?.length || 0} บรรทัด</div>
                          <div className="mt-1">จำนวน {orderTotals.quantity.toFixed(1)}</div>
                          <div className="mt-1 font-semibold text-slate-950">มูลค่า {formatCurrency(orderTotals.amount)}</div>
                        </td>
                        <td className="px-4 py-4">
                          <StatusBadge status={operationalStatus} />
                        </td>
                        <td className="px-4 py-4">
                          <div className="flex min-w-[260px] flex-wrap gap-2">
                            {canConfirm ? (
                              <button
                                type="button"
                                className="rounded-2xl bg-brand-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-brand-700"
                                onClick={() => handleConfirm(order)}
                              >
                                ยืนยัน PO
                              </button>
                            ) : null}
                            {canMoveBackToLine ? (
                              <button
                                type="button"
                                className="rounded-2xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-semibold text-slate-700 hover:bg-slate-100"
                                onClick={() => handleMoveBackToLine(order)}
                              >
                                กลับไปขั้นรับออเดอร์
                              </button>
                            ) : null}
                            {canEditOrder(order, currentUser?.role) ? (
                              <button
                                type="button"
                                className="rounded-2xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-semibold text-slate-700 hover:bg-slate-100"
                                onClick={() => handleEdit(order)}
                              >
                                แก้ไข
                              </button>
                            ) : (
                              <ToneBadge>อ่านอย่างเดียว</ToneBadge>
                            )}
                            <button
                              type="button"
                              className="rounded-2xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-semibold text-slate-700 hover:bg-slate-100"
                              onClick={() => handleOpenPdf(order)}
                            >
                              เปิด PDF
                            </button>
                            {canDeleteOrder(order, currentUser?.role) ? (
                              <button
                                type="button"
                                className="rounded-2xl border border-rose-200 bg-rose-50 px-4 py-2.5 text-sm font-semibold text-rose-700 hover:bg-rose-100"
                                onClick={() => handleDelete(order)}
                              >
                                ลบ
                              </button>
                            ) : null}
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
