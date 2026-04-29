"use client";

import { RoleLandingPage } from "@/components/ui/RoleLanding";

export default function SalesHomePage() {
  return (
    <RoleLandingPage
      currentPath="/sales-home"
      title="หน้าหลักฝ่ายขาย"
      description="หน้ารวมงานของฝ่ายขาย รับออเดอร์จาก Line ยืนยันข้อมูลลูกค้า และจัดงานส่งต่อให้ทีมจัดส่ง"
      focusTitle="Sales"
      focusItems={[
        { tag: "Order", title: "รับออเดอร์และยืนยัน", description: "คีย์ PO จาก Line OA และยืนยันรายละเอียดเพื่อส่งเข้าคลัง" },
        { tag: "Route", title: "จัดงานส่งของวัน", description: "จัดลำดับ route และเตรียมงานให้ทีมส่งของออกงานได้เร็วขึ้น" },
      ]}
      pageLinks={[
        { href: "/line-orders", tag: "Input", title: "รับออเดอร์ Line", description: "สร้าง PO และพิมพ์เอกสารจากออเดอร์ลูกค้า" },
        { href: "/send-orders", tag: "Dispatch", title: "จัดการส่งสินค้า", description: "จัด route ของแต่ละวันและส่งต่อให้คนขับ" },
        { href: "/send-history", tag: "History", title: "ประวัติเส้นทาง", description: "ตรวจดู route ที่จัดไว้แล้วในวันก่อนหน้า" },
      ]}
    />
  );
}
