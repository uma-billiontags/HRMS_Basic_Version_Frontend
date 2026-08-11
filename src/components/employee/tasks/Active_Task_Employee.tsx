// User_Tasks.tsx
// Employee dashboard — by default shows only the logged-in employee's OWN
// tasks (via /api/tasks/my_tasks/). The "All Employees" scope still exists
// in the component for reuse elsewhere, but the plain employee route hides
// it and defaults to "mine" so employees never see other people's tasks.
//
// Reused for the TL "My Task" screen via props: forceScope="mine" locks the
// table to the logged-in user's own tasks (self-assigned, whether by an
// Admin, a TL, or the TL themself), hideScopeToggle hides the All/Mine
// picker since there's nothing to toggle, and pageTitle swaps the heading.

import { useEffect, useState, useCallback, useMemo } from "react";
import { Table, Button, Input, Modal, Form, Tooltip, Select, message, Tag } from "antd";
import {
    SearchOutlined, ReloadOutlined, PlayCircleOutlined, PauseCircleOutlined,
    CheckCircleOutlined, LinkOutlined,
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

interface Active_Task_EmployeeProps {
    forceScope?: "mine";        // "My Task" page (TL) passes this to lock the scope
    hideScopeToggle?: boolean;  // and this, to hide the All/Mine picker
    pageTitle?: string;         // heading override
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
    pageTitle = "My Tasks",
}: Active_Task_EmployeeProps) {
    const [tasks, setTasks] = useState<MyTask[]>([]);
    const [loading, setLoading] = useState(true);
    const [search, setSearch] = useState("");
    const [busyTaskId, setBusyTaskId] = useState<number | null>(null);

    // ── The logged-in employee's own id — still used for thea "You" tag and
    // any leftover ownership checks. Fetched once from /api/auth/me/.
    const [myId, setMyId] = useState<number | null>(null);
    const [myIdLoading, setMyIdLoading] = useState(true);

    // ── Defaults to "mine" now — this page only ever shows the employee's
    // own tasks unless a caller explicitly opts into "all" (there's
    // currently no route that does, but the option stays available).
    const [scopeFilter, _setScopeFilter] = useState<ScopeFilter>(forceScope ?? "mine");
    const [statusFilter, setStatusFilter] = useState<string | undefined>(undefined);

    // Whether the employee has ANY active session right now (across all tasks) —
    // used to disable "Start" on every other task of THEIRS, per the
    // flowchart's "Is another task timer active?" guard.
    const [activeTaskId, setActiveTaskId] = useState<number | null>(null);

    // Submit modal
    const [submitOpen, setSubmitOpen] = useState(false);
    const [submitTarget, setSubmitTarget] = useState<MyTask | null>(null);
    const [submitting, setSubmitting] = useState(false);
    const [submitForm] = Form.useForm();

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
        // "mine" -> server-scoped endpoint, so employees never even receive
        // other people's task data over the wire. "all" -> full list (only
        // reachable if a future caller explicitly sets scope to "all").
        const endpoint = scopeFilter === "mine"
            ? `${BASE_URL}/api/tasks/my_tasks/`
            : `${BASE_URL}/api/tasks/get_all_tasks/`;

        fetch(endpoint, { headers: { ...authHeaders() } })
            .then((r) => r.json())
            .then((d) => setTasks(Array.isArray(d) ? d : d.results || []))
            .catch(() => message.error("Failed to load tasks"))
            .finally(() => setLoading(false));
    }, [scopeFilter]);

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

    // ── Ownership check — still correct even now that the table is
    // server-scoped to "mine": every row IS the employee's own task in
    // that mode, so this just naturally evaluates true for all of them.
    const isMine = useCallback(
        (task: MyTask) => myId !== null && task.assigned_to === myId,
        [myId]
    );

    const filtered = useMemo(() => {
        return tasks.filter((t) => {
            if (statusFilter && t.task_status !== statusFilter) return false;
            if (search.trim()) {
                const q = search.toLowerCase();
                const haystack = [t.task_id, t.task_name, t.task_details, t.assigned_to_name];
                if (!haystack.some((f) => f?.toLowerCase().includes(q))) return false;
            }
            return true;
        });
    }, [tasks, search, statusFilter]);

    // ── Stats always reflect the employee's OWN tasks. When scope is
    // "mine" this is just `tasks` itself; kept as a derived filter so it
    // stays correct even if scope is ever switched to "all".
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
    // when the task belongs to the logged-in employee. In "mine" scope
    // (the default here) this is always true; kept as a guard in case the
    // component is ever reused in "all" scope elsewhere.
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
            // "You" tag stays for clarity, and is also correct if this
            // component is ever rendered in "all" scope elsewhere.
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
                        {scopeFilter === "mine"
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
                    placeholder="Search your tasks…"
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
        </div>
    );
}