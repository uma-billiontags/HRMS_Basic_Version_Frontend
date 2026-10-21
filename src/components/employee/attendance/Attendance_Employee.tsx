import { useEffect, useState, useCallback, useMemo, useRef } from "react";
import {
    Card,
    Button,
    Input,
    Modal,
    Tag,
    message,
    Tooltip,
    Select,
    Timeline,
    Typography,
    Divider,
    Popconfirm,
    Avatar,
} from "antd";
import {
    ClockCircleOutlined,
    LoginOutlined,
    LogoutOutlined,
    CalendarOutlined,
    CommentOutlined,
    ReloadOutlined,
    InfoCircleOutlined,
    LeftOutlined,
    RightOutlined,
    EditOutlined,
    CheckCircleOutlined,
    HourglassOutlined,
    PictureOutlined,
    DeleteOutlined,
} from "@ant-design/icons";
import dayjs from "dayjs";
import { useAuth } from "../../AuthContext";

const { Text, Title } = Typography;
const { TextArea } = Input;

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

function formatDurationBadge(hours: number | null | undefined): string {
    if (hours === null || hours === undefined) return "--";
    const totalMinutes = Math.round(Number(hours) * 60);
    if (totalMinutes === 0) return "0 mins";
    if (totalMinutes < 60) {
        return `${totalMinutes} mins`;
    }
    const h = Math.floor(totalMinutes / 60);
    const m = totalMinutes % 60;
    return m > 0 ? `${h}h ${m}m` : `${h}h`;
}

function formatDurationDetail(hours: number | null | undefined): string {
    if (hours === null || hours === undefined) return "0 mins (0 hrs)";
    const totalMinutes = Math.round(Number(hours) * 60);
    if (totalMinutes < 60) {
        return `${totalMinutes} mins (${hours ?? 0} hrs)`;
    }
    const h = Math.floor(totalMinutes / 60);
    const m = totalMinutes % 60;
    const hmStr = m > 0 ? `${h}h ${m}m` : `${h}h`;
    return `${hmStr} (${hours ?? 0} hrs)`;
}

const formatBreakBadge = formatDurationBadge;
const formatBreakDetail = formatDurationDetail;


interface AttendanceCommentItem {
    id: number;
    author_name: string;
    author_role: string;
    comment: string;
    created_at: string;
}

export interface AttendanceCorrectionItem {
    id: number;
    attendance?: number | null;
    employee?: number | null;
    employee_name: string;
    department?: string;
    date: string;
    request_type: "in_time" | "out_time";
    system_time: string | null;
    system_time_formatted: string | null;
    requested_time: string;
    requested_time_formatted: string | null;
    reason: string;
    custom_reason: string;
    proof_screenshot: string | null;
    proof_screenshot_url: string | null;
    status: "pending" | "approved" | "rejected";
    admin_notes: string;
    decided_by_name: string | null;
    decided_at: string | null;
    created_at: string;
}

interface AttendanceDayRecord {
    id: number | null;
    date: string;
    day_name: string;
    employee: number | null;
    employee_name: string;
    tag_id: string;
    designation: string;
    department: string;
    in_time: string | null;
    out_time: string | null;
    in_time_formatted: string | null;
    out_time_formatted: string | null;
    total_hours: number | null;
    production_hours?: number | null;
    task_work_hours?: number | null;
    break_hours?: number | null;
    normal_break_hours?: number | null;
    other_pause_hours?: number | null;
    untracked_hours?: number | null;
    status: string;
    time_doctor: string;
    time_champ: string;
    remarks: string;
    comments: AttendanceCommentItem[];
    corrections?: AttendanceCorrectionItem[];
}

interface MonthlySummary {
    total_days: number;
    present: number;
    absent: number;
    week_off: number;
    govt_holiday: number;
    early: number;
    on_time: number;
    grace: number;
    late: number;
    half_day: number;
    leave: number;
    total_hours: number;
    production_hours?: number;
    break_hours?: number;
}

interface TodayStatusResponse {
    date: string;
    current_server_time: string;
    has_checked_in: boolean;
    has_checked_out: boolean;
    has_in_correction?: boolean;
    has_out_correction?: boolean;
    attendance: AttendanceDayRecord | null;
    is_sunday: boolean;
    today_corrections?: AttendanceCorrectionItem[];
}

const DEFAULT_REASONS = [
    "Forgot to Check In",
    "System / Internet Issue",
    "TimeChamp Sync Issue",
    "Client Discussion",
    "Official Discussion",
    "Team Meeting",
    "Personal Work",
    "Traffic / Commute Delay",
];

