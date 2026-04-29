"use client";

import { useEffect, useMemo, useState } from "react";

import { ToneBadge } from "@/components/ui/Badge";
import { ManagerDashboardView } from "@/components/ui/ManagerDashboardView";
import { AppShell } from "@/components/ui/Shell";
import { useAppState } from "@/lib/app-state";
import { formatDate, formatDateTime } from "@/lib/format";
import { buildManagerDashboardModel } from "@/lib/selectors";

export default function DashboardPage() {
  const { state, fetchMergedProducts } = useAppState();
  const [catalogState, setCatalogState] = useState({
    loading: true,
    items: [],
    error: "",
    syncedAt: "",
  });

  useEffect(() => {
    let active = true;

    const loadCatalog = async () => {
      setCatalogState((current) => ({ ...current, loading: true, error: "" }));
      const result = await fetchMergedProducts();
      if (!active) return;

      setCatalogState({
        loading: false,
        items: result.ok ? result.items || [] : [],
        error: result.ok ? "" : result.message || "โหลดข้อมูลสินค้าไม่สำเร็จ",
        syncedAt: new Date().toISOString(),
      });
    };

    loadCatalog();

    return () => {
      active = false;
    };
  }, [fetchMergedProducts]);

  const model = useMemo(
    () =>
      buildManagerDashboardModel({
        orders: state.lineOrders,
        users: state.users,
        logs: state.logs,
        products: catalogState.items,
        productLoading: catalogState.loading,
        productError: catalogState.error,
      }),
    [catalogState.error, catalogState.items, catalogState.loading, state.lineOrders, state.logs, state.users]
  );

  return (
    <AppShell
      currentPath="/dashboard"
      title="ศูนย์ควบคุมผู้จัดการ"
      description="ภาพรวมงานที่ผู้จัดการต้องเห็นก่อนตัดสินใจ ทั้งออเดอร์ งานส่ง สต็อกเสี่ยง และทางลัดไปยังหน้าปฏิบัติการหลัก"
      aside={
        <div className="flex flex-wrap items-center gap-2">
          <ToneBadge tone="brand">{formatDate(model.todayKey)}</ToneBadge>
          <ToneBadge tone={catalogState.error ? "danger" : catalogState.loading ? "warning" : "success"}>
            {catalogState.loading
              ? "กำลังโหลดข้อมูลสินค้า"
              : catalogState.error
                ? "โหลดข้อมูลสินค้าไม่สำเร็จ"
                : catalogState.syncedAt
                  ? `sync ${formatDateTime(catalogState.syncedAt)}`
                  : "พร้อมใช้งาน"}
          </ToneBadge>
        </div>
      }
    >
      <ManagerDashboardView model={model} />
    </AppShell>
  );
}
