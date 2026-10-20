import { useEffect, useState, useCallback, useMemo } from "react";
import { Table, Button, Input, Modal, Select, Form, message, Image } from "antd";
import {
    SearchOutlined, ReloadOutlined, CheckCircleOutlined, RollbackOutlined, LinkOutlined,
} from "@ant-design/icons";
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

type ReviewStatus = "submitted" | "resubmitted";
type SubmissionStatus = "early" | "on_time" | "overdue";

interface ReviewTask {
    id: number;
    task_id: string;
    sub_task_id: string | null;
    task_name: string;
    task_details: string;
    assigned_to_name: string | null;
    department_name: string | null;
    priority: string | null;
    task_status: ReviewStatus;
    total_time_taken: number;
    allotted_time: number | null;
    due_date: string | null;
    task_sheet_link: string;
    employee_remarks: string;
    submitted_date: string | null;
    rework_count: number;
    attachments: { id: number; file: string; uploaded_at: string }[];
}

const QUALITY_OPTIONS = [
    { value: "excellent", label: "Excellent", rating: 5 },
    { value: "good", label: "Good", rating: 4 },
    { value: "needs_improvement", label: "Needs Improvement", rating: 3 },
    { value: "rework_needed", label: "Rework Needed", rating: 2 },
    { value: "rejected", label: "Rejected", rating: 1 },
];

const STATUS_META: Record<ReviewStatus, { label: string; color: string; bg: string }> = {
    submitted: { label: "Submitted", color: "var(--purple)", bg: "var(--purple-bg)" },
    resubmitted: { label: "Resubmitted", color: "var(--amber)", bg: "var(--amber-bg)" },
};