export default function Attendance_Employee() {
    const { user } = useAuth();

    // Current live time (updates every second)
    const [currentTime, setCurrentTime] = useState<dayjs.Dayjs>(dayjs());

    // Today's Status State
    const [todayStatus, setTodayStatus] = useState<TodayStatusResponse | null>(null);
    const [loadingToday, setLoadingToday] = useState(false);
    const [punchingIn, setPunchingIn] = useState(false);
    const [punchingOut, setPunchingOut] = useState(false);

    // Monthly Calendar State
    const [selectedYear, setSelectedYear] = useState<number>(dayjs().year());
    const [selectedMonth, setSelectedMonth] = useState<number>(dayjs().month() + 1); // 1-12
    const [monthlyDays, setMonthlyDays] = useState<AttendanceDayRecord[]>([]);
    const [monthlySummary, setMonthlySummary] = useState<MonthlySummary | null>(null);
    const [loadingMonthly, setLoadingMonthly] = useState(false);

    // Comment Modal State
    const [commentModalVisible, setCommentModalVisible] = useState(false);
    const [selectedRecordForComment, setSelectedRecordForComment] = useState<AttendanceDayRecord | null>(null);
    const [newCommentText, setNewCommentText] = useState("");
    const [submittingComment, setSubmittingComment] = useState(false);

    // Time Correction Modal State
    const [correctionModalOpen, setCorrectionModalOpen] = useState(false);
    const [correctionTargetDay, setCorrectionTargetDay] = useState<AttendanceDayRecord | null>(null);
    const [correctionType, setCorrectionType] = useState<"in_time" | "out_time">("in_time");
    const [requestedTime, setRequestedTime] = useState<string>("09:30");
    const [selectedReason, setSelectedReason] = useState<string>("Forgot to Check In");
    const [customReason, setCustomReason] = useState<string>("");
    const [proofFile, setProofFile] = useState<File | null>(null);
    const [proofPreviewUrl, setProofPreviewUrl] = useState<string | null>(null);
    const [submittingCorrection, setSubmittingCorrection] = useState(false);
    const fileInputRef = useRef<HTMLInputElement | null>(null);

    // Full Image Preview Modal
    const [imagePreviewModalOpen, setImagePreviewModalOpen] = useState(false);
    const [imagePreviewSrc, setImagePreviewSrc] = useState<string>("");

    // Live Clock ticker
    useEffect(() => {
        const timer = setInterval(() => {
            setCurrentTime(dayjs());
        }, 1000);
        return () => clearInterval(timer);
    }, []);

    // Fetch Today's Punch Status
    const fetchTodayStatus = useCallback(async () => {
        setLoadingToday(true);
        try {
            const res = await fetch(`${BASE_URL}/api/attendance/today_status/`, {
                headers: authHeaders(),
            });
            if (!res.ok) throw new Error("Failed to load today's status");
            const data: TodayStatusResponse = await res.json();
            setTodayStatus(data);
        } catch (err: unknown) {
            const msg = err instanceof Error ? err.message : "Error loading status";
            message.error(msg);
        } finally {
            setLoadingToday(false);
        }
    }, []);

    // Fetch Monthly Attendance History
    const fetchMonthlyAttendance = useCallback(async (year: number, month: number) => {
        setLoadingMonthly(true);
        try {
            const res = await fetch(`${BASE_URL}/api/attendance/my_attendance/?year=${year}&month=${month}`, {
                headers: authHeaders(),
            });
            if (!res.ok) throw new Error("Failed to load monthly attendance");
            const data = await res.json();
            setMonthlyDays(data.days || []);
            setMonthlySummary(data.summary || null);
        } catch (err: unknown) {
            const msg = err instanceof Error ? err.message : "Error loading attendance history";
            message.error(msg);
        } finally {
            setLoadingMonthly(false);
        }
    }, []);

    useEffect(() => {
        fetchTodayStatus();
    }, [fetchTodayStatus]);

    useEffect(() => {
        fetchMonthlyAttendance(selectedYear, selectedMonth);
    }, [fetchMonthlyAttendance, selectedYear, selectedMonth]);

    // Handle Check-In Punch (Railway 24-hr server time lock)
    const handleCheckIn = async () => {
        setPunchingIn(true);
        try {
            const res = await fetch(`${BASE_URL}/api/attendance/check_in/`, {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                    ...authHeaders(),
                },
                body: JSON.stringify({}),
            });
            const data = await res.json();
            if (!res.ok) {
                throw new Error(data.detail || "Check-in failed");
            }
            message.success(`Checked in successfully at ${data.in_time_formatted || data.in_time} (24-hr)! Status: ${data.status}`);
            await fetchTodayStatus();
            fetchMonthlyAttendance(selectedYear, selectedMonth);
        } catch (err: unknown) {
            const msg = err instanceof Error ? err.message : "Check-in failed";
            message.error(msg);
        } finally {
            setPunchingIn(false);
        }
    };

    // Handle Check-Out Punch (Railway 24-hr server time lock)
    const handleCheckOut = async () => {
        setPunchingOut(true);
        try {
            const res = await fetch(`${BASE_URL}/api/attendance/check_out/`, {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                    ...authHeaders(),
                },
                body: JSON.stringify({}),
            });
            const data = await res.json();
            if (!res.ok) {
                throw new Error(data.detail || "Check-out failed");
            }
            message.success(
                `Checked out successfully at ${data.out_time_formatted || data.out_time}! Production: ${data.production_hours ?? 0} hrs | Break/Pauses: ${data.break_hours ?? 0} hrs.`
            );
            await fetchTodayStatus();
            fetchMonthlyAttendance(selectedYear, selectedMonth);
        } catch (err: unknown) {
            const msg = err instanceof Error ? err.message : "Check-out failed";
            message.error(msg);
        } finally {
            setPunchingOut(false);
        }
    };

    // Handle Adding Comment/Remark to an Attendance record
    const handleAddComment = async () => {
        if (!selectedRecordForComment || !selectedRecordForComment.id) {
            message.warning("Cannot add comment to a day without an attendance record.");
            return;
        }
        if (!newCommentText.trim()) {
            message.warning("Please type a note or explanation.");
            return;
        }

        setSubmittingComment(true);
        try {
            const res = await fetch(`${BASE_URL}/api/attendance/add_comment/`, {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                    ...authHeaders(),
                },
                body: JSON.stringify({
                    attendance_id: selectedRecordForComment.id,
                    comment: newCommentText.trim(),
                }),
            });
            const data = await res.json();
            if (!res.ok) throw new Error(data.detail || "Failed to post comment");
            message.success("Comment added successfully!");
            setNewCommentText("");
            setCommentModalVisible(false);
            fetchMonthlyAttendance(selectedYear, selectedMonth);
            fetchTodayStatus();
        } catch (err: unknown) {
            const msg = err instanceof Error ? err.message : "Failed to post comment";
            message.error(msg);
        } finally {
            setSubmittingComment(false);
        }
    };

    // Open Time Correction Modal
    const handleOpenCorrection = (day: AttendanceDayRecord, type: "in_time" | "out_time") => {
        setCorrectionTargetDay(day);
        setCorrectionType(type);

        const existing = type === "in_time" ? (day.in_time_formatted || day.in_time) : (day.out_time_formatted || day.out_time);
        if (existing) {
            // Cut to HH:mm
            setRequestedTime(existing.slice(0, 5));
        } else {
            setRequestedTime(type === "in_time" ? "09:30" : "18:30");
        }

        setSelectedReason("Forgot to Check In");
        setCustomReason("");
        setProofFile(null);
        setProofPreviewUrl(null);
        setCorrectionModalOpen(true);
    };

    // Handle file selection for TimeChamp proof
    const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (file) {
            if (!file.type.startsWith("image/")) {
                message.error("Please upload an image file (PNG, JPG, etc.) for TimeChamp proof.");
                return;
            }
            setProofFile(file);
            setProofPreviewUrl(URL.createObjectURL(file));
        }
    };

    // Submit Time Correction Request
    const handleSubmitCorrection = async () => {
        if (!correctionTargetDay) return;
        if (!requestedTime) {
            message.error("Please specify the requested time.");
            return;
        }
        if (!selectedReason) {
            message.error("Please select a reason.");
            return;
        }

        setSubmittingCorrection(true);
        try {
            const formData = new FormData();
            formData.append("date", correctionTargetDay.date);
            formData.append("request_type", correctionType);
            formData.append("requested_time", requestedTime);
            formData.append("reason", selectedReason);
            if (customReason.trim()) {
                formData.append("custom_reason", customReason.trim());
            }
            if (proofFile) {
                formData.append("proof_screenshot", proofFile);
            }

            const res = await fetch(`${BASE_URL}/api/attendance/correction-request/`, {
                method: "POST",
                headers: {
                    ...authHeaders(),
                },
                body: formData,
            });

            const data = await res.json().catch(() => null);
            if (!res.ok) {
                throw new Error(data?.detail || "Failed to submit time correction request");
            }

            message.success(
                `Time correction request for ${correctionType === "in_time" ? "In-Time" : "Out-Time"} (${requestedTime}) submitted successfully for Admin review.`
            );
            setCorrectionModalOpen(false);

            // Refresh today's status and monthly history immediately
            await fetchTodayStatus();
            await fetchMonthlyAttendance(selectedYear, selectedMonth);
        } catch (err: unknown) {
            const msg = err instanceof Error ? err.message : "Failed to submit request";
            message.error(msg);
        } finally {
            setSubmittingCorrection(false);
        }
    };

    // Quick helper for month navigation
    const handlePrevMonth = () => {
        if (selectedMonth === 1) {
            setSelectedMonth(12);
            setSelectedYear((prev) => prev - 1);
        } else {
            setSelectedMonth((prev) => prev - 1);
        }
    };

    const handleNextMonth = () => {
        if (selectedMonth === 12) {
            setSelectedMonth(1);
            setSelectedYear((prev) => prev + 1);
        } else {
            setSelectedMonth((prev) => prev + 1);
        }
    };

    // Badge color helper
    const getStatusTag = (status: string) => {
        switch (status) {
            case "Early":
                return <Tag color="cyan">Early (Before 09:30)</Tag>;
            case "On Time":
                return <Tag color="green">On Time (09:30)</Tag>;
            case "Grace":
                return <Tag color="gold">Grace (09:31 - 09:45)</Tag>;
            case "Late":
                return <Tag color="volcano">Late Arrival (&gt; 09:45)</Tag>;
            case "Half Day":
                return <Tag color="magenta">Half Day (&lt; 4.5 hrs)</Tag>;
            case "Absent":
                return <Tag color="red">Absent</Tag>;
            case "Week Off":
                return <Tag color="default">Week Off (Sunday)</Tag>;
            case "Govt Holiday":
                return <Tag color="blue">Govt Holiday</Tag>;
            case "Leave":
                return <Tag color="purple">Leave</Tag>;
            case "On Duty":
                return <Tag color="geekblue">On Duty (OD)</Tag>;
            case "Permission":
                return <Tag color="orange">Permission</Tag>;
            default:
                return <Tag color="default">{status}</Tag>;
        }
    };

    // Calculate current live working session duration (like TimeChamp "Working - 01:52:11")
    const liveWorkingStats = useMemo(() => {
        if (!todayStatus?.attendance?.in_time) return null;
        const [h, m, s] = todayStatus.attendance.in_time.split(":").map(Number);
        const inDate = dayjs().hour(h).minute(m).second(s || 0);

        if (todayStatus.attendance.out_time) {
            const prodHrs = todayStatus.attendance.production_hours ?? todayStatus.attendance.total_hours ?? 0;
            return {
                isWorking: false,
                text: `${prodHrs} hrs`,
                formatted: `Shift Ended (Production: ${prodHrs} hrs)`,
                inTime: todayStatus.attendance.in_time_formatted || todayStatus.attendance.in_time,
                outTime: todayStatus.attendance.out_time_formatted || todayStatus.attendance.out_time,
            };
        }

        // Live working ticker
        const diffSeconds = currentTime.diff(inDate, "second");
        if (diffSeconds < 0) return { isWorking: true, text: "00:00:00", formatted: "00h 00m 00s" };
        const hours = Math.floor(diffSeconds / 3600);
        const mins = Math.floor((diffSeconds % 3600) / 60);
        const secs = diffSeconds % 60;
        const pad = (n: number) => String(n).padStart(2, "0");
        return {
            isWorking: true,
            text: `${pad(hours)}:${pad(mins)}:${pad(secs)}`,
            formatted: `${hours} hr ${mins} min`,
            inTime: todayStatus.attendance.in_time_formatted || todayStatus.attendance.in_time,
        };
    }, [todayStatus, currentTime]);

    // Check if check-in is disabled:
    // Disabled if user already checked in OR if user submitted an in_time manual correction for today!
    const isCheckInDisabled = useMemo(() => {
        if (todayStatus?.has_checked_in) return true;
        if (todayStatus?.has_in_correction) return true;
        // Also check today's row in monthlyDays
        const todayStr = dayjs().format("YYYY-MM-DD");
        const todayRow = monthlyDays.find((d) => d.date === todayStr);
        if (todayRow) {
            if (todayRow.in_time) return true;
            if (todayRow.corrections?.some((c) => c.request_type === "in_time" && c.status !== "rejected")) return true;
        }
        return false;
    }, [todayStatus, monthlyDays]);

    // Check if check-out is disabled:
    // Enabled once checked in and not yet checked out
    const isCheckOutDisabled = useMemo(() => {
        if (!todayStatus?.has_checked_in) return true;
        if (todayStatus?.has_checked_out) return true;
        return false;
    }, [todayStatus]);

    return (
        <div style={{ padding: "20px 24px", maxWidth: 1440, margin: "0 auto" }}>
            {/* ─────────────────────────────────────────────────────────────────────────────
                1. TOP HEADER WITH ACTION BUTTONS AT RIGHT END (SCREENSHOT 3)
            ───────────────────────────────────────────────────────────────────────────── */}
            <div
                style={{
                    display: "flex",
                    justifyContent: "space-between",
                    alignItems: "center",
                    flexWrap: "wrap",
                    gap: 16,
                    background: "#FFFFFF",
                    padding: "18px 24px",
                    borderRadius: 14,
                    border: "1px solid #EAECEF",
                    boxShadow: "0 2px 10px rgba(0,0,0,0.03)",
                    marginBottom: 20,
                }}
            >
                <div>
                    <Title level={3} style={{ margin: 0, color: "#1B3363", fontWeight: 700 }}>
                        <CalendarOutlined style={{ marginRight: 10, color: "#1B3363" }} />
                        Attendance & Punch Management
                    </Title>
                    <Text type="secondary" style={{ fontSize: 13 }}>
                        Real-time attendance punch with server time lock. Office hours: 09:30 to 18:30 (Mon - Sat).
                    </Text>
                </div>

                {/* Top Right Section: Digital Clock & Check-In / Check-Out Buttons */}
                <div style={{ display: "flex", alignItems: "center", gap: 14, flexWrap: "wrap" }}>
                    {/* 24-Hour Railway Digital Clock */}
                    <div
                        style={{
                            background: "#F8FAFC",
                            border: "1px solid #E2E8F0",
                            padding: "8px 16px",
                            borderRadius: 10,
                            display: "flex",
                            alignItems: "center",
                            gap: 10,
                        }}
                    >
                        <ClockCircleOutlined style={{ fontSize: 20, color: "#1B3363" }} />
                        <div>
                            <div style={{ fontSize: 10, color: "#64748B", textTransform: "uppercase", fontWeight: 700, letterSpacing: 0.5 }}>
                                System Server Time (24h)
                            </div>
                            <div style={{ fontSize: 16, fontWeight: 700, color: "#0F172A", fontFamily: "monospace" }}>
                                {currentTime.format("HH:mm:ss")}
                            </div>
                        </div>
                        <Divider type="vertical" style={{ height: 28 }} />
                        <div style={{ fontSize: 12, fontWeight: 500, color: "#475569" }}>
                            {currentTime.format("ddd, DD MMMM YYYY")}
                        </div>
                    </div>

                    {/* Live Working Hours Status (TimeChamp style) */}
                    {liveWorkingStats && liveWorkingStats.isWorking && (
                        <div
                            style={{
                                background: "#ECFDF5",
                                border: "1px solid #A7F3D0",
                                padding: "8px 14px",
                                borderRadius: 10,
                                display: "flex",
                                alignItems: "center",
                                gap: 8,
                            }}
                        >
                            <span
                                style={{
                                    display: "inline-block",
                                    width: 10,
                                    height: 10,
                                    borderRadius: "50%",
                                    backgroundColor: "#10B981",
                                    boxShadow: "0 0 0 3px rgba(16, 185, 129, 0.2)",
                                }}
                            />
                            <div>
                                <div style={{ fontSize: 10, color: "#047857", fontWeight: 700, textTransform: "uppercase" }}>
                                    Working ({liveWorkingStats.formatted})
                                </div>
                                <div style={{ fontSize: 14, fontWeight: 700, color: "#065F46", fontFamily: "monospace" }}>
                                    {liveWorkingStats.text}
                                </div>
                            </div>
                        </div>
                    )}

                    {todayStatus?.has_checked_out && (
                        <div
                            style={{
                                background: "#FEF3C7",
                                border: "1px solid #FDE68A",
                                padding: "8px 14px",
                                borderRadius: 10,
                                display: "flex",
                                alignItems: "center",
                                gap: 8,
                            }}
                        >
                            <CheckCircleOutlined style={{ color: "#D97706", fontSize: 16 }} />
                            <div>
                                <div style={{ fontSize: 10, color: "#92400E", fontWeight: 700, textTransform: "uppercase" }}>
                                    Shift Completed
                                </div>
                                <div style={{ fontSize: 13, fontWeight: 700, color: "#78350F" }}>
                                    <span>
                                        {todayStatus.attendance?.production_hours !== undefined && todayStatus.attendance?.production_hours !== null
                                            ? `${formatDurationBadge(todayStatus.attendance.production_hours)} prod`
                                            : `${formatDurationBadge(todayStatus.attendance?.total_hours || 0)} prod`}
                                    </span>
                                    <span style={{ margin: "0 6px", color: "#D97706" }}>•</span>
                                    <span style={{ color: "#B45309", fontWeight: 600 }}>
                                        {todayStatus.attendance?.break_hours !== undefined && todayStatus.attendance?.break_hours !== null
                                            ? `${todayStatus.attendance.break_hours} hrs break`
                                            : "0 hrs break"}
                                    </span>
                                </div>
                            </div>
                        </div>
                    )}

                    {/* TOP RIGHT CHECK IN BUTTON */}
                    <Tooltip
                        title={
                            isCheckInDisabled
                                ? todayStatus?.has_in_correction
                                    ? "Check-In correction request pending or recorded for today"
                                    : "Check-In already completed for today"
                                : `Punch Check-In at ${currentTime.format("HH:mm:ss")}`
                        }
                    >
                        <span>
                            <Popconfirm
                                title="Confirm Check In"
                                description={`Lock your check-in time at current server time: ${currentTime.format("HH:mm:ss")} (24-hr)?`}
                                onConfirm={handleCheckIn}
                                okText="Check In Now"
                                cancelText="Cancel"
                                disabled={isCheckInDisabled}
                            >
                                <Button
                                    type="primary"
                                    size="middle"
                                    icon={<LoginOutlined />}
                                    loading={punchingIn}
                                    disabled={isCheckInDisabled}
                                    style={{
                                        background: isCheckInDisabled ? undefined : "#10B981",
                                        borderColor: isCheckInDisabled ? undefined : "#10B981",
                                        fontWeight: 600,
                                        height: 38,
                                        padding: "0 18px",
                                        borderRadius: 8,
                                    }}
                                >
                                    {todayStatus?.has_checked_in ? "Checked In" : "Check In"}
                                </Button>
                            </Popconfirm>
                        </span>
                    </Tooltip>

                    {/* TOP RIGHT CHECK OUT BUTTON */}
                    <Tooltip
                        title={
                            !todayStatus?.has_checked_in
                                ? "You must check in before checking out"
                                : todayStatus?.has_checked_out
                                ? "Checked out for today"
                                : `Punch Check-Out at ${currentTime.format("HH:mm:ss")}`
                        }
                    >
                        <span>
                            <Popconfirm
                                title="Confirm Check Out"
                                description={`Record departure at ${currentTime.format("HH:mm:ss")} and calculate total hours?`}
                                onConfirm={handleCheckOut}
                                okText="Check Out Now"
                                cancelText="Cancel"
                                disabled={isCheckOutDisabled}
                            >
                                <Button
                                    type="primary"
                                    size="middle"
                                    icon={<LogoutOutlined />}
                                    loading={punchingOut}
                                    disabled={isCheckOutDisabled}
                                    style={{
                                        background: isCheckOutDisabled ? undefined : "#F59E0B",
                                        borderColor: isCheckOutDisabled ? undefined : "#F59E0B",
                                        fontWeight: 600,
                                        height: 38,
                                        padding: "0 18px",
                                        borderRadius: 8,
                                    }}
                                >
                                    {todayStatus?.has_checked_out ? "Checked Out" : "Check Out"}
                                </Button>
                            </Popconfirm>
                        </span>
                    </Tooltip>

                    <Button
                        icon={<ReloadOutlined />}
                        loading={loadingToday}
                        onClick={() => {
                            fetchTodayStatus();
                            fetchMonthlyAttendance(selectedYear, selectedMonth);
                        }}
                        style={{ height: 38, borderRadius: 8 }}
                    />
                </div>
            </div>

            {/* ─────────────────────────────────────────────────────────────────────────────
                2. COMPANY PUNCH POLICY CARD (KEPT VISIBLE PER REQUIREMENT)
            ───────────────────────────────────────────────────────────────────────────── */}
            <Card
                style={{
                    borderRadius: 14,
                    border: "1px solid #E2E8F0",
                    background: "linear-gradient(135deg, #1E293B 0%, #0F172A 100%)",
                    color: "#FFFFFF",
                    marginBottom: 20,
                    boxShadow: "0 4px 14px rgba(15, 23, 42, 0.08)",
                }}
                styles={{ body: { padding: "16px 22px" } }}
            >
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 14 }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                        <div
                            style={{
                                width: 36,
                                height: 36,
                                borderRadius: 10,
                                background: "rgba(59, 130, 246, 0.2)",
                                display: "flex",
                                alignItems: "center",
                                justifyContent: "center",
                                color: "#60A5FA",
                                fontSize: 18,
                            }}
                        >
                            <InfoCircleOutlined />
                        </div>
                        <div>
                            <div style={{ fontSize: 15, fontWeight: 700, color: "#FFFFFF" }}>
                                Company Punch Policy & Rules
                            </div>
                            <div style={{ fontSize: 12, color: "#94A3B8" }}>
                                Office timing: 09:30 to 18:30 (Railway 24-hr format). Time corrections require TimeChamp screenshot proof.
                            </div>
                        </div>
                    </div>

                    <div
                        style={{
                            display: "flex",
                            alignItems: "center",
                            gap: 16,
                            flexWrap: "wrap",
                            fontSize: 12,
                            color: "#E2E8F0",
                        }}
                    >
                        <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                            <span style={{ width: 8, height: 8, borderRadius: "50%", background: "#10B981" }} />
                            <span><strong>On Time:</strong> Up to 09:30</span>
                        </div>
                        <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                            <span style={{ width: 8, height: 8, borderRadius: "50%", background: "#F59E0B" }} />
                            <span><strong>Grace Period:</strong> 09:31 - 09:45</span>
                        </div>
                        <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                            <span style={{ width: 8, height: 8, borderRadius: "50%", background: "#EF4444" }} />
                            <span><strong>Late Arrival:</strong> After 09:45</span>
                        </div>
                        <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                            <span style={{ width: 8, height: 8, borderRadius: "50%", background: "#A855F7" }} />
                            <span><strong>Half Day:</strong> &gt; 13:30 or &lt; 4.5 hrs</span>
                        </div>
                        <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                            <span style={{ width: 8, height: 8, borderRadius: "50%", background: "#38BDF8" }} />
                            <span><strong>Valid Proof:</strong> TimeChamp Running Screenshot</span>
                        </div>
                    </div>
                </div>
            </Card>

            {/* ─────────────────────────────────────────────────────────────────────────────
                3. MONTHLY SUMMARY METRICS
            ───────────────────────────────────────────────────────────────────────────── */}
            {monthlySummary && (
                <div
                    style={{
                        display: "grid",
                        gridTemplateColumns: "repeat(auto-fit, minmax(130px, 1fr))",
                        gap: 12,
                        marginBottom: 20,
                    }}
                >
                    <div style={{ background: "#FFFFFF", padding: "12px 14px", borderRadius: 10, border: "1px solid #EAECEF" }}>
                        <div style={{ fontSize: 11, color: "#6B7280", fontWeight: 600, textTransform: "uppercase" }}>Present Days</div>
                        <div style={{ fontSize: 20, fontWeight: 700, color: "#10B981", marginTop: 2 }}>{monthlySummary.present}</div>
                    </div>
                    <div style={{ background: "#FFFFFF", padding: "12px 14px", borderRadius: 10, border: "1px solid #EAECEF" }}>
                        <div style={{ fontSize: 11, color: "#6B7280", fontWeight: 600, textTransform: "uppercase" }}>On Time / Early</div>
                        <div style={{ fontSize: 20, fontWeight: 700, color: "#059669", marginTop: 2 }}>
                            {monthlySummary.on_time + monthlySummary.early}
                        </div>
                    </div>
                    <div style={{ background: "#FFFFFF", padding: "12px 14px", borderRadius: 10, border: "1px solid #EAECEF" }}>
                        <div style={{ fontSize: 11, color: "#6B7280", fontWeight: 600, textTransform: "uppercase" }}>Grace (09:31-09:45)</div>
                        <div style={{ fontSize: 20, fontWeight: 700, color: "#D97706", marginTop: 2 }}>{monthlySummary.grace}</div>
                    </div>
                    <div style={{ background: "#FFFFFF", padding: "12px 14px", borderRadius: 10, border: "1px solid #EAECEF" }}>
                        <div style={{ fontSize: 11, color: "#6B7280", fontWeight: 600, textTransform: "uppercase" }}>Late Days</div>
                        <div style={{ fontSize: 20, fontWeight: 700, color: "#DC2626", marginTop: 2 }}>{monthlySummary.late}</div>
                    </div>
                    <div style={{ background: "#FFFFFF", padding: "12px 14px", borderRadius: 10, border: "1px solid #EAECEF" }}>
                        <div style={{ fontSize: 11, color: "#6B7280", fontWeight: 600, textTransform: "uppercase" }}>Half Day</div>
                        <div style={{ fontSize: 20, fontWeight: 700, color: "#9333EA", marginTop: 2 }}>{monthlySummary.half_day}</div>
                    </div>
                    <div style={{ background: "#FFFFFF", padding: "12px 14px", borderRadius: 10, border: "1px solid #EAECEF" }}>
                        <div style={{ fontSize: 11, color: "#6B7280", fontWeight: 600, textTransform: "uppercase" }}>Absent</div>
                        <div style={{ fontSize: 20, fontWeight: 700, color: "#EF4444", marginTop: 2 }}>{monthlySummary.absent}</div>
                    </div>
                    <div style={{ background: "#FFFFFF", padding: "12px 14px", borderRadius: 10, border: "1px solid #EAECEF" }}>
                        <div style={{ fontSize: 11, color: "#6B7280", fontWeight: 600, textTransform: "uppercase" }}>Week Offs</div>
                        <div style={{ fontSize: 20, fontWeight: 700, color: "#4B5563", marginTop: 2 }}>{monthlySummary.week_off}</div>
                    </div>
                    <div style={{ background: "#F0FDF4", padding: "12px 14px", borderRadius: 10, border: "1px solid #BBF7D0" }}>
                        <div style={{ fontSize: 11, color: "#166534", fontWeight: 600, textTransform: "uppercase" }}>Production Hours</div>
                        <div style={{ fontSize: 20, fontWeight: 700, color: "#15803D", marginTop: 2 }}>{monthlySummary.production_hours ?? 0}h</div>
                    </div>
                    <div style={{ background: "#FFFBEB", padding: "12px 14px", borderRadius: 10, border: "1px solid #FEF3C7" }}>
                        <div style={{ fontSize: 11, color: "#92400E", fontWeight: 600, textTransform: "uppercase" }}>Break / Pauses</div>
                        <div style={{ fontSize: 20, fontWeight: 700, color: "#B45309", marginTop: 2 }}>{monthlySummary.break_hours ?? 0}h</div>
                    </div>
                </div>
            )}

            {/* ─────────────────────────────────────────────────────────────────────────────
                4. MONTHLY ATTENDANCE TABLE (ALL DAYS HAVE EDITABLE IN/OUT TIMES)
            ───────────────────────────────────────────────────────────────────────────── */}
            <Card
                style={{
                    borderRadius: 14,
                    border: "1px solid #EAECEF",
                    boxShadow: "0 2px 10px rgba(0,0,0,0.03)",
                }}
            >
                <div
                    style={{
                        display: "flex",
                        justifyContent: "space-between",
                        alignItems: "center",
                        flexWrap: "wrap",
                        gap: 12,
                        marginBottom: 18,
                    }}
                >
                    <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                        <Title level={4} style={{ margin: 0, color: "#1B3363" }}>
                            Monthly Attendance Log
                        </Title>
                        <Tag color="blue" style={{ fontSize: 13, padding: "2px 10px" }}>
                            {dayjs(`${selectedYear}-${selectedMonth}-01`).format("MMMM YYYY")}
                        </Tag>
                        <span style={{ fontSize: 12, color: "#64748B" }}>
                            (Click ✏️ edit icon on In Time or Out Time to regularize attendance)
                        </span>
                    </div>

                    <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                        <Button icon={<LeftOutlined />} onClick={handlePrevMonth} size="middle">
                            Prev Month
                        </Button>
                        <Select
                            value={selectedMonth}
                            onChange={(val) => setSelectedMonth(val)}
                            style={{ width: 130 }}
                            options={[
                                { value: 1, label: "January" },
                                { value: 2, label: "February" },
                                { value: 3, label: "March" },
                                { value: 4, label: "April" },
                                { value: 5, label: "May" },
                                { value: 6, label: "June" },
                                { value: 7, label: "July" },
                                { value: 8, label: "August" },
                                { value: 9, label: "September" },
                                { value: 10, label: "October" },
                                { value: 11, label: "November" },
                                { value: 12, label: "December" },
                            ]}
                        />
                        <Select
                            value={selectedYear}
                            onChange={(val) => setSelectedYear(val)}
                            style={{ width: 95 }}
                            options={[
                                { value: 2025, label: "2025" },
                                { value: 2026, label: "2026" },
                                { value: 2027, label: "2027" },
                            ]}
                        />
                        <Button icon={<RightOutlined />} onClick={handleNextMonth} size="middle">
                            Next Month
                        </Button>
                        <Button
                            icon={<ReloadOutlined />}
                            loading={loadingMonthly}
                            onClick={() => fetchMonthlyAttendance(selectedYear, selectedMonth)}
                        />
                    </div>
                </div>

                <div style={{ overflowX: "auto" }}>
                    <table style={{ width: "100%",  minWidth: "1200px",  borderCollapse: "collapse", fontSize: 13, textAlign: "left" }}>
                        <thead>
                            <tr style={{ background: "#F8FAFC", borderBottom: "2px solid #E2E8F0", color: "#475569", whiteSpace: "nowrap", }}>
                                <th style={{ minWidth: "135px", padding: "12px 14px", fontWeight: 600, whiteSpace: "nowrap" }}>Date</th>
                                <th style={{ padding: "12px 14px", fontWeight: 600, whiteSpace: "nowrap" }}>Day</th>
                                <th style={{ padding: "12px 14px", fontWeight: 600, whiteSpace: "nowrap" }}>TAG ID</th>
                                <th style={{ padding: "12px 14px", fontWeight: 600, whiteSpace: "nowrap" }}>Employee Name</th>
                                <th style={{ padding: "12px 14px", fontWeight: 600, whiteSpace: "nowrap" }}>In Time (24h)</th>
                                <th style={{ padding: "12px 14px", fontWeight: 600, whiteSpace: "nowrap" }}>Out Time (24h)</th>
                                <th style={{ padding: "12px 14px", fontWeight: 600, whiteSpace: "nowrap" }}>Production Hrs</th>
                                <th style={{ padding: "12px 14px", fontWeight: 600, whiteSpace: "nowrap" }}>Break / Pauses</th>
                                <th style={{ padding: "12px 14px", fontWeight: 600, whiteSpace: "nowrap" }}>Status</th>
                                <th style={{ padding: "12px 14px", fontWeight: 600, whiteSpace: "nowrap" }}>Remarks & Notes</th>
                                <th style={{ padding: "12px 14px", fontWeight: 600, textAlign: "center", whiteSpace: "nowrap" }}>Action</th>
                            </tr>
                        </thead>
                        <tbody>
                            {monthlyDays.length === 0 ? (
                                <tr>
                                    <td colSpan={11} style={{ textAlign: "center", padding: "40px", color: "#94A3B8" }}>
                                        No attendance data found for this month.
                                    </td>
                                </tr>
                            ) : (
                                monthlyDays.map((day) => {
                                    const isSunday = day.day_name === "Sunday";
                                    const isToday = day.date === dayjs().format("YYYY-MM-DD");

                                    // Find pending or approved correction for In-Time
                                    const inCorrection = day.corrections?.find(
                                        (c) => c.request_type === "in_time" && c.status === "pending"
                                    );
                                    const inApprovedCorrection = day.corrections?.find(
                                        (c) => c.request_type === "in_time" && c.status === "approved"
                                    );

                                    // Find pending or approved correction for Out-Time
                                    const outCorrection = day.corrections?.find(
                                        (c) => c.request_type === "out_time" && c.status === "pending"
                                    );
                                    const outApprovedCorrection = day.corrections?.find(
                                        (c) => c.request_type === "out_time" && c.status === "approved"
                                    );

                                    return (
                                        <tr
                                            key={day.date}
                                            style={{
                                                borderBottom: "1px solid #F1F5F9",
                                                background: isToday
                                                    ? "rgba(22, 40, 79, 0.04)"
                                                    : isSunday
                                                    ? "#F8FAFC"
                                                    : "#FFFFFF",
                                            }}
                                        >
                                            {/* Date Column */}
                                            <td style={{ padding: "10px 14px", fontWeight: 500, whiteSpace: "nowrap", minWidth: "135px" }}>
                                                <span style={{ whiteSpace: "nowrap" }}>{dayjs(day.date).format("DD-MM-YYYY")}</span>
                                                {isToday && (
                                                    <Tag color="processing" style={{ marginLeft: 6, fontSize: 10 }}>Today</Tag>
                                                )}
                                            </td>

                                            {/* Day Column */}
                                            <td
                                                style={{
                                                    padding: "10px 14px",
                                                    color: isSunday ? "#94A3B8" : "#334155",
                                                    fontWeight: isSunday ? 400 : 500,
                                                    whiteSpace: "nowrap",
                                                }}
                                            >
                                                {day.day_name}
                                            </td>

                                            {/* TAG ID */}
                                            <td style={{ padding: "10px 14px", fontFamily: "monospace", color: "#64748B", whiteSpace: "nowrap" }}>
                                                {day.tag_id || monthlyDays.find((d) => d.tag_id)?.tag_id || "-"}
                                            </td>

                                            {/* Employee Name */}
                                            <td style={{ padding: "10px 14px", fontWeight: 600, color: "#1E293B", whiteSpace: "nowrap" }}>
                                                {day.employee_name || user?.name || "-"}
                                            </td>

                                            {/* IN TIME COLUMN WITH EDIT ICON (ALWAYS ENABLED FOR ALL DAYS) */}
                                            <td style={{ padding: "10px 14px" }}>
                                                <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                                                    <span style={{ fontFamily: "monospace", fontWeight: 600 }}>
                                                        {day.in_time_formatted ? (
                                                            <span style={{ color: "#0F766E" }}>{day.in_time_formatted}</span>
                                                        ) : day.in_time ? (
                                                            <span style={{ color: "#0F766E" }}>{day.in_time}</span>
                                                        ) : (
                                                            <span style={{ color: "#CBD5E1" }}>--:--</span>
                                                        )}
                                                    </span>

                                                    {inCorrection ? (
                                                        <Tooltip title={`Pending Admin Approval (Requested: ${inCorrection.requested_time_formatted || inCorrection.requested_time})`}>
                                                            <Tag color="warning" style={{ margin: 0, fontSize: 10, padding: "0 6px" }}>
                                                                <HourglassOutlined style={{ marginRight: 3 }} />
                                                                Req: {inCorrection.requested_time_formatted || inCorrection.requested_time}
                                                            </Tag>
                                                        </Tooltip>
                                                    ) : inApprovedCorrection ? (
                                                        <Tooltip title="Regularized & Approved by Admin">
                                                            <CheckCircleOutlined style={{ color: "#10B981", fontSize: 13 }} />
                                                        </Tooltip>
                                                    ) : null}

                                                    <Tooltip title="Edit In Time (Regularize / Time Correction)">
                                                        <Button
                                                            type="text"
                                                            size="small"
                                                            icon={<EditOutlined style={{ color: "#2563EB", fontSize: 13 }} />}
                                                            onClick={() => handleOpenCorrection(day, "in_time")}
                                                            style={{
                                                                padding: "0 4px",
                                                                height: 24,
                                                                background: "rgba(37, 99, 235, 0.08)",
                                                                borderRadius: 4,
                                                            }}
                                                        />
                                                    </Tooltip>
                                                </div>
                                            </td>

                                            {/* OUT TIME COLUMN WITH EDIT ICON (ALWAYS ENABLED FOR ALL DAYS) */}
                                            <td style={{ padding: "10px 14px" }}>
                                                <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                                                    <span style={{ fontFamily: "monospace", fontWeight: 600 }}>
                                                        {day.out_time_formatted ? (
                                                            <span style={{ color: "#B45309" }}>{day.out_time_formatted}</span>
                                                        ) : day.out_time ? (
                                                            <span style={{ color: "#B45309" }}>{day.out_time}</span>
                                                        ) : (
                                                            <span style={{ color: "#CBD5E1" }}>--:--</span>
                                                        )}
                                                    </span>

                                                    {outCorrection ? (
                                                        <Tooltip title={`Pending Admin Approval (Requested: ${outCorrection.requested_time_formatted || outCorrection.requested_time})`}>
                                                            <Tag color="warning" style={{ margin: 0, fontSize: 10, padding: "0 6px" }}>
                                                                <HourglassOutlined style={{ marginRight: 3 }} />
                                                                Req: {outCorrection.requested_time_formatted || outCorrection.requested_time}
                                                            </Tag>
                                                        </Tooltip>
                                                    ) : outApprovedCorrection ? (
                                                        <Tooltip title="Regularized & Approved by Admin">
                                                            <CheckCircleOutlined style={{ color: "#10B981", fontSize: 13 }} />
                                                        </Tooltip>
                                                    ) : null}

                                                    <Tooltip title="Edit Out Time (Regularize / Time Correction)">
                                                        <Button
                                                            type="text"
                                                            size="small"
                                                            icon={<EditOutlined style={{ color: "#D97706", fontSize: 13 }} />}
                                                            onClick={() => handleOpenCorrection(day, "out_time")}
                                                            style={{
                                                                padding: "0 4px",
                                                                height: 24,
                                                                background: "rgba(217, 119, 6, 0.08)",
                                                                borderRadius: 4,
                                                            }}
                                                        />
                                                    </Tooltip>
                                                </div>
                                            </td>

                                            {/* Production Hours */}
                                            <td style={{ padding: "10px 14px", fontWeight: 600 }}>
                                                {day.production_hours !== null && day.production_hours !== undefined ? (
                                                    <Tooltip
                                                        title={
                                                            <div style={{ fontSize: 12 }}>
                                                                <div style={{ fontWeight: 700, marginBottom: 2 }}>Production Breakdown:</div>
                                                                <div>• Working Hours (Task Timer): {formatDurationDetail(day.task_work_hours)}</div>
                                                                <div>• Untracked Time: {formatDurationDetail(day.untracked_hours)}</div>
                                                                <div style={{ marginTop: 4, borderTop: "1px solid rgba(255,255,255,0.2)", paddingTop: 2, fontWeight: 600 }}>
                                                                    Total Production: {formatDurationDetail(day.production_hours)}
                                                                </div>
                                                            </div>
                                                        }
                                                    >
                                                        <span style={{ color: "#0F766E", background: "rgba(15, 118, 110, 0.08)", padding: "4px 8px", borderRadius: 6, cursor: "pointer", whiteSpace: "nowrap" }}>
                                                            {formatDurationBadge(day.production_hours)}
                                                        </span>
                                                    </Tooltip>
                                                ) : (
                                                    <span style={{ color: "#CBD5E1" }}>--</span>
                                                )}
                                            </td>

                                            {/* Break / Pause Hours */}
                                            <td style={{ padding: "10px 14px", fontWeight: 600 }}>
                                                {day.break_hours !== null && day.break_hours !== undefined ? (
                                                    <Tooltip
                                                        title={
                                                            <div style={{ fontSize: 12 }}>
                                                                <div style={{ fontWeight: 700, marginBottom: 2 }}>Break & Pause Details:</div>
                                                                <div>• Normal Breaks: {formatBreakDetail(day.normal_break_hours)}</div>
                                                                <div>• Other Pauses: {formatBreakDetail(day.other_pause_hours)}</div>
                                                                <div style={{ marginTop: 4, borderTop: "1px solid rgba(255,255,255,0.2)", paddingTop: 2, fontWeight: 600 }}>
                                                                    Total Breaks: {formatBreakDetail(day.break_hours)}
                                                                </div>
                                                            </div>
                                                        }
                                                    >
                                                        <span style={{ color: "#B45309", background: "rgba(180, 83, 9, 0.08)", padding: "4px 8px", borderRadius: 6, cursor: "pointer", whiteSpace: "nowrap" }}>
                                                            {formatBreakBadge(day.break_hours)}
                                                        </span>
                                                    </Tooltip>
                                                ) : (
                                                    <span style={{ color: "#CBD5E1" }}>--</span>
                                                )}
                                            </td>

                                            {/* Status Badge */}
                                            <td style={{ padding: "10px 14px" }}>
                                                {getStatusTag(day.status)}
                                            </td>

                                            {/* Remarks & Notes */}
                                            <td style={{ padding: "10px 14px", minWidth: 200, maxWidth: 300 }}>
                                                <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                                                    {day.remarks && (
                                                        <Tooltip title={day.remarks}>
                                                            <span
                                                                style={{
                                                                    display: "inline-block",
                                                                    maxWidth: 260,
                                                                    overflow: "hidden",
                                                                    textOverflow: "ellipsis",
                                                                    whiteSpace: "nowrap",
                                                                    color: day.remarks.toLowerCase().includes("reject") ? "#DC2626" : "#475569",
                                                                    fontWeight: day.remarks.toLowerCase().includes("reject") ? 600 : 400,
                                                                }}
                                                            >
                                                                {day.remarks}
                                                            </span>
                                                        </Tooltip>
                                                    )}

                                                    {day.corrections?.filter((c) => c.status === "rejected").map((rc) => {
                                                        const reasonText = rc.admin_notes || rc.reason || "Proof rejected by Admin";
                                                        const reqType = rc.request_type === "in_time" ? "In-Time" : "Out-Time";
                                                        const noteText = `Rejected (${reqType}): ${reasonText}`;
                                                        if (day.remarks && day.remarks.includes(reasonText)) return null;
                                                        return (
                                                            <Tooltip key={rc.id} title={`TimeChamp screenshot rejected by Admin: ${reasonText}`}>
                                                                <Tag color="error" style={{ margin: 0, fontSize: 11, maxWidth: 260, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                                                                    ❌ {noteText}
                                                                </Tag>
                                                            </Tooltip>
                                                        );
                                                    })}

                                                    {!day.remarks && (!day.corrections || !day.corrections.some((c) => c.status === "rejected")) && (
                                                        <span style={{ color: "#CBD5E1" }}>-</span>
                                                    )}

                                                    {day.comments && day.comments.length > 0 && (
                                                        <div>
                                                            <Tag color="blue" style={{ fontSize: 10 }}>
                                                                {day.comments.length} notes
                                                            </Tag>
                                                        </div>
                                                    )}
                                                </div>
                                            </td>

                                            {/* Actions */}
                                            <td style={{ padding: "10px 14px", textAlign: "center" }}>
                                                <Button
                                                    size="small"
                                                    icon={<CommentOutlined />}
                                                    onClick={() => {
                                                        setSelectedRecordForComment(day);
                                                        setCommentModalVisible(true);
                                                    }}
                                                    disabled={!day.id}
                                                >
                                                    Note
                                                </Button>
                                            </td>
                                        </tr>
                                    );
                                })
                            )}
                        </tbody>
                    </table>
                </div>
            </Card>

            {/* ─────────────────────────────────────────────────────────────────────────────
                5. TIME CORRECTION & REGULARIZATION MODAL (SCREENSHOTS 4 & 5)
            ───────────────────────────────────────────────────────────────────────────── */}
            <Modal
                title={
                    <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                        <div
                            style={{
                                width: 34,
                                height: 34,
                                borderRadius: 8,
                                background: "rgba(37, 99, 235, 0.1)",
                                color: "#2563EB",
                                display: "flex",
                                alignItems: "center",
                                justifyContent: "center",
                                fontSize: 16,
                            }}
                        >
                            <EditOutlined />
                        </div>
                        <div>
                            <div style={{ fontSize: 16, fontWeight: 700, color: "#1E293B" }}>
                                Request Attendance Time Correction
                            </div>
                            <div style={{ fontSize: 12, fontWeight: 400, color: "#64748B" }}>
                                {correctionType === "in_time" ? "Check-In (Arrival Time)" : "Check-Out (Departure Time)"} for{" "}
                                {correctionTargetDay ? dayjs(correctionTargetDay.date).format("dddd, DD MMMM YYYY") : ""}
                            </div>
                        </div>
                    </div>
                }
                open={correctionModalOpen}
                onCancel={() => {
                    setCorrectionModalOpen(false);
                    setProofFile(null);
                    setProofPreviewUrl(null);
                }}
                footer={[
                    <Button
                        key="cancel"
                        onClick={() => {
                            setCorrectionModalOpen(false);
                            setProofFile(null);
                            setProofPreviewUrl(null);
                        }}
                    >
                        Cancel
                    </Button>,
                    <Button
                        key="submit"
                        type="primary"
                        loading={submittingCorrection}
                        onClick={handleSubmitCorrection}
                        style={{ background: "#1B3363", borderColor: "#1B3363", fontWeight: 600 }}
                    >
                        Submit Request for Approval
                    </Button>,
                ]}
                width={560}
            >
                <div style={{ padding: "10px 0" }}>
                    {/* User Profile & Comparison Header (Screenshot 5 Style) */}
                    <div
                        style={{
                            background: "#F8FAFC",
                            border: "1px solid #E2E8F0",
                            borderRadius: 12,
                            padding: "16px",
                            marginBottom: 20,
                        }}
                    >
                        <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 14 }}>
                            <Avatar
                                size={40}
                                style={{
                                    backgroundColor: "#0D9488",
                                    color: "#FFFFFF",
                                    fontWeight: 700,
                                    fontSize: 16,
                                }}
                            >
                                {user?.name ? user.name[0].toUpperCase() : "U"}
                            </Avatar>
                            <div>
                                <div style={{ fontSize: 15, fontWeight: 700, color: "#0F172A" }}>
                                    {user?.name || "Employee"}
                                </div>
                                <div style={{ fontSize: 12, color: "#64748B" }}>
                                    Target Date: <strong>{correctionTargetDay?.date}</strong>
                                </div>
                            </div>
                        </div>

                        {/* System Time vs Requested Input Time Comparison */}
                        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14 }}>
                            {/* System Recorded Time Box */}
                            <div
                                style={{
                                    background: "#FFFFFF",
                                    padding: "12px 14px",
                                    borderRadius: 10,
                                    border: "1px solid #CBD5E1",
                                }}
                            >
                                <div style={{ fontSize: 11, color: "#64748B", fontWeight: 600, textTransform: "uppercase" }}>
                                    System Recorded Time
                                </div>
                                <div style={{ fontSize: 18, fontWeight: 700, color: "#475569", fontFamily: "monospace", marginTop: 4 }}>
                                    {correctionType === "in_time"
                                        ? correctionTargetDay?.in_time_formatted || correctionTargetDay?.in_time || "Not Recorded"
                                        : correctionTargetDay?.out_time_formatted || correctionTargetDay?.out_time || "Not Recorded"}
                                </div>
                                <div style={{ fontSize: 11, color: "#94A3B8", marginTop: 2 }}>
                                    Server timestamp
                                </div>
                            </div>

                            {/* User Actual Time Input (Railway 24-hr format) */}
                            <div
                                style={{
                                    background: "#FFFFFF",
                                    padding: "12px 14px",
                                    borderRadius: 10,
                                    border: "2px solid #2563EB",
                                }}
                            >
                                <div style={{ fontSize: 11, color: "#2563EB", fontWeight: 700, textTransform: "uppercase" }}>
                                    Actual Time (24h Railway) *
                                </div>
                                <Input
                                    type="time"
                                    step="60"
                                    value={requestedTime}
                                    onChange={(e) => setRequestedTime(e.target.value)}
                                    style={{
                                        fontSize: 18,
                                        fontWeight: 700,
                                        fontFamily: "monospace",
                                        marginTop: 4,
                                        border: "none",
                                        padding: 0,
                                        color: "#0F172A",
                                    }}
                                />
                                <div style={{ fontSize: 11, color: "#2563EB", marginTop: 2 }}>
                                    e.g. 09:30, 13:45, 18:30
                                </div>
                            </div>
                        </div>
                    </div>

                    {/* Predefined Reason Chips / Pills (Screenshot 4 Style) */}
                    <div style={{ marginBottom: 18 }}>
                        <div style={{ fontSize: 13, fontWeight: 700, color: "#1E293B", marginBottom: 8 }}>
                            Specify the reason for time correction:
                        </div>
                        <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginBottom: 10 }}>
                            {DEFAULT_REASONS.map((r) => {
                                const isSelected = selectedReason === r;
                                return (
                                    <button
                                        type="button"
                                        key={r}
                                        onClick={() => setSelectedReason(r)}
                                        style={{
                                            border: isSelected ? "1.5px solid #2563EB" : "1px solid #CBD5E1",
                                            background: isSelected ? "#EFF6FF" : "#FFFFFF",
                                            color: isSelected ? "#1D4ED8" : "#475569",
                                            borderRadius: 20,
                                            padding: "6px 14px",
                                            fontSize: 12,
                                            fontWeight: isSelected ? 600 : 500,
                                            cursor: "pointer",
                                            transition: "all 0.15s ease-in-out",
                                        }}
                                    >
                                        {r}
                                    </button>
                                );
                            })}
                        </div>

                        {/* Custom Reason Textarea */}
                        <div style={{ position: "relative" }}>
                            <TextArea
                                rows={3}
                                maxLength={300}
                                placeholder="Type details or reason for time correction..."
                                value={customReason}
                                onChange={(e) => setCustomReason(e.target.value)}
                                style={{ borderRadius: 8, fontSize: 13 }}
                            />
                            <div
                                style={{
                                    textAlign: "right",
                                    fontSize: 11,
                                    color: "#94A3B8",
                                    marginTop: 4,
                                }}
                            >
                                {customReason.length} / 300
                            </div>
                        </div>
                    </div>

                    {/* TimeChamp Screenshot Proof Upload Section */}
                    <div>
                        <div style={{ fontSize: 13, fontWeight: 700, color: "#1E293B", marginBottom: 4 }}>
                            Attach TimeChamp Screenshot (Valid Proof) *
                        </div>
                        <div style={{ fontSize: 12, color: "#64748B", marginBottom: 10 }}>
                            TimeChamp is always running when your laptop is turned on. Upload your TimeChamp window screenshot as verifiable proof of your arrival/departure time.
                        </div>

                        <input
                            ref={fileInputRef}
                            type="file"
                            accept="image/*"
                            onChange={handleFileSelect}
                            style={{ display: "none" }}
                        />

                        {!proofFile ? (
                            <div
                                onClick={() => fileInputRef.current?.click()}
                                style={{
                                    border: "2px dashed #CBD5E1",
                                    borderRadius: 10,
                                    padding: "20px",
                                    textAlign: "center",
                                    background: "#F8FAFC",
                                    cursor: "pointer",
                                    transition: "border-color 0.2s",
                                }}
                                onMouseEnter={(e) => (e.currentTarget.style.borderColor = "#2563EB")}
                                onMouseLeave={(e) => (e.currentTarget.style.borderColor = "#CBD5E1")}
                            >
                                <PictureOutlined style={{ fontSize: 32, color: "#94A3B8", marginBottom: 8 }} />
                                <div style={{ fontSize: 13, fontWeight: 600, color: "#1E293B" }}>
                                    Click to upload TimeChamp Screenshot
                                </div>
                                <div style={{ fontSize: 11, color: "#64748B", marginTop: 4 }}>
                                    Supports PNG, JPG, JPEG (Max 10MB)
                                </div>
                            </div>
                        ) : (
                            <div
                                style={{
                                    border: "1px solid #E2E8F0",
                                    borderRadius: 10,
                                    padding: "12px",
                                    background: "#F8FAFC",
                                    display: "flex",
                                    alignItems: "center",
                                    justifyContent: "space-between",
                                }}
                            >
                                <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                                    {proofPreviewUrl && (
                                        <img
                                            src={proofPreviewUrl}
                                            alt="Proof preview"
                                            onClick={() => {
                                                setImagePreviewSrc(proofPreviewUrl);
                                                setImagePreviewModalOpen(true);
                                            }}
                                            style={{
                                                width: 60,
                                                height: 48,
                                                objectFit: "cover",
                                                borderRadius: 6,
                                                border: "1px solid #CBD5E1",
                                                cursor: "zoom-in",
                                            }}
                                        />
                                    )}
                                    <div>
                                        <div style={{ fontSize: 13, fontWeight: 600, color: "#1E293B" }}>
                                            {proofFile.name}
                                        </div>
                                        <div style={{ fontSize: 11, color: "#64748B" }}>
                                            {(proofFile.size / 1024).toFixed(1)} KB ?" Click thumbnail to preview
                                        </div>
                                    </div>
                                </div>

                                <Button
                                    type="text"
                                    danger
                                    icon={<DeleteOutlined />}
                                    onClick={() => {
                                        setProofFile(null);
                                        setProofPreviewUrl(null);
                                        if (fileInputRef.current) fileInputRef.current.value = "";
                                    }}
                                >
                                    Remove
                                </Button>
                            </div>
                        )}
                    </div>
                </div>
            </Modal>

            {/* ─────────────────────────────────────────────────────────────────────────────
                6. REMARKS & NOTES MODAL
            ───────────────────────────────────────────────────────────────────────────── */}
            <Modal
                title={
                    <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                        <CommentOutlined style={{ color: "#1B3363" }} />
                        <span>
                            Attendance Note & Comments ({selectedRecordForComment?.date})
                        </span>
                    </div>
                }
                open={commentModalVisible}
                onCancel={() => {
                    setCommentModalVisible(false);
                    setNewCommentText("");
                }}
                footer={[
                    <Button key="close" onClick={() => setCommentModalVisible(false)}>
                        Close
                    </Button>,
                    <Button
                        key="submit"
                        type="primary"
                        loading={submittingComment}
                        onClick={handleAddComment}
                        style={{ background: "#1B3363", borderColor: "#1B3363" }}
                    >
                        Add Note
                    </Button>,
                ]}
            >
                <div style={{ marginBottom: 16 }}>
                    <div style={{ fontSize: 13, color: "#64748B", marginBottom: 6 }}>
                        Current Status: {selectedRecordForComment && getStatusTag(selectedRecordForComment.status)}
                    </div>
                    {selectedRecordForComment?.remarks && (
                        <div
                            style={{
                                background: "#F8FAFC",
                                padding: "10px 12px",
                                borderRadius: 8,
                                border: "1px solid #E2E8F0",
                                fontSize: 13,
                                marginBottom: 12,
                            }}
                        >
                            <strong>Summary Remarks:</strong> {selectedRecordForComment.remarks}
                        </div>
                    )}
                </div>

                {/* Comment Timeline */}
                {selectedRecordForComment?.comments && selectedRecordForComment.comments.length > 0 && (
                    <div style={{ marginBottom: 20 }}>
                        <div style={{ fontSize: 13, fontWeight: 600, color: "#1E293B", marginBottom: 10 }}>
                            Comment History:
                        </div>
                        <Timeline
                            items={selectedRecordForComment.comments.map((c) => ({
                                children: (
                                    <div>
                                        <div style={{ fontSize: 12, fontWeight: 600, color: "#0F172A" }}>
                                            {c.author_name} ({c.author_role.toUpperCase()}):
                                        </div>
                                        <div style={{ fontSize: 13, color: "#334155", marginTop: 2 }}>
                                            {c.comment}
                                        </div>
                                        <div style={{ fontSize: 11, color: "#94A3B8", marginTop: 2 }}>
                                            {dayjs(c.created_at).format("DD MMM YYYY, HH:mm")}
                                        </div>
                                    </div>
                                ),
                            }))}
                        />
                    </div>
                )}

                <div>
                    <div style={{ fontSize: 13, fontWeight: 600, color: "#1E293B", marginBottom: 6 }}>
                        Add New Remark / Reason:
                    </div>
                    <TextArea
                        rows={3}
                        placeholder="Type justification or note (e.g. Permission 1 hr, Client visit, Traffic issue)..."
                        value={newCommentText}
                        onChange={(e) => setNewCommentText(e.target.value)}
                    />
                </div>
            </Modal>

            {/* ─────────────────────────────────────────────────────────────────────────────
                7. FULL IMAGE ZOOM PREVIEW MODAL
            ───────────────────────────────────────────────────────────────────────────── */}
            <Modal
                open={imagePreviewModalOpen}
                footer={null}
                onCancel={() => setImagePreviewModalOpen(false)}
                width={700}
                centered
            >
                <img
                    src={imagePreviewSrc}
                    alt="Proof preview large"
                    style={{ width: "100%", maxHeight: "80vh", objectFit: "contain", marginTop: 16 }}
                />
            </Modal>
        </div>
    );
}
