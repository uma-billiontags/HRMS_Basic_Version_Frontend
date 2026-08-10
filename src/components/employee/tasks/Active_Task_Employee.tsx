// User_Tasks.tsx
// Employee dashboard — shows EVERY task in the system (not just this
// employee's own), same as the admin table. Timer controls (Start / Pause /
// Resume / Submit) and "Request Fix" only render/enable for tasks assigned
// to the logged-in employee — everyone else's tasks are visible but
// read-only. Ownership is determined by comparing task.assigned_to to the
// employee's own id, fetched once from /api/auth/me/.
//
// Reused for the TL "My Task" screen via props: forceScope="mine" locks the
// table to the logged-in user's own tasks (self-assigned, whether by an
// Admin, a TL, or the TL themself), hideScopeToggle hides the All/Mine
// picker since there's nothing to toggle, and pageTitle swaps the heading.

import { useEffect, useState, useCallback, useMemo } from "react";
import { Table, Button, Input, Modal, Form, Tooltip, Select, message, Tag } from "antd";
import {
    SearchOutlined, ReloadOutlined, PlayCircleOutlined, PauseCircleOutlined,
    CheckCircleOutlined, LinkOutlined, UserOutlined,
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

type TaskStatus =
    | "not_started" | "in_progress" | "paused" | "submitted" | "under_review"
    | "rework_needed" | "resubmitted" | "completed" | "on_hold" | "cancelled" | "archived";

interface MyTask {
    id: number;
    task_id: string;
    task_name: string;
    task_details: string;
    assigned_to: number | null;
    assigned_to_name: string | null;
    assigned_by_name: string | null;
    priority: string | null;
    assigned_date: string;
    due_date: string | null;
    allotted_time: number | null;
    task_status: TaskStatus;
    total_time_taken: number;
    remaining_or_over_time: number;
    task_sheet_link: string;
    employee_remarks: string;
    submitted_date: string | null;
    quality_of_task: string;
    rating: number | null;
    admin_remarks: string;
    reviewed_date: string | null;
    rework_count: number;
    has_active_session: boolean;
}

// interface SessionRow {
//     id: number;
//     start_time: string;
//     end_time: string | null;
//     duration_seconds: number | null;
//     is_rework_session: boolean;
// }

interface Active_Task_EmployeeProps {
    forceScope?: "mine";        // "My Task" page passes this to lock the scope
    hideScopeToggle?: boolean;  // and this, to hide the All/Mine picker
    pageTitle?: string;         // "My Task" instead of "All Tasks"
}

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

function StatCard({ label, value }: { label: string; value: number | string }) {
    return (
        <div className="db-stat-card">
            <div className="db-stat-label">{label}</div>
            <div className="db-stat-value">{value}</div>
        </div>
    );
}

// ── Which scope is the table currently showing ──────────────────────────────
type ScopeFilter = "all" | "mine";

export default function Active_Task_Employee({
    forceScope,
    hideScopeToggle = false,
    pageTitle = "All Tasks",
}: Active_Task_EmployeeProps) {
    const [tasks, setTasks] = useState<MyTask[]>([]);
    const [loading, setLoading] = useState(true);
    const [search, setSearch] = useState("");
    const [busyTaskId, setBusyTaskId] = useState<number | null>(null);

    // ── The logged-in employee's own id — everything else compares against
    // this to decide "can I edit this row". Fetched once from /api/auth/me/.
    const [myId, setMyId] = useState<number | null>(null);
    const [myIdLoading, setMyIdLoading] = useState(true);

    const [scopeFilter, setScopeFilter] = useState<ScopeFilter>(forceScope ?? "all");
    const [statusFilter, setStatusFilter] = useState<string | undefined>(undefined);

    // Whether the employee has ANY active session right now (across all tasks) —
    // used to disable "Start" on every other task of THEIRS, per the
    // flowchart's "Is another task timer active?" guard. Irrelevant for
    // tasks that aren't theirs, since those are never actionable anyway.
    const [activeTaskId, setActiveTaskId] = useState<number | null>(null);

    // Submit modal
    const [submitOpen, setSubmitOpen] = useState(false);
    const [submitTarget, setSubmitTarget] = useState<MyTask | null>(null);
    const [submitting, setSubmitting] = useState(false);
    const [submitForm] = Form.useForm();

    // const [correctionOpen, setCorrectionOpen] = useState(false);
    // // const [correctionTarget, setCorrectionTarget] = useState<MyTask | null>(null);
    // // const [correctionSessions, setCorrectionSessions] = useState<SessionRow[]>([]);
    // // const [loadingSessions, setLoadingSessions] = useState(false);
    // const [submittingCorrection, setSubmittingCorrection] = useState(false);
    // const [correctionForm] = Form.useForm();

    const fetchMe = useCallback(() => {
        setMyIdLoading(true);
        fetch(`${BASE_URL}/api/auth/me/`, { headers: { ...authHeaders() } })
            .then((r) => r.json())
            .then((d) => setMyId(d?.id ?? null))
            .catch(() => setMyId(null))
            .finally(() => setMyIdLoading(false));
    }, []);

    const fetchTasks = useCallback(() => {
        setLoading(true);
        // Now returns EVERY task in the system, not just this employee's own —
        // see the get_all_tasks change in tasks/views.py.
        fetch(`${BASE_URL}/api/tasks/get_all_tasks/`, { headers: { ...authHeaders() } })
            .then((r) => r.json())
            .then((d) => setTasks(Array.isArray(d) ? d : d.results || []))
            .catch(() => message.error("Failed to load tasks"))
            .finally(() => setLoading(false));
    }, []);

    const fetchActiveSession = useCallback(() => {
        fetch(`${BASE_URL}/api/tasks/my_active_session/`, { headers: { ...authHeaders() } })
            .then((r) => r.json())
            .then((d) => setActiveTaskId(d?.task ?? null))
            .catch(() => setActiveTaskId(null));
    }, []);

    useEffect(() => {
        fetchMe();
        fetchTasks();
        fetchActiveSession();
    }, [fetchMe, fetchTasks, fetchActiveSession]);

    // ── Ownership check used everywhere actions are gated ──────────────────
    const isMine = useCallback(
        (task: MyTask) => myId !== null && task.assigned_to === myId,
        [myId]
    );

    const filtered = useMemo(() => {
        return tasks.filter((t) => {
            if (scopeFilter === "mine" && !isMine(t)) return false;
            if (statusFilter && t.task_status !== statusFilter) return false;
            if (search.trim()) {
                const q = search.toLowerCase();
                const haystack = [t.task_id, t.task_name, t.task_details, t.assigned_to_name];
                if (!haystack.some((f) => f?.toLowerCase().includes(q))) return false;
            }
            return true;
        });
    }, [tasks, search, scopeFilter, statusFilter, isMine]);

    // ── Stats always reflect the employee's OWN tasks, regardless of the
    // table's current scope filter — these are meant to answer "how am I
    // doing", not "how is everyone doing".
    const myTasks = useMemo(() => tasks.filter(isMine), [tasks, isMine]);
    const totalTasks = myTasks.length;
    const inProgress = myTasks.filter((t) => t.task_status === "in_progress").length;
    const completed = myTasks.filter((t) => t.task_status === "completed").length;
    const reworkNeeded = myTasks.filter((t) => t.task_status === "rework_needed").length;

    // ── Timer actions ────────────────────────────────────────────────────────
    async function callTimerAction(task: MyTask, action: "start" | "pause" | "resume") {
        setBusyTaskId(task.id);
        try {
            const res = await fetch(`${BASE_URL}/api/tasks/${task.id}/${action}/`, {
                method: "POST",
                headers: { "Content-Type": "application/json", ...authHeaders() },
            });
            if (!res.ok) {
                const err = await res.json().catch(() => ({}));
                message.error(err.detail || `Failed to ${action} task`);
            }
        } catch {
            message.error("Network error");
        } finally {
            // Always refetch, success or failure — the backend can partially
            // apply a change (e.g. status updated) even when it returns an error,
            // so trusting only the "success" branch leaves the UI stale.
            fetchTasks();
            fetchActiveSession();
            setBusyTaskId(null);
        }
    }

    const openSubmit = (task: MyTask) => {
        setSubmitTarget(task);
        submitForm.resetFields();
        submitForm.setFieldsValue({
            task_sheet_link: task.task_sheet_link || "",
            employee_remarks: task.employee_remarks || "",
        });
        setSubmitOpen(true);
    };

    const handleSubmitTask = async () => {
        if (!submitTarget) return;
        let values;
        try {
            values = await submitForm.validateFields();
        } catch {
            return;
        }

        setSubmitting(true);
        try {
            const res = await fetch(`${BASE_URL}/api/tasks/${submitTarget.id}/submit/`, {
                method: "POST",
                headers: { "Content-Type": "application/json", ...authHeaders() },
                body: JSON.stringify({
                    task_sheet_link: values.task_sheet_link,
                    employee_remarks: values.employee_remarks || "",
                }),
            });
            if (res.ok) {
                message.success("Task submitted");
                setSubmitOpen(false);
            } else {
                const err = await res.json().catch(() => ({}));
                message.error(JSON.stringify(err) || "Failed to submit task");
            }
        } catch {
            message.error("Network error");
        } finally {
            fetchTasks();
            fetchActiveSession();
            setSubmitting(false);
        }
    };

    // ── Timer action buttons for a row — only rendered with real controls
    // when the task belongs to the logged-in employee. Everyone else's
    // tasks show a muted "View only" tag instead, no matter the status.
    function TimerActions({ task }: { task: MyTask }) {
        if (!isMine(task)) {
            return <span style={{ fontSize: 11, color: "var(--text-muted)" }}>View only</span>;
        }

        const busy = busyTaskId === task.id;
        const anotherTaskActive = activeTaskId !== null && activeTaskId !== task.id;

        if (task.task_status === "not_started") {
            return (
                <Tooltip title={anotherTaskActive ? "Pause or submit your active task first" : ""}>
                    <Button
                        size="small" loading={busy} disabled={anotherTaskActive}
                        icon={<PlayCircleOutlined />} onClick={() => callTimerAction(task, "start")}
                        style={{ fontSize: 11, fontWeight: 600, borderRadius: 6 }}
                    >
                        Start
                    </Button>
                </Tooltip>
            );
        }
        if (task.task_status === "in_progress") {
            return (
                <div style={{ display: "flex", gap: 6 }}>
                    <Button
                        size="small" loading={busy} icon={<PauseCircleOutlined />}
                        onClick={() => callTimerAction(task, "pause")}
                        style={{ fontSize: 11, fontWeight: 600, borderRadius: 6 }}
                    >
                        Pause
                    </Button>
                    <Button
                        size="small" loading={busy} icon={<CheckCircleOutlined />}
                        onClick={() => openSubmit(task)}
                        style={{
                            fontSize: 11, fontWeight: 600, borderRadius: 6,
                            background: "var(--accent)", color: "#fff", border: "none",
                        }}
                    >
                        Submit
                    </Button>
                </div>
            );
        }
        if (task.task_status === "paused" || task.task_status === "rework_needed") {
            return (
                <div style={{ display: "flex", gap: 6 }}>
                    <Tooltip title={anotherTaskActive ? "Pause or submit your active task first" : ""}>
                        <Button
                            size="small" loading={busy} disabled={anotherTaskActive}
                            icon={<PlayCircleOutlined />} onClick={() => callTimerAction(task, "resume")}
                            style={{ fontSize: 11, fontWeight: 600, borderRadius: 6 }}
                        >
                            Resume
                        </Button>
                    </Tooltip>
                    <Button
                        size="small" icon={<CheckCircleOutlined />} onClick={() => openSubmit(task)}
                        style={{
                            fontSize: 11, fontWeight: 600, borderRadius: 6,
                            background: "var(--accent)", color: "#fff", border: "none",
                        }}
                    >
                        Submit
                    </Button>
                </div>
            );
        }
        // submitted / under_review / resubmitted / completed / on_hold / cancelled / archived
        return <span style={{ fontSize: 11, color: "var(--text-muted)" }}>No action</span>;
    }

    // const openCorrection = async (task: MyTask) => {
    //     if (!isMine(task)) return; // guard — button is disabled for others anyway
    //     setCorrectionTarget(task);
    //     setCorrectionOpen(true);
    //     setLoadingSessions(true);
    //     correctionForm.resetFields();
    //     try {
    //         const res = await fetch(`${BASE_URL}/api/tasks/${task.id}/sessions/`, {
    //             headers: { ...authHeaders() },
    //         });
    //         const data = await res.json();
    //         // Only closed sessions can be corrected — an open one isn't "wrong" yet.
    //         setCorrectionSessions((Array.isArray(data) ? data : []).filter((s: SessionRow) => s.end_time));
    //     } catch {
    //         message.error("Failed to load session history");
    //         setCorrectionSessions([]);
    //     } finally {
    //         setLoadingSessions(false);
    //     }
    // };

    // const handleCorrectionSubmit = async () => {
    //     let values;
    //     try {
    //         values = await correctionForm.validateFields();
    //     } catch {
    //         return;
    //     }

    //     setSubmittingCorrection(true);
    //     try {
    //         const res = await fetch(`${BASE_URL}/api/tasks/sessions/${values.session_id}/correction-request/`, {
    //             method: "POST",
    //             headers: { "Content-Type": "application/json", ...authHeaders() },
    //             body: JSON.stringify({
    //                 reason: values.reason,
    //                 requested_end_time: values.requested_end_time.toISOString(),
    //             }),
    //         });
    //         if (res.ok) {
    //             message.success("Correction request sent for admin review");
    //             setCorrectionOpen(false);
    //         } else {
    //             const err = await res.json().catch(() => ({}));
    //             message.error(err.detail || "Failed to submit correction request");
    //         }
    //     } catch {
    //         message.error("Network error");
    //     } finally {
    //         setSubmittingCorrection(false);
    //     }
    // };

    // ── Full Excel-style column set ──────────────────────────────────────────
    const columns: ColumnsType<MyTask> = [
        {
            title: "Task ID", dataIndex: "task_id", key: "task_id", width: 95, fixed: "left",
            render: (v: string) => <span style={{ fontSize: 11.5, fontWeight: 700, color: "var(--blue)", background: "var(--blue-bg)", border: "1px solid var(--blue)", padding: "2px 10px", borderRadius: 6, whiteSpace: "nowrap", }}>{v}</span>,
        },
        {
            title: "Task Name", dataIndex: "task_name", key: "task_name", width: 180, fixed: "left",
            render: (v: string) => <span style={{ fontSize: 12.5, fontWeight: 600 }}>{v}</span>,
        },
        {
            title: "Task Details", dataIndex: "task_details", key: "task_details", width: 220,
            render: (v: string) => (
                <div style={{
                    fontSize: 11.5, color: "var(--text-secondary)", maxWidth: 220,
                    overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
                }} title={v}>
                    {v || "—"}
                </div>
            ),
        },
        {
            // ── who this task belongs to, with a "You" tag when it's the
            // logged-in employee's own task — this is what makes the
            // "all tasks visible, only yours editable" rule legible at a
            // glance instead of only showing up via disabled buttons.
            title: "Assigned To", dataIndex: "assigned_to_name", key: "assigned_to_name", width: 150,
            render: (v: string | null, record: MyTask) => (
                <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                    <span style={{ fontSize: 12.5, fontWeight: 600 }}>{v ?? "Unassigned"}</span>
                    {isMine(record) && (
                        <Tag color="green" style={{ fontSize: 9.5, fontWeight: 700, margin: 0, lineHeight: "16px" }}>
                            You
                        </Tag>
                    )}
                </div>
            ),
        },
        {
            title: "Assigned By", dataIndex: "assigned_by_name", key: "assigned_by_name", width: 110,
            render: (v: string | null) => <span style={{ fontSize: 12 }}>{v ?? "—"}</span>,
        },
        {
            title: "Priority", dataIndex: "priority", key: "priority", width: 95,
            render: (v: string | null) => <PriorityTag priority={v} />,
        },
        {
            title: "Assigned Date", dataIndex: "assigned_date", key: "assigned_date", width: 110,
            render: (v: string) => <span style={{ fontSize: 11.5 }}>{dayjs(v).format("DD MMM YYYY")}</span>,
        },
        {
            title: "Due Date", dataIndex: "due_date", key: "due_date", width: 110,
            render: (v: string | null) => (
                <span style={{ fontSize: 11.5, color: "var(--text-secondary)" }}>
                    {v ? dayjs(v).format("DD MMM YYYY") : "—"}
                </span>
            ),
        },
        {
            title: "Allotted (hrs)", dataIndex: "allotted_time", key: "allotted_time", width: 100,
            render: (v: number | null) => <span className="td-num" style={{ fontSize: 12 }}>{v ?? "—"}</span>,
        },
        {
            title: "Status", dataIndex: "task_status", key: "task_status", width: 125,
            render: (v: TaskStatus) => <StatusTag status={v} />,
        },
        {
            title: "Total Time (hrs)", dataIndex: "total_time_taken", key: "total_time_taken", width: 115,
            render: (v: number) => <span className="td-num" style={{ fontSize: 12 }}>{v}</span>,
        },
        {
            title: "Remaining/Over (hrs)", dataIndex: "remaining_or_over_time", key: "remaining_or_over_time", width: 130,
            render: (v: number) => (
                <span className={v < 0 ? "td-down" : "td-up"} style={{ fontSize: 12 }}>
                    {v < 0 ? `+${Math.abs(v)} over` : v}
                </span>
            ),
        },
        {
            title: "Task Sheet Link", dataIndex: "task_sheet_link", key: "task_sheet_link", width: 140,
            render: (v: string) => v ? (
                <a href={v} target="_blank" rel="noreferrer" style={{ fontSize: 11.5, display: "flex", alignItems: "center", gap: 4 }}>
                    <LinkOutlined /> Open
                </a>
            ) : <span style={{ color: "var(--text-muted)", fontSize: 12 }}>—</span>,
        },
        {
            title: "Quality", dataIndex: "quality_of_task", key: "quality_of_task", width: 110,
            render: (v: string) => <span style={{ fontSize: 11.5, textTransform: "capitalize" }}>{v ? v.replace(/_/g, " ") : "—"}</span>,
        },
        {
            title: "Rating", dataIndex: "rating", key: "rating", width: 80,
            render: (v: number | null) => <span style={{ fontSize: 12 }}>{v ? `${v}/5` : "—"}</span>,
        },
        {
            title: "Employee Remarks", dataIndex: "employee_remarks", key: "employee_remarks", width: 160,
            render: (v: string) => (
                <div style={{ fontSize: 11.5, color: "var(--text-secondary)", maxWidth: 160, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }} title={v}>
                    {v || "—"}
                </div>
            ),
        },
        {
            title: "Admin Remarks", dataIndex: "admin_remarks", key: "admin_remarks", width: 160,
            render: (v: string) => (
                <div style={{ fontSize: 11.5, color: "var(--text-secondary)", maxWidth: 160, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }} title={v}>
                    {v || "—"}
                </div>
            ),
        },
        {
            title: "Submitted Date", dataIndex: "submitted_date", key: "submitted_date", width: 130,
            render: (v: string | null) => <span style={{ fontSize: 11.5 }}>{v ? dayjs(v).format("DD MMM, HH:mm") : "—"}</span>,
        },
        {
            title: "Reviewed Date", dataIndex: "reviewed_date", key: "reviewed_date", width: 130,
            render: (v: string | null) => <span style={{ fontSize: 11.5 }}>{v ? dayjs(v).format("DD MMM, HH:mm") : "—"}</span>,
        },
        {
            title: "Rework Count", dataIndex: "rework_count", key: "rework_count", width: 95,
            render: (v: number) => <span className="td-num" style={{ fontSize: 12 }}>{v}</span>,
        },
        // {
        //     title: "Time Correction", key: "correction", width: 130,
        //     render: (_: any, record: MyTask) => (
        //         <Button
        //             size="small"
        //             onClick={() => openCorrection(record)}
        //             disabled={!isMine(record) || record.total_time_taken === 0}
        //             style={{ fontSize: 11, fontWeight: 600, borderRadius: 6 }}
        //         >
        //             Request Fix
        //         </Button>
        //     ),
        // },
        {
            title: "Actions", key: "actions", width: 190, fixed: "right",
            render: (_: any, record: MyTask) => <TimerActions task={record} />,
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
                        {pageTitle}
                    </h1>
                    <p style={{
                        fontSize: 9, color: "var(--text-muted)", margin: "4px 0 0",
                        fontWeight: 500, letterSpacing: "0.04em", textTransform: "uppercase",
                    }}>
                        {forceScope === "mine"
                            ? "Tasks assigned to you — start, pause, resume, or submit"
                            : "Everyone's work — you can only start, pause, resume, or submit your own"}
                    </p>
                </div>
            </div>

            <div className="db-stat-grid">
                <StatCard label="My Total Tasks" value={totalTasks} />
                <StatCard label="My In Progress" value={inProgress} />
                <StatCard label="My Completed" value={completed} />
                <StatCard label="My Rework Needed" value={reworkNeeded} />
            </div>

            <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 20, flexWrap: "wrap" }}>
                <Input
                    placeholder="Search all tasks…"
                    prefix={<SearchOutlined style={{ color: "var(--text-muted)" }} />}
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    allowClear
                    style={{
                        flex: 1, minWidth: 220, maxWidth: 400, height: 35, padding: "0 14px",
                        background: "var(--bg-input)", border: "1px solid var(--accent-light)",
                        borderRadius: 9, fontSize: 13,
                    }}
                />
                {!hideScopeToggle && (
                    <Select
                        value={scopeFilter}
                        onChange={setScopeFilter}
                        style={{ width: 160 }}
                        options={[
                            { value: "all", label: "All Employees" },
                            { value: "mine", label: "My Tasks Only" },
                        ]}
                        suffixIcon={<UserOutlined />}
                    />
                )}
                <Select
                    placeholder="Status"
                    allowClear
                    value={statusFilter}
                    onChange={setStatusFilter}
                    style={{ width: 170 }}
                    options={Object.entries(STATUS_META).map(([value, meta]) => ({ value, label: meta.label }))}
                />
                <Button
                    onClick={() => { fetchTasks(); fetchActiveSession(); }}
                    icon={<ReloadOutlined />}
                    className="db-card-action"
                    style={{ height: 35, fontSize: 12, fontWeight: 600, display: "flex", alignItems: "center", gap: 6, paddingInline: 14 }}
                >
                    Refresh
                </Button>
                <span style={{ fontSize: 12, color: "var(--text-muted)", marginLeft: "auto" }}>
                    {filtered.length} of {tasks.length} tasks
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
                    scroll={{ x: 2500 }}
                    loading={loading || myIdLoading}
                    pagination={{
                        pageSize: 10, showSizeChanger: true, pageSizeOptions: ["10", "20", "50"],
                        showTotal: (total, range) => `${range[0]}–${range[1]} of ${total} tasks`,
                        style: { padding: "12px 16px" },
                    }}
                    // Subtly highlight the employee's own rows so "all tasks,
                    // yours are editable" reads visually, not just via the tag.
                    rowClassName={(record) => `client-table-row${isMine(record) ? " own-task-row" : ""}`}
                    style={{ fontSize: 13 }}
                />
            </div>

            <Modal
                open={submitOpen}
                onCancel={() => setSubmitOpen(false)}
                onOk={handleSubmitTask}
                confirmLoading={submitting}
                title="Submit Task"
                okText="Submit"
                width={520}
                centered
                destroyOnClose
            >
                {submitTarget && (
                    <Form form={submitForm} layout="vertical">
                        <Form.Item
                            label="Task Sheet Link"
                            name="task_sheet_link"
                            rules={[{ required: true, message: "Required" }]}
                        >
                            <Input placeholder="Paste your work link here" />
                        </Form.Item>
                        <Form.Item label="Remarks" name="employee_remarks">
                            <Input.TextArea rows={3} placeholder="Anything the reviewer should know…" />
                        </Form.Item>
                    </Form>
                )}
            </Modal>

            {/* <Modal
                open={correctionOpen}
                onCancel={() => setCorrectionOpen(false)}
                onOk={handleCorrectionSubmit}
                confirmLoading={submittingCorrection}
                title="Request Time Correction"
                okText="Submit Request"
                width={520}
                centered
                destroyOnClose
            >
                {correctionTarget && (
                    <Form form={correctionForm} layout="vertical">
                        <Form.Item
                            label="Which session was incorrect?"
                            name="session_id"
                            rules={[{ required: true, message: "Required" }]}
                        >
                            <Select
                                placeholder={loadingSessions ? "Loading sessions…" : "Select a session"}
                                loading={loadingSessions}
                                options={correctionSessions.map((s) => ({
                                    value: s.id,
                                    label: `${dayjs(s.start_time).format("DD MMM, HH:mm")} → ${dayjs(s.end_time).format("HH:mm")} (${Math.round((s.duration_seconds ?? 0) / 60)} min)${s.is_rework_session ? " · rework" : ""}`,
                                }))}
                            />
                        </Form.Item>
                        <Form.Item
                            label="Corrected End Time"
                            name="requested_end_time"
                            rules={[{ required: true, message: "Required" }]}
                        >
                            <DatePicker showTime format="DD MMM YYYY, HH:mm" style={{ width: "100%" }} />
                        </Form.Item>
                        <Form.Item
                            label="Reason"
                            name="reason"
                            rules={[{ required: true, message: "Please explain what went wrong" }]}
                        >
                            <Input.TextArea rows={3} placeholder="e.g. Forgot to pause before lunch" />
                        </Form.Item>
                    </Form>
                )}
            </Modal> */}
        </div>
    );
}