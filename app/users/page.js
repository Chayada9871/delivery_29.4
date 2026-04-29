"use client";

import { useMemo, useState } from "react";
import { AppShell } from "@/components/ui/Shell";
import { SectionCard, SoftCard, StatCard } from "@/components/ui/Cards";
import { EmptyState } from "@/components/ui/EmptyState";
import { ToneBadge } from "@/components/ui/Badge";
import { useAppState } from "@/lib/app-state";
import { ROLE_LABELS, ROLES } from "@/lib/config";

const DEPARTMENT_OPTIONS = [ROLES.MANAGER, ROLES.SALES, ROLES.WAREHOUSE, ROLES.DRIVER];

const DEPARTMENT_HELP = {
  [ROLES.MANAGER]: "เห็นภาพรวมทุกหน้าและจัดการบัญชีพนักงานได้",
  [ROLES.SALES]: "รับออเดอร์จากลูกค้า ยืนยัน PO และติดตามการส่ง",
  [ROLES.WAREHOUSE]: "ตรวจสถานะ PO และยืนยันการเตรียมสินค้า",
  [ROLES.DRIVER]: "เห็นเฉพาะงานที่มอบหมาย อัปเดตผลการจัดส่ง และปิดรอบส่ง",
};

function createInitialForm(hasUsers) {
  return {
    name: "",
    username: "",
    password: "",
    department: hasUsers ? ROLES.SALES : ROLES.MANAGER,
    employeeCode: "",
    position: "",
    phone: "",
    email: "",
    area: "",
    vehicleType: "",
    maxOrders: "",
    note: "",
  };
}

function Notice({ message, tone = "success" }) {
  const classes =
    tone === "error"
      ? "border-rose-200 bg-rose-50 text-rose-700"
      : tone === "warning"
        ? "border-amber-200 bg-amber-50 text-amber-700"
        : "border-emerald-200 bg-emerald-50 text-emerald-700";

  return <div className={`border px-4 py-3 text-sm font-medium ${classes}`}>{message}</div>;
}

function ExpandableText({ value, limit = 60 }) {
  const [expanded, setExpanded] = useState(false);
  const text = String(value || "").trim();

  if (!text) {
    return <span className="text-slate-400">-</span>;
  }

  if (text.length <= limit) {
    return <span>{text}</span>;
  }

  return (
    <div className="space-y-2">
      <div>{expanded ? text : `${text.slice(0, limit)}...`}</div>
      <button
        type="button"
        className="text-xs font-semibold text-brand-700 hover:text-brand-800"
        onClick={() => setExpanded((current) => !current)}
      >
        {expanded ? "ย่อข้อความ" : "ดูเพิ่มเติม"}
      </button>
    </div>
  );
}

