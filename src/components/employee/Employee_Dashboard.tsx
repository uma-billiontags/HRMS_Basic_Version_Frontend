import { useEffect, useState, useCallback, useRef } from "react";
import { Link } from "react-router-dom";
import { Button, message, Spin } from "antd";
import { ReloadOutlined, ArrowRightOutlined, PlayCircleOutlined, RocketOutlined, CoffeeOutlined, PauseCircleOutlined } from "@ant-design/icons";
import dayjs from "dayjs";
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
    total_hours: number;
    avg_rating: number | null;
    monthly_assigned_hours?: number;
    monthly_working_hours?: number;
    monthly_working_days?: number;
    monthly_capacity_percentage?: number;
    month_name?: string;
}

interface QualityRow {
    quality_of_task: string;
    count: number;
}

interface ReportTask {
    id: number;
    task_id: string;
    task_name: string;
    task_status: TaskStatus;
    priority: string | null;
    total_time_taken: number;
    allotted_time: number | null;
    assigned_date: string;
    quality_of_task: string;
    rating: number | null;
}

interface ReportData {
    summary: Summary;
    by_quality: QualityRow[];
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

interface AttendanceStatus {
    has_checked_in: boolean;
    has_checked_out: boolean;
    attendance: {
        date: string;
        in_time: string | null;
        out_time: string | null;
    } | null;
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

export default function Employee_Dashboard() {
    const { user } = useAuth();
    const isTL = user?.isTL ?? false;
    const [selectedMemberId, setSelectedMemberId] = useState<string | number>("");
    const [data, setData] = useState<ReportData | null>(null);
    const [loading, setLoading] = useState(true);   // ← renamed from _loading
    const [activeSession, setActiveSession] = useState<ActiveSession | null>(null);
    const [activePause, setActivePause] = useState<ActivePause | null>(null);
    const [elapsed, setElapsed] = useState(0);
    const [breakRemaining, setBreakRemaining] = useState<number>(0);
    const [resuming, setResuming] = useState(false);
    const [attendanceStatus, setAttendanceStatus] = useState<AttendanceStatus | null>(null);
    const [attendanceClock, setAttendanceClock] = useState(() => dayjs());
    const tickRef = useRef<number | null>(null);

    const fetchAll = useCallback(() => {
        setLoading(true);
        Promise.all([
            fetch(`${BASE_URL}/api/tasks/reports/employee/`, { headers: { ...authHeaders() } }).then((r) => r.json()),
            fetch(`${BASE_URL}/api/tasks/my_active_session/`, { headers: { ...authHeaders() } }).then((r) => r.json()),
        ])
            .then(([report, session]) => {
                setData(report);
                setActiveSession(session?.active ? session : null);
                setActivePause(session?.active_pause ?? null);
            })
            .catch((err) => {
                console.error("Dashboard fetch failed:", err);
                message.error("Failed to load your dashboard");
            }).finally(() => setLoading(false));
    }, []);

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

    useEffect(() => {
        fetchAll();
    }, [fetchAll]);

    // Keep the dashboard's check-in indicator in sync with today's attendance.
    const fetchAttendanceStatus = useCallback(async () => {
        try {
            const response = await fetch(`${BASE_URL}/api/attendance/today_status/`, {
                headers: authHeaders(),
            });
            if (!response.ok) throw new Error("Failed to load attendance status");
            setAttendanceStatus(await response.json());
        } catch (error) {
            console.error("Attendance status fetch failed:", error);
        }
    }, []);

    useEffect(() => {
        fetchAttendanceStatus();
        const pollId = window.setInterval(fetchAttendanceStatus, 30_000);
        const clockId = window.setInterval(() => setAttendanceClock(dayjs()), 1_000);
        return () => {
            window.clearInterval(pollId);
            window.clearInterval(clockId);
        };
    }, [fetchAttendanceStatus]);

    const attendance = attendanceStatus?.attendance;
    const isAttendanceWorking = Boolean(
        attendanceStatus?.has_checked_in &&
        !attendanceStatus.has_checked_out &&
        attendance?.in_time &&
        !attendance.out_time
    );
    const attendanceElapsed = isAttendanceWorking && attendance?.in_time
        ? formatElapsed(Math.max(0, attendanceClock.diff(dayjs(`${attendance.date}T${attendance.in_time}`), "second")))
        : null;

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
                        Here's a look at your work
                    </p>
                </div>
                <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                    {isAttendanceWorking && attendanceElapsed && (
                        <div
                            role="status"
                            aria-label={`Working for ${attendanceElapsed}`}
                            style={{
                                display: "flex", alignItems: "center", gap: 9,
                                padding: "7px 12px", borderRadius: 12,
                                border: "1px solid #a7f3d0", background: "#ecfdf5", color: "#047857",
                            }}
                        >
                            <span style={{
                                width: 10, height: 10, borderRadius: "50%", background: "#10b981",
                                boxShadow: "0 0 0 4px #a7f3d0", flexShrink: 0,
                            }} />
                            <span style={{ display: "flex", flexDirection: "column", lineHeight: 1.2 }}>
                                <span style={{ fontSize: 11, fontWeight: 700 }}>WORKING</span>
                                <span style={{ fontSize: 13, fontWeight: 700, fontVariantNumeric: "tabular-nums" }}>{attendanceElapsed}</span>
                            </span>
                        </div>
                    )}
                    <Button
                        onClick={() => { fetchAll(); fetchAttendanceStatus(); }}
                        icon={<ReloadOutlined />}
                        loading={loading}
                        className="db-card-action"
                        style={{ height: 35, fontSize: 12, fontWeight: 600, display: "flex", alignItems: "center", gap: 6, paddingInline: 14 }}
                    >
                        Refresh
                    </Button>
                </div>
            </div>
            <Spin spinning={loading} tip="Loading your dashboard...">
                {/* ── Currently working on ── */}
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
                            <Link to="/employee/all_tasks">
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
                ) : (
                    <div className="db-chart-card" style={{
                        marginBottom: 18, display: "flex", alignItems: "center", gap: 12,
                        color: "var(--text-secondary)",
                    }}>
                        <RocketOutlined style={{ fontSize: 16 }} />
                        <span style={{ fontSize: 13 }}>No task in progress right now.</span>
                        <Link
                            to="/employee/active_tasks"
                            style={{ fontSize: 12, fontWeight: 600, marginLeft: "auto", display: "flex", alignItems: "center", gap: 4, color: "var(--accent)", textDecoration: "none" }}
                        >
                            View your tasks <ArrowRightOutlined />
                        </Link>
                    </div>
                )}

