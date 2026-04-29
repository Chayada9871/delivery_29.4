import Link from "next/link";

import { EmptyState } from "@/components/ui/EmptyState";
import { StatusBadge, ToneBadge } from "@/components/ui/Badge";
import { SectionCard, StatCard, SoftCard } from "@/components/ui/Cards";
import { formatCurrency, formatDate, formatDateTime } from "@/lib/format";

function formatNumber(value) {
  const number = Number(value);
  if (!Number.isFinite(number)) return "-";
  return new Intl.NumberFormat("th-TH").format(number);
}

function formatShortDay(value) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "-";
  return new Intl.DateTimeFormat("th-TH-u-ca-gregory-nu-latn", {
    day: "2-digit",
    month: "short",
    timeZone: "Asia/Bangkok",
  }).format(date);
}

function ExpandableText({ text, limit = 52 }) {
  const value = String(text || "").trim();
  if (!value) return <span className="text-slate-400">-</span>;

  const collapsed = value.length > limit ? `${value.slice(0, limit).trim()}...` : value;
  return (
    <span className="text-sm leading-6 text-slate-600" title={value}>
      {collapsed}
    </span>
  );
}

function getBarClasses(tone = "slate") {
  if (tone === "danger") return "bg-rose-400";
  if (tone === "warning") return "bg-amber-400";
  if (tone === "success") return "bg-emerald-400";
  return "bg-brand-400";
}

function DashboardMetricGrid({ model }) {
  const metrics = [
    {
      label: "ออเดอร์ทั้งหมด",
      value: model.operational.counts.openOrders + model.operational.counts.archivedOrders,
      hint: "รวมงานที่อยู่ในระบบทั้งหมด",
      tone: "brand",
    },
    {
      label: "งานที่ยังเปิด",
      value: model.operational.counts.openOrders,
      hint: `ครบกำหนดวันนี้ ${formatNumber(model.operational.counts.dueToday)}`,
      tone: model.operational.counts.overdueOpen ? "warning" : "brand",
    },
    {
      label: "ปิดงานแล้ว",
      value: model.operational.counts.archivedOrders,
      hint: `วันนี้ปิดแล้ว ${formatNumber(model.operational.counts.completedToday)}`,
      tone: "success",
    },
    {
      label: "เกินกำหนด",
      value: model.operational.counts.overdueOpen,
      hint: "ต้องเร่งตามเพื่อไม่ให้กระทบลูกค้า",
      tone: model.operational.counts.overdueOpen ? "danger" : "success",
    },
    {
      label: "รอจัดรถ",
      value: model.operational.counts.readyToAssign,
      hint: "คลังเตรียมแล้วแต่ยังไม่ assign",
      tone: model.operational.counts.readyToAssign ? "warning" : "success",
    },
    {
      label: "สต็อกเสี่ยง",
      value: model.catalog.lowStockCount + model.catalog.outOfStockCount,
      hint: `ต่ำ ${formatNumber(model.catalog.lowStockCount)} | หมด ${formatNumber(model.catalog.outOfStockCount)}`,
      tone: model.catalog.outOfStockCount ? "danger" : model.catalog.lowStockCount ? "warning" : "success",
    },
  ];

  return (
    <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-6">
      {metrics.map((item) => (
        <StatCard
          key={item.label}
          label={item.label}
          value={formatNumber(item.value)}
          hint={item.hint}
          tone={item.tone}
          className="rounded-none p-4"
        />
      ))}
    </div>
  );
}

function ActivityTrendChart({ points = [] }) {
  const maxValue = Math.max(
    1,
    ...points.flatMap((item) => [Number(item.received || 0), Number(item.completed || 0), Number(item.exceptions || 0)])
  );

  if (!points.length) {
    return <EmptyState text="ยังไม่มีข้อมูลแนวโน้มงานให้แสดง" />;
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <ToneBadge tone="brand">รับเข้า</ToneBadge>
        <ToneBadge tone="success">ปิดงาน</ToneBadge>
        <ToneBadge tone="danger">มีปัญหา</ToneBadge>
      </div>

      <div className="grid grid-cols-7 gap-3">
        {points.map((item) => (
          <div key={item.dayKey} className="flex flex-col gap-2">
            <div className="flex h-40 items-end justify-center gap-1 border-b border-slate-200 pb-2">
              {[
                { key: "received", value: Number(item.received || 0), tone: "brand" },
                { key: "completed", value: Number(item.completed || 0), tone: "success" },
                { key: "exceptions", value: Number(item.exceptions || 0), tone: "danger" },
              ].map((bar) => (
                <div
                  key={bar.key}
                  className={`w-3 min-h-[6px] ${getBarClasses(bar.tone)}`}
                  style={{ height: `${Math.max((bar.value / maxValue) * 100, bar.value ? 6 : 0)}%` }}
                  title={`${formatShortDay(item.dayKey)} | ${bar.key}: ${formatNumber(bar.value)}`}
                />
              ))}
            </div>
            <div className="text-center text-xs font-medium text-slate-500">{formatShortDay(item.dayKey)}</div>
          </div>
        ))}
      </div>
    </div>
  );
}

