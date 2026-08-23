import { useEffect, useState, useCallback } from "react";
import { Table, Button, Input, Modal, Select, Switch, Form, message, Segmented } from "antd";
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
    employee_id: string;
    name: string;
    email: string;
    department: string;
    role: string;
    is_active: boolean;
    created_at: string;
}

interface AdminCredential {
    id: number;
    name: string;
    email: string;
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
    // ── Employee state ───────────────────────────────────────────────────
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

    // ── Tab state ─────────────────────────────────────────────────────────
    const [activeTab, setActiveTab] = useState<"employee" | "admin">("employee");

    // ── Admin state ───────────────────────────────────────────────────────
    const [admins, setAdmins] = useState<AdminCredential[]>([]);
    const [adminsLoading, setAdminsLoading] = useState(false);
    const [adminModalOpen, setAdminModalOpen] = useState(false);
    const [editingAdmin, setEditingAdmin] = useState<AdminCredential | null>(null);
    const [savingAdmin, setSavingAdmin] = useState(false);
    const [adminForm] = Form.useForm();

    // ── Fetch — Employees ─────────────────────────────────────────────────
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

    // ── Fetch — Admins ────────────────────────────────────────────────────
    const fetchAdmins = useCallback(() => {
        setAdminsLoading(true);
        fetch(`${BASE_URL}/api/auth/admins/`, { headers: { ...authHeaders() } })
            .then((r) => r.json())
            .then((d) => setAdmins(Array.isArray(d) ? d : []))
            .catch(() => message.error("Failed to load admins"))
            .finally(() => setAdminsLoading(false));
    }, []);

    // Lazy-load admins the first time the Admin tab is opened.
    useEffect(() => {
        if (activeTab === "admin" && admins.length === 0) fetchAdmins();
    }, [activeTab, admins.length, fetchAdmins]);

    const totalUsers = users.length;
    const activeUsers = users.filter((u) => u.is_active).length;
    const totalDepartmentsInUse = new Set(users.map((u) => u.department).filter(Boolean)).size;

    const totalAdmins = admins.length;
    const activeAdmins = admins.filter((a) => a.is_active).length;

    // ── Modal open/close — Employee ──────────────────────────────────────
    const openAdd = () => {
        setEditing(null);
        form.resetFields();
        form.setFieldsValue({ is_active: true });
        setModalOpen(true);
    };

    const openEdit = (record: EmployeeCredential) => {
        setEditing(record);
        form.setFieldsValue({
            employee_id: record.employee_id,
            name: record.name,
            email: record.email,
            department: record.department || undefined,
            role: record.role,
            is_active: record.is_active,
            password: "",
        });
        setModalOpen(true);
    };

