import { useEffect, useState, useCallback, useMemo } from "react";
import { Table, Button, Input, Select, message, Image } from "antd";
import { SearchOutlined, ReloadOutlined, CheckCircleOutlined, LinkOutlined } from "@ant-design/icons";
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

type TaskStatus = "submitted" | "resubmitted" | "completed";

interface CompletedTask {
    id: number;
    task_id: string;
    sub_task_id: string | null;
    project_name: string | null;
    task_name: string;
    task_details: string;
    department_name: string | null;
    assigned_to_name: string | null;
    assigned_by_name: string | null;
    priority: string | null;
    total_time_taken: number;
    allotted_time: number | null;
    task_sheet_link: string;        // ← NEW
    employee_remarks: string;       // ← NEW
    quality_of_task: string;
    rating: number | null;
    admin_remarks: string;
    reviewed_date: string | null;
    rework_count: number;
    task_status: TaskStatus;
    attachments: { id: number; file: string; uploaded_at: string }[];
}

// ── Quality outcome, styled like Active_Task_Admin's StatusTag ──
const QUALITY_META: Record<string, { label: string; color: string; bg: string }> = {
    excellent: { label: "Excellent", color: "var(--green)", bg: "var(--green-bg)" },
    good: { label: "Good", color: "var(--green)", bg: "var(--green-bg)" },
    needs_improvement: { label: "Needs Improvement", color: "var(--amber)", bg: "var(--amber-bg)" },
    rework_needed: { label: "Rework Needed", color: "var(--red)", bg: "var(--red-bg)" },
    rejected: { label: "Rejected", color: "var(--red)", bg: "var(--red-bg)" },
};

const STATUS_META: Record<TaskStatus, { label: string; color: string; bg: string }> = {
    submitted: { label: "Submitted", color: "var(--purple)", bg: "var(--purple-bg)" },
    resubmitted: { label: "Resubmitted", color: "var(--amber)", bg: "var(--amber-bg)" },
    completed: { label: "Completed", color: "var(--green)", bg: "var(--green-bg)" },
};

const PRIORITY_COLOR: Record<string, { color: string; bg: string }> = {
    low: { color: "var(--green)", bg: "var(--green-bg)" },
    medium: { color: "var(--blue)", bg: "var(--blue-bg)" },
    high: { color: "var(--amber)", bg: "var(--amber-bg)" },
    urgent: { color: "var(--red)", bg: "var(--red-bg)" },
};

const PRIORITY_OPTIONS = [
    { value: "low", label: "Low" },
    { value: "medium", label: "Medium" },
    { value: "high", label: "High" },
    { value: "urgent", label: "Urgent" },
];