function buildWatchRows(model) {
  const buckets = [
    {
      key: "overdue",
      label: "เกินกำหนด",
      href: "/line-orders",
      priority: 4,
      tone: "danger",
      items: model.operational.overdueOrders || [],
      note: () => "เลยวันส่งแล้วและยังไม่ปิดงาน",
    },
    {
      key: "prepared",
      label: "รอจัดรถ",
      href: "/send-orders",
      priority: 3,
      tone: "warning",
      items: model.operational.preparedUnassigned || [],
      note: () => "คลังเตรียมสินค้าแล้วแต่ยังไม่ assign",
    },
    {
      key: "data",
      label: "ข้อมูลเสี่ยง",
      href: "/send-orders",
      priority: 2,
      tone: "warning",
      items: model.operational.dataAlerts || [],
      note: (order) => order.issues?.[0]?.message || "ข้อมูลจัดส่งยังไม่ครบ",
    },
    {
      key: "progress",
      label: "กำลังส่ง",
      href: "/driver",
      priority: 1,
      tone: "brand",
      items: model.operational.inProgress || [],
      note: () => "อยู่ระหว่างดำเนินการจัดส่ง",
    },
  ];

  const deduped = new Map();

  buckets.forEach((bucket) => {
    bucket.items.forEach((order) => {
      const key = String(order.id || order.poNumber || "");
      if (!key || deduped.has(key)) return;
      deduped.set(key, {
        id: key,
        queue: bucket.label,
        queueTone: bucket.tone,
        priority: bucket.priority,
        href: bucket.href,
        poNumber: order.poNumber || "-",
        customerName: order.customerName || "-",
        deliveryDate: order.deliveryDate || "",
        status: order.status,
        note: bucket.note(order),
      });
    });
  });

  return [...deduped.values()]
    .sort((left, right) => right.priority - left.priority || String(left.deliveryDate || "").localeCompare(String(right.deliveryDate || "")))
    .slice(0, 6);
}