    // ── Save — Employee ───────────────────────────────────────────────────
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
            employee_id: values.employee_id,
            name: values.name,
            email: values.email,
            department: values.department || "",
            role: values.role || "",
            is_active: values.is_active,
        };
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
                fetchDepartments();
            } else {
                const err = await res.json().catch(() => ({}));
                message.error(err.employee_id?.[0] || err.email?.[0] || err.name?.[0] || err.password?.[0] || JSON.stringify(err) || "Save failed");
            }
        } catch {
            message.error("Network error");
        } finally {
            setSaving(false);
        }
    };

    // ── Delete — Employee ─────────────────────────────────────────────────
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

    // ── Toggle active/inactive inline — Employee ─────────────────────────
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
        return [u.employee_id, u.name, u.email, u.department, u.role].some((f) => f?.toLowerCase().includes(q));
    });

    // ── Modal open/close — Admin ─────────────────────────────────────────
    const openAddAdmin = () => {
        setEditingAdmin(null);
        adminForm.resetFields();
        adminForm.setFieldsValue({ is_active: true });
        setAdminModalOpen(true);
    };

    const openEditAdmin = (record: AdminCredential) => {
        setEditingAdmin(record);
        adminForm.setFieldsValue({
            name: record.name,
            email: record.email,
            is_active: record.is_active,
            password: "",
        });
        setAdminModalOpen(true);
    };

    // ── Save — Admin ──────────────────────────────────────────────────────
    const handleSaveAdmin = async () => {
        let values;
        try {
            values = await adminForm.validateFields();
        } catch {
            return;
        }

        setSavingAdmin(true);
        const isEdit = !!editingAdmin;
        const payload: Record<string, unknown> = {
            name: values.name,
            email: values.email,
            is_active: values.is_active,
        };
        if (values.password) payload.password = values.password;

        const url = isEdit
            ? `${BASE_URL}/api/auth/admins/${editingAdmin.id}/edit/`
            : `${BASE_URL}/api/auth/admins/create/`;

        try {
            const res = await fetch(url, {
                method: isEdit ? "PATCH" : "POST",
                headers: { "Content-Type": "application/json", ...authHeaders() },
                body: JSON.stringify(payload),
            });
            if (res.ok) {
                message.success(isEdit ? "Admin updated" : "Admin added");
                setAdminModalOpen(false);
                fetchAdmins();
            } else {
                const err = await res.json().catch(() => ({}));
                message.error(err.email?.[0] || err.name?.[0] || err.password?.[0] || JSON.stringify(err) || "Save failed");
            }
        } catch {
            message.error("Network error");
        } finally {
            setSavingAdmin(false);
        }
    };

    // ── Delete — Admin ────────────────────────────────────────────────────
    const handleDeleteAdmin = (record: AdminCredential) => {
        Modal.confirm({
            title: "Delete this admin?",
            content: `Are you sure you want to delete "${record.name}"? This cannot be undone.`,
            okText: "Yes, Delete",
            okButtonProps: { danger: true },
            cancelText: "Cancel",
            onOk: async () => {
                try {
                    const res = await fetch(`${BASE_URL}/api/auth/admins/${record.id}/delete/`, {
                        method: "DELETE",
                        headers: { ...authHeaders() },
                    });
                    if (res.ok) {
                        message.success("Deleted successfully");
                        fetchAdmins();
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

    // ── Toggle active/inactive inline — Admin ────────────────────────────
    const toggleActiveAdmin = async (record: AdminCredential) => {
        try {
            const res = await fetch(`${BASE_URL}/api/auth/admins/${record.id}/edit/`, {
                method: "PATCH",
                headers: { "Content-Type": "application/json", ...authHeaders() },
                body: JSON.stringify({ is_active: !record.is_active }),
            });
            if (res.ok) {
                setAdmins((prev) => prev.map((a) => (a.id === record.id ? { ...a, is_active: !a.is_active } : a)));
            } else {
                message.error("Failed to update status");
            }
        } catch {
            message.error("Network error");
        }
    };

    const filteredAdmins = admins.filter((a) => {
        if (!search.trim()) return true;
        const q = search.toLowerCase();
        return [a.name, a.email].some((f) => f?.toLowerCase().includes(q));
    });

    // ── Table columns — Employee ─────────────────────────────────────────
    const columns: ColumnsType<EmployeeCredential> = [
        {
            title: "Employee ID",
            dataIndex: "employee_id",
            key: "employee_id",
            width: 110,
            render: (v: string) => (
                <span style={{ fontSize: 11.5, fontWeight: 700, color: "var(--amber)", background: "var(--amber-bg)", border: "1px solid var(--amber)", padding: "2px 10px", borderRadius: 6, whiteSpace: "nowrap", }}>
                    {v || "—"}
                </span>
            ),
        },
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

    // ── Table columns — Admin ────────────────────────────────────────────
    const adminColumns: ColumnsType<AdminCredential> = [
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
            render: (_: any, record: AdminCredential) => (
                <span
                    onClick={() => toggleActiveAdmin(record)}
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
            render: (_: any, record: AdminCredential) => (
                <div style={{ display: "flex", gap: 6 }}>
                    <Button
                        size="small" icon={<EditOutlined />} onClick={() => openEditAdmin(record)}
                        style={{ fontSize: 11, fontWeight: 600, borderRadius: 6, color: "var(--blue)", borderColor: "var(--blue)", background: "var(--blue-bg)" }}
                    >
                        Edit
                    </Button>
                    <Button
                        size="small" icon={<DeleteOutlined />} onClick={() => handleDeleteAdmin(record)}
                        style={{ fontSize: 11, fontWeight: 600, borderRadius: 6, color: "var(--red)", borderColor: "var(--red)", background: "var(--red-bg)" }}
                    >
                        Delete
                    </Button>
                </div>
            ),
        },
    ];

    const isEmployeeTab = activeTab === "employee";

    return (
        <div>
            {/* ── Page Header ── */}
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 18, borderBottom: "1px solid var(--border)", paddingBottom: 8 }}>
                <div>
                    <h1 style={{ fontSize: 16, fontWeight: 600, margin: 0, color: "var(--text-primary)" }}>Team Access</h1>
                    <p style={{ fontSize: 9, color: "var(--text-muted)", margin: "4px 0 0", fontWeight: 500, letterSpacing: "0.04em", textTransform: "uppercase" }}>
                        Manage employee and admin login credentials
                    </p>
                </div>
                <Button onClick={isEmployeeTab ? openAdd : openAddAdmin} icon={<PlusOutlined />}
                    style={{
                        borderRadius: 9, border: "none", background: "var(--accent)", color: "#fff",
                        fontSize: 12, fontWeight: 700, padding: "8px 16px", display: "flex", alignItems: "center", gap: 6,
                    }}>
                    {isEmployeeTab ? "Add Employee" : "Add Admin"}
                </Button>
            </div>

            {/* ── Stat Cards ── */}
            {isEmployeeTab ? (
                <div className="db-stat-grid" style={{ gridTemplateColumns: "repeat(3, 1fr)" }}>
                    <StatCard label="Total Employees" value={totalUsers} changeLabel={`${activeUsers} active`} changeType="up" />
                    <StatCard label="Active Employees" value={activeUsers} changeLabel="Currently enabled" changeType="neutral" />
                    <StatCard label="Departments In Use" value={totalDepartmentsInUse} changeLabel="Across all employees" changeType="neutral" />
                </div>
            ) : (
                <div className="db-stat-grid" style={{ gridTemplateColumns: "repeat(2, 1fr)" }}>
                    <StatCard label="Total Admins" value={totalAdmins} changeLabel={`${activeAdmins} active`} changeType="up" />
                    <StatCard label="Active Admins" value={activeAdmins} changeLabel="Currently enabled" changeType="neutral" />
                </div>
            )}

            {/* ── Tabs + Search + Refresh ── */}
            <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 20, marginTop: 20, flexWrap: "wrap" }}>
                <Segmented
                    value={activeTab}
                    onChange={(v) => setActiveTab(v as "employee" | "admin")}
                    options={[
                        { label: "Employees", value: "employee" },
                        { label: "Admins", value: "admin" },
                    ]}
                    className="team-access-tabs"
                />
                <Input
                    placeholder={isEmployeeTab ? "Search by name, email, department, role…" : "Search by name, email…"}
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
                    onClick={isEmployeeTab ? fetchUsers : fetchAdmins}
                    icon={<ReloadOutlined />}
                    className="db-card-action"
                    style={{ height: 35, fontSize: 12, fontWeight: 600, display: "flex", alignItems: "center", gap: 6, paddingInline: 14 }}
                >
                    Refresh
                </Button>
                <span style={{ fontSize: 12, color: "var(--text-muted)", marginLeft: "auto" }}>
                    {isEmployeeTab
                        ? `${filtered.length} of ${users.length} employees`
                        : `${filteredAdmins.length} of ${admins.length} admins`}
                </span>
            </div>

            {/* ── Table ── */}
            <div style={{ background: "var(--bg-card)", borderRadius: 14, border: "1px solid var(--border)", overflow: "hidden", boxShadow: "var(--shadow-card)" }}>
                {isEmployeeTab ? (
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
                ) : (
                    <Table
                        columns={adminColumns}
                        dataSource={filteredAdmins}
                        rowKey="id"
                        scroll={{ x: 700 }}
                        loading={adminsLoading}
                        pagination={{
                            pageSize: 10,
                            showSizeChanger: true,
                            pageSizeOptions: ["10", "20", "50"],
                            showTotal: (total, range) => `${range[0]}–${range[1]} of ${total} admins`,
                            style: { padding: "12px 16px", color: "var(--text-primary)" },
                        }}
                        rowClassName={() => "client-table-row"}
                        style={{ fontSize: 13 }}
                    />
                )}
            </div>

            {/* ── Add/Edit Modal — Employee ── */}
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
                        <Form.Item
                            label="Employee ID"
                            name="employee_id"
                            rules={[{ required: true, message: "Required" }]}
                        >
                            <Input placeholder="e.g. EMP-0142" />
                        </Form.Item>
                        <Form.Item label="Name" name="name" rules={[{ required: true, message: "Required" }]}>
                            <Input placeholder="e.g. Jane Doe" />
                        </Form.Item>
                    </div>
                    <div className="db-form-row">

                        <Form.Item
                            label="Email"
                            name="email"
                            rules={[{ required: true, message: "Required" }, { type: "email", message: "Enter a valid email" }]}
                        >
                            <Input placeholder="name@company.com" />
                        </Form.Item>
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
                    </div>

                    <div className="db-form-row">
                        <Form.Item label="Role" name="role">
                            <Input placeholder="e.g. TL, Developer, Designer" />
                        </Form.Item>
                        <Form.Item
                            label="Password"
                            name="password"
                            rules={editing ? [] : [{ required: true, message: "Password is required" }]}
                        >
                            <Input.Password placeholder={editing ? "Leave blank to keep unchanged" : "Enter the password"} />
                        </Form.Item>
                    </div>

                    <div className="db-form-row">

                        <Form.Item label="Is Active" name="is_active" valuePropName="checked">
                            <div style={{ display: "flex", alignItems: "center", gap: 10, height: 36 }}>
                                <Switch defaultChecked />
                            </div>
                        </Form.Item>

                    </div>
                </Form>
            </Modal>

            {/* ── Add/Edit Modal — Admin ── */}
            <Modal
                open={adminModalOpen}
                onCancel={() => setAdminModalOpen(false)}
                onOk={handleSaveAdmin}
                confirmLoading={savingAdmin}
                title={
                    <span style={{ display: "flex", alignItems: "center", gap: 8 }}>
                        <UserOutlined /> {editingAdmin ? "Edit Admin" : "Add Admin"}
                    </span>
                }
                okText={editingAdmin ? "Save Changes" : "Add"}
                width={560}
                centered
                destroyOnClose
            >
                <Form form={adminForm} layout="vertical">
                    <div className="db-form-row">
                        <Form.Item label="Name" name="name" rules={[{ required: true, message: "Required" }]}>
                            <Input placeholder="e.g. Divya" />
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
                        <Form.Item
                            label="Password"
                            name="password"
                            rules={editingAdmin ? [] : [{ required: true, message: "Password is required" }]}
                        >
                            <Input.Password placeholder={editingAdmin ? "Leave blank to keep unchanged" : "Enter the password"} />
                        </Form.Item>
                        <Form.Item label="Is Active" name="is_active" valuePropName="checked">
                            <div style={{ display: "flex", alignItems: "center", gap: 10, height: 36 }}>
                                <Switch defaultChecked />
                            </div>
                        </Form.Item>
                    </div>
                </Form>
            </Modal>

            {/* ── Add New Department Modal ── */}
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