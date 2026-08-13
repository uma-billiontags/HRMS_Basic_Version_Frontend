import { useEffect, useState, useCallback, useMemo } from "react";
import { Table, Button, Input, Select, message, Popconfirm, Tag } from "antd";
import { SearchOutlined, ReloadOutlined, SyncOutlined, StopOutlined } from "@ant-design/icons";
import type { ColumnsType } from "antd/es/table";
import dayjs from "dayjs";

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

interface RecurringTaskDefinition {
    id: number;
    task_name: string;
    task_details: string;
    assigned_to: number | null;
    assigned_to_name: string | null;
    priority: string | null;
    allotted_time: number | null;
    frequency: string;
    start_date: string;
    end_date: string | null;
    is_active: boolean;
    created_at: string;
}

const PRIORITY_COLOR: Record<string, { color: string; bg: string }> = {
    low: { color: "var(--green)", bg: "var(--green-bg)" },
    medium: { color: "var(--blue)", bg: "var(--blue-bg)" },
    high: { color: "var(--amber)", bg: "var(--amber-bg)" },
    urgent: { color: "var(--red)", bg: "var(--red-bg)" },
};

function PriorityTag({ priority }: { priority: string | null }) {
    if (!priority) return <span style={{ color: "var(--text-muted)", fontSize: 12 }}>—</span>;
    const meta = PRIORITY_COLOR[priority] ?? { color: "var(--text-secondary)", bg: "var(--bg-input)" };
    return (
        <span style={{
            fontSize: 10.5, fontWeight: 700, padding: "3px 9px", borderRadius: 10,
            color: meta.color, background: meta.bg, textTransform: "capitalize", whiteSpace: "nowrap",
        }}>
            {priority}
        </span>
    );
}

function RecurringStatusTag({ isActive, endDate }: { isActive: boolean; endDate: string | null }) {
    if (!isActive) {
        return (
            <span style={{
                display: "inline-flex", alignItems: "center", gap: 4,
                fontSize: 10.5, fontWeight: 700, padding: "3px 9px", borderRadius: 10,
                color: "var(--red)", background: "var(--red-bg)", whiteSpace: "nowrap",
            }}>
                <StopOutlined style={{ fontSize: 10 }} />
                Stopped
            </span>
        );
    }
    const expired = endDate ? dayjs(endDate).isBefore(dayjs(), "day") : false;
    if (expired) {
        return (
            <span style={{
                fontSize: 10.5, fontWeight: 700, padding: "3px 9px", borderRadius: 10,
                color: "var(--text-muted)", background: "var(--bg-input)", whiteSpace: "nowrap",
            }}>
                Ended
            </span>
        );
    }
    return (
        <span style={{
            display: "inline-flex", alignItems: "center", gap: 4,
            fontSize: 10.5, fontWeight: 700, padding: "3px 9px", borderRadius: 10,
            color: "var(--green)", background: "var(--green-bg)", whiteSpace: "nowrap",
        }}>
            <SyncOutlined style={{ fontSize: 10 }} />
            Running
        </span>
    );
}

function StatCard({ label, value, changeLabel, changeType }: {
    label: string; value: number | string; changeLabel: string; changeType: "up" | "down" | "neutral";
}) {
    return (
        <div className="db-stat-card">
            <div className="db-stat-label">{label}</div>
            <div className="db-stat-value">{value}</div>
            <div
                className={`db-stat-change ${changeType === "neutral" ? "" : changeType}`}
                style={changeType === "neutral" ? { color: "var(--text-secondary)" } : undefined}
            >
                {changeLabel}
            </div>
        </div>
    );
}

