"use client";

import { Fragment, useMemo, useState } from "react";
import { useAppState } from "@/lib/app-state";
import { formatCurrency } from "@/lib/format";
import { EmptyState } from "@/components/ui/EmptyState";
import { SoftCard } from "@/components/ui/Cards";
import { ToneBadge } from "@/components/ui/Badge";

function formatQty(value) {
  return Number(value || 0).toFixed(1);
}

function getLineTotal(product) {
  return Number(product.price || 0) * Number(product.quantity || 0);
}

function StatPill({ label, value }) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-white px-3 py-2">
      <div className="text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-400">{label}</div>
      <div className="mt-1 text-sm font-semibold text-slate-950">{value}</div>
    </div>
  );
}

export function ProductPicker({ context }) {
  const [query, setQuery] = useState("");
  const [message, setMessage] = useState("");
  const {
    catalog,
    selectedProducts,
    searchProducts,
    addSelectedProduct,
    removeSelectedProduct,
    setProductQuantity,
  } = useAppState();

  const results = context === "confirm" ? catalog.confirmResults : catalog.lineResults;
  const selected = context === "confirm" ? selectedProducts.confirm : selectedProducts.line;

  const totals = useMemo(
    () =>
      selected.reduce(
        (acc, item) => {
          acc.count += 1;
          acc.qty += Number(item.quantity || 0);
          acc.amount += getLineTotal(item);
          return acc;
        },
        { count: 0, qty: 0, amount: 0 }
      ),
    [selected]
  );

  const handleSearch = async () => {
    const result = await searchProducts(context, query);
    setMessage(result.ok ? "" : result.message);
  };

  return (
    <div className="grid gap-5 xl:grid-cols-[minmax(0,0.95fr)_minmax(0,1.05fr)]">
      <SoftCard className="bg-white">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <div className="text-lg font-semibold text-slate-950">ค้นหาสินค้า</div>
            <div className="mt-1 text-sm text-slate-500">ค้นหาจากรหัสสินค้า บาร์โค้ด หรือชื่อสินค้า แล้วเลือกเพิ่มเข้า PO ได้จากตารางเดียว</div>
          </div>
          <ToneBadge tone="brand">{results.length} รายการ</ToneBadge>
        </div>

        <div className="mt-4 grid gap-3 sm:grid-cols-[minmax(0,1fr)_auto]">
          <input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="ค้นหาจากรหัสสินค้า บาร์โค้ด หรือชื่อสินค้า"
          />
          <button
            type="button"
            className="bg-slate-950 px-5 py-3 text-sm font-semibold text-white hover:bg-slate-800 sm:w-auto"
            onClick={handleSearch}
          >
            ค้นหา
          </button>
        </div>

        {message ? <div className="mt-3 border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">{message}</div> : null}

        {!results.length ? (
          <div className="mt-4">
            <EmptyState text="ค้นหาจากคลังสินค้าก่อน แล้วจึงเลือกสินค้าเข้า PO" />
          </div>
        ) : (
          <div className="mt-4 overflow-x-auto border border-slate-200 bg-white">
            <table className="min-w-[760px] text-left text-sm">
              <thead className="border-b border-slate-200 bg-slate-50 text-slate-600">
                <tr>
                  <th className="px-4 py-3 font-semibold">รหัสสินค้า</th>
                  <th className="px-4 py-3 font-semibold">ชื่อสินค้า</th>
                  <th className="px-4 py-3 font-semibold">ราคาขาย</th>
                  <th className="px-4 py-3 font-semibold">สต็อกขายได้</th>
                  <th className="px-4 py-3 font-semibold">คงเหลือหลังหักจอง</th>
                  <th className="px-4 py-3 font-semibold text-center">การทำงาน</th>
                </tr>
              </thead>
              <tbody>
                {results.map((product) => (
                  <tr key={product.id || product.code} className="border-b border-slate-200">
                    <td className="px-4 py-4 font-semibold text-brand-700">{product.code || "-"}</td>
                    <td className="px-4 py-4 text-slate-900">{product.name || "-"}</td>
                    <td className="px-4 py-4 text-slate-700">{formatCurrency(product.price)}</td>
                    <td className="px-4 py-4 text-slate-700">{formatQty(product.stockOnHand || 0)}</td>
                    <td className="px-4 py-4 text-slate-700">{formatQty(product.availableQty || 0)}</td>
                    <td className="px-4 py-4 text-center">
                      <button
                        type="button"
                        className="bg-brand-600 px-4 py-2 text-sm font-semibold text-white hover:bg-brand-700 sm:w-auto"
                        onClick={() => addSelectedProduct(context, product)}
                      >
                        เพิ่มสินค้า
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </SoftCard>

      <SoftCard className="bg-white">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <div className="text-lg font-semibold text-slate-950">สินค้าที่เลือกแล้ว</div>
            <div className="mt-1 text-sm text-slate-500">แก้จำนวน ตรวจยอดรวม และลบรายการได้จากตารางเดียว</div>
          </div>
          <ToneBadge>{selected.length} บรรทัด</ToneBadge>
        </div>

        <div className="mt-4 grid gap-3 sm:grid-cols-3">
          <StatPill label="จำนวนรายการ" value={String(totals.count)} />
          <StatPill label="รวมจำนวน" value={formatQty(totals.qty)} />
          <StatPill label="ยอดรวม" value={formatCurrency(totals.amount)} />
        </div>

        {!selected.length ? (
          <div className="mt-4">
            <EmptyState text="ยังไม่มีรายการสินค้าที่เลือก" />
          </div>
        ) : (
          <div className="mt-4 overflow-x-auto border border-slate-200 bg-white">
            <table className="min-w-[980px] text-left text-sm">
              <thead className="border-b border-slate-200 bg-slate-50 text-slate-600">
                <tr>
                  <th className="px-4 py-3 font-semibold">รหัสสินค้า</th>
                  <th className="px-4 py-3 font-semibold">ชื่อสินค้า</th>
                  <th className="px-4 py-3 font-semibold">จำนวน</th>
                  <th className="px-4 py-3 font-semibold">ราคาต่อหน่วย</th>
                  <th className="px-4 py-3 font-semibold">คงเหลือ</th>
                  <th className="px-4 py-3 font-semibold">รวมต่อรายการ</th>
                  <th className="px-4 py-3 font-semibold text-center">การทำงาน</th>
                </tr>
              </thead>
              <tbody>
                {selected.map((product) => (
                  <Fragment key={product.id || product.code}>
                    <tr className="border-b border-slate-200">
                      <td className="px-4 py-4 font-semibold text-brand-700">{product.code || "-"}</td>
                      <td className="px-4 py-4 text-slate-900">{product.name || "-"}</td>
                      <td className="px-4 py-4">
                        <div className="w-[170px]">
                          <input
                            type="number"
                            min="0.1"
                            step="0.1"
                            value={product.quantity}
                            onChange={(event) => setProductQuantity(context, product.id, event.target.value)}
                          />
                        </div>
                      </td>
                      <td className="px-4 py-4 text-slate-700">{formatCurrency(product.price)}</td>
                      <td className="px-4 py-4 text-slate-700">{formatQty(product.availableQty || 0)}</td>
                      <td className="px-4 py-4 font-semibold text-slate-900">{formatCurrency(getLineTotal(product))}</td>
                      <td className="px-4 py-4 text-center">
                        <button
                          type="button"
                          className="border border-slate-200 bg-white px-3 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-100 sm:w-auto"
                          onClick={() => removeSelectedProduct(context, product.id)}
                        >
                          ลบออก
                        </button>
                      </td>
                    </tr>
                    {product.stockNote ? (
                      <tr className="border-b border-slate-200 bg-amber-50/60">
                        <td className="px-4 py-3 text-sm text-amber-700" colSpan={7}>
                          {product.stockNote}
                        </td>
                      </tr>
                    ) : null}
                  </Fragment>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </SoftCard>
    </div>
  );
}