const SUBMISSION_STATUS_OPTIONS: { value: SubmissionStatus; label: string }[] = [
    { value: "early", label: "Early" },
    { value: "on_time", label: "On Time" },
    { value: "overdue", label: "Overdue" },
];

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
function StatusTag({ status }: { status: ReviewStatus }) {
    const meta = STATUS_META[status];

    if (!meta) {
        return (
            <span
                style={{
                    fontSize: 10.5,
                    fontWeight: 700,
                    padding: "3px 9px",
                    borderRadius: 10,
                    color: "var(--text-secondary)",
                    background: "var(--bg-input)",
                    whiteSpace: "nowrap",
                }}
            >
                {status.replace("_", " ")}
            </span>
        );
    }

    return (
        <span
            style={{
                fontSize: 10.5,
                fontWeight: 700,
                padding: "3px 9px",
                borderRadius: 10,
                color: meta.color,
                background: meta.bg,
                whiteSpace: "nowrap",
            }}
        >
            {meta.label}
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

// Returns the raw filterable value: "early" | "on_time" | "overdue" | null
function getSubmissionStatusValue(record: ReviewTask): SubmissionStatus | null {
    if (!record.submitted_date || !record.due_date) return null;

    const due = dayjs(record.due_date).startOf("day");
    const submitted = dayjs(record.submitted_date).startOf("day");
    const diffDays = submitted.diff(due, "day");

    if (diffDays > 0) return "overdue";
    if (diffDays < 0) return "early";
    return "on_time";
}

// Returns display metadata (label/color) for the tag, built on top of the raw value above
function getSubmissionTiming(record: ReviewTask): { label: string; color: string; bg: string } {
    const value = getSubmissionStatusValue(record);

    if (value === null) {
        return { label: "—", color: "var(--text-muted)", bg: "transparent" };
    }

    if (value === "overdue") {
        const due = dayjs(record.due_date).startOf("day");
        const submitted = dayjs(record.submitted_date).startOf("day");
        const diffDays = submitted.diff(due, "day");
        return {
            label: `Overdue (${diffDays}d)`,
            color: "var(--red)",
            bg: "var(--red-bg)",
        };
    }
    if (value === "early") {
        return { label: "Early", color: "var(--green)", bg: "var(--green-bg)" };
    }
    return { label: "On Time", color: "var(--blue)", bg: "var(--blue-bg)" };
}

function SubmissionTimingTag({ record }: { record: ReviewTask }) {
    const meta = getSubmissionTiming(record);
    if (meta.label === "—") {
        return <span style={{ color: "var(--text-muted)", fontSize: 12 }}>—</span>;
    }
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

export default function Review_Tasks() {
    const [tasks, setTasks] = useState<ReviewTask[]>([]);
    const [loading, setLoading] = useState(true);
    const [search, setSearch] = useState("");

    // Filters
    const [statusFilter, setStatusFilter] = useState<string | undefined>(undefined);
    const [submissionFilter, setSubmissionFilter] = useState<string | undefined>(undefined);
    const [priorityFilter, setPriorityFilter] = useState<string | undefined>(undefined);

    // Approve modal
    const [approveOpen, setApproveOpen] = useState(false);
    const [approveTarget, setApproveTarget] = useState<ReviewTask | null>(null);
    const [approving, setApproving] = useState(false);
    const [approveForm] = Form.useForm();

    // Rework modal
    const [reworkOpen, setReworkOpen] = useState(false);
    const [reworkTarget, setReworkTarget] = useState<ReviewTask | null>(null);
    const [reworking, setReworking] = useState(false);
    const [reworkForm] = Form.useForm();

    const fetchQueue = useCallback(() => {
        setLoading(true);
        fetch(`${BASE_URL}/api/tasks/review_tasks/`, { headers: { ...authHeaders() } })
            .then((r) => r.json())
            .then((d) => setTasks(Array.isArray(d) ? d : d.results || []))
            .catch(() => message.error("Failed to load the review queue"))
            .finally(() => setLoading(false));
    }, []);

    useEffect(() => {
        fetchQueue();
    }, [fetchQueue]);

    const filtered = useMemo(() => {
        return tasks.filter((t) => {
            if (statusFilter && t.task_status !== statusFilter) return false;
            if (submissionFilter && getSubmissionStatusValue(t) !== submissionFilter) return false;
            if (priorityFilter && t.priority !== priorityFilter) return false;
            if (search.trim()) {
                const q = search.toLowerCase();
                if (![t.task_id, t.sub_task_id, t.task_name, t.assigned_to_name].some((f) => f?.toLowerCase().includes(q))) {
                    return false;
                }
            }
            return true;
        });
    }, [tasks, search, statusFilter, submissionFilter, priorityFilter]);

    const submittedCount = tasks.filter((t) => t.task_status === "submitted").length;
    const resubmittedCount = tasks.filter((t) => t.task_status === "resubmitted").length;

    const startReview = async (taskId: number) => {
        await fetch(`${BASE_URL}/api/tasks/${taskId}/review/start/`, {
            method: "POST",
            headers: { ...authHeaders() },
        });
    };
    // ── Approve ──────────────────────────────────────────────────────────────
    const openApprove = async (task: ReviewTask) => {
        approveForm.resetFields();
        setApproveTarget(task);
        setApproveOpen(true);
        await startReview(task.id);   // ← moves submitted/resubmitted → under_review
    };

    const handleApprove = async () => {
        if (!approveTarget) return;
        let values;
        try {
            values = await approveForm.validateFields();
        } catch {
            return;
        }

        const derivedRating = QUALITY_OPTIONS.find(
            (q) => q.value === values.quality_of_task
        )?.rating ?? 1;

        setApproving(true);
        try {
            const res = await fetch(`${BASE_URL}/api/tasks/${approveTarget.id}/review/approve/`, {
                method: "POST",
                headers: { "Content-Type": "application/json", ...authHeaders() },
                body: JSON.stringify({
                    quality_of_task: values.quality_of_task,
                    rating: derivedRating,          // ← comes from the quality picked, not a separate field
                    admin_remarks: values.admin_remarks || "",
                }),
            });
            if (res.ok) {
                message.success("Task approved and marked Completed");
                setApproveOpen(false);
            } else {
                const err = await res.json().catch(() => ({}));
                message.error(JSON.stringify(err) || "Failed to approve task");
            }
        } catch {
            message.error("Network error");
        } finally {
            setApproving(false);
            fetchQueue();
        }
    };

    // ── Request Rework ───────────────────────────────────────────────────────
    const openRework = async (task: ReviewTask) => {
        reworkForm.resetFields();
        setReworkTarget(task);
        setReworkOpen(true);
        await startReview(task.id);   // ← same here

    };

    const handleRework = async () => {
        if (!reworkTarget) return;
        let values;
        try {
            values = await reworkForm.validateFields();
        } catch {
            return;
        }

        setReworking(true);
        try {
            const res = await fetch(`${BASE_URL}/api/tasks/${reworkTarget.id}/review/rework/`, {
                method: "POST",
                headers: { "Content-Type": "application/json", ...authHeaders() },
                body: JSON.stringify({ admin_remarks: values.admin_remarks }),
            });
            if (res.ok) {
                message.success("Sent back for rework");
                setReworkOpen(false);
            } else {
                const err = await res.json().catch(() => ({}));
                message.error(JSON.stringify(err) || "Failed to request rework");
            }
        } catch {
            message.error("Network error");
        } finally {
            setReworking(false);
            fetchQueue();
        }
    };

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

    const columns: ColumnsType<ReviewTask> = [
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
            title: "Sub Task ID",
            dataIndex: "sub_task_id",
            key: "sub_task_id",
            width: 100,
            render: (_: unknown, record: ReviewTask) => (
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
            render: (_: any, record: ReviewTask) => (
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
            render: (v: ReviewStatus) => <StatusTag status={v} />,
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
            render: (_: any, record: ReviewTask) => {
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
            title: "Submission Status",
            key: "submission_timing",
            width: 130,
            render: (_: any, record: ReviewTask) => <SubmissionTimingTag record={record} />,
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
            title: "Submitted",
            dataIndex: "submitted_date",
            key: "submitted_date",
            width: 130,
            render: (v: string | null) => (
                <span style={{ fontSize: 11.5, color: "var(--text-secondary)" }}>
                    {v ? dayjs(v).format("DD MMM, HH:mm") : "—"}
                </span>
            ),
        },
        {
            title: "Task Sheet",
            dataIndex: "task_sheet_link",
            key: "task_sheet_link",
            width: 100,
            render: (v: string) => v ? (
                <a
                    href={v}
                    target="_blank"
                    rel="noreferrer"
                    style={{ fontSize: 11.5, display: "flex", alignItems: "center", gap: 4, color: "var(--blue)", fontWeight: 600 }}
                >
                    <LinkOutlined /> Open
                </a>
            ) : <span style={{ color: "var(--text-muted)", fontSize: 12 }}>—</span>,
        },
        {
            title: "Attachments",
            dataIndex: "attachments",
            key: "attachments",
            width: 220,   // widened a bit since more thumbnails need horizontal room
            render: (files: ReviewTask["attachments"]) =>
                files?.length ? (
                    <Image.PreviewGroup>
                        <div style={{ display: "flex", gap: 4, flexWrap: "wrap", maxWidth: 200 }}>
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
            width: 95,
            render: (v: number) => <span className="td-num" style={{ fontSize: 12 }}>{v}</span>,
        },
        {
            title: "Actions",
            key: "actions",
            width: 150,
            fixed: "right",
            render: (_: any, record: ReviewTask) => (
                <div style={{ display: "flex", gap: 6 }}>
                    <Button
                        size="small"
                        loading={approving && approveTarget?.id === record.id} icon={<CheckCircleOutlined />}
                        onClick={() => openApprove(record)}
                        style={{
                            fontSize: 11, fontWeight: 700, borderRadius: 6,
                            background: "var(--green)", color: "#fff", border: "none",
                        }}
                    >
                        Approve
                    </Button>
                    <Button
                        size="small"
                        loading={approving && approveTarget?.id === record.id} icon={<RollbackOutlined />}
                        onClick={() => openRework(record)}
                        style={{
                            fontSize: 11, fontWeight: 700, borderRadius: 6,
                            color: "var(--red)", background: "var(--red-bg)", borderColor: "var(--red)",
                        }}
                    >
                        Rework
                    </Button>
                </div>
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
                    <h1 style={{ fontSize: 18, fontWeight: 700, margin: 0, color: "var(--accent)" }}>
                        Review Tasks
                    </h1>
                    <p style={{
                        fontSize: 9, color: "var(--text-muted)", margin: "4px 0 0",
                        fontWeight: 500, letterSpacing: "0.04em", textTransform: "uppercase",
                    }}>
                        Approve or send back submitted tasks
                    </p>
                </div>
            </div>

            <div className="db-stat-grid" style={{ gridTemplateColumns: "repeat(3, 1fr)" }}>
                <StatCard
                    label="Submitted"
                    value={submittedCount}
                    changeLabel="Awaiting first review"
                    changeType={submittedCount > 0 ? "down" : "neutral"}
                />
                <StatCard
                    label="Resubmitted"
                    value={resubmittedCount}
                    changeLabel="Sent back after rework"
                    changeType={resubmittedCount > 0 ? "down" : "neutral"}
                />
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
                    placeholder="Status"
                    allowClear
                    value={statusFilter}
                    onChange={setStatusFilter}
                    style={{ width: 160 }}
                    options={(Object.keys(STATUS_META) as ReviewStatus[]).map((s) => ({
                        value: s,
                        label: STATUS_META[s].label,
                    }))}
                />
                <Select
                    placeholder="Priority"
                    allowClear
                    value={priorityFilter}
                    onChange={setPriorityFilter}
                    style={{ width: 150 }}
                    options={PRIORITY_OPTIONS}
                />
                <Select
                    placeholder="Submission status"
                    allowClear
                    value={submissionFilter}
                    onChange={setSubmissionFilter}
                    style={{ width: 170 }}
                    options={SUBMISSION_STATUS_OPTIONS}
                />
                <Button
                    onClick={fetchQueue}
                    icon={<ReloadOutlined />}
                    className="db-card-action"
                    style={{ height: 35, fontSize: 12, fontWeight: 600, display: "flex", alignItems: "center", gap: 6, paddingInline: 14 }}
                >
                    Refresh
                </Button>
                <span style={{ fontSize: 12, color: "var(--text-muted)", marginLeft: "auto" }}>
                    {filtered.length} of {tasks.length} awaiting review
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
                    scroll={{ x: 2820 }}
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

            {/* ── Approve Modal ── */}
            <Modal
                open={approveOpen}
                afterOpenChange={(open) => { if (open) approveForm.resetFields(); }}
                onCancel={() => setApproveOpen(false)}
                onOk={handleApprove}
                confirmLoading={approving}
                title={
                    <span style={{ display: "flex", alignItems: "center", gap: 8 }}>
                        <CheckCircleOutlined style={{ color: "var(--green)" }} /> Approve Task
                    </span>
                }
                okText="Approve & Complete"
                okButtonProps={{ style: { background: "var(--green)", borderColor: "var(--green)" } }}
                width={520}
                centered
                destroyOnHidden
            >
                {approveTarget && (
                    <>
                        <div style={{
                            display: "flex", alignItems: "center", gap: 8, marginBottom: 16,
                            padding: "8px 12px", background: "var(--bg-input)", borderRadius: 8,
                        }}>
                            <span style={{
                                fontSize: 11.5, fontWeight: 700, color: "var(--blue)", background: "var(--blue-bg)",
                                border: "1px solid var(--blue)", padding: "2px 10px", borderRadius: 6,
                            }}>
                                {approveTarget.task_id}
                            </span>
                            <span style={{ fontSize: 13, fontWeight: 600, color: "var(--text-primary)" }}>
                                {approveTarget.task_name}
                            </span>
                        </div>

                        <Form form={approveForm} layout="vertical">
                            <Form.Item
                                label="Quality of Task"
                                name="quality_of_task"
                                rules={[{ required: true, message: "Required" }]}
                            >
                                <Select
                                    placeholder="Select quality"
                                    options={QUALITY_OPTIONS}
                                    optionRender={(option) => {
                                        const item = QUALITY_OPTIONS.find(
                                            (q) => q.value === option.value
                                        );

                                        return (
                                            <div
                                                style={{
                                                    display: "flex",
                                                    alignItems: "center",
                                                    justifyContent: "space-between",
                                                    width: "100%",
                                                }}
                                            >
                                                <span>{item?.label}</span>
                                                <span style={{ color: "#facc15", fontSize: 17, letterSpacing: 2 }}>
                                                    {"★".repeat(item?.rating ?? 0)}
                                                </span>
                                            </div>
                                        );
                                    }}
                                />
                            </Form.Item>
                            <Form.Item label="Admin Remarks" name="admin_remarks">
                                <Input.TextArea rows={3} placeholder="Optional notes for the employee…" />
                            </Form.Item>
                        </Form>
                    </>
                )}
            </Modal>

            {/* ── Rework Modal ── */}
            <Modal
                open={reworkOpen}
                onCancel={() => setReworkOpen(false)}
                onOk={handleRework}
                confirmLoading={reworking}
                title={
                    <span style={{ display: "flex", alignItems: "center", gap: 8 }}>
                        <RollbackOutlined style={{ color: "var(--red)" }} /> Request Rework
                    </span>
                }
                okText="Send Back for Rework"
                okButtonProps={{ danger: true }}
                width={520}
                centered
                destroyOnClose
            >
                {reworkTarget && (
                    <>
                        <div style={{
                            display: "flex", alignItems: "center", gap: 8, marginBottom: 16,
                            padding: "8px 12px", background: "var(--bg-input)", borderRadius: 8,
                        }}>
                            <span style={{
                                fontSize: 11.5, fontWeight: 700, color: "var(--blue)", background: "var(--blue-bg)",
                                border: "1px solid var(--blue)", padding: "2px 10px", borderRadius: 6,
                            }}>
                                {reworkTarget.task_id}
                            </span>
                            <span style={{ fontSize: 13, fontWeight: 600, color: "var(--text-primary)" }}>
                                {reworkTarget.task_name}
                            </span>
                        </div>

                        <Form form={reworkForm} layout="vertical">
                            <Form.Item
                                label="Reason for Rework"
                                name="admin_remarks"
                                rules={[{ required: true, message: "Please explain what needs to change" }]}
                            >
                                <Input.TextArea rows={4} placeholder="Explain what needs to be fixed or redone…" />
                            </Form.Item>
                        </Form>
                    </>
                )}
            </Modal>
        </div>
    );
}