import { useEffect, useState, useCallback, useMemo } from "react";
import { Table, Button, Input, Modal, Select, Form, message, DatePicker, InputNumber, Tag, Dropdown, Checkbox } from "antd";
import {
    SearchOutlined, ReloadOutlined, PlusOutlined, UserSwitchOutlined,
    FileTextOutlined, PauseCircleOutlined, PlayCircleOutlined,
    StopOutlined, MoreOutlined, UserAddOutlined, SortAscendingOutlined, SortDescendingOutlined
} from "@ant-design/icons";
import type { MenuProps } from "antd";
import type { ColumnsType } from "antd/es/table";
import dayjs from "dayjs";
import TaskMasterAddModal from "../../admin/tasks/Employee_Tasks/TaskMasterAddModal"; // adjust path to wherever you put the file

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

interface Department {
    id: string;
    name: string;
}

interface EmployeeOption {
    id: number;
    name: string;
    department: string;
}

interface AdminOption {
    id: number;
    name: string;
}

interface PriorityOption {
    value: string;
    label: string;
}

type TaskStatus =
    | "not_started" | "in_progress" | "paused" | "submitted" | "under_review"
    | "rework_needed" | "resubmitted" | "completed" | "on_hold" | "cancelled" | "archived";

interface Task {
    id: number;
    task_id: string;
    project_name: string | null;
    task_name: string;
    task_details: string;
    department_name: string | null;
    assigned_to: number | null;
    assigned_to_admin: number | null;
    assigned_to_name: string | null;
    assignee_role: "employee" | "admin" | null;
    assigned_by_name: string | null;
    created_by_role: "admin" | "tl" | null;
    priority: string | null;
    due_date: string | null;
    allotted_time: number | null;
    task_status: TaskStatus;
    assigned_date: string;
}

interface TaskMasterOption {
    id: number;
    project_name: string;
    task_name: string;
    default_hours: number;
    label: string;   // "Logo Creation - 1hr"
}

// ── Statuses shown on THIS screen. Submitted / Resubmitted / Under Review
// have moved on to the Review Tasks screen — once an employee submits,
// it disappears from here so this table only shows work not yet handed off.
const ACTIVE_STATUSES: TaskStatus[] = [
    "not_started", "in_progress", "paused", "rework_needed", "on_hold",
];

// Terminal states — days-to-go doesn't make sense once work is over.
const TERMINAL_STATUSES: TaskStatus[] = ["completed", "cancelled", "archived"];

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

const WEEKDAY_OPTIONS = [
    { label: "Mon", value: 0 },
    { label: "Tue", value: 1 },
    { label: "Wed", value: 2 },
    { label: "Thu", value: 3 },
    { label: "Fri", value: 4 },
    { label: "Sat", value: 5 },
    { label: "Sun", value: 6 },
];
const DEFAULT_WEEKDAYS = [0, 1, 2, 3, 4, 5]; // all except Sunday

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

