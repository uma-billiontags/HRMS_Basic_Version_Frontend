import { useEffect, useState, useCallback, useMemo } from "react";
import { Table, Button, Input, Modal, Form, Tooltip, Select, message, Image, Upload, Tag } from "antd";
import {
    SearchOutlined, ReloadOutlined, PlayCircleOutlined, PauseCircleOutlined,
    CheckCircleOutlined, LinkOutlined, UploadOutlined, SortAscendingOutlined, SortDescendingOutlined,
    CoffeeOutlined
} from "@ant-design/icons";
import type { ColumnsType } from "antd/es/table";
import type { UploadFile } from "antd";
import dayjs from "dayjs";
import PauseTaskModal from "../../../employee/tasks/PauseTaskModal";

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

interface AdminTask {
    id: number;
    task_id: string;
    sub_task_id: string | null;
    project_name: string | null;
    task_name: string;
    task_details: string;
    assigned_by_name: string | null;
    priority: string | null;
    assigned_date: string;
    due_date: string | null;
    due_time: string | null;  // <-- ADD THIS
    allotted_time: number | null;
    task_status: TaskStatus;
    total_time_taken: number;
    remaining_or_over_time: number;
    task_sheet_link: string;
    employee_remarks: string;
    submitted_date: string | null;
    admin_remarks: string;
    reviewed_date: string | null;
    rework_count: number;
    has_active_session: boolean;
    attachments: { id: number; file: string; uploaded_at: string }[];
}
 
interface ActivePause {
    id: number;
    task: number;
    task_name: string;
    pause_type: "break" | "another_reason";
    break_option: string;
    break_duration_minutes: number | null;
    reason: string;
    start_time: string;
}

