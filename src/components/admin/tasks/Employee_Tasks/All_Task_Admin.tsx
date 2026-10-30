import { useEffect, useState, useCallback, useMemo } from "react";

import { Table, Button, Input, Modal, Select, Form, message, DatePicker, TimePicker, InputNumber, Tag, Dropdown, Checkbox } from "antd";

import {

    SearchOutlined, ReloadOutlined, PlusOutlined, UserSwitchOutlined,

    FileTextOutlined, PauseCircleOutlined, PlayCircleOutlined,

    StopOutlined, MoreOutlined, SortAscendingOutlined, SortDescendingOutlined

} from "@ant-design/icons";

import type { MenuProps } from "antd";

import type { ColumnsType } from "antd/es/table";

import dayjs from "dayjs";

import TaskMasterAddModal from "./TaskMasterAddModal";

import BulkUploadTasksModal from "./BulkUploadTasksModal";

import { UploadOutlined } from "@ant-design/icons";



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



interface PriorityOption {

    value: string;

    label: string;

}



type TaskStatus =

    | "not_started" | "in_progress" | "paused"

    | "rework_needed" | "completed" | "on_hold";



interface Task {

    id: number;

    task_id: string;

    sub_task_id?: string; // <-- Add this

    project_name: string;          // ← NEW

    task_name: string;

    task_details: string;

    department: number | null;

    department_name: string | null;

    assigned_to: number | null;

    assigned_to_name: string | null;

    assigned_by_name: string | null;

    priority: string | null;

    due_date: string | null;

    due_time?: string | null;  // <-- ADD THIS

    allotted_time: number | null;

    task_status: TaskStatus;

    assigned_date: string;

}



interface TaskMasterOption {

    id: number;

    project_name: string;

    task_name: string;

    default_hours: number;

    label: string;

}



const ALL_STATUSES: TaskStatus[] = [

    "not_started", "in_progress", "paused",

    "rework_needed", "on_hold",

];



const ACTIONABLE_STATUSES: TaskStatus[] = [

    "not_started", "in_progress", "paused",

    "rework_needed", "on_hold",

];



// Terminal states — days-to-go doesn't make sense once work is over.

const TERMINAL_STATUSES: TaskStatus[] = ["completed"];