function QualityTag({ quality }: { quality: string }) {
    if (!quality) return <span style={{ color: "var(--text-muted)", fontSize: 12 }}>N/A</span>;
    const meta = QUALITY_META[quality] ?? {
        label: quality.replace(/_/g, " "),
        color: "var(--text-secondary)",
        bg: "var(--bg-input)",
    };
    return (
        <span style={{
            display: "inline-flex", alignItems: "center", gap: 4,
            fontSize: 10.5, fontWeight: 700, padding: "3px 9px", borderRadius: 10,
            color: meta.color, background: meta.bg, textTransform: "capitalize", whiteSpace: "nowrap",
        }}>
            <CheckCircleOutlined style={{ fontSize: 10 }} />
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

export default function Completed_Tasks_Employee() {
    const [tasks, setTasks] = useState<CompletedTask[]>([]);
    const [loading, setLoading] = useState(true);
    const [search, setSearch] = useState("");
    const [qualityFilter, setQualityFilter] = useState<string | undefined>(undefined);
    const [priorityFilter, setPriorityFilter] = useState<string | undefined>(undefined);

    const fetchCompleted = useCallback(() => {
        setLoading(true);
        // Employee-scoped — my_tasks/ already restricts to the logged-in
        // employee's own tasks server-side, so no ownership filter needed here.
        fetch(`${BASE_URL}/api/tasks/my_tasks/`, { headers: { ...authHeaders() } })
            .then((r) => r.json())
            .then((d) => {
                const all: any[] = Array.isArray(d) ? d : d.results || [];
                setTasks(all.filter((t) => t.task_status === "completed"));
            })
            .catch(() => message.error("Failed to load completed tasks"))
            .finally(() => setLoading(false));
    }, []);

    useEffect(() => {
        fetchCompleted();
    }, [fetchCompleted]);

    const filtered = useMemo(() => {
        return tasks.filter((t) => {
            if (qualityFilter && t.quality_of_task !== qualityFilter) return false;
            if (priorityFilter && t.priority !== priorityFilter) return false;
            if (search.trim()) {
                const q = search.toLowerCase();
                if (![t.task_id, t.sub_task_id, t.project_name, t.task_name, t.department_name].some((f) => f?.toLowerCase().includes(q))) return false;
            }
            return true;
        });
    }, [tasks, search, qualityFilter, priorityFilter]);

    const totalCompleted = tasks.length;
    const excellentCount = tasks.filter((t) => t.quality_of_task === "excellent").length;
    const goodCount = tasks.filter((t) => t.quality_of_task === "good").length;
    const rejectedCount = tasks.filter((t) => t.quality_of_task === "rejected").length;

    function resolveFileUrl(path: string): string {
        if (/^https?:\/\//i.test(path)) return path;  // already absolute
        return `${BASE_URL}${path.startsWith("/") ? "" : "/"}${path}`;
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

    function StatusTag({ status }: { status: TaskStatus }) {
        const meta = STATUS_META[status];
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

    const columns: ColumnsType<CompletedTask> = [
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
            title: "Sub Task ID",
            dataIndex: "sub_task_id",
            key: "sub_task_id",
            width: 100,
            render: (_: unknown, record: CompletedTask) => (
                <div style={{ display: "flex", flexDirection: "column", gap: 3 }}>
                    <span style={{ fontSize: 11, fontWeight: 700, color: "var(--green)", background: "var(--green-bg)", border: "1px solid var(--green)", padding: "2px 10px", borderRadius: 6, whiteSpace: "nowrap", width: "fit-content" }}>
                        {record.sub_task_id ? record.sub_task_id : "—"}
                    </span>
                </div>
            ),
        },
        {
            title: "Project Name",
            dataIndex: "project_name",
            key: "project_name",
            width: 120,
            render: (v: string | null) => (
                v
                    ? <span style={{ fontSize: 12.5, fontWeight: 600, color: "var(--text-primary)" }}>{v}</span>
                    : <span style={{ color: "var(--text-muted)", fontSize: 12 }}>—</span>
            ),
        },
        {
            title: "Task",
            key: "task_name",
            width: 160,
            render: (_: any, record: CompletedTask) => (
                <div>
                    <div style={{ fontSize: 13, fontWeight: 600, color: "var(--text-primary)" }}>
                        {record.task_name}
                    </div>
                    {record.task_details && (
                        <div style={{
                            fontSize: 11, color: "var(--text-secondary)", marginTop: 2,
                            maxWidth: 220, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
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
            render: (v: number | null) => (
                <span className="td-num" style={{ fontSize: 12 }}>{v ? `${v}/5` : "—"}</span>
            ),
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
            render: (_: any, record: CompletedTask) => {
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
            title: "Task Sheet Link",
            dataIndex: "task_sheet_link",
            key: "task_sheet_link",
            width: 140,
            render: (v: string) => v ? (
                <a href={v} target="_blank" rel="noreferrer" style={{ fontSize: 11.5, display: "flex", alignItems: "center", gap: 4 }}>
                    <LinkOutlined /> Open
                </a>
            ) : <span style={{ color: "var(--text-muted)", fontSize: 12 }}>—</span>,
        },
        {
            title: "Attachments",
            dataIndex: "attachments",
            key: "attachments",
            width: 200,
            render: (files: CompletedTask["attachments"]) =>
                files?.length ? (
                    <Image.PreviewGroup>
                        <div style={{ display: "flex", gap: 4, flexWrap: "wrap", maxWidth: 180 }}>
                            {files.map((f) => (
                                <Image
                                    key={f.id}
                                    src={resolveFileUrl(f.file)}
                                    width={28}
                                    height={28}
                                    style={{ objectFit: "cover", borderRadius: 4, border: "1px solid var(--border)" }}
                                />
                            ))}
                        </div>
                    </Image.PreviewGroup>
                ) : <span style={{ color: "var(--text-muted)", fontSize: 12 }}>—</span>,
        },
        {
            title: "Employee Remarks",
            dataIndex: "employee_remarks",
            key: "employee_remarks",
            width: 160,
            render: (v: string) => (
                <div style={{
                    fontSize: 11.5, color: "var(--text-secondary)", maxWidth: 160,
                    overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
                }} title={v}>
                    {v || "—"}
                </div>
            ),
        },
        {
            title: "Admin Remarks",
            dataIndex: "admin_remarks",
            key: "admin_remarks",
            width: 180,
            render: (v: string) => (
                <div
                    style={{
                        fontSize: 11.5, color: "var(--text-secondary)", maxWidth: 180,
                        overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
                    }}
                    title={v}
                >
                    {v || "—"}
                </div>
            ),
        },
        {
            title: "Rework Count",
            dataIndex: "rework_count",
            key: "rework_count",
            width: 100,
            render: (v: number) => <span className="td-num" style={{ fontSize: 12 }}>{v}</span>,
        },
        {
            title: "Completed On",
            dataIndex: "reviewed_date",
            key: "reviewed_date",
            width: 140,
            render: (v: string | null) => (
                <span style={{ fontSize: 12, color: "var(--text-secondary)" }}>
                    {v ? dayjs(v).format("DD MMM YYYY, HH:mm") : "—"}
                </span>
            ),
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
                        <CheckCircleOutlined />
                        Completed Tasks
                    </h1>
                    <p style={{
                        fontSize: 9, color: "var(--text-muted)", margin: "4px 0 0",
                        fontWeight: 500, letterSpacing: "0.04em", textTransform: "uppercase",
                    }}>
                        Your finished work — review outcomes
                    </p>
                </div>
            </div>

            <div className="db-stat-grid">
                <StatCard
                    label="Total Completed"
                    value={totalCompleted}
                    changeLabel="Finished tasks on record"
                    changeType="neutral"
                />
                <StatCard
                    label="Excellent"
                    value={excellentCount}
                    changeLabel="Rated excellent by admin"
                    changeType="up"
                />
                <StatCard
                    label="Good"
                    value={goodCount}
                    changeLabel="Rated good by admin"
                    changeType="up"
                />
                <StatCard
                    label="Rejected"
                    value={rejectedCount}
                    changeLabel="Rejected by admin"
                    changeType={rejectedCount > 0 ? "down" : "neutral"}
                />
            </div>

            <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 20, flexWrap: "wrap" }}>
                <Input
                    placeholder="Search completed tasks…"
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
                    placeholder="Quality"
                    allowClear
                    value={qualityFilter}
                    onChange={setQualityFilter}
                    style={{ width: 170 }}
                    options={[
                        { value: "excellent", label: "Excellent" },
                        { value: "good", label: "Good" },
                        { value: "needs_improvement", label: "Needs Improvement" },
                        { value: "rework_needed", label: "Rework Needed" },
                        { value: "rejected", label: "Rejected" },
                    ]}
                />
                <Select
                    placeholder="Priority"
                    allowClear
                    value={priorityFilter}
                    onChange={setPriorityFilter}
                    style={{ width: 150 }}
                    options={PRIORITY_OPTIONS}
                />
                <Button
                    onClick={fetchCompleted}
                    icon={<ReloadOutlined />}
                    className="db-card-action"
                    style={{ height: 35, fontSize: 12, fontWeight: 600, display: "flex", alignItems: "center", gap: 6, paddingInline: 14 }}
                >
                    Refresh
                </Button>
                <span style={{ fontSize: 12, color: "var(--text-muted)", marginLeft: "auto" }}>
                    {filtered.length} of {tasks.length} completed
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
                    scroll={{ x: 2600 }}
                    loading={loading}
                    pagination={{
                        pageSize: 10,
                        showSizeChanger: true,
                        pageSizeOptions: ["10", "20", "50"],
                        showTotal: (total, range) => `${range[0]}–${range[1]} of ${total} completed`,
                        style: { padding: "12px 16px", color: "var(--text-primary)" },
                    }}
                    rowClassName={() => "client-table-row"}
                    style={{ fontSize: 13 }}
                />
            </div>
        </div>
    );
}