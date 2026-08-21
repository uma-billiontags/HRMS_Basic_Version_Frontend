import { useEffect, useState, useCallback } from "react";
import { Table, Button, Input, Modal, Form, InputNumber, Switch, message, Select } from "antd";
import { PlusOutlined, EditOutlined, DeleteOutlined, SearchOutlined, UploadOutlined } from "@ant-design/icons";
import type { ColumnsType } from "antd/es/table";
import BulkUploadTaskMasterModal from "./BulkUploadTaskMasterModal";

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

interface TaskMaster {
    id: number;
    project_name: string;
    task_name: string;
    default_hours: number;
    is_active: boolean;
}

export default function Task_Master_Admin() {
    const [data, setData] = useState<TaskMaster[]>([]);
    const [loading, setLoading] = useState(true);
    const [search, setSearch] = useState("");

    const [modalOpen, setModalOpen] = useState(false);
    const [editing, setEditing] = useState<TaskMaster | null>(null);
    const [saving, setSaving] = useState(false);
    const [form] = Form.useForm();

    const [bulkUploadOpen, setBulkUploadOpen] = useState(false);

    const fetchData = useCallback(() => {
        setLoading(true);
        fetch(`${BASE_URL}/api/tasks/task_master/get_all/`, {
            headers: { ...authHeaders() },
        })
            .then((r) => r.json())
            .then((d) => setData(Array.isArray(d) ? d : d.results || []))
            .catch(() => message.error("Failed to load task catalog"))
            .finally(() => setLoading(false));
    }, []);

    useEffect(() => {
        fetchData();
    }, [fetchData]);

    const openAdd = () => {
        setEditing(null);
        form.resetFields();
        form.setFieldsValue({ is_active: true, hours: 0, minutes: 0 });
        setModalOpen(true);
    };

    const openEdit = (record: TaskMaster) => {
        setEditing(record);
        const { hours, minutes } = decimalToHM(record.default_hours);
        form.setFieldsValue({ ...record, hours, minutes });
        setModalOpen(true);
    };

    const handleSave = async () => {
        let values;
        try {
            values = await form.validateFields();
        } catch {
            return;
        }

        const hours = Number(values.hours) || 0;
        const minutes = Number(values.minutes) || 0;
        if (hours === 0 && minutes === 0) {
            message.error("Enter hours, minutes, or both — duration can't be zero.");
            return;
        }
        const default_hours = Math.round((hours + minutes / 60) * 100) / 100;

        setSaving(true);
        const isEdit = !!editing;
        const url = isEdit
            ? `${BASE_URL}/api/tasks/task_master/${editing.id}/edit/`
            : `${BASE_URL}/api/tasks/task_master/create/`;

        try {
            const res = await fetch(url, {
                method: isEdit ? "PATCH" : "POST",
                headers: { "Content-Type": "application/json", ...authHeaders() },
                body: JSON.stringify({
                    project_name: values.project_name,
                    task_name: values.task_name,
                    default_hours,
                    is_active: values.is_active,
                }),
            });
            if (res.ok) {
                message.success(isEdit ? "Task updated" : "Task added to catalog");
                setModalOpen(false);
                fetchData();
            } else {
                const err = await res.json().catch(() => ({}));
                message.error(
                    err.project_name?.[0] || err.task_name?.[0] || err.default_hours?.[0] || err.detail || "Save failed"
                );
            }
        } catch {
            message.error("Network error");
        } finally {
            setSaving(false);
        }
    };

    const handleDelete = (record: TaskMaster) => {
        Modal.confirm({
            title: "Delete this catalog entry?",
            content: `Are you sure you want to delete "${record.task_name}"? Tasks already created from it won't be affected — this only removes it from the dropdown going forward.`,
            okText: "Yes, Delete",
            okButtonProps: { danger: true },
            cancelText: "Cancel",
            onOk: async () => {
                try {
                    const res = await fetch(`${BASE_URL}/api/tasks/task_master/${record.id}/delete/`, {
                        method: "DELETE",
                        headers: { ...authHeaders() },
                    });
                    if (res.ok) {
                        message.success("Deleted successfully");
                        fetchData();
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

    const filtered = data.filter((d) => {
        if (!search.trim()) return true;
        const q = search.toLowerCase();
        return d.task_name.toLowerCase().includes(q) || d.project_name?.toLowerCase().includes(q);
    });

    function decimalToHM(dec: number) {
        const totalMinutes = Math.round((dec || 0) * 60);
        return { hours: Math.floor(totalMinutes / 60), minutes: totalMinutes % 60 };
    }

    function formatHM(dec: number) {
        const { hours, minutes } = decimalToHM(dec);
        if (hours && minutes) return `${hours}h ${minutes}m`;
        if (hours) return `${hours}h`;
        return `${minutes}m`;
    }

    const MINUTE_OPTIONS = [0, 15, 30, 45].map((m) => ({ value: m, label: `${m} min` }));

    const columns: ColumnsType<TaskMaster> = [
        {
            title: "Project Name",
            dataIndex: "project_name",
            key: "project_name",
            render: (v: string) => (
                v
                    ? <span style={{ fontSize: 12.5, fontWeight: 600, color: "var(--text-primary)" }}>{v}</span>
                    : <span style={{ color: "var(--text-muted)", fontSize: 12 }}>—</span>
            ),
        },
        {
            title: "Task Name",
            dataIndex: "task_name",
            key: "task_name",
            render: (v: string) => (
                <span style={{ fontSize: 13, fontWeight: 600, color: "var(--text-primary)" }}>{v}</span>
            ),
        },
        {
            title: "Duration",
            dataIndex: "default_hours",
            key: "default_hours",
            width: 140,
            render: (v: number) => <span className="td-num" style={{ fontSize: 12 }}>{formatHM(v)}</span>,
        },
        {
            title: "Status",
            dataIndex: "is_active",
            key: "is_active",
            width: 110,
            render: (v: boolean) => (
                <span
                    style={{
                        fontSize: 11, fontWeight: 700, padding: "2px 9px", borderRadius: 10,
                        color: v ? "var(--green)" : "var(--red)",
                        background: v ? "var(--green-bg)" : "var(--red-bg)",
                    }}
                >
                    {v ? "Active" : "Inactive"}
                </span>
            ),
        },
        {
            title: "Actions",
            key: "actions",
            width: 160,
            render: (_: any, record: TaskMaster) => (
                <div style={{ display: "flex", gap: 6 }}>
                    <Button
                        size="small"
                        icon={<EditOutlined />}
                        onClick={() => openEdit(record)}
                        style={{
                            fontSize: 11, fontWeight: 600, borderRadius: 6,
                            color: "var(--blue)", borderColor: "var(--blue)", background: "var(--blue-bg)",
                        }}
                    >
                        Edit
                    </Button>
                    <Button
                        size="small"
                        icon={<DeleteOutlined />}
                        onClick={() => handleDelete(record)}
                        style={{
                            fontSize: 11, fontWeight: 600, borderRadius: 6,
                            color: "var(--red)", borderColor: "var(--red)", background: "var(--red-bg)",
                        }}
                    >
                        Delete
                    </Button>
                </div>
            ),
        },
    ];

    return (
        <div>
            <div
                style={{
                    display: "flex", justifyContent: "space-between", alignItems: "center",
                    marginBottom: 18, borderBottom: "1px solid var(--border)", paddingBottom: 8,
                }}
            >
                <div>
                    <h1 style={{ fontSize: 18, fontWeight: 700, margin: 0, color: "var(--accent)" }}>
                        Standard Tasks
                    </h1>
                    <p
                        style={{
                            fontSize: 9, color: "var(--text-muted)", margin: "4px 0 0",
                            fontWeight: 500, letterSpacing: "0.04em", textTransform: "uppercase",
                        }}
                    >
                        Manage reusable task templates and their default allotted hours
                    </p>
                </div>
                <div style={{ display: "flex", gap: 10 }}>
                    <Button
                        onClick={() => setBulkUploadOpen(true)}
                        icon={<UploadOutlined />}
                        style={{
                            borderRadius: 9, fontSize: 12, fontWeight: 700, padding: "8px 16px",
                            cursor: "pointer", display: "flex", alignItems: "center", gap: 6,
                            color: "var(--accent)", borderColor: "var(--accent)",
                        }}
                    >
                        Bulk Upload
                    </Button>
                    <Button
                        onClick={openAdd}
                        icon={<PlusOutlined />}
                        style={{
                            borderRadius: 9, border: "none", background: "var(--accent)", color: "#fff",
                            fontSize: 12, fontWeight: 700, padding: "8px 16px", cursor: "pointer",
                            display: "flex", alignItems: "center", gap: 6,
                        }}
                    >
                        Add New
                    </Button>
                </div>
            </div>

            <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 20 }}>
                <Input
                    placeholder="Search task or project name…"
                    prefix={<SearchOutlined />}
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    allowClear
                    style={{
                        flex: 1, maxWidth: 360, height: 35, padding: "0 14px",
                        background: "var(--bg-input)", border: "1px solid var(--accent-light)",
                        borderRadius: 9, color: "var(--text-primary)", fontSize: 13, outline: "none",
                    }}
                />
                <span style={{ fontSize: 12, color: "var(--text-muted)", marginLeft: "auto" }}>
                    {filtered.length} task{filtered.length !== 1 ? "s" : ""} in catalog
                </span>
            </div>

            <div
                style={{
                    background: "var(--bg-card)", borderRadius: 14, border: "1px solid var(--border)",
                    overflow: "hidden", boxShadow: "var(--shadow-card)",
                }}
            >
                <Table
                    columns={columns}
                    dataSource={filtered}
                    rowKey="id"
                    loading={loading}
                    pagination={{
                        pageSize: 10,
                        showSizeChanger: true,
                        pageSizeOptions: ["10", "20", "50"],
                        showTotal: (total, range) => `${range[0]}–${range[1]} of ${total} tasks`,
                        style: { padding: "12px 16px", color: "var(--text-primary)" },
                    }}
                    rowClassName={() => "client-table-row"}
                    style={{ fontSize: 13 }}
                />
            </div>

            <Modal
                open={modalOpen}
                onCancel={() => setModalOpen(false)}
                onOk={handleSave}
                confirmLoading={saving}
                title={editing ? "Edit Task" : "Add Task to Catalog"}
                okText={editing ? "Save Changes" : "Add"}
                width={480}
                centered
                destroyOnClose
            >
                <Form form={form} layout="vertical">
                    <Form.Item label="Project Name" name="project_name" rules={[{ required: true, message: "Required" }]}>
                        <Input placeholder="e.g. Q3 Marketing Campaign" />
                    </Form.Item>
                    <Form.Item label="Task Name" name="task_name" rules={[{ required: true, message: "Required" }]}>
                        <Input placeholder="e.g. Logo Creation" />
                    </Form.Item>
                    <div style={{ display: "flex", gap: 12 }}>
                        <Form.Item label="Hours" name="hours" style={{ flex: 1 }}>
                            <InputNumber style={{ width: "100%" }} min={0} step={1} placeholder="e.g. 1" />
                        </Form.Item>
                        <Form.Item label="Minutes" name="minutes" style={{ flex: 1 }}>
                            <Select options={MINUTE_OPTIONS} placeholder="0 min" />
                        </Form.Item>
                    </div>
                    <Form.Item label="Active" name="is_active" valuePropName="checked">
                        <Switch />
                    </Form.Item>
                </Form>
            </Modal>

            <BulkUploadTaskMasterModal
                open={bulkUploadOpen}
                onClose={() => setBulkUploadOpen(false)}
                onSaved={fetchData}
            />
        </div>
    );
}