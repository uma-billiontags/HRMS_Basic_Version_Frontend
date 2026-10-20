import { useEffect, useState, useCallback, useMemo } from "react";
import {
    Card,
    DatePicker,
    Select,
    Button,
    Tag,
    Spin,
    Modal,
    Badge,
    Segmented,
    Tooltip as AntTooltip,
    message,
} from "antd";
import {
    LeftOutlined,
    RightOutlined,
    ReloadOutlined,
    CalendarOutlined,
    ClockCircleOutlined,
    CheckCircleOutlined,
    WarningOutlined,
    UserOutlined,
    TeamOutlined,
} from "@ant-design/icons";
import {
    ResponsiveContainer,
    BarChart,
    Bar,
    XAxis,
    YAxis,
    CartesianGrid,
    Tooltip as RechartsTooltip,
    ReferenceLine,
    Cell,
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

interface TaskSummary {
    id: number;
    task_id: string;
    sub_task_id: string | null;
    task_name: string;
    allotted_time: number;
    assignee_name: string | null;
    priority: string | null;
    status: string;
}

interface DayTracking {
    date: string;
    day_name: string;
    full_day_name: string;
    formatted_date: string;
    is_working_day: boolean;
    is_sunday: boolean;
    target_work_hours: number;
    team_target_work_hours?: number;
    assigned_hours: number;
    average_assigned_hours?: number;
    available_hours: number;
    overtime_hours: number;
    task_count: number;
    tasks: TaskSummary[];
}

interface MonthTracking {
    year: number;
    month: number;
    month_name: string;
    total_days: number;
    sundays_count: number;
    working_days: number;
    daily_work_hours: number;
    total_working_hours: number;
    total_team_working_hours?: number;
    assigned_hours: number;
    average_assigned_hours?: number;
    capacity_percentage: number;
    remaining_hours: number;
    task_count: number;
}

interface WeekTracking {
    week_start: string;
    week_end: string;
    week_label: string;
    week_number: number;
    total_week_working_days: number;
    total_week_working_hours: number;
    total_team_week_hours?: number;
    total_week_assigned_hours: number;
    average_week_assigned_hours?: number;
    week_capacity_percentage: number;
    days: DayTracking[];
}

interface ActorInfo {
    name: string;
    role: string;
    id: any;
    is_aggregate?: boolean;
    active_employees_count?: number;
}

interface EmployeeOption {
    id: number;
    name: string;
    department?: string;
}

interface Props {
    role: "admin" | "employee";
    initialEmployeeId?: number;
}

export default function WeeklyTaskAllocationChart({ role, initialEmployeeId }: Props) {
    const [selectedDate, setSelectedDate] = useState<Dayjs>(dayjs());
    const [selectedEmployeeId, setSelectedEmployeeId] = useState<string | number>(
        role === "admin" ? (initialEmployeeId ? String(initialEmployeeId) : "all") : ""
    );
    const [employeesList, setEmployeesList] = useState<EmployeeOption[]>([]);
    const [loading, setLoading] = useState(true);

    // View mode when All Employees is active: "average" (per employee average) vs "team_total" (total across everyone)
    const [metricMode, setMetricMode] = useState<"average" | "team_total">("average");

    const [monthData, setMonthData] = useState<MonthTracking | null>(null);
    const [weekData, setWeekData] = useState<WeekTracking | null>(null);
    const [actorInfo, setActorInfo] = useState<ActorInfo | null>(null);

    // Modal for day's task list
    const [activeDayModal, setActiveDayModal] = useState<DayTracking | null>(null);

    const isAllEmployees = role === "admin" && (selectedEmployeeId === "all" || !selectedEmployeeId);
    const employeeCount = actorInfo?.active_employees_count || 1;

    // Fetch tracking data from backend
    const fetchData = useCallback(() => {
        setLoading(true);
        const weekDateStr = selectedDate.format("YYYY-MM-DD");

        let url = `${BASE_URL}/api/tasks/reports/assigned_hours_tracking/?week_date=${weekDateStr}`;

        if (role === "admin") {
            if (selectedEmployeeId && selectedEmployeeId !== "all") {
                url += `&employee_id=${selectedEmployeeId}`;
            }
        }

        fetch(url, { headers: { ...authHeaders() } })
            .then((r) => {
                if (!r.ok) throw new Error("Failed to load tracking data");
                return r.json();
            })
            .then((res) => {
                setMonthData(res.month_tracking || null);
                setWeekData(res.week_tracking || null);
                setActorInfo(res.actor || null);
                if (role === "admin" && Array.isArray(res.employees)) {
                    setEmployeesList(res.employees);
                }
            })
            .catch((err) => {
                console.error("Assigned hours tracking error:", err);
                message.error("Failed to load weekly task allocation data");
            })
            .finally(() => setLoading(false));
    }, [selectedDate, selectedEmployeeId, role]);

    useEffect(() => {
        fetchData();
    }, [fetchData]);

    // Navigation helpers
    const handlePrevWeek = () => {
        setSelectedDate((prev) => prev.subtract(1, "week"));
    };

    const handleNextWeek = () => {
        setSelectedDate((prev) => prev.add(1, "week"));
    };

    const handleThisWeek = () => {
        setSelectedDate(dayjs());
    };

    // Reference target line value based on mode
    const dailyTargetHours = useMemo(() => {
        if (!isAllEmployees || metricMode === "average") {
            return 8.0;
        }
        return Math.round(8.0 * employeeCount * 10) / 10;
    }, [isAllEmployees, metricMode, employeeCount]);

    // Chart data items
    const chartData = useMemo(() => {
        if (!weekData || !weekData.days) return [];
        return weekData.days.map((d) => {
            const isAvg = isAllEmployees && metricMode === "average";
            const displayHours = isAvg
                ? (d.average_assigned_hours ?? Math.round((d.assigned_hours / employeeCount) * 100) / 100)
                : d.assigned_hours;
            const targetHours = d.is_sunday ? 0 : dailyTargetHours;

            let status = "available";
            if (d.is_sunday) {
                status = "sunday";
            } else if (displayHours > targetHours) {
                status = "over";
            } else if (displayHours === targetHours) {
                status = "exact";
            } else if (displayHours > 0) {
                status = "normal";
            } else {
                status = "zero";
            }

            return {
                ...d,
                name: `${d.day_name} (${dayjs(d.date).format("DD")})`,
                assigned: displayHours,
                rawTeamAssigned: d.assigned_hours,
                target: targetHours,
                status,
            };
        });
    }, [weekData, isAllEmployees, metricMode, employeeCount, dailyTargetHours]);

    const getBarColor = (item: any) => {
        if (item.is_sunday) return "#a1a1aa"; // Gray for Sunday holiday
        if (item.assigned > dailyTargetHours) return "#ef4444"; // Red for overloaded (> target)
        if (item.assigned === dailyTargetHours) return "#10b981"; // Emerald green for exact target
        if (item.assigned >= dailyTargetHours * 0.75) return "#3b82f6"; // Primary blue
        if (item.assigned > 0) return "#60a5fa"; // Soft blue
        return "#cbd5e1"; // Light slate for 0h
    };

    // Custom Recharts Tooltip
    const CustomTooltip = ({ active, payload }: any) => {
        if (!active || !payload || !payload.length) return null;
        const d = payload[0].payload;

        return (
            <div
                style={{
                    background: "#ffffff",
                    border: "1px solid var(--border, #e2e8f0)",
                    borderRadius: 10,
                    padding: "12px 14px",
                    boxShadow: "0 10px 25px -5px rgba(0, 0, 0, 0.1), 0 8px 10px -6px rgba(0, 0, 0, 0.1)",
                    minWidth: 240,
                    maxWidth: 320,
                    fontSize: 12,
                }}
            >
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 6 }}>
                    <span style={{ fontWeight: 700, fontSize: 13, color: "var(--text-primary, #1e293b)" }}>
                        {d.full_day_name}, {dayjs(d.date).format("DD MMM YYYY")}
                    </span>
                    {d.is_sunday ? (
                        <Tag color="default" style={{ margin: 0, fontSize: 10, fontWeight: 600 }}>
                            Weekly Off
                        </Tag>
                    ) : (
                        <Tag color="blue" style={{ margin: 0, fontSize: 10, fontWeight: 600 }}>
                            Workday ({dailyTargetHours}h)
                        </Tag>
                    )}
                </div>

                <div style={{ borderTop: "1px solid #f1f5f9", paddingTop: 8, marginTop: 4 }}>
                    {isAllEmployees ? (
                        <>
                            <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 4 }}>
                                <span style={{ color: "#64748b" }}>Average per Employee:</span>
                                <span style={{ fontWeight: 700, color: d.assigned > 8 ? "#dc2626" : "#2563eb" }}>
                                    {d.average_assigned_hours ?? Math.round((d.assigned_hours / employeeCount) * 100) / 100} hrs
                                </span>
                            </div>
                            <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 4 }}>
                                <span style={{ color: "#64748b" }}>Total Team Hours ({employeeCount} staff):</span>
                                <span style={{ fontWeight: 600, color: "#0f172a" }}>
                                    {d.rawTeamAssigned ?? d.assigned_hours} hrs
                                </span>
                            </div>
                        </>
                    ) : (
                        <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 4 }}>
                            <span style={{ color: "#64748b" }}>Task Hours Assigned:</span>
                            <span style={{ fontWeight: 700, color: d.assigned > 8 ? "#dc2626" : "#2563eb" }}>
                                {d.assigned} hrs
                            </span>
                        </div>
                    )}

                    <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 4 }}>
                        <span style={{ color: "#64748b" }}>Daily Target Capacity:</span>
                        <span style={{ fontWeight: 600, color: "#334155" }}>{d.target} hrs</span>
                    </div>

                    {!d.is_sunday && (
                        <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 6 }}>
                            <span style={{ color: "#64748b" }}>
                                {d.assigned > d.target ? "Over-allocated by:" : "Remaining available:"}
                            </span>
                            <span
                                style={{
                                    fontWeight: 700,
                                    color: d.assigned > d.target ? "#dc2626" : "#16a34a",
                                }}
                            >
                                {d.assigned > d.target
                                    ? `+${Math.round((d.assigned - d.target) * 100) / 100} hrs`
                                    : `${Math.round((d.target - d.assigned) * 100) / 100} hrs`}
                            </span>
                        </div>
                    )}

                    <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 2 }}>
                        <span style={{ color: "#64748b" }}>Tasks Scheduled:</span>
                        <span style={{ fontWeight: 600 }}>{d.task_count} tasks</span>
                    </div>
                </div>

                {d.tasks && d.tasks.length > 0 && (
                    <div style={{ marginTop: 8, borderTop: "1px dashed #e2e8f0", paddingTop: 6 }}>
                        <div style={{ fontSize: 10, fontWeight: 700, color: "#94a3b8", textTransform: "uppercase", marginBottom: 4 }}>
                            Assigned Tasks ({d.tasks.length})
                        </div>
                        <div style={{ maxHeight: 110, overflowY: "auto", display: "flex", flexDirection: "column", gap: 3 }}>
                            {d.tasks.map((t: TaskSummary) => (
                                <div
                                    key={t.id}
                                    style={{
                                        display: "flex",
                                        justifyContent: "space-between",
                                        gap: 8,
                                        fontSize: 11,
                                        background: "#f8fafc",
                                        padding: "3px 6px",
                                        borderRadius: 4,
                                    }}
                                >
                                    <span
                                        style={{
                                            fontWeight: 500,
                                            overflow: "hidden",
                                            textOverflow: "ellipsis",
                                            whiteSpace: "nowrap",
                                        }}
                                    >
                                        {t.sub_task_id || t.task_id}: {t.task_name}
                                    </span>
                                    <span style={{ fontWeight: 700, color: "#2563eb", flexShrink: 0 }}>
                                        {t.allotted_time}h
                                    </span>
                                </div>
                            ))}
                        </div>
                        <div style={{ fontSize: 10, color: "#94a3b8", textAlign: "center", marginTop: 4 }}>
                            Click bar to view full details
                        </div>
                    </div>
                )}
            </div>
        );
    };

    return (
        <Card
            className="db-chart-card"
            style={{
                borderRadius: "var(--radius-card, 12px)",
                border: "1px solid var(--border, #e2e8f0)",
                boxShadow: "none",
                marginBottom: 20,
            }}
            bodyStyle={{ padding: "18px 20px" }}
        >
            {/* ── Top Header & Filter Controls ── */}
            <div
                style={{
                    display: "flex",
                    justifyContent: "space-between",
                    alignItems: "flex-start",
                    flexWrap: "wrap",
                    gap: 12,
                    marginBottom: 16,
                }}
            >
                <div>
                    <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                        <h2
                            style={{
                                fontSize: 15,
                                fontWeight: 700,
                                color: "var(--text-primary, #0f172a)",
                                margin: 0,
                                display: "flex",
                                alignItems: "center",
                                gap: 7,
                            }}
                        >
                            <ClockCircleOutlined style={{ color: "var(--accent, #2563eb)" }} />
                            Weekly Task Hours Allocation
                        </h2>
                        <Tag color="cyan" style={{ fontSize: 10.5, fontWeight: 600, borderRadius: 6, margin: 0 }}>
                            6 Workdays (Mon–Sat, 8h/day)
                        </Tag>
                    </div>
                    <p style={{ fontSize: 11, color: "var(--text-muted, #64748b)", margin: "4px 0 0" }}>
                        Tracking daily task hours assigned out of standard workday &bull; Sunday is weekly off &bull; Viewing:{" "}
                        <strong>{actorInfo?.name || "All Employees"}</strong>
                        {isAllEmployees
                            ? ` (${employeeCount} active staff, displaying ${metricMode === "average" ? "average per employee" : "total team workload"})`
                            : ""}
                    </p>
                </div>

                {/* Right controls */}
                <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                    {/* View Mode Toggle when viewing All Employees */}
                    {isAllEmployees && (
                        <Segmented
                            value={metricMode}
                            onChange={(val) => setMetricMode(val as "average" | "team_total")}
                            options={[
                                { label: "Average per Employee", value: "average", icon: <UserOutlined /> },
                                { label: "Team Total Hours", value: "team_total", icon: <TeamOutlined /> },
                            ]}
                            style={{ fontSize: 11.5, fontWeight: 600 }}
                        />
                    )}

                    {role === "admin" && (
                        <Select
                            value={selectedEmployeeId}
                            onChange={(val) => setSelectedEmployeeId(val)}
                            style={{ width: 175, fontSize: 12 }}
                            placeholder="Filter by employee"
                        >
                            <Select.Option value="all">
                                <TeamOutlined style={{ marginRight: 6 }} />
                                All Employees
                            </Select.Option>
                            {employeesList.map((emp) => (
                                <Select.Option key={emp.id} value={String(emp.id)}>
                                    <UserOutlined style={{ marginRight: 6 }} />
                                    {emp.name} {emp.department ? `(${emp.department})` : ""}
                                </Select.Option>
                            ))}
                        </Select>
                    )}

                    {/* Week Navigation */}
                    <div style={{ display: "flex", alignItems: "center", gap: 3, background: "var(--bg-stat, #f8fafc)", padding: "3px 4px", borderRadius: 8, border: "1px solid var(--border, #e2e8f0)" }}>
                        <AntTooltip title="Previous week">
                            <Button
                                size="small"
                                icon={<LeftOutlined />}
                                onClick={handlePrevWeek}
                                style={{ border: "none", background: "transparent", height: 26, width: 26, display: "flex", alignItems: "center", justifyContent: "center" }}
                            />
                        </AntTooltip>

                        <DatePicker
                            picker="week"
                            value={selectedDate}
                            onChange={(d) => d && setSelectedDate(d)}
                            allowClear={false}
                            format={() => weekData?.week_label || selectedDate.format("DD MMM YYYY")}
                            style={{ width: 185, height: 26, fontSize: 11.5, fontWeight: 600, border: "none", background: "transparent", textAlign: "center" }}
                        />

                        <AntTooltip title="Next week">
                            <Button
                                size="small"
                                icon={<RightOutlined />}
                                onClick={handleNextWeek}
                                style={{ border: "none", background: "transparent", height: 26, width: 26, display: "flex", alignItems: "center", justifyContent: "center" }}
                            />
                        </AntTooltip>
                    </div>

                    <Button
                        size="small"
                        onClick={handleThisWeek}
                        style={{ fontSize: 11, fontWeight: 600, height: 32, borderRadius: 7 }}
                    >
                        This Week
                    </Button>

                    <Button
                        size="small"
                        icon={<ReloadOutlined />}
                        onClick={fetchData}
                        loading={loading}
                        style={{ height: 32, width: 32, borderRadius: 7 }}
                    />
                </div>
            </div>

            {/* ── Key Summary Metric Cards Banner ── */}
            <div
                style={{
                    display: "grid",
                    gridTemplateColumns: "repeat(auto-fit, minmax(210px, 1fr))",
                    gap: 12,
                    background: "var(--bg-stat, #f8fafc)",
                    padding: "12px 16px",
                    borderRadius: 10,
                    border: "1px solid var(--border, #e2e8f0)",
                    marginBottom: 16,
                }}
            >
                {/* 1. Week Work Assigned */}
                <div>
                    <div style={{ fontSize: 11, fontWeight: 600, color: "var(--text-muted, #64748b)", display: "flex", alignItems: "center", gap: 5 }}>
                        <ClockCircleOutlined /> Week Assigned Hours
                    </div>
                    {isAllEmployees && metricMode === "average" ? (
                        <>
                            <div style={{ fontSize: 18, fontWeight: 700, color: "var(--text-primary, #0f172a)", marginTop: 2 }}>
                                {weekData?.average_week_assigned_hours ?? 0}{" "}
                                <span style={{ fontSize: 12, fontWeight: 500, color: "#64748b" }}>/ 48 hrs (Avg/Person)</span>
                            </div>
                            <div style={{ fontSize: 10.5, color: "#64748b", marginTop: 2 }}>
                                Team Total: {weekData?.total_week_assigned_hours ?? 0}h / {weekData?.total_team_week_hours ?? 144}h ({employeeCount} staff)
                            </div>
                        </>
                    ) : (
                        <>
                            <div style={{ fontSize: 18, fontWeight: 700, color: "var(--text-primary, #0f172a)", marginTop: 2 }}>
                                {weekData?.total_week_assigned_hours ?? 0}{" "}
                                <span style={{ fontSize: 12, fontWeight: 500, color: "#64748b" }}>
                                    / {isAllEmployees ? `${weekData?.total_team_week_hours ?? 144} hrs (Team)` : "48 hrs"}
                                </span>
                            </div>
                            <div style={{ fontSize: 10.5, color: "#64748b", marginTop: 2 }}>
                                {weekData?.week_capacity_percentage ?? 0}% capacity utilized this week
                            </div>
                        </>
                    )}
                </div>

                {/* 2. Monthly Work Assigned */}
                <div>
                    <div style={{ fontSize: 11, fontWeight: 600, color: "var(--text-muted, #64748b)", display: "flex", alignItems: "center", gap: 5 }}>
                        <CalendarOutlined /> Month Work Assigned ({monthData?.month_name || "Current Month"})
                    </div>
                    {isAllEmployees && metricMode === "average" ? (
                        <>
                            <div style={{ fontSize: 18, fontWeight: 700, color: "var(--text-primary, #0f172a)", marginTop: 2 }}>
                                {monthData?.average_assigned_hours ?? 0}{" "}
                                <span style={{ fontSize: 12, fontWeight: 500, color: "#64748b" }}>/ {monthData?.total_working_hours ?? 216} hrs (Avg/Person)</span>
                            </div>
                            <div style={{ fontSize: 10.5, color: "#64748b", marginTop: 2 }}>
                                Team Total: {monthData?.assigned_hours ?? 0}h / {monthData?.total_team_working_hours ?? 648}h ({monthData?.capacity_percentage ?? 0}%)
                            </div>
                        </>
                    ) : (
                        <>
                            <div style={{ fontSize: 18, fontWeight: 700, color: "var(--text-primary, #0f172a)", marginTop: 2 }}>
                                {monthData?.assigned_hours ?? 0}{" "}
                                <span style={{ fontSize: 12, fontWeight: 500, color: "#64748b" }}>
                                    / {isAllEmployees ? `${monthData?.total_team_working_hours ?? 648} hrs (Team)` : `${monthData?.total_working_hours ?? 216} hrs`}
                                </span>
                            </div>
                            <div style={{ fontSize: 10.5, color: "#64748b", marginTop: 2 }}>
                                {monthData?.capacity_percentage ?? 0}% capacity ({monthData?.working_days ?? 0} working days @ 8h/day)
                            </div>
                        </>
                    )}
                </div>

                {/* 3. Monthly Workdays & Schedule Policy */}
                <div>
                    <div style={{ fontSize: 11, fontWeight: 600, color: "var(--text-muted, #64748b)", display: "flex", alignItems: "center", gap: 5 }}>
                        <CheckCircleOutlined style={{ color: "#10b981" }} /> Work Policy & Schedule
                    </div>
                    <div style={{ fontSize: 14, fontWeight: 700, color: "var(--text-primary, #0f172a)", marginTop: 4 }}>
                        Mon &ndash; Sat Working (6 Days)
                    </div>
                    <div style={{ fontSize: 10.5, color: "#64748b", marginTop: 2 }}>
                        Sundays ({monthData?.sundays_count ?? 4} days) are weekly off holidays
                    </div>
                </div>

                {/* 4. Overtime / Balance Status */}
                <div>
                    <div style={{ fontSize: 11, fontWeight: 600, color: "var(--text-muted, #64748b)", display: "flex", alignItems: "center", gap: 5 }}>
                        <WarningOutlined style={{ color: (monthData?.remaining_hours ?? 0) <= 0 ? "#ef4444" : "#3b82f6" }} /> Month Balance Hours
                    </div>
                    <div style={{ fontSize: 18, fontWeight: 700, color: (monthData?.remaining_hours ?? 0) > 0 ? "#2563eb" : "#ef4444", marginTop: 2 }}>
                        {isAllEmployees && metricMode === "average"
                            ? `${Math.round(Math.max(0, (monthData?.total_working_hours ?? 216) - (monthData?.average_assigned_hours ?? 0)) * 100) / 100} hrs`
                            : `${monthData?.remaining_hours ?? 0} hrs`}
                    </div>
                    <div style={{ fontSize: 10.5, color: "#64748b", marginTop: 2 }}>
                        Available capacity left in {monthData?.month_name || "this month"}
                    </div>
                </div>
            </div>

            {/* ── Main Chart Section ── */}
            <Spin spinning={loading} tip="Loading weekly schedule...">
                <div style={{ height: 260, width: "100%", marginTop: 8 }}>
                    <ResponsiveContainer width="100%" height="100%">
                        <BarChart
                            data={chartData}
                            margin={{ top: 18, right: 25, left: -10, bottom: 0 }}
                            onClick={(e: any) => {
                                if (e && e.activePayload && e.activePayload[0]) {
                                    setActiveDayModal(e.activePayload[0].payload);
                                }
                            }}
                        >
                            <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                            <XAxis
                                dataKey="name"
                                tickLine={false}
                                stroke="#94a3b8"
                                fontSize={11}
                                fontWeight={600}
                            />
                            <YAxis
                                stroke="#94a3b8"
                                fontSize={11}
                                tickLine={false}
                                unit="h"
                                domain={[0, (dataMax: number) => Math.max(Math.ceil(dailyTargetHours * 1.25), Math.ceil(dataMax + 2))]}
                            />
                            <RechartsTooltip content={<CustomTooltip />} />
                            <ReferenceLine
                                y={dailyTargetHours}
                                stroke="#ef4444"
                                strokeDasharray="4 4"
                                strokeWidth={1.5}
                                label={{
                                    value: `${dailyTargetHours}h ${isAllEmployees && metricMode === "team_total" ? `Team Target (${employeeCount}×8h)` : "Daily Workday Target"}`,
                                    position: "top",
                                    fill: "#ef4444",
                                    fontSize: 10,
                                    fontWeight: 700,
                                }}
                            />
                            <Bar
                                dataKey="assigned"
                                radius={[6, 6, 0, 0]}
                                maxBarSize={48}
                                cursor="pointer"
                            >
                                {chartData.map((entry, index) => (
                                    <Cell key={`cell-${index}`} fill={getBarColor(entry)} />
                                ))}
                            </Bar>
                        </BarChart>
                    </ResponsiveContainer>
                </div>

                {/* ── Legend & Status helper strip ── */}
                <div
                    style={{
                        display: "flex",
                        justifyContent: "center",
                        alignItems: "center",
                        flexWrap: "wrap",
                        gap: 16,
                        marginTop: 12,
                        paddingTop: 10,
                        borderTop: "1px solid var(--border, #f1f5f9)",
                        fontSize: 11,
                        color: "#64748b",
                    }}
                >
                    <span style={{ display: "flex", alignItems: "center", gap: 5 }}>
                        <span style={{ width: 10, height: 10, borderRadius: 2, background: "#3b82f6" }} />
                        Task Assigned (&le; {dailyTargetHours}h)
                    </span>
                    <span style={{ display: "flex", alignItems: "center", gap: 5 }}>
                        <span style={{ width: 10, height: 10, borderRadius: 2, background: "#10b981" }} />
                        Exact Target Met ({dailyTargetHours}h)
                    </span>
                    <span style={{ display: "flex", alignItems: "center", gap: 5 }}>
                        <span style={{ width: 10, height: 10, borderRadius: 2, background: "#ef4444" }} />
                        Over-allocated (&gt; {dailyTargetHours}h)
                    </span>
                    <span style={{ display: "flex", alignItems: "center", gap: 5 }}>
                        <span style={{ width: 10, height: 10, borderRadius: 2, background: "#a1a1aa" }} />
                        Sunday (Weekly Off / Holiday)
                    </span>
                    <span style={{ display: "flex", alignItems: "center", gap: 5, color: "#dc2626", fontWeight: 600 }}>
                        <span style={{ width: 12, height: 2, background: "#ef4444", display: "inline-block" }} />
                        {dailyTargetHours}h Target Line
                    </span>
                </div>
            </Spin>

            {/* ── Day Details Modal (Opens when user clicks on a day's bar) ── */}
            <Modal
                title={
                    activeDayModal && (
                        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                            <span>
                                Tasks for {activeDayModal.full_day_name}, {dayjs(activeDayModal.date).format("DD MMM YYYY")}
                            </span>
                            {activeDayModal.is_sunday ? (
                                <Tag color="default">Weekly Off</Tag>
                            ) : (
                                <Tag color="blue">
                                    {isAllEmployees
                                        ? `Total: ${activeDayModal.assigned_hours}h | Avg: ${activeDayModal.average_assigned_hours ?? Math.round((activeDayModal.assigned_hours / employeeCount) * 100) / 100}h`
                                        : `${activeDayModal.assigned_hours}h / 8h Assigned`}
                                </Tag>
                            )}
                        </div>
                    )
                }
                open={Boolean(activeDayModal)}
                onCancel={() => setActiveDayModal(null)}
                footer={[
                    <Button key="close" onClick={() => setActiveDayModal(null)}>
                        Close
                    </Button>,
                ]}
                width={550}
            >
                {activeDayModal && (
                    <div>
                        <div
                            style={{
                                display: "grid",
                                gridTemplateColumns: isAllEmployees ? "1fr 1fr 1fr 1fr" : "1fr 1fr 1fr",
                                gap: 10,
                                background: "#f8fafc",
                                padding: "10px 14px",
                                borderRadius: 8,
                                marginBottom: 14,
                                textAlign: "center",
                            }}
                        >
                            <div>
                                <div style={{ fontSize: 11, color: "#64748b" }}>Target Hours</div>
                                <div style={{ fontSize: 16, fontWeight: 700 }}>
                                    {isAllEmployees && metricMode === "team_total" ? `${dailyTargetHours} hrs` : "8.0 hrs"}
                                </div>
                            </div>
                            {isAllEmployees && (
                                <div>
                                    <div style={{ fontSize: 11, color: "#64748b" }}>Avg/Person</div>
                                    <div style={{ fontSize: 16, fontWeight: 700, color: "#2563eb" }}>
                                        {activeDayModal.average_assigned_hours ?? Math.round((activeDayModal.assigned_hours / employeeCount) * 100) / 100} hrs
                                    </div>
                                </div>
                            )}
                            <div>
                                <div style={{ fontSize: 11, color: "#64748b" }}>Total Assigned</div>
                                <div style={{ fontSize: 16, fontWeight: 700, color: activeDayModal.assigned_hours > dailyTargetHours ? "#dc2626" : "#2563eb" }}>
                                    {activeDayModal.assigned_hours} hrs
                                </div>
                            </div>
                            <div>
                                <div style={{ fontSize: 11, color: "#64748b" }}>
                                    {activeDayModal.assigned_hours > dailyTargetHours ? "Over-allocated" : "Available Capacity"}
                                </div>
                                <div
                                    style={{
                                        fontSize: 16,
                                        fontWeight: 700,
                                        color: activeDayModal.assigned_hours > dailyTargetHours ? "#dc2626" : "#16a34a",
                                    }}
                                >
                                    {activeDayModal.assigned_hours > dailyTargetHours
                                        ? `+${Math.round((activeDayModal.assigned_hours - dailyTargetHours) * 100) / 100} hrs`
                                        : `${Math.round((dailyTargetHours - activeDayModal.assigned_hours) * 100) / 100} hrs`}
                                </div>
                            </div>
                        </div>

                        <div style={{ fontSize: 12, fontWeight: 700, marginBottom: 8, color: "#334155" }}>
                            Assigned Tasks ({activeDayModal.tasks?.length ?? 0}):
                        </div>

                        {activeDayModal.tasks && activeDayModal.tasks.length > 0 ? (
                            <div style={{ display: "flex", flexDirection: "column", gap: 8, maxHeight: 260, overflowY: "auto" }}>
                                {activeDayModal.tasks.map((task) => (
                                    <div
                                        key={task.id}
                                        style={{
                                            border: "1px solid #e2e8f0",
                                            borderRadius: 8,
                                            padding: "8px 12px",
                                            display: "flex",
                                            justifyContent: "space-between",
                                            alignItems: "center",
                                        }}
                                    >
                                        <div>
                                            <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                                                <Badge color="#2563eb" />
                                                <span style={{ fontSize: 11, fontWeight: 700, color: "#64748b" }}>
                                                    {task.sub_task_id || task.task_id}
                                                </span>
                                                <span style={{ fontSize: 12, fontWeight: 600, color: "#0f172a" }}>
                                                    {task.task_name}
                                                </span>
                                            </div>
                                            {task.assignee_name && (
                                                <div style={{ fontSize: 10.5, color: "#64748b", marginTop: 2, marginLeft: 14 }}>
                                                    Assignee: <strong>{task.assignee_name}</strong> &bull; Priority: {task.priority || "Medium"}
                                                </div>
                                            )}
                                        </div>
                                        <div style={{ textAlign: "right" }}>
                                            <Tag color="blue" style={{ fontSize: 12, fontWeight: 700, padding: "2px 8px" }}>
                                                {task.allotted_time} hrs
                                            </Tag>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        ) : (
                            <div style={{ textAlign: "center", padding: "20px 0", color: "#94a3b8", fontSize: 12 }}>
                                No tasks scheduled for this day.
                            </div>
                        )}
                    </div>
                )}
            </Modal>
        </Card>
    );
}
