// Team_Access.tsx
// Admin-only screen for managing Employee login credentials — name, email,
// password, department, role, active/inactive. Department is a searchable
// dropdown sourced from existing employees' departments, but also accepts
// a brand-new value typed in (mode="tags" limited to one selection).
// Role is free text since it's a job title (e.g. "TL", "Developer"), not
// tied to a separate table — matching how Employee.role already works
// elsewhere in this project (accounts/models.py).

import { useEffect, useState, useCallback } from "react";
import { Table, Button, Input, Modal, Select, Switch, Form, message } from "antd";
import {
    SearchOutlined, ReloadOutlined, EditOutlined,
    PlusOutlined, DeleteOutlined, UserOutlined,
} from "@ant-design/icons";
import type { ColumnsType } from "antd/es/table";

const BASE_URL = import.meta.env.VITE_BASE_URL;

function authHeaders(): HeadersInit {
    try {
        const raw = localStorage.getItem("task_tracker_auth");
        if (!raw) return {};
        const { token } = JSON.parse(raw);
        return token ? { Authorization: `Token ${token}` } : {};
    } catch {
        return {};
    }
}

interface EmployeeCredential {
    id: number;
    name: string;
    email: string;
    department: string;
    role: string;
    is_active: boolean;
    created_at: string;
}

function StatCard({ label, value, changeLabel, changeType }: {
    label: string; value: number; changeLabel: string; changeType: "up" | "down" | "neutral";
}) {
    return (
        <div className="db-stat-card">
            <div className="db-stat-label">{label}</div>
            <div className="db-stat-value">{value}</div>
            <div
                className={`db-stat-change ${changeType === "neutral" ? "" : changeType}`}
                style={changeType === "neutral" ? { color: "var(--text-muted)" } : undefined}
            >
                {changeLabel}
            </div>
        </div>
    );
}

