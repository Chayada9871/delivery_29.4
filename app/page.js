"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { useAppState } from "@/lib/app-state";
import { ROLE_HOME } from "@/lib/config";

function resolveTarget({ isReady, users, currentUser }) {
  if (!isReady) return "";
  if (!users.length) return "/users";
  if (currentUser) return ROLE_HOME[currentUser.role] || "/dashboard";
  return "/login";
}

export default function HomePage() {
  const router = useRouter();
  const { isReady, state, currentUser } = useAppState();
  const [showManualActions, setShowManualActions] = useState(false);

  const users = state.users || [];
  const targetHref = useMemo(
    () => resolveTarget({ isReady, users, currentUser }),
    [currentUser, isReady, users]
  );

  useEffect(() => {
    if (isReady) {
      setShowManualActions(false);
      return undefined;
    }

    const timer = window.setTimeout(() => {
      setShowManualActions(true);
    }, 1500);

    return () => window.clearTimeout(timer);
  }, [isReady]);

  useEffect(() => {
    if (!targetHref) return undefined;

    router.replace(targetHref);

    const hardRedirectTimer = window.setTimeout(() => {
      if (window.location.pathname === "/") {
        window.location.replace(targetHref);
      }
    }, 700);

    return () => window.clearTimeout(hardRedirectTimer);
  }, [router, targetHref]);

  const title = !isReady
    ? "กำลังตรวจสอบสิทธิ์การเข้าใช้งาน..."
    : targetHref === "/users"
      ? "ยังไม่พบบัญชีผู้ใช้งานในระบบ"
      : targetHref === "/login"
        ? "กำลังพาไปหน้าเข้าสู่ระบบ"
        : "กำลังเปิดหน้าหลักตามสิทธิ์ของคุณ";

  const description = !isReady
    ? "ระบบกำลังโหลดข้อมูลผู้ใช้และสิทธิ์การเข้าใช้งาน หากค้างนานผิดปกติสามารถใช้ปุ่มด้านล่างเพื่อไปต่อได้ทันที"
    : targetHref === "/users"
      ? "เริ่มต้นด้วยการสร้างบัญชีผู้จัดการหรือบัญชีพนักงานก่อนใช้งานระบบ"
      : targetHref === "/login"
        ? "พบรายการพนักงานแล้ว แต่ยังไม่มีผู้ใช้ที่ล็อกอินอยู่ในขณะนี้"
        : "หากหน้าไม่เปลี่ยนอัตโนมัติ สามารถกดปุ่มด้านล่างเพื่อไปยังหน้าที่ระบบเลือกให้ได้ทันที";

  return (
    <div className="flex min-h-screen items-center justify-center bg-slate-50 px-6">
      <div className="w-full max-w-xl border border-slate-200 bg-white p-7 shadow-sm">
        <div className="text-[11px] font-semibold uppercase tracking-[0.24em] text-brand-600">
          Sophon Delivery
        </div>
        <h1 className="mt-3 text-2xl font-bold tracking-tight text-slate-950">{title}</h1>
        <p className="mt-3 text-sm leading-6 text-slate-600">{description}</p>

        {showManualActions || isReady ? (
          <div className="mt-6 flex flex-wrap gap-3">
            {targetHref ? (
              <Link
                href={targetHref}
                className="bg-slate-950 px-4 py-3 text-sm font-semibold text-white hover:bg-slate-800"
              >
                ไปหน้าถัดไป
              </Link>
            ) : null}
            <Link
              href="/login"
              className="border border-slate-200 bg-white px-4 py-3 text-sm font-semibold text-slate-700 hover:bg-slate-50"
            >
              ไปหน้าเข้าสู่ระบบ
            </Link>
            <Link
              href="/users"
              className="border border-slate-200 bg-white px-4 py-3 text-sm font-semibold text-slate-700 hover:bg-slate-50"
            >
              ไปหน้าจัดการพนักงาน
            </Link>
          </div>
        ) : null}
      </div>
    </div>
  );
}
