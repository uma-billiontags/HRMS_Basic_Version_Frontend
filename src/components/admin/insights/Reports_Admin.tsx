// Reports_Admin.tsx
// Admin-only — hits GET /api/reports/admin/?employee=&status=&priority=&date_from=&date_to=
// Backend returns { summary, by_employee, by_status, tasks } already filtered
// server-side, so this component just renders whatever comes back — no
// client-side recomputation of totals.

import { useEffect, useState, useCallback } from "react";
import { Table, Button, Select, DatePicker, message } from "antd";
import { ReloadOutlined, DownloadOutlined } from "@ant-design/icons";
import type { ColumnsType } from "antd/es/table";
import dayjs from "dayjs";

const BASE_URL = import.meta.env.VITE_BASE_URL;
const { RangePicker } = DatePicker;

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

interface Summary {
    total_tasks: number;
    completed: number;
    completion_rate: number;
    overdue: number;
    total_hours: number;
    avg_rating: number | null;
}

interface ByEmployeeRow {
    assigned_to__name: string;
    count: number;
    hours: number | null;
}

interface ByStatusRow {
    task_status: string;
    count: number;
}

interface ReportTask {
    id: number;
    task_id: string;
    task_name: string;
    assigned_to_name: string | null;
    priority: string | null;
    task_status: string;
    total_time_taken: number;
    allotted_time: number | null;
    assigned_date: string;
    quality_of_task: string;
    rating: number | null;
}

interface ReportData {
    summary: Summary;
    by_employee: ByEmployeeRow[];
    by_status: ByStatusRow[];
    tasks: ReportTask[];
}

const STATUS_OPTIONS = [
    "not_started", "in_progress", "paused", "submitted", "under_review",
    "rework_needed", "resubmitted", "completed", "on_hold", "cancelled", "archived",
].map((v) => ({ value: v, label: v.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase()) }));

const PRIORITY_OPTIONS = ["low", "medium", "high", "urgent"].map((v) => ({
    value: v, label: v[0].toUpperCase() + v.slice(1),
}));

