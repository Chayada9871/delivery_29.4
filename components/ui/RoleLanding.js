"use client";

import Link from "next/link";
import { AppShell } from "@/components/ui/Shell";
import { SectionCard, SoftCard } from "@/components/ui/Cards";
import { useAppState } from "@/lib/app-state";

export function RoleLandingPage({
  currentPath,
  title,
  description,
  focusTitle,
  focusItems,
  pageLinks,
}) {
  const { currentUser } = useAppState();

  return (
    <AppShell currentPath={currentPath} title={title} description={description}>
      <div className="space-y-6">
        <SectionCard title="หน้าที่ของบทบาทนี้">
          <div className="grid gap-4 xl:grid-cols-[1.2fr_0.8fr]">
            <div className="grid gap-3 md:grid-cols-2">
              {focusItems.map((item) => (
                <SoftCard key={item.title} className="bg-white">
                  <div className="text-xs font-semibold uppercase tracking-[0.18em] text-brand-600">{item.tag}</div>
                  <div className="mt-2 text-lg font-semibold text-slate-950">{item.title}</div>
                  <div className="mt-2 text-sm text-slate-600">{item.description}</div>
                </SoftCard>
              ))}
            </div>

            <SoftCard className="bg-brand-50">
              <div className="text-xs font-semibold uppercase tracking-[0.18em] text-brand-700">Current Role</div>
              <div className="mt-2 text-xl font-bold text-slate-950">{focusTitle}</div>
              <div className="mt-2 text-sm text-slate-600">
                {currentUser ? `${currentUser.name} กำลังใช้งานในบทบาทนี้` : "เลือกผู้ใช้งานจากแถบด้านซ้ายก่อน"}
              </div>
            </SoftCard>
          </div>
        </SectionCard>

        <SectionCard title="หน้าที่เข้าใช้งานได้">
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            {pageLinks.map((item) => (
              <Link key={item.href} href={item.href} className="block">
                <SoftCard className="h-full bg-white transition hover:border-brand-300 hover:bg-brand-50/40">
                  <div className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-400">{item.tag}</div>
                  <div className="mt-2 text-lg font-semibold text-slate-950">{item.title}</div>
                  <div className="mt-2 text-sm text-slate-600">{item.description}</div>
                </SoftCard>
              </Link>
            ))}
          </div>
        </SectionCard>
      </div>
    </AppShell>
  );
}