export default function Recurring_Task_Admin() {
    const [definitions, setDefinitions] = useState<RecurringTaskDefinition[]>([]);
    const [loading, setLoading] = useState(true);
    const [search, setSearch] = useState("");
    const [priorityFilter, setPriorityFilter] = useState<string | undefined>(undefined);
    const [busyId, setBusyId] = useState<number | null>(null);

    const fetchDefinitions = useCallback(() => {
        setLoading(true);
        fetch(`${BASE_URL}/api/tasks/recurring/`, { headers: { ...authHeaders() } })
            .then((r) => r.json())
            .then((d) => setDefinitions(Array.isArray(d) ? d : d.results || []))
            .catch(() => message.error("Failed to load recurring tasks"))
            .finally(() => setLoading(false));
    }, []);

    useEffect(() => {
        fetchDefinitions();
    }, [fetchDefinitions]);

    const filtered = useMemo(() => {
        return definitions.filter((d) => {
            if (priorityFilter && d.priority !== priorityFilter) return false;
            if (search.trim()) {
                const q = search.toLowerCase();
                if (![d.task_name, d.task_details, d.assigned_to_name].some((f) => f?.toLowerCase().includes(q))) return false;
            }
            return true;
        });
    }, [definitions, search, priorityFilter]);

    const totalDefinitions = definitions.length;
    const runningCount = definitions.filter((d) => {
        const expired = d.end_date ? dayjs(d.end_date).isBefore(dayjs(), "day") : false;
        return d.is_active && !expired;
    }).length;
    const openEndedCount = definitions.filter((d) => d.is_active && !d.end_date).length;

    async function handleStop(definition: RecurringTaskDefinition) {
        setBusyId(definition.id);
        try {
            const res = await fetch(`${BASE_URL}/api/tasks/recurring/${definition.id}/stop/`, {
                method: "POST",
                headers: { "Content-Type": "application/json", ...authHeaders() },
            });
            if (res.ok) {
                message.success("Recurring task stopped — already-created tasks are unaffected");
            } else {
                const err = await res.json().catch(() => ({}));
                message.error(err.detail || "Failed to stop recurring task");
            }
        } catch {
            message.error("Network error");
        } finally {
            setBusyId(null);
            fetchDefinitions();
        }
    }

    const columns: ColumnsType<RecurringTaskDefinition> = [
        {
            title: "Task",
            key: "task_name",
            render: (_: any, record: RecurringTaskDefinition) => (
                <div>
                    <div style={{ fontSize: 13, fontWeight: 600, color: "var(--text-primary)" }}>
                        {record.task_name}
                    </div>
                    {record.task_details && (
                        <div style={{
                            fontSize: 11, color: "var(--text-secondary)", marginTop: 2,
                            maxWidth: 260, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
                        }}>
                            {record.task_details}
                        </div>
                    )}
                </div>
            ),
        },
        {
            title: "Assigned To",
            dataIndex: "assigned_to_name",
            key: "assigned_to_name",
            width: 140,
            render: (v: string | null) => (
                v
                    ? <span style={{ fontSize: 12.5, fontWeight: 600, color: "var(--text-primary)" }}>{v}</span>
                    : <span style={{ color: "var(--text-muted)", fontSize: 12 }}>Unassigned</span>
            ),
        },
        {
            title: "Priority",
            dataIndex: "priority",
            key: "priority",
            width: 100,
            render: (v: string | null) => <PriorityTag priority={v} />,
        },
        {
            title: "Allotted (hrs)",
            dataIndex: "allotted_time",
            key: "allotted_time",
            width: 110,
            render: (v: number | null) => (
                <span className="td-num" style={{ fontSize: 12 }}>{v ?? "—"}</span>
            ),
        },
        {
            title: "Frequency",
            dataIndex: "frequency",
            key: "frequency",
            width: 100,
            render: (v: string) => (
                <Tag style={{ textTransform: "capitalize", margin: 0 }}>{v}</Tag>
            ),
        },
        {
            title: "Start Date",
            dataIndex: "start_date",
            key: "start_date",
            width: 120,
            render: (v: string) => (
                <span style={{ fontSize: 12, color: "var(--text-secondary)" }}>
                    {dayjs(v).format("DD MMM YYYY")}
                </span>
            ),
        },
        {
            title: "End Date",
            dataIndex: "end_date",
            key: "end_date",
            width: 130,
            render: (v: string | null) => (
                v
                    ? <span style={{ fontSize: 12, color: "var(--text-secondary)" }}>{dayjs(v).format("DD MMM YYYY")}</span>
                    : <span style={{ fontSize: 11.5, fontStyle: "italic", color: "var(--text-muted)" }}>Until stopped</span>
            ),
        },
        {
            title: "Status",
            key: "status",
            width: 110,
            render: (_: any, record: RecurringTaskDefinition) => (
                <RecurringStatusTag isActive={record.is_active} endDate={record.end_date} />
            ),
        },
        {
            title: "Created",
            dataIndex: "created_at",
            key: "created_at",
            width: 140,
            render: (v: string) => (
                <span style={{ fontSize: 12, color: "var(--text-secondary)" }}>
                    {dayjs(v).format("DD MMM YYYY, HH:mm")}
                </span>
            ),
        },
        {
            title: "Actions",
            key: "actions",
            width: 110,
            fixed: "right",
            render: (_: any, record: RecurringTaskDefinition) => {
                if (!record.is_active) {
                    return <span style={{ fontSize: 12, color: "var(--text-muted)" }}>—</span>;
                }
                return (
                    <Popconfirm
                        title="Stop this recurring task?"
                        description="No new daily tasks will be generated. Tasks already created stay untouched."
                        okText="Stop"
                        okButtonProps={{ danger: true }}
                        onConfirm={() => handleStop(record)}
                    >
                        <Button
                            size="small"
                            danger
                            loading={busyId === record.id}
                            icon={<StopOutlined />}
                            style={{
                                fontSize: 11, fontWeight: 600, paddingInline: 10,
                                color: "var(--red)", borderColor: "var(--red)", background: "var(--red-bg)",
                                borderRadius: 6, border: "1px solid var(--red)",
                            }}
                        >
                            Stop
                        </Button>
                    </Popconfirm>
                );
            },
        },
    ];

    return (
        <div>
            <div style={{
                display: "flex", justifyContent: "space-between", alignItems: "center",
                marginBottom: 18, borderBottom: "1px solid var(--border)", paddingBottom: 8,
            }}>
                <div>
                    <h1 style={{
                        fontSize: 18, fontWeight: 700, margin: 0, color: "var(--accent)",
                        display: "flex", alignItems: "center", gap: 8,
                    }}>
                        <SyncOutlined />
                        Recurring Tasks
                    </h1>
                    <p style={{
                        fontSize: 9, color: "var(--text-muted)", margin: "4px 0 0",
                        fontWeight: 500, letterSpacing: "0.04em", textTransform: "uppercase",
                    }}>
                        Daily-repeating task rules — new task auto-created each active day
                    </p>
                </div>
            </div>

            <div className="db-stat-grid">
                <StatCard label="Total Rules" value={totalDefinitions} changeLabel="All recurring definitions" changeType="neutral" />
                <StatCard label="Currently Running" value={runningCount} changeLabel="Generating tasks daily" changeType="up" />
                <StatCard label="Open-Ended" value={openEndedCount} changeLabel="No end date set" changeType="neutral" />
            </div>

            <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 20, flexWrap: "wrap" }}>
                <Input
                    placeholder="Search by task or employee…"
                    prefix={<SearchOutlined style={{ color: "var(--text-muted)" }} />}
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    allowClear
                    style={{
                        flex: 1, minWidth: 220, maxWidth: 500, height: 35, padding: "0 14px",
                        background: "var(--bg-input)", border: "1px solid var(--accent-light)",
                        borderRadius: 9, color: "var(--text-primary)", fontSize: 13, outline: "none",
                    }}
                />
                <Select
                    placeholder="Priority"
                    allowClear
                    value={priorityFilter}
                    onChange={setPriorityFilter}
                    style={{ width: 150 }}
                    options={[
                        { value: "low", label: "Low" },
                        { value: "medium", label: "Medium" },
                        { value: "high", label: "High" },
                        { value: "urgent", label: "Urgent" },
                    ]}
                />
                <Button
                    onClick={fetchDefinitions}
                    icon={<ReloadOutlined />}
                    className="db-card-action"
                    style={{ height: 35, fontSize: 12, fontWeight: 600, display: "flex", alignItems: "center", gap: 6, paddingInline: 14 }}
                >
                    Refresh
                </Button>
                <span style={{ fontSize: 12, color: "var(--text-muted)", marginLeft: "auto" }}>
                    {filtered.length} of {definitions.length} recurring rules
                </span>
            </div>

            <div style={{
                background: "var(--bg-card)", borderRadius: 14, border: "1px solid var(--border)",
                overflow: "hidden", boxShadow: "var(--shadow-card)",
            }}>
                <Table
                    columns={columns}
                    dataSource={filtered}
                    rowKey="id"
                    scroll={{ x: 1300 }}
                    loading={loading}
                    pagination={{
                        pageSize: 10,
                        showSizeChanger: true,
                        pageSizeOptions: ["10", "20", "50"],
                        showTotal: (total, range) => `${range[0]}–${range[1]} of ${total} rules`,
                        style: { padding: "12px 16px", color: "var(--text-primary)" },
                    }}
                    rowClassName={() => "client-table-row"}
                    style={{ fontSize: 13 }}
                />
            </div>
        </div>
    );
}