function formatBreakTime(remainingSecs: number): string {
    const isOver = remainingSecs < 0;
    const abs = Math.abs(remainingSecs);
    const m = Math.floor(abs / 60);
    const s = abs % 60;
    const formatted = `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
    return isOver ? `${formatted} (Exceeded)` : `${formatted} remaining`;
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

const PRIORITY_OPTIONS = [
    { value: "low", label: "Low" },
    { value: "medium", label: "Medium" },
    { value: "high", label: "High" },
    { value: "urgent", label: "Urgent" },
];

const TERMINAL_STATUSES: TaskStatus[] = ["completed", "cancelled"];

function StatusTag({ status }: { status: TaskStatus }) {
    const meta = STATUS_META[status] ?? STATUS_META.not_started;
    return (
        <span style={{ fontSize: 10.5, fontWeight: 700, padding: "3px 9px", borderRadius: 10, color: meta.color, background: meta.bg, whiteSpace: "nowrap" }}>
            {meta.label}
        </span>
    );
}

function PriorityTag({ priority }: { priority: string | null }) {
    if (!priority) return <span style={{ color: "var(--text-muted)", fontSize: 12 }}>—</span>;
    const meta = PRIORITY_COLOR[priority] ?? { color: "var(--text-secondary)", bg: "var(--bg-input)" };
    return (
        <span style={{ fontSize: 10.5, fontWeight: 700, padding: "3px 9px", borderRadius: 10, color: meta.color, background: meta.bg, textTransform: "capitalize", whiteSpace: "nowrap" }}>
            {priority}
        </span>
    );
}

function DaysToGoTag({ dueDate, status }: { dueDate: string | null; status: TaskStatus }) {
    if (!dueDate || TERMINAL_STATUSES.includes(status)) {
        return <span style={{ color: "var(--text-muted)", fontSize: 12 }}>—</span>;
    }
    const days = dayjs(dueDate).startOf("day").diff(dayjs().startOf("day"), "day");
    if (days < 0) {
        return <span style={{ fontSize: 11, fontWeight: 700, color: "var(--red)", background: "var(--red-bg)", border: "1px solid var(--red)", padding: "2px 10px", borderRadius: 6, whiteSpace: "nowrap" }}>Overdue by {Math.abs(days)} {Math.abs(days) === 1 ? "day" : "days"}</span>;
    }
    if (days === 0) {
        return <span style={{ fontSize: 11, fontWeight: 700, color: "var(--amber)", background: "var(--amber-bg)", border: "1px solid var(--amber)", padding: "2px 10px", borderRadius: 6, whiteSpace: "nowrap" }}>Due today</span>;
    }
    return <span style={{ fontSize: 11, fontWeight: 700, color: "var(--green)", background: "var(--green-bg)", border: "1px solid var(--green)", padding: "2px 10px", borderRadius: 6, whiteSpace: "nowrap" }}>{days} {days === 1 ? "day" : "days"} to go</span>;
}

function StatCard({ label, value }: { label: string; value: number | string }) {
    return (
        <div className="db-stat-card">
            <div className="db-stat-label">{label}</div>
            <div className="db-stat-value">{value}</div>
        </div>
    );
}

export default function My_Task_Admin() {
    const [tasks, setTasks] = useState<AdminTask[]>([]);
    const [loading, setLoading] = useState(true);
    const [search, setSearch] = useState("");
    const [statusFilter, setStatusFilter] = useState<string | undefined>(undefined);
    const [priorityFilter, setPriorityFilter] = useState<string | undefined>(undefined);
    const [busyTaskId, setBusyTaskId] = useState<number | null>(null);
    const [activeTaskId, setActiveTaskId] = useState<number | null>(null);
    const [activePause, setActivePause] = useState<ActivePause | null>(null);
    const [breakRemaining, setBreakRemaining] = useState<number>(0);

    // Pause modal
    const [pauseOpen, setPauseOpen] = useState(false);
    const [pauseTarget, setPauseTarget] = useState<AdminTask | null>(null);

    const [submitOpen, setSubmitOpen] = useState(false);
    const [submitTarget, setSubmitTarget] = useState<AdminTask | null>(null);
    const [submitting, setSubmitting] = useState(false);
    const [submitForm] = Form.useForm();
    const [attachments, setAttachments] = useState<UploadFile[]>([]);

    const fetchTasks = useCallback(() => {
        setLoading(true);
        fetch(`${BASE_URL}/api/tasks/admin_my_tasks/`, { headers: { ...authHeaders() } })
            .then((r) => r.json())
            .then((d) => {
                const all: AdminTask[] = Array.isArray(d) ? d : d.results || [];
                setTasks(all.filter((t) => t.task_status !== "completed"));
            })
            .catch(() => message.error("Failed to load your tasks"))
            .finally(() => setLoading(false));
    }, []);

    const fetchActiveSession = useCallback(() => {
        fetch(`${BASE_URL}/api/tasks/my_active_session/`, { headers: { ...authHeaders() } })
            .then((r) => r.json())
            .then((d) => {
                setActiveTaskId(d?.active ? d.task : null);
                setActivePause(d?.active_pause ?? null);
            })
            .catch(() => {
                setActiveTaskId(null);
                setActivePause(null);
            });
    }, []);

    useEffect(() => {
        if (!activePause) return;
        const update = () => {
            const passedSecs = dayjs().diff(dayjs(activePause.start_time), "second");
            if (activePause.break_duration_minutes) {
                const totalSecs = activePause.break_duration_minutes * 60;
                setBreakRemaining(totalSecs - passedSecs);
            } else {
                setBreakRemaining(-passedSecs);
            }
        };
        update();
        const interval = window.setInterval(update, 1000);
        return () => window.clearInterval(interval);
    }, [activePause]);

    function isValidHttpUrl(str: string): boolean {
        try {
            const url = new URL(str.trim());
            return url.protocol === "http:" || url.protocol === "https:";
        } catch {
            return false;
        }
    }

    useEffect(() => { fetchTasks(); fetchActiveSession(); }, [fetchTasks, fetchActiveSession]);

    const filtered = useMemo(() => {
        return tasks
            .filter((t) => {
                if (statusFilter && t.task_status !== statusFilter) return false;
                if (priorityFilter && t.priority !== priorityFilter) return false;
                if (search.trim()) {
                    const q = search.toLowerCase();
                    const haystack = [t.task_id, t.sub_task_id, t.project_name, t.task_name, t.task_details];
                    if (!haystack.some((f) => f?.toLowerCase().includes(q))) return false;
                }
                return true;
            })
            .sort((a, b) => {
                if (!a.due_date && !b.due_date) return a.id - b.id;
                if (!a.due_date) return 1;
                if (!b.due_date) return -1;

                const timeA = a.due_time || "23:59:59";
                const timeB = b.due_time || "23:59:59";

                const dateTimeA = dayjs(`${a.due_date} ${timeA}`).valueOf();
                const dateTimeB = dayjs(`${b.due_date} ${timeB}`).valueOf();

                const diff = dateTimeA - dateTimeB;
                return diff !== 0 ? diff : a.id - b.id;
            });
    }, [tasks, search, statusFilter, priorityFilter]);

    const totalTasks = tasks.length;
    const inProgress = tasks.filter((t) => t.task_status === "in_progress").length;
    const reworkNeeded = tasks.filter((t) => t.task_status === "rework_needed").length;
    const overdueCount = tasks.filter((t) => {
        if (!t.due_date || TERMINAL_STATUSES.includes(t.task_status)) return false;
        return dayjs(t.due_date).startOf("day").isBefore(dayjs().startOf("day"));
    }).length;

    async function callTimerAction(task: AdminTask, action: "start" | "pause" | "resume") {
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

    const openSubmit = (task: AdminTask) => {
        setSubmitTarget(task);
        submitForm.resetFields();
        submitForm.setFieldsValue({
            task_sheet_link: task.task_sheet_link || "",
            employee_remarks: task.employee_remarks || "",
        });
        setAttachments([]);
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

        const formData = new FormData();
        formData.append("task_sheet_link", values.task_sheet_link.trim());
        formData.append("employee_remarks", values.employee_remarks || "");
        attachments.forEach((f) => {
            if (f.originFileObj) formData.append("attachments", f.originFileObj);
        });

        setSubmitting(true);
        try {
            const res = await fetch(`${BASE_URL}/api/tasks/${submitTarget.id}/submit/`, {
                method: "POST",
                headers: { ...authHeaders() },
                body: formData,
            });
            if (res.ok) {
                message.success("Task submitted");
                setSubmitOpen(false);
                setAttachments([]);
            } else {
                const err = await res.json().catch(() => null);
                message.error(err?.detail || (err && Object.keys(err).length > 0 ? JSON.stringify(err) : "Failed to submit task"));
            }
        } catch {
            message.error("Network error");
        } finally {
            fetchTasks();
            fetchActiveSession();
            setSubmitting(false);
        }
    };

    function TimerActions({ task }: { task: AdminTask }) {
        const busy = busyTaskId === task.id;
        const anotherTaskActive = activeTaskId !== null && activeTaskId !== task.id;

        if (task.task_status === "not_started") {
            return (
                <Tooltip title={anotherTaskActive ? "Pause or submit your active task first" : ""}>
                    <Button size="small" loading={busy} disabled={anotherTaskActive} icon={<PlayCircleOutlined />} onClick={() => callTimerAction(task, "start")} style={{ fontSize: 11, fontWeight: 600, borderRadius: 6 }}>
                        Start
                    </Button>
                </Tooltip>
            );
        }
        if (task.task_status === "in_progress") {
            return (
                <div style={{ display: "flex", gap: 6 }}>
                    <Button
                        size="small"
                        loading={busy}
                        icon={<PauseCircleOutlined />}
                        onClick={() => {
                            setPauseTarget(task);
                            setPauseOpen(true);
                        }}
                        style={{ fontSize: 11, fontWeight: 600, borderRadius: 6 }}
                    >
                        Pause
                    </Button>
                    <Button size="small" loading={busy} icon={<CheckCircleOutlined />} onClick={() => openSubmit(task)} style={{ fontSize: 11, fontWeight: 600, borderRadius: 6, background: "var(--accent)", color: "#fff", border: "none" }}>Submit</Button>
                </div>
            );
        }
        if (task.task_status === "paused" || task.task_status === "rework_needed") {
            const isThisTaskOnBreak = activePause !== null && activePause.task === task.id;
            return (
                <div style={{ display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap" }}>
                    <Tooltip title={anotherTaskActive ? "Pause or submit your active task first" : ""}>
                        <Button size="small" loading={busy} disabled={anotherTaskActive} icon={<PlayCircleOutlined />} onClick={() => callTimerAction(task, "resume")} style={{ fontSize: 11, fontWeight: 600, borderRadius: 6 }}>Resume</Button>
                    </Tooltip>
                    {isThisTaskOnBreak && (
                        <Tag
                            color={breakRemaining < 0 ? "error" : "warning"}
                            icon={activePause?.pause_type === "break" ? <CoffeeOutlined /> : <PauseCircleOutlined />}
                            style={{ margin: 0, fontWeight: 600, fontSize: 11, borderRadius: 6 }}
                        >
                            {activePause?.pause_type === "break" ? formatBreakTime(breakRemaining) : "Paused"}
                        </Tag>
                    )}
                    <Button size="small" icon={<CheckCircleOutlined />} onClick={() => openSubmit(task)} style={{ fontSize: 11, fontWeight: 600, borderRadius: 6, background: "var(--accent)", color: "#fff", border: "none" }}>Submit</Button>
                </div>
            );
        }
        return <span style={{ fontSize: 11, color: "var(--text-muted)" }}>No action</span>;
    }

    function resolveFileUrl(path: string): string {
        if (/^https?:\/\//i.test(path)) return path;
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

    const columns: ColumnsType<AdminTask> = [
        {
            title: "Task ID", dataIndex: "task_id", key: "task_id", width: 100, render: (v: string) => (
                <span style={{ fontSize: 11.5, fontWeight: 700, color: "var(--blue)", background: "var(--blue-bg)", border: "1px solid var(--blue)", padding: "2px 10px", borderRadius: 6, whiteSpace: "nowrap" }}>{v}</span>
            )
        },
        {
            title: "Sub Task ID",
            dataIndex: "sub_task_id",
            key: "sub_task_id",
            width: 100,
            render: (_: unknown, record: AdminTask) => (
                <div style={{ display: "flex", flexDirection: "column", gap: 3 }}>
                    <span style={{ fontSize: 11, fontWeight: 700, color: "var(--green)", background: "var(--green-bg)", border: "1px solid var(--green)", padding: "2px 10px", borderRadius: 6, whiteSpace: "nowrap", width: "fit-content" }}>
                        {record.sub_task_id ? record.sub_task_id : "—"}
                    </span>
                </div>
            ),
        },
        {
            title: "Project Name", dataIndex: "project_name", key: "project_name", width: 120, render: (v: string | null) => (
                v ? <span style={{ fontSize: 12.5, fontWeight: 600 }}>{v}</span> : <span style={{ color: "var(--text-muted)", fontSize: 12 }}>—</span>
            )
        },
        { title: "Task Name", dataIndex: "task_name", key: "task_name", width: 180, fixed: "left", render: (v: string) => <span style={{ fontSize: 12.5, fontWeight: 600 }}>{v}</span> },
        {
            title: "Task Details",
            dataIndex: "task_details",
            key: "task_details",
            width: 280,
            render: (v: string) => (
                <div
                    style={{
                        fontSize: 11.5,
                        color: "var(--text-secondary)",
                        whiteSpace: "normal",
                        wordBreak: "break-word",
                        lineHeight: 1.4,
                    }}
                >
                    {v || "—"}
                </div>
            ),
        },
        { title: "Assigned By (TL)", dataIndex: "assigned_by_name", key: "assigned_by_name", width: 130, render: (v: string | null) => <span style={{ fontSize: 12, color: "var(--text-secondary)" }}>{v ?? "—"}</span> },
        { title: "Priority", dataIndex: "priority", key: "priority", width: 100, render: (v: string | null) => <PriorityTag priority={v} /> },
        { title: "Status", dataIndex: "task_status", key: "task_status", width: 130, render: (v: TaskStatus) => <StatusTag status={v} /> },
        { title: "Allotted Time", dataIndex: "allotted_time", key: "allotted_time", width: 110, render: (v: number | null) => <span className="td-num" style={{ fontSize: 12 }}>{formatAllottedTime(v)}</span> },
        {
            title: "Time Taken", key: "time", width: 110, render: (_: any, record: AdminTask) => {
                const isOver = record.allotted_time != null && record.total_time_taken > record.allotted_time;
                return <span className="td-num" style={{ fontSize: 12, color: isOver ? "var(--red)" : undefined, fontWeight: isOver ? 700 : undefined }}>{formatAllottedTime(record.total_time_taken)}</span>;
            }
        },
        {
            title: "Remaining/Over Time", dataIndex: "remaining_or_over_time", key: "remaining_or_over_time", width: 150, render: (v: number) => (
                <span className={v < 0 ? "td-down" : "td-up"} style={{ fontSize: 12 }}>{v < 0 ? `${formatAllottedTime(Math.abs(v))} over` : formatAllottedTime(v)}</span>
            )
        },
        {
            title: "Days To Go",
            key: "days_to_go",
            width: 150,
            sorter: (a: AdminTask, b: AdminTask) => {
                const getDays = (t: AdminTask) => {
                    if (!t.due_date || TERMINAL_STATUSES.includes(t.task_status)) {
                        return 999999;
                    }
                    return dayjs(t.due_date).startOf("day").diff(dayjs().startOf("day"), "day");
                };
                return getDays(a) - getDays(b);
            },
            sortDirections: ["ascend", "descend"],
            sortIcon: ({ sortOrder }) =>
                sortOrder === "descend" ? (
                    <SortDescendingOutlined style={{ fontSize: 12, color: "var(--accent)", marginLeft: 4 }} />
                ) : (
                    <SortAscendingOutlined
                        style={{ fontSize: 12, color: sortOrder ? "var(--accent)" : "var(--text-muted)", marginLeft: 4 }}
                    />
                ),
            render: (_: any, record: AdminTask) => (
                <DaysToGoTag dueDate={record.due_date} status={record.task_status} />
            ),
        },
        { title: "Assigned Date", dataIndex: "assigned_date", key: "assigned_date", width: 110, render: (v: string) => <span style={{ fontSize: 11.5 }}>{dayjs(v).format("DD MMM YYYY")}</span> },
        {
            title: "Due Date & Deadline",
            dataIndex: "due_date",
            key: "due_date",
            width: 150,
            render: (_: any, record: AdminTask) => (
                <div>
                    <div style={{ fontSize: 11.5, color: "var(--text-secondary)" }}>
                        {record.due_date ? dayjs(record.due_date).format("DD MMM YYYY") : "—"}
                    </div>
                    {record.due_time && (
                        <div style={{ fontSize: 11, color: "var(--red, #e11d48)", fontWeight: 600, marginTop: 2 }}>
                            by {dayjs(`1970-01-01T${record.due_time}`).format("hh:mm A")}
                        </div>
                    )}
                </div>
            ),
        },
        {
            title: "Task Sheet Link", dataIndex: "task_sheet_link", key: "task_sheet_link", width: 140, render: (v: string) => v ? (
                <a href={v} target="_blank" rel="noreferrer" style={{ fontSize: 11.5, display: "flex", alignItems: "center", gap: 4 }}><LinkOutlined /> Open</a>
            ) : <span style={{ color: "var(--text-muted)", fontSize: 12 }}>—</span>
        },
        {
            title: "Attachments", dataIndex: "attachments", key: "attachments", width: 200, render: (files: AdminTask["attachments"]) =>
                files?.length ? (
                    <Image.PreviewGroup>
                        <div style={{ display: "flex", gap: 4, flexWrap: "wrap", maxWidth: 180 }}>
                            {files.map((f) => <Image key={f.id} src={resolveFileUrl(f.file)} width={28} height={28} style={{ objectFit: "cover", borderRadius: 4, border: "1px solid var(--border)" }} />)}
                        </div>
                    </Image.PreviewGroup>
                ) : <span style={{ color: "var(--text-muted)", fontSize: 12 }}>—</span>
        },
        {
            title: "Admin Remarks", dataIndex: "admin_remarks", key: "admin_remarks", width: 160, render: (v: string) => (
                <div style={{ fontSize: 11.5, color: "var(--text-secondary)", maxWidth: 160, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }} title={v}>{v || "—"}</div>
            )
        },
        { title: "Rework Count", dataIndex: "rework_count", key: "rework_count", width: 120, render: (v: number) => <span className="td-num" style={{ fontSize: 12 }}>{v}</span> },
        { title: "Actions", key: "actions", width: 190, fixed: "right", render: (_: any, record: AdminTask) => <TimerActions task={record} /> },
    ];

    return (
        <div>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 18, borderBottom: "1px solid var(--border)", paddingBottom: 8 }}>
                <div>
                    <h1 style={{ fontSize: 18, fontWeight: 700, margin: 0, color: "var(--accent)" }}>Assigned Tasks</h1>
                    <p style={{ fontSize: 9, color: "var(--text-muted)", margin: "4px 0 0", fontWeight: 500, letterSpacing: "0.04em", textTransform: "uppercase" }}>
                        Tasks a team lead assigned directly to you
                    </p>
                </div>
            </div>

            {activePause && (
                <div style={{
                    marginBottom: 18,
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "space-between",
                    padding: "14px 20px",
                    borderRadius: 12,
                    background: "#fffbeb",
                    border: "1px solid #fde68a",
                    borderLeft: "4px solid #d97706",
                    boxShadow: "0 2px 8px rgba(217, 119, 6, 0.08)",
                    flexWrap: "wrap",
                    gap: 12,
                }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                        <span style={{ color: "#d97706", display: "flex", fontSize: 24 }}>
                            {activePause.pause_type === "break" ? <CoffeeOutlined /> : <PauseCircleOutlined />}
                        </span>
                        <div>
                            <div style={{ fontSize: 11, fontWeight: 700, color: "#d97706", textTransform: "uppercase", letterSpacing: "0.05em" }}>
                                {activePause.pause_type === "break"
                                    ? `Currently on break (${activePause.break_duration_minutes || 30} mins)`
                                    : "Currently paused"}
                            </div>
                            <div style={{ fontSize: 14, fontWeight: 700, color: "var(--text-primary)" }}>
                                {activePause.task_name} <span style={{ fontSize: 12, fontWeight: 500, color: "#8c8c8c" }}>— {activePause.reason}</span>
                            </div>
                        </div>
                    </div>
                    <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
                        <span style={{
                            fontSize: 22,
                            fontWeight: 700,
                            fontVariantNumeric: "tabular-nums",
                            color: breakRemaining < 0 ? "var(--red, #cf1322)" : "#d97706",
                        }}>
                            {formatBreakTime(breakRemaining)}
                        </span>
                        <Button
                            type="primary"
                            loading={busyTaskId === activePause.task}
                            onClick={() => {
                                const t = tasks.find(x => x.id === activePause.task);
                                if (t) {
                                    callTimerAction(t, "resume");
                                } else {
                                    fetch(`${BASE_URL}/api/tasks/${activePause.task}/resume/`, {
                                        method: "POST",
                                        headers: { "Content-Type": "application/json", ...authHeaders() },
                                    }).then(() => {
                                        fetchTasks();
                                        fetchActiveSession();
                                    });
                                }
                            }}
                            style={{ fontSize: 12, fontWeight: 600, borderRadius: 8, background: "var(--accent)", border: "none" }}
                        >
                            Resume Task
                        </Button>
                    </div>
                </div>
            )}

            <div className="db-stat-grid">
                <StatCard label="Total Tasks" value={totalTasks} />
                <StatCard label="In Progress" value={inProgress} />
                <StatCard label="Rework Needed" value={reworkNeeded} />
                <StatCard label="Overdue" value={overdueCount} />
            </div>

            <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 20, flexWrap: "wrap" }}>
                <Input
                    placeholder="Search your tasks…"
                    prefix={<SearchOutlined style={{ color: "var(--text-muted)" }} />}
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    allowClear
                    style={{ flex: 1, minWidth: 220, maxWidth: 400, height: 35, padding: "0 14px", background: "var(--bg-input)", border: "1px solid var(--accent-light)", borderRadius: 9, fontSize: 13 }}
                />
                <Select placeholder="Status" allowClear value={statusFilter} onChange={setStatusFilter} style={{ width: 170 }}
                    options={Object.entries(STATUS_META).filter(([v]) => v !== "completed").map(([v, meta]) => ({ value: v, label: meta.label }))} />
                <Select placeholder="Priority" allowClear value={priorityFilter} onChange={setPriorityFilter} style={{ width: 150 }} options={PRIORITY_OPTIONS} />
                <Button onClick={() => { fetchTasks(); fetchActiveSession(); }} icon={<ReloadOutlined />} className="db-card-action" style={{ height: 35, fontSize: 12, fontWeight: 600, display: "flex", alignItems: "center", gap: 6, paddingInline: 14 }}>Refresh</Button>
                <span style={{ fontSize: 12, color: "var(--text-muted)", marginLeft: "auto" }}>{filtered.length} of {tasks.length} tasks</span>
            </div>

            <div style={{ background: "var(--bg-card)", borderRadius: 14, border: "1px solid var(--border)", overflow: "hidden", boxShadow: "var(--shadow-card)" }}>
                <Table
                    columns={columns}
                    dataSource={filtered}
                    rowKey="id"
                    scroll={{ x: 2400 }}
                    loading={loading}
                    pagination={{ pageSize: 10, showSizeChanger: true, pageSizeOptions: ["10", "20", "50"], showTotal: (total, range) => `${range[0]}–${range[1]} of ${total} tasks`, style: { padding: "12px 16px" } }}
                    rowClassName={() => "client-table-row"}
                    style={{ fontSize: 13 }}
                />
            </div>

            <Modal open={submitOpen} onCancel={() => setSubmitOpen(false)} onOk={handleSubmitTask} confirmLoading={submitting} title="Submit Task" okText="Submit" width={520} centered destroyOnClose>
                {submitTarget && (
                    <Form form={submitForm} layout="vertical">
                        <Form.Item label="Task Sheet Link" name="task_sheet_link" rules={[
                            { validator: (_, value) => (!value || isValidHttpUrl(value)) ? Promise.resolve() : Promise.reject(new Error("Enter a valid link starting with http:// or https://")) },
                        ]}>
                            <Input placeholder="https://docs.google.com/..." />
                        </Form.Item>
                        <Form.Item label="Remarks" name="employee_remarks">
                            <Input.TextArea rows={3} placeholder="Anything the reviewer should know…" />
                        </Form.Item>
                        <Form.Item label="Attachments (optional)">
                            <Upload multiple listType="picture-card" accept="image/*" fileList={attachments} beforeUpload={() => false} onChange={({ fileList }) => setAttachments(fileList)}>
                                {attachments.length >= 8 ? null : <div><UploadOutlined /><div style={{ marginTop: 2, fontSize: 11 }}>Upload</div></div>}
                            </Upload>
                        </Form.Item>
                    </Form>
                )}
            </Modal>

            <PauseTaskModal
                open={pauseOpen}
                task={pauseTarget}
                onClose={() => {
                    setPauseOpen(false);
                    setPauseTarget(null);
                }}
                onSuccess={() => {
                    fetchTasks();
                    fetchActiveSession();
                }}
            />
        </div>
    );
}