const STATUS_META: Record<TaskStatus, { label: string; color: string; bg: string }> = {

    not_started: { label: "Not Started", color: "var(--text-secondary)", bg: "var(--bg-input)" },

    in_progress: { label: "In Progress", color: "var(--blue)", bg: "var(--blue-bg)" },

    paused: { label: "Paused", color: "var(--amber)", bg: "var(--amber-bg)" },


    rework_needed: { label: "Rework Needed", color: "var(--red)", bg: "var(--red-bg)" },

    completed: { label: "Completed", color: "var(--green)", bg: "var(--green-bg)" },

    on_hold: { label: "On Hold", color: "var(--amber)", bg: "var(--amber-bg)" },
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

const DEFAULT_WEEKDAYS = [0, 1, 2, 3, 4, 5];



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



export default function All_Task_Admin() {

    const [tasks, setTasks] = useState<Task[]>([]);

    const [departments, setDepartments] = useState<Department[]>([]);

    const [employees, setEmployees] = useState<EmployeeOption[]>([]);

    const [priorities, setPriorities] = useState<PriorityOption[]>([]);

    const [loading, setLoading] = useState(true);



    const [search, setSearch] = useState("");

    const [statusFilter, setStatusFilter] = useState<string | undefined>(undefined);

    const [priorityFilter, setPriorityFilter] = useState<string | undefined>(undefined);



    const [createOpen, setCreateOpen] = useState(false);

    const [creating, setCreating] = useState(false);

    const [createForm] = Form.useForm();



    const [isDaily, setIsDaily] = useState(false);

    const [selectedWeekdays, setSelectedWeekdays] = useState<number[]>(DEFAULT_WEEKDAYS);



    const [assignOpen, setAssignOpen] = useState(false);

    const [assigning, setAssigning] = useState(false);

    const [assignTarget, setAssignTarget] = useState<Task | null>(null);

    const [assignDeptId, setAssignDeptId] = useState<string | undefined>(undefined);

    const [assignForm] = Form.useForm();



    const [busyId, setBusyId] = useState<number | null>(null);

    const [cancelOpen, setCancelOpen] = useState(false);

    const [cancelTarget, setCancelTarget] = useState<Task | null>(null);

    const [cancelling, setCancelling] = useState(false);

    const [cancelForm] = Form.useForm();



    const [createDeptId, setCreateDeptId] = useState<string | undefined>(undefined);

    const [addTaskMasterOpen, setAddTaskMasterOpen] = useState(false);



    const [taskMasterList, setTaskMasterList] = useState<TaskMasterOption[]>([]);



    const [taskMasterPrefillProject, setTaskMasterPrefillProject] = useState<string | undefined>(undefined);

    const [customProjects, setCustomProjects] = useState<string[]>(() => {

        try {

            const saved = localStorage.getItem("custom_projects");

            return saved ? JSON.parse(saved) : [];

        } catch {

            return [];

        }

    });



    const [bulkUploadOpen, setBulkUploadOpen] = useState(false);



    const fetchTasks = useCallback(() => {

        setLoading(true);

        fetch(`${BASE_URL}/api/tasks/get_all_tasks/`, {

            headers: { ...authHeaders() },

        })

            .then((r) => r.json())

            .then((d) => {

                const all: Task[] = Array.isArray(d) ? d : d.results || [];

                setTasks(all);

            })

            .catch(() => message.error("Failed to load tasks"))

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

            .then((r) => (r.ok ? r.json() : []))

            .then((d) => setTaskMasterList(Array.isArray(d) ? d : d.results || []))

            .catch(() => setTaskMasterList([]));

    }, []);



    useEffect(() => {

        fetchTasks();

        fetchDepartments();

        fetchEmployees();

        fetchPriorities();

        fetchTaskMaster();

    }, [fetchTasks, fetchDepartments, fetchEmployees, fetchPriorities, fetchTaskMaster]);



    const totalTasks = tasks.length;

    const inProgressTasks = tasks.filter((t) => t.task_status === "in_progress").length;

    const onHoldTasks = tasks.filter((t) => t.task_status === "on_hold").length;

    const completedTasks = tasks.filter((t) => t.task_status === "completed").length;



    const filtered = useMemo(() => {

        return tasks.filter((t) => {

            if (statusFilter && t.task_status !== statusFilter) return false;

            if (priorityFilter && t.priority !== priorityFilter) return false;

            if (search.trim()) {

                const q = search.toLowerCase();

                const haystack = [

                    t.task_id, t.sub_task_id, t.project_name, t.task_name, t.task_details,

                    t.assigned_to_name, t.department_name,

                ];

                if (!haystack.some((f) => f?.toLowerCase().includes(q))) return false;

            }

            return true;

        });

    }, [tasks, search, statusFilter, priorityFilter]);



    const openCreate = () => {

        createForm.resetFields();

        createForm.setFieldsValue({

            start_date: dayjs(),

        });

        setCreateDeptId(undefined);

        setIsDaily(false);

        setSelectedWeekdays(DEFAULT_WEEKDAYS);

        setCreateOpen(true);

    };



    const handleCreateDeptChange = (deptName: string) => {

        setCreateDeptId(deptName);

        createForm.setFieldsValue({ assigned_to: undefined });

    };



    const employeesForCreateDept = employees.filter((e) => e.department === createDeptId);



    const projectNameOptions = useMemo(() => {

        const fromCatalog = taskMasterList.map((t) => t.project_name);

        const fromTasks = tasks.map((t) => t.project_name);

        const allNames = Array.from(new Set([...fromCatalog, ...fromTasks, ...customProjects].filter(Boolean)));

        return allNames.map((n) => ({ value: n, label: n }));

    }, [taskMasterList, tasks, customProjects]);



    const handleDurationChange = () => {

        const h = Number(createForm.getFieldValue("allotted_hours") || 0);

        const m = Number(createForm.getFieldValue("allotted_minutes") || 0);

        const totalMinutes = h * 60 + m;



        if (totalMinutes > 0) {

            const startDate = createForm.getFieldValue("start_date") || dayjs();

            if (!createForm.getFieldValue("start_date")) {

                createForm.setFieldsValue({ start_date: startDate });

            }

            const targetDateTime = startDate.add(totalMinutes, "minute");

            createForm.setFieldsValue({

                due_date: targetDateTime,

                due_time: targetDateTime,

            });

        }

    };



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



        const hours = Number(values.allotted_hours || 0);

        const minutes = Number(values.allotted_minutes || 0);

        const totalMinutes = hours * 60 + minutes;

        if (totalMinutes <= 0) {

            message.error("Please enter allotted time in hours or minutes.");

            return;

        }

        const allottedTime = Math.round((totalMinutes / 60) * 100) / 100;



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

                    assigned_to: values.assigned_to,

                    priority: values.priority,

                    allotted_time: allottedTime,

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

                    assigned_to: values.assigned_to,

                    priority: values.priority,

                    start_date: values.start_date ? values.start_date.format("YYYY-MM-DD") : null,

                    due_date: values.due_date ? values.due_date.format("YYYY-MM-DD") : null,

                    due_time: values.due_time ? values.due_time.format("HH:mm:ss") : null,

                    allotted_time: allottedTime,

                };



            const res = await fetch(url, {

                method: "POST",

                headers: { "Content-Type": "application/json", ...authHeaders() },

                body: JSON.stringify(body),

            });



            if (res.ok) {

                message.success(isDaily ? "Daily task scheduled" : "Task created and assigned");

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

    const openAssign = (record: Task) => {

        setAssignTarget(record);

        setAssignDeptId(record.department_name ?? undefined);

        assignForm.setFieldsValue({

            department: record.department_name ?? undefined,

            assigned_to: record.assigned_to ?? undefined,

            priority: record.priority ?? undefined,

            due_date: record.due_date ? dayjs(record.due_date) : undefined,

            due_time: record.due_time ? dayjs(`1970-01-01T${record.due_time}`) : undefined, // <-- ADD THIS

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

                    assigned_to: values.assigned_to,

                    priority: values.priority,

                    due_date: values.due_date ? values.due_date.format("YYYY-MM-DD") : null,

                    due_time: values.due_time ? values.due_time.format("HH:mm:ss") : null, // <-- ADD THIS

                    allotted_time: values.allotted_time,

                }),

            });

            if (res.ok) {

                message.success(assignTarget.assigned_to ? "Task reassigned" : "Task assigned");

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



    async function callTaskAction(task: Task, action: "hold" | "release_hold", successMsg: string) {

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

                <span style={{ fontSize: 11.5, fontWeight: 700, color: "var(--blue)", background: "var(--blue-bg)", border: "1px solid var(--blue)", padding: "2px 10px", borderRadius: 6, whiteSpace: "nowrap", width: "fit-content" }}>{v}</span>

            ),

        },

        {

            title: "Sub Task ID",

            dataIndex: "sub_task_id",

            key: "sub_task_id",

            width: 100,

            render: (_: unknown, record: Task) => (

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

            title: "Due Date & Deadline",

            dataIndex: "due_date",

            key: "due_date",

            width: 150,

            render: (_: any, record: Task) => (

                <div>

                    <div style={{ fontSize: 12, color: "var(--text-secondary)" }}>

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

                if (!ACTIONABLE_STATUSES.includes(record.task_status)) {

                    return <span style={{ color: "var(--text-muted)", fontSize: 12 }}>—</span>;

                }



                const items: MenuProps["items"] = [

                    {

                        key: "assign",

                        icon: <UserSwitchOutlined />,

                        label: record.assigned_to ? "Reassign" : "Assign Task",

                        onClick: () => openAssign(record),

                    },

                ];



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

                display: "flex", justifyContent: "flex-end", alignItems: "center",

                marginBottom: 16,

            }}>

                <div style={{ display: "flex", gap: 10 }}>

                    <Button

                        onClick={() => setBulkUploadOpen(true)}

                        icon={<UploadOutlined />}

                        style={{

                            borderRadius: 9,

                            border: "1px solid var(--border)",

                            background: "#fff",

                            color: "var(--text-primary)",

                            fontSize: 12,

                            fontWeight: 700,

                            padding: "8px 16px",

                            display: "flex",

                            alignItems: "center",

                            gap: 6,

                        }}

                    >

                        Bulk Upload

                    </Button>



                    <Button onClick={openCreate} icon={<PlusOutlined />}

                        style={{

                            borderRadius: 9, border: "none", background: "var(--accent)", color: "#fff",

                            fontSize: 12, fontWeight: 700, padding: "8px 16px", display: "flex", alignItems: "center", gap: 6,

                        }}>

                        Create Task

                    </Button>

                </div>

            </div>



            <div className="db-stat-grid">

                <StatCard label="All Tasks" value={totalTasks} changeLabel="Across every status" changeType="neutral" />

                <StatCard label="In Progress" value={inProgressTasks} changeLabel="Currently active" changeType="up" />

                <StatCard label="On Hold" value={onHoldTasks} changeLabel="Paused by admin" changeType={onHoldTasks > 0 ? "down" : "neutral"} />

                <StatCard label="Completed Tasks" value={completedTasks} changeLabel="Completed task list" changeType="up" />

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

                    options={ALL_STATUSES.map((s) => ({ value: s, label: STATUS_META[s].label }))}

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

                    {filtered.length} of {tasks.length} all tasks

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

                />

            </div>



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

                okText="Create & Assign"

                width={640}

                centered

                destroyOnClose

            >

                <Form form={createForm} layout="vertical">

                    <Form.Item label="Project Name" name="project_name" rules={[{ required: true, message: "Required" }]}>

                        <Select

                            placeholder="Select or add a project"

                            showSearch

                            optionFilterProp="label"

                            options={projectNameOptions}

                            dropdownRender={(menu) => (

                                <>

                                    {menu}

                                    <div

                                        style={{

                                            padding: "8px 12px",

                                            borderTop: "1px solid #f0f0f0",

                                            display: "flex",

                                            alignItems: "center",

                                            gap: 8,

                                            color: "#1677ff",

                                            fontWeight: 600,

                                            cursor: "pointer",

                                            background: "#fafafa",

                                        }}

                                        onMouseDown={(e) => e.preventDefault()}

                                        onClick={() => {

                                            setTaskMasterPrefillProject(undefined);

                                            setAddTaskMasterOpen(true);

                                        }}

                                    >

                                        <PlusOutlined style={{ fontSize: 13, color: "#1677ff" }} />

                                        <span>Add New Project</span>

                                    </div>

                                </>

                            )}

                        />

                    </Form.Item>



                    <Form.Item label="Task Name" name="task_name" rules={[{ required: true, message: "Required" }]}>

                        <Input placeholder="Enter task name" />

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

                        <Form.Item

                            label="Department"

                            name="department"

                            rules={[{ required: true, message: "Required" }]}

                        >

                            <Select

                                placeholder="Select department"

                                onChange={handleCreateDeptChange}

                                options={departments.map((d) => ({ value: d.id, label: d.name }))}

                            />

                        </Form.Item>

                        <Form.Item

                            label="Assign To"

                            name="assigned_to"

                            rules={[{ required: true, message: "Required" }]}

                        >

                            <Select

                                placeholder={createDeptId ? "Select employee" : "Select department first"}

                                disabled={!createDeptId}

                                options={employeesForCreateDept.map((e) => ({ value: e.id, label: e.name }))}

                            />

                        </Form.Item>

                    </div>

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

                            label="Allotted Time"

                            required

                        >

                            <div style={{ display: "flex", gap: 8 }}>

                                <Form.Item

                                    name="allotted_hours"

                                    noStyle

                                    rules={[

                                        ({ getFieldValue }) => ({

                                            validator() {

                                                const h = getFieldValue("allotted_hours");

                                                const m = getFieldValue("allotted_minutes");

                                                if (

                                                    (h === undefined || h === null || h === "") &&

                                                    (m === undefined || m === null || m === "")

                                                ) {

                                                    return Promise.reject(new Error("Required"));

                                                }

                                                if (Number(h || 0) === 0 && Number(m || 0) === 0) {

                                                    return Promise.reject(new Error("Must be > 0"));

                                                }

                                                return Promise.resolve();

                                            },

                                        }),

                                    ]}

                                >

                                    <InputNumber

                                        style={{ width: "50%" }}

                                        min={0}

                                        step={1}

                                        placeholder="0"

                                        addonAfter="hrs"

                                        onChange={handleDurationChange}

                                    />

                                </Form.Item>

                                <Form.Item name="allotted_minutes" noStyle>

                                    <InputNumber

                                        style={{ width: "50%" }}

                                        min={0}

                                        max={59}

                                        step={5}

                                        placeholder="0"

                                        addonAfter="mins"

                                        onChange={handleDurationChange}

                                    />

                                </Form.Item>

                            </div>

                        </Form.Item>

                    </div>



                    {!isDaily && (

                        <div className="db-form-row">

                            <Form.Item

                                label="Start Date"

                                name="start_date"

                                rules={[{ required: true, message: "Required" }]}

                            >

                                <DatePicker

                                    style={{ width: "100%" }}

                                    format="DD MMM YYYY"

                                    onChange={(date) => {

                                        if (date) {

                                            const h = Number(createForm.getFieldValue("allotted_hours") || 0);

                                            const m = Number(createForm.getFieldValue("allotted_minutes") || 0);

                                            const totalMinutes = h * 60 + m;

                                            if (totalMinutes > 0) {

                                                const target = date.add(totalMinutes, "minute");

                                                createForm.setFieldsValue({

                                                    due_date: target,

                                                    due_time: target,

                                                });

                                            } else {

                                                createForm.setFieldsValue({

                                                    due_date: date,

                                                });

                                            }

                                        }

                                    }}

                                />

                            </Form.Item>



                            <Form.Item

                                label="Due Date"

                                name="due_date"

                                rules={[{ required: true, message: "Required" }]}

                            >

                                <DatePicker style={{ width: "100%" }} format="DD MMM YYYY" />

                            </Form.Item>

                            <Form.Item

                                label="Deadline Time"

                                name="due_time"

                                rules={[{ required: false }]}

                            >

                                <TimePicker

                                    style={{ width: "100%" }}

                                    format="hh:mm A"

                                    use12Hours

                                    placeholder="e.g. 03:00 PM"

                                />

                            </Form.Item>

                        </div>

                    )}



                </Form>

            </Modal>

            <Modal

                open={assignOpen}

                onCancel={() => setAssignOpen(false)}

                onOk={handleAssignSave}

                confirmLoading={assigning}

                title={

                    <span style={{ display: "flex", alignItems: "center", gap: 8 }}>

                        <UserSwitchOutlined /> {assignTarget?.assigned_to ? "Reassign Task" : "Assign Task"}

                    </span>

                }

                okText={assignTarget?.assigned_to ? "Save Changes" : "Assign"}

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

                                <Form.Item

                                    label="Department"

                                    name="department"

                                    rules={[{ required: true, message: "Required" }]}

                                >

                                    <Select

                                        placeholder="Select department"

                                        onChange={handleAssignDeptChange}

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

                                        disabled={!assignDeptId}

                                        options={employeesForSelectedDept.map((e) => ({ value: e.id, label: e.name }))}

                                    />

                                </Form.Item>

                            </div>



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

                            <Form.Item label="Deadline Time" name="due_time">

                                <TimePicker style={{ width: "100%" }} format="hh:mm A" use12Hours placeholder="e.g. 03:00 PM" />

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

                    const projName = typeof created === "string" ? created : created?.project_name;

                    if (!projName) return;

                    setCustomProjects((prev) => {

                        if (prev.includes(projName)) return prev;

                        const updated = [...prev, projName];

                        localStorage.setItem("custom_projects", JSON.stringify(updated));

                        return updated;

                    });

                    createForm.setFieldsValue({

                        project_name: projName,

                    });

                }}

            />

            <BulkUploadTasksModal

                open={bulkUploadOpen}

                onClose={() => setBulkUploadOpen(false)}

                onSuccess={fetchTasks}

                departments={departments}

                employees={employees}

            />

        </div>

    );

}