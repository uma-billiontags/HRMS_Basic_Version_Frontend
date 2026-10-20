import { useEffect, useState, useCallback, useMemo } from "react";
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
    Tabs,
    DatePicker,
    Pagination,
    Space,
} from "antd";
import {
    ClockCircleOutlined,
    CalendarOutlined,
    DownloadOutlined,
    SearchOutlined,
    ReloadOutlined,
    CommentOutlined,
    HourglassOutlined,
    CheckCircleOutlined,
    CloseCircleOutlined,
} from "@ant-design/icons";
import dayjs from "dayjs";
import * as XLSX from "xlsx";

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

interface AttendanceCommentItem {
    id: number;
    author_name: string;
    author_role: string;
    comment: string;
    created_at: string;
}

interface AttendanceRecord {
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
}

interface DailyStats {
    total_staff: number;
    present: number;
    early: number;
    on_time: number;
    grace: number;
    late: number;
    half_day: number;
    absent: number;
    week_off: number;
    leave: number;
    not_checked_in: number;
}

interface EmployeeSummary {
    employee_id: number;
    employee_name: string;
    tag_id: string;
    department: string;
    designation: string;
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

interface SimpleEmployee {
    id: number;
    name: string;
    department: string;
    employee_id: string;
}

interface AttendanceCorrectionItem {
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

export default function Attendance_Admin() {
    const [activeTab, setActiveTab] = useState<string>("daily");

    // ── Daily View State ──────────────────────────────────────────────────
    const [selectedDailyDate, setSelectedDailyDate] = useState<string>(dayjs().format("YYYY-MM-DD"));
    const [dailyDepartment, setDailyDepartment] = useState<string>("");
    const [dailySearch, setDailySearch] = useState<string>("");
    const [dailyRecords, setDailyRecords] = useState<AttendanceRecord[]>([]);
    const [dailyStats, setDailyStats] = useState<DailyStats | null>(null);
    const [dailyDepartments, setDailyDepartments] = useState<string[]>([]);
    const [loadingDaily, setLoadingDaily] = useState<boolean>(false);

    // ── Monthly View State ────────────────────────────────────────────────
    const [monthlyYear, setMonthlyYear] = useState<number>(dayjs().year());
    const [monthlyMonth, setMonthlyMonth] = useState<number>(dayjs().month() + 1);
    const [monthlyEmployeeId, setMonthlyEmployeeId] = useState<string>("");
    const [monthlyDepartment, setMonthlyDepartment] = useState<string>("");
    const [monthlySearch, setMonthlySearch] = useState<string>("");
    const [monthlyRows, setMonthlyRows] = useState<AttendanceRecord[]>([]);
    const [monthlySummaries, setMonthlySummaries] = useState<EmployeeSummary[]>([]);
    const [allEmployeesList, setAllEmployeesList] = useState<SimpleEmployee[]>([]);
    const [monthlyDepartmentsList, setMonthlyDepartmentsList] = useState<string[]>([]);
    const [loadingMonthly, setLoadingMonthly] = useState<boolean>(false);
    const [monthlyPage, setMonthlyPage] = useState<number>(1);
    const [monthlyPageSize, setMonthlyPageSize] = useState<number>(31);

    // ── Regularization / Edit Modal State ─────────────────────────────────

    // ── Note / Comment Modal State ────────────────────────────────────────
    const [commentModalVisible, setCommentModalVisible] = useState<boolean>(false);
    const [selectedRecordForComment, setSelectedRecordForComment] = useState<AttendanceRecord | null>(null);
    const [newCommentText, setNewCommentText] = useState<string>("");
    const [submittingComment, setSubmittingComment] = useState<boolean>(false);

    // ── Attendance Correction Requests State ─────────────────────────────────
    const [corrections, setCorrections] = useState<AttendanceCorrectionItem[]>([]);
    const [loadingCorrections, setLoadingCorrections] = useState<boolean>(false);
    const [correctionStatusFilter, setCorrectionStatusFilter] = useState<string>("all");
    const [correctionSearch, setCorrectionSearch] = useState<string>("");

    const [decisionModalOpen, setDecisionModalOpen] = useState<boolean>(false);
    const [decisionTarget, setDecisionTarget] = useState<AttendanceCorrectionItem | null>(null);
    const [decisionType, setDecisionType] = useState<"approve" | "reject">("approve");
    const [decisionAdminNotes, setDecisionAdminNotes] = useState<string>("");
    const [submittingDecision, setSubmittingDecision] = useState<boolean>(false);

    const [previewImageSrc, setPreviewImageSrc] = useState<string>("");
    const [previewImageOpen, setPreviewImageOpen] = useState<boolean>(false);

    const fetchCorrections = useCallback(async () => {
        setLoadingCorrections(true);
        try {
            const query = correctionStatusFilter !== "all" ? `?status=${correctionStatusFilter}` : "";
            const res = await fetch(`${BASE_URL}/api/attendance/corrections/${query}`, {
                headers: authHeaders(),
            });
            if (!res.ok) throw new Error("Failed to load attendance corrections");
            const data = await res.json();
            setCorrections(Array.isArray(data) ? data : []);
        } catch (err: unknown) {
            const msg = err instanceof Error ? err.message : "Error loading corrections";
            message.error(msg);
        } finally {
            setLoadingCorrections(false);
        }
    }, [correctionStatusFilter]);

    useEffect(() => {
        fetchCorrections();
    }, [fetchCorrections]);

    const pendingCorrectionsCount = useMemo(() => {
        return corrections.filter((c) => c.status === "pending").length;
    }, [corrections]);

    const handleOpenDecision = (item: AttendanceCorrectionItem, type: "approve" | "reject") => {
        setDecisionTarget(item);
        setDecisionType(type);
        setDecisionAdminNotes("");
        setDecisionModalOpen(true);
    };

    const handleDecideCorrection = async () => {
        if (!decisionTarget) return;
        setSubmittingDecision(true);
        try {
            const res = await fetch(`${BASE_URL}/api/attendance/corrections/${decisionTarget.id}/decision/`, {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                    ...authHeaders(),
                },
                body: JSON.stringify({
                    decision: decisionType,
                    admin_notes: decisionAdminNotes.trim(),
                }),
            });
            const data = await res.json();
            if (!res.ok) throw new Error(data.detail || `Failed to ${decisionType} request`);

            message.success(
                decisionType === "approve"
                    ? `Time correction approved! Database attendance record updated to ${decisionTarget.requested_time}.`
                    : `Time correction rejected. Database record left unchanged.`
            );
            setDecisionModalOpen(false);
            setDecisionTarget(null);
            setDecisionAdminNotes("");
            fetchCorrections();
            fetchDailyData();
            fetchMonthlyData();
        } catch (err: unknown) {
            const msg = err instanceof Error ? err.message : "Failed to record decision";
            message.error(msg);
        } finally {
            setSubmittingDecision(false);
        }
    };

    const filteredCorrections = useMemo(() => {
        let list = corrections;
        if (correctionStatusFilter !== "all") {
            list = list.filter((c) => c.status === correctionStatusFilter);
        }
        if (correctionSearch.trim()) {
            const q = correctionSearch.toLowerCase();
            list = list.filter((c) =>
                [c.employee_name, c.department, c.reason, c.custom_reason, c.date].some((f) =>
                    f?.toLowerCase().includes(q)
                )
            );
        }
        return list;
    }, [corrections, correctionStatusFilter, correctionSearch]);


    // ── Fetch Daily Attendance ────────────────────────────────────────────
    const fetchDailyData = useCallback(async () => {
        setLoadingDaily(true);
        try {
            let url = `${BASE_URL}/api/attendance/admin/daily/?date=${selectedDailyDate}`;
            if (dailyDepartment) url += `&department=${encodeURIComponent(dailyDepartment)}`;
            const res = await fetch(url, { headers: authHeaders() });
            if (!res.ok) throw new Error("Failed to load daily attendance");
            const data = await res.json();
            setDailyRecords(data.records || []);
            setDailyStats(data.stats || null);
            setDailyDepartments(data.departments || []);
        } catch (err: unknown) {
            const msg = err instanceof Error ? err.message : "Error loading daily attendance";
            message.error(msg);
        } finally {
            setLoadingDaily(false);
        }
    }, [selectedDailyDate, dailyDepartment]);

