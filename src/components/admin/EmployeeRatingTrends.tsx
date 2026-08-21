// EmployeeRatingTrends.tsx
import { useEffect, useState } from "react";
import { Select, Spin } from "antd";
import { ArrowUpOutlined, ArrowDownOutlined, MinusOutlined } from "@ant-design/icons";

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

interface MonthPoint {
    month: string;        // "2026-06"
    avg_rating: number;
    task_count: number;
}

interface EmployeeTrend {
    employee_id: number;
    employee_name: string;
    months: MonthPoint[];
}

interface RatingTrendsResponse {
    months_requested: number;
    employees: EmployeeTrend[];
    overall_trend: MonthPoint[];
}

function formatMonth(m: string) {
    const [y, mo] = m.split("-");
    return new Date(Number(y), Number(mo) - 1).toLocaleDateString("en-US", { month: "short" });
}

function TrendArrow({ current, previous }: { current: number; previous?: number }) {
    if (previous === undefined) return <MinusOutlined style={{ color: "var(--text-muted)", fontSize: 11 }} />;
    if (current > previous) return <ArrowUpOutlined style={{ color: "var(--green)", fontSize: 11 }} />;
    if (current < previous) return <ArrowDownOutlined style={{ color: "var(--red)", fontSize: 11 }} />;
    return <MinusOutlined style={{ color: "var(--text-muted)", fontSize: 11 }} />;
}

function RatingBar({ value }: { value: number }) {
    // value out of 5
    const pct = Math.max(0, Math.min(100, (value / 5) * 100));
    const color = value >= 4 ? "var(--green)" : value >= 3 ? "var(--blue)" : value >= 2 ? "var(--amber)" : "var(--red)";
    return (
        <div style={{ width: 60, height: 6, borderRadius: 3, background: "var(--bg-input)", overflow: "hidden" }}>
            <div style={{ width: `${pct}%`, height: "100%", background: color, borderRadius: 3 }} />
        </div>
    );
}

export default function EmployeeRatingTrends() {
    const [data, setData] = useState<RatingTrendsResponse | null>(null);
    const [loading, setLoading] = useState(true);
    const [months, setMonths] = useState(6);

    useEffect(() => {
        setLoading(true);
        fetch(`${BASE_URL}/api/tasks/reports/rating_trends/?months=${months}`, { headers: { ...authHeaders() } })
            .then((r) => r.json())
            .then(setData)
            .finally(() => setLoading(false));
    }, [months]);


    return (
        <div>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
                <div className="db-card-title">Rating Performance</div>
                <Select
                    size="small"
                    value={months}
                    onChange={setMonths}
                    style={{ width: 120 }}
                    options={[
                        { value: 3, label: "Last 3 months" },
                        { value: 6, label: "Last 6 months" },
                        { value: 12, label: "Last 12 months" },
                    ]}
                />
            </div>

            <div style={{
                background: "var(--bg-card)", borderRadius: 14, border: "1px solid var(--border)",
                boxShadow: "var(--shadow-card)", padding: 16,
            }}>
                {loading || !data ? (
                    <div style={{ textAlign: "center", padding: 40 }}><Spin /></div>
                ) : (
                    <>
                        {/* Org-wide monthly average, simple bar chart */}
                        <div style={{ display: "flex", alignItems: "flex-end", gap: 10, height: 90, marginBottom: 18 }}>
                            {data.overall_trend.map((m) => (
                                <div key={m.month} style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", gap: 4 }}>
                                    <div style={{ fontSize: 10.5, fontWeight: 700, color: "var(--text-secondary)" }}>
                                        {m.avg_rating.toFixed(1)}
                                    </div>
                                    <div style={{
                                        width: "70%",
                                        height: `${(m.avg_rating / 5) * 60}px`,
                                        background: "var(--accent)",
                                        borderRadius: "4px 4px 0 0",
                                    }} />
                                    <div style={{ fontSize: 10, color: "var(--text-muted)" }}>{formatMonth(m.month)}</div>
                                </div>
                            ))}
                            {data.overall_trend.length === 0 && (
                                <div style={{ color: "var(--text-muted)", fontSize: 12, margin: "auto" }}>
                                    No rated tasks in this period yet.
                                </div>
                            )}
                        </div>

                        {/* Per-employee leaderboard */}
                        <div style={{ borderTop: "1px solid var(--border)", paddingTop: 12 }}>
                            {data.employees.map((emp) => {
                                const latest = emp.months[emp.months.length - 1];
                                const previous = emp.months.length > 1 ? emp.months[emp.months.length - 2] : undefined;
                                return (
                                    <div
                                        key={emp.employee_id}
                                        style={{
                                            display: "flex", alignItems: "center", justifyContent: "space-between",
                                            padding: "8px 0", borderBottom: "1px solid var(--border)",
                                        }}
                                    >
                                        <span style={{ fontSize: 12.5, fontWeight: 600, color: "var(--text-primary)" }}>
                                            {emp.employee_name}
                                        </span>
                                        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                                            <span style={{ fontSize: 10.5, color: "var(--text-muted)" }}>
                                                {latest.task_count} rated
                                            </span>
                                            <RatingBar value={latest.avg_rating} />
                                            <span style={{ fontSize: 12.5, fontWeight: 700, color: "var(--text-primary)", width: 28 }}>
                                                {latest.avg_rating.toFixed(1)}
                                            </span>
                                            <TrendArrow current={latest.avg_rating} previous={previous?.avg_rating} />
                                        </div>
                                    </div>
                                );
                            })}
                            {data.employees.length === 0 && (
                                <div style={{ color: "var(--text-muted)", fontSize: 12, padding: "12px 0" }}>
                                    No employees have rated tasks yet.
                                </div>
                            )}
                        </div>
                    </>
                )}
            </div>
        </div>
    );
}