export default function Team_Access() {
    const [users, setUsers] = useState<EmployeeCredential[]>([]);
    const [departmentOptions, setDepartmentOptions] = useState<string[]>([]);
    const [loading, setLoading] = useState(true);
    const [search, setSearch] = useState("");

    const [modalOpen, setModalOpen] = useState(false);
    const [editing, setEditing] = useState<EmployeeCredential | null>(null);
    const [saving, setSaving] = useState(false);
    const [form] = Form.useForm();

    const [addDeptOpen, setAddDeptOpen] = useState(false);
    const [newDeptName, setNewDeptName] = useState("");
    const [savingDept, setSavingDept] = useState(false);

    // ── Fetch ──────────────────────────────────────────────────────────────
    const fetchUsers = useCallback(() => {
        setLoading(true);
        fetch(`${BASE_URL}/api/auth/employees/`, { headers: { ...authHeaders() } })
            .then((r) => r.json())
            .then((d) => setUsers(Array.isArray(d) ? d : d.results || []))
            .catch(() => message.error("Failed to load user credentials"))
            .finally(() => setLoading(false));
    }, []);

    const fetchDepartments = useCallback(() => {
        fetch(`${BASE_URL}/api/auth/employees/departments/`, { headers: { ...authHeaders() } })
            .then((r) => r.json())
            .then((d) => setDepartmentOptions(Array.isArray(d) ? d : []))
            .catch(() => message.error("Failed to load departments"));
    }, []);

    useEffect(() => { fetchUsers(); fetchDepartments(); }, [fetchUsers, fetchDepartments]);

    const totalUsers = users.length;
    const activeUsers = users.filter((u) => u.is_active).length;
    const totalDepartmentsInUse = new Set(users.map((u) => u.department).filter(Boolean)).size;

    // ── Modal open/close ─────────────────────────────────────────────────────
    const openAdd = () => {
        setEditing(null);
        form.resetFields();
        form.setFieldsValue({ is_active: true });
        setModalOpen(true);
    };

    const openEdit = (record: EmployeeCredential) => {
        setEditing(record);
        form.setFieldsValue({
            name: record.name,
            email: record.email,
            department: record.department || undefined,
            role: record.role,
            is_active: record.is_active,
            password: "",
        });
        setModalOpen(true);
    };

    // ── Save ──────────────────────────────────────────────────────────────────
    const handleSave = async () => {
        let values;
        try {
            values = await form.validateFields();
        } catch {
            return;
        }

        setSaving(true);
        const isEdit = !!editing;

        const payload: Record<string, unknown> = {
            name: values.name,
            email: values.email,
            department: values.department || "",
            role: values.role || "",
            is_active: values.is_active,
        };
        // only send password if the admin actually typed one — required on create, optional on edit
        if (values.password) payload.password = values.password;

        const url = isEdit
            ? `${BASE_URL}/api/auth/employees/${editing.id}/edit/`
            : `${BASE_URL}/api/auth/employees/create/`;

        try {
            const res = await fetch(url, {
                method: isEdit ? "PATCH" : "POST",
                headers: { "Content-Type": "application/json", ...authHeaders() },
                body: JSON.stringify(payload),
            });
            if (res.ok) {
                message.success(isEdit ? "Employee updated" : "Employee added");
                setModalOpen(false);
                fetchUsers();
                fetchDepartments(); // in case a brand-new department was typed
            } else {
                const err = await res.json().catch(() => ({}));
                message.error(err.email?.[0] || err.name?.[0] || err.password?.[0] || JSON.stringify(err) || "Save failed");
            }
        } catch {
            message.error("Network error");
        } finally {
            setSaving(false);
        }
    };

    // ── Delete ────────────────────────────────────────────────────────────────
    const handleDelete = (record: EmployeeCredential) => {
        Modal.confirm({
            title: "Delete this employee?",
            content: `Are you sure you want to delete "${record.name}"? This cannot be undone. If they have tasks or timer history, deleting will fail — deactivate instead.`,
            okText: "Yes, Delete",
            okButtonProps: { danger: true },
            cancelText: "Cancel",
            onOk: async () => {
                try {
                    const res = await fetch(`${BASE_URL}/api/auth/employees/${record.id}/delete/`, {
                        method: "DELETE",
                        headers: { ...authHeaders() },
                    });
                    if (res.ok) {
                        message.success("Deleted successfully");
                        fetchUsers();
                    } else {
                        const err = await res.json().catch(() => ({}));
                        message.error(err.detail || "Failed to delete");
                    }
                } catch {
                    message.error("Network error");
                }
            },
        });
    };

    // ── Toggle active/inactive inline ────────────────────────────────────────
    const toggleActive = async (record: EmployeeCredential) => {
        try {
            const res = await fetch(`${BASE_URL}/api/auth/employees/${record.id}/edit/`, {
                method: "PATCH",
                headers: { "Content-Type": "application/json", ...authHeaders() },
                body: JSON.stringify({ is_active: !record.is_active }),
            });
            if (res.ok) {
                setUsers((prev) => prev.map((u) => (u.id === record.id ? { ...u, is_active: !u.is_active } : u)));
            } else {
                message.error("Failed to update status");
            }
        } catch {
            message.error("Network error");
        }
    };

    const filtered = users.filter((u) => {
        if (!search.trim()) return true;
        const q = search.toLowerCase();
        return [u.name, u.email, u.department, u.role].some((f) => f?.toLowerCase().includes(q));
    });

    // ── Table columns ────────────────────────────────────────────────────────
    const columns: ColumnsType<EmployeeCredential> = [
        {
            title: "Name",
            dataIndex: "name",
            key: "name",
            render: (v: string) => (
                <span style={{ fontSize: 13, fontWeight: 600, color: "var(--text-primary)" }}>{v}</span>
            ),
        },
        {
            title: "Email",
            dataIndex: "email",
            key: "email",
            render: (v: string) => (
                <span style={{ fontSize: 12, color: "var(--text-secondary)" }}>{v}</span>
            ),
        },
        {
            title: "Department",
            dataIndex: "department",
            key: "department",
            render: (v: string) => (
                v ? (
                    <span style={{
                        fontSize: 11, fontWeight: 600, color: "var(--blue)", background: "var(--blue-bg)",
                        border: "1px solid var(--blue)", padding: "2px 10px", borderRadius: 6, whiteSpace: "nowrap",
                    }}>
                        {v}
                    </span>
                ) : <span style={{ color: "var(--text-muted)", fontSize: 12 }}>—</span>
            ),
        },
        {
            title: "Role",
            dataIndex: "role",
            key: "role",
            render: (v: string) => (
                v ? (
                    <span style={{
                        fontSize: 11, fontWeight: 600, color: "var(--purple)", background: "var(--purple-bg)",
                        padding: "2px 10px", borderRadius: 6, whiteSpace: "nowrap",
                    }}>
                        {v}
                    </span>
                ) : <span style={{ color: "var(--text-muted)", fontSize: 12 }}>—</span>
            ),
        },
        {
            title: "Password",
            key: "password",
            width: 100,
            render: () => (
                <span style={{ fontSize: 13, color: "var(--text-muted)", letterSpacing: 2 }}>••••••••</span>
            ),
        },
        {
            title: "Status",
            key: "is_active",
            width: 110,
            render: (_: any, record: EmployeeCredential) => (
                <span
                    onClick={() => toggleActive(record)}
                    style={{
                        fontSize: 11, fontWeight: 700, padding: "2px 9px", borderRadius: 10, cursor: "pointer",
                        color: record.is_active ? "var(--green)" : "var(--red)",
                        background: record.is_active ? "var(--green-bg)" : "var(--red-bg)",
                    }}
                >
                    {record.is_active ? "Active" : "Inactive"}
                </span>
            ),
        },
        {
            title: "Actions",
            key: "actions",
            width: 160,
            render: (_: any, record: EmployeeCredential) => (
                <div style={{ display: "flex", gap: 6 }}>
                    <Button
                        size="small" icon={<EditOutlined />} onClick={() => openEdit(record)}
                        style={{ fontSize: 11, fontWeight: 600, borderRadius: 6, color: "var(--blue)", borderColor: "var(--blue)", background: "var(--blue-bg)" }}
                    >
                        Edit
                    </Button>
                    <Button
                        size="small" icon={<DeleteOutlined />} onClick={() => handleDelete(record)}
                        style={{ fontSize: 11, fontWeight: 600, borderRadius: 6, color: "var(--red)", borderColor: "var(--red)", background: "var(--red-bg)" }}
                    >
                        Delete
                    </Button>
                </div>
            ),
        },
    ];

    return (
        <div>
            {/* ── Page Header ── */}
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 18, borderBottom: "1px solid var(--border)", paddingBottom: 8 }}>
                <div>
                    <h1 style={{ fontSize: 16, fontWeight: 600, margin: 0, color: "var(--text-primary)" }}>Team Access</h1>
                    <p style={{ fontSize: 9, color: "var(--text-muted)", margin: "4px 0 0", fontWeight: 500, letterSpacing: "0.04em", textTransform: "uppercase" }}>
                        Manage employee login credentials by department and role
                    </p>
                </div>
                <Button onClick={openAdd} icon={<PlusOutlined />}
                    style={{
                        borderRadius: 9, border: "none", background: "var(--accent)", color: "#fff",
                        fontSize: 12, fontWeight: 700, padding: "8px 16px", display: "flex", alignItems: "center", gap: 6,
                    }}>
                    Add Employee
                </Button>
            </div>

            {/* ── Stat Cards ── */}
            <div className="db-stat-grid" style={{ gridTemplateColumns: "repeat(3, 1fr)" }}>
                <StatCard label="Total Employees" value={totalUsers} changeLabel={`${activeUsers} active`} changeType="up" />
                <StatCard label="Active Employees" value={activeUsers} changeLabel="Currently enabled" changeType="neutral" />
                <StatCard label="Departments In Use" value={totalDepartmentsInUse} changeLabel="Across all employees" changeType="neutral" />
            </div>

            {/* ── Search + Refresh ── */}
            <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 20 }}>
                <Input
                    placeholder="Search by name, email, department, role…"
                    prefix={<SearchOutlined style={{ color: "var(--text-muted)" }} />}
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    allowClear
                    style={{
                        flex: 1, maxWidth: 360, height: 35, padding: "0 14px",
                        background: "var(--bg-input)", border: "1px solid var(--accent-light)",
                        borderRadius: 9, color: "var(--text-primary)", fontSize: 13, outline: "none",
                    }}
                />
                <Button
                    onClick={fetchUsers}
                    icon={<ReloadOutlined />}
                    className="db-card-action"
                    style={{ height: 35, fontSize: 12, fontWeight: 600, display: "flex", alignItems: "center", gap: 6, paddingInline: 14 }}
                >
                    Refresh
                </Button>
                <span style={{ fontSize: 12, color: "var(--text-muted)", marginLeft: "auto" }}>
                    {filtered.length} of {users.length} employees
                </span>
            </div>

            {/* ── Table ── */}
            <div style={{ background: "var(--bg-card)", borderRadius: 14, border: "1px solid var(--border)", overflow: "hidden", boxShadow: "var(--shadow-card)" }}>
                <Table
                    columns={columns}
                    dataSource={filtered}
                    rowKey="id"
                    scroll={{ x: 1100 }}
                    loading={loading}
                    pagination={{
                        pageSize: 10,
                        showSizeChanger: true,
                        pageSizeOptions: ["10", "20", "50"],
                        showTotal: (total, range) => `${range[0]}–${range[1]} of ${total} employees`,
                        style: { padding: "12px 16px", color: "var(--text-primary)" },
                    }}
                    rowClassName={() => "client-table-row"}
                    style={{ fontSize: 13 }}
                />
            </div>

            {/* ── Add/Edit Modal ── */}
            <Modal
                open={modalOpen}
                onCancel={() => setModalOpen(false)}
                onOk={handleSave}
                confirmLoading={saving}
                title={
                    <span style={{ display: "flex", alignItems: "center", gap: 8 }}>
                        <UserOutlined /> {editing ? "Edit Employee" : "Add Employee"}
                    </span>
                }
                okText={editing ? "Save Changes" : "Add"}
                width={700}
                centered
                destroyOnClose
            >
                <Form form={form} layout="vertical">
                    <div className="db-form-row">
                        <Form.Item label="Name" name="name" rules={[{ required: true, message: "Required" }]}>
                            <Input placeholder="e.g. Jane Doe" />
                        </Form.Item>
                        <Form.Item
                            label="Email"
                            name="email"
                            rules={[{ required: true, message: "Required" }, { type: "email", message: "Enter a valid email" }]}
                        >
                            <Input placeholder="name@company.com" />
                        </Form.Item>
                    </div>

                    <div className="db-form-row">
                        <Form.Item label="Department" name="department">
                            <Select
                                placeholder="Select a department"
                                showSearch
                                allowClear
                                optionFilterProp="label"
                                options={[
                                    ...departmentOptions.map((d) => ({ value: d, label: d })),
                                    { value: "__ADD_NEW__", label: "Add New Department" },
                                ]}
                                optionRender={(option) => {
                                    if (option.value === "__ADD_NEW__") {
                                        return (
                                            <div style={{ display: "flex", alignItems: "center", gap: 8, color: "#1677ff", fontWeight: 600, padding: "4px 0" }}>
                                                <PlusOutlined style={{ fontSize: 13, color: "#1677ff" }} />
                                                <span>Add New Department</span>
                                            </div>
                                        );
                                    }
                                    return <div>{option.label}</div>;
                                }}
                                onChange={(value) => {
                                    if (value === "__ADD_NEW__") {
                                        form.setFieldsValue({ department: undefined });
                                        setNewDeptName("");
                                        setAddDeptOpen(true);
                                        return;
                                    }
                                }}
                            />
                        </Form.Item>

                        <Form.Item label="Role" name="role">
                            <Input placeholder="e.g. TL, Developer, Designer" />
                        </Form.Item>
                    </div>

                    <div className="db-form-row">
                        <Form.Item
                            label="Password"
                            name="password"
                            rules={editing ? [] : [{ required: true, message: "Password is required" }]}
                        >
                            <Input.Password placeholder={editing ? "Leave blank to keep unchanged" : "Min 8 characters"} />
                        </Form.Item>
                        <Form.Item label="Is Active" name="is_active" valuePropName="checked">
                            <div style={{ display: "flex", alignItems: "center", gap: 10, height: 36 }}>
                                <Switch defaultChecked />
                            </div>
                        </Form.Item>

                    </div>
                </Form>
            </Modal>
            <Modal
                open={addDeptOpen}
                onCancel={() => setAddDeptOpen(false)}
                title={
                    <span style={{ display: "flex", alignItems: "center", gap: 8 }}>
                        <PlusOutlined /> Add New Department
                    </span>
                }
                okText="Add"
                confirmLoading={savingDept}
                centered
                destroyOnClose
                onOk={() => {
                    const name = newDeptName.trim();
                    if (!name) {
                        message.error("Department name is required");
                        return;
                    }
                    if (departmentOptions.some((d) => d.toLowerCase() === name.toLowerCase())) {
                        message.error("This department already exists");
                        return;
                    }
                    setSavingDept(true);
                    // No dedicated backend table for departments (see accounts/models.py —
                    // department is just a free-text field on Employee), so there's
                    // nothing to POST here yet. We add it locally and pre-select it;
                    // it becomes "real" once this employee is saved with it.
                    setDepartmentOptions((prev) => [...prev, name].sort());
                    form.setFieldsValue({ department: name });
                    setSavingDept(false);
                    setAddDeptOpen(false);
                }}
            >
                <Form layout="vertical">
                    <Form.Item label="Department Name" required>
                        <Input
                            placeholder="e.g. Marketing"
                            value={newDeptName}
                            onChange={(e) => setNewDeptName(e.target.value)}
                            onPressEnter={() => {
                                const name = newDeptName.trim();
                                if (!name) return;
                                if (departmentOptions.some((d) => d.toLowerCase() === name.toLowerCase())) {
                                    message.error("This department already exists");
                                    return;
                                }
                                setDepartmentOptions((prev) => [...prev, name].sort());
                                form.setFieldsValue({ department: name });
                                setAddDeptOpen(false);
                            }}
                            autoFocus
                        />
                    </Form.Item>
                </Form>
            </Modal>
        </div>
    );
}