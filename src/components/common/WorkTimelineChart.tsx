import { useEffect, useState, useCallback, useMemo } from "react";
import {
    Card,
    DatePicker,
    Select,
    Button,
    Radio,
    Tag,
    Spin,
    Tooltip as AntTooltip,
    Progress,
    Empty,
} from "antd";
import {
    ReloadOutlined,
    CoffeeOutlined,
    PlayCircleOutlined,
    PauseCircleOutlined,
    ClockCircleOutlined,
    CheckCircleOutlined,
    ExclamationCircleOutlined,
    CalendarOutlined,
} from "@ant-design/icons";
import {
    ResponsiveContainer,
    BarChart,
    Bar,
    XAxis,
    YAxis,
    Tooltip as RechartsTooltip,
    Legend,
    ReferenceLine,
    CartesianGrid,
} from "recharts";
import dayjs, { Dayjs } from "dayjs";

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

interface TimelineEvent {
    id: string;
    type: "work" | "break" | "another_reason";
    task_id: number;
    task_name: string;
    start_time: string;
    end_time: string;
    duration_seconds: number;
    duration_minutes: number;
    label: string;
    break_option?: string;
    break_duration_minutes?: number;
    reason?: string;
    is_active?: boolean;
}

interface DayData {
    date: string;
    day_name: string;
    actor_id: number;
    actor_name: string;
    department: string;
    work_hours: number;
    work_minutes: number;
    break_hours: number;
    break_minutes: number;
    another_reason_hours: number;
    another_reason_minutes: number;
    untracked_hours: number;
    untracked_minutes: number;
    total_logged_hours: number;
    work_target_met: boolean;
    break_exceeded: boolean;
    break_allowance_remaining_minutes: number;
    events: TimelineEvent[];
}

interface StandardBreak {
    name: string;
    start: string;
    end: string;
    alt_start?: string;
    alt_end?: string;
    duration_minutes: number;
}

interface OfficeSchedule {
    start_time: string;
    end_time: string;
    total_office_hours: number;
    target_work_hours: number;
    break_allowance_hours: number;
    standard_breaks: StandardBreak[];
}

interface Props {
    role: "admin" | "employee";
    initialEmployeeId?: number;
    isTL?: boolean;
    selectedEmployeeIdProp?: string | number;
    onEmployeeChange?: (id: string | number) => void;
}

function formatMins(mins: number): string {
    const h = Math.floor(mins / 60);
    const m = mins % 60;
    if (h && m) return `${h}h ${m}m`;
    if (h) return `${h}h`;
    return `${m}m`;
}