// ── Same palette used across the other task screens ──
const STATUS_META: Record<string, { label: string; color: string; bg: string }> = {
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

const QUALITY_META: Record<string, { label: string; color: string; bg: string }> = {
    excellent: { label: "Excellent", color: "var(--green)", bg: "var(--green-bg)" },
    good: { label: "Good", color: "var(--green)", bg: "var(--green-bg)" },
    needs_improvement: { label: "Needs Improvement", color: "var(--amber)", bg: "var(--amber-bg)" },
    rework_needed: { label: "Rework Needed", color: "var(--red)", bg: "var(--red-bg)" },
    rejected: { label: "Rejected", color: "var(--red)", bg: "var(--red-bg)" },
};

function StatusTag({ status }: { status: string }) {
    const meta = STATUS_META[status] ?? { label: status.replace(/_/g, " "), color: "var(--text-secondary)", bg: "var(--bg-input)" };
    return (
        <span style={{
            fontSize: 10.5, fontWeight: 700, padding: "3px 9px", borderRadius: 10,
            color: meta.color, background: meta.bg, textTransform: "capitalize", whiteSpace: "nowrap",
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

function QualityTag({ quality }: { quality: string }) {
    if (!quality) return <span style={{ color: "var(--text-muted)", fontSize: 12 }}>—</span>;
    const meta = QUALITY_META[quality] ?? { label: quality.replace(/_/g, " "), color: "var(--text-secondary)", bg: "var(--bg-input)" };
    return (
        <span style={{
            fontSize: 10.5, fontWeight: 700, padding: "3px 9px", borderRadius: 10,
            color: meta.color, background: meta.bg, textTransform: "capitalize", whiteSpace: "nowrap",
        }}>
            {meta.label}
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

function csvEscape(v: string | number | null): string {
    const s = v === null || v === undefined ? "" : String(v);
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

export default function Reports_Admin() {
    const [data, setData] = useState<ReportData | null>(null);
    const [loading, setLoading] = useState(true);
    const [employees, setEmployees] = useState<{ id: number; name: string }[]>([]);

    const [employeeFilter, setEmployeeFilter] = useState<number | undefined>(undefined);
    const [statusFilter, setStatusFilter] = useState<string | undefined>(undefined);
    const [priorityFilter, setPriorityFilter] = useState<string | undefined>(undefined);
    const [dateRange, setDateRange] = useState<[dayjs.Dayjs, dayjs.Dayjs] | null>(null);

    const fetchEmployees = useCallback(() => {
        fetch(`${BASE_URL}/api/tasks/get_all_employees/`, { headers: { ...authHeaders() } })
            .then((r) => r.json())
            .then((d) => setEmployees(Array.isArray(d) ? d : d.results || []))
            .catch(() => { /* non-critical for the report itself */ });
    }, []);

    const fetchReport = useCallback(() => {
        setLoading(true);
        const params = new URLSearchParams();
        if (employeeFilter) params.set("employee", String(employeeFilter));
        if (statusFilter) params.set("status", statusFilter);
        if (priorityFilter) params.set("priority", priorityFilter);
        if (dateRange) {
            params.set("date_from", dateRange[0].format("YYYY-MM-DD"));
            params.set("date_to", dateRange[1].format("YYYY-MM-DD"));
        }
        fetch(`${BASE_URL}/api/tasks/reports/admin/?${params.toString()}`, { headers: { ...authHeaders() } })
            .then((r) => r.json())
            .then((d) => setData(d))
            .catch(() => message.error("Failed to load the report"))
            .finally(() => setLoading(false));
    }, [employeeFilter, statusFilter, priorityFilter, dateRange]);

    useEffect(() => {
        fetchEmployees();
    }, [fetchEmployees]);

    useEffect(() => {
        fetchReport();
    }, [fetchReport]);

    const handleExportCsv = () => {
        if (!data) return;
        const headers = ["Task ID", "Task", "Assigned To", "Priority", "Status", "Total Hours", "Allotted Hours", "Assigned Date", "Quality", "Rating"];
        const lines = data.tasks.map((t) => [
            t.task_id, t.task_name, t.assigned_to_name ?? "", t.priority ?? "",
            t.task_status, t.total_time_taken, t.allotted_time ?? "", t.assigned_date,
            t.quality_of_task, t.rating ?? "",
        ].map(csvEscape).join(","));
        const csv = [headers.join(","), ...lines].join("\n");
        const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = `task-report-${dayjs().format("YYYY-MM-DD")}.csv`;
        a.click();
        URL.revokeObjectURL(url);
    };

    const columns: ColumnsType<ReportTask> = [
        {
            title: "Task ID",
            dataIndex: "task_id",
            key: "task_id",
            width: 100,
            render: (v: string) => (
                <span style={{
                    fontSize: 11.5, fontWeight: 700, color: "var(--blue)", background: "var(--blue-bg)",
                    border: "1px solid var(--blue)", padding: "2px 10px", borderRadius: 6, whiteSpace: "nowrap",
                }}>
                    {v}
                </span>
            ),
        },
        {
            title: "Task",
            dataIndex: "task_name",
            key: "task_name",
            width: 200,
            render: (v: string) => <span style={{ fontSize: 12.5, fontWeight: 600, color: "var(--text-primary)" }}>{v}</span>,
        },
        {
            title: "Assigned To",
            dataIndex: "assigned_to_name",
            key: "assigned_to_name",
            width: 130,
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
            title: "Status",
            dataIndex: "task_status",
            key: "task_status",
            width: 130,
            render: (v: string) => <StatusTag status={v} />,
        },
        {
            title: "Hours (used/allotted)",
            key: "hours",
            width: 150,
            render: (_: any, r: ReportTask) => (
                <span className="td-num" style={{ fontSize: 12 }}>{r.total_time_taken} / {r.allotted_time ?? "—"}</span>
            ),
        },
        {
            title: "Assigned Date",
            dataIndex: "assigned_date",
            key: "assigned_date",
            width: 120,
            render: (v: string) => (
                <span style={{ fontSize: 11.5, color: "var(--text-secondary)" }}>{dayjs(v).format("DD MMM YYYY")}</span>
            ),
        },
        {
            title: "Quality",
            dataIndex: "quality_of_task",
            key: "quality_of_task",
            width: 150,
            render: (v: string) => <QualityTag quality={v} />,
        },
        {
            title: "Rating",
            dataIndex: "rating",
            key: "rating",
            width: 80,
            render: (v: number | null) => <span className="td-num" style={{ fontSize: 12 }}>{v ? `${v}/5` : "—"}</span>,
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
                        Reports
                    </h1>
                    <p style={{
                        fontSize: 9, color: "var(--text-muted)", margin: "4px 0 0",
                        fontWeight: 500, letterSpacing: "0.04em", textTransform: "uppercase",
                    }}>
                        Org-wide task performance
                    </p>
                </div>
                <Button onClick={handleExportCsv} icon={<DownloadOutlined />}
                    style={{
                        borderRadius: 9, border: "none", background: "var(--accent)", color: "#fff",
                        fontSize: 12, fontWeight: 700, padding: "8px 16px", display: "flex", alignItems: "center", gap: 6,
                    }}>
                    Export CSV
                </Button>
            </div>

            <div className="db-stat-grid">
                <StatCard
                    label="Total Tasks"
                    value={data?.summary.total_tasks ?? 0}
                    changeLabel="Matching current filters"
                    changeType="neutral"
                />
                <StatCard
                    label="Completion Rate"
                    value={`${data?.summary.completion_rate ?? 0}%`}
                    changeLabel="Of tasks in this report"
                    changeType="up"
                />
                <StatCard
                    label="Overdue"
                    value={data?.summary.overdue ?? 0}
                    changeLabel="Past due date, not completed"
                    changeType={(data?.summary.overdue ?? 0) > 0 ? "down" : "neutral"}
                />
               
            </div>

            <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 20, flexWrap: "wrap" }}>
                <Select
                    placeholder="Employee"
                    allowClear
                    value={employeeFilter}
                    onChange={setEmployeeFilter}
                    style={{ width: 170 }}
                    options={employees.map((e) => ({ value: e.id, label: e.name }))}
                />
                <Select
                    placeholder="Status"
                    allowClear
                    value={statusFilter}
                    onChange={setStatusFilter}
                    style={{ width: 160 }}
                    options={STATUS_OPTIONS}
                />
                <Select
                    placeholder="Priority"
                    allowClear
                    value={priorityFilter}
                    onChange={setPriorityFilter}
                    style={{ width: 140 }}
                    options={PRIORITY_OPTIONS}
                />
                <RangePicker
                    value={dateRange}
                    onChange={(v) => setDateRange(v as [dayjs.Dayjs, dayjs.Dayjs] | null)}
                    format="DD MMM YYYY"
                    style={{ height: 35 }}
                />
                <Button
                    onClick={fetchReport}
                    icon={<ReloadOutlined />}
                    className="db-card-action"
                    style={{ height: 35, fontSize: 12, fontWeight: 600, display: "flex", alignItems: "center", gap: 6, paddingInline: 14 }}
                >
                    Refresh
                </Button>
                <span style={{ fontSize: 12, color: "var(--text-muted)", marginLeft: "auto" }}>
                    {data?.tasks.length ?? 0} tasks in this report
                </span>
            </div>

            {/* ── Task table ── */}
            <div style={{
                background: "var(--bg-card)", borderRadius: 14, border: "1px solid var(--border)",
                overflow: "hidden", boxShadow: "var(--shadow-card)",
            }}>
                <Table
                    columns={columns}
                    dataSource={data?.tasks ?? []}
                    rowKey="id"
                    scroll={{ x: 1300 }}
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
                />
            </div>
        </div>
    );
}