                {/* ── Overview ── */}
                <div className="db-stat-grid" style={{ minHeight: loading && !data ? 120 : undefined }}>
                    <StatCard label="My Total Tasks" value={data?.summary.total_tasks ?? 0} changeLabel="All time" changeType="neutral" />
                    <StatCard label="Completed" value={data?.summary.completed ?? 0} changeLabel="Approved by admin" changeType="up" />
                    <StatCard label="Completion Rate" value={`${data?.summary.completion_rate ?? 0}%`} changeLabel="Of your assigned tasks" changeType="up" />
                    <StatCard label="Total Hours Logged" value={data?.summary.total_hours ?? 0} changeLabel="All time" changeType="neutral" />
                    <StatCard
                        label="Monthly Task Assigned"
                        value={`${data?.summary.monthly_assigned_hours ?? 0} / ${data?.summary.monthly_working_hours ?? 216} hrs`}
                        changeLabel={`Out of ${data?.summary.monthly_working_hours ?? 216} hrs (${data?.summary.monthly_working_days ?? 27} workdays @ 8h)`}
                        changeType="neutral"
                    />
                    <StatCard
                        label="Monthly Capacity"
                        value={`${data?.summary.monthly_working_hours ?? 216} hrs`}
                        changeLabel="6 days working (Mon–Sat, Sun off)"
                        changeType="neutral"
                    />
                    <StatCard
                        label="Capacity Allocated"
                        value={`${data?.summary.monthly_capacity_percentage ?? 0}%`}
                        changeLabel="Of your monthly 8h/day capacity"
                        changeType={(data?.summary.monthly_capacity_percentage ?? 0) > 100 ? "down" : "up"}
                    />
                </div>

                {/* ── Weekly Task Allocation Chart (Assigned Hours vs 8h Daily Capacity) ── */}
                <div style={{ marginTop: 22 }}>
                    <WeeklyTaskAllocationChart
                        role="employee"
                        isTL={isTL}
                        selectedEmployeeIdProp={selectedMemberId}
                        onEmployeeChange={setSelectedMemberId}
                    />
                </div>

                {/* ── Daily Work & Break Timeline Chart ── */}
                <div style={{ marginTop: 22 }}>
                    <WorkTimelineChart
                        role="employee"
                        isTL={isTL}
                        selectedEmployeeIdProp={selectedMemberId}
                        onEmployeeChange={setSelectedMemberId}
                    />
                </div>
            </Spin>
        </div>
    );
}
