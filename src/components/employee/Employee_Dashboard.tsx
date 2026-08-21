import { useEffect, useState, useCallback, useRef } from "react";
import { Link } from "react-router-dom";
import { Button, message } from "antd";
import { ReloadOutlined, ArrowRightOutlined, PlayCircleOutlined, RocketOutlined } from "@ant-design/icons";
import dayjs from "dayjs";
import { useAuth } from "../AuthContext"; // adjust path to match your project

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

function formatElapsed(seconds: number): string {
    const h = Math.floor(seconds / 3600);
    const m = Math.floor((seconds % 3600) / 60);
    const s = Math.floor(seconds % 60);
    return [h, m, s].map((n) => String(n).padStart(2, "0")).join(":");
}

export default function Employee_Dashboard() {
    const { user } = useAuth();
    const [data, setData] = useState<ReportData | null>(null);
    const [_loading, setLoading] = useState(true);
    const [activeSession, setActiveSession] = useState<ActiveSession | null>(null);
    const [elapsed, setElapsed] = useState(0);
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
            })
            .catch((err) => {
                console.error("Dashboard fetch failed:", err);
                message.error("Failed to load your dashboard");
            }).finally(() => setLoading(false));
    }, []);

    useEffect(() => {
        fetchAll();
    }, [fetchAll]);

    useEffect(() => {
        if (tickRef.current) window.clearInterval(tickRef.current);
        if (!activeSession) return;

        const update = () => {
            const secs = dayjs().diff(dayjs(activeSession.session.start_time), "second");
            setElapsed(Math.max(0, secs));
        };
        update();
        tickRef.current = window.setInterval(update, 1000);

        return () => {
            if (tickRef.current) window.clearInterval(tickRef.current);
        };
    }, [activeSession]);

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
                <Button
                    onClick={fetchAll}
                    icon={<ReloadOutlined />}
                    className="db-card-action"
                    style={{ height: 35, fontSize: 12, fontWeight: 600, display: "flex", alignItems: "center", gap: 6, paddingInline: 14 }}
                >
                    Refresh
                </Button>
            </div>

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
                        <Link to="/employee/active_tasks">
                            <Button style={{ fontSize: 12, fontWeight: 600, borderRadius: 8 }}>Go to task</Button>
                        </Link>
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
            <div className="db-stat-grid">
                <StatCard label="My Total Tasks" value={data?.summary.total_tasks ?? 0} changeLabel="All time" changeType="neutral" />
                <StatCard label="Completed" value={data?.summary.completed ?? 0} changeLabel="Approved by admin" changeType="up" />
                <StatCard label="Completion Rate" value={`${data?.summary.completion_rate ?? 0}%`} changeLabel="Of your assigned tasks" changeType="up" />
                <StatCard label="Total Hours Logged" value={data?.summary.total_hours ?? 0} changeLabel="All time" changeType="neutral" />
            </div>


        </div>
    );
}