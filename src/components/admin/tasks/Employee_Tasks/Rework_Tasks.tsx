import { useEffect, useState, useCallback, useMemo } from "react";
import { Table, Button, Input, Select, message } from "antd";
import { SearchOutlined, ReloadOutlined, RollbackOutlined } from "@ant-design/icons";
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

type TaskStatus =
    | "not_started" | "in_progress" | "paused" | "submitted" | "under_review"
    | "rework_needed" | "resubmitted" | "completed" | "on_hold" | "cancelled" | "archived";

interface ReworkTask {
    id: number;
    task_id: string;
    task_name: string;
    task_details: string;
    department_name: string | null;
    assigned_to_name: string | null;
    priority: string | null;
    task_status: TaskStatus;
    total_time_taken: number;
    allotted_time: number | null;
    admin_remarks: string;
    reviewed_date: string | null;
    rework_count: number;
    has_active_session: boolean;
}

// ── Full status set — unlike the Review Queue (submitted/resubmitted/
// under_review only), a reworked task can legitimately be sitting in ANY
// status by the time admin looks at this screen (in_progress if the
// employee is actively redoing it, paused if they stepped away, completed
// if it was later approved, etc). This screen never filters by status
// server-side — it filters by rework_count > 0 instead.
const STATUS_META: Record<TaskStatus, { label: string; color: string; bg: string }> = {
    not_started: { label: "Not Started", color: "var(--text-secondary)", bg: "var(--bg-input)" },
    in_progress: { label: "In Progress", color: "var(--blue)", bg: "var(--blue-bg)" },
    paused: { label: "Paused", color: "var(--amber)", bg: "var(--amber-bg)" },
    submitted: { label: "Submitted", color: "var(--purple)", bg: "var(--purple-bg)" },
    under_review: { label: "Under Review", color: "var(--purple)", bg: "var(--purple-bg)" },
    rework_needed: { label: "Rework Needed", color: "var(--red)", bg: "var(--red-bg)" },
    resubmitted: { label: "Resubmitted", color: "var(--amber)", bg: "var(--amber-bg)" },
    completed: { label: "Completed", color: "var(--green)", bg: "var(--green-bg)" },
    on_hold: { label: "On Hold", color: "var(--amber)", bg: "var(--amber-bg)" },
    cancelled: { label: "Cancelled", color: "var(--red)", bg: "var(--red-bg)" },
    archived: { label: "Archived", color: "var(--text-muted)", bg: "var(--bg-input)" },
};

const PRIORITY_COLOR: Record<string, { color: string; bg: string }> = {
    low: { color: "var(--green)", bg: "var(--green-bg)" },
    medium: { color: "var(--blue)", bg: "var(--blue-bg)" },
    high: { color: "var(--amber)", bg: "var(--amber-bg)" },
    urgent: { color: "var(--red)", bg: "var(--red-bg)" },
};

function StatusTag({ status }: { status: TaskStatus }) {
    const meta = STATUS_META[status] ?? STATUS_META.not_started;
    return (
        <span style={{
            fontSize: 10.5, fontWeight: 700, padding: "3px 9px", borderRadius: 10,
            color: meta.color, background: meta.bg, whiteSpace: "nowrap",
        }}>
            {meta.label}
        </span>
    );
}

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

