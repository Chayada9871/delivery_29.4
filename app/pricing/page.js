"use client";

import { useMemo, useState } from "react";
import { AppShell } from "@/components/ui/Shell";
import { SectionCard, SoftCard } from "@/components/ui/Cards";
import { EmptyState } from "@/components/ui/EmptyState";
import { useAppState } from "@/lib/app-state";
import { formatCurrency } from "@/lib/format";

export default function PricingPage() {
  const { catalog, searchProducts, saveProductPrice } = useAppState();
  const [query, setQuery] = useState("");
  const [message, setMessage] = useState("");
  const [drafts, setDrafts] = useState({});

  const results = useMemo(() => catalog.pricingResults || [], [catalog.pricingResults]);

  const handleSearch = async () => {
    const result = await searchProducts("pricing", query);
    setMessage(result.ok ? "" : result.message);
  };

  const updateDraft = (code, field, value, fallbackName = "") => {
    setDrafts((current) => ({
      ...current,
      [code]: {
        code,
        name: current[code]?.name || fallbackName,
        price: field === "price" ? value : current[code]?.price ?? "",
        note: field === "note" ? value : current[code]?.note ?? "",
      },
    }));
  };

  const handleSave = async (product) => {
    const draft = drafts[product.code] || {
      code: product.code,
      name: product.name,
      price: product.price,
      note: product.priceNote || "",
    };
    const result = await saveProductPrice(draft);
    setMessage(result.ok ? `บันทึกราคา ${product.code} เรียบร้อย` : `บันทึกราคาไม่สำเร็จ: ${result.message}`);
    if (result.ok) {
      await searchProducts("pricing", query);
    }
  };

  return (
    <AppShell
      currentPath="/pricing"
      title="กำหนดราคาใน Sophon Driver"
      description="ดึงข้อมูลสินค้าจากฐาน stock เดิม แล้วตั้งราคาขายของระบบ Sophon Driver แยกไว้ในฐานใหม่"
    >
      <div className="space-y-6">
        <SectionCard title="ค้นหาสินค้าเพื่อกำหนดราคา">
          <div className="flex flex-col gap-3 md:flex-row">
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="ค้นหาด้วยรหัสสินค้า ชื่อสินค้า หรือบาร์โค้ด"
            />
            <button
              type="button"
              className="rounded-2xl bg-slate-950 px-5 py-3 text-sm font-semibold text-white hover:bg-slate-800"
              onClick={handleSearch}
            >
              ค้นหา
            </button>
          </div>
          {message ? <div className="mt-3 text-sm text-brand-700">{message}</div> : null}
        </SectionCard>

        <SectionCard title="รายการสินค้าและราคาของระบบ">
          {!results.length ? (
            <EmptyState text="ยังไม่มีผลลัพธ์สินค้า" />
          ) : (
            <div className="grid gap-4 xl:grid-cols-2">
              {results.map((product) => {
                const draft = drafts[product.code] || {};
                const batchSummary = product.batchSummary || {};

                return (
                  <SoftCard key={product.code} className="rounded-[24px] bg-white">
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <div className="text-xs font-semibold uppercase tracking-[0.18em] text-brand-600">
                          {product.code || "NO CODE"}
                        </div>
                        <div className="mt-1 font-semibold text-slate-950">{product.name || "-"}</div>
                        <div className="mt-1 text-xs text-slate-400">
                          คำนวณตาม lot ในตาราง batches และหักยอดที่ถูกจองใน PO แล้ว
                        </div>
                      </div>
                      <div className="rounded-2xl bg-slate-100 px-3 py-2 text-xs font-medium text-slate-600">
                        คงเหลือขายได้ {Number(product.stockOnHand || 0).toFixed(3)}
                      </div>
                    </div>

                    <div className="mt-4 grid gap-2 md:grid-cols-4">
                      <div className="rounded-2xl border border-emerald-100 bg-emerald-50 px-3 py-3">
                        <div className="text-[11px] text-emerald-700">ขายได้</div>
                        <div className="mt-1 text-base font-bold text-emerald-900">
                          {Number(batchSummary.sellable || 0).toFixed(3)}
                        </div>
                      </div>
                      <div className="rounded-2xl border border-amber-100 bg-amber-50 px-3 py-3">
                        <div className="text-[11px] text-amber-700">ใกล้หมดอายุ</div>
                        <div className="mt-1 text-base font-bold text-amber-900">
                          {Number(batchSummary.warning || 0).toFixed(3)}
                        </div>
                      </div>
                      <div className="rounded-2xl border border-rose-100 bg-rose-50 px-3 py-3">
                        <div className="text-[11px] text-rose-700">หมดอายุ</div>
                        <div className="mt-1 text-base font-bold text-rose-900">
                          {Number(batchSummary.expired || 0).toFixed(3)}
                        </div>
                      </div>
                      <div className="rounded-2xl border border-slate-200 bg-slate-50 px-3 py-3">
                        <div className="text-[11px] text-slate-500">รวมทุกล็อต</div>
                        <div className="mt-1 text-base font-bold text-slate-900">
                          {Number(batchSummary.all || 0).toFixed(3)}
                        </div>
                      </div>
                    </div>

                    <div className="mt-4 grid gap-3 md:grid-cols-2">
                      <div className="rounded-2xl bg-slate-50 px-4 py-3">
                        <div className="text-xs text-slate-400">ราคาปัจจุบันในระบบ</div>
                        <div className="mt-1 text-lg font-bold text-slate-950">{formatCurrency(product.price)}</div>
                      </div>
                      <div className="rounded-2xl bg-slate-50 px-4 py-3">
                        <div className="text-xs text-slate-400">ใช้ได้หลังหัก PO</div>
                        <div className="mt-1 text-lg font-bold text-slate-950">
                          {Number(product.availableQty || 0).toFixed(3)}
                        </div>
                        <div className="mt-1 text-xs text-slate-400">
                          จองใน PO {Number(product.reservedQty || 0).toFixed(3)}
                        </div>
                      </div>
                    </div>

                    <div className="mt-4 space-y-3">
                      <label className="block text-sm font-medium text-slate-700">
                        เพิ่ม/แก้ราคาใน Sophon Driver
                        <input
                          type="number"
                          min="0"
                          step="0.01"
                          value={draft.price ?? product.price ?? ""}
                          onChange={(e) => updateDraft(product.code, "price", e.target.value, product.name)}
                          className="mt-2"
                        />
                      </label>
                      <label className="block text-sm font-medium text-slate-700">
                        หมายเหตุราคา
                        <input
                          value={draft.note ?? product.priceNote ?? ""}
                          onChange={(e) => updateDraft(product.code, "note", e.target.value, product.name)}
                          className="mt-2"
                          placeholder="เช่น ราคาขายปลีก / ราคาโปรโมชั่น"
                        />
                      </label>
                    </div>

                    <button
                      type="button"
                      className="mt-4 rounded-2xl bg-brand-600 px-5 py-3 text-sm font-semibold text-white hover:bg-brand-700"
                      onClick={() => handleSave(product)}
                    >
                      บันทึกราคา
                    </button>
                  </SoftCard>
                );
              })}
            </div>
          )}
        </SectionCard>
      </div>
    </AppShell>
  );
}
