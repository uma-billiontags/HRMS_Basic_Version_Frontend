// Performance_Report.tsx
// Monthly Task Performance & Appraisal Consistency Tracker (Target: 200h / Month)
// Supports Admin (filter any employee), TL (defaults to TL, can filter team members), and regular Employee.

import { useEffect, useState, useCallback } from "react";
import { Table, Button, Select, Tooltip, Progress, Tag, message } from "antd";
import {
    ReloadOutlined,
    DownloadOutlined,
    CheckCircleFilled,
    CheckCircleOutlined,
    CloseCircleFilled,
    ExclamationCircleFilled,
    StarFilled,
    InfoCircleOutlined,
    UserOutlined,
    CalculatorOutlined,
    TrophyOutlined,
    UpOutlined,
} from "@ant-design/icons";
import {
    ResponsiveContainer,
    PieChart,
    Pie,
    Cell,
    Tooltip as RechartsTooltip,
    Legend,
} from "recharts";
import type { ColumnsType } from "antd/es/table";
import dayjs from "dayjs";
import { useAuth } from "../AuthContext";

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

interface TargetEmployee {
    id: number | string;
    name: string;
    role: string;
    department: string;
    employee_id: string;
    is_admin?: boolean;
}

interface DropdownEmployee {
    id: number | string;
    name: string;
    role?: string;
    department?: string;
    employee_id?: string;
    is_admin?: boolean;
}

interface ClosedMonthData {
    month_num: number;
    month_name: string;
    full_month_name: string;
    target_hours: number;
    assigned_hours: number;
    completed_hours: number;
    working_hours: number;
    effective_hours: number;
    avg_rating: number | null;
    rework_count: number;
    on_time_pct: number | null;
    target_met_status: string;
    target_met_code: "fully_met" | "partially_met" | "below_average" | "not_met";
    is_met: boolean;
    completed_tasks_count: number;
    assigned_tasks_count: number;
}

interface PerformanceSummary {
    target_hours_per_month: number;
    total_closed_months: number;
    total_target_hours: number;
    total_assigned_hours: number;
    total_completed_hours: number;
    fully_met_count: number;
    partially_met_count: number;
    below_avg_count: number;
    not_met_count: number;
    met_target_months: number;
    consistency_text: string;
    consistency_percentage: number;
    overall_avg_rating: number | null;
    overall_on_time_pct: number | null;
    total_reworks: number;
}

interface ScorePieItem {
    name: string;
    value: number;
    color: string;
    max?: number;
}

interface TargetMetPieItem {
    name: string;
    value: number;
    color: string;
}

interface AnnualPerformance {
    evaluated_year: number;
    evaluated_months_count: number;
    evaluated_period_label: string;
    presented_target_hours: number;
    total_completed_hours: number;
    capacity_percentage: number;
    capacity_score: number;
    capacity_max: number;
    overall_avg_rating: number | null;
    quality_percentage: number;
    quality_score: number;
    quality_max: number;
    final_score: number;
    score_gap: number;
    band_name: string;
    band_code: string;
    band_color: string;
    hike_recommendation: string;
    assessment_summary: string;
    consistency_percentage: number;
    total_reworks: number;
    overall_on_time_pct: number | null;
    score_pie_data: ScorePieItem[];
    target_met_pie_data: TargetMetPieItem[];
}

interface PerformanceResponse {
    year: number;
    available_years: number[];
    current_date: string;
    target_employee: TargetEmployee;
    employees: DropdownEmployee[];
    is_tl: boolean;
    is_admin: boolean;
    closed_months: ClosedMonthData[];
    summary: PerformanceSummary;
    annual_performance?: AnnualPerformance;
}

interface PerformanceReportProps {
    role: "admin" | "employee";
    isTL?: boolean;
}

function StatCard({
    label,
    value,
    changeLabel,
    changeType = "neutral",
}: {
    label: string;
    value: string | number;
    changeLabel: string;
    changeType?: "up" | "down" | "neutral" | "warning";
}) {
    const colorMap = {
        up: "var(--green)",
        down: "var(--red)",
        warning: "var(--amber)",
        neutral: "var(--text-secondary)",
    };

    return (
        <div className="db-stat-card">
            <div className="db-stat-label">{label}</div>
            <div className="db-stat-value">{value}</div>
            <div
                className="db-stat-change"
                style={{ color: colorMap[changeType], fontWeight: 500 }}
            >
                {changeLabel}
            </div>
        </div>
    );
}

