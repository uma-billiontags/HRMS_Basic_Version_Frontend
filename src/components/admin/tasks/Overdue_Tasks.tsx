import { useEffect, useState, useCallback, useMemo } from "react";
import { Table, Button, Input, Select, message } from "antd";
import { SearchOutlined, ReloadOutlined, WarningOutlined } from "@ant-design/icons";
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

interface Task {
    id: number;
    task_id: string;
    task_name: string;
    task_details: string;
    department_name: string | null;
    assigned_to_name: string | null;
    priority: string | null;
    due_date: string | null;
    allotted_time: number | null;
    total_time_taken: number;
    task_status: TaskStatus;
}

interface OverdueTask extends Task {
    overdue_days: number;
}

// ── Same rule the backend's get_admin_reports KPI uses: past due_date,
// and not already finished/dead — completed, cancelled, and archived
// tasks are never "overdue" regardless of their due_date.
const EMPLOYEE_OWNED_STATUSES: TaskStatus[] = [
    "not_started", "in_progress", "paused", "rework_needed",
];

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

// ── Overdue-severity badge — color escalates the longer it's been late.
function OverdueTag({ days }: { days: number }) {
    let color = "var(--amber)";
    let bg = "var(--amber-bg)";
    if (days >= 7) {
        color = "var(--red)";
        bg = "var(--red-bg)";
    }
    return (
        <span style={{
            fontSize: 11, fontWeight: 700, color, background: bg,
            border: `1px solid ${color}`, padding: "2px 10px", borderRadius: 6, whiteSpace: "nowrap",
        }}>
            Overdue by {days} {days === 1 ? "day" : "days"}
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

function formatAllottedTime(hours: number | null | undefined): string {
    if (hours === null || hours === undefined) return "—";
    const totalMinutes = Math.round(hours * 60);
    const h = Math.floor(totalMinutes / 60);
    const m = totalMinutes % 60;
    if (h && m) return `${h}h ${m}m`;
    if (h) return `${h}h`;
    return `${m}m`;
}

export default function Overdue_Tasks() {
    const [tasks, setTasks] = useState<OverdueTask[]>([]);
    const [loading, setLoading] = useState(true);

    const [search, setSearch] = useState("");
    const [statusFilter, setStatusFilter] = useState<string | undefined>(undefined);
    const [priorityFilter, setPriorityFilter] = useState<string | undefined>(undefined);

    const fetchTasks = useCallback(() => {
        setLoading(true);
        fetch(`${BASE_URL}/api/tasks/get_all_tasks/`, { headers: { ...authHeaders() } })
            .then((r) => r.json())
            .then((d) => {
                const all: Task[] = Array.isArray(d) ? d : d.results || [];
                const today = dayjs().startOf("day");

                const overdue: OverdueTask[] = all
                    .filter((t) => t.due_date && EMPLOYEE_OWNED_STATUSES.includes(t.task_status))
                    .map((t) => ({
                        ...t,
                        overdue_days: today.diff(dayjs(t.due_date!).startOf("day"), "day"),
                    }))
                    .filter((t) => t.overdue_days > 0)
                    .sort((a, b) => b.overdue_days - a.overdue_days);
                setTasks(overdue);
            })
            .catch(() => message.error("Failed to load overdue tasks"))
            .finally(() => setLoading(false));
    }, []);

    useEffect(() => {
        fetchTasks();
    }, [fetchTasks]);

    const totalOverdue = tasks.length;
    const overdue15Plus = tasks.filter((t) => t.overdue_days >= 15).length;
    const overdue30Plus = tasks.filter((t) => t.overdue_days >= 30).length;
    const overdue45Plus = tasks.filter((t) => t.overdue_days >= 45).length;

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

    const statusOptions = EMPLOYEE_OWNED_STATUSES.map((s) => ({ value: s, label: STATUS_META[s].label }));
    const columns: ColumnsType<OverdueTask> = [
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
            render: (_: any, record: Task) => (
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
            render: (_: any, record: Task) => {
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
            title: "Overdue By",
            dataIndex: "overdue_days",
            key: "overdue_days",
            width: 150,
            sorter: (a, b) => a.overdue_days - b.overdue_days,
            defaultSortOrder: "descend",
            render: (days: number) => <OverdueTag days={days} />,
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
                        Overdue Tasks
                    </h1>
                    <p style={{
                        fontSize: 9, color: "var(--text-muted)", margin: "4px 0 0",
                        fontWeight: 500, letterSpacing: "0.04em", textTransform: "uppercase",
                    }}>
                        Past due date and not yet completed, cancelled, or archived
                    </p>
                </div>
            </div>

            <div className="db-stat-grid">
                <StatCard label="Total Overdue" value={totalOverdue} changeLabel="Past due date" changeType={totalOverdue > 0 ? "down" : "neutral"} />
                <StatCard label="15+ Days Overdue" value={overdue15Plus} changeLabel="Needs attention" changeType={overdue15Plus > 0 ? "down" : "neutral"} />
                <StatCard label="30+ Days Overdue" value={overdue30Plus} changeLabel="Significantly late" changeType={overdue30Plus > 0 ? "down" : "neutral"} />
                <StatCard label="45+ Days Overdue" value={overdue45Plus} changeLabel="Critical — escalate" changeType={overdue45Plus > 0 ? "down" : "neutral"} />
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
                    onClick={fetchTasks}
                    icon={<ReloadOutlined />}
                    className="db-card-action"
                    style={{ height: 35, fontSize: 12, fontWeight: 600, display: "flex", alignItems: "center", gap: 6, paddingInline: 14 }}
                >
                    Refresh
                </Button>
                <span style={{ fontSize: 12, color: "var(--text-muted)", marginLeft: "auto" }}>
                    {filtered.length} of {tasks.length} overdue tasks
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
                    scroll={{ x: 1500 }}
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
                    locale={{
                        emptyText: (
                            <div style={{ padding: "24px 0", color: "var(--text-muted)" }}>
                                <WarningOutlined style={{ fontSize: 20, marginBottom: 8, display: "block", margin: "0 auto 8px" }} />
                                No overdue tasks — everything's on track.
                            </div>
                        ),
                    }}
                />
            </div>
        </div>
    );
}