export default function UsersPage() {
  const { state, currentUser, addUser, switchCurrentUser } = useAppState();
  const [form, setForm] = useState(createInitialForm((state.users || []).length > 0));
  const [notice, setNotice] = useState({ message: "", tone: "success" });

  const hasUsers = (state.users || []).length > 0;
  const canManageUsers = !hasUsers || currentUser?.role === ROLES.MANAGER;
  const selectedDepartment = form.department;
  const isDriverDepartment = selectedDepartment === ROLES.DRIVER;

  const stats = useMemo(() => {
    const users = state.users || [];
    return {
      total: users.length,
      managers: users.filter((user) => user.role === ROLES.MANAGER).length,
      operations: users.filter((user) => [ROLES.SALES, ROLES.WAREHOUSE].includes(user.role)).length,
      drivers: users.filter((user) => user.role === ROLES.DRIVER).length,
    };
  }, [state.users]);

  const departmentSummary = useMemo(() => {
    return DEPARTMENT_OPTIONS.map((department) => ({
      department,
      label: ROLE_LABELS[department] || department,
      count: (state.users || []).filter((user) => user.role === department).length,
      description: DEPARTMENT_HELP[department] || "",
    }));
  }, [state.users]);

  const handleFormChange = (field, value) => {
    setForm((current) => ({ ...current, [field]: value }));
  };

  const handleSubmit = async (event) => {
    event.preventDefault();

    const payload = {
      ...form,
      role: form.department,
      department: form.department,
      vehicleType: isDriverDepartment ? form.vehicleType : "",
      maxOrders: isDriverDepartment ? form.maxOrders : "",
    };

    const result = await addUser(payload);

    if (!result?.ok) {
      setNotice({ message: result?.message || "ไม่สามารถสร้างบัญชีพนักงานได้", tone: "error" });
      return;
    }

    setNotice({
      message:
        result?.saveResult?.ok === false
          ? `สร้างบัญชี ${result?.user?.username || payload.username} ในระบบแล้ว แต่ Supabase ไม่สำเร็จ: ${result.saveResult.message}`
          : `สร้างบัญชีพนักงาน ${result?.user?.name || payload.name} เรียบร้อยแล้ว`,
      tone: result?.saveResult?.ok === false ? "warning" : "success",
    });

    setForm(createInitialForm(true));
  };

  return (
    <AppShell
      currentPath="/users"
      title="จัดการพนักงาน"
      description="หน้าสำหรับผู้จัดการสร้างบัญชีพนักงาน กำหนดแผนกและสิทธิ์การใช้งาน พร้อมบันทึกรายละเอียดสำคัญของแต่ละคนไว้ในระบบ"
    >
      <div className="space-y-6">
        {notice.message ? <Notice message={notice.message} tone={notice.tone} /> : null}

        <SectionCard
          title="ภาพรวมบุคลากร"
          description="สรุปจำนวนผู้ใช้งานตามหน่วยงานหลักของระบบ เพื่อให้ผู้จัดการเห็นกำลังคนแต่ละฝ่ายอย่างรวดเร็ว"
        >
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
            <StatCard label="พนักงานทั้งหมด" value={stats.total} />
            <StatCard label="ผู้จัดการ" value={stats.managers} tone="brand" />
            <StatCard label="ฝ่ายขายและคลัง" value={stats.operations} tone="warning" />
            <StatCard label="คนขับ" value={stats.drivers} tone="success" />
          </div>
        </SectionCard>

        <div className="grid gap-6 xl:grid-cols-[minmax(0,1.4fr)_380px]">
          <SectionCard
            title="สร้างบัญชีพนักงาน"
            description="กรอกข้อมูลพนักงานใหม่ให้ครบ ชื่อผู้ใช้จะใช้เข้าสู่ระบบ และแผนกที่เลือกจะกำหนดสิทธิ์การเข้าถึงอัตโนมัติ"
          >
            {!canManageUsers ? (
              <div className="border border-amber-200 bg-amber-50 px-4 py-4 text-sm text-amber-800">
                หน้านี้เปิดให้ดูได้ แต่การสร้างบัญชีใหม่ต้องใช้บัญชีผู้จัดการเท่านั้น
              </div>
            ) : (
              <form className="space-y-5" onSubmit={handleSubmit}>
                <div className="grid gap-4 md:grid-cols-2">
                  <label className="block">
                    <div className="mb-2 text-sm font-semibold text-slate-900">ชื่อพนักงาน</div>
                    <input
                      value={form.name}
                      onChange={(event) => handleFormChange("name", event.target.value)}
                      placeholder="เช่น สมชาย ใจดี"
                      required
                    />
                  </label>

                  <label className="block">
                    <div className="mb-2 text-sm font-semibold text-slate-900">รหัสพนักงาน</div>
                    <input
                      value={form.employeeCode}
                      onChange={(event) => handleFormChange("employeeCode", event.target.value)}
                      placeholder="เช่น EMP-001"
                    />
                  </label>

                  <label className="block">
                    <div className="mb-2 text-sm font-semibold text-slate-900">Username</div>
                    <input
                      value={form.username}
                      onChange={(event) => handleFormChange("username", event.target.value)}
                      placeholder="เช่น somchai.j"
                      required
                    />
                  </label>

                  <label className="block">
                    <div className="mb-2 text-sm font-semibold text-slate-900">Password</div>
                    <input
                      type="password"
                      value={form.password}
                      onChange={(event) => handleFormChange("password", event.target.value)}
                      placeholder="อย่างน้อย 4 ตัวอักษร"
                      required
                    />
                  </label>

                  <label className="block">
                    <div className="mb-2 text-sm font-semibold text-slate-900">แผนก</div>
                    <select
                      value={form.department}
                      onChange={(event) => handleFormChange("department", event.target.value)}
                    >
                      {DEPARTMENT_OPTIONS.map((department) => (
                        <option key={department} value={department}>
                          {ROLE_LABELS[department] || department}
                        </option>
                      ))}
                    </select>
                    <div className="mt-2 text-xs text-slate-500">
                      แผนกนี้จะกำหนดสิทธิ์เข้าใช้งานของพนักงานในระบบด้วย
                    </div>
                  </label>

                  <label className="block">
                    <div className="mb-2 text-sm font-semibold text-slate-900">ตำแหน่ง</div>
                    <input
                      value={form.position}
                      onChange={(event) => handleFormChange("position", event.target.value)}
                      placeholder="เช่น หัวหน้าคลัง, พนักงานขาย, พนักงานขับรถ"
                    />
                  </label>

                  <label className="block">
                    <div className="mb-2 text-sm font-semibold text-slate-900">เบอร์โทร</div>
                    <input
                      value={form.phone}
                      onChange={(event) => handleFormChange("phone", event.target.value)}
                      placeholder="เช่น 0812345678"
                    />
                  </label>

                  <label className="block">
                    <div className="mb-2 text-sm font-semibold text-slate-900">อีเมล</div>
                    <input
                      type="email"
                      value={form.email}
                      onChange={(event) => handleFormChange("email", event.target.value)}
                      placeholder="เช่น staff@sophon.co.th"
                    />
                  </label>

                  <label className="block md:col-span-2">
                    <div className="mb-2 text-sm font-semibold text-slate-900">พื้นที่หรือขอบเขตงานรับผิดชอบ</div>
                    <input
                      value={form.area}
                      onChange={(event) => handleFormChange("area", event.target.value)}
                      placeholder="เช่น โซนพัทยา, ดูแลลูกค้ากลุ่มค้าส่ง, คลังจัดเตรียมสินค้า"
                    />
                  </label>

                  <label className="block">
                    <div className="mb-2 text-sm font-semibold text-slate-900">ประเภทรถ</div>
                    <input
                      value={form.vehicleType}
                      onChange={(event) => handleFormChange("vehicleType", event.target.value)}
                      placeholder="เช่น กระบะตู้ทึบ, รถห้องเย็น"
                      disabled={!isDriverDepartment}
                    />
                  </label>

                  <label className="block">
                    <div className="mb-2 text-sm font-semibold text-slate-900">จำนวนงานสูงสุดต่อรอบ</div>
                    <input
                      type="number"
                      min="1"
                      value={form.maxOrders}
                      onChange={(event) => handleFormChange("maxOrders", event.target.value)}
                      placeholder="เช่น 12"
                      disabled={!isDriverDepartment}
                    />
                  </label>

                  <label className="block md:col-span-2">
                    <div className="mb-2 text-sm font-semibold text-slate-900">รายละเอียดเพิ่มเติม</div>
                    <textarea
                      value={form.note}
                      onChange={(event) => handleFormChange("note", event.target.value)}
                      placeholder="เช่น เวลาทำงาน, ข้อจำกัด, หมายเหตุภายใน หรือข้อมูลที่ผู้จัดการควรรู้"
                    />
                  </label>
                </div>

                <div className="flex flex-wrap gap-3">
                  <button type="submit" className="bg-brand-600 px-5 py-3 text-sm font-semibold text-white hover:bg-brand-700">
                    สร้างบัญชีพนักงาน
                  </button>
                  <button
                    type="button"
                    className="border border-slate-200 bg-white px-5 py-3 text-sm font-semibold text-slate-700 hover:bg-slate-50"
                    onClick={() => setForm(createInitialForm(hasUsers))}
                  >
                    ล้างฟอร์ม
                  </button>
                </div>
              </form>
            )}
          </SectionCard>

          <div className="space-y-6">
            <SectionCard
              title="แผนกที่เลือก"
              description="ช่วยตรวจสอบว่าบัญชีที่กำลังจะสร้างมีสิทธิ์และข้อมูลสอดคล้องกับหน่วยงานที่ต้องการ"
            >
              <SoftCard className="bg-white">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <div className="text-xs uppercase tracking-[0.18em] text-slate-400">Department</div>
                    <div className="mt-2 text-lg font-semibold text-slate-950">
                      {ROLE_LABELS[selectedDepartment] || selectedDepartment}
                    </div>
                  </div>
                  <ToneBadge tone={selectedDepartment === ROLES.DRIVER ? "success" : selectedDepartment === ROLES.WAREHOUSE ? "warning" : "brand"}>
                    {ROLE_LABELS[selectedDepartment] || selectedDepartment}
                  </ToneBadge>
                </div>
                <div className="mt-3 text-sm leading-6 text-slate-600">
                  {DEPARTMENT_HELP[selectedDepartment] || "กำหนดขอบเขตการเข้าถึงตามบทบาทของพนักงาน"}
                </div>
                <div className="mt-4 border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-600">
                  {isDriverDepartment
                    ? "สำหรับคนขับ ควรระบุประเภทรถและจำนวนงานสูงสุดต่อรอบ เพื่อใช้วางแผนการมอบหมายงานส่ง"
                    : "สำหรับฝ่ายงานภายใน ควรระบุพื้นที่หรือขอบเขตงานรับผิดชอบไว้เพื่อช่วยจัดโครงสร้างทีม"}
                </div>
              </SoftCard>
            </SectionCard>

            <SectionCard
              title="สรุปตามแผนก"
              description="ดูจำนวนบัญชีแต่ละแผนกแบบรวดเร็ว พร้อมคำอธิบายบทบาทหลัก"
            >
              <div className="space-y-3">
                {departmentSummary.map((item) => (
                  <div key={item.department} className="border border-slate-200 bg-slate-50 px-4 py-4">
                    <div className="flex items-center justify-between gap-3">
                      <div className="font-semibold text-slate-950">{item.label}</div>
                      <div className="text-sm font-semibold text-slate-500">{item.count} บัญชี</div>
                    </div>
                    <div className="mt-2 text-sm leading-6 text-slate-500">{item.description}</div>
                  </div>
                ))}
              </div>
            </SectionCard>
          </div>
        </div>

        <SectionCard
          title="ทะเบียนพนักงาน"
          description="รายการบัญชีพนักงานทั้งหมดในระบบ ผู้จัดการสามารถตรวจสอบข้อมูลและกดสลับบทบาทเข้าใช้งานเพื่อทดสอบมุมมองได้"
        >
          {!state.users.length ? (
            <EmptyState text="ยังไม่มีผู้ใช้งานในระบบ" />
          ) : (
            <div className="overflow-x-auto border border-slate-200 bg-white">
              <table className="min-w-[1380px] w-full text-left text-sm text-slate-700">
                <thead className="bg-slate-50 text-xs uppercase tracking-[0.18em] text-slate-500">
                  <tr>
                    <th className="px-4 py-3 font-semibold">ชื่อพนักงาน</th>
                    <th className="px-4 py-3 font-semibold">Username</th>
                    <th className="px-4 py-3 font-semibold">แผนก</th>
                    <th className="px-4 py-3 font-semibold">ตำแหน่ง / รหัส</th>
                    <th className="px-4 py-3 font-semibold">ติดต่อ</th>
                    <th className="px-4 py-3 font-semibold">รายละเอียดงาน</th>
                    <th className="px-4 py-3 font-semibold">หมายเหตุ</th>
                    <th className="px-4 py-3 font-semibold text-center">สลับมุมมอง</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200">
                  {state.users.map((user) => (
                    <tr key={user.id} className="align-top hover:bg-slate-50/70">
                      <td className="px-4 py-4">
                        <div className="font-semibold text-slate-950">{user.name || "-"}</div>
                      </td>
                      <td className="px-4 py-4">{user.username || "-"}</td>
                      <td className="px-4 py-4">
                        <ToneBadge
                          tone={
                            user.role === ROLES.DRIVER
                              ? "success"
                              : user.role === ROLES.WAREHOUSE
                                ? "warning"
                                : "brand"
                          }
                        >
                          {ROLE_LABELS[user.role] || user.department || user.role}
                        </ToneBadge>
                      </td>
                      <td className="px-4 py-4">
                        <div>{user.position || "-"}</div>
                        <div className="mt-1 text-xs text-slate-500">{user.employeeCode || "ไม่มีรหัสพนักงาน"}</div>
                      </td>
                      <td className="px-4 py-4">
                        <div>{user.phone || "-"}</div>
                        <div className="mt-1 text-xs text-slate-500">{user.email || "ไม่มีอีเมล"}</div>
                      </td>
                      <td className="px-4 py-4">
                        <div>{user.area || "-"}</div>
                        <div className="mt-1 text-xs text-slate-500">
                          {user.vehicleType ? `รถ: ${user.vehicleType}` : "ไม่ระบุประเภทรถ"}
                          {user.maxOrders ? ` | งานสูงสุด/รอบ: ${user.maxOrders}` : ""}
                        </div>
                      </td>
                      <td className="px-4 py-4 max-w-[280px] whitespace-normal break-words text-slate-600">
                        <ExpandableText value={user.note} />
                      </td>
                      <td className="px-4 py-4 text-center">
                        {state.currentUserId === user.id ? (
                          <span className="inline-flex border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs font-semibold text-emerald-700">
                            กำลังใช้งาน
                          </span>
                        ) : (
                          <button
                            type="button"
                            className="border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50"
                            onClick={() => switchCurrentUser(user.id)}
                          >
                            สลับมุมมอง
                          </button>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </SectionCard>
      </div>
    </AppShell>
  );
}