    // ── Fetch Monthly Attendance ──────────────────────────────────────────
    const fetchMonthlyData = useCallback(async () => {
        setLoadingMonthly(true);
        try {
            let url = `${BASE_URL}/api/attendance/admin/monthly/?year=${monthlyYear}&month=${monthlyMonth}`;
            if (monthlyEmployeeId) url += `&employee_id=${monthlyEmployeeId}`;
            if (monthlyDepartment) url += `&department=${encodeURIComponent(monthlyDepartment)}`;
            const res = await fetch(url, { headers: authHeaders() });
            if (!res.ok) throw new Error("Failed to load monthly sheet");
            const data = await res.json();
            setMonthlyRows(data.matrix_rows || []);
            setMonthlySummaries(data.employee_summaries || []);
            setAllEmployeesList(data.employees || []);
            setMonthlyDepartmentsList(data.departments || []);
        } catch (err: unknown) {
            const msg = err instanceof Error ? err.message : "Error loading monthly sheet";
            message.error(msg);
        } finally {
            setLoadingMonthly(false);
        }
    }, [monthlyYear, monthlyMonth, monthlyEmployeeId, monthlyDepartment]);

    useEffect(() => {
        if (activeTab === "daily") {
            fetchDailyData();
        } else {
            fetchMonthlyData();
        }
    }, [activeTab, fetchDailyData, fetchMonthlyData]);

    // ── Filtered Records ──────────────────────────────────────────────────
    const filteredDailyRecords = useMemo(() => {
        if (!dailySearch.trim()) return dailyRecords;
        const q = dailySearch.toLowerCase();
        return dailyRecords.filter(
            (r) =>
                r.employee_name.toLowerCase().includes(q) ||
                (r.tag_id && r.tag_id.toLowerCase().includes(q)) ||
                (r.department && r.department.toLowerCase().includes(q))
        );
    }, [dailyRecords, dailySearch]);

    const filteredMonthlyRows = useMemo(() => {
        if (!monthlySearch.trim()) return monthlyRows;
        const q = monthlySearch.toLowerCase();
        return monthlyRows.filter(
            (r) =>
                r.employee_name.toLowerCase().includes(q) ||
                (r.tag_id && r.tag_id.toLowerCase().includes(q)) ||
                (r.department && r.department.toLowerCase().includes(q))
        );
    }, [monthlyRows, monthlySearch]);

