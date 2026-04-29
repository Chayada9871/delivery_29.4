"use client";

import { RoleLandingPage } from "@/components/ui/RoleLanding";

export default function WarehouseHomePage() {
  return (
    <RoleLandingPage
      currentPath="/warehouse-home"
      title="หน้าหลักคลังสินค้า"
      description="หน้าทำงานสำหรับคลัง ตรวจ PO ที่ส่งเข้ามา และกดอัปเดตเมื่อจัดสินค้าเสร็จแล้ว"
      focusTitle="Warehouse"
      focusItems={[
        { tag: "Check", title: "ตรวจ PO ที่เข้าคลัง", description: "ดูรายการ PO ที่ฝ่ายขายยืนยันแล้วและรอจัดสินค้า" },
        { tag: "Update", title: "กดจัดเสร็จ", description: "เมื่อคลังเตรียมสินค้าเสร็จแล้ว สามารถอัปเดตสถานะเพื่อส่งต่อไปทีมจัดส่ง" },
      ]}
      pageLinks={[
        { href: "/po-status", tag: "PO", title: "สถานะ PO", description: "ดู PO ทั้งหมดที่เข้าคลัง เปิด PDF และกดจัดเสร็จ" },
      ]}
    />
  );
}
