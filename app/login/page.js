"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useAppState } from "@/lib/app-state";
import { ROLE_HOME, ROLE_LABELS } from "@/lib/config";

function Notice({ message, tone = "error" }) {
  const classes =
    tone === "warning"
      ? "border-amber-200 bg-amber-50 text-amber-700"
      : "border-rose-200 bg-rose-50 text-rose-700";

  return <div className={`border px-4 py-3 text-sm font-medium ${classes}`}>{message}</div>;
}

export default function LoginPage() {
  const router = useRouter();
  const { isReady, state, currentUser, login } = useAppState();
  const [form, setForm] = useState({ username: "", password: "" });
  const [notice, setNotice] = useState({ message: "", tone: "error" });

  const hasUsers = (state.users || []).length > 0;

  useEffect(() => {
    if (!isReady || !currentUser) return;
    router.replace(ROLE_HOME[currentUser.role] || "/dashboard");
  }, [currentUser, isReady, router]);

  const handleSubmit = (event) => {
    event.preventDefault();

    const result = login(form.username, form.password);
    if (!result?.ok) {
      setNotice({ message: result?.message || "ไม่สามารถเข้าสู่ระบบได้", tone: "error" });
      return;
    }

    setNotice({ message: "", tone: "error" });
    router.push(ROLE_HOME[result.user.role] || "/dashboard");
  };

  return (
    <div className="min-h-screen bg-[radial-gradient(circle_at_top_left,rgba(251,146,60,0.14),transparent_30%),linear-gradient(180deg,#f8fafc_0%,#eef2ff_100%)] px-4 py-8">
      <div className="mx-auto grid min-h-[calc(100vh-4rem)] max-w-[1180px] items-center gap-6 xl:grid-cols-[minmax(0,1.1fr)_480px]">
        <section className="border border-slate-200/80 bg-slate-950 p-8 text-white shadow-[0_30px_80px_rgba(15,23,42,0.24)] lg:p-10">
          <div className="text-[11px] font-semibold uppercase tracking-[0.32em] text-orange-200/80">Sophon Operations</div>
          <h1 className="mt-4 text-4xl font-bold tracking-tight">ระบบจัดการส่งสินค้าและคนขับ</h1>
          <p className="mt-4 max-w-2xl text-sm leading-7 text-slate-300">
            เข้าสู่ระบบด้วยบัญชีพนักงาน เพื่อใช้งานเฉพาะหน้าที่ของแต่ละแผนกอย่างถูกต้องตาม workflow ของงานส่งสินค้า
          </p>

          <div className="mt-8 grid gap-4 md:grid-cols-3">
            <div className="border border-white/10 bg-white/5 px-4 py-4">
              <div className="text-xs uppercase tracking-[0.16em] text-slate-400">Sales</div>
              <div className="mt-2 text-lg font-semibold">รับออเดอร์และยืนยัน PO</div>
            </div>
            <div className="border border-white/10 bg-white/5 px-4 py-4">
              <div className="text-xs uppercase tracking-[0.16em] text-slate-400">Warehouse</div>
              <div className="mt-2 text-lg font-semibold">ตรวจคลังและเตรียมสินค้า</div>
            </div>
            <div className="border border-white/10 bg-white/5 px-4 py-4">
              <div className="text-xs uppercase tracking-[0.16em] text-slate-400">Driver</div>
              <div className="mt-2 text-lg font-semibold">อัปเดตผลการจัดส่งและปิดรอบ</div>
            </div>
          </div>
        </section>

        <section className="border border-slate-200/80 bg-white p-6 shadow-[0_24px_60px_rgba(15,23,42,0.1)] lg:p-8">
          <div className="text-[11px] font-semibold uppercase tracking-[0.24em] text-brand-600">Login</div>
          <h2 className="mt-3 text-3xl font-bold tracking-tight text-slate-950">เข้าสู่ระบบ</h2>
          <p className="mt-3 text-sm leading-6 text-slate-500">
            ใช้ username และ password ของพนักงานในระบบ เพื่อเปิดมุมมองตามสิทธิ์ของบัญชี
          </p>

          <form className="mt-6 space-y-5" onSubmit={handleSubmit}>
            {!hasUsers ? (
              <Notice
                message="ยังไม่มีบัญชีพนักงานในระบบ กรุณาติดต่อผู้จัดการเพื่อสร้างบัญชีก่อนเข้าสู่ระบบ"
                tone="warning"
              />
            ) : null}
            {notice.message ? <Notice message={notice.message} tone={notice.tone} /> : null}

            <label className="block">
              <div className="mb-2 text-sm font-semibold text-slate-900">Username</div>
              <input
                value={form.username}
                onChange={(event) => setForm((current) => ({ ...current, username: event.target.value }))}
                placeholder="กรอกชื่อผู้ใช้"
                autoComplete="username"
                required
              />
            </label>

            <label className="block">
              <div className="mb-2 text-sm font-semibold text-slate-900">Password</div>
              <input
                type="password"
                value={form.password}
                onChange={(event) => setForm((current) => ({ ...current, password: event.target.value }))}
                placeholder="กรอกรหัสผ่าน"
                autoComplete="current-password"
                required
              />
            </label>

            <button type="submit" className="w-full bg-brand-600 px-5 py-3 text-sm font-semibold text-white hover:bg-brand-700">
              เข้าสู่ระบบ
            </button>
          </form>

          {hasUsers ? (
            <div className="mt-6 border border-slate-200 bg-slate-50 px-4 py-4">
              <div className="text-sm font-semibold text-slate-950">บัญชีที่พร้อมใช้งานในระบบ</div>
              <div className="mt-3 flex flex-wrap gap-2">
                {[...new Set((state.users || []).map((user) => user.role))].map((role) => (
                  <span key={role} className="border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-600">
                    {ROLE_LABELS[role] || role}
                  </span>
                ))}
              </div>
            </div>
          ) : null}
        </section>
      </div>
    </div>
  );
}