function TargetMetBadge({ code }: { code: string }) {
    switch (code) {
        case "fully_met":
            return (
                <span
                    style={{
                        display: "inline-flex",
                        alignItems: "center",
                        gap: 5,
                        fontSize: 11.5,
                        fontWeight: 700,
                        padding: "3px 10px",
                        borderRadius: 6,
                        color: "#059669",
                        backgroundColor: "#ecfdf5",
                        border: "1px solid #a7f3d0",
                        whiteSpace: "nowrap",
                    }}
                >
                    <CheckCircleFilled style={{ color: "#10b981", fontSize: 13 }} />
                    YES (Fully Met)
                </span>
            );
        case "partially_met":
            return (
                <span
                    style={{
                        display: "inline-flex",
                        alignItems: "center",
                        gap: 5,
                        fontSize: 11.5,
                        fontWeight: 700,
                        padding: "3px 10px",
                        borderRadius: 6,
                        color: "#2563eb",
                        backgroundColor: "#eff6ff",
                        border: "1px solid #bfdbfe",
                        whiteSpace: "nowrap",
                    }}
                >
                    <CheckCircleOutlined style={{ color: "#3b82f6", fontSize: 13 }} />
                    YES (Partially Met)
                </span>
            );
        case "below_average":
            return (
                <span
                    style={{
                        display: "inline-flex",
                        alignItems: "center",
                        gap: 5,
                        fontSize: 11.5,
                        fontWeight: 700,
                        padding: "3px 10px",
                        borderRadius: 6,
                        color: "#d97706",
                        backgroundColor: "#fffbeb",
                        border: "1px solid #fde68a",
                        whiteSpace: "nowrap",
                    }}
                >
                    <ExclamationCircleFilled style={{ color: "#f59e0b", fontSize: 13 }} />
                    Below Average
                </span>
            );
        case "not_met":
        default:
            return (
                <span
                    style={{
                        display: "inline-flex",
                        alignItems: "center",
                        gap: 5,
                        fontSize: 11.5,
                        fontWeight: 700,
                        padding: "3px 10px",
                        borderRadius: 6,
                        color: "#dc2626",
                        backgroundColor: "#fef2f2",
                        border: "1px solid #fecaca",
                        whiteSpace: "nowrap",
                    }}
                >
                    <CloseCircleFilled style={{ color: "#ef4444", fontSize: 13 }} />
                    NO (Not Met)
                </span>
            );
    }
}

