import { useState } from "react";
import { Modal, Button, Upload, Table, Tag, message, Alert } from "antd";
import {
    DownloadOutlined,
    UploadOutlined,
    FileExcelOutlined,
    CheckCircleOutlined,
    CloseCircleOutlined,
} from "@ant-design/icons";
import * as XLSX from "xlsx";
import dayjs from "dayjs";

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

interface Employee {
    id: number;
    name: string;
    department?: string;
    email?: string;
}

interface Department {
    id: string;
    name: string;
}

interface Admin {
    id: number;
    name: string;
}

interface ParsedTask {
    key: number;
    project_name: string;
    task_name: string;
    task_details: string;
    department: string;
    assignee_name: string;
    assigned_to_id: number | null;
    assigned_to_admin_id?: number | null;
    priority: "low" | "medium" | "high" | "urgent";
    allotted_hours: number;
    allotted_minutes: number;
    allotted_time: number;
    start_date: string;
    due_date: string;
    due_time: string | null;
    isValid: boolean;
    errorMsg?: string;
}

interface Props {
    open: boolean;
    onClose: () => void;
    onSuccess: () => void;
    departments: Department[];
    employees: Employee[];
    admins?: Admin[];
}

export default function BulkUploadTasksModal({ open, onClose, onSuccess, departments, employees, admins }: Props) {
    const [parsedTasks, setParsedTasks] = useState<ParsedTask[]>([]);
    const [uploading, setUploading] = useState(false);
    const [fileName, setFileName] = useState<string | null>(null);

    // ─────────────────────────────────────────────────────────────
    // 1. Download Excel Template
    // ─────────────────────────────────────────────────────────────
    const handleDownloadTemplate = () => {
        const emp1 = employees[0] || { name: "Uma", department: "Tech" };
        const dept1 = emp1.department || departments[0]?.name || "Tech";
        const emp2 = employees[1] || emp1;
        const dept2 = emp2.department || dept1;

        const headers = [
            "Project Name",
            "Task Name",
            "Task Details",
            "Department",
            "Assign To",
            "Priority",
            "Allotted Hours",
            "Allotted Minutes",
            "Start Date",
            "Due Date",
            "Deadline Time",
        ];

        const sampleRows = [
            [
                "Website Revamp",
                "Hero Section Design",
                "Create modern responsive hero section in Figma",
                dept1,
                emp1.name,
                "High",
                1,
                30,
                dayjs().format("YYYY-MM-DD"),
                dayjs().format("YYYY-MM-DD"),
                "03:00 PM",
            ],
            [
                "HRMS Portal",
                "Bug Fixes in Attendance",
                "Resolve edge cases when timer is paused",
                dept2,
                emp2.name,
                "Medium",
                0,
                45,
                dayjs().format("YYYY-MM-DD"),
                dayjs().format("YYYY-MM-DD"),
                "05:30 PM",
            ],
        ];

        const ws = XLSX.utils.aoa_to_sheet([headers, ...sampleRows]);

        // Auto-fit column widths
        ws["!cols"] = [
            { wch: 20 }, // Project Name
            { wch: 24 }, // Task Name
            { wch: 35 }, // Task Details
            { wch: 18 }, // Department
            { wch: 18 }, // Assign To
            { wch: 12 }, // Priority
            { wch: 14 }, // Allotted Hours
            { wch: 16 }, // Allotted Minutes
            { wch: 14 }, // Start Date
            { wch: 14 }, // Due Date
            { wch: 14 }, // Deadline Time
        ];

        const wb = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(wb, ws, "Tasks Template");
        XLSX.writeFile(wb, "task_bulk_upload_template.xlsx");
        message.success("Template downloaded successfully");
    };

    // ─────────────────────────────────────────────────────────────
    // 2. Parse Uploaded Excel File
    // ─────────────────────────────────────────────────────────────
    const handleFileParse = (file: File) => {
        setFileName(file.name);
        const reader = new FileReader();

        reader.onload = (e) => {
            try {
                const data = new Uint8Array(e.target?.result as ArrayBuffer);
                const workbook = XLSX.read(data, { type: "array" });
                const firstSheet = workbook.Sheets[workbook.SheetNames[0]];
                const rawRows: Record<string, any>[] = XLSX.utils.sheet_to_json(firstSheet, { defval: "" });

                if (rawRows.length === 0) {
                    message.error("The uploaded Excel file contains no data rows.");
                    setParsedTasks([]);
                    return;
                }

                const tasks: ParsedTask[] = rawRows.map((row, idx) => {
                    const projectName = String(row["Project Name"] || row["Project"] || "").trim();
                    const taskName = String(row["Task Name"] || row["Task"] || "").trim();
                    const taskDetails = String(row["Task Details"] || row["Details"] || "").trim();
                    const department = String(row["Department"] || row["Dept"] || "").trim();
                    const assignToName = String(row["Assign To"] || row["Assigned To"] || row["Employee"] || "").trim();

                    const rawPriority = String(row["Priority"] || "medium").trim().toLowerCase();
                    const priority: "low" | "medium" | "high" | "urgent" = ["low", "medium", "high", "urgent"].includes(rawPriority)
                        ? (rawPriority as any)
                        : "medium";

                    const allottedHours = Number(row["Allotted Hours"] || row["Hours"] || 0);
                    const allottedMinutes = Number(row["Allotted Minutes"] || row["Minutes"] || 0);
                    const totalMinutes = allottedHours * 60 + allottedMinutes;
                    const allottedTime = Math.round((totalMinutes / 60) * 100) / 100;

                    // 1. Match Department from backend departments list (case-insensitive)
                    const matchedDepartment = departments.find(
                        (d) => d.name.trim().toLowerCase() === department.toLowerCase()
                    );

                    // 2. Match Employee by name or email (case-insensitive)
                    const matchedEmployee = employees.find(
                        (emp) =>
                            emp.name.trim().toLowerCase() === assignToName.toLowerCase() ||
                            emp.email?.trim().toLowerCase() === assignToName.toLowerCase()
                    );

                    // 3. Match Admin by name if employee was not matched and admins list was provided
                    const matchedAdmin = (!matchedEmployee && admins)
                        ? admins.find((a) => a.name.trim().toLowerCase() === assignToName.toLowerCase())
                        : null;

                    // Parse dates
                    const rawStartDate = row["Start Date"];
                    const startDateObj = rawStartDate ? dayjs(rawStartDate) : dayjs();
                    const startDateStr = startDateObj.isValid() ? startDateObj.format("YYYY-MM-DD") : dayjs().format("YYYY-MM-DD");

                    let dueDateStr = "";
                    const rawDueDate = row["Due Date"];
                    if (rawDueDate && dayjs(rawDueDate).isValid()) {
                        dueDateStr = dayjs(rawDueDate).format("YYYY-MM-DD");
                    } else {
                        // Auto-calculate from duration
                        dueDateStr = startDateObj.add(totalMinutes || 60, "minute").format("YYYY-MM-DD");
                    }

                    // Deadline time
                    let dueTimeStr: string | null = null;
                    const rawDueTime = String(row["Deadline Time"] || "").trim();
                    if (rawDueTime) {
                        const parsedTime = dayjs(`${startDateStr} ${rawDueTime}`);
                        if (parsedTime.isValid()) {
                            dueTimeStr = parsedTime.format("HH:mm:ss");
                        }
                    }

                    // Strict Backend Validation checks
                    let isValid = true;
                    let errorMsg = "";

                    if (!projectName) {
                        isValid = false;
                        errorMsg = "Project Name missing";
                    } else if (!taskName) {
                        isValid = false;
                        errorMsg = "Task Name missing";
                    } else if (!assignToName) {
                        isValid = false;
                        errorMsg = "Assign To missing in Excel";
                    } else if (!matchedEmployee && !matchedAdmin) {
                        isValid = false;
                        errorMsg = `Assignee "${assignToName}" not found in backend`;
                    } else if (matchedEmployee) {
                        if (!department) {
                            isValid = false;
                            errorMsg = "Department missing in Excel";
                        } else if (!matchedDepartment) {
                            isValid = false;
                            errorMsg = `Department "${department}" not found in backend`;
                        } else if (
                            matchedEmployee.department &&
                            matchedDepartment &&
                            matchedEmployee.department.trim().toLowerCase() !== matchedDepartment.name.trim().toLowerCase()
                        ) {
                            isValid = false;
                            errorMsg = `"${matchedEmployee.name}" belongs to "${matchedEmployee.department}", not "${matchedDepartment.name}"`;
                        }
                    }

                    if (isValid && totalMinutes <= 0) {
                        isValid = false;
                        errorMsg = "Duration must be > 0";
                    }

                    return {
                        key: idx + 1,
                        project_name: projectName,
                        task_name: taskName,
                        task_details: taskDetails,
                        department: matchedAdmin ? "" : (matchedDepartment ? matchedDepartment.name : department),
                        assignee_name: matchedEmployee ? matchedEmployee.name : (matchedAdmin ? matchedAdmin.name : assignToName),
                        assigned_to_id: matchedEmployee ? matchedEmployee.id : null,
                        assigned_to_admin_id: matchedAdmin ? matchedAdmin.id : null,
                        priority,
                        allotted_hours: allottedHours,
                        allotted_minutes: allottedMinutes,
                        allotted_time: allottedTime,
                        start_date: startDateStr,
                        due_date: dueDateStr,
                        due_time: dueTimeStr,
                        isValid,
                        errorMsg,
                    };
                });

                setParsedTasks(tasks);
            } catch {
                message.error("Failed to read the Excel file. Please use the standard template.");
            }
        };

        reader.readAsArrayBuffer(file);
        return false; // Prevent automatic HTTP upload by Antd
    };

    // ─────────────────────────────────────────────────────────────
    // 3. Confirm & Bulk Create
    // ─────────────────────────────────────────────────────────────
    const handleConfirmCreate = async () => {
        const validTasks = parsedTasks.filter((t) => t.isValid && (t.assigned_to_id || t.assigned_to_admin_id));

        if (validTasks.length === 0) {
            message.error("No valid tasks to create. Please correct the file and try again.");
            return;
        }

        setUploading(true);
        let successCount = 0;
        let failCount = 0;

        for (const task of validTasks) {
            try {
                const body: Record<string, any> = {
                    project_name: task.project_name,
                    task_name: task.task_name,
                    task_details: task.task_details,
                    priority: task.priority,
                    start_date: task.start_date,
                    due_date: task.due_date,
                    due_time: task.due_time,
                    allotted_time: task.allotted_time,
                };

                if (task.assigned_to_admin_id) {
                    body.assigned_to_admin = task.assigned_to_admin_id;
                    body.department = "";
                } else {
                    body.assigned_to = task.assigned_to_id;
                    body.department = task.department;
                }

                const res = await fetch(`${BASE_URL}/api/tasks/create_and_assign/`, {
                    method: "POST",
                    headers: { "Content-Type": "application/json", ...authHeaders() },
                    body: JSON.stringify(body),
                });

                if (res.ok) {
                    successCount++;
                } else {
                    failCount++;
                }
            } catch {
                failCount++;
            }
        }

        setUploading(false);

        if (successCount > 0) {
            message.success(`Successfully created ${successCount} tasks!`);
            onSuccess();
            handleClose();
        }

        if (failCount > 0) {
            message.warning(`${failCount} tasks failed to create.`);
        }
    };

    const handleClose = () => {
        setParsedTasks([]);
        setFileName(null);
        onClose();
    };

    const validCount = parsedTasks.filter((t) => t.isValid).length;
    const invalidCount = parsedTasks.length - validCount;

    return (
        <Modal
            open={open}
            onCancel={handleClose}
            title={
                <span style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 16 }}>
                    <FileExcelOutlined style={{ color: "#52c41a" }} /> Bulk Upload Tasks
                </span>
            }
            width={860}
            centered
            destroyOnClose
            footer={[
                <Button key="cancel" onClick={handleClose}>
                    Cancel
                </Button>,
                <Button
                    key="submit"
                    type="primary"
                    loading={uploading}
                    disabled={validCount === 0}
                    onClick={handleConfirmCreate}
                    style={{ background: "var(--accent)", border: "none" }}
                >
                    Create {validCount} Tasks
                </Button>,
            ]}
        >
            <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
                {/* Download Template Banner */}
                <div
                    style={{
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "space-between",
                        padding: "12px 16px",
                        background: "#f6ffed",
                        border: "1px solid #b7eb8f",
                        borderRadius: 8,
                    }}
                >
                    <div>
                        <div style={{ fontWeight: 600, color: "#389e0d", fontSize: 13 }}>
                            Download Standard Excel Template
                        </div>
                        <div style={{ fontSize: 11.5, color: "#595959", marginTop: 2 }}>
                            Use this template with pre-configured column headers and sample data.
                        </div>
                    </div>
                    <Button
                        icon={<DownloadOutlined />}
                        onClick={handleDownloadTemplate}
                        style={{ borderColor: "#52c41a", color: "#389e0d", fontWeight: 600 }}
                    >
                        Download Template (.xlsx)
                    </Button>
                </div>

                {/* Upload Area */}
                <Upload.Dragger
                    accept=".xlsx, .xls"
                    beforeUpload={handleFileParse}
                    showUploadList={false}
                    maxCount={1}
                    style={{ padding: "16px", background: "#fafafa" }}
                >
                    <p className="ant-upload-drag-icon">
                        <UploadOutlined style={{ fontSize: 32, color: "#1677ff" }} />
                    </p>
                    <p className="ant-upload-text" style={{ fontSize: 13, fontWeight: 600 }}>
                        {fileName ? `Loaded: ${fileName}` : "Click or drag an Excel file (.xlsx) here to upload"}
                    </p>
                    <p className="ant-upload-hint" style={{ fontSize: 11, color: "#8c8c8c" }}>
                        Supports single-sheet Excel files containing the template headers.
                    </p>
                </Upload.Dragger>

                {/* Summary Alert */}
                {parsedTasks.length > 0 && (
                    <Alert
                        message={
                            <div style={{ display: "flex", gap: 16, fontSize: 12 }}>
                                <span>Total rows: <b>{parsedTasks.length}</b></span>
                                <span style={{ color: "#389e0d" }}>Ready: <b>{validCount}</b></span>
                                {invalidCount > 0 && (
                                    <span style={{ color: "#cf1322" }}>Errors: <b>{invalidCount}</b></span>
                                )}
                            </div>
                        }
                        type={invalidCount > 0 ? "warning" : "success"}
                        showIcon
                    />
                )}

                {/* Preview Table */}
                {parsedTasks.length > 0 && (
                    <Table
                        dataSource={parsedTasks}
                        size="small"
                        pagination={{ pageSize: 5 }}
                        scroll={{ x: 880 }}
                        columns={[
                            {
                                title: "Status",
                                key: "status",
                                width: 95,
                                fixed: "left",
                                render: (_, row) =>
                                    row.isValid ? (
                                        <Tag icon={<CheckCircleOutlined />} color="success">
                                            Valid
                                        </Tag>
                                    ) : (
                                        <Tag icon={<CloseCircleOutlined />} color="error">
                                            Invalid
                                        </Tag>
                                    ),
                            },
                            {
                                title: "Validation Note",
                                key: "validation_note",
                                width: 220,
                                render: (_, row) =>
                                    row.isValid ? (
                                        <span style={{ color: "#389e0d", fontSize: 12 }}>Ready to create</span>
                                    ) : (
                                        <span style={{ color: "#cf1322", fontSize: 12, fontWeight: 500 }}>
                                            {row.errorMsg}
                                        </span>
                                    ),
                            },
                            { title: "Project", dataIndex: "project_name", key: "project_name", width: 130 },
                            { title: "Task Name", dataIndex: "task_name", key: "task_name", width: 140 },
                            {
                                title: "Department",
                                dataIndex: "department",
                                key: "department",
                                width: 130,
                                render: (v: string) => v ? v : <span style={{ color: "#8c8c8c" }}>—</span>,
                            },
                            {
                                title: "Assign To",
                                dataIndex: "assignee_name",
                                key: "assignee_name",
                                width: 130,
                                render: (v: string, row: ParsedTask) => (
                                    <span>
                                        {v}
                                        {row.assigned_to_admin_id ? (
                                            <Tag color="purple" style={{ marginLeft: 6, fontSize: 10, lineHeight: "16px", padding: "0 4px" }}>
                                                Admin
                                            </Tag>
                                        ) : null}
                                    </span>
                                ),
                            },
                            {
                                title: "Priority",
                                dataIndex: "priority",
                                key: "priority",
                                width: 90,
                                render: (v: string) => <Tag>{v.toUpperCase()}</Tag>,
                            },
                            {
                                title: "Duration",
                                key: "duration",
                                width: 100,
                                render: (_, r) => `${r.allotted_hours}h ${r.allotted_minutes}m`,
                            },
                            { title: "Start Date", dataIndex: "start_date", key: "start_date", width: 110 },
                            { title: "Due Date", dataIndex: "due_date", key: "due_date", width: 110 },
                        ]}
                    />
                )}
            </div>
        </Modal>
    );
}