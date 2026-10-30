import { useEffect, useState, useCallback, useMemo } from "react";
import { Table, Button, Input, Select, message, Popconfirm, Checkbox, Tooltip, Badge } from "antd";
import { SearchOutlined, ReloadOutlined, StopOutlined, CheckCircleOutlined, CloseCircleOutlined } from "@ant-design/icons";
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

interface RecurringTaskDefinition {
    id: number;
    project_name: string | null;
    task_name: string;
    task_details: string;
    assigned_to: number | null;
    assigned_to_name: string | null;
    assignee_role?: string | null;
    priority: string | null;
    allotted_time: number | null;
    frequency: string;
    start_date: string;
    end_date: string | null;
    weekdays: number[];
    excluded_dates: string[];
    is_active: boolean;
    created_at: string;
}

const PRIORITY_COLOR: Record<string, { color: string; bg: string }> = {
    low: { color: "var(--green)", bg: "var(--green-bg)" },
    medium: { color: "var(--blue)", bg: "var(--blue-bg)" },
    high: { color: "var(--amber)", bg: "var(--amber-bg)" },
    urgent: { color: "var(--red)", bg: "var(--red-bg)" },
};

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

export default function Upcoming_Scheduled_Tasks_TL() {
    const [definitions, setDefinitions] = useState<RecurringTaskDefinition[]>([]);
    const [loading, setLoading] = useState(true);
    const [search, setSearch] = useState("");
    const [priorityFilter, setPriorityFilter] = useState<string | undefined>(undefined);
    const [togglingDateKey, setTogglingDateKey] = useState<string | null>(null);
    const [busyStopId, setBusyStopId] = useState<number | null>(null);

    const fetchDefinitions = useCallback(() => {
        setLoading(true);
        fetch(`${BASE_URL}/api/tasks/recurring/mine/`, { headers: { ...authHeaders() } })
            .then((r) => r.json())
            .then((d) => setDefinitions(Array.isArray(d) ? d : d.results || []))
            .catch(() => message.error("Failed to load your scheduled tasks"))
            .finally(() => setLoading(false));
    }, []);

    useEffect(() => {
        fetchDefinitions();
    }, [fetchDefinitions]);

    const handleToggleDate = async (taskDefId: number, dateStr: string) => {
        const key = `${taskDefId}_${dateStr}`;
        setTogglingDateKey(key);

        try {
            const res = await fetch(`${BASE_URL}/api/tasks/recurring/${taskDefId}/toggle_date/`, {
                method: "POST",
                headers: { "Content-Type": "application/json", ...authHeaders() },
                body: JSON.stringify({ date: dateStr }),
            });

            if (res.ok) {
                const data = await res.json();
                if (data.action === "excluded") {
                    message.warning(`Task unscheduled for ${dayjs(dateStr).format("DD MMM (ddd)")}`);
                } else {
                    message.success(`Task scheduled for ${dayjs(dateStr).format("DD MMM (ddd)")}`);
                }
                setDefinitions((prev) =>
                    prev.map((item) => (item.id === taskDefId ? data.definition : item))
                );
            } else {
                const err = await res.json().catch(() => ({}));
                message.error(err.detail || "Failed to update schedule date");
            }
        } catch {
            message.error("Network error while updating date");
        } finally {
            setTogglingDateKey(null);
        }
    };

    const handleStop = async (definition: RecurringTaskDefinition) => {
        setBusyStopId(definition.id);
        try {
            const res = await fetch(`${BASE_URL}/api/tasks/recurring/${definition.id}/stop/`, {
                method: "POST",
                headers: { "Content-Type": "application/json", ...authHeaders() },
            });
            if (res.ok) {
                message.success("Schedule stopped successfully");
                fetchDefinitions();
            } else {
                const err = await res.json().catch(() => ({}));
                message.error(err.detail || "Failed to stop schedule");
            }
        } catch {
            message.error("Network error");
        } finally {
            setBusyStopId(null);
        }
    };

    const filtered = useMemo(() => {
        return definitions.filter((d) => {
            if (priorityFilter && d.priority !== priorityFilter) return false;
            if (search.trim()) {
                const q = search.toLowerCase();
                if (![d.task_name, d.task_details, d.assigned_to_name, d.project_name].some((f) => f?.toLowerCase().includes(q))) return false;
            }
            return true;
        });
    }, [definitions, search, priorityFilter]);

    // Generates list of upcoming days (starting from TODAY onwards)
    function getScheduleDays(record: RecurringTaskDefinition) {
        const days: { dateStr: string; label: string }[] = [];
        const today = dayjs().startOf("day");
        const startDate = dayjs(record.start_date).startOf("day");

        // If the task schedule already ended before today, no upcoming days
        if (record.end_date && dayjs(record.end_date).startOf("day").isBefore(today)) {
            return [];
        }

        // Start from whichever is later: today or start_date
        const start = startDate.isAfter(today) ? startDate : today;

        // Show up to end_date (or next 14 days from start if ongoing)
        const end = record.end_date
            ? dayjs(record.end_date).startOf("day")
            : start.add(14, "day");

        let curr = start;
        const maxDays = 30; // limit visible chips
        let count = 0;

        while ((curr.isBefore(end) || curr.isSame(end, "day")) && count < maxDays) {
            // Python weekday: Mon=0 ... Sun=6 -> dayjs weekday: Sun=0 ... Sat=6
            const pyWeekday = (curr.day() + 6) % 7;
            const isMatch = (record.weekdays || []).includes(pyWeekday);

            if (isMatch) {
                days.push({
                    dateStr: curr.format("YYYY-MM-DD"),
                    label: curr.isSame(today, "day")
                        ? `Today - ${curr.format("DD MMM (ddd)")}`
                        : curr.format("DD MMM (ddd)"),
                });
            }
            curr = curr.add(1, "day");
            count++;
        }
        return days;
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

    const columns: ColumnsType<RecurringTaskDefinition> = [
        {
            title: "Project / Task",
            key: "task_name",
            width: 220,
            render: (_: any, record: RecurringTaskDefinition) => (
                <div>
                    {record.project_name && (
                        <div style={{ fontSize: 11, fontWeight: 700, color: "var(--blue)", marginBottom: 2 }}>
                            {record.project_name}
                        </div>
                    )}
                    <div style={{ fontSize: 13, fontWeight: 600, color: "var(--text-primary)" }}>
                        {record.task_name}
                    </div>
                    {record.task_details && (
                        <div style={{
                            fontSize: 11, color: "var(--text-secondary)", marginTop: 2,
                            maxWidth: 200, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
                        }}>
                            {record.task_details}
                        </div>
                    )}
                </div>
            ),
        },
        {
            title: "Assigned To",
            dataIndex: "assigned_to_name",
            key: "assigned_to_name",
            width: 140,
            render: (v: string | null) => (
                <div style={{ fontSize: 12.5, fontWeight: 600, color: "var(--text-primary)" }}>
                    {v || "Unassigned"}
                </div>
            ),
        },
        {
            title: "Priority",
            dataIndex: "priority",
            key: "priority",
            width: 90,
            render: (v: string | null) => <PriorityTag priority={v} />,
        },
        {
            title: "Allotted Time",
            dataIndex: "allotted_time",
            key: "allotted_time",
            width: 110,
            render: (v: number | null) => (
                <span className="td-num" style={{ fontSize: 12 }}>{formatAllottedTime(v) ?? "—"}</span>
            ),
        },
        {
            title: "Date Range",
            key: "date_range",
            width: 170,
            render: (_: any, record: RecurringTaskDefinition) => (
                <div style={{ fontSize: 12, color: "var(--text-secondary)" }}>
                    <div><strong>From:</strong> {dayjs(record.start_date).format("DD MMM YYYY")}</div>
                    <div><strong>To:</strong> {record.end_date ? dayjs(record.end_date).format("DD MMM YYYY") : "Ongoing"}</div>
                </div>
            ),
        },
        {
            title: "Scheduled Days (Tick = Active | Untick = Skip Day)",
            key: "scheduled_days",
            render: (_: any, record: RecurringTaskDefinition) => {
                const days = getScheduleDays(record);
                const excludedSet = new Set(record.excluded_dates || []);

                if (days.length === 0) {
                    return <span style={{ color: "var(--text-muted)", fontSize: 12 }}>No active weekdays in range</span>;
                }

                return (
                    <div style={{ display: "flex", flexWrap: "wrap", gap: 8, padding: "4px 0" }}>
                        {days.map((d) => {
                            const isExcluded = excludedSet.has(d.dateStr);
                            const isChecked = !isExcluded;
                            const isBusy = togglingDateKey === `${record.id}_${d.dateStr}`;

                            return (
                                <Tooltip
                                    key={d.dateStr}
                                    title={
                                        isExcluded
                                            ? `Skipped / Excluded. Click to schedule task for this day.`
                                            : `Scheduled. Untick to skip task on this day.`
                                    }
                                >
                                    <div
                                        style={{
                                            display: "inline-flex",
                                            alignItems: "center",
                                            gap: 6,
                                            padding: "4px 10px",
                                            borderRadius: 8,
                                            border: `1px solid ${isChecked ? "var(--green)" : "var(--border)"}`,
                                            background: isChecked ? "var(--green-bg)" : "var(--bg-input)",
                                            cursor: record.is_active ? "pointer" : "not-allowed",
                                            opacity: isChecked ? 1 : 0.65,
                                            transition: "all 0.2s ease",
                                        }}
                                        onClick={() => {
                                            if (record.is_active && !isBusy) {
                                                handleToggleDate(record.id, d.dateStr);
                                            }
                                        }}
                                    >
                                        <Checkbox
                                            checked={isChecked}
                                            disabled={!record.is_active || isBusy}
                                            style={{ pointerEvents: "none" }}
                                        />
                                        <span
                                            style={{
                                                fontSize: 11.5,
                                                fontWeight: 600,
                                                color: isChecked ? "var(--green)" : "var(--text-muted)",
                                                textDecoration: isExcluded ? "line-through" : "none",
                                            }}
                                        >
                                            {d.label}
                                        </span>
                                        {isExcluded ? (
                                            <CloseCircleOutlined style={{ color: "var(--red)", fontSize: 11 }} />
                                        ) : (
                                            <CheckCircleOutlined style={{ color: "var(--green)", fontSize: 11 }} />
                                        )}
                                    </div>
                                </Tooltip>
                            );
                        })}
                    </div>
                );
            },
        },
        {
            title: "Created",
            dataIndex: "created_at",
            key: "created_at",
            width: 140,
            render: (v: string) => (
                <span style={{ fontSize: 12, color: "var(--text-secondary)" }}>
                    {dayjs(v).format("DD MMM YYYY, HH:mm")}
                </span>
            ),
        },
        {
            title: "Actions",
            key: "actions",
            width: 100,
            fixed: "right",
            render: (_: any, record: RecurringTaskDefinition) => {
                if (!record.is_active) {
                    return <Badge status="default" text="Stopped" style={{ fontSize: 11 }} />;
                }
                return (
                    <Popconfirm
                        title="Stop full schedule?"
                        description="Stops future task generation completely."
                        okText="Stop"
                        okButtonProps={{ danger: true }}
                        onConfirm={() => handleStop(record)}
                    >
                        <Button
                            size="small"
                            danger
                            loading={busyStopId === record.id}
                            icon={<StopOutlined />}
                            style={{ fontSize: 11, fontWeight: 600, borderRadius: 6 }}
                        >
                            Stop
                        </Button>
                    </Popconfirm>
                );
            },
        },
    ];

    return (
        <div>
            <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 20, flexWrap: "wrap" }}>
                <Input
                    placeholder="Search by task or employee…"
                    prefix={<SearchOutlined style={{ color: "var(--text-muted)" }} />}
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    allowClear
                    style={{
                        flex: 1, minWidth: 220, maxWidth: 450, height: 35, padding: "0 14px",
                        background: "var(--bg-input)", border: "1px solid var(--accent-light)",
                        borderRadius: 9, color: "var(--text-primary)", fontSize: 13,
                    }}
                />
                <Select
                    placeholder="Priority"
                    allowClear
                    value={priorityFilter}
                    onChange={setPriorityFilter}
                    style={{ width: 140 }}
                    options={[
                        { value: "low", label: "Low" },
                        { value: "medium", label: "Medium" },
                        { value: "high", label: "High" },
                        { value: "urgent", label: "Urgent" },
                    ]}
                />
                <Button
                    onClick={fetchDefinitions}
                    icon={<ReloadOutlined />}
                    style={{ height: 35, fontSize: 12, fontWeight: 600, display: "flex", alignItems: "center", gap: 6 }}
                >
                    Refresh
                </Button>
            </div>

            <div style={{
                background: "var(--bg-card)", borderRadius: 14, border: "1px solid var(--border)",
                overflow: "hidden", boxShadow: "var(--shadow-card)",
            }}>
                <Table
                    columns={columns}
                    dataSource={filtered}
                    rowKey="id"
                    scroll={{ x: 1300 }}
                    loading={loading}
                    pagination={{
                        pageSize: 10,
                        showSizeChanger: true,
                        pageSizeOptions: ["10", "20", "50"],
                        showTotal: (total, range) => `${range[0]}–${range[1]} of ${total} schedules`,
                        style: { padding: "12px 16px", color: "var(--text-primary)" },
                    }}
                />
            </div>
        </div>
    );
}