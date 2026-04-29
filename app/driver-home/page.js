"use client";

import { RoleLandingPage } from "@/components/ui/RoleLanding";

export default function DriverHomePage() {
  return (
    <RoleLandingPage
      currentPath="/driver-home"
      title="หน้าหลักคนขับ"
      description="หน้ารวมงานของคนขับ ดูงานที่ได้รับมอบหมาย และอัปเดตสถานะการส่งของตัวเอง"
      focusTitle="Driver"
      focusItems={[
        { tag: "Job", title: "ดูงานของตัวเอง", description: "ระบบจะแสดงเฉพาะ PO ที่มอบหมายให้คนขับคนนั้น" },
        { tag: "Status", title: "อัปเดตสถานะส่ง", description: "กดอัปเดตเป็นกำลังจัดส่งและส่งสำเร็จได้จากหน้าคนขับ" },
      ]}
      pageLinks={[
        { href: "/driver", tag: "Delivery", title: "หน้าคนขับ", description: "ดูจุดส่งและอัปเดตสถานะการส่งของแต่ละงาน" },
      ]}
    />
  );
}