function csvEscape(v: string | number | null): string {
    const s = v === null || v === undefined ? "" : String(v);
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

export default function Performance_Report({ role, isTL }: Partial<PerformanceReportProps>) {
    const { user } = useAuth();
    const effectiveRole = role || user?.role || "employee";
    const effectiveIsTL = isTL !== undefined ? isTL : (user?.isTL ?? false);

    const [data, setData] = useState<PerformanceResponse | null>(null);
    const [loading, setLoading] = useState<boolean>(true);
    const [selectedYear, setSelectedYear] = useState<number>(dayjs().year());
    const [selectedEmployeeId, setSelectedEmployeeId] = useState<number | string | undefined>(undefined);
    const [showAnnualAssessment, setShowAnnualAssessment] = useState<boolean>(false);

    const fetchPerformance = useCallback(() => {
        setLoading(true);
        const params = new URLSearchParams();
        if (selectedYear) params.set("year", String(selectedYear));
        if (selectedEmployeeId !== undefined) params.set("employee_id", String(selectedEmployeeId));

        fetch(`${BASE_URL}/api/tasks/reports/monthly_performance/?${params.toString()}`, {
            headers: { ...authHeaders() },
        })
            .then((r) => {
                if (!r.ok) throw new Error("Failed to load performance report");
                return r.json();
            })
            .then((res: PerformanceResponse) => {
                setData(res);
                // Synchronize selected employee ID if initially unset
                if (selectedEmployeeId === undefined && res.target_employee?.id) {
                    setSelectedEmployeeId(res.target_employee.id);
                }
            })
            .catch((err) => {
                console.error(err);
                message.error("Failed to load performance data");
            })
            .finally(() => setLoading(false));
    }, [selectedYear, selectedEmployeeId]);

    useEffect(() => {
        fetchPerformance();
    }, [fetchPerformance]);

    const handleExportCsv = () => {
        if (!data || !data.closed_months.length) {
            message.warning("No performance data to export");
            return;
        }

        const empName = data.target_employee?.name || "Employee";
        const headers = [
            "Month",
            "Target Hours",
            "Work Assigned Hours",
            "Completed Hours",
            "Working Hours",
            "Avg Rating",
            "Reworks",
            "On-Time %",
            "Monthly Target Met?",
        ];

        const lines = data.closed_months.map((m) =>
            [
                m.month_name,
                `${m.target_hours}h`,
                `${m.assigned_hours}h`,
                `${m.completed_hours}h`,
                `${m.working_hours}h`,
                m.avg_rating !== null ? `${m.avg_rating} / 5.0` : "—",
                m.rework_count,
                m.on_time_pct !== null ? `${m.on_time_pct}%` : "—",
                m.target_met_status,
            ]
                .map(csvEscape)
                .join(",")
        );

        const csv = [headers.join(","), ...lines].join("\n");
        const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = `Performance_${empName.replace(/\s+/g, "_")}_${data.year}.csv`;
        a.click();
        URL.revokeObjectURL(url);
    };

    const handleCalculateAnnual = () => {
        fetchPerformance();
        setShowAnnualAssessment(true);
        message.success(
            `Annual performance calculated for ${data?.target_employee?.name || "employee"}!`
        );
    };

    const columns: ColumnsType<ClosedMonthData> = [
        {
            title: "Month",
            dataIndex: "month_name",
            key: "month_name",
            width: 120,
            render: (v: string) => (
                <span style={{ fontSize: 13, fontWeight: 700, color: "var(--text-primary)" }}>
                    {v}
                </span>
            ),
        },
        {
            title: "Target Hours",
            dataIndex: "target_hours",
            key: "target_hours",
            width: 120,
            render: (v: number) => (
                <span
                    style={{
                        fontSize: 12.5,
                        fontWeight: 600,
                        color: "var(--text-secondary)",
                        background: "var(--bg-input, #f3f4f6)",
                        padding: "2px 8px",
                        borderRadius: 4,
                    }}
                >
                    {v}h
                </span>
            ),
        },
        {
            title: "Work Assigned Hours",
            dataIndex: "assigned_hours",
            key: "assigned_hours",
            width: 160,
            render: (v: number, r: ClosedMonthData) => (
                <Tooltip title={`${r.assigned_tasks_count} tasks assigned in this month`}>
                    <span style={{ fontSize: 12.5, fontWeight: 600, color: "var(--text-primary)" }}>
                        {v}h
                    </span>
                </Tooltip>
            ),
        },
        {
            title: "Working / Completed Hours",
            key: "completed_hours",
            width: 180,
            render: (_: any, r: ClosedMonthData) => (
                <div>
                    <span
                        style={{
                            fontSize: 13,
                            fontWeight: 700,
                            color: r.effective_hours >= 200 ? "var(--green, #16a34a)" : "var(--text-primary)",
                        }}
                    >
                        {r.effective_hours}h
                    </span>
                    {r.working_hours > 0 && r.working_hours !== r.completed_hours && (
                        <div style={{ fontSize: 10.5, color: "var(--text-muted)" }}>
                            Worked: {r.working_hours}h
                        </div>
                    )}
                </div>
            ),
        },
        {
            title: "Avg Rating",
            dataIndex: "avg_rating",
            key: "avg_rating",
            width: 130,
            render: (v: number | null) =>
                v !== null ? (
                    <span
                        style={{
                            fontSize: 12.5,
                            fontWeight: 600,
                            display: "inline-flex",
                            alignItems: "center",
                            gap: 4,
                            color: v >= 4.5 ? "var(--green)" : v >= 3.5 ? "var(--blue)" : "var(--amber)",
                        }}
                    >
                        <StarFilled style={{ color: "#f59e0b", fontSize: 12 }} />
                        {v} / 5.0
                    </span>
                ) : (
                    <span style={{ color: "var(--text-muted)", fontSize: 12 }}>—</span>
                ),
        },
        {
            title: "Reworks",
            dataIndex: "rework_count",
            key: "rework_count",
            width: 100,
            render: (v: number) => (
                <span
                    style={{
                        fontSize: 12,
                        fontWeight: 600,
                        color: v > 0 ? "var(--red, #ef4444)" : "var(--text-secondary)",
                    }}
                >
                    {v}
                </span>
            ),
        },
        {
            title: "On-Time %",
            dataIndex: "on_time_pct",
            key: "on_time_pct",
            width: 110,
            render: (v: number | null) =>
                v !== null ? (
                    <span
                        style={{
                            fontSize: 12.5,
                            fontWeight: 700,
                            color: v >= 95 ? "var(--green, #10b981)" : v >= 80 ? "var(--blue, #3b82f6)" : "var(--red, #ef4444)",
                        }}
                    >
                        {v}%
                    </span>
                ) : (
                    <span style={{ color: "var(--text-muted)", fontSize: 12 }}>—</span>
                ),
        },
        {
            title: "Monthly Target Met?",
            key: "target_met",
            width: 180,
            render: (_: any, r: ClosedMonthData) => (
                <TargetMetBadge code={r.target_met_code} />
            ),
        },
    ];

    const canFilterEmployees =
        (effectiveRole === "admin" || effectiveIsTL || data?.is_tl || data?.is_admin) &&
        (data?.employees?.length ?? 0) > 0;

    const canCalculateAnnual = effectiveRole === "admin" || data?.is_admin;

    return (
        <div style={{ maxWidth: 1300, margin: "0 auto" }}>
            {/* Header section */}
            <div
                style={{
                    display: "flex",
                    justifyContent: "flex-end",
                    alignItems: "center",
                    flexWrap: "wrap",
                    gap: 12,
                    marginBottom: 16,
                }}
            >
                {/* Filter and Action controls */}
                <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
                    {/* Year Selector */}
                    <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                        <span style={{ fontSize: 12, fontWeight: 600, color: "var(--text-secondary)" }}>
                            Year:
                        </span>
                        <Select
                            value={selectedYear}
                            onChange={(yr) => setSelectedYear(yr)}
                            style={{ width: 100 }}
                            options={(data?.available_years || [dayjs().year()]).map((y) => ({
                                value: y,
                                label: String(y),
                            }))}
                        />
                    </div>

                    {/* Employee Selector for Admin and TL */}
                    {canFilterEmployees && (
                        <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                            <span style={{ fontSize: 12, fontWeight: 600, color: "var(--text-secondary)" }}>
                                {effectiveRole === "admin" ? "Employee:" : "Team Member:"}
                            </span>
                            <Select
                                value={selectedEmployeeId}
                                onChange={(val) => setSelectedEmployeeId(val)}
                                style={{ minWidth: 200 }}
                                placeholder="Select Employee"
                                showSearch
                                filterOption={(input, option) =>
                                    (option?.label ?? "").toLowerCase().includes(input.toLowerCase())
                                }
                                options={data?.employees.map((e) => ({
                                    value: e.id,
                                    label: `${e.name}${e.employee_id ? ` (${e.employee_id})` : ""}`,
                                }))}
                            />
                        </div>
                    )}

                    <Button
                        icon={<ReloadOutlined />}
                        onClick={fetchPerformance}
                        loading={loading}
                        style={{ borderRadius: 8 }}
                    >
                        Refresh
                    </Button>

                    <Button
                        onClick={handleExportCsv}
                        icon={<DownloadOutlined />}
                        style={{
                            borderRadius: 8,
                            border: "none",
                            background: "var(--accent)",
                            color: "#fff",
                            fontSize: 12,
                            fontWeight: 600,
                            display: "flex",
                            alignItems: "center",
                            gap: 6,
                        }}
                    >
                        Export CSV
                    </Button>

                    {canCalculateAnnual && (
                        <Button
                            type="primary"
                            icon={<CalculatorOutlined />}
                            onClick={handleCalculateAnnual}
                            style={{
                                borderRadius: 8,
                                border: "none",
                                background: "linear-gradient(135deg, #4f46e5 0%, #7c3aed 100%)",
                                color: "#fff",
                                fontSize: 12.5,
                                fontWeight: 700,
                                display: "flex",
                                alignItems: "center",
                                gap: 6,
                                boxShadow: "0 2px 6px rgba(79, 70, 229, 0.3)",
                            }}
                        >
                            Calculate Annual Performance
                        </Button>
                    )}
                </div>
            </div>

            {/* Target Employee Info Badge */}
            {data?.target_employee && (
                <div
                    style={{
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "space-between",
                        padding: "10px 16px",
                        background: "var(--bg-card, #ffffff)",
                        borderRadius: 8,
                        border: "1px solid var(--border)",
                        marginBottom: 16,
                    }}
                >
                    <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                        <div
                            style={{
                                width: 34,
                                height: 34,
                                borderRadius: "50%",
                                background: "var(--blue-bg, #eff6ff)",
                                color: "var(--blue, #2563eb)",
                                display: "flex",
                                alignItems: "center",
                                justifyContent: "center",
                                fontWeight: 700,
                            }}
                        >
                            <UserOutlined />
                        </div>
                        <div>
                            <span style={{ fontSize: 14, fontWeight: 700, color: "var(--text-primary)" }}>
                                {data.target_employee.name}
                            </span>
                            {data.target_employee.employee_id && (
                                <span
                                    style={{
                                        marginLeft: 8,
                                        fontSize: 11,
                                        fontWeight: 600,
                                        padding: "1px 6px",
                                        borderRadius: 4,
                                        background: "var(--bg-input, #f3f4f6)",
                                        color: "var(--text-secondary)",
                                    }}
                                >
                                    {data.target_employee.employee_id}
                                </span>
                            )}
                            <div style={{ fontSize: 11.5, color: "var(--text-muted)" }}>
                                {data.target_employee.department} • {data.target_employee.role}
                            </div>
                        </div>
                    </div>

                    <div style={{ textAlign: "right", fontSize: 12, color: "var(--text-secondary)" }}>
                        <span>Evaluation Year: </span>
                        <strong style={{ color: "var(--text-primary)" }}>{data.year}</strong>
                    </div>
                </div>
            )}

            {/* Annual Performance Assessment Output Section (Calculated when Admin clicks "Calculate Annual Performance") */}
            {showAnnualAssessment && data?.annual_performance && (
                <div
                    style={{
                        background: "var(--bg-card, #ffffff)",
                        border: "2px solid #6366f1",
                        borderRadius: 12,
                        padding: "20px 24px",
                        marginBottom: 20,
                        boxShadow: "0 10px 25px -5px rgba(99, 102, 241, 0.15)",
                    }}
                >
                    {/* Header */}
                    <div
                        style={{
                            display: "flex",
                            justifyContent: "space-between",
                            alignItems: "flex-start",
                            flexWrap: "wrap",
                            gap: 12,
                            borderBottom: "1px solid var(--border)",
                            paddingBottom: 14,
                            marginBottom: 16,
                        }}
                    >
                        <div>
                            <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                                <TrophyOutlined style={{ color: "#f59e0b", fontSize: 22 }} />
                                <h2 style={{ fontSize: 18, fontWeight: 700, margin: 0, color: "var(--text-primary)" }}>
                                    Annual Performance Assessment — {data.target_employee.name}
                                </h2>
                                <Tag color={data.annual_performance.band_color} style={{ fontSize: 12, fontWeight: 700, padding: "2px 10px", borderRadius: 4 }}>
                                    {data.annual_performance.band_name}
                                </Tag>
                            </div>
                            <p style={{ fontSize: 12, color: "var(--text-secondary)", margin: "4px 0 0" }}>
                                Evaluated across <strong>{data.annual_performance.evaluated_months_count} closed months</strong> ({data.annual_performance.evaluated_period_label}) • Evaluation Year: <strong>{data.annual_performance.evaluated_year}</strong>
                            </p>
                        </div>

                        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                            <Button
                                size="small"
                                icon={<ReloadOutlined />}
                                onClick={handleCalculateAnnual}
                                loading={loading}
                                style={{ borderRadius: 6, fontSize: 12 }}
                            >
                                Recalculate
                            </Button>
                            <Button
                                size="small"
                                type="text"
                                onClick={() => setShowAnnualAssessment(false)}
                                icon={<UpOutlined />}
                                style={{ color: "var(--text-muted)", fontSize: 12 }}
                            >
                                Hide
                            </Button>
                        </div>
                    </div>

                    {/* Pillar Formula Quote Banner (matching media reference image) */}
                    <div
                        style={{
                            background: "#0f172a",
                            color: "#e2e8f0",
                            padding: "12px 18px",
                            borderRadius: 8,
                            marginBottom: 18,
                            fontFamily: "monospace, monospace",
                            display: "flex",
                            flexDirection: "column",
                            gap: 4,
                        }}
                    >
                        <div style={{ fontSize: 11.5, color: "#94a3b8" }}>
                            We split the annual score into two 50% pillars:
                        </div>
                        <div style={{ fontSize: 14, fontWeight: 700, color: "#38bdf8", letterSpacing: "0.02em" }}>
                            Final Performance Score (100) = Capacity Score (50 pts) + Quality Score (50 pts)
                        </div>
                    </div>

                    {/* Top KPI Score Summary Grid */}
                    <div
                        style={{
                            display: "grid",
                            gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
                            gap: 14,
                            marginBottom: 20,
                        }}
                    >
                        {/* Final Score Card */}
                        <div
                            style={{
                                background: "linear-gradient(135deg, #eff6ff 0%, #e0e7ff 100%)",
                                border: "1px solid #bfdbfe",
                                borderRadius: 8,
                                padding: "14px 16px",
                            }}
                        >
                            <div style={{ fontSize: 11, fontWeight: 600, color: "#1e40af", textTransform: "uppercase" }}>
                                Final Performance Score
                            </div>
                            <div style={{ fontSize: 26, fontWeight: 800, color: "#1e3a8a", margin: "4px 0" }}>
                                {data.annual_performance.final_score}{" "}
                                <span style={{ fontSize: 14, fontWeight: 600, color: "#475569" }}>/ 100</span>
                            </div>
                            <div style={{ fontSize: 11.5, fontWeight: 600, color: data.annual_performance.band_color }}>
                                {data.annual_performance.assessment_summary}
                            </div>
                        </div>

                        {/* Recommended Hike Card */}
                        <div
                            style={{
                                background: "linear-gradient(135deg, #ecfdf5 0%, #d1fae5 100%)",
                                border: "1px solid #a7f3d0",
                                borderRadius: 8,
                                padding: "14px 16px",
                            }}
                        >
                            <div style={{ fontSize: 11, fontWeight: 600, color: "#065f46", textTransform: "uppercase" }}>
                                Recommended Annual Hike
                            </div>
                            <div style={{ fontSize: 26, fontWeight: 800, color: "#047857", margin: "4px 0" }}>
                                {data.annual_performance.hike_recommendation}
                            </div>
                            <div style={{ fontSize: 11.5, color: "#059669" }}>
                                Based on {data.annual_performance.final_score}% overall output score
                            </div>
                        </div>

                        {/* Pillar 1 Capacity Card */}
                        <div
                            style={{
                                background: "var(--bg-input, #f8fafc)",
                                border: "1px solid var(--border)",
                                borderRadius: 8,
                                padding: "14px 16px",
                            }}
                        >
                            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                                <span style={{ fontSize: 11, fontWeight: 600, color: "var(--text-secondary)", textTransform: "uppercase" }}>
                                    Capacity Score (50 pts)
                                </span>
                                <strong style={{ fontSize: 14, color: "#2563eb" }}>
                                    {data.annual_performance.capacity_score} / 50
                                </strong>
                            </div>
                            <Progress percent={data.annual_performance.capacity_percentage} strokeColor="#3b82f6" size="small" style={{ margin: "8px 0" }} />
                            <div style={{ fontSize: 11, color: "var(--text-muted)" }}>
                                {data.annual_performance.total_completed_hours}h / {data.annual_performance.presented_target_hours}h completed ({data.annual_performance.capacity_percentage}%)
                            </div>
                        </div>

                        {/* Pillar 2 Quality Card */}
                        <div
                            style={{
                                background: "var(--bg-input, #f8fafc)",
                                border: "1px solid var(--border)",
                                borderRadius: 8,
                                padding: "14px 16px",
                            }}
                        >
                            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                                <span style={{ fontSize: 11, fontWeight: 600, color: "var(--text-secondary)", textTransform: "uppercase" }}>
                                    Quality Score (50 pts)
                                </span>
                                <strong style={{ fontSize: 14, color: "#10b981" }}>
                                    {data.annual_performance.quality_score} / 50
                                </strong>
                            </div>
                            <Progress percent={data.annual_performance.quality_percentage} strokeColor="#10b981" size="small" style={{ margin: "8px 0" }} />
                            <div style={{ fontSize: 11, color: "var(--text-muted)" }}>
                                {data.annual_performance.overall_avg_rating ?? "—"} / 5.0 Average Star Rating ({data.annual_performance.quality_percentage}%)
                            </div>
                        </div>
                    </div>

                    {/* Dual Pie Charts Section */}
                    <div
                        style={{
                            display: "grid",
                            gridTemplateColumns: "repeat(auto-fit, minmax(340px, 1fr))",
                            gap: 16,
                            marginBottom: 16,
                        }}
                    >
                        {/* Pie Chart 1: 50/50 Pillar Composition */}
                        <div
                            style={{
                                background: "var(--bg-card, #ffffff)",
                                border: "1px solid var(--border)",
                                borderRadius: 8,
                                padding: "14px 16px",
                            }}
                        >
                            <div style={{ fontSize: 13, fontWeight: 700, color: "var(--text-primary)" }}>
                                Score Composition (100-Point Split)
                            </div>
                            <div style={{ fontSize: 11, color: "var(--text-muted)", marginBottom: 8 }}>
                                50% Work Capacity + 50% Work Quality Pillar Contribution
                            </div>
                            <div style={{ height: 210 }}>
                                <ResponsiveContainer width="100%" height="100%">
                                    <PieChart>
                                        <Pie
                                            data={data.annual_performance.score_pie_data}
                                            dataKey="value"
                                            cx="50%"
                                            cy="50%"
                                            innerRadius={45}
                                            outerRadius={75}
                                            paddingAngle={3}
                                        >
                                            {data.annual_performance.score_pie_data.map((entry, index) => (
                                                <Cell key={`cell-${index}`} fill={entry.color} />
                                            ))}
                                        </Pie>
                                        <RechartsTooltip formatter={(v: any, name: any) => [`${v} pts`, String(name)]} />
                                        <Legend verticalAlign="bottom" height={32} />
                                    </PieChart>
                                </ResponsiveContainer>
                            </div>
                        </div>

                        {/* Pie Chart 2: Target Met Months Distribution */}
                        <div
                            style={{
                                background: "var(--bg-card, #ffffff)",
                                border: "1px solid var(--border)",
                                borderRadius: 8,
                                padding: "14px 16px",
                            }}
                        >
                            <div style={{ fontSize: 13, fontWeight: 700, color: "var(--text-primary)" }}>
                                Monthly Target Achievement Distribution
                            </div>
                            <div style={{ fontSize: 11, color: "var(--text-muted)", marginBottom: 8 }}>
                                Consistency across {data.annual_performance.evaluated_months_count} closed months evaluated
                            </div>
                            <div style={{ height: 210 }}>
                                <ResponsiveContainer width="100%" height="100%">
                                    <PieChart>
                                        <Pie
                                            data={data.annual_performance.target_met_pie_data.filter((d) => d.value > 0)}
                                            dataKey="value"
                                            cx="50%"
                                            cy="50%"
                                            outerRadius={75}
                                            label={({ name, value }: any) => `${name}: ${value}`}
                                        >
                                            {data.annual_performance.target_met_pie_data.filter((d) => d.value > 0).map((entry, index) => (
                                                <Cell key={`met-cell-${index}`} fill={entry.color} />
                                            ))}
                                        </Pie>
                                        <RechartsTooltip formatter={(v: any, name: any) => [`${v} months`, String(name)]} />
                                        <Legend verticalAlign="bottom" height={32} />
                                    </PieChart>
                                </ResponsiveContainer>
                            </div>
                        </div>
                    </div>

                    {/* Dynamic Recalculation Notice */}
                    <div
                        style={{
                            padding: "8px 12px",
                            background: "var(--bg-input, #f8fafc)",
                            border: "1px dashed var(--border)",
                            borderRadius: 6,
                            fontSize: 11.5,
                            color: "var(--text-secondary)",
                            display: "flex",
                            alignItems: "center",
                            gap: 8,
                        }}
                    >
                        <InfoCircleOutlined style={{ color: "#4f46e5", fontSize: 13 }} />
                        <span>
                            <strong>Dynamic Month Evaluation:</strong> Calculated for <strong>{data.annual_performance.evaluated_months_count} closed months</strong> ({data.annual_performance.evaluated_period_label}).
                            When upcoming months (such as October) finish and close, clicking <strong>"Calculate Annual Performance"</strong> will dynamically include newly added months into the target hours ({data.annual_performance.evaluated_months_count + 1} × 200h) and updated pie charts.
                        </span>
                    </div>
                </div>
            )}

            {/* Stat Cards Grid */}
            <div className="db-stat-grid" style={{ marginBottom: 18 }}>
                <StatCard
                    label="Monthly Target"
                    value={`${data?.summary?.target_hours_per_month ?? 200} hrs`}
                    changeLabel="Standard company target / month"
                    changeType="neutral"
                />
                <StatCard
                    label="Closed Months Evaluated"
                    value={`${data?.summary?.total_closed_months ?? 0} Months`}
                    changeLabel={`Total target: ${data?.summary?.total_target_hours ?? 0} hrs`}
                    changeType="neutral"
                />
                <StatCard
                    label="Total Completed Hours"
                    value={`${data?.summary?.total_completed_hours ?? 0} hrs`}
                    changeLabel={`${data?.summary?.total_target_hours ? Math.round(((data.summary.total_completed_hours / data.summary.total_target_hours) * 100)) : 0}% of target hours`}
                    changeType={
                        (data?.summary?.total_completed_hours ?? 0) >= (data?.summary?.total_target_hours ?? 1)
                            ? "up"
                            : "warning"
                    }
                />
                <StatCard
                    label="Target Consistency"
                    value={`${data?.summary?.met_target_months ?? 0} / ${data?.summary?.total_closed_months ?? 0}`}
                    changeLabel={`${data?.summary?.consistency_percentage ?? 0}% Consistency Rate`}
                    changeType={(data?.summary?.consistency_percentage ?? 0) >= 80 ? "up" : "warning"}
                />
            </div>

            {/* Consistency Tracker Banner (matching media reference) */}
            <div
                style={{
                    background: "#0f172a",
                    color: "#f8fafc",
                    borderRadius: 8,
                    padding: "14px 20px",
                    marginBottom: 18,
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "space-between",
                    flexWrap: "wrap",
                    gap: 12,
                    fontFamily: "monospace, monospace",
                }}
            >
                <div>
                    <div style={{ fontSize: 13, fontWeight: 700, color: "#38bdf8", letterSpacing: "0.03em" }}>
                        12-MONTH CONSISTENCY TRACKER (Target: 200h / Month):
                    </div>
                    <div style={{ fontSize: 12, color: "#94a3b8", marginTop: 4 }}>
                        Consistency:{" "}
                        <strong style={{ color: "#4ade80" }}>
                            {data?.summary?.consistency_text ?? "Evaluating..."}
                        </strong>
                    </div>
                </div>

                <div
                    style={{
                        display: "flex",
                        alignItems: "center",
                        gap: 14,
                        fontSize: 11.5,
                        color: "#cbd5e1",
                    }}
                >
                    <span style={{ display: "inline-flex", alignItems: "center", gap: 5 }}>
                        <span style={{ width: 8, height: 8, borderRadius: "50%", background: "#4ade80" }} />
                        Fully Met: <strong>{data?.summary?.fully_met_count ?? 0}</strong>
                    </span>
                    <span style={{ display: "inline-flex", alignItems: "center", gap: 5 }}>
                        <span style={{ width: 8, height: 8, borderRadius: "50%", background: "#60a5fa" }} />
                        Partially Met: <strong>{data?.summary?.partially_met_count ?? 0}</strong>
                    </span>
                    <span style={{ display: "inline-flex", alignItems: "center", gap: 5 }}>
                        <span style={{ width: 8, height: 8, borderRadius: "50%", background: "#f87171" }} />
                        Not Met: <strong>{data?.summary?.not_met_count ?? 0}</strong>
                    </span>
                </div>
            </div>

            {/* Performance Table */}
            <div className="db-card" style={{ padding: "16px 20px" }}>
                <Table
                    columns={columns}
                    dataSource={data?.closed_months ?? []}
                    rowKey="month_num"
                    loading={loading}
                    pagination={false}
                    locale={{
                        emptyText: (
                            <div style={{ padding: "30px 20px", textAlign: "center", color: "var(--text-muted)" }}>
                                <InfoCircleOutlined style={{ fontSize: 28, marginBottom: 8 }} />
                                <div>No closed months available for {selectedYear} yet.</div>
                                <div style={{ fontSize: 11.5, marginTop: 4 }}>
                                    Performance tracking evaluates only concluded months. The current month will appear once closed.
                                </div>
                            </div>
                        ),
                    }}
                />

                {/* Policy explanation notice */}
                <div
                    style={{
                        marginTop: 16,
                        padding: "10px 14px",
                        background: "var(--bg-input, #f9fafb)",
                        borderRadius: 6,
                        border: "1px solid var(--border)",
                        display: "flex",
                        alignItems: "center",
                        gap: 8,
                        fontSize: 11.5,
                        color: "var(--text-secondary)",
                    }}
                >
                    <InfoCircleOutlined style={{ color: "var(--blue, #2563eb)", fontSize: 14 }} />
                    <span>
                        <strong>Closed Month Rule:</strong> In accordance with company appraisal policy, monthly performance
                        hours and target achievements are locked and calculated only after the respective month has completed.
                        The current in-progress month will be updated at month-end.
                    </span>
                </div>
            </div>
        </div>
    );
}
