// Reports_Employee.tsx
// Employee-facing — GET /api/reports/employee/, already scoped to the logged-in
// employee's own tasks on the backend, so nothing to filter by employee here.

import { useEffect, useState, useCallback } from "react";
import { Table, message } from "antd";
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

interface Summary {
    total_tasks: number;
    completed: number;
    completion_rate: number;
    total_hours: number;
    avg_rating: number | null;
}

interface ByQualityRow {
    quality_of_task: string;
    count: number;
}

interface MyReportTask {
    id: number;
    task_id: string;
    task_name: string;
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
    by_quality: ByQualityRow[];
    tasks: MyReportTask[];
}

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

const QUALITY_LABEL: Record<string, string> = {
    excellent: "Excellent", good: "Good", needs_improvement: "Needs Improvement",
    rework_needed: "Rework Needed", rejected: "Rejected",
};

const QUALITY_META: Record<string, { color: string; bg: string }> = {
    excellent: { color: "var(--green)", bg: "var(--green-bg)" },
    good: { color: "var(--green)", bg: "var(--green-bg)" },
    needs_improvement: { color: "var(--amber)", bg: "var(--amber-bg)" },
    rework_needed: { color: "var(--red)", bg: "var(--red-bg)" },
    rejected: { color: "var(--red)", bg: "var(--red-bg)" },
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

function QualityTag({ quality }: { quality: string }) {
    if (!quality) return <span style={{ color: "var(--text-muted)", fontSize: 12 }}>—</span>;
    const meta = QUALITY_META[quality] ?? { color: "var(--text-secondary)", bg: "var(--bg-input)" };
    return (
        <span style={{
            fontSize: 10.5, fontWeight: 700, padding: "3px 9px", borderRadius: 10,
            color: meta.color, background: meta.bg, whiteSpace: "nowrap",
        }}>
            {QUALITY_LABEL[quality] ?? quality.replace(/_/g, " ")}
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

export default function Reports_Employee() {
    const [data, setData] = useState<ReportData | null>(null);
    const [loading, setLoading] = useState(true);

    const fetchReport = useCallback(() => {
        setLoading(true);
        fetch(`${BASE_URL}/api/tasks/reports/employee/`, { headers: { ...authHeaders() } })
            .then((r) => r.json())
            .then((d) => setData(d))
            .catch(() => message.error("Failed to load your report"))
            .finally(() => setLoading(false));
    }, []);

    useEffect(() => {
        fetchReport();
    }, [fetchReport]);

    const columns: ColumnsType<MyReportTask> = [
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
            width: 220,
            render: (v: string) => <span style={{ fontSize: 12.5, fontWeight: 600, color: "var(--text-primary)" }}>{v}</span>,
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
            render: (_: any, r: MyReportTask) => (
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

    const maxQuality = Math.max(1, ...(data?.by_quality.map((r) => r.count) ?? [1]));

    return (
        <div>
            <div className="db-stat-grid">
                <StatCard
                    label="Total Tasks"
                    value={data?.summary.total_tasks ?? 0}
                    changeLabel="Assigned to you"
                    changeType="neutral"
                />
                <StatCard
                    label="Completed"
                    value={data?.summary.completed ?? 0}
                    changeLabel="Finished so far"
                    changeType="up"
                />
                <StatCard
                    label="Completion Rate"
                    value={`${data?.summary.completion_rate ?? 0}%`}
                    changeLabel="Of your total tasks"
                    changeType="up"
                />
                <StatCard
                    label="Total Hours Logged"
                    value={data?.summary.total_hours ?? 0}
                    changeLabel="Across all your tasks"
                    changeType="neutral"
                />
            </div>

            <div className="db-chart-card" style={{ marginBottom: 18 }}>
                <div className="db-card-title" style={{ marginBottom: 12 }}>Quality Breakdown</div>
                {(data?.by_quality ?? []).map((row) => (
                    <div key={row.quality_of_task} className="db-progress-row">
                        <div className="db-progress-top">
                            <span className="db-progress-label">{QUALITY_LABEL[row.quality_of_task] ?? row.quality_of_task}</span>
                            <span className="db-progress-value">{row.count}</span>
                        </div>
                        <div className="db-progress-bar">
                            <div className="db-progress-fill" style={{ width: `${(row.count / maxQuality) * 100}%` }} />
                        </div>
                    </div>
                ))}
                {(!data || data.by_quality.length === 0) && (
                    <span style={{ fontSize: 12, color: "var(--text-muted)" }}>No reviewed tasks yet.</span>
                )}
                {data?.summary.avg_rating != null && (
                    <div style={{ marginTop: 14, fontSize: 12, color: "var(--text-secondary)" }}>
                        Your average rating: <b style={{ color: "var(--text-primary)" }}>{data.summary.avg_rating}/5</b>
                    </div>
                )}
            </div>

            <div style={{
                background: "var(--bg-card)", borderRadius: 14, border: "1px solid var(--border)",
                overflow: "hidden", boxShadow: "var(--shadow-card)",
            }}>
                <Table
                    columns={columns}
                    dataSource={data?.tasks ?? []}
                    rowKey="id"
                    scroll={{ x: 1000 }}
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