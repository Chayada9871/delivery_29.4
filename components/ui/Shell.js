"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { PAGE_ACCESS } from "@/lib/config";
import { useAppState } from "@/lib/app-state";

const NAV_ITEMS = [
  ["/dashboard", "แดชบอร์ด"],
  ["/line-orders", "รับออเดอร์"],
  ["/po-status", "สถานะ PO"],
  ["/send-orders", "วางแผนส่ง"],
  ["/driver", "งานคนขับ"],
  ["/send-history", "ประวัติส่ง"],
  ["/return-history", "ประวัติการยกเลิก"],
  ["/pricing", "ราคา"],
  ["/users", "จัดการพนักงาน"],
];

function canAccess(role, path) {
  const allowedRoles = PAGE_ACCESS[path];
  if (!allowedRoles?.length) return true;
  return allowedRoles.includes(role);
}

function getAccessiblePages(user) {
  if (!user) return [];
  return NAV_ITEMS.filter(([href]) => canAccess(user.role, href));
}

export function AppShell({ title, description, currentPath, children, aside }) {
  const router = useRouter();
  const { state, currentUser, logout } = useAppState();
  const users = state.users || [];
  const hasUsers = users.length > 0;
  const requiresLogin = hasUsers && !currentUser;
  const showSetupPrompt = !hasUsers && currentPath !== "/users";
  const currentPageAllowed = !currentUser || !currentPath ? true : canAccess(currentUser.role, currentPath);

  const visibleNav = currentUser ? NAV_ITEMS.filter(([href]) => canAccess(currentUser.role, href)) : [];
  const currentUserPages = getAccessiblePages(currentUser);

  const handleLogout = () => {
    logout();
    router.push("/login");
  };

  return (
    <div className="min-h-screen bg-[radial-gradient(circle_at_top_left,rgba(249,115,22,0.10),transparent_34%),radial-gradient(circle_at_bottom_right,rgba(14,165,233,0.08),transparent_30%),linear-gradient(180deg,#f8fafc_0%,#eef2f7_100%)]">
      <div className="mx-auto grid min-h-screen max-w-[1800px] gap-3 p-2 sm:p-3 xl:grid-cols-[320px_minmax(0,1fr)] xl:gap-4 xl:p-5">
        <aside className="sticky top-0 z-20 grid grid-cols-[auto_minmax(0,1fr)] items-center gap-2 border border-white/10 bg-slate-950/95 p-2 text-white shadow-[0_18px_50px_rgba(15,23,42,0.22)] ring-1 ring-slate-900/10 backdrop-blur xl:top-5 xl:block xl:self-start xl:p-5 xl:shadow-[0_28px_80px_rgba(15,23,42,0.26)]">
          <div className="order-1 w-[96px] overflow-hidden border border-white/10 bg-[#271089] shadow-inner sm:w-[128px] xl:w-auto">
            <img
              src="/images/logo.png"
              alt="Sophon delivery logo"
              className="block h-auto w-full"
            />
          </div>

          {currentUser ? (
            <nav className="order-3 col-span-2 flex gap-2 overflow-x-auto pb-1 xl:mt-5 xl:grid xl:overflow-visible xl:pb-0">
              {visibleNav.map(([href, label]) => {
                const active = currentPath === href || (href === "/dashboard" && currentPath === "/");
                return (
                  <Link
                    key={href}
                    href={href}
                    className={`shrink-0 whitespace-nowrap border px-3 py-2 text-xs font-semibold shadow-sm transition xl:px-4 xl:py-3 xl:text-sm ${
                      active
                        ? "border-brand-300 bg-brand-500 text-white ring-1 ring-brand-200/40"
                        : "border-white/10 bg-white/5 text-slate-200 hover:border-white/25 hover:bg-white/10"
                    }`}
                  >
                    {label}
                  </Link>
                );
              })}
            </nav>
          ) : null}

          <div className="order-2 justify-self-end xl:mt-5">
            {currentUser ? (
              <button
                type="button"
                className="w-full border border-white/15 bg-white/10 px-4 py-2 text-xs font-semibold text-white shadow-sm transition hover:bg-white/15 xl:py-3 xl:text-sm"
                onClick={handleLogout}
              >
                ออกจากระบบ
              </button>
            ) : hasUsers ? (
              <Link
                href="/login"
                className="block border border-white/15 bg-white/10 px-4 py-2 text-center text-xs font-semibold text-white shadow-sm transition hover:bg-white/15 xl:py-3 xl:text-sm"
              >
                ไปหน้าเข้าสู่ระบบ
              </Link>
            ) : (
              <Link
                href="/users"
                className="block border border-white/15 bg-white/10 px-4 py-2 text-center text-xs font-semibold text-white shadow-sm transition hover:bg-white/15 xl:py-3 xl:text-sm"
              >
                เริ่มสร้างบัญชีพนักงาน
              </Link>
            )}
          </div>
        </aside>

        <main className="min-w-0">
          <div className="border border-white/80 bg-white/95 p-2 shadow-[0_18px_54px_rgba(15,23,42,0.10)] ring-1 ring-slate-200/70 backdrop-blur sm:p-4 xl:p-6">
            <div className="flex flex-col gap-3 border-b border-slate-100 pb-4 xl:flex-row xl:items-end xl:justify-between xl:pb-5">
              <div>
                <div className="text-[11px] font-semibold uppercase tracking-[0.28em] text-brand-600">พื้นที่ปฏิบัติการ</div>
                <h1 className="mt-2 text-xl font-bold tracking-tight text-slate-950 sm:text-3xl xl:mt-3">{title}</h1>
                <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-500 xl:mt-3">{description}</p>
              </div>
              {aside ? <div className="shrink-0">{aside}</div> : null}
            </div>

            <div className="mt-4 xl:mt-6">
              {showSetupPrompt ? (
                <div className="border border-brand-200 bg-gradient-to-br from-brand-50 to-orange-50 p-6">
                  <div className="text-xl font-semibold text-slate-950">ตั้งค่าบัญชีผู้จัดการก่อน</div>
                  <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-600">
                    ระบบนี้ต้องมีบัญชีผู้จัดการอย่างน้อย 1 บัญชีก่อน จึงจะเริ่มสร้างพนักงานและใช้งาน workflow แต่ละแผนกได้
                  </p>
                  <Link
                    href="/users"
                    className="mt-4 inline-flex bg-brand-600 px-4 py-3 text-sm font-semibold text-white hover:bg-brand-700"
                  >
                    เปิดหน้าจัดการพนักงาน
                  </Link>
                </div>
              ) : requiresLogin ? (
                <div className="border border-slate-200 bg-slate-50 p-6">
                  <div className="text-xl font-semibold text-slate-950">กรุณาเข้าสู่ระบบก่อน</div>
                  <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-600">
                    บัญชีพนักงานถูกสร้างไว้แล้ว แต่ยังไม่มีผู้ใช้ที่ล็อกอินอยู่ในขณะนี้ เข้าสู่ระบบด้วย username และ password เพื่อใช้งานหน้าปฏิบัติการ
                  </p>
                  <Link
                    href="/login"
                    className="mt-4 inline-flex bg-slate-950 px-4 py-3 text-sm font-semibold text-white hover:bg-slate-800"
                  >
                    ไปหน้าเข้าสู่ระบบ
                  </Link>
                </div>
              ) : !currentPageAllowed ? (
                <div className="border border-rose-200 bg-rose-50 p-6">
                  <div className="text-xl font-semibold text-slate-950">บัญชีนี้ไม่มีสิทธิ์เข้าใช้งานหน้านี้</div>
                  <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-600">
                    เปลี่ยนไปหน้าอื่นที่อยู่ในสิทธิ์ของบัญชีนี้ หรือออกจากระบบแล้วเข้าสู่ระบบด้วยบทบาทที่เหมาะสมกว่า
                  </p>
                  <div className="mt-4 flex flex-wrap gap-2">
                    {currentUserPages.map(([href, label]) => (
                      <Link
                        key={href}
                        href={href}
                        className="border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-100"
                      >
                        {label}
                      </Link>
                    ))}
                  </div>
                </div>
              ) : (
                children
              )}
            </div>
          </div>
        </main>
      </div>
    </div>
  );
}