export default function WorkTimelineChart({
    role,
    initialEmployeeId,
    isTL = false,
    selectedEmployeeIdProp,
    onEmployeeChange,
}: Props) {
    const [selectedDate, setSelectedDate] = useState<Dayjs>(dayjs());
    const [viewMode, setViewMode] = useState<"day" | "week">(role === "employee" ? "day" : "day");
    const [selectedEmployeeIdInternal, setSelectedEmployeeIdInternal] = useState<string | number>(
        role === "admin" ? (initialEmployeeId ? String(initialEmployeeId) : "all") : ""
    );
    const selectedEmployeeId = selectedEmployeeIdProp !== undefined ? selectedEmployeeIdProp : selectedEmployeeIdInternal;

    const handleSelectEmployee = (val: string | number) => {
        setSelectedEmployeeIdInternal(val);
        onEmployeeChange?.(val);
        if (val === "all") setViewMode("day");
    };

    const [employeesList, setEmployeesList] = useState<{ id: number; name: string; department?: string }[]>([]);

    const [loading, setLoading] = useState(true);
    const [apiResponse, setApiResponse] = useState<any>(null);

    // Fetch employee dropdown options if admin
    useEffect(() => {
        if (role === "admin") {
            fetch(`${BASE_URL}/api/tasks/get_all_employees/`, { headers: { ...authHeaders() } })
                .then((r) => r.json())
                .then((d) => {
                    const list = Array.isArray(d) ? d : d.results || [];
                    setEmployeesList(list);
                })
                .catch(() => {});
        }
    }, [role]);

    // Fetch timeline data from backend
    const fetchTimeline = useCallback(() => {
        setLoading(true);
        const dateStr = selectedDate.format("YYYY-MM-DD");
        const tzOffset = new Date().getTimezoneOffset(); // e.g. -330 for IST

        let url = `${BASE_URL}/api/tasks/reports/daily_timeline/?date=${dateStr}&tz_offset=${tzOffset}&mode=${viewMode}`;

        if (role === "admin") {
            if (selectedEmployeeId && selectedEmployeeId !== "all") {
                url += `&employee_id=${selectedEmployeeId}`;
            }
        } else if (isTL) {
            if (selectedEmployeeId) {
                url += `&employee_id=${selectedEmployeeId}`;
            }
        }

        fetch(url, { headers: { ...authHeaders() } })
            .then((r) => r.json())
            .then((data) => {
                setApiResponse(data);
                if (isTL && Array.isArray(data.team_members) && data.team_members.length > 0) {
                    setEmployeesList(data.team_members);
                }
            })
            .catch((err) => {
                console.error("Failed to load timeline:", err);
            })
            .finally(() => setLoading(false));
    }, [selectedDate, viewMode, selectedEmployeeId, role, isTL]);

    useEffect(() => {
        fetchTimeline();
    }, [fetchTimeline]);

    // Office schedule
    const schedule: OfficeSchedule = apiResponse?.office_schedule || {
        start_time: "09:30",
        end_time: "18:30",
        total_office_hours: 9.0,
        target_work_hours: 8.0,
        break_allowance_hours: 1.0,
        standard_breaks: [
            { name: "Morning Refreshment", start: "10:45", end: "11:00", duration_minutes: 15 },
            { name: "Lunch Break", start: "13:30", end: "14:00", duration_minutes: 30 },
            { name: "Evening Refreshment", start: "16:45", end: "17:00", duration_minutes: 15 },
        ],
    };

    // Chart dataset calculation
    const chartData = useMemo(() => {
        if (!apiResponse) return [];

        if (apiResponse.view_type === "all_employees" && Array.isArray(apiResponse.employees)) {
            return apiResponse.employees.map((emp: DayData) => ({
                name: emp.actor_name,
                raw: emp,
                work: emp.work_hours,
                break: emp.break_hours,
                another_reason: emp.another_reason_hours,
                untracked: emp.untracked_hours,
                total: emp.total_logged_hours,
            }));
        }

        if (apiResponse.view_type === "week" && Array.isArray(apiResponse.days)) {
            return apiResponse.days.map((d: DayData) => ({
                name: d.day_name,
                raw: d,
                work: d.work_hours,
                break: d.break_hours,
                another_reason: d.another_reason_hours,
                untracked: d.untracked_hours,
                total: d.total_logged_hours,
            }));
        }

        if (apiResponse.view_type === "day" && apiResponse.data) {
            const d: DayData = apiResponse.data;
            return [
                {
                    name: `${d.actor_name} (${d.day_name})`,
                    raw: d,
                    work: d.work_hours,
                    break: d.break_hours,
                    another_reason: d.another_reason_hours,
                    untracked: d.untracked_hours,
                    total: d.total_logged_hours,
                },
            ];
        }

        return [];
    }, [apiResponse]);

    // Active single day data for rendering ribbon and timeline
    const singleDayData: DayData | null = useMemo(() => {
        if (!apiResponse) return null;
        if (apiResponse.view_type === "day" && apiResponse.data) return apiResponse.data;
        if (apiResponse.view_type === "week" && apiResponse.current_day) return apiResponse.current_day;
        if (apiResponse.view_type === "all_employees" && apiResponse.employees?.length) {
            // If a specific employee was selected or default to the first with activity
            const firstWithWork = apiResponse.employees.find((e: DayData) => e.total_logged_hours > 0);
            return firstWithWork || apiResponse.employees[0];
        }
        return null;
    }, [apiResponse]);

    // Custom recharts tooltip
    const CustomBarTooltip = ({ active, payload }: any) => {
        if (active && payload && payload.length) {
            const data = payload[0].payload;
            const raw: DayData = data.raw;
            return (
                <div
                    style={{
                        background: "#fff",
                        padding: "12px 16px",
                        border: "1px solid #e5e7eb",
                        borderRadius: 10,
                        boxShadow: "0 6px 16px rgba(0,0,0,0.12)",
                        fontSize: 12,
                        minWidth: 220,
                    }}
                >
                    <div style={{ fontWeight: 700, fontSize: 13, marginBottom: 8, color: "#1f2937" }}>
                        {data.name}
                    </div>

                    <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 4 }}>
                        <span style={{ color: "#2563eb", fontWeight: 600 }}>Work Time:</span>
                        <strong style={{ color: "#1f2937" }}>{formatMins(raw.work_minutes)} ({raw.work_hours}h)</strong>
                    </div>

                    <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 4 }}>
                        <span style={{ color: "#c27827", fontWeight: 600 }}>Break Time:</span>
                        <strong style={{ color: "#1f2937" }}>{formatMins(raw.break_minutes)} ({raw.break_hours}h)</strong>
                    </div>

                    <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 4 }}>
                        <span style={{ color: "#7c3aed", fontWeight: 600 }}>Other Pauses:</span>
                        <strong style={{ color: "#1f2937" }}>{formatMins(raw.another_reason_minutes)} ({raw.another_reason_hours}h)</strong>
                    </div>

                    <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 8 }}>
                        <span style={{ color: "#94a3b8", fontWeight: 600 }}>Untracked:</span>
                        <strong style={{ color: "#64748b" }}>{formatMins(raw.untracked_minutes)} ({raw.untracked_hours}h)</strong>
                    </div>

                    <div style={{ borderTop: "1px solid #f1f5f9", paddingTop: 8, marginTop: 4 }}>
                        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                            <span>8h Work Goal:</span>
                            {raw.work_target_met ? (
                                <Tag color="success" style={{ margin: 0, fontWeight: 600 }}>Achieved</Tag>
                            ) : (
                                <Tag color="warning" style={{ margin: 0, fontWeight: 600 }}>
                                    {formatMins(Math.max(0, 480 - raw.work_minutes))} remaining
                                </Tag>
                            )}
                        </div>
                        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: 4 }}>
                            <span>1h Break Limit:</span>
                            {raw.break_exceeded ? (
                                <Tag color="error" style={{ margin: 0, fontWeight: 600 }}>
                                    Exceeded by {formatMins(raw.break_minutes - 60)}
                                </Tag>
                            ) : (
                                <Tag color="default" style={{ margin: 0, fontWeight: 600 }}>
                                    {raw.break_allowance_remaining_minutes}m left
                                </Tag>
                            )}
                        </div>
                    </div>
                </div>
            );
        }
        return null;
    };

    return (
        <Card
            style={{
                borderRadius: 14,
                border: "1px solid var(--border)",
                boxShadow: "var(--shadow-card)",
                background: "var(--bg-card)",
                marginBottom: 20,
            }}
            bodyStyle={{ padding: "18px 20px" }}
        >
            {/* ── Header & Filter Bar ── */}
            <div
                style={{
                    display: "flex",
                    justifyContent: "space-between",
                    alignItems: "center",
                    flexWrap: "wrap",
                    gap: 12,
                    marginBottom: 16,
                    borderBottom: "1px solid var(--border)",
                    paddingBottom: 14,
                }}
            >
                <div>
                    <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                        <ClockCircleOutlined style={{ color: "var(--accent)", fontSize: 18 }} />
                        <h2 style={{ fontSize: 16, fontWeight: 700, margin: 0, color: "var(--accent)" }}>
                            Daily Work & Break Time Overview
                        </h2>
                    </div>
                    <p style={{ fontSize: 11, color: "var(--text-muted)", margin: "4px 0 0" }}>
                        Office Hours: <strong>9:30 AM – 6:30 PM</strong> (9 hrs total) • Target Work: <strong>8 hrs</strong> • Break Allowance: <strong>1 hr</strong>
                    </p>
                </div>

                {/* Filters */}
                <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
                    {role === "admin" && (
                        <Select
                            value={String(selectedEmployeeId)}
                            onChange={(val) => handleSelectEmployee(val)}
                            style={{ minWidth: 170 }}
                            placeholder="Select Employee"
                            options={[
                                { value: "all", label: "👥 All Employees" },
                                ...employeesList.map((e) => ({
                                    value: String(e.id),
                                    label: `👤 ${e.name}${e.department ? ` (${e.department})` : ""}`,
                                })),
                            ]}
                        />
                    )}

                    {isTL && employeesList.length > 0 && (
                        <Select
                            value={selectedEmployeeId ? String(selectedEmployeeId) : String(apiResponse?.employee?.id || employeesList[0]?.id || "")}
                            onChange={(val) => handleSelectEmployee(val)}
                            style={{ minWidth: 195 }}
                            placeholder="Select Team Member"
                            options={employeesList.map((e) => ({
                                value: String(e.id),
                                label: `👤 ${e.name}${e.department && !e.name.includes("My Details") ? ` (${e.department})` : ""}`,
                            }))}
                        />
                    )}

                    <DatePicker
                        value={selectedDate}
                        onChange={(d) => d && setSelectedDate(d)}
                        format="DD MMM YYYY"
                        allowClear={false}
                        style={{ width: 140 }}
                    />

                    <Radio.Group
                        value={viewMode}
                        onChange={(e) => setViewMode(e.target.value)}
                        optionType="button"
                        buttonStyle="solid"
                        size="middle"
                    >
                        <Radio.Button value="day">Day</Radio.Button>
                        <Radio.Button value="week">Week</Radio.Button>
                    </Radio.Group>

                    <Button
                        icon={<ReloadOutlined />}
                        onClick={fetchTimeline}
                        loading={loading}
                        style={{ borderRadius: 8 }}
                    >
                        Refresh
                    </Button>
                </div>
            </div>

            {/* ── Standard Office Schedule Reference Bar ── */}
            <div
                style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 12,
                    background: "#f8fafc",
                    padding: "8px 14px",
                    borderRadius: 10,
                    border: "1px solid #e2e8f0",
                    marginBottom: 18,
                    fontSize: 11.5,
                    color: "#475569",
                    flexWrap: "wrap",
                }}
            >
                <span style={{ fontWeight: 700, color: "#1e293b", display: "flex", alignItems: "center", gap: 6 }}>
                    <CalendarOutlined /> Standard Schedule:
                </span>
                <span style={{ display: "flex", alignItems: "center", gap: 5 }}>
                    <span style={{ width: 8, height: 8, borderRadius: "50%", background: "#2563eb" }} />
                    Work: <strong>{schedule.start_time} AM – {schedule.end_time} PM ({schedule.target_work_hours}h target)</strong>
                </span>
                <span style={{ color: "#cbd5e1" }}>•</span>
                <span style={{ display: "flex", alignItems: "center", gap: 5 }}>
                    <CoffeeOutlined style={{ color: "#c27827" }} />
                    Tea Break: <strong>10:45 – 11:00 AM (15m)</strong>
                </span>
                <span style={{ color: "#cbd5e1" }}>•</span>
                <span style={{ display: "flex", alignItems: "center", gap: 5 }}>
                    <CoffeeOutlined style={{ color: "#c27827" }} />
                    Lunch Break: <strong>1:30 – 2:00 PM or 2:00 – 2:30 PM (30m)</strong>
                </span>
                <span style={{ color: "#cbd5e1" }}>•</span>
                <span style={{ display: "flex", alignItems: "center", gap: 5 }}>
                    <CoffeeOutlined style={{ color: "#c27827" }} />
                    Tea Break: <strong>4:45 – 5:00 PM (15m)</strong>
                </span>
            </div>

            <Spin spinning={loading} tip="Calculating work & break timeline...">
                {chartData.length === 0 ? (
                    <Empty description="No session or break records found for the selected filter." style={{ margin: "40px 0" }} />
                ) : (
                    <div>
                        {/* ── 1. STACKED HORIZONTAL BAR CHART (matching screenshot) ── */}
                        <div style={{ marginBottom: 10 }}>
                            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 6 }}>
                                <span style={{ fontSize: 13, fontWeight: 700, color: "var(--text-primary)" }}>
                                    {apiResponse?.view_type === "all_employees"
                                        ? `Team Attendance & Time Breakdown (${selectedDate.format("DD MMM YYYY")})`
                                        : apiResponse?.view_type === "week"
                                        ? `7-Day Stacked Breakdown (${apiResponse?.employee?.name || "My Work"})`
                                        : `Work & Break Allocation (${selectedDate.format("DD MMM YYYY")})`}
                                </span>
                                <span style={{ fontSize: 11, color: "var(--text-muted)" }}>
                                    X-axis: Hours (Max: 9h office day)
                                </span>
                            </div>

                            <div style={{ width: "100%", height: Math.max(220, chartData.length * 48 + 70) }}>
                                <ResponsiveContainer width="100%" height="100%">
                                    <BarChart
                                        layout="vertical"
                                        data={chartData}
                                        margin={{ top: 10, right: 30, left: 60, bottom: 20 }}
                                    >
                                        <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke="#f1f5f9" />
                                        <XAxis
                                            type="number"
                                            domain={[0, 9]}
                                            ticks={[0, 1.5, 3, 4.5, 6, 7.5, 8, 9]}
                                            tickFormatter={(val) => `${val}h`}
                                            tick={{ fontSize: 11, fill: "#64748b" }}
                                        />
                                        <YAxis
                                            type="category"
                                            dataKey="name"
                                            tick={{ fontSize: 12, fill: "#1e293b", fontWeight: 600 }}
                                            width={110}
                                        />
                                        <RechartsTooltip content={<CustomBarTooltip />} />
                                        <Legend
                                            verticalAlign="bottom"
                                            height={36}
                                            iconType="square"
                                            formatter={(value) => (
                                                <span style={{ fontSize: 11.5, fontWeight: 600, color: "#334155" }}>
                                                    {value}
                                                </span>
                                            )}
                                        />
                                        {/* Target 8h work reference line */}
                                        <ReferenceLine
                                            x={8}
                                            stroke="#10b981"
                                            strokeDasharray="4 4"
                                            label={{
                                                value: "8h Work Target",
                                                position: "top",
                                                fill: "#10b981",
                                                fontSize: 10,
                                                fontWeight: 700,
                                            }}
                                        />
                                        {/* Series 1: Work Time (Blue) */}
                                        <Bar
                                            dataKey="work"
                                            name="Working Time"
                                            stackId="a"
                                            fill="#2563eb"
                                            radius={[0, 0, 0, 0]}
                                        />
                                        {/* Series 2: Break Time (Amber/Terracotta) */}
                                        <Bar
                                            dataKey="break"
                                            name="Break Time"
                                            stackId="a"
                                            fill="#c27827"
                                            radius={[0, 0, 0, 0]}
                                        />
                                        {/* Series 3: Other Pauses (Purple) */}
                                        <Bar
                                            dataKey="another_reason"
                                            name="Other Pauses"
                                            stackId="a"
                                            fill="#7c3aed"
                                            radius={[0, 0, 0, 0]}
                                        />
                                        {/* Series 4: Untracked / Remaining (Gray) */}
                                        <Bar
                                            dataKey="untracked"
                                            name="Untracked Time"
                                            stackId="a"
                                            fill="#e2e8f0"
                                            radius={[0, 6, 6, 0]}
                                        />
                                    </BarChart>
                                </ResponsiveContainer>
                            </div>
                        </div>

                        {/* ── 2. INDIVIDUAL DAY METRICS & VISUAL TIMELINE RIBBON ── */}
                        {singleDayData && (
                            <div style={{ marginTop: 24, paddingTop: 18, borderTop: "1px solid var(--border)" }}>
                                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12, flexWrap: "wrap", gap: 8 }}>
                                    <div>
                                        <span style={{ fontSize: 13, fontWeight: 700, color: "var(--text-primary)" }}>
                                            Timeline & Punch Sequence: <strong>{singleDayData.actor_name}</strong>
                                        </span>
                                        <span style={{ fontSize: 12, color: "var(--text-muted)", marginLeft: 8 }}>
                                            ({singleDayData.day_name})
                                        </span>
                                    </div>
                                    <div style={{ display: "flex", gap: 8 }}>
                                        {singleDayData.work_target_met ? (
                                            <Tag color="success" icon={<CheckCircleOutlined />}>8h Work Target Met</Tag>
                                        ) : (
                                            <Tag color="warning" icon={<ClockCircleOutlined />}>
                                                {formatMins(Math.max(0, 480 - singleDayData.work_minutes))} to 8h Goal
                                            </Tag>
                                        )}
                                        {singleDayData.break_exceeded ? (
                                            <Tag color="error" icon={<ExclamationCircleOutlined />}>
                                                Break Exceeded by {formatMins(singleDayData.break_minutes - 60)}
                                            </Tag>
                                        ) : (
                                            <Tag color="cyan" icon={<CoffeeOutlined />}>
                                                Break: {formatMins(singleDayData.break_minutes)} / 1h allowed
                                            </Tag>
                                        )}
                                    </div>
                                </div>

                                {/* 4 Summary Cards */}
                                <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: 10, marginBottom: 18 }}>
                                    <div style={{ background: "#eff6ff", border: "1px solid #bfdbfe", padding: "10px 14px", borderRadius: 10 }}>
                                        <div style={{ fontSize: 10.5, fontWeight: 700, color: "#1d4ed8", textTransform: "uppercase" }}>Total Work Time</div>
                                        <div style={{ fontSize: 18, fontWeight: 800, color: "#1e3a8a", marginTop: 2 }}>{formatMins(singleDayData.work_minutes)}</div>
                                        <Progress percent={Math.min(100, Math.round((singleDayData.work_minutes / 480) * 100))} size="small" strokeColor="#2563eb" showInfo={false} />
                                    </div>

                                    <div style={{ background: "#fffbeb", border: "1px solid #fde68a", padding: "10px 14px", borderRadius: 10 }}>
                                        <div style={{ fontSize: 10.5, fontWeight: 700, color: "#b45309", textTransform: "uppercase" }}>Total Break Time</div>
                                        <div style={{ fontSize: 18, fontWeight: 800, color: "#92400e", marginTop: 2 }}>{formatMins(singleDayData.break_minutes)}</div>
                                        <Progress percent={Math.min(100, Math.round((singleDayData.break_minutes / 60) * 100))} size="small" strokeColor="#c27827" showInfo={false} />
                                    </div>

                                    <div style={{ background: "#faf5ff", border: "1px solid #e9d5ff", padding: "10px 14px", borderRadius: 10 }}>
                                        <div style={{ fontSize: 10.5, fontWeight: 700, color: "#7e22ce", textTransform: "uppercase" }}>Other Pauses</div>
                                        <div style={{ fontSize: 18, fontWeight: 800, color: "#581c87", marginTop: 2 }}>{formatMins(singleDayData.another_reason_minutes)}</div>
                                        <div style={{ fontSize: 11, color: "#6b21a8", marginTop: 2 }}>Meetings / Discussions</div>
                                    </div>

                                    <div style={{ background: "#f8fafc", border: "1px solid #e2e8f0", padding: "10px 14px", borderRadius: 10 }}>
                                        <div style={{ fontSize: 10.5, fontWeight: 700, color: "#475569", textTransform: "uppercase" }}>Logged vs Office Span</div>
                                        <div style={{ fontSize: 18, fontWeight: 800, color: "#1e293b", marginTop: 2 }}>{formatMins(Math.round(singleDayData.total_logged_hours * 60))} / 9h</div>
                                        <div style={{ fontSize: 11, color: "#64748b", marginTop: 2 }}>Untracked: {formatMins(singleDayData.untracked_minutes)}</div>
                                    </div>
                                </div>

                                {/* ── Visual Timeline Ribbon (9:30 AM to 6:30 PM) ── */}
                                <div style={{ background: "#f8fafc", borderRadius: 12, border: "1px solid #e2e8f0", padding: "16px 14px", marginBottom: 16 }}>
                                    <div style={{ display: "flex", justifyContent: "space-between", fontSize: 11, fontWeight: 600, color: "#64748b", marginBottom: 8 }}>
                                        <span>09:30 AM (Start)</span>
                                        <span>11:00 AM</span>
                                        <span>01:30 PM</span>
                                        <span>03:30 PM</span>
                                        <span>05:00 PM</span>
                                        <span>06:30 PM (End)</span>
                                    </div>

                                    {/* Timeline track */}
                                    <div
                                        style={{
                                            position: "relative",
                                            width: "100%",
                                            height: 38,
                                            background: "#e2e8f0",
                                            borderRadius: 8,
                                            overflow: "hidden",
                                            display: "flex",
                                        }}
                                    >
                                        {/* Scheduled Break Guide Markers (light dotted overlay) */}
                                        <div
                                            title="Scheduled Tea (10:45-11:00)"
                                            style={{
                                                position: "absolute",
                                                left: `${((75) / 540) * 100}%`,
                                                width: `${(15 / 540) * 100}%`,
                                                height: "100%",
                                                background: "rgba(194, 120, 39, 0.15)",
                                                borderLeft: "1px dashed #c27827",
                                                borderRight: "1px dashed #c27827",
                                                zIndex: 1,
                                                pointerEvents: "none",
                                            }}
                                        />
                                        <div
                                            title="Scheduled Lunch (1:30-2:00)"
                                            style={{
                                                position: "absolute",
                                                left: `${((240) / 540) * 100}%`,
                                                width: `${(30 / 540) * 100}%`,
                                                height: "100%",
                                                background: "rgba(194, 120, 39, 0.15)",
                                                borderLeft: "1px dashed #c27827",
                                                borderRight: "1px dashed #c27827",
                                                zIndex: 1,
                                                pointerEvents: "none",
                                            }}
                                        />
                                        <div
                                            title="Scheduled Tea (4:45-5:00)"
                                            style={{
                                                position: "absolute",
                                                left: `${((435) / 540) * 100}%`,
                                                width: `${(15 / 540) * 100}%`,
                                                height: "100%",
                                                background: "rgba(194, 120, 39, 0.15)",
                                                borderLeft: "1px dashed #c27827",
                                                borderRight: "1px dashed #c27827",
                                                zIndex: 1,
                                                pointerEvents: "none",
                                            }}
                                        />

                                        {/* Recorded events positioned on the track */}
                                        {singleDayData.events.length === 0 ? (
                                            <div style={{ width: "100%", textAlign: "center", lineHeight: "38px", color: "#94a3b8", fontSize: 11 }}>
                                                No activity logged for this day
                                            </div>
                                        ) : (
                                            singleDayData.events.map((ev, idx) => {
                                                const evStart = dayjs(ev.start_time);
                                                const dayOfficeStart = evStart.clone().hour(9).minute(30).second(0);
                                                const startOffsetMinutes = Math.max(0, evStart.diff(dayOfficeStart, "minute", true));
                                                const leftPercent = Math.min(100, Math.max(0, (startOffsetMinutes / 540) * 100));
                                                const widthPercent = Math.min(100 - leftPercent, Math.max(1.5, (ev.duration_minutes / 540) * 100));

                                                const bg =
                                                    ev.type === "work"
                                                        ? "#2563eb"
                                                        : ev.type === "break"
                                                        ? "#c27827"
                                                        : "#7c3aed";

                                                const icon =
                                                    ev.type === "work" ? (
                                                        <PlayCircleOutlined />
                                                    ) : ev.type === "break" ? (
                                                        <CoffeeOutlined />
                                                    ) : (
                                                        <PauseCircleOutlined />
                                                    );

                                                return (
                                                    <AntTooltip
                                                        key={ev.id || idx}
                                                        title={
                                                            <div style={{ fontSize: 11 }}>
                                                                <div style={{ fontWeight: 700 }}>{ev.label}</div>
                                                                <div>Time: {dayjs(ev.start_time).format("hh:mm A")} – {dayjs(ev.end_time).format("hh:mm A")}</div>
                                                                <div>Duration: {formatMins(Math.round(ev.duration_minutes))}</div>
                                                                {ev.reason && <div style={{ opacity: 0.85 }}>Reason: {ev.reason}</div>}
                                                                {ev.is_active && <Tag color="processing" style={{ marginTop: 4 }}>Ongoing</Tag>}
                                                            </div>
                                                        }
                                                    >
                                                        <div
                                                            style={{
                                                                position: "absolute",
                                                                left: `${leftPercent}%`,
                                                                width: `${widthPercent}%`,
                                                                height: "100%",
                                                                background: bg,
                                                                borderRight: "1px solid rgba(255,255,255,0.4)",
                                                                zIndex: 2,
                                                                cursor: "pointer",
                                                                display: "flex",
                                                                alignItems: "center",
                                                                justifyContent: "center",
                                                                color: "#fff",
                                                                fontSize: 10.5,
                                                                fontWeight: 700,
                                                                overflow: "hidden",
                                                                textOverflow: "ellipsis",
                                                                whiteSpace: "nowrap",
                                                                padding: "0 4px",
                                                                transition: "opacity 0.15s",
                                                            }}
                                                        >
                                                            {widthPercent > 4 && (
                                                                <span style={{ display: "flex", alignItems: "center", gap: 3 }}>
                                                                    {icon}
                                                                    {widthPercent > 10 && ev.label}
                                                                </span>
                                                            )}
                                                        </div>
                                                    </AntTooltip>
                                                );
                                            })
                                        )}
                                    </div>
                                </div>

                                {/* ── Chronological Event Punch Sequence ── */}
                                <div>
                                    <div style={{ fontSize: 12, fontWeight: 700, color: "#334155", marginBottom: 8 }}>
                                        Step-by-Step Punch History:
                                    </div>

                                    {singleDayData.events.length === 0 ? (
                                        <div style={{ fontSize: 12, color: "#94a3b8" }}>No work or pause punches recorded on this day.</div>
                                    ) : (
                                        <div style={{ maxHeight: 220, overflowY: "auto", display: "flex", flexDirection: "column", gap: 6 }}>
                                            {singleDayData.events.map((ev, i) => (
                                                <div
                                                    key={ev.id || i}
                                                    style={{
                                                        display: "flex",
                                                        alignItems: "center",
                                                        justifyContent: "space-between",
                                                        padding: "7px 12px",
                                                        borderRadius: 8,
                                                        background:
                                                            ev.type === "work"
                                                                ? "#f0f7ff"
                                                                : ev.type === "break"
                                                                ? "#fefce8"
                                                                : "#faf5ff",
                                                        border: `1px solid ${
                                                            ev.type === "work"
                                                                ? "#dbeafe"
                                                                : ev.type === "break"
                                                                ? "#fef08a"
                                                                : "#f3e8ff"
                                                        }`,
                                                        fontSize: 12,
                                                    }}
                                                >
                                                    <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                                                        <Tag
                                                            color={ev.type === "work" ? "blue" : ev.type === "break" ? "warning" : "purple"}
                                                            icon={ev.type === "work" ? <PlayCircleOutlined /> : ev.type === "break" ? <CoffeeOutlined /> : <PauseCircleOutlined />}
                                                            style={{ margin: 0, fontWeight: 700, textTransform: "capitalize" }}
                                                        >
                                                            {ev.type === "work" ? "Working" : ev.type === "break" ? "Break" : "Pause"}
                                                        </Tag>
                                                        <span style={{ fontWeight: 600, color: "#1e293b" }}>{ev.label}</span>
                                                    </div>

                                                    <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
                                                        <span style={{ color: "#64748b", fontVariantNumeric: "tabular-nums" }}>
                                                            {dayjs(ev.start_time).format("hh:mm A")} – {dayjs(ev.end_time).format("hh:mm A")}
                                                        </span>
                                                        <span style={{ fontWeight: 700, color: "#0f172a", minWidth: 60, textAlign: "right" }}>
                                                            {formatMins(Math.round(ev.duration_minutes))}
                                                        </span>
                                                    </div>
                                                </div>
                                            ))}
                                        </div>
                                    )}
                                </div>
                            </div>
                        )}
                    </div>
                )}
            </Spin>
        </Card>
    );
}
