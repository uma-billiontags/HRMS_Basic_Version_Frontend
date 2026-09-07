import { useEffect, useState, useCallback, useMemo } from "react";
import { Table, Button, Input, Select, message, Tooltip } from "antd";
import { SearchOutlined, ReloadOutlined, CalendarOutlined, CheckCircleOutlined, CloseCircleOutlined } from "@ant-design/icons";
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
    assigned_to_name: string | null;
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

function formatAllottedTime(hours: number | null): string {
    if (hours === null || hours === undefined) return "—";
    const totalMinutes = Math.round(hours * 60);
    const h = Math.floor(totalMinutes / 60);
    const m = totalMinutes % 60;
    if (h && m) return `${h}h ${m}m`;
    if (h) return `${h}h`;
    return `${m}m`;
}

export default function My_Upcoming_Task_Admin() {
    const [definitions, setDefinitions] = useState<RecurringTaskDefinition[]>([]);
    const [loading, setLoading] = useState(true);
    const [search, setSearch] = useState("");
    const [priorityFilter, setPriorityFilter] = useState<string | undefined>(undefined);

    const fetchDefinitions = useCallback(() => {
        setLoading(true);
        fetch(`${BASE_URL}/api/tasks/recurring/assigned_to_me/`, { headers: { ...authHeaders() } })
            .then((r) => r.json())
            .then((d) => setDefinitions(Array.isArray(d) ? d : d.results || []))
            .catch(() => message.error("Failed to load your upcoming tasks"))
            .finally(() => setLoading(false));
    }, []);

    useEffect(() => {
        fetchDefinitions();
    }, [fetchDefinitions]);

    const filtered = useMemo(() => {
        return definitions.filter((d) => {
            if (priorityFilter && d.priority !== priorityFilter) return false;
            if (search.trim()) {
                const q = search.toLowerCase();
                if (![d.task_name, d.task_details, d.project_name].some((f) => f?.toLowerCase().includes(q))) return false;
            }
            return true;
        });
    }, [definitions, search, priorityFilter]);

    function getScheduleDays(record: RecurringTaskDefinition) {
        const days: { dateStr: string; label: string }[] = [];
        const today = dayjs().startOf("day");
        const startDate = dayjs(record.start_date).startOf("day");

        if (record.end_date && dayjs(record.end_date).startOf("day").isBefore(today)) {
            return [];
        }

        const start = startDate.isAfter(today) ? startDate : today;
        const end = record.end_date ? dayjs(record.end_date).startOf("day") : start.add(14, "day");

        let curr = start;
        const maxDays = 30;
        let count = 0;

        while ((curr.isBefore(end) || curr.isSame(end, "day")) && count < maxDays) {
            const pyWeekday = (curr.day() + 6) % 7;
            const isMatch = (record.weekdays || []).includes(pyWeekday);

            if (isMatch) {
                days.push({
                    dateStr: curr.format("YYYY-MM-DD"),
                    label: curr.isSame(today, "day") ? `Today - ${curr.format("DD MMM (ddd)")}` : curr.format("DD MMM (ddd)"),
                });
            }
            curr = curr.add(1, "day");
            count++;
        }
        return days;
    }

    const columns: ColumnsType<RecurringTaskDefinition> = [
        {
            title: "Project / Task",
            key: "task_name",
            width: 250,
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
                            maxWidth: 220, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
                        }}>
                            {record.task_details}
                        </div>
                    )}
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
                <span className="td-num" style={{ fontSize: 12 }}>{formatAllottedTime(v)}</span>
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
            title: "Upcoming Scheduled Days",
            key: "scheduled_days",
            render: (_: any, record: RecurringTaskDefinition) => {
                const days = getScheduleDays(record);
                const excludedSet = new Set(record.excluded_dates || []);

                if (days.length === 0) {
                    return <span style={{ color: "var(--text-muted)", fontSize: 12 }}>No upcoming scheduled days</span>;
                }

                return (
                    <div style={{ display: "flex", flexWrap: "wrap", gap: 8, padding: "4px 0" }}>
                        {days.map((d) => {
                            const isExcluded = excludedSet.has(d.dateStr);
                            return (
                                <Tooltip
                                    key={d.dateStr}
                                    title={isExcluded ? "Task skipped on this day" : "Scheduled to run"}
                                >
                                    <div
                                        style={{
                                            display: "inline-flex",
                                            alignItems: "center",
                                            gap: 6,
                                            padding: "4px 10px",
                                            borderRadius: 8,
                                            border: `1px solid ${!isExcluded ? "var(--green)" : "var(--border)"}`,
                                            background: !isExcluded ? "var(--green-bg)" : "var(--bg-input)",
                                            opacity: !isExcluded ? 1 : 0.6,
                                        }}
                                    >
                                        <span
                                            style={{
                                                fontSize: 11.5,
                                                fontWeight: 600,
                                                color: !isExcluded ? "var(--green)" : "var(--text-muted)",
                                                textDecoration: isExcluded ? "line-through" : "none",
                                            }}
                                        >
                                            {d.label}
                                        </span>
                                        {!isExcluded ? (
                                            <CheckCircleOutlined style={{ color: "var(--green)", fontSize: 11 }} />
                                        ) : (
                                            <CloseCircleOutlined style={{ color: "var(--red)", fontSize: 11 }} />
                                        )}
                                    </div>
                                </Tooltip>
                            );
                        })}
                    </div>
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
                    <h1 style={{
                        fontSize: 18, fontWeight: 700, margin: 0, color: "var(--accent)",
                        display: "flex", alignItems: "center", gap: 8,
                    }}>
                        <CalendarOutlined />
                        My Upcoming Tasks
                    </h1>
                    <p style={{
                        fontSize: 9, color: "var(--text-muted)", margin: "4px 0 0",
                        fontWeight: 500, letterSpacing: "0.04em", textTransform: "uppercase",
                    }}>
                        Your personal upcoming scheduled tasks
                    </p>
                </div>
            </div>

            <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 20, flexWrap: "wrap" }}>
                <Input
                    placeholder="Search by task or project…"
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
                    scroll={{ x: 1000 }}
                    loading={loading}
                    pagination={{
                        pageSize: 10,
                        showSizeChanger: true,
                        pageSizeOptions: ["10", "20", "50"],
                        showTotal: (total, range) => `${range[0]}–${range[1]} of ${total} tasks`,
                        style: { padding: "12px 16px", color: "var(--text-primary)" },
                    }}
                />
            </div>
        </div>
    );
}