    // ── Status Tag Helper ─────────────────────────────────────────────────
    const getStatusTag = (status: string) => {
        switch (status) {
            case "Early":
                return <Tag color="cyan">Early (&lt;09:30)</Tag>;
            case "On Time":
                return <Tag color="green">On Time (09:30)</Tag>;
            case "Grace":
                return <Tag color="gold">Grace (09:31-09:45)</Tag>;
            case "Late":
                return <Tag color="volcano">Late (&gt;09:45)</Tag>;
            case "Half Day":
                return <Tag color="magenta">Half Day</Tag>;
            case "Absent":
                return <Tag color="red">Absent</Tag>;
            case "Not Checked In":
                return <Tag color="orange">Not Checked In</Tag>;
            case "Week Off":
                return <Tag color="default">Week Off</Tag>;
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

    // ── Open Edit / Regularization Modal ──────────────────────────────────
    // ── Save Manual Entry / Regularization ────────────────────────────────
    // ── Add Comment / Note ────────────────────────────────────────────────
    const handleAddComment = async () => {
        if (!selectedRecordForComment) return;
        if (!newCommentText.trim()) {
            message.warning("Please type a comment.");
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
            message.success("Comment added!");
            setNewCommentText("");
            setCommentModalVisible(false);
            if (activeTab === "daily") fetchDailyData();
            else fetchMonthlyData();
        } catch (err: unknown) {
            const msg = err instanceof Error ? err.message : "Failed to post comment";
            message.error(msg);
        } finally {
            setSubmittingComment(false);
        }
    };

    // ── Export Monthly Attendance to Excel ────────────────────────────────
    const handleExportExcel = () => {
        if (monthlyRows.length === 0) {
            message.warning("No attendance records to export.");
            return;
        }

        try {
            // Prepare Sheet 1: Daily Matrix matching company format
            const excelRows = monthlyRows.map((r) => ({
                Date: dayjs(r.date).format("DD-MM-YYYY"),
                Day: r.day_name,
                "TAG ID": r.tag_id || "",
                "Employee Name": r.employee_name,
                Department: r.department || "",
                Designation: r.designation || "",
                "In Time": r.in_time_formatted || r.in_time || "",
                "Out Time": r.out_time_formatted || r.out_time || "",
                "Production Hours": r.production_hours !== null && r.production_hours !== undefined ? r.production_hours : "",
                "Task Work Hours": r.task_work_hours !== null && r.task_work_hours !== undefined ? r.task_work_hours : "",
                "Untracked Hours": r.untracked_hours !== null && r.untracked_hours !== undefined ? r.untracked_hours : "",
                "Break & Pause Hours": r.break_hours !== null && r.break_hours !== undefined ? r.break_hours : "",
                Status: r.status,
                Remarks: r.remarks || "",
            }));

            // Prepare Sheet 2: Monthly Summary per Employee
            const summaryRows = monthlySummaries.map((s) => ({
                "TAG ID": s.tag_id,
                "Employee Name": s.employee_name,
                Department: s.department,
                Designation: s.designation,
                "Total Days": s.total_days,
                "Present Days": s.present,
                "On Time / Early": s.on_time + s.early,
                "Grace (9:31-9:45)": s.grace,
                "Late (>9:45)": s.late,
                "Half Day": s.half_day,
                Absent: s.absent,
                "Week Off": s.week_off,
                "Leave / Holidays": s.leave + s.govt_holiday,
                "Production Hours Worked": s.production_hours ?? 0,
                "Break & Pause Hours": s.break_hours ?? 0,
            }));

            const wb = XLSX.utils.book_new();
            const wsMatrix = XLSX.utils.json_to_sheet(excelRows);
            const wsSummary = XLSX.utils.json_to_sheet(summaryRows);

            XLSX.utils.book_append_sheet(wb, wsMatrix, "Attendance Details");
            XLSX.utils.book_append_sheet(wb, wsSummary, "Employee Summary");

            const monthName = dayjs(`${monthlyYear}-${monthlyMonth}-01`).format("MMMM_YYYY");
            const filename = `Attendance_Report_${monthName}.xlsx`;

            XLSX.writeFile(wb, filename);
            message.success(`Exported successfully as ${filename}`);
        } catch (err: unknown) {
            const msg = err instanceof Error ? err.message : "Export failed";
            message.error(msg);
        }
    };

    return (
        <div style={{ padding: "20px 24px", maxWidth: 1450, margin: "0 auto" }}>
            {/* ── Page Header ────────────────────────────────────────────── */}
            <div
                style={{
                    display: "flex",
                    justifyContent: "space-between",
                    alignItems: "center",
                    flexWrap: "wrap",
                    gap: 16,
                    marginBottom: 20,
                }}
            >
                <div>
                    <Title level={3} style={{ margin: 0, color: "#1B3363", fontWeight: 700 }}>
                        <CalendarOutlined style={{ marginRight: 10 }} />
                        Attendance Administration
                    </Title>
                    <Text type="secondary" style={{ fontSize: 14 }}>
                        Monitor employee punches in real-time, view monthly attendance sheets, regularize records, and export to Excel.
                    </Text>
                </div>

                <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                    {activeTab === "monthly" && (
                        <Button
                            type="primary"
                            icon={<DownloadOutlined />}
                            onClick={handleExportExcel}
                            style={{ background: "#059669", borderColor: "#059669", fontWeight: 600 }}
                        >
                            Export to Excel (.xlsx)
                        </Button>
                    )}
                    <Button
                        icon={<ReloadOutlined />}
                        onClick={() => {
                            if (activeTab === "daily") fetchDailyData();
                            else if (activeTab === "monthly") fetchMonthlyData();
                            else fetchCorrections();
                        }}
                        loading={loadingDaily || loadingMonthly || loadingCorrections}
                    >
                        Refresh
                    </Button>
                </div>
            </div>

            {/* ── Tabs Navigation ────────────────────────────────────────── */}
            <Tabs
                activeKey={activeTab}
                onChange={(key) => setActiveTab(key)}
                items={[
                    {
                        key: "daily",
                        label: (
                            <span style={{ fontSize: 15, fontWeight: 600, padding: "0 8px" }}>
                                <ClockCircleOutlined style={{ marginRight: 6 }} />
                                Today's Live Attendance
                            </span>
                        ),
                    },
                    {
                        key: "monthly",
                        label: (
                            <span style={{ fontSize: 15, fontWeight: 600, padding: "0 8px" }}>
                                <CalendarOutlined style={{ marginRight: 6 }} />
                                Monthly Attendance Sheet
                            </span>
                        ),
                    },
                    {
                        key: "corrections",
                        label: (
                            <span style={{ fontSize: 15, fontWeight: 600, padding: "0 8px" }}>
                                <HourglassOutlined style={{ marginRight: 6 }} />
                                Time Correction Requests
                                {pendingCorrectionsCount > 0 && (
                                    <Tag color="red" style={{ marginLeft: 8, borderRadius: 10, fontSize: 11, padding: "0 6px" }}>
                                        {pendingCorrectionsCount} Pending
                                    </Tag>
                                )}
                            </span>
                        ),
                    },
                ]}
            />

            {/* ═══════════════════════════════════════════════════════════════
                 TAB 1: TODAY'S LIVE ATTENDANCE
            ═══════════════════════════════════════════════════════════════ */}
            {activeTab === "daily" && (
                <div>
                    {/* Controls Bar */}
                    <Card
                        style={{
                            marginBottom: 20,
                            borderRadius: 12,
                            border: "1px solid #EAECEF",
                            background: "#FAFAFA",
                        }}
                        bodyStyle={{ padding: "14px 18px" }}
                    >
                        <div
                            style={{
                                display: "flex",
                                justifyContent: "space-between",
                                alignItems: "center",
                                flexWrap: "wrap",
                                gap: 14,
                            }}
                        >
                            <div style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
                                <div>
                                    <span style={{ fontSize: 12, fontWeight: 600, color: "#4B5563", marginRight: 8 }}>
                                        Select Date:
                                    </span>
                                    <DatePicker
                                        value={dayjs(selectedDailyDate)}
                                        onChange={(d) => d && setSelectedDailyDate(d.format("YYYY-MM-DD"))}
                                        allowClear={false}
                                        style={{ width: 160 }}
                                    />
                                </div>

                                <div>
                                    <span style={{ fontSize: 12, fontWeight: 600, color: "#4B5563", marginRight: 8 }}>
                                        Department:
                                    </span>
                                    <Select
                                        value={dailyDepartment}
                                        onChange={(val) => setDailyDepartment(val)}
                                        style={{ width: 180 }}
                                        options={[
                                            { value: "", label: "All Departments" },
                                            ...dailyDepartments.map((d) => ({ value: d, label: d })),
                                        ]}
                                    />
                                </div>
                            </div>

                            <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                                <Input
                                    placeholder="Search by Name, TAG ID..."
                                    prefix={<SearchOutlined style={{ color: "#9CA3AF" }} />}
                                    value={dailySearch}
                                    onChange={(e) => setDailySearch(e.target.value)}
                                    style={{ width: 250 }}
                                    allowClear
                                />
                            </div>
                        </div>
                    </Card>

                    {/* Live Daily Stats Cards */}
                    {dailyStats && (
                        <div
                            style={{
                                display: "grid",
                                gridTemplateColumns: "repeat(auto-fit, minmax(130px, 1fr))",
                                gap: 12,
                                marginBottom: 20,
                            }}
                        >
                            <div className="stat-card" style={{ background: "#FFFFFF", padding: "14px 16px", borderRadius: 10, border: "1px solid #EAECEF" }}>
                                <div style={{ fontSize: 11, color: "#6B7280", fontWeight: 600, textTransform: "uppercase" }}>Total Staff</div>
                                <div style={{ fontSize: 22, fontWeight: 700, color: "#1B3363", marginTop: 4 }}>{dailyStats.total_staff}</div>
                            </div>
                            <div className="stat-card" style={{ background: "#FFFFFF", padding: "14px 16px", borderRadius: 10, border: "1px solid #EAECEF" }}>
                                <div style={{ fontSize: 11, color: "#6B7280", fontWeight: 600, textTransform: "uppercase" }}>Checked In (Present)</div>
                                <div style={{ fontSize: 22, fontWeight: 700, color: "#10B981", marginTop: 4 }}>{dailyStats.present}</div>
                            </div>
                            <div className="stat-card" style={{ background: "#FFFFFF", padding: "14px 16px", borderRadius: 10, border: "1px solid #EAECEF" }}>
                                <div style={{ fontSize: 11, color: "#6B7280", fontWeight: 600, textTransform: "uppercase" }}>On Time / Early</div>
                                <div style={{ fontSize: 22, fontWeight: 700, color: "#059669", marginTop: 4 }}>
                                    {dailyStats.on_time + dailyStats.early}
                                </div>
                            </div>
                            <div className="stat-card" style={{ background: "#FFFFFF", padding: "14px 16px", borderRadius: 10, border: "1px solid #EAECEF" }}>
                                <div style={{ fontSize: 11, color: "#6B7280", fontWeight: 600, textTransform: "uppercase" }}>Grace (9:31-9:45)</div>
                                <div style={{ fontSize: 22, fontWeight: 700, color: "#D97706", marginTop: 4 }}>{dailyStats.grace}</div>
                            </div>
                            <div className="stat-card" style={{ background: "#FFFFFF", padding: "14px 16px", borderRadius: 10, border: "1px solid #EAECEF" }}>
                                <div style={{ fontSize: 11, color: "#6B7280", fontWeight: 600, textTransform: "uppercase" }}>Late Arrivals (&gt;9:45)</div>
                                <div style={{ fontSize: 22, fontWeight: 700, color: "#DC2626", marginTop: 4 }}>{dailyStats.late}</div>
                            </div>
                            <div className="stat-card" style={{ background: "#FFFFFF", padding: "14px 16px", borderRadius: 10, border: "1px solid #EAECEF" }}>
                                <div style={{ fontSize: 11, color: "#6B7280", fontWeight: 600, textTransform: "uppercase" }}>Half Day</div>
                                <div style={{ fontSize: 22, fontWeight: 700, color: "#9333EA", marginTop: 4 }}>{dailyStats.half_day}</div>
                            </div>
                            <div className="stat-card" style={{ background: "#FFFFFF", padding: "14px 16px", borderRadius: 10, border: "1px solid #EAECEF" }}>
                                <div style={{ fontSize: 11, color: "#6B7280", fontWeight: 600, textTransform: "uppercase" }}>Not Checked In</div>
                                <div style={{ fontSize: 22, fontWeight: 700, color: "#64748B", marginTop: 4 }}>{dailyStats.not_checked_in}</div>
                            </div>
                        </div>
                    )}

                    {/* Daily Table */}
                    <Card style={{ borderRadius: 12, border: "1px solid #EAECEF", boxShadow: "0 2px 8px rgba(0,0,0,0.03)" }}>
                        <div style={{ overflowX: "auto" }}>
                            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13, textAlign: "left" }}>
                                <thead>
                                    <tr style={{ background: "#F8FAFC", borderBottom: "2px solid #E2E8F0", color: "#475569", whiteSpace: "nowrap", }}>
                                        <th style={{ padding: "12px 14px", fontWeight: 600 }}>TAG ID</th>
                                        <th style={{ padding: "12px 14px", fontWeight: 600 }}>Employee Name</th>
                                        <th style={{ padding: "12px 14px", fontWeight: 600 }}>Department</th>
                                        <th style={{ padding: "12px 14px", fontWeight: 600 }}>In Time</th>
                                        <th style={{ padding: "12px 14px", fontWeight: 600 }}>Out Time</th>
                                        <th style={{ padding: "12px 14px", fontWeight: 600 }}>Production Hrs</th>
                                        <th style={{ padding: "12px 14px", fontWeight: 600 }}>Break / Pauses</th>
                                        <th style={{ padding: "12px 14px", fontWeight: 600 }}>Status</th>
                                        <th style={{ padding: "12px 14px", fontWeight: 600 }}>Remarks</th>
                                        <th style={{ padding: "12px 14px", fontWeight: 600, textAlign: "center" }}>Actions</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {filteredDailyRecords.length === 0 ? (
                                        <tr>
                                            <td colSpan={10} style={{ textAlign: "center", padding: "40px", color: "#94A3B8" }}>
                                                No employees found for this date.
                                            </td>
                                        </tr>
                                    ) : (
                                        filteredDailyRecords.map((r) => (
                                            <tr key={r.employee} style={{ borderBottom: "1px solid #F1F5F9" }}>
                                                <td style={{ padding: "12px 14px", fontFamily: "monospace", color: "#64748B", fontWeight: 600 }}>
                                                    {r.tag_id || "-"}
                                                </td>
                                                <td style={{ padding: "12px 14px", fontWeight: 600, color: "#1E293B" }}>
                                                    {r.employee_name}
                                                    {r.designation && (
                                                        <span style={{ fontSize: 11, color: "#94A3B8", display: "block", fontWeight: 400 }}>
                                                            {r.designation}
                                                        </span>
                                                    )}
                                                </td>
                                                <td style={{ padding: "12px 14px", color: "#475569" }}>
                                                    {r.department || "-"}
                                                </td>
                                                <td style={{ padding: "12px 14px", fontFamily: "monospace", fontWeight: 600 }}>
                                                    {r.in_time_formatted ? (
                                                        <span style={{ color: "#0F766E" }}>{r.in_time_formatted}</span>
                                                    ) : r.in_time ? (
                                                        <span style={{ color: "#0F766E" }}>{r.in_time}</span>
                                                    ) : (
                                                        <span style={{ color: "#CBD5E1" }}>--:--</span>
                                                    )}
                                                </td>
                                                <td style={{ padding: "12px 14px", fontFamily: "monospace", fontWeight: 600 }}>
                                                    {r.out_time_formatted ? (
                                                        <span style={{ color: "#B45309" }}>{r.out_time_formatted}</span>
                                                    ) : r.out_time ? (
                                                        <span style={{ color: "#B45309" }}>{r.out_time}</span>
                                                    ) : (
                                                        <span style={{ color: "#CBD5E1" }}>--:--</span>
                                                    )}
                                                </td>
                                                <td style={{ padding: "12px 14px", fontWeight: 600 }}>
                                                    {r.production_hours !== null && r.production_hours !== undefined ? (
                                                        <Tooltip
                                                            title={
                                                                <div style={{ fontSize: 12 }}>
                                                                    <div style={{ fontWeight: 700, marginBottom: 2 }}>Production Breakdown:</div>
                                                                    <div>• Working Hours (Task Timer): {r.task_work_hours ?? 0} hrs</div>
                                                                    <div>• Untracked Time: {r.untracked_hours ?? 0} hrs</div>
                                                                    <div style={{ marginTop: 4, borderTop: "1px solid rgba(255,255,255,0.2)", paddingTop: 2, fontWeight: 600 }}>
                                                                        Total Production: {r.production_hours ?? 0} hrs
                                                                    </div>
                                                                </div>
                                                            }
                                                        >
                                                            <span style={{ color: "#0F766E", background: "rgba(15, 118, 110, 0.08)", padding: "4px 8px", borderRadius: 6, cursor: "pointer" }}>
                                                                {r.production_hours} hrs
                                                            </span>
                                                        </Tooltip>
                                                    ) : (
                                                        <span style={{ color: "#CBD5E1" }}>--</span>
                                                    )}
                                                </td>
                                                <td style={{ padding: "12px 14px", fontWeight: 600 }}>
                                                    {r.break_hours !== null && r.break_hours !== undefined ? (
                                                        <Tooltip
                                                            title={
                                                                <div style={{ fontSize: 12 }}>
                                                                    <div style={{ fontWeight: 700, marginBottom: 2 }}>Break & Pause Details:</div>
                                                                    <div>• Normal Breaks: {r.normal_break_hours ?? 0} hrs</div>
                                                                    <div>• Other Pauses: {r.other_pause_hours ?? 0} hrs</div>
                                                                    <div style={{ marginTop: 4, borderTop: "1px solid rgba(255,255,255,0.2)", paddingTop: 2, fontWeight: 600 }}>
                                                                        Total Breaks: {r.break_hours ?? 0} hrs
                                                                    </div>
                                                                </div>
                                                            }
                                                        >
                                                            <span style={{ color: "#B45309", background: "rgba(180, 83, 9, 0.08)", padding: "4px 8px", borderRadius: 6, cursor: "pointer" }}>
                                                                {r.break_hours} hrs
                                                            </span>
                                                        </Tooltip>
                                                    ) : (
                                                        <span style={{ color: "#CBD5E1" }}>--</span>
                                                    )}
                                                </td>
                                                <td style={{ padding: "12px 14px" }}>
                                                    {getStatusTag(r.status)}
                                                </td>
                                                <td style={{ padding: "12px 14px", maxWidth: 220 }}>
                                                    {r.remarks ? (
                                                        <Tooltip title={r.remarks}>
                                                            <span
                                                                style={{
                                                                    display: "inline-block",
                                                                    maxWidth: 200,
                                                                    overflow: "hidden",
                                                                    textOverflow: "ellipsis",
                                                                    whiteSpace: "nowrap",
                                                                    color: "#475569",
                                                                }}
                                                            >
                                                                {r.remarks}
                                                            </span>
                                                        </Tooltip>
                                                    ) : (
                                                        <span style={{ color: "#CBD5E1" }}>-</span>
                                                    )}
                                                </td>
                                                <td style={{ padding: "12px 14px", textAlign: "center" }}>
                                                    <Space size="small">
                                                        {r.id && (
                                                            <Button
                                                                size="small"
                                                                icon={<CommentOutlined />}
                                                                onClick={() => {
                                                                    setSelectedRecordForComment(r);
                                                                    setCommentModalVisible(true);
                                                                }}
                                                            />
                                                        )}
                                                    </Space>
                                                </td>
                                            </tr>
                                        ))
                                    )}
                                </tbody>
                            </table>
                        </div>
                    </Card>
                </div>
            )}

            {/* ═══════════════════════════════════════════════════════════════
                 TAB 2: MONTHLY ATTENDANCE SHEET (EXCEL MATRIX LAYOUT)
            ═══════════════════════════════════════════════════════════════ */}
            {activeTab === "monthly" && (
                <div>
                    {/* Month Controls Bar */}
                    <Card
                        style={{
                            marginBottom: 20,
                            borderRadius: 12,
                            border: "1px solid #EAECEF",
                            background: "#FAFAFA",
                        }}
                        bodyStyle={{ padding: "14px 18px" }}
                    >
                        <div
                            style={{
                                display: "flex",
                                justifyContent: "space-between",
                                alignItems: "center",
                                flexWrap: "wrap",
                                gap: 14,
                            }}
                        >
                            <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
                                <div>
                                    <span style={{ fontSize: 12, fontWeight: 600, color: "#4B5563", marginRight: 6 }}>
                                        Month:
                                    </span>
                                    <Select
                                        value={monthlyMonth}
                                        onChange={(val) => setMonthlyMonth(val)}
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
                                </div>
                                <div>
                                    <span style={{ fontSize: 12, fontWeight: 600, color: "#4B5563", marginRight: 6 }}>
                                        Year:
                                    </span>
                                    <Select
                                        value={monthlyYear}
                                        onChange={(val) => setMonthlyYear(val)}
                                        style={{ width: 95 }}
                                        options={[
                                            { value: 2025, label: "2025" },
                                            { value: 2026, label: "2026" },
                                            { value: 2027, label: "2027" },
                                        ]}
                                    />
                                </div>
                                <div>
                                    <span style={{ fontSize: 12, fontWeight: 600, color: "#4B5563", marginRight: 6 }}>
                                        Employee:
                                    </span>
                                    <Select
                                        value={monthlyEmployeeId}
                                        onChange={(val) => setMonthlyEmployeeId(val)}
                                        style={{ width: 180 }}
                                        showSearch
                                        filterOption={(input, opt) =>
                                            (opt?.label ?? "").toLowerCase().includes(input.toLowerCase())
                                        }
                                        options={[
                                            { value: "", label: "All Employees" },
                                            ...allEmployeesList.map((e) => ({
                                                value: String(e.id),
                                                label: `${e.name} (${e.employee_id || `TAG${e.id}`})`,
                                            })),
                                        ]}
                                    />
                                </div>
                                <div>
                                    <span style={{ fontSize: 12, fontWeight: 600, color: "#4B5563", marginRight: 6 }}>
                                        Department:
                                    </span>
                                    <Select
                                        value={monthlyDepartment}
                                        onChange={(val) => setMonthlyDepartment(val)}
                                        style={{ width: 170 }}
                                        options={[
                                            { value: "", label: "All Departments" },
                                            ...monthlyDepartmentsList.map((d) => ({ value: d, label: d })),
                                        ]}
                                    />
                                </div>
                            </div>

                            <div>
                                <Input
                                    placeholder="Search Matrix..."
                                    prefix={<SearchOutlined style={{ color: "#9CA3AF" }} />}
                                    value={monthlySearch}
                                    onChange={(e) => setMonthlySearch(e.target.value)}
                                    style={{ width: 220 }}
                                    allowClear
                                />
                            </div>
                        </div>
                    </Card>

                    {/* Employee Monthly Summaries (if single employee selected or summary view) */}
                    {monthlySummaries.length > 0 && monthlyEmployeeId && (
                        <div
                            style={{
                                background: "#FFFFFF",
                                padding: "16px 20px",
                                borderRadius: 12,
                                border: "1px solid #EAECEF",
                                marginBottom: 20,
                            }}
                        >
                            <div style={{ fontSize: 15, fontWeight: 700, color: "#1B3363", marginBottom: 12 }}>
                                Monthly Summary for {monthlySummaries[0]?.employee_name} ({monthlySummaries[0]?.tag_id})
                            </div>
                            <div
                                style={{
                                    display: "grid",
                                    gridTemplateColumns: "repeat(auto-fit, minmax(120px, 1fr))",
                                    gap: 12,
                                }}
                            >
                                <div style={{ background: "#F8FAFC", padding: "10px 12px", borderRadius: 8 }}>
                                    <div style={{ fontSize: 11, color: "#64748B", fontWeight: 600 }}>Total Days</div>
                                    <div style={{ fontSize: 20, fontWeight: 700, color: "#1E293B" }}>{monthlySummaries[0]?.total_days}</div>
                                </div>
                                <div style={{ background: "#F8FAFC", padding: "10px 12px", borderRadius: 8 }}>
                                    <div style={{ fontSize: 11, color: "#64748B", fontWeight: 600 }}>Present</div>
                                    <div style={{ fontSize: 20, fontWeight: 700, color: "#10B981" }}>{monthlySummaries[0]?.present}</div>
                                </div>
                                <div style={{ background: "#F8FAFC", padding: "10px 12px", borderRadius: 8 }}>
                                    <div style={{ fontSize: 11, color: "#64748B", fontWeight: 600 }}>On Time/Early</div>
                                    <div style={{ fontSize: 20, fontWeight: 700, color: "#059669" }}>
                                        {monthlySummaries[0]?.on_time + monthlySummaries[0]?.early}
                                    </div>
                                </div>
                                <div style={{ background: "#F8FAFC", padding: "10px 12px", borderRadius: 8 }}>
                                    <div style={{ fontSize: 11, color: "#64748B", fontWeight: 600 }}>Grace (9:31-9:45)</div>
                                    <div style={{ fontSize: 20, fontWeight: 700, color: "#D97706" }}>{monthlySummaries[0]?.grace}</div>
                                </div>
                                <div style={{ background: "#F8FAFC", padding: "10px 12px", borderRadius: 8 }}>
                                    <div style={{ fontSize: 11, color: "#64748B", fontWeight: 600 }}>Late Arrivals</div>
                                    <div style={{ fontSize: 20, fontWeight: 700, color: "#DC2626" }}>{monthlySummaries[0]?.late}</div>
                                </div>
                                <div style={{ background: "#F8FAFC", padding: "10px 12px", borderRadius: 8 }}>
                                    <div style={{ fontSize: 11, color: "#64748B", fontWeight: 600 }}>Half Day</div>
                                    <div style={{ fontSize: 20, fontWeight: 700, color: "#9333EA" }}>{monthlySummaries[0]?.half_day}</div>
                                </div>
                                <div style={{ background: "#F8FAFC", padding: "10px 12px", borderRadius: 8 }}>
                                    <div style={{ fontSize: 11, color: "#64748B", fontWeight: 600 }}>Absent</div>
                                    <div style={{ fontSize: 20, fontWeight: 700, color: "#EF4444" }}>{monthlySummaries[0]?.absent}</div>
                                </div>
                                <div style={{ background: "#F0FDF4", padding: "10px 12px", borderRadius: 8 }}>
                                    <div style={{ fontSize: 11, color: "#166534", fontWeight: 600 }}>Production</div>
                                    <div style={{ fontSize: 20, fontWeight: 700, color: "#15803D" }}>{monthlySummaries[0]?.production_hours ?? 0}h</div>
                                </div>
                                <div style={{ background: "#FFFBEB", padding: "10px 12px", borderRadius: 8 }}>
                                    <div style={{ fontSize: 11, color: "#92400E", fontWeight: 600 }}>Breaks/Pauses</div>
                                    <div style={{ fontSize: 20, fontWeight: 700, color: "#B45309" }}>{monthlySummaries[0]?.break_hours ?? 0}h</div>
                                </div>
                            </div>
                        </div>
                    )}

                    {/* Monthly Matrix Table (Excel Structure) */}
                    <Card style={{ borderRadius: 12, border: "1px solid #EAECEF", boxShadow: "0 2px 8px rgba(0,0,0,0.03)" }}>
                        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
                            <div style={{ fontSize: 14, color: "#64748B" }}>
                                Showing <strong>{filteredMonthlyRows.length}</strong> attendance records for{" "}
                                <strong>{dayjs(`${monthlyYear}-${monthlyMonth}-01`).format("MMMM YYYY")}</strong>
                            </div>
                        </div>

                        <div style={{ overflowX: "auto" }}>
                            <table style={{ width: "100%", minWidth: "1300px", borderCollapse: "collapse", fontSize: 13, textAlign: "left" }}>
                                <thead>
                                    <tr style={{ background: "#F8FAFC", borderBottom: "2px solid #E2E8F0", color: "#475569", whiteSpace: "nowrap", }}>
                                        <th style={{ padding: "10px 12px", fontWeight: 600 }}>Date</th>
                                        <th style={{ padding: "10px 12px", fontWeight: 600 }}>Day</th>
                                        <th style={{ padding: "10px 12px", fontWeight: 600 }}>TAG ID</th>
                                        <th style={{ padding: "10px 12px", fontWeight: 600 }}>Employee Name</th>
                                        <th style={{ padding: "10px 12px", fontWeight: 600 }}>Department</th>
                                        <th style={{ padding: "10px 12px", fontWeight: 600 }}>In Time</th>
                                        <th style={{ padding: "10px 12px", fontWeight: 600 }}>Out Time</th>
                                        <th style={{ padding: "10px 12px", fontWeight: 600 }}>Production Hrs</th>
                                        <th style={{ padding: "10px 12px", fontWeight: 600 }}>Break / Pauses</th>
                                        <th style={{ padding: "10px 12px", fontWeight: 600 }}>Status</th>
                                        <th style={{ padding: "10px 12px", fontWeight: 600 }}>Remarks</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {filteredMonthlyRows.length === 0 ? (
                                        <tr>
                                            <td colSpan={11} style={{ textAlign: "center", padding: "40px", color: "#94A3B8" }}>
                                                No records found for the selected month and filters.
                                            </td>
                                        </tr>
                                    ) : (
                                        filteredMonthlyRows
                                            .slice((monthlyPage - 1) * monthlyPageSize, monthlyPage * monthlyPageSize)
                                            .map((r, idx) => {
                                                const isSunday = r.day_name === "Sunday";
                                                return (
                                                    <tr
                                                        key={`${r.employee}-${r.date}-${idx}`}
                                                        style={{
                                                            borderBottom: "1px solid #F1F5F9",
                                                            background: isSunday ? "#F8FAFC" : "#FFFFFF",
                                                        }}
                                                    >
                                                        <td style={{ padding: "10px 12px", fontWeight: 500 }}>
                                                            {dayjs(r.date).format("DD-MM-YYYY")}
                                                        </td>
                                                        <td
                                                            style={{
                                                                padding: "10px 12px",
                                                                color: isSunday ? "#94A3B8" : "#334155",
                                                            }}
                                                        >
                                                            {r.day_name}
                                                        </td>
                                                        <td style={{ padding: "10px 12px", fontFamily: "monospace", color: "#64748B" }}>
                                                            {r.tag_id || "-"}
                                                        </td>
                                                        <td style={{ padding: "10px 12px", fontWeight: 600, color: "#1E293B" }}>
                                                            {r.employee_name}
                                                        </td>
                                                        <td style={{ padding: "10px 12px", color: "#475569" }}>
                                                            {r.department || "-"}
                                                        </td>
                                                        <td style={{ padding: "10px 12px", fontFamily: "monospace", fontWeight: 600 }}>
                                                            {r.in_time_formatted ? (
                                                                <span style={{ color: "#0F766E" }}>{r.in_time_formatted}</span>
                                                            ) : r.in_time ? (
                                                                <span style={{ color: "#0F766E" }}>{r.in_time}</span>
                                                            ) : (
                                                                <span style={{ color: "#CBD5E1" }}>--:--</span>
                                                            )}
                                                        </td>
                                                        <td style={{ padding: "10px 12px", fontFamily: "monospace", fontWeight: 600 }}>
                                                            {r.out_time_formatted ? (
                                                                <span style={{ color: "#B45309" }}>{r.out_time_formatted}</span>
                                                            ) : r.out_time ? (
                                                                <span style={{ color: "#B45309" }}>{r.out_time}</span>
                                                            ) : (
                                                                <span style={{ color: "#CBD5E1" }}>--:--</span>
                                                            )}
                                                        </td>
                                                        {/* Production Hours */}
                                                        <td style={{ padding: "10px 12px", fontWeight: 600 }}>
                                                            {r.production_hours !== null && r.production_hours !== undefined ? (
                                                                <Tooltip
                                                                    title={
                                                                        <div style={{ fontSize: 12 }}>
                                                                            <div style={{ fontWeight: 700, marginBottom: 2 }}>Production Breakdown:</div>
                                                                            <div>• Working Hours (Task Timer): {r.task_work_hours ?? 0} hrs</div>
                                                                            <div>• Untracked Time: {r.untracked_hours ?? 0} hrs</div>
                                                                            <div style={{ marginTop: 4, borderTop: "1px solid rgba(255,255,255,0.2)", paddingTop: 2, fontWeight: 600 }}>
                                                                                Total Production: {r.production_hours ?? 0} hrs
                                                                            </div>
                                                                        </div>
                                                                    }
                                                                >
                                                                    <span style={{ color: "#0F766E", background: "rgba(15, 118, 110, 0.08)", padding: "3px 8px", borderRadius: 6, cursor: "pointer" }}>
                                                                        {r.production_hours} hrs
                                                                    </span>
                                                                </Tooltip>
                                                            ) : (
                                                                <span style={{ color: "#CBD5E1" }}>--</span>
                                                            )}
                                                        </td>

                                                        {/* Break / Pauses */}
                                                        <td style={{ padding: "10px 12px", fontWeight: 600 }}>
                                                            {r.break_hours !== null && r.break_hours !== undefined ? (
                                                                <Tooltip
                                                                    title={
                                                                        <div style={{ fontSize: 12 }}>
                                                                            <div style={{ fontWeight: 700, marginBottom: 2 }}>Break & Pause Details:</div>
                                                                            <div>• Normal Breaks: {r.normal_break_hours ?? 0} hrs</div>
                                                                            <div>• Other Pauses: {r.other_pause_hours ?? 0} hrs</div>
                                                                            <div style={{ marginTop: 4, borderTop: "1px solid rgba(255,255,255,0.2)", paddingTop: 2, fontWeight: 600 }}>
                                                                                Total Breaks: {r.break_hours ?? 0} hrs
                                                                            </div>
                                                                        </div>
                                                                    }
                                                                >
                                                                    <span style={{ color: "#B45309", background: "rgba(180, 83, 9, 0.08)", padding: "3px 8px", borderRadius: 6, cursor: "pointer" }}>
                                                                        {r.break_hours} hrs
                                                                    </span>
                                                                </Tooltip>
                                                            ) : (
                                                                <span style={{ color: "#CBD5E1" }}>--</span>
                                                            )}
                                                        </td>
                                                        <td style={{ padding: "10px 12px" }}>
                                                            {getStatusTag(r.status)}
                                                        </td>
                                                        <td style={{ padding: "10px 12px", maxWidth: 180 }}>
                                                            {r.remarks ? (
                                                                <Tooltip title={r.remarks}>
                                                                    <span
                                                                        style={{
                                                                            display: "inline-block",
                                                                            maxWidth: 160,
                                                                            overflow: "hidden",
                                                                            textOverflow: "ellipsis",
                                                                            whiteSpace: "nowrap",
                                                                            color: "#475569",
                                                                        }}
                                                                    >
                                                                        {r.remarks}
                                                                    </span>
                                                                </Tooltip>
                                                            ) : (
                                                                <span style={{ color: "#CBD5E1" }}>-</span>
                                                            )}
                                                        </td>
                                                    </tr>
                                                );
                                            })
                                    )}
                                </tbody>
                            </table>
                        </div>

                        {/* Pagination */}
                        <div style={{ display: "flex", justifyContent: "flex-end", marginTop: 20 }}>
                            <Pagination
                                current={monthlyPage}
                                pageSize={monthlyPageSize}
                                total={filteredMonthlyRows.length}
                                onChange={(p, ps) => {
                                    setMonthlyPage(p);
                                    setMonthlyPageSize(ps);
                                }}
                                showSizeChanger
                                pageSizeOptions={["15", "31", "60", "100"]}
                            />
                        </div>
                    </Card>
                </div>
            )}

            {/* ═══════════════════════════════════════════════════════════════
                 TAB 3: TIME CORRECTION & REGULARIZATION REQUESTS
            ═══════════════════════════════════════════════════════════════ */}
            {activeTab === "corrections" && (
                <div>
                    {/* Controls Bar */}
                    <Card
                        style={{
                            marginBottom: 20,
                            borderRadius: 12,
                            border: "1px solid #EAECEF",
                            background: "#FAFAFA",
                        }}
                        styles={{ body: { padding: "14px 18px" } }}
                    >
                        <div
                            style={{
                                display: "flex",
                                justifyContent: "space-between",
                                alignItems: "center",
                                flexWrap: "wrap",
                                gap: 14,
                            }}
                        >
                            <div style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
                                <div>
                                    <span style={{ fontSize: 12, fontWeight: 600, color: "#4B5563", marginRight: 8 }}>
                                        Status Filter:
                                    </span>
                                    <Select
                                        value={correctionStatusFilter}
                                        onChange={(val) => setCorrectionStatusFilter(val)}
                                        style={{ width: 140 }}
                                        options={[
                                            { value: "all", label: "All Requests" },
                                            { value: "pending", label: `Pending (${pendingCorrectionsCount})` },
                                            { value: "approved", label: "Approved" },
                                            { value: "rejected", label: "Rejected" },
                                        ]}
                                    />
                                </div>

                                <Input
                                    placeholder="Search employee, department, reason..."
                                    prefix={<SearchOutlined style={{ color: "#94A3B8" }} />}
                                    value={correctionSearch}
                                    onChange={(e) => setCorrectionSearch(e.target.value)}
                                    allowClear
                                    style={{ width: 280 }}
                                />
                            </div>

                            <div style={{ fontSize: 13, color: "#64748B" }}>
                                Total Requests: <strong>{filteredCorrections.length}</strong>
                            </div>
                        </div>
                    </Card>

                    {/* Corrections Table */}
                    <Card
                        style={{
                            borderRadius: 14,
                            border: "1px solid #EAECEF",
                            boxShadow: "0 2px 10px rgba(0,0,0,0.03)",
                        }}
                    >
                        <div style={{ overflowX: "auto" }}>
                            <table style={{ width: "100%", minWidth: "1400px", borderCollapse: "collapse", fontSize: 13, textAlign: "left" }}>
                                <thead>
                                    <tr style={{ background: "#F8FAFC", borderBottom: "2px solid #E2E8F0", color: "#475569", whiteSpace: "nowrap", }}>
                                        <th style={{ padding: "12px 14px", fontWeight: 600 }}>Date</th>
                                        <th style={{ padding: "12px 14px", fontWeight: 600 }}>Employee</th>
                                        <th style={{ padding: "12px 14px", fontWeight: 600 }}>Department</th>
                                        <th style={{ padding: "12px 14px", fontWeight: 600 }}>Request Type</th>
                                        <th style={{ padding: "12px 14px", fontWeight: 600 }}>System Time</th>
                                        <th style={{ padding: "12px 14px", fontWeight: 600 }}>Requested Time</th>
                                        <th style={{ padding: "12px 14px", fontWeight: 600 }}>Reason & Details</th>
                                        <th style={{ padding: "12px 14px", fontWeight: 600 }}>Proof (TimeChamp)</th>
                                        <th style={{ padding: "12px 14px", fontWeight: 600 }}>Status</th>
                                        <th style={{ padding: "12px 14px", fontWeight: 600, textAlign: "center" }}>Action</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {filteredCorrections.length === 0 ? (
                                        <tr>
                                            <td colSpan={10} style={{ textAlign: "center", padding: "40px", color: "#94A3B8" }}>
                                                {loadingCorrections
                                                    ? "Loading correction requests..."
                                                    : "No attendance time correction requests found."}
                                            </td>
                                        </tr>
                                    ) : (
                                        filteredCorrections.map((item) => {
                                            return (
                                                <tr
                                                    key={item.id}
                                                    style={{
                                                        borderBottom: "1px solid #F1F5F9",
                                                        background: item.status === "pending" ? "#FEFCE8" : "#FFFFFF",
                                                    }}
                                                >
                                                    <td style={{ padding: "12px 14px", fontWeight: 600 }}>
                                                        {dayjs(item.date).format("DD-MM-YYYY")}
                                                    </td>
                                                    <td style={{ padding: "12px 14px", fontWeight: 600, color: "#1E293B" }}>
                                                        {item.employee_name}
                                                    </td>
                                                    <td style={{ padding: "12px 14px", color: "#64748B" }}>
                                                        {item.department || "-"}
                                                    </td>
                                                    <td style={{ padding: "12px 14px" }}>
                                                        {item.request_type === "in_time" ? (
                                                            <Tag color="cyan">Check-In (In Time)</Tag>
                                                        ) : (
                                                            <Tag color="orange">Check-Out (Out Time)</Tag>
                                                        )}
                                                    </td>
                                                    <td style={{ padding: "12px 14px", fontFamily: "monospace", color: "#64748B" }}>
                                                        {item.system_time_formatted || item.system_time || "Not Recorded"}
                                                    </td>
                                                    <td style={{ padding: "12px 14px", fontFamily: "monospace", fontWeight: 700, color: "#2563EB", fontSize: 14 }}>
                                                        {item.requested_time_formatted || item.requested_time}
                                                    </td>
                                                    <td style={{ padding: "12px 14px", maxWidth: 220 }}>
                                                        <Tag color="geekblue" style={{ marginBottom: 4 }}>
                                                            {item.reason}
                                                        </Tag>
                                                        {item.custom_reason && (
                                                            <div style={{ fontSize: 12, color: "#475569" }}>
                                                                {item.custom_reason}
                                                            </div>
                                                        )}
                                                    </td>
                                                    <td style={{ padding: "12px 14px" }}>
                                                        {item.proof_screenshot_url ? (
                                                            <div
                                                                onClick={() => {
                                                                    setPreviewImageSrc(item.proof_screenshot_url!);
                                                                    setPreviewImageOpen(true);
                                                                }}
                                                                style={{
                                                                    display: "inline-flex",
                                                                    alignItems: "center",
                                                                    gap: 6,
                                                                    cursor: "pointer",
                                                                    background: "#EFF6FF",
                                                                    padding: "4px 8px",
                                                                    borderRadius: 6,
                                                                    border: "1px solid #BFDBFE",
                                                                }}
                                                            >
                                                                <img
                                                                    src={item.proof_screenshot_url}
                                                                    alt="Proof"
                                                                    style={{ width: 28, height: 24, objectFit: "cover", borderRadius: 4 }}
                                                                />
                                                                <span style={{ fontSize: 11, color: "#1D4ED8", fontWeight: 600 }}>
                                                                    View Proof
                                                                </span>
                                                            </div>
                                                        ) : (
                                                            <span style={{ color: "#94A3B8", fontSize: 12 }}>No Screenshot</span>
                                                        )}
                                                    </td>
                                                    <td style={{ padding: "12px 14px" }}>
                                                        {item.status === "pending" ? (
                                                            <Tag color="warning" icon={<HourglassOutlined />}>Pending</Tag>
                                                        ) : item.status === "approved" ? (
                                                            <Tag color="success" icon={<CheckCircleOutlined />}>Approved</Tag>
                                                        ) : (
                                                            <Tag color="error" icon={<CloseCircleOutlined />}>Rejected</Tag>
                                                        )}
                                                    </td>
                                                    <td style={{ padding: "12px 14px", textAlign: "center" }}>
                                                        {item.status === "pending" ? (
                                                            <div style={{ display: "flex", gap: 6, justifyContent: "center" }}>
                                                                <Button
                                                                    type="primary"
                                                                    size="small"
                                                                    icon={<CheckCircleOutlined />}
                                                                    onClick={() => handleOpenDecision(item, "approve")}
                                                                    style={{ background: "#10B981", borderColor: "#10B981" }}
                                                                >
                                                                    Approve
                                                                </Button>
                                                                <Button
                                                                    danger
                                                                    size="small"
                                                                    icon={<CloseCircleOutlined />}
                                                                    onClick={() => handleOpenDecision(item, "reject")}
                                                                >
                                                                    Reject
                                                                </Button>
                                                            </div>
                                                        ) : (
                                                            <span style={{ fontSize: 11, color: "#64748B" }}>
                                                                Decided by {item.decided_by_name || "Admin"}
                                                            </span>
                                                        )}
                                                    </td>
                                                </tr>
                                            );
                                        })
                                    )}
                                </tbody>
                            </table>
                        </div>
                    </Card>
                </div>
            )}

            {/* ═══════════════════════════════════════════════════════════════
            ═══════════════════════════════════════════════════════════════ */}
{/* ═══════════════════════════════════════════════════════════════
                 COMMENTS / NOTES MODAL
            ═══════════════════════════════════════════════════════════════ */}
            <Modal
                title={
                    <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                        <CommentOutlined style={{ color: "#1B3363" }} />
                        <span>
                            Notes & Comments - {selectedRecordForComment?.employee_name} ({selectedRecordForComment?.date})
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
                        key="save"
                        type="primary"
                        loading={submittingComment}
                        onClick={handleAddComment}
                        style={{ background: "#1B3363", borderColor: "#1B3363" }}
                    >
                        Add Admin Note
                    </Button>,
                ]}
            >
                {selectedRecordForComment?.comments && selectedRecordForComment.comments.length > 0 ? (
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
                                            {dayjs(c.created_at).format("DD MMM YYYY, hh:mm A")}
                                        </div>
                                    </div>
                                ),
                            }))}
                        />
                    </div>
                ) : (
                    <div style={{ color: "#94A3B8", fontSize: 13, marginBottom: 16 }}>
                        No previous comments found for this date.
                    </div>
                )}

                <div>
                    <div style={{ fontSize: 13, fontWeight: 600, color: "#1E293B", marginBottom: 6 }}>
                        Add Admin Remark:
                    </div>
                    <TextArea
                        rows={3}
                        placeholder="Add admin remarks (e.g. Permission verified, On duty approved)..."
                        value={newCommentText}
                        onChange={(e) => setNewCommentText(e.target.value)}
                    />
                </div>
            </Modal>

            {/* ═══════════════════════════════════════════════════════════════
                 ADMIN DECISION MODAL (APPROVE / REJECT ATTENDANCE CORRECTION)
            ═══════════════════════════════════════════════════════════════ */}
            <Modal
                title={
                    <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                        {decisionType === "approve" ? (
                            <CheckCircleOutlined style={{ color: "#10B981", fontSize: 18 }} />
                        ) : (
                            <CloseCircleOutlined style={{ color: "#EF4444", fontSize: 18 }} />
                        )}
                        <span>
                            {decisionType === "approve" ? "Approve Time Correction" : "Reject Time Correction"}
                        </span>
                    </div>
                }
                open={decisionModalOpen}
                onCancel={() => setDecisionModalOpen(false)}
                footer={[
                    <Button key="cancel" onClick={() => setDecisionModalOpen(false)}>
                        Cancel
                    </Button>,
                    <Button
                        key="submit"
                        type="primary"
                        danger={decisionType === "reject"}
                        loading={submittingDecision}
                        onClick={handleDecideCorrection}
                        style={
                            decisionType === "approve"
                                ? { background: "#10B981", borderColor: "#10B981", fontWeight: 600 }
                                : { fontWeight: 600 }
                        }
                    >
                        {decisionType === "approve" ? "Confirm & Update Database" : "Confirm Rejection"}
                    </Button>,
                ]}
            >
                {decisionTarget && (
                    <div style={{ padding: "10px 0" }}>
                        <div
                            style={{
                                background: "#F8FAFC",
                                border: "1px solid #E2E8F0",
                                borderRadius: 10,
                                padding: "14px",
                                marginBottom: 14,
                            }}
                        >
                            <div style={{ fontSize: 14, fontWeight: 700, color: "#1E293B", marginBottom: 6 }}>
                                {decisionTarget.employee_name} ({decisionTarget.department || "Employee"})
                            </div>
                            <div style={{ fontSize: 12, color: "#64748B", marginBottom: 10 }}>
                                Date: <strong>{dayjs(decisionTarget.date).format("dddd, DD MMMM YYYY")}</strong> | Type:{" "}
                                <strong>{decisionTarget.request_type === "in_time" ? "Check In" : "Check Out"}</strong>
                            </div>

                            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginBottom: 10 }}>
                                <div style={{ background: "#FFFFFF", padding: "10px", borderRadius: 8, border: "1px solid #CBD5E1" }}>
                                    <div style={{ fontSize: 11, color: "#64748B", textTransform: "uppercase" }}>System Time</div>
                                    <div style={{ fontSize: 16, fontWeight: 700, color: "#475569", fontFamily: "monospace" }}>
                                        {decisionTarget.system_time_formatted || decisionTarget.system_time || "Not Recorded"}
                                    </div>
                                </div>
                                <div style={{ background: "#FFFFFF", padding: "10px", borderRadius: 8, border: "2px solid #2563EB" }}>
                                    <div style={{ fontSize: 11, color: "#2563EB", textTransform: "uppercase", fontWeight: 700 }}>Requested Time (24h)</div>
                                    <div style={{ fontSize: 16, fontWeight: 700, color: "#0F172A", fontFamily: "monospace" }}>
                                        {decisionTarget.requested_time_formatted || decisionTarget.requested_time}
                                    </div>
                                </div>
                            </div>

                            <div style={{ fontSize: 12, color: "#334155", marginBottom: 8 }}>
                                <strong>Reason:</strong> {decisionTarget.reason}
                                {decisionTarget.custom_reason && ` - ${decisionTarget.custom_reason}`}
                            </div>

                            {decisionTarget.proof_screenshot_url && (
                                <div style={{ marginTop: 8 }}>
                                    <div style={{ fontSize: 11, color: "#64748B", marginBottom: 4 }}>TimeChamp Proof Screenshot:</div>
                                    <img
                                        src={decisionTarget.proof_screenshot_url}
                                        alt="Proof"
                                        onClick={() => {
                                            setPreviewImageSrc(decisionTarget.proof_screenshot_url!);
                                            setPreviewImageOpen(true);
                                        }}
                                        style={{
                                            maxHeight: 120,
                                            maxWidth: "100%",
                                            borderRadius: 6,
                                            border: "1px solid #CBD5E1",
                                            cursor: "zoom-in",
                                        }}
                                    />
                                </div>
                            )}
                        </div>

                        {decisionType === "approve" ? (
                            <div style={{ fontSize: 13, color: "#059669", marginBottom: 12 }}>
                                ✅ Approving this request will update the attendance database record to <strong>{decisionTarget.requested_time}</strong> and recalculate working hours and status.
                            </div>
                        ) : (
                            <div style={{ fontSize: 13, color: "#DC2626", marginBottom: 12 }}>
                                ⚠️ Rejecting this request will NOT change the attendance database record. Original system time remains untouched.
                            </div>
                        )}

                        <div>
                            <div style={{ fontSize: 13, fontWeight: 600, color: "#1E293B", marginBottom: 6 }}>
                                Admin Notes / Feedback (optional):
                            </div>
                            <TextArea
                                rows={2}
                                placeholder="Add notes for the employee..."
                                value={decisionAdminNotes}
                                onChange={(e) => setDecisionAdminNotes(e.target.value)}
                            />
                        </div>
                    </div>
                )}
            </Modal>

            {/* Proof Zoom Preview Modal */}
            <Modal
                open={previewImageOpen}
                footer={null}
                onCancel={() => setPreviewImageOpen(false)}
                width={700}
                centered
            >
                <img
                    src={previewImageSrc}
                    alt="Proof Preview Large"
                    style={{ width: "100%", maxHeight: "80vh", objectFit: "contain", marginTop: 16 }}
                />
            </Modal>
        </div>
    );
}
