"use client";

import { RoleLandingPage } from "@/components/ui/RoleLanding";

export default function ManagerHomePage() {
  return (
    <RoleLandingPage
      currentPath="/manager-home"
      title="หน้าหลักผู้จัดการ"
      description="ภาพรวมสำหรับผู้จัดการ ติดตามทุกแผนก ตรวจสถานะ PO และดูการจัดส่งทั้งหมด"
      focusTitle="Manager"
      focusItems={[
        { tag: "Monitor", title: "ดูภาพรวมทั้งหมด", description: "ติดตามยอด PO สถานะคลัง เส้นทางส่ง และงานคนขับได้จากบทบาทเดียว" },
        { tag: "Control", title: "จัดการสิทธิ์และข้อมูลหลัก", description: "ดูแลผู้ใช้ ราคา และตรวจความถูกต้องของ workflow ทุกแผนก" },
      ]}
      pageLinks={[
        { href: "/dashboard", tag: "Overview", title: "แดชบอร์ด", description: "ดูภาพรวมคำสั่งซื้อ งานส่ง และกิจกรรมล่าสุด" },
        { href: "/line-orders", tag: "Sales", title: "รับออเดอร์ Line", description: "เปิดหน้าฝ่ายขายเพื่อรับและยืนยัน PO" },
        { href: "/po-status", tag: "Warehouse", title: "สถานะ PO", description: "ติดตามงานคลังและอัปเดตสถานะจัดเสร็จ" },
        { href: "/send-orders", tag: "Dispatch", title: "จัดการส่งสินค้า", description: "จัด route และมอบหมายงานส่งของแต่ละวัน" },
        { href: "/driver", tag: "Driver", title: "หน้าคนขับ", description: "ดูงานคนขับและสถานะส่งของ" },
        { href: "/users", tag: "Access", title: "ผู้ใช้", description: "สร้างบัญชีและกำหนดบทบาทของแต่ละแผนก" },
      ]}
    />
  );
}
