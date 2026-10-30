import { useEffect, useState, useCallback, useRef } from "react";
import { Link } from "react-router-dom";
import { Spin, Button, message } from "antd";
import { PlayCircleOutlined, PauseCircleOutlined, CoffeeOutlined } from "@ant-design/icons";
import dayjs from "dayjs";
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

interface ActiveSession {
    task: number;
    task_name: string;
    session: { id: number; start_time: string };
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

function formatElapsed(seconds: number): string {
    const h = Math.floor(seconds / 3600);
    const m = Math.floor((seconds % 3600) / 60);
    const s = Math.floor(seconds % 60);
    return [h, m, s].map((n) => String(n).padStart(2, "0")).join(":");
}

function formatBreakTime(remainingSecs: number): string {
    const isOver = remainingSecs < 0;
    const abs = Math.abs(remainingSecs);
    const m = Math.floor(abs / 60);
    const s = abs % 60;
    const formatted = `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
    return isOver ? `${formatted} (Exceeded)` : `${formatted} remaining`;
}

export default function Admin_Dashboard() {
    const [data, setData] = useState<ReportData | null>(null);
    const [loading, setLoading] = useState(true);
    const [pendingReviewCount, setPendingReviewCount] = useState(0);
    const [activeSession, setActiveSession] = useState<ActiveSession | null>(null);
    const [activePause, setActivePause] = useState<ActivePause | null>(null);
    const [elapsed, setElapsed] = useState(0);
    const [breakRemaining, setBreakRemaining] = useState<number>(0);
    const [resuming, setResuming] = useState(false);
    const tickRef = useRef<number | null>(null);

    const fetchAll = useCallback(async (retryCount = 0) => {
        setLoading(true);
        try {
            const [reportRes, reviewRes, sessionRes] = await Promise.all([
                fetch(`${BASE_URL}/api/tasks/reports/admin/`, { headers: { ...authHeaders() } }),
                fetch(`${BASE_URL}/api/tasks/review_tasks/`, { headers: { ...authHeaders() } }),
                fetch(`${BASE_URL}/api/tasks/my_active_session/`, { headers: { ...authHeaders() } }),
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
            const session = sessionRes.ok ? await sessionRes.json() : null;

            if (report && typeof report === "object" && "summary" in report) {
                setData(report);
            }
            setPendingReviewCount(Array.isArray(reviewQueue) ? reviewQueue.length : 0);
            setActiveSession(session?.active ? session : null);
            setActivePause(session?.active_pause ?? null);
        } catch (err) {
            console.warn("Dashboard fetch error:", err);
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => {
        fetchAll();
    }, [fetchAll]);

    useEffect(() => {
        if (tickRef.current) window.clearInterval(tickRef.current);
        if (!activeSession && !activePause) return;

        const update = () => {
            if (activeSession) {
                const secs = dayjs().diff(dayjs(activeSession.session.start_time), "second");
                setElapsed(Math.max(0, secs));
            }
            if (activePause) {
                const passedSecs = dayjs().diff(dayjs(activePause.start_time), "second");
                if (activePause.break_duration_minutes) {
                    const totalSecs = activePause.break_duration_minutes * 60;
                    setBreakRemaining(totalSecs - passedSecs);
                } else {
                    setBreakRemaining(-passedSecs);
                }
            }
        };
        update();
        tickRef.current = window.setInterval(update, 1000);

        return () => {
            if (tickRef.current) window.clearInterval(tickRef.current);
        };
    }, [activeSession, activePause]);

    const handleResumeBreak = async () => {
        if (!activePause) return;
        setResuming(true);
        try {
            const res = await fetch(`${BASE_URL}/api/tasks/${activePause.task}/resume/`, {
                method: "POST",
                headers: { "Content-Type": "application/json", ...authHeaders() },
            });
            if (res.ok) {
                message.success("Task resumed successfully");
                fetchAll();
            } else {
                const err = await res.json().catch(() => ({}));
                message.error(err.detail || "Failed to resume task");
            }
        } catch {
            message.error("Network error");
        } finally {
            setResuming(false);
        }
    };

    const totalTasks = data?.summary?.total_tasks ?? 0;
    const overdueCount = data?.summary?.overdue ?? 0;
    const openTasksCount = data?.by_status?.find?.((s) => s.task_status === "not_started")?.count ?? 0;
    const inProgressCount = data?.by_status?.find?.((s) => s.task_status === "in_progress")?.count ?? 0;
    const overduePercentage = totalTasks > 0 ? Math.round((overdueCount / totalTasks) * 100) : 0;
    const completedPercentage = data?.summary?.completion_rate ?? 0;

    return (
        <div>
            {/* ── Overview ── */}
            <Spin spinning={loading} tip="Loading dashboard...">
                {/* ── Currently working on / Paused ── */}
                {activeSession ? (
                    <div className="db-chart-card" style={{
                        marginBottom: 18, display: "flex", alignItems: "center", justifyContent: "space-between",
                        borderLeft: "3px solid var(--blue)",
                    }}>
                        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                            <span style={{ color: "var(--blue)", display: "flex", fontSize: 20 }}>
                                <PlayCircleOutlined />
                            </span>
                            <div>
                                <div style={{ fontSize: 10, fontWeight: 700, color: "var(--blue)", textTransform: "uppercase", letterSpacing: "0.05em" }}>
                                    Currently working on
                                </div>
                                <div style={{ fontSize: 14, fontWeight: 700, color: "var(--text-primary)" }}>{activeSession.task_name}</div>
                            </div>
                        </div>
                        <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
                            <span style={{ fontSize: 20, fontWeight: 700, fontVariantNumeric: "tabular-nums", color: "var(--blue)" }}>
                                {formatElapsed(elapsed)}
                            </span>
                            <Link to="/admin/my_tasks">
                                <Button style={{ fontSize: 12, fontWeight: 600, borderRadius: 8 }}>Go to task</Button>
                            </Link>
                        </div>
                    </div>
                ) : activePause ? (
                    <div className="db-chart-card" style={{
                        marginBottom: 18, display: "flex", alignItems: "center", justifyContent: "space-between",
                        borderLeft: "3px solid #d97706",
                        background: "#fffbeb",
                    }}>
                        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                            <span style={{ color: "#d97706", display: "flex", fontSize: 22 }}>
                                {activePause.pause_type === "break" ? <CoffeeOutlined /> : <PauseCircleOutlined />}
                            </span>
                            <div>
                                <div style={{ fontSize: 10, fontWeight: 700, color: "#d97706", textTransform: "uppercase", letterSpacing: "0.05em" }}>
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
                                fontSize: 20,
                                fontWeight: 700,
                                fontVariantNumeric: "tabular-nums",
                                color: breakRemaining < 0 ? "var(--red, #cf1322)" : "#d97706",
                            }}>
                                {formatBreakTime(breakRemaining)}
                            </span>
                            <Button
                                type="primary"
                                loading={resuming}
                                onClick={handleResumeBreak}
                                style={{ fontSize: 12, fontWeight: 600, borderRadius: 8, background: "var(--accent)", border: "none" }}
                            >
                                Resume Task
                            </Button>
                        </div>
                    </div>
                ) : null}

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