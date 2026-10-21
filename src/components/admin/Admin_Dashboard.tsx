import { useEffect, useState, useCallback } from "react";
import { Button, Spin } from "antd";
import { ReloadOutlined } from "@ant-design/icons";
import { useAuth } from "../AuthContext"; // adjust path to match your project
import WorkTimelineChart from "../common/WorkTimelineChart";
import WeeklyTaskAllocationChart from "../common/WeeklyTaskAllocationChart";

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

function StatCard({ label, value, changeLabel, changeType }: {
    label: string; value: number | string; changeLabel: string; changeType: "up" | "down" | "neutral";
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

interface Summary {
    total_tasks: number;
    completed: number;
    completion_rate: number;
    overdue: number;
    total_hours: number;
    avg_rating: number | null;
    monthly_assigned_hours?: number;
    monthly_working_hours?: number;
    monthly_working_days?: number;
    monthly_capacity_percentage?: number;
    month_name?: string;
}

interface ByStatusRow {
    task_status: TaskStatus;
    count: number;
}

interface ReportTask {
    id: number;
    task_id: string;
    task_name: string;
    assigned_to_name: string | null;
    priority: string | null;
    task_status: TaskStatus;
    total_time_taken: number;
    allotted_time: number | null;
    assigned_date: string;
}

interface ReportData {
    summary: Summary;
    by_employee: { assigned_to__name: string; count: number; hours: number | null }[];
    by_status: ByStatusRow[];
    tasks: ReportTask[];
}

export default function Admin_Dashboard() {
    const { user } = useAuth();
    const [data, setData] = useState<ReportData | null>(null);
    const [loading, setLoading] = useState(true);   // ← renamed from _loading, now actually used
    const [pendingReviewCount, setPendingReviewCount] = useState(0);

    const fetchAll = useCallback(async (retryCount = 0) => {
        setLoading(true);
        try {
            const [reportRes, reviewRes] = await Promise.all([
                fetch(`${BASE_URL}/api/tasks/reports/admin/`, { headers: { ...authHeaders() } }),
                fetch(`${BASE_URL}/api/tasks/review_tasks/`, { headers: { ...authHeaders() } }),
            ]);

            if (!reportRes.ok) {
                if (retryCount < 1) {
                    setTimeout(() => fetchAll(retryCount + 1), 1200);
                    return;
                }
                throw new Error(`Report HTTP ${reportRes.status}`);
            }

            const report = await reportRes.json();
            const reviewQueue = reviewRes.ok ? await reviewRes.json() : [];

            if (report && typeof report === "object" && "summary" in report) {
                setData(report);
            }
            setPendingReviewCount(Array.isArray(reviewQueue) ? reviewQueue.length : 0);
        } catch (err) {
            console.warn("Dashboard fetch error:", err);
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => {
        fetchAll();
    }, [fetchAll]);

    const totalTasks = data?.summary?.total_tasks ?? 0;
    const overdueCount = data?.summary?.overdue ?? 0;
    const openTasksCount = data?.by_status?.find?.((s) => s.task_status === "not_started")?.count ?? 0;
    const inProgressCount = data?.by_status?.find?.((s) => s.task_status === "in_progress")?.count ?? 0;
    const overduePercentage = totalTasks > 0 ? Math.round((overdueCount / totalTasks) * 100) : 0;
    const completedPercentage = data?.summary?.completion_rate ?? 0;

    return (
        <div>
            <div style={{
                display: "flex", justifyContent: "space-between", alignItems: "center",
                marginBottom: 18, borderBottom: "1px solid var(--border)", paddingBottom: 8,
            }}>
                <div>
                    <h1 style={{ fontSize: 18, fontWeight: 700, margin: 0, color: "var(--accent)" }}>
                        Welcome back{user?.name ? `, ${user.name}` : ""}
                    </h1>
                    <p style={{
                        fontSize: 9, color: "var(--text-muted)", margin: "4px 0 0",
                        fontWeight: 500, letterSpacing: "0.04em", textTransform: "uppercase",
                    }}>
                        Here's what's happening across your team today
                    </p>
                </div>
                <Button
                    onClick={() => fetchAll()}
                    icon={<ReloadOutlined />}
                    loading={loading}
                    className="db-card-action"
                    style={{ height: 35, fontSize: 12, fontWeight: 600, display: "flex", alignItems: "center", gap: 6, paddingInline: 14 }}
                >
                    Refresh
                </Button>
            </div>

            {/* ── Overview ── */}
            <Spin spinning={loading} tip="Loading dashboard...">
                <div className="db-stat-grid" style={{ minHeight: loading && !data ? 160 : undefined }}>
                    <StatCard label="All Tasks" value={totalTasks} changeLabel="Total tasks tracked" changeType="neutral" />
                    <StatCard label="Open Tasks" value={openTasksCount} changeLabel="Not yet started" changeType="neutral" />
                    <StatCard label="In Progress" value={inProgressCount} changeLabel="Currently active" changeType="up" />
                    <StatCard label="Overdue Tasks" value={overdueCount} changeLabel="Past due date" changeType={overdueCount > 0 ? "down" : "neutral"} />
                    <StatCard label="Review Pending" value={pendingReviewCount} changeLabel="Awaiting your decision" changeType={pendingReviewCount > 0 ? "down" : "neutral"} />
                    <StatCard
                        label="Monthly Task Assigned"
                        value={`${data?.summary?.monthly_assigned_hours ?? 0} / ${data?.summary?.monthly_working_hours ?? 216} hrs`}
                        changeLabel={`${data?.summary?.monthly_working_days ?? 27} workdays @ 8h (${data?.summary?.monthly_capacity_percentage ?? 0}%)`}
                        changeType="neutral"
                    />
                    <StatCard
                        label="Monthly Capacity"
                        value={`${data?.summary?.monthly_working_hours ?? 216} hrs`}
                        changeLabel="6 days working (Mon–Sat, Sun off)"
                        changeType="neutral"
                    />
                    <StatCard label="Overdue %" value={`${overduePercentage}%`} changeLabel="Of all tracked tasks" changeType={overduePercentage > 0 ? "down" : "neutral"} />
                    <StatCard label="Completed %" value={`${completedPercentage}%`} changeLabel="Of all tracked tasks" changeType="up" />
                </div>

                {/* ── Weekly Task Allocation Chart (Assigned Hours vs 8h Daily Capacity) ── */}
                <div style={{ marginTop: 22 }}>
                    <WeeklyTaskAllocationChart role="admin" />
                </div>

                {/* ── Daily Work & Break Timeline Chart ── */}
                <div style={{ marginTop: 22 }}>
                    <WorkTimelineChart role="admin" />
                </div>
            </Spin>
        </div>
    );
}