// ── Days-to-go badge. Positive = time left, 0 = due today, negative = overdue.
// Only meaningful for non-terminal tasks — TERMINAL_STATUSES rows show "—" instead.
function DaysToGoTag({ dueDate, status }: { dueDate: string | null; status: TaskStatus }) {
    if (!dueDate || TERMINAL_STATUSES.includes(status)) {
        return <span style={{ color: "var(--text-muted)", fontSize: 12 }}>—</span>;
    }
    const days = dayjs(dueDate).startOf("day").diff(dayjs().startOf("day"), "day");

    if (days < 0) {
        return (
            <span style={{
                fontSize: 11, fontWeight: 700, color: "var(--red)", background: "var(--red-bg)",
                border: "1px solid var(--red)", padding: "2px 10px", borderRadius: 6, whiteSpace: "nowrap",
            }}>
                Overdue by {Math.abs(days)} {Math.abs(days) === 1 ? "day" : "days"}
            </span>
        );
    }
    if (days === 0) {
        return (
            <span style={{
                fontSize: 11, fontWeight: 700, color: "var(--amber)", background: "var(--amber-bg)",
                border: "1px solid var(--amber)", padding: "2px 10px", borderRadius: 6, whiteSpace: "nowrap",
            }}>
                Due today
            </span>
        );
    }
    return (
        <span style={{
            fontSize: 11, fontWeight: 700, color: "var(--green)", background: "var(--green-bg)",
            border: "1px solid var(--green)", padding: "2px 10px", borderRadius: 6, whiteSpace: "nowrap",
        }}>
            {days} {days === 1 ? "day" : "days"} to go
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

export default function TL_Create_Task() {
    const [tasks, setTasks] = useState<Task[]>([]);
    const [departments, setDepartments] = useState<Department[]>([]);
    const [employees, setEmployees] = useState<EmployeeOption[]>([]);
    const [admins, setAdmins] = useState<AdminOption[]>([]);
    const [priorities, setPriorities] = useState<PriorityOption[]>([]);
    const [loading, setLoading] = useState(true);

    // ── TL's own identity — used to preset the Self Assign flow and badge
    // rows already assigned to the TL. Fetched once from /api/auth/me/.
    const [myId, setMyId] = useState<number | null>(null);
    const [myDepartment, setMyDepartment] = useState<string | undefined>(undefined);

    const [search, setSearch] = useState("");
    const [statusFilter, setStatusFilter] = useState<string | undefined>(undefined);
    const [priorityFilter, setPriorityFilter] = useState<string | undefined>(undefined);

    const [createOpen, setCreateOpen] = useState(false);
    const [creating, setCreating] = useState(false);
    const [createForm] = Form.useForm();
    const [createDeptId, setCreateDeptId] = useState<string | undefined>(undefined);
    const [addTaskMasterOpen, setAddTaskMasterOpen] = useState(false);
    const [taskMasterList, setTaskMasterList] = useState<TaskMasterOption[]>([]);

    // ── "Assign To Type" toggle for the Create modal ──────────────────────
    const [assigneeType, setAssigneeType] = useState<"employee" | "admin">("employee");

    // ── Project Name — same catalog-by-project concept as All_Task_Admin ──
    const [createProjectName, setCreateProjectName] = useState<string | undefined>(undefined);
    const [taskMasterPrefillProject, setTaskMasterPrefillProject] = useState<string | undefined>(undefined);

    // ── recurring/"Repeats Daily" state ──────────────────────────────
    const [isDaily, setIsDaily] = useState(false);
    const [selectedWeekdays, setSelectedWeekdays] = useState<number[]>(DEFAULT_WEEKDAYS);

    const [assignOpen, setAssignOpen] = useState(false);
    const [assigning, setAssigning] = useState(false);
    const [assignTarget, setAssignTarget] = useState<Task | null>(null);
    const [assignDeptId, setAssignDeptId] = useState<string | undefined>(undefined);
    const [assignForm] = Form.useForm();

    // ── "Assign To Type" toggle for the Reassign modal ─────────────────────
    const [assignAssigneeType, setAssignAssigneeType] = useState<"employee" | "admin">("employee");

    const [busyId, setBusyId] = useState<number | null>(null);
    const [cancelOpen, setCancelOpen] = useState(false);
    const [cancelTarget, setCancelTarget] = useState<Task | null>(null);
    const [cancelling, setCancelling] = useState(false);
    const [cancelForm] = Form.useForm();

    const fetchMe = useCallback(() => {
        fetch(`${BASE_URL}/api/auth/me/`, { headers: { ...authHeaders() } })
            .then((r) => r.json())
            .then((d) => {
                setMyId(d?.id ?? null);
                setMyDepartment(d?.department ?? undefined);
            })
            .catch(() => {
                setMyId(null);
                setMyDepartment(undefined);
            });
    }, []);

    const fetchTasks = useCallback(() => {
        setLoading(true);
        // Scoped server-side to "created by me" — no client-side filtering needed.
        fetch(`${BASE_URL}/api/tasks/tl_tasks/`, {
            headers: { ...authHeaders() },
        })
            .then((r) => r.json())
            .then((d) => {
                const all: Task[] = Array.isArray(d) ? d : d.results || [];
                setTasks(all.filter((t) => ACTIVE_STATUSES.includes(t.task_status)));
            })
            .catch(() => message.error("Failed to load your tasks"))
            .finally(() => setLoading(false));
    }, []);

    const fetchDepartments = useCallback(() => {
        fetch(`${BASE_URL}/api/tasks/get_all_departments/`, {
            headers: { ...authHeaders() },
        })
            .then((r) => r.json())
            .then((d) => setDepartments(Array.isArray(d) ? d : d.results || []))
            .catch(() => message.error("Failed to load departments"));
    }, []);

    const fetchEmployees = useCallback(() => {
        fetch(`${BASE_URL}/api/tasks/get_all_employees/`, {
            headers: { ...authHeaders() },
        })
            .then((r) => r.json())
            .then((d) => setEmployees(Array.isArray(d) ? d : d.results || []))
            .catch(() => message.error("Failed to load employees"));
    }, []);

    const fetchAdmins = useCallback(() => {
        fetch(`${BASE_URL}/api/tasks/get_all_admins/`, { headers: { ...authHeaders() } })
            .then((r) => r.json())
            .then((d) => setAdmins(Array.isArray(d) ? d : []))
            .catch(() => message.error("Failed to load admins"));
    }, []);

    const fetchPriorities = useCallback(() => {
        fetch(`${BASE_URL}/api/tasks/get_priority_choices/`, {
            headers: { ...authHeaders() },
        })
            .then((r) => r.json())
            .then((d) => setPriorities(Array.isArray(d) ? d : d.results || []))
            .catch(() => {
                setPriorities([
                    { value: "low", label: "Low" },
                    { value: "medium", label: "Medium" },
                    { value: "high", label: "High" },
                    { value: "urgent", label: "Urgent" },
                ]);
            });
    }, []);

    const fetchTaskMaster = useCallback(() => {
        fetch(`${BASE_URL}/api/tasks/task_master/`, {
            headers: { ...authHeaders() },
        })
            .then((r) => r.json())
            .then((d) => setTaskMasterList(Array.isArray(d) ? d : d.results || []))
            .catch(() => message.error("Failed to load task catalog"));
    }, []);

    useEffect(() => {
        fetchMe();
        fetchTasks();
        fetchDepartments();
        fetchEmployees();
        fetchAdmins();
        fetchPriorities();
        fetchTaskMaster();
    }, [fetchMe, fetchTasks, fetchDepartments, fetchEmployees, fetchAdmins, fetchPriorities, fetchTaskMaster]);

    const handleTaskMasterSelect = (template: TaskMasterOption) => {
        createForm.setFieldsValue({
            task_name: template.task_name,       // stored on the Task as plain text, same as before
            allotted_time: template.default_hours,
            // Due Date only makes sense for a one-time task — skip it when
            // "Repeats Daily" is checked, since each occurrence gets its own
            // due date automatically (see generate_recurring_tasks).
            ...(isDaily ? {} : { due_date: dayjs().add(Number(template.default_hours), "hour") }),
        });
    };

    const isSelfAssigned = useCallback(
        (task: Task) => myId !== null && task.assigned_to === myId,
        [myId]
    );

    const totalTasks = tasks.length;
    const unassignedTasks = tasks.filter((t) => !t.assigned_to && !t.assigned_to_admin).length;
    const inProgressTasks = tasks.filter((t) => t.task_status === "in_progress").length;
    const selfAssignedTasks = useMemo(() => tasks.filter(isSelfAssigned).length, [tasks, isSelfAssigned]);

    const filtered = useMemo(() => {
        return tasks.filter((t) => {
            if (statusFilter && t.task_status !== statusFilter) return false;
            if (priorityFilter && t.priority !== priorityFilter) return false;
            if (search.trim()) {
                const q = search.toLowerCase();
                const haystack = [
                    t.task_id, t.project_name, t.task_name, t.task_details,
                    t.assigned_to_name, t.department_name,
                ];
                if (!haystack.some((f) => f?.toLowerCase().includes(q))) return false;
            }
            return true;
        });
    }, [tasks, search, statusFilter, priorityFilter]);

    const openCreate = () => {
        createForm.resetFields();
        setCreateDeptId(undefined);
        setCreateProjectName(undefined);
        setIsDaily(false);
        setSelectedWeekdays(DEFAULT_WEEKDAYS);
        setAssigneeType("employee");
        setCreateOpen(true);
    };

    const handleCreateDeptChange = (deptName: string) => {
        setCreateDeptId(deptName);
        createForm.setFieldsValue({ assigned_to: undefined });
    };

    const employeesForCreateDept = employees.filter((e) => e.department === createDeptId);

    const projectNameOptions = useMemo(() => {
        const names = Array.from(new Set(taskMasterList.map((t) => t.project_name).filter(Boolean)));
        return names.map((n) => ({ value: n, label: n }));
    }, [taskMasterList]);

    const tasksForSelectedProject = useMemo(() => {
        if (!createProjectName) return [];
        return taskMasterList.filter((t) => t.project_name === createProjectName);
    }, [taskMasterList, createProjectName]);

    // ── Create + assign in one shot (or create the recurring rule when
    // "Repeats Daily" is checked) — backend attributes it to
    // assigned_by_employee automatically since the caller is a TL.
    // assigneeType determines whether the payload sends assigned_to
    // (Employee) or assigned_to_admin (Admin) — backend enforces that only
    // a TL is allowed to send assigned_to_admin.
    const handleCreate = async () => {
        let values;
        try {
            values = await createForm.validateFields();
        } catch {
            return;
        }
        if (isDaily && selectedWeekdays.length === 0) {
            message.error("Select at least one day of the week.");
            return;
        }

        setCreating(true);
        try {
            const url = isDaily
                ? `${BASE_URL}/api/tasks/recurring/create/`
                : `${BASE_URL}/api/tasks/create_and_assign/`;

            const body = isDaily
                ? {
                    project_name: values.project_name,
                    task_name: values.task_name,
                    task_details: values.task_details,
                    ...(assigneeType === "admin" ? { assigned_to_admin: values.assigned_to } : { assigned_to: values.assigned_to }),
                    priority: values.priority,
                    allotted_time: values.allotted_time,
                    start_date: values.recurring_start_date.format("YYYY-MM-DD"),
                    end_date: values.recurring_end_date
                        ? values.recurring_end_date.format("YYYY-MM-DD")
                        : null,
                    weekdays: selectedWeekdays,
                }
                : {
                    project_name: values.project_name,
                    task_name: values.task_name,
                    task_details: values.task_details,
                    ...(assigneeType === "admin" ? { assigned_to_admin: values.assigned_to } : { assigned_to: values.assigned_to }),
                    priority: values.priority,
                    due_date: values.due_date ? values.due_date.format("YYYY-MM-DD") : null,
                    allotted_time: values.allotted_time,
                };

            const res = await fetch(url, {
                method: "POST",
                headers: { "Content-Type": "application/json", ...authHeaders() },
                body: JSON.stringify(body),
            });

            if (res.ok) {
                message.success(
                    isDaily
                        ? "Daily task scheduled"
                        : assigneeType === "employee" && values.assigned_to === myId
                            ? "Task created and self-assigned"
                            : "Task created and assigned"
                );
                setCreateOpen(false);
                fetchTasks();
            } else {
                const err = await res.json().catch(() => ({}));
                message.error(JSON.stringify(err) || "Failed to create task");
            }
        } catch {
            message.error("Network error");
        } finally {
            setCreating(false);
        }
    };

    // ── presetSelf = true means this modal opened from "Self Assign" —
    // department + employee are pre-filled with the TL's own and the
    // employee field is disabled so they can't accidentally hand it off.
    const [selfAssignMode, setSelfAssignMode] = useState(false);

    const openAssign = (record: Task, presetSelf = false) => {
        setAssignTarget(record);
        setSelfAssignMode(presetSelf);
        // Self-assign is always to the TL themselves (an Employee), so lock the
        // toggle to "employee" in that mode. Otherwise default to whatever
        // this task is currently assigned as, so reopening a reassign shows
        // the right type immediately.
        const initialType: "employee" | "admin" = presetSelf
            ? "employee"
            : record.assignee_role === "admin" ? "admin" : "employee";
        setAssignAssigneeType(initialType);

        const deptForForm = presetSelf ? myDepartment : record.department_name ?? undefined;
        setAssignDeptId(deptForForm);
        assignForm.setFieldsValue({
            department: deptForForm,
            assigned_to: presetSelf
                ? myId ?? undefined
                : initialType === "admin"
                    ? record.assigned_to_admin ?? undefined
                    : record.assigned_to ?? undefined,
            priority: record.priority ?? undefined,
            due_date: record.due_date ? dayjs(record.due_date) : undefined,
            allotted_time: record.allotted_time ?? undefined,
        });
        setAssignOpen(true);
    };

    const employeesForSelectedDept = employees.filter((e) => e.department === assignDeptId);

    const handleAssignDeptChange = (deptName: string) => {
        setAssignDeptId(deptName);
        assignForm.setFieldsValue({ assigned_to: undefined });
    };

    const handleAssignSave = async () => {
        if (!assignTarget) return;
        let values;
        try {
            values = await assignForm.validateFields();
        } catch {
            return;
        }

        setAssigning(true);
        try {
            const res = await fetch(`${BASE_URL}/api/tasks/assign_task/${assignTarget.id}/`, {
                method: "PATCH",
                headers: { "Content-Type": "application/json", ...authHeaders() },
                body: JSON.stringify({
                    ...(assignAssigneeType === "admin"
                        ? { assigned_to_admin: values.assigned_to }
                        : { assigned_to: values.assigned_to }),
                    priority: values.priority,
                    due_date: values.due_date ? values.due_date.format("YYYY-MM-DD") : null,
                    allotted_time: values.allotted_time,
                }),
            });
            if (res.ok) {
                message.success(
                    selfAssignMode
                        ? "Task self-assigned"
                        : (assignTarget.assigned_to || assignTarget.assigned_to_admin) ? "Task reassigned" : "Task assigned"
                );
                setAssignOpen(false);
                fetchTasks();
            } else {
                const err = await res.json().catch(() => ({}));
                message.error(JSON.stringify(err) || "Failed to assign task");
            }
        } catch {
            message.error("Network error");
        } finally {
            setAssigning(false);
        }
    };

    async function callTaskAction(task: Task, action: "hold" | "release_hold" | "archive", successMsg: string) {
        setBusyId(task.id);
        try {
            const res = await fetch(`${BASE_URL}/api/tasks/${task.id}/${action}/`, {
                method: "POST",
                headers: { "Content-Type": "application/json", ...authHeaders() },
            });
            if (res.ok) {
                message.success(successMsg);
            } else {
                const err = await res.json().catch(() => ({}));
                message.error(err.detail || "Action failed");
            }
        } catch {
            message.error("Network error");
        } finally {
            setBusyId(null);
            fetchTasks();
        }
    }

    const openCancel = (task: Task) => {
        setCancelTarget(task);
        cancelForm.resetFields();
        setCancelOpen(true);
    };

    const handleCancelConfirm = async () => {
        if (!cancelTarget) return;
        let values;
        try {
            values = await cancelForm.validateFields();
        } catch {
            return;
        }
        setCancelling(true);
        try {
            const res = await fetch(`${BASE_URL}/api/tasks/${cancelTarget.id}/cancel/`, {
                method: "POST",
                headers: { "Content-Type": "application/json", ...authHeaders() },
                body: JSON.stringify({ reason: values.reason }),
            });
            if (res.ok) {
                message.success("Task cancelled");
                setCancelOpen(false);
            } else {
                const err = await res.json().catch(() => ({}));
                message.error(err.detail || "Failed to cancel task");
            }
        } catch {
            message.error("Network error");
        } finally {
            setCancelling(false);
            fetchTasks();
        }
    };

    function formatAllottedTime(hours: number | null): string {
        if (hours === null || hours === undefined) return "—";
        const totalMinutes = Math.round(hours * 60);
        const h = Math.floor(totalMinutes / 60);
        const m = totalMinutes % 60;

        if (h && m) return `${h}h ${m}m`;
        if (h) return `${h}h`;
        return `${m}m`;
    }

    const columns: ColumnsType<Task> = [
        {
            title: "Task ID",
            dataIndex: "task_id",
            key: "task_id",
            width: 100,
            render: (v: string) => (
                <span style={{ fontSize: 11.5, fontWeight: 700, color: "var(--blue)", background: "var(--blue-bg)", border: "1px solid var(--blue)", padding: "2px 10px", borderRadius: 6, whiteSpace: "nowrap" }}>{v}</span>
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
            width: 150,
            render: (v: string | null, record: Task) => (
                <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                    {v
                        ? <span style={{ fontSize: 12.5, fontWeight: 600, color: "var(--text-primary)" }}>{v}</span>
                        : <span style={{ color: "var(--text-muted)", fontSize: 12 }}>Unassigned</span>}
                    {record.assignee_role === "admin" && (
                        <Tag color="purple" style={{ fontSize: 9.5, fontWeight: 700, margin: 0, lineHeight: "16px" }}>
                            Admin
                        </Tag>
                    )}
                    {isSelfAssigned(record) && (
                        <Tag color="green" style={{ fontSize: 9.5, fontWeight: 700, margin: 0, lineHeight: "16px" }}>
                            Self
                        </Tag>
                    )}
                </div>
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
            title: "Days To Go",
            key: "days_to_go",
            width: 150,
            sorter: (a: Task, b: Task) => {
                const getDays = (t: Task) => {
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
            render: (_: any, record: Task) => (
                <DaysToGoTag dueDate={record.due_date} status={record.task_status} />
            ),
        },
        {
            title: "Actions",
            key: "actions",
            width: 140,
            fixed: "right",
            render: (_: any, record: Task) => {
                const items: MenuProps["items"] = [
                    {
                        key: "assign",
                        icon: <UserSwitchOutlined />,
                        label: (record.assigned_to || record.assigned_to_admin) ? "Reassign" : "Assign Task",
                        onClick: () => openAssign(record, false),
                    },
                ];

                if (!isSelfAssigned(record)) {
                    items.push({
                        key: "self_assign",
                        icon: <UserAddOutlined />,
                        label: "Self Assign",
                        onClick: () => openAssign(record, true),
                    });
                }

                if (record.task_status === "on_hold") {
                    items.push({
                        key: "release_hold",
                        icon: <PlayCircleOutlined />,
                        label: "Release Hold",
                        onClick: () => callTaskAction(record, "release_hold", "Hold released"),
                    });
                } else {
                    items.push({
                        key: "hold",
                        icon: <PauseCircleOutlined />,
                        label: "Put On Hold",
                        onClick: () => callTaskAction(record, "hold", "Task put on hold"),
                    });
                }

                items.push({
                    key: "cancel",
                    icon: <StopOutlined />,
                    label: "Cancel Task",
                    danger: true,
                    onClick: () => openCancel(record),
                });

                return (
                    <Dropdown menu={{ items }} trigger={["click"]}>
                        <Button
                            size="small"
                            loading={busyId === record.id}
                            icon={<MoreOutlined />}
                            className="db-action-btn"
                        >
                            Actions
                        </Button>
                    </Dropdown>
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
                    <h1 style={{ fontSize: 18, fontWeight: 700, margin: 0, color: "var(--accent)" }}>
                        Team Tasks
                    </h1>
                    <p style={{
                        fontSize: 9, color: "var(--text-muted)", margin: "4px 0 0",
                        fontWeight: 500, letterSpacing: "0.04em", textTransform: "uppercase",
                    }}>
                        Tasks you created — assign to your team or take one yourself
                    </p>
                </div>
                <Button onClick={openCreate} icon={<PlusOutlined />}
                    style={{
                        borderRadius: 9, border: "none", background: "var(--accent)", color: "#fff",
                        fontSize: 12, fontWeight: 700, padding: "8px 16px", display: "flex", alignItems: "center", gap: 6,
                    }}>
                    Create Task
                </Button>
            </div>

            <div className="db-stat-grid">
                <StatCard label="Tasks Created" value={totalTasks} changeLabel="Not yet completed/cancelled" changeType="neutral" />
                <StatCard label="Unassigned" value={unassignedTasks} changeLabel="Awaiting assignment" changeType={unassignedTasks > 0 ? "down" : "neutral"} />
                <StatCard label="In Progress" value={inProgressTasks} changeLabel="Currently active" changeType="up" />
                <StatCard label="Self-Assigned" value={selfAssignedTasks} changeLabel="Taken on by you" changeType="neutral" />
            </div>

            <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 20, flexWrap: "wrap" }}>
                <Input
                    placeholder="Search by task, project, employee, department…"
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
                    options={ACTIVE_STATUSES.map((s) => ({ value: s, label: STATUS_META[s].label }))}
                />
                <Select
                    placeholder="Priority"
                    allowClear
                    value={priorityFilter}
                    onChange={setPriorityFilter}
                    style={{ width: 150 }}
                    options={priorities.map((p) => ({ value: p.value, label: p.label }))}
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
                    scroll={{ x: 1650 }}
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
                />
            </div>

            {/* ── Create Task modal — matches Admin's: Project Name (with
                inline "Add New Project"), TaskMaster catalog dropdown scoped
                to that project (with inline "Add New Task"), Assign To Type
                (Employee/Admin), Priority, Due Date, Allotted Time, plus the
                "Repeats Daily" recurring option, all in one create+assign step. ── */}
            <Modal
                open={createOpen}
                onCancel={() => setCreateOpen(false)}
                onOk={handleCreate}
                confirmLoading={creating}
                title={
                    <span style={{ display: "flex", alignItems: "center", gap: 8 }}>
                        <FileTextOutlined /> Create Task
                    </span>
                }
                okText={isDaily ? "Schedule Daily Task" : "Create & Assign"}
                width={640}
                centered
                destroyOnClose
            >
                <Form form={createForm} layout="vertical">
                    <Form.Item
                        label="Project Name"
                        name="project_name"
                        rules={[{ required: true, message: "Required" }]}
                    >
                        <Select
                            placeholder="Select or add a project"
                            showSearch
                            optionFilterProp="label"
                            options={[
                                ...projectNameOptions,
                                { value: "__ADD_NEW__", label: "Add New Project" },
                            ]}
                            optionRender={(option) => {
                                if (option.value === "__ADD_NEW__") {
                                    return (
                                        <div style={{ display: "flex", alignItems: "center", gap: 8, color: "#1677ff", fontWeight: 600, padding: "4px 0" }}>
                                            <PlusOutlined style={{ fontSize: 13, color: "#1677ff" }} />
                                            <span>Add New Project</span>
                                        </div>
                                    );
                                }
                                return <div>{option.label}</div>;
                            }}
                            onSelect={(value) => {
                                if (value === "__ADD_NEW__") {
                                    // setTimeout ensures Form.Item finishes its cycle before resetting the field
                                    setTimeout(() => {
                                        createForm.setFieldsValue({ project_name: undefined });
                                    }, 0);
                                    setTaskMasterPrefillProject(undefined);
                                    setAddTaskMasterOpen(true);
                                }
                            }}
                            onChange={(value) => {
                                if (value === "__ADD_NEW__") return;
                                setCreateProjectName(value);
                                // Project changed — clear whatever task/hours were picked for the old project.
                                createForm.setFieldsValue({ task_name: undefined, allotted_time: undefined });
                            }}
                        />
                    </Form.Item>

                    <Form.Item label="Task Name" name="task_name" rules={[{ required: true, message: "Required" }]}>
                        <Select
                            placeholder={createProjectName ? "Select a task from the catalog" : "Select a project first"}
                            disabled={!createProjectName}
                            showSearch
                            optionFilterProp="label"
                            options={[
                                ...tasksForSelectedProject.map((t) => ({ value: t.task_name, label: t.label })),
                                { value: "__ADD_NEW__", label: "Add New Task" },
                            ]}
                            optionRender={(option) => {
                                const isAddNew = option.value === "__ADD_NEW__";
                                if (isAddNew) {
                                    return (
                                        <div style={{ display: "flex", alignItems: "center", gap: 8, color: "#1677ff", fontWeight: 600, padding: "4px 0" }}>
                                            <PlusOutlined style={{ fontSize: 13, color: "#1677ff" }} />
                                            <span>Add New Task</span>
                                        </div>
                                    );
                                }
                                return <div>{option.label}</div>;
                            }}
                            onSelect={(value) => {
                                if (value === "__ADD_NEW__") {
                                    // setTimeout ensures Form.Item finishes its cycle before resetting the field
                                    setTimeout(() => {
                                        createForm.setFieldsValue({ task_name: undefined });
                                    }, 0);
                                    setTaskMasterPrefillProject(createProjectName);
                                    setAddTaskMasterOpen(true);
                                }
                            }}
                            onChange={(value) => {
                                if (value === "__ADD_NEW__") return;
                                const template = tasksForSelectedProject.find((t) => t.task_name === value);
                                if (template) handleTaskMasterSelect(template);
                            }}
                        />
                    </Form.Item>
                    <Form.Item
                        label="Task Details"
                        name="task_details"
                        rules={[{ required: true, message: "Required" }]}
                    >
                        <Input.TextArea rows={3} placeholder="Describe what needs to be done…" />
                    </Form.Item>
                    <div className="db-form-row">
                        <Form.Item name="is_daily" valuePropName="checked">
                            <Checkbox onChange={(e) => setIsDaily(e.target.checked)}>
                                Repeats Daily
                            </Checkbox>
                        </Form.Item>

                        {isDaily && (
                            <Form.Item label="Repeat On">
                                <Checkbox.Group
                                    options={WEEKDAY_OPTIONS}
                                    value={selectedWeekdays}
                                    onChange={(vals) => setSelectedWeekdays(vals as number[])}
                                />
                            </Form.Item>
                        )}
                    </div>
                    {isDaily && (
                        <div className="db-form-row">
                            <Form.Item
                                label="Start Date"
                                name="recurring_start_date"
                                rules={[{ required: isDaily, message: "Required" }]}
                            >
                                <DatePicker style={{ width: "100%" }} format="DD MMM YYYY" />
                            </Form.Item>
                            <Form.Item
                                label="End Date (optional)"
                                name="recurring_end_date"
                                help="Leave blank to repeat until you stop it manually"
                            >
                                <DatePicker style={{ width: "100%" }} format="DD MMM YYYY" />
                            </Form.Item>
                        </div>
                    )}

                    <div className="db-form-row">
                        <Form.Item label="Assign To Type">
                            <Select
                                value={assigneeType}
                                onChange={(v) => {
                                    setAssigneeType(v);
                                    createForm.setFieldsValue({ assigned_to: undefined, department: undefined });
                                    setCreateDeptId(undefined);
                                }}
                                options={[
                                    { value: "employee", label: "Employee" },
                                    { value: "admin", label: "Admin" },
                                ]}
                            />
                        </Form.Item>
                    </div>

                    {assigneeType === "employee" ? (
                        <div className="db-form-row">
                            <Form.Item label="Department" name="department" rules={[{ required: true, message: "Required" }]}>
                                <Select
                                    placeholder="Select department"
                                    onChange={handleCreateDeptChange}
                                    options={departments.map((d) => ({ value: d.id, label: d.name }))}
                                />
                            </Form.Item>
                            <Form.Item label="Assign To" name="assigned_to" rules={[{ required: true, message: "Required" }]}>
                                <Select
                                    placeholder={createDeptId ? "Select employee" : "Select department first"}
                                    disabled={!createDeptId}
                                    options={employeesForCreateDept.map((e) => ({
                                        value: e.id,
                                        label: e.id === myId ? `${e.name} (You)` : e.name,
                                    }))}
                                />
                            </Form.Item>
                        </div>
                    ) : (
                        <div className="db-form-row">
                            <Form.Item label="Assign To (Admin)" name="assigned_to" rules={[{ required: true, message: "Required" }]}>
                                <Select
                                    placeholder="Select an admin"
                                    options={admins.map((a) => ({ value: a.id, label: a.name }))}
                                />
                            </Form.Item>
                        </div>
                    )}

                    <div className="db-form-row">
                        <Form.Item
                            label="Priority"
                            name="priority"
                            rules={[{ required: true, message: "Required" }]}
                        >
                            <Select
                                placeholder="Select priority"
                                options={priorities.map((p) => ({ value: p.value, label: p.label }))}
                            />
                        </Form.Item>
                        {/* Due Date only applies to a one-time task. For a daily
                            recurring task, each day's occurrence gets its own
                            due_date automatically (set to that day's date) —
                            hidden and skipped entirely when isDaily is true. */}
                        {!isDaily && (
                            <Form.Item
                                label="Due Date"
                                name="due_date"
                                rules={[{ required: true, message: "Required" }]}
                            >
                                <DatePicker style={{ width: "100%" }} format="DD MMM YYYY" />
                            </Form.Item>
                        )}
                    </div>

                    <Form.Item
                        label="Allotted Time (hours)"
                        name="allotted_time"
                        rules={[{ required: true, message: "Required" }]}
                    >
                        <InputNumber style={{ width: "100%" }} min={0.5} step={0.5} placeholder="e.g. 8" />
                    </Form.Item>
                </Form>
            </Modal>

            {/* ── Assign / Reassign modal — same Assign To Type toggle. When
                self-assigning, the type is locked to "employee" since a TL
                self-assigns as themselves, never as an admin. ── */}
            <Modal
                open={assignOpen}
                onCancel={() => setAssignOpen(false)}
                onOk={handleAssignSave}
                confirmLoading={assigning}
                title={
                    <span style={{ display: "flex", alignItems: "center", gap: 8 }}>
                        <UserSwitchOutlined /> {selfAssignMode ? "Self Assign Task" : (assignTarget?.assigned_to || assignTarget?.assigned_to_admin) ? "Reassign Task" : "Assign Task"}
                    </span>
                }
                okText={selfAssignMode ? "Assign to Me" : (assignTarget?.assigned_to || assignTarget?.assigned_to_admin) ? "Save Changes" : "Assign"}
                width={640}
                centered
                destroyOnClose
            >
                {assignTarget && (
                    <>
                        <div style={{
                            display: "flex", alignItems: "center", gap: 8, marginBottom: 16,
                            padding: "8px 12px", background: "var(--bg-input)", borderRadius: 8,
                        }}>
                            <Tag style={{ margin: 0 }}>{assignTarget.task_id}</Tag>
                            <span style={{ fontSize: 13, fontWeight: 600, color: "var(--text-primary)" }}>
                                {assignTarget.task_name}
                            </span>
                        </div>

                        <Form form={assignForm} layout="vertical">
                            <div className="db-form-row">
                                <Form.Item label="Assign To Type">
                                    <Select
                                        value={assignAssigneeType}
                                        disabled={selfAssignMode}
                                        onChange={(v) => {
                                            setAssignAssigneeType(v);
                                            assignForm.setFieldsValue({ assigned_to: undefined, department: undefined });
                                            setAssignDeptId(undefined);
                                        }}
                                        options={[
                                            { value: "employee", label: "Employee" },
                                            { value: "admin", label: "Admin" },
                                        ]}
                                    />
                                </Form.Item>
                            </div>

                            {assignAssigneeType === "employee" ? (
                                <div className="db-form-row">
                                    <Form.Item
                                        label="Department"
                                        name="department"
                                        rules={[{ required: true, message: "Required" }]}
                                    >
                                        <Select
                                            placeholder="Select department"
                                            onChange={handleAssignDeptChange}
                                            disabled={selfAssignMode}
                                            options={departments.map((d) => ({ value: d.id, label: d.name }))}
                                        />
                                    </Form.Item>
                                    <Form.Item
                                        label="Assign To"
                                        name="assigned_to"
                                        rules={[{ required: true, message: "Required" }]}
                                    >
                                        <Select
                                            placeholder={assignDeptId ? "Select employee" : "Select department first"}
                                            disabled={selfAssignMode || !assignDeptId}
                                            options={employeesForSelectedDept.map((e) => ({ value: e.id, label: e.name }))}
                                        />
                                    </Form.Item>
                                </div>
                            ) : (
                                <div className="db-form-row">
                                    <Form.Item
                                        label="Assign To (Admin)"
                                        name="assigned_to"
                                        rules={[{ required: true, message: "Required" }]}
                                    >
                                        <Select
                                            placeholder="Select an admin"
                                            options={admins.map((a) => ({ value: a.id, label: a.name }))}
                                        />
                                    </Form.Item>
                                </div>
                            )}

                            <div className="db-form-row">
                                <Form.Item
                                    label="Priority"
                                    name="priority"
                                    rules={[{ required: true, message: "Required" }]}
                                >
                                    <Select
                                        placeholder="Select priority"
                                        options={priorities.map((p) => ({ value: p.value, label: p.label }))}
                                    />
                                </Form.Item>
                                <Form.Item
                                    label="Due Date"
                                    name="due_date"
                                    rules={[{ required: true, message: "Required" }]}
                                >
                                    <DatePicker style={{ width: "100%" }} format="DD MMM YYYY" />
                                </Form.Item>
                            </div>

                            <Form.Item
                                label="Allotted Time (hours)"
                                name="allotted_time"
                                rules={[{ required: true, message: "Required" }]}
                            >
                                <InputNumber
                                    style={{ width: "100%" }}
                                    min={0.5}
                                    step={0.5}
                                    placeholder="e.g. 8"
                                />
                            </Form.Item>
                        </Form>
                    </>
                )}
            </Modal>

            <Modal
                open={cancelOpen}
                onCancel={() => setCancelOpen(false)}
                onOk={handleCancelConfirm}
                confirmLoading={cancelling}
                title="Cancel Task"
                okText="Confirm Cancel"
                okButtonProps={{ danger: true }}
                width={480}
                centered
                destroyOnClose
            >
                {cancelTarget && (
                    <>
                        <div style={{
                            display: "flex", alignItems: "center", gap: 8, marginBottom: 16,
                            padding: "8px 12px", background: "var(--bg-input)", borderRadius: 8,
                        }}>
                            <Tag style={{ margin: 0 }}>{cancelTarget.task_id}</Tag>
                            <span style={{ fontSize: 13, fontWeight: 600 }}>{cancelTarget.task_name}</span>
                        </div>
                        <Form form={cancelForm} layout="vertical">
                            <Form.Item
                                label="Reason for cancellation"
                                name="reason"
                                rules={[{ required: true, message: "Please provide a reason" }]}
                            >
                                <Input.TextArea rows={3} placeholder="Why is this task being cancelled?" />
                            </Form.Item>
                        </Form>
                    </>
                )}
            </Modal>

            <TaskMasterAddModal
                open={addTaskMasterOpen}
                onClose={() => setAddTaskMasterOpen(false)}
                onSaved={fetchTaskMaster}
                prefillProjectName={taskMasterPrefillProject}
                onCreated={(created) => {
                    const dueDate = dayjs().add(Number(created.default_hours), "hour");
                    createForm.setFieldsValue({
                        project_name: created.project_name,
                        task_name: created.task_name,
                        allotted_time: created.default_hours,
                        ...(isDaily ? {} : { due_date: dueDate }),
                    });
                    setCreateProjectName(created.project_name);
                }}
            />
        </div>
    );
}