function WatchQueueTable({ model }) {
  const rows = buildWatchRows(model);

  if (!rows.length) {
    return <EmptyState text="ยังไม่มีคิวงานที่ต้องติดตามเป็นพิเศษ" />;
  }

  return (
    <div className="overflow-x-auto border border-slate-200 bg-white">
      <table className="min-w-full text-sm">
        <thead className="bg-slate-50 text-left text-xs font-semibold uppercase tracking-[0.12em] text-slate-500">
          <tr>
            <th className="px-4 py-3">คิว</th>
            <th className="px-4 py-3">PO / ลูกค้า</th>
            <th className="px-4 py-3">วันส่ง</th>
            <th className="px-4 py-3">เหตุผลที่ต้องตาม</th>
            <th className="px-4 py-3">สถานะ</th>
            <th className="px-4 py-3">เปิดหน้า</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.id} className="border-t border-slate-200 align-top">
              <td className="px-4 py-3">
                <ToneBadge tone={row.queueTone}>{row.queue}</ToneBadge>
              </td>
              <td className="px-4 py-3">
                <div className="font-semibold text-slate-950">{row.poNumber}</div>
                <ExpandableText text={row.customerName} />
              </td>
              <td className="px-4 py-3 text-slate-600">{formatDate(row.deliveryDate)}</td>
              <td className="px-4 py-3 text-slate-600">
                <ExpandableText text={row.note} />
              </td>
              <td className="px-4 py-3">
                <StatusBadge status={row.status} />
              </td>
              <td className="px-4 py-3">
                <Link
                  href={row.href}
                  className="inline-flex items-center border border-slate-200 px-3 py-2 text-sm font-semibold text-slate-700 transition hover:border-slate-300 hover:bg-slate-50"
                >
                  เปิดดู
                </Link>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function StatusOverview({ model }) {
  const totals = model.orderStatusBreakdown.reduce((sum, item) => sum + Number(item.value || 0), 0);
  const compactStats = [
    { label: "กำลังส่ง", value: model.operational.counts.outForDelivery, tone: "brand" },
    { label: "มีปัญหาวันนี้", value: model.operational.counts.exceptionToday, tone: "danger" },
    { label: "ส่งสำเร็จวันนี้", value: model.operational.counts.deliveredToday, tone: "success" },
    { label: "ปิดงานวันนี้", value: model.operational.counts.completedToday, tone: "success" },
  ];

  return (
    <div className="grid gap-4 xl:grid-cols-[1.35fr_0.95fr]">
      <SoftCard className="rounded-none bg-white p-4">
        <div className="space-y-3">
          {model.orderStatusBreakdown.map((item) => {
            const percent = totals ? Math.round((Number(item.value || 0) / totals) * 100) : 0;
            return (
              <div key={item.key} className="space-y-2">
                <div className="flex items-center justify-between gap-3 text-sm">
                  <span className="font-medium text-slate-700">{item.label}</span>
                  <span className="font-semibold text-slate-950">{formatNumber(item.value)}</span>
                </div>
                <div className="h-2 bg-slate-100">
                  <div className={`h-2 ${getBarClasses(item.tone)}`} style={{ width: `${percent}%` }} />
                </div>
              </div>
            );
          })}
        </div>
      </SoftCard>

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-1">
        {compactStats.map((item) => (
          <div key={item.label} className="border border-slate-200 bg-white p-4">
            <div className="text-xs font-semibold uppercase tracking-[0.12em] text-slate-400">{item.label}</div>
            <div className="mt-2 flex items-end justify-between gap-3">
              <div className="text-3xl font-bold text-slate-950">{formatNumber(item.value)}</div>
              <ToneBadge tone={item.tone}>{item.label}</ToneBadge>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function RecentOrdersTable({ orders = [] }) {
  if (!orders.length) {
    return <EmptyState text="ยังไม่มีความเคลื่อนไหวของออเดอร์ล่าสุด" />;
  }

  return (
    <div className="overflow-x-auto border border-slate-200 bg-white">
      <table className="min-w-full text-sm">
        <thead className="bg-slate-50 text-left text-xs font-semibold uppercase tracking-[0.12em] text-slate-500">
          <tr>
            <th className="px-4 py-3">PO / ลูกค้า</th>
            <th className="px-4 py-3">วันส่ง</th>
            <th className="px-4 py-3">มูลค่า</th>
            <th className="px-4 py-3">สถานะ</th>
            <th className="px-4 py-3">อัปเดตล่าสุด</th>
            <th className="px-4 py-3">งานถัดไป</th>
          </tr>
        </thead>
        <tbody>
          {orders.slice(0, 5).map((order) => (
            <tr key={`${order.poNumber}-${order.updatedAt}`} className="border-t border-slate-200 align-top">
              <td className="px-4 py-3">
                <div className="font-semibold text-slate-950">{order.poNumber || "-"}</div>
                <ExpandableText text={order.customerName} />
              </td>
              <td className="px-4 py-3 text-slate-600">{formatDate(order.deliveryDate)}</td>
              <td className="px-4 py-3 font-semibold text-slate-950">{formatCurrency(order.amount)}</td>
              <td className="px-4 py-3">
                <StatusBadge status={order.status} />
              </td>
              <td className="px-4 py-3 text-slate-600">{formatDateTime(order.updatedAt)}</td>
              <td className="px-4 py-3 text-slate-600">
                <ExpandableText text={order.nextAction} limit={44} />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function ManagerDashboardView({ model }) {
  return (
    <div className="space-y-6">
      <DashboardMetricGrid model={model} />

      <div className="grid gap-6 xl:grid-cols-[0.95fr_1.25fr]">
        <SectionCard
          title="แนวโน้มงาน 7 วัน"
          description="เปรียบเทียบจำนวนรับเข้า ปิดงาน และรายการที่มีปัญหาเพื่อดูจังหวะงานของระบบ"
          className="rounded-none p-5 shadow-sm"
        >
          <ActivityTrendChart points={model.activityTrend} />
        </SectionCard>

        <SectionCard
          title="ตารางคิวติดตามสำคัญ"
          description="รวมงานที่ผู้จัดการควรเปิดติดตามก่อน เช่น เกินกำหนด รอจัดรถ หรือข้อมูลเสี่ยง"
          className="rounded-none p-5 shadow-sm"
        >
          <WatchQueueTable model={model} />
        </SectionCard>
      </div>

      <SectionCard
        title="ภาพรวมสถานะงานส่ง"
        description="ดูได้ทันทีว่างานค้างอยู่ที่ขั้นไหน และวันนี้ทีมกำลังปิดงานได้มากน้อยแค่ไหน"
        className="rounded-none p-5 shadow-sm"
      >
        <StatusOverview model={model} />
      </SectionCard>

      <SectionCard
        title="ออเดอร์ล่าสุด"
        description="แสดงเฉพาะรายการที่มีการอัปเดตล่าสุดเพื่อให้ติดตามงานต่อได้เร็ว"
        className="rounded-none p-5 shadow-sm"
      >
        <RecentOrdersTable orders={model.recentOrders} />
      </SectionCard>
    </div>
  );
}