function StatCard({ label, value, changeLabel, changeType }: {
    label: string; value: number; changeLabel: string; changeType: "up" | "down" | "neutral";
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

function formatAllottedTime(hours: number | null): string {
    if (hours === null || hours === undefined) return "—";
    const totalMinutes = Math.round(hours * 60);
    const h = Math.floor(totalMinutes / 60);
    const m = totalMinutes % 60;
    if (h && m) return `${h}h ${m}m`;
    if (h) return `${h}h`;
    return `${m}m`;
}

export default function Rework_Tasks() {
    const [tasks, setTasks] = useState<ReworkTask[]>([]);
    const [loading, setLoading] = useState(true);

    const [search, setSearch] = useState("");
    const [statusFilter, setStatusFilter] = useState<string | undefined>(undefined);
    const [priorityFilter, setPriorityFilter] = useState<string | undefined>(undefined);

    const fetchReworkTasks = useCallback(() => {
        setLoading(true);
        fetch(`${BASE_URL}/api/tasks/rework_tasks/`, {
            headers: { ...authHeaders() },
        })
            .then((r) => r.json())
            .then((d) => setTasks(Array.isArray(d) ? d : d.results || []))
            .catch(() => message.error("Failed to load reworked tasks"))
            .finally(() => setLoading(false));
    }, []);

    useEffect(() => {
        fetchReworkTasks();
    }, [fetchReworkTasks]);

    // ── Stats ────────────────────────────────────────────────────────────────
    const totalReworked = tasks.length;
    const inProgressCount = tasks.filter((t) => t.task_status === "in_progress").length;
    const pausedCount = tasks.filter((t) => t.task_status === "paused").length;
    const resolvedAfterRework = tasks.filter((t) => t.task_status === "completed").length;

    const filtered = useMemo(() => {
        return tasks.filter((t) => {
            if (statusFilter && t.task_status !== statusFilter) return false;
            if (priorityFilter && t.priority !== priorityFilter) return false;
            if (search.trim()) {
                const q = search.toLowerCase();
                const haystack = [t.task_id, t.task_name, t.task_details, t.assigned_to_name, t.department_name];
                if (!haystack.some((f) => f?.toLowerCase().includes(q))) return false;
            }
            return true;
        });
    }, [tasks, search, statusFilter, priorityFilter]);

    // Status options for the filter dropdown — only statuses actually present
    // in the data, so the list doesn't show choices with zero matches.
    const statusOptions = useMemo(() => {
        const present = new Set(tasks.map((t) => t.task_status));
        return Array.from(present).map((s) => ({ value: s, label: STATUS_META[s].label }));
    }, [tasks]);

    const columns: ColumnsType<ReworkTask> = [
        {
            title: "Task ID",
            dataIndex: "task_id",
            key: "task_id",
            width: 100,
            render: (v: string) => (
                <span style={{ fontSize: 11.5, fontWeight: 700, color: "var(--blue)", background: "var(--blue-bg)", border: "1px solid var(--blue)", padding: "2px 10px", borderRadius: 6, whiteSpace: "nowrap", }}>{v}</span>
            ),
        },
        {
            title: "Project Name",
            dataIndex: "project_name",
            key: "project_name",
            width: 120,
            render: (v: string) => (
                v
                    ? <span style={{ fontSize: 12.5, fontWeight: 600, color: "var(--text-primary)" }}>{v}</span>
                    : <span style={{ color: "var(--text-muted)", fontSize: 12 }}>—</span>
            ),
        },
        {
            title: "Task",
            key: "task_name",
            width: 160,
            render: (_: any, record: ReworkTask) => (
                <div>
                    <div style={{ fontSize: 13, fontWeight: 600, color: "var(--text-primary)" }}>
                        {record.task_name}
                    </div>
                    {record.task_details && (
                        <div style={{
                            fontSize: 11, color: "var(--text-secondary)", marginTop: 2,
                            maxWidth: 280, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
                        }}>
                            {record.task_details}
                        </div>
                    )}
                </div>
            ),
        },
        {
            title: "Department",
            dataIndex: "department_name",
            key: "department_name",
            width: 130,
            render: (v: string | null) => (
                v ? (
                    <span style={{
                        fontSize: 11, fontWeight: 600, color: "var(--amber)", background: "var(--amber-bg)",
                        border: "1px solid var(--amber)", padding: "2px 10px", borderRadius: 6, whiteSpace: "nowrap",
                    }}>
                        {v}
                    </span>
                ) : <span style={{ color: "var(--text-muted)", fontSize: 12 }}>—</span>
            ),
        },
        {
            title: "Assigned To",
            dataIndex: "assigned_to_name",
            key: "assigned_to_name",
            width: 120,
            render: (v: string | null) => (
                v
                    ? <span style={{ fontSize: 12.5, fontWeight: 600, color: "var(--text-primary)" }}>{v}</span>
                    : <span style={{ color: "var(--text-muted)", fontSize: 12 }}>Unassigned</span>
            ),
        },
        {
            title: "Assigned By",
            dataIndex: "assigned_by_name",
            key: "assigned_by_name",
            width: 120,
            render: (v: string | null) => (
                <span style={{ fontSize: 12, color: "var(--text-secondary)" }}>{v ?? "—"}</span>
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
            title: "Status",
            dataIndex: "task_status",
            key: "task_status",
            width: 130,
            render: (v: TaskStatus) => <StatusTag status={v} />,
        },
        {
            title: "Allotted Time",
            dataIndex: "allotted_time",
            key: "allotted_time",
            width: 110,
            render: (v: number | null) => (
                <span className="td-num" style={{ fontSize: 12 }}>{formatAllottedTime(v)}</span>
            ),
        },
        {
            title: "Time Taken",
            key: "time",
            width: 110,
            render: (_: any, record: ReworkTask) => {
                const isOver =
                    record.allotted_time != null && record.total_time_taken > record.allotted_time;
                return (
                    <span
                        className="td-num"
                        style={{
                            fontSize: 12,
                            color: isOver ? "var(--red)" : undefined,
                            fontWeight: isOver ? 700 : undefined,
                        }}
                    >
                        {formatAllottedTime(record.total_time_taken)}
                    </span>
                );
            },
        },
        {
            title: "Due Date",
            dataIndex: "due_date",
            key: "due_date",
            width: 110,
            render: (v: string | null) => (
                <span style={{ fontSize: 12, color: "var(--text-secondary)" }}>
                    {v ? dayjs(v).format("DD MMM YYYY") : "—"}
                </span>
            ),
        },
        {
            title: "Rework Count",
            dataIndex: "rework_count",
            key: "rework_count",
            width: 110,
            render: (v: number) => (
                <span style={{
                    fontSize: 11.5, fontWeight: 700, color: "var(--red)", background: "var(--red-bg)",
                    border: "1px solid var(--red)", padding: "2px 10px", borderRadius: 6,
                }}>
                    {v}
                </span>
            ),
        },

        {
            title: "Last Rework Reason",
            dataIndex: "admin_remarks",
            key: "admin_remarks",
            width: 220,
            render: (v: string) => (
                <div
                    style={{
                        fontSize: 11.5, color: "var(--text-secondary)", maxWidth: 220,
                        overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
                    }}
                    title={v}
                >
                    {v || "—"}
                </div>
            ),
        },
        {
            title: "Last Reviewed",
            dataIndex: "reviewed_date",
            key: "reviewed_date",
            width: 130,
            render: (v: string | null) => (
                <span style={{ fontSize: 11.5, color: "var(--text-secondary)" }}>
                    {v ? dayjs(v).format("DD MMM, HH:mm") : "—"}
                </span>
            ),
        },
        {
            title: "Timer",
            dataIndex: "has_active_session",
            key: "has_active_session",
            width: 100,
            render: (active: boolean) =>
                active ? (
                    <span style={{
                        fontSize: 10.5, fontWeight: 700, color: "var(--blue)", background: "var(--blue-bg)",
                        padding: "3px 9px", borderRadius: 10, whiteSpace: "nowrap",
                    }}>
                        Running
                    </span>
                ) : <span style={{ color: "var(--text-muted)", fontSize: 12 }}>—</span>,
        },
    ];

    return (
        <div>
            <div style={{
                display: "flex", justifyContent: "space-between", alignItems: "center",
                marginBottom: 18, borderBottom: "1px solid var(--border)", paddingBottom: 8,
            }}>
                <div>
                    <h1 style={{ fontSize: 18, fontWeight: 700, margin: 0, color: "var(--accent)" }}>
                        Rework Tasks
                    </h1>
                    <p style={{
                        fontSize: 9, color: "var(--text-muted)", margin: "4px 0 0",
                        fontWeight: 500, letterSpacing: "0.04em", textTransform: "uppercase",
                    }}>
                        Every task sent back for rework — tracked through its full lifecycle
                    </p>
                </div>
            </div>

            <div className="db-stat-grid">
                <StatCard label="Total Reworked" value={totalReworked} changeLabel="Ever sent back at least once" changeType="neutral" />
                <StatCard label="In Progress" value={inProgressCount} changeLabel="Employee actively redoing" changeType="up" />
                <StatCard label="Paused" value={pausedCount} changeLabel="Employee stepped away" changeType={pausedCount > 0 ? "down" : "neutral"} />
                <StatCard label="Resolved" value={resolvedAfterRework} changeLabel="Approved after rework" changeType="neutral" />
            </div>

            <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 20, flexWrap: "wrap" }}>
                <Input
                    placeholder="Search by task, employee, department…"
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
                    placeholder="Status"
                    allowClear
                    value={statusFilter}
                    onChange={setStatusFilter}
                    style={{ width: 170 }}
                    options={statusOptions}
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
                    onClick={fetchReworkTasks}
                    icon={<ReloadOutlined />}
                    className="db-card-action"
                    style={{ height: 35, fontSize: 12, fontWeight: 600, display: "flex", alignItems: "center", gap: 6, paddingInline: 14 }}
                >
                    Refresh
                </Button>
                <span style={{ fontSize: 12, color: "var(--text-muted)", marginLeft: "auto" }}>
                    {filtered.length} of {tasks.length} reworked tasks
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
                    scroll={{ x: 2000 }}
                    loading={loading}
                    pagination={{
                        pageSize: 10,
                        showSizeChanger: true,
                        pageSizeOptions: ["10", "20", "50"],
                        showTotal: (total, range) => `${range[0]}–${range[1]} of ${total}`,
                        style: { padding: "12px 16px", color: "var(--text-primary)" },
                    }}
                    rowClassName={() => "client-table-row"}
                    style={{ fontSize: 13 }}
                    locale={{
                        emptyText: (
                            <div style={{ padding: "24px 0", color: "var(--text-muted)" }}>
                                <RollbackOutlined style={{ fontSize: 20, marginBottom: 8, display: "block", margin: "0 auto 8px" }} />
                                No tasks have needed rework yet.
                            </div>
                        ),
                    }}
                />
            </div>
        </div>
    );
}