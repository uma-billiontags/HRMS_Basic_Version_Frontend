import { useState, useEffect, useMemo } from "react";
import {
    Modal,
    Button,
    Upload,
    Table,
    Tag,
    message,
    Input,
    Select,
    InputNumber,
    Space,
} from "antd";
import {
    DownloadOutlined,
    UploadOutlined,
    FileExcelOutlined,
    CheckCircleOutlined,
    CloseCircleOutlined,
    CheckCircleFilled,
    PlusOutlined,
    DeleteOutlined,
    ArrowLeftOutlined,
    CopyOutlined,
    LinkOutlined,
    ReloadOutlined,
    EyeOutlined,
} from "@ant-design/icons";
import * as XLSX from "xlsx";
import dayjs from "dayjs";

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

export interface SheetRow {
    key: string;
    project_name: string;
    task_name: string;
    task_details: string;
    department: string;
    assignee_name: string;
    priority: "low" | "medium" | "high" | "urgent";
    allotted_hours: number;
    allotted_minutes: number;
    start_date: string;
    due_date: string;
    due_time?: string;
}

interface ParsedTask {
    key: string;
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

export default function BulkUploadTasksModal({
    open,
    onClose,
    onSuccess,
    departments,
    employees,
    admins = [],
}: Props) {
    const [viewMode, setViewMode] = useState<"sheet" | "preview">("sheet");
    const [sheetRows, setSheetRows] = useState<SheetRow[]>([]);
    const [parsedTasks, setParsedTasks] = useState<ParsedTask[]>([]);
    const [selectedRowKeys, setSelectedRowKeys] = useState<React.Key[]>([]);
    const [uploading, setUploading] = useState(false);

    // Modals for external data insertion
    const [pasteModalOpen, setPasteModalOpen] = useState(false);
    const [pasteText, setPasteText] = useState("");
    const [linkModalOpen, setLinkModalOpen] = useState(false);
    const [sheetUrl, setSheetUrl] = useState("");
    const [fetchingUrl, setFetchingUrl] = useState(false);

    // ─────────────────────────────────────────────────────────────
    // Initial Sample Dummy Data (Matches user requirement)
    // ─────────────────────────────────────────────────────────────
    const getInitialSampleRows = (): SheetRow[] => {
        const emp1 = employees[0] || { name: "Kannan JS", department: "Creative Design" };
        const dept1 = emp1.department || departments[0]?.name || "Creative Design";
        const emp2 = employees[1] || emp1;
        const dept2 = emp2.department || dept1;
        const today = dayjs().format("YYYY-MM-DD");

        return [
            {
                key: `row-${Date.now()}-1`,
                project_name: "Website Revamp",
                task_name: "Hero Section Design",
                task_details: "Create modern responsive hero section in Figma",
                department: dept1,
                assignee_name: emp1.name,
                priority: "high",
                allotted_hours: 1,
                allotted_minutes: 30,
                start_date: today,
                due_date: today,
                due_time: "15:00:00",
            },
            {
                key: `row-${Date.now()}-2`,
                project_name: "HRMS Portal",
                task_name: "Bug Fixes in Attendance",
                task_details: "Resolve edge cases when timer is paused",
                department: dept2,
                assignee_name: emp2.name,
                priority: "medium",
                allotted_hours: 0,
                allotted_minutes: 45,
                start_date: today,
                due_date: today,
                due_time: "17:30:00",
            },
        ];
    };

    // Initialize or reset sample rows whenever modal opens
    useEffect(() => {
        if (open) {
            setViewMode("sheet");
            setSheetRows(getInitialSampleRows());
            setParsedTasks([]);
            setSelectedRowKeys([]);
        }
    }, [open]);

    // ─────────────────────────────────────────────────────────────
    // Sheet Row Manipulation
    // ─────────────────────────────────────────────────────────────
    const handleAddRow = () => {
        const today = dayjs().format("YYYY-MM-DD");
        const defaultDept = departments[0]?.name || "";
        const newRow: SheetRow = {
            key: `row-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`,
            project_name: "",
            task_name: "",
            task_details: "",
            department: defaultDept,
            assignee_name: "",
            priority: "medium",
            allotted_hours: 1,
            allotted_minutes: 0,
            start_date: today,
            due_date: today,
        };
        setSheetRows((prev) => [...prev, newRow]);
    };

    const handleUpdateRow = (key: string, field: keyof SheetRow, value: any) => {
        setSheetRows((prev) =>
            prev.map((r) => {
                if (r.key !== key) return r;
                const updated = { ...r, [field]: value };

                // Auto-fill department if user selected an employee
                if (field === "assignee_name") {
                    const matchedEmp = employees.find(
                        (emp) => emp.name.trim().toLowerCase() === String(value).trim().toLowerCase()
                    );
                    if (matchedEmp?.department) {
                        updated.department = matchedEmp.department;
                    }
                }
                return updated;
            })
        );
    };

    const handleDeleteRow = (key: string) => {
        setSheetRows((prev) => prev.filter((r) => r.key !== key));
    };

    const handleResetSampleData = () => {
        setSheetRows(getInitialSampleRows());
        message.info("Reset to dummy sample data");
    };

    // ─────────────────────────────────────────────────────────────
    // Validate Sheet Data & Switch to Preview Mode
    // ─────────────────────────────────────────────────────────────
    const handleValidateAndPreview = () => {
        if (sheetRows.length === 0) {
            message.warning("Please add at least one task row in the sheet.");
            return;
        }

        const tasks: ParsedTask[] = sheetRows.map((row) => {
            const projectName = (row.project_name || "").trim();
            const taskName = (row.task_name || "").trim();
            const taskDetails = (row.task_details || "").trim();
            const department = (row.department || "").trim();
            const assignToName = (row.assignee_name || "").trim();

            const priority = row.priority || "medium";
            const allottedHours = Number(row.allotted_hours || 0);
            const allottedMinutes = Number(row.allotted_minutes || 0);
            const totalMinutes = allottedHours * 60 + allottedMinutes;
            const allottedTime = Math.round((totalMinutes / 60) * 100) / 100;

            const matchedDepartment = departments.find(
                (d) => d.name.trim().toLowerCase() === department.toLowerCase()
            );

            const matchedEmployee = employees.find(
                (emp) =>
                    emp.name.trim().toLowerCase() === assignToName.toLowerCase() ||
                    emp.email?.trim().toLowerCase() === assignToName.toLowerCase()
            );

            const matchedAdmin = (!matchedEmployee && admins)
                ? admins.find((a) => a.name.trim().toLowerCase() === assignToName.toLowerCase())
                : null;

            const startDateStr = row.start_date || dayjs().format("YYYY-MM-DD");
            let dueDateStr = row.due_date;
            if (!dueDateStr) {
                dueDateStr = dayjs(startDateStr).add(totalMinutes || 60, "minute").format("YYYY-MM-DD");
            }

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
                errorMsg = "Assign To missing";
            } else if (!matchedEmployee && !matchedAdmin) {
                isValid = false;
                errorMsg = `Assignee "${assignToName}" not found in system`;
            } else if (matchedEmployee) {
                if (!department) {
                    isValid = false;
                    errorMsg = "Department missing";
                } else if (!matchedDepartment) {
                    isValid = false;
                    errorMsg = `Department "${department}" not found`;
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
                key: row.key,
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
                due_time: row.due_time || null,
                isValid,
                errorMsg,
            };
        });

        setParsedTasks(tasks);
        // By default, select all valid rows
        const validKeys = tasks.filter((t) => t.isValid).map((t) => t.key);
        setSelectedRowKeys(validKeys);
        setViewMode("preview");
    };

    // ─────────────────────────────────────────────────────────────
    // Direct Paste from Google Sheets / Excel (TSV / CSV)
    // ─────────────────────────────────────────────────────────────
    const handlePasteImport = () => {
        if (!pasteText.trim()) {
            message.warning("Please paste some spreadsheet data first.");
            return;
        }

        const lines = pasteText.trim().split(/\r?\n/).filter((l) => l.trim().length > 0);
        if (lines.length === 0) {
            message.warning("No data found in pasted text.");
            return;
        }

        const today = dayjs().format("YYYY-MM-DD");
        const newRows: SheetRow[] = [];

        lines.forEach((line, idx) => {
            const cols = line.includes("\t") ? line.split("\t") : line.split(",");
            const cleanCols = cols.map((c) => c.trim().replace(/^"|"$/g, ""));

            // Skip header line if detected
            const lower0 = cleanCols[0]?.toLowerCase() || "";
            const lower1 = cleanCols[1]?.toLowerCase() || "";
            if (
                idx === 0 &&
                (lower0.includes("project") || lower1.includes("task") || lower0.includes("header"))
            ) {
                return;
            }

            const projectName = cleanCols[0] || "Website Revamp";
            const taskName = cleanCols[1] || "";
            if (!taskName && !cleanCols[0]) return; // empty row

            const taskDetails = cleanCols[2] || "";
            const department = cleanCols[3] || departments[0]?.name || "";
            const assignee = cleanCols[4] || employees[0]?.name || "";
            const rawPriority = (cleanCols[5] || "medium").toLowerCase();
            const priority: "low" | "medium" | "high" | "urgent" = ["low", "medium", "high", "urgent"].includes(rawPriority)
                ? (rawPriority as any)
                : "medium";
            const hours = Number(cleanCols[6] || 1);
            const mins = Number(cleanCols[7] || 0);
            const startDate = cleanCols[8] || today;
            const dueDate = cleanCols[9] || startDate;

            newRows.push({
                key: `paste-${Date.now()}-${idx}-${Math.random().toString(36).substring(2, 5)}`,
                project_name: projectName,
                task_name: taskName,
                task_details: taskDetails,
                department,
                assignee_name: assignee,
                priority,
                allotted_hours: isNaN(hours) ? 1 : hours,
                allotted_minutes: isNaN(mins) ? 0 : mins,
                start_date: startDate,
                due_date: dueDate,
            });
        });

        if (newRows.length === 0) {
            message.warning("Could not parse rows from pasted text.");
            return;
        }

        setSheetRows((prev) => [...prev, ...newRows]);
        setPasteText("");
        setPasteModalOpen(false);
        message.success(`Successfully added ${newRows.length} row(s) from clipboard!`);
    };

    // ─────────────────────────────────────────────────────────────
    // Import via Google Sheet URL
    // ─────────────────────────────────────────────────────────────
    const handleGoogleSheetLinkImport = async () => {
        if (!sheetUrl.trim()) {
            message.warning("Please enter a Google Sheet URL.");
            return;
        }

        const match = sheetUrl.match(/spreadsheets\/d\/([a-zA-Z0-9-_]+)/);
        if (!match || !match[1]) {
            message.error("Invalid Google Sheet link. It should look like: https://docs.google.com/spreadsheets/d/.../edit");
            return;
        }

        const sheetId = match[1];
        const csvUrl = `https://docs.google.com/spreadsheets/d/${sheetId}/gviz/tq?tqx=out:csv`;

        setFetchingUrl(true);
        try {
            const resp = await fetch(csvUrl);
            if (!resp.ok) {
                throw new Error("Failed to fetch sheet data. Make sure the Google Sheet is shared as 'Anyone with link can view'.");
            }
            const csvText = await resp.text();
            const workbook = XLSX.read(csvText, { type: "string" });
            const sheet = workbook.Sheets[workbook.SheetNames[0]];
            const rawRows: Record<string, any>[] = XLSX.utils.sheet_to_json(sheet, { defval: "" });

            if (rawRows.length === 0) {
                message.warning("Google Sheet was loaded but no data rows were found.");
                return;
            }

            const today = dayjs().format("YYYY-MM-DD");
            const newRows: SheetRow[] = rawRows.map((r, i) => {
                const proj = String(r["Project Name"] || r["Project"] || r["project_name"] || Object.values(r)[0] || "").trim();
                const task = String(r["Task Name"] || r["Task"] || r["task_name"] || Object.values(r)[1] || "").trim();
                const details = String(r["Task Details"] || r["Details"] || r["task_details"] || Object.values(r)[2] || "").trim();
                const dept = String(r["Department"] || r["Dept"] || r["department"] || Object.values(r)[3] || "").trim();
                const assignee = String(r["Assign To"] || r["Assigned To"] || r["Employee"] || Object.values(r)[4] || "").trim();
                const rawPri = String(r["Priority"] || Object.values(r)[5] || "medium").toLowerCase().trim();
                const priority: "low" | "medium" | "high" | "urgent" = ["low", "medium", "high", "urgent"].includes(rawPri)
                    ? (rawPri as any)
                    : "medium";
                const hrs = Number(r["Allotted Hours"] || r["Hours"] || 1);
                const mins = Number(r["Allotted Minutes"] || r["Minutes"] || 0);

                return {
                    key: `gsheet-${Date.now()}-${i}`,
                    project_name: proj || "Website Revamp",
                    task_name: task || "New Task",
                    task_details: details,
                    department: dept || departments[0]?.name || "",
                    assignee_name: assignee || employees[0]?.name || "",
                    priority,
                    allotted_hours: isNaN(hrs) ? 1 : hrs,
                    allotted_minutes: isNaN(mins) ? 0 : mins,
                    start_date: today,
                    due_date: today,
                };
            });

            setSheetRows(newRows);
            setLinkModalOpen(false);
            setSheetUrl("");
            message.success(`Successfully imported ${newRows.length} row(s) from Google Sheet!`);
        } catch (err: any) {
            message.error(err.message || "Failed to load Google Sheet. Ensure sheet permission is 'Anyone with link can view'.");
        } finally {
            setFetchingUrl(false);
        }
    };

    // ─────────────────────────────────────────────────────────────
    // Optional File Parse (XLSX / CSV file upload fallback)
    // ─────────────────────────────────────────────────────────────
    const handleFileParse = (file: File) => {
        const reader = new FileReader();
        reader.onload = (e) => {
            try {
                const data = new Uint8Array(e.target?.result as ArrayBuffer);
                const workbook = XLSX.read(data, { type: "array" });
                const firstSheet = workbook.Sheets[workbook.SheetNames[0]];
                const rawRows: Record<string, any>[] = XLSX.utils.sheet_to_json(firstSheet, { defval: "" });

                if (rawRows.length === 0) {
                    message.error("The uploaded file contains no data rows.");
                    return;
                }

                const today = dayjs().format("YYYY-MM-DD");
                const newRows: SheetRow[] = rawRows.map((row, idx) => ({
                    key: `file-${Date.now()}-${idx}`,
                    project_name: String(row["Project Name"] || row["Project"] || "").trim(),
                    task_name: String(row["Task Name"] || row["Task"] || "").trim(),
                    task_details: String(row["Task Details"] || row["Details"] || "").trim(),
                    department: String(row["Department"] || row["Dept"] || "").trim(),
                    assignee_name: String(row["Assign To"] || row["Assigned To"] || row["Employee"] || "").trim(),
                    priority: (["low", "medium", "high", "urgent"].includes(String(row["Priority"] || "").toLowerCase())
                        ? String(row["Priority"]).toLowerCase()
                        : "medium") as any,
                    allotted_hours: Number(row["Allotted Hours"] || row["Hours"] || 1),
                    allotted_minutes: Number(row["Allotted Minutes"] || row["Minutes"] || 0),
                    start_date: row["Start Date"] ? dayjs(row["Start Date"]).format("YYYY-MM-DD") : today,
                    due_date: row["Due Date"] ? dayjs(row["Due Date"]).format("YYYY-MM-DD") : today,
                }));

                setSheetRows(newRows);
                message.success(`Loaded ${newRows.length} tasks into Google Sheet Editor!`);
            } catch {
                message.error("Failed to read file.");
            }
        };
        reader.readAsArrayBuffer(file);
        return false;
    };

    // ─────────────────────────────────────────────────────────────
    // Download Sample Template (.xlsx)
    // ─────────────────────────────────────────────────────────────
    const handleDownloadTemplate = () => {
        const emp1 = employees[0] || { name: "Kannan JS", department: "Creative Design" };
        const dept1 = emp1.department || departments[0]?.name || "Creative Design";
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
            ],
        ];

        const ws = XLSX.utils.aoa_to_sheet([headers, ...sampleRows]);
        const wb = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(wb, ws, "Tasks Template");
        XLSX.writeFile(wb, "task_bulk_upload_template.xlsx");
        message.success("Standard template downloaded successfully");
    };

    // ─────────────────────────────────────────────────────────────
    // Confirm & Bulk Create Selected Tasks
    // ─────────────────────────────────────────────────────────────
    const handleConfirmCreate = async () => {
        const selectedTasks = parsedTasks.filter(
            (t) => selectedRowKeys.includes(t.key) && t.isValid && (t.assigned_to_id || t.assigned_to_admin_id)
        );

        if (selectedTasks.length === 0) {
            message.warning("No valid tasks selected to create. Please select at least one valid row.");
            return;
        }

        setUploading(true);
        let successCount = 0;
        let failCount = 0;

        for (const task of selectedTasks) {
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
        setViewMode("sheet");
        setParsedTasks([]);
        setSelectedRowKeys([]);
        onClose();
    };

    const validCount = parsedTasks.filter((t) => t.isValid).length;
    const invalidCount = parsedTasks.length - validCount;

    // Dropdown options
    const departmentOptions = useMemo(
        () => departments.map((d) => ({ value: d.name, label: d.name })),
        [departments]
    );

    const assigneeOptions = useMemo(() => {
        const empOpts = employees.map((e) => ({
            value: e.name,
            label: `${e.name} (${e.department || "No Dept"})`,
        }));
        const admOpts = (admins || []).map((a) => ({
            value: a.name,
            label: `${a.name} [Admin]`,
        }));
        return [...empOpts, ...admOpts];
    }, [employees, admins]);

    return (
        <Modal
            open={open}
            onCancel={handleClose}
            title={
                <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                    <div
                        style={{
                            width: 28,
                            height: 28,
                            borderRadius: 6,
                            background: "#0F9D58",
                            display: "flex",
                            alignItems: "center",
                            justifyContent: "center",
                            color: "#fff",
                        }}
                    >
                        <FileExcelOutlined style={{ fontSize: 16 }} />
                    </div>
                    <div>
                        <div style={{ fontSize: 16, fontWeight: 700, color: "#1E293B" }}>
                            {viewMode === "sheet" ? "Google Sheet - Bulk Task Editor" : "Bulk Upload Tasks"}
                        </div>
                        <div style={{ fontSize: 11, color: "#64748B", fontWeight: 400 }}>
                            {viewMode === "sheet"
                                ? "Edit dummy sample data, add more rows, or paste from Google Sheets"
                                : "Review and selectively create validated tasks"}
                        </div>
                    </div>
                </div>
            }
            width={viewMode === "sheet" ? 1120 : 890}
            centered
            destroyOnClose
            footer={
                viewMode === "sheet" ? [
                    <Button key="cancel" onClick={handleClose}>
                        Cancel
                    </Button>,
                    <Button
                        key="validate"
                        type="primary"
                        icon={<EyeOutlined />}
                        onClick={handleValidateAndPreview}
                        style={{ background: "#0F9D58", borderColor: "#0F9D58", fontWeight: 600, height: 36 }}
                    >
                        Save & Preview Tasks ({sheetRows.length} rows) →
                    </Button>,
                ] : [
                    <Button
                        key="back"
                        icon={<ArrowLeftOutlined />}
                        onClick={() => setViewMode("sheet")}
                    >
                        Back to Sheet / Edit
                    </Button>,
                    <Button key="cancel" onClick={handleClose}>
                        Cancel
                    </Button>,
                    <Button
                        key="submit"
                        type="primary"
                        loading={uploading}
                        disabled={selectedRowKeys.length === 0}
                        onClick={handleConfirmCreate}
                        style={{ background: "#1B3363", borderColor: "#1B3363", fontWeight: 600, height: 36 }}
                    >
                        Create {selectedRowKeys.length} Tasks
                    </Button>,
                ]
            }
        >
            {/* ══════════════════════════════════════════════════════════════════
                MODE 1: Google Sheet Editable Grid
               ══════════════════════════════════════════════════════════════════ */}
            {viewMode === "sheet" && (
                <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
                    {/* Top Google Sheet Control Banner */}
                    <div
                        style={{
                            display: "flex",
                            alignItems: "center",
                            justifyContent: "space-between",
                            flexWrap: "wrap",
                            gap: 10,
                            padding: "10px 14px",
                            background: "#F0FDF4",
                            border: "1px solid #BBF7D0",
                            borderRadius: 8,
                        }}
                    >
                        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                            <Tag color="success" style={{ fontWeight: 600, fontSize: 11, borderRadius: 4, margin: 0 }}>
                                Google Sheet Grid
                            </Tag>
                            <span style={{ fontSize: 12, color: "#166534" }}>
                                <b>{sheetRows.length}</b> task rows loaded. Edit cells directly, add rows, or copy-paste from Google Sheets.
                            </span>
                        </div>

                        <Space wrap size={8}>
                            <Button
                                size="small"
                                icon={<PlusOutlined />}
                                onClick={handleAddRow}
                                type="primary"
                                style={{ background: "#0F9D58", borderColor: "#0F9D58", fontWeight: 600 }}
                            >
                                Add Row
                            </Button>
                            <Button
                                size="small"
                                icon={<CopyOutlined />}
                                onClick={() => setPasteModalOpen(true)}
                                style={{ borderColor: "#86EFAC", color: "#166534", fontWeight: 500 }}
                            >
                                Paste from Google Sheets
                            </Button>
                            <Button
                                size="small"
                                icon={<LinkOutlined />}
                                onClick={() => setLinkModalOpen(true)}
                                style={{ borderColor: "#86EFAC", color: "#166534", fontWeight: 500 }}
                            >
                                Google Sheet Link
                            </Button>
                            <Upload
                                accept=".xlsx, .xls, .csv"
                                beforeUpload={handleFileParse}
                                showUploadList={false}
                            >
                                <Button size="small" icon={<UploadOutlined />}>
                                    Upload File
                                </Button>
                            </Upload>
                            <Button
                                size="small"
                                icon={<ReloadOutlined />}
                                onClick={handleResetSampleData}
                                title="Reset to initial dummy sample data"
                            >
                                Reset Sample
                            </Button>
                            <Button
                                size="small"
                                icon={<DownloadOutlined />}
                                onClick={handleDownloadTemplate}
                                type="text"
                                style={{ color: "#15803D", fontSize: 12 }}
                            >
                                Template (.xlsx)
                            </Button>
                        </Space>
                    </div>

                    {/* Interactive Spreadsheet Table */}
                    <div
                        style={{
                            border: "1px solid #E2E8F0",
                            borderRadius: 8,
                            overflow: "hidden",
                            background: "#FFFFFF",
                        }}
                    >
                        <Table
                            dataSource={sheetRows}
                            size="small"
                            pagination={sheetRows.length > 8 ? { pageSize: 8, size: "small" } : false}
                            scroll={{ x: 1080, y: 380 }}
                            rowKey="key"
                            columns={[
                                {
                                    title: "#",
                                    width: 45,
                                    align: "center",
                                    render: (_, __, idx) => (
                                        <span style={{ color: "#94A3B8", fontWeight: 600, fontSize: 11 }}>
                                            {idx + 1}
                                        </span>
                                    ),
                                },
                                {
                                    title: (
                                        <span>
                                            Project Name <span style={{ color: "#DC2626" }}>*</span>
                                        </span>
                                    ),
                                    dataIndex: "project_name",
                                    width: 150,
                                    render: (v, r) => (
                                        <Input
                                            size="small"
                                            value={v}
                                            placeholder="e.g. Website Revamp"
                                            onChange={(e) => handleUpdateRow(r.key, "project_name", e.target.value)}
                                            style={{ borderRadius: 4 }}
                                        />
                                    ),
                                },
                                {
                                    title: (
                                        <span>
                                            Task Name <span style={{ color: "#DC2626" }}>*</span>
                                        </span>
                                    ),
                                    dataIndex: "task_name",
                                    width: 170,
                                    render: (v, r) => (
                                        <Input
                                            size="small"
                                            value={v}
                                            placeholder="e.g. Hero Section Design"
                                            onChange={(e) => handleUpdateRow(r.key, "task_name", e.target.value)}
                                            style={{ borderRadius: 4, fontWeight: 500 }}
                                        />
                                    ),
                                },
                                {
                                    title: (
                                        <span>
                                            Department <span style={{ color: "#DC2626" }}>*</span>
                                        </span>
                                    ),
                                    dataIndex: "department",
                                    width: 150,
                                    render: (v, r) => (
                                        <Select
                                            size="small"
                                            value={v || undefined}
                                            placeholder="Select Dept"
                                            showSearch
                                            options={departmentOptions}
                                            onChange={(val) => handleUpdateRow(r.key, "department", val)}
                                            style={{ width: "100%" }}
                                        />
                                    ),
                                },
                                {
                                    title: (
                                        <span>
                                            Assign To <span style={{ color: "#DC2626" }}>*</span>
                                        </span>
                                    ),
                                    dataIndex: "assignee_name",
                                    width: 170,
                                    render: (v, r) => (
                                        <Select
                                            size="small"
                                            value={v || undefined}
                                            placeholder="Select Member"
                                            showSearch
                                            options={assigneeOptions}
                                            onChange={(val) => handleUpdateRow(r.key, "assignee_name", val)}
                                            style={{ width: "100%", fontWeight: 500 }}
                                        />
                                    ),
                                },
                                {
                                    title: "Priority",
                                    dataIndex: "priority",
                                    width: 105,
                                    render: (v, r) => (
                                        <Select
                                            size="small"
                                            value={v}
                                            onChange={(val) => handleUpdateRow(r.key, "priority", val)}
                                            style={{ width: "100%" }}
                                            options={[
                                                { value: "low", label: "Low" },
                                                { value: "medium", label: "Medium" },
                                                { value: "high", label: "High" },
                                                { value: "urgent", label: "Urgent" },
                                            ]}
                                        />
                                    ),
                                },
                                {
                                    title: "Duration",
                                    width: 135,
                                    render: (_, r) => (
                                        <Space size={4}>
                                            <InputNumber
                                                size="small"
                                                min={0}
                                                max={24}
                                                value={r.allotted_hours}
                                                onChange={(val) => handleUpdateRow(r.key, "allotted_hours", val || 0)}
                                                addonAfter="h"
                                                style={{ width: 64 }}
                                            />
                                            <InputNumber
                                                size="small"
                                                min={0}
                                                max={59}
                                                step={5}
                                                value={r.allotted_minutes}
                                                onChange={(val) => handleUpdateRow(r.key, "allotted_minutes", val || 0)}
                                                addonAfter="m"
                                                style={{ width: 64 }}
                                            />
                                        </Space>
                                    ),
                                },
                                {
                                    title: "Start Date",
                                    dataIndex: "start_date",
                                    width: 120,
                                    render: (v, r) => (
                                        <Input
                                            type="date"
                                            size="small"
                                            value={v}
                                            onChange={(e) => handleUpdateRow(r.key, "start_date", e.target.value)}
                                            style={{ borderRadius: 4, fontSize: 11 }}
                                        />
                                    ),
                                },
                                {
                                    title: "Due Date",
                                    dataIndex: "due_date",
                                    width: 120,
                                    render: (v, r) => (
                                        <Input
                                            type="date"
                                            size="small"
                                            value={v}
                                            onChange={(e) => handleUpdateRow(r.key, "due_date", e.target.value)}
                                            style={{ borderRadius: 4, fontSize: 11 }}
                                        />
                                    ),
                                },
                                {
                                    title: "",
                                    width: 45,
                                    align: "center",
                                    render: (_, r) => (
                                        <Button
                                            type="text"
                                            danger
                                            size="small"
                                            icon={<DeleteOutlined />}
                                            onClick={() => handleDeleteRow(r.key)}
                                            disabled={sheetRows.length <= 1}
                                            title="Delete Row"
                                        />
                                    ),
                                },
                            ]}
                        />
                    </div>
                </div>
            )}

            {/* ══════════════════════════════════════════════════════════════════
                MODE 2: Preview & Selective Task Creation (Matches Screenshot)
               ══════════════════════════════════════════════════════════════════ */}
            {viewMode === "preview" && (
                <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
                    {/* Summary Alert Banner (Matches User Screenshot) */}
                    <div
                        style={{
                            display: "flex",
                            alignItems: "center",
                            gap: 16,
                            padding: "10px 16px",
                            background: invalidCount > 0 ? "#FFFBEB" : "#F0FDF4",
                            border: `1px solid ${invalidCount > 0 ? "#FDE68A" : "#BBF7D0"}`,
                            borderRadius: 8,
                            fontSize: 13,
                        }}
                    >
                        <CheckCircleFilled style={{ color: invalidCount > 0 ? "#D97706" : "#10B981", fontSize: 18 }} />
                        <span style={{ color: "#1E293B" }}>
                            Total rows: <b>{parsedTasks.length}</b>
                        </span>
                        <span style={{ color: "#15803D" }}>
                            Ready: <b>{validCount}</b>
                        </span>
                        {selectedRowKeys.length > 0 && selectedRowKeys.length !== validCount && (
                            <span style={{ color: "#1D4ED8" }}>
                                Selected to create: <b>{selectedRowKeys.length}</b>
                            </span>
                        )}
                        {invalidCount > 0 && (
                            <span style={{ color: "#DC2626" }}>
                                Errors: <b>{invalidCount}</b>
                            </span>
                        )}
                    </div>

                    {/* Preview Table with Selection */}
                    <Table
                        dataSource={parsedTasks}
                        size="small"
                        pagination={{ pageSize: 6 }}
                        scroll={{ x: 880 }}
                        rowKey="key"
                        rowSelection={{
                            selectedRowKeys,
                            onChange: (keys) => setSelectedRowKeys(keys),
                            getCheckboxProps: (record) => ({
                                disabled: !record.isValid,
                            }),
                        }}
                        columns={[
                            {
                                title: "STATUS",
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
                                title: "VALIDATION NOTE",
                                key: "validation_note",
                                width: 220,
                                render: (_, row) =>
                                    row.isValid ? (
                                        <span style={{ color: "#15803D", fontSize: 12, fontWeight: 500 }}>
                                            Ready to create
                                        </span>
                                    ) : (
                                        <span style={{ color: "#DC2626", fontSize: 12, fontWeight: 500 }}>
                                            {row.errorMsg}
                                        </span>
                                    ),
                            },
                            { title: "PROJECT", dataIndex: "project_name", key: "project_name", width: 140 },
                            {
                                title: "TASK NAME",
                                dataIndex: "task_name",
                                key: "task_name",
                                width: 160,
                                render: (v) => <span style={{ fontWeight: 600, color: "#1E293B" }}>{v}</span>,
                            },
                            {
                                title: "DEPARTMENT",
                                dataIndex: "department",
                                key: "department",
                                width: 130,
                                render: (v: string) => v ? v : <span style={{ color: "#94A3B8" }}>—</span>,
                            },
                            {
                                title: "ASSIGN TO",
                                dataIndex: "assignee_name",
                                key: "assignee_name",
                                width: 140,
                                render: (v: string, row: ParsedTask) => (
                                    <span>
                                        {v}
                                        {row.assigned_to_admin_id ? (
                                            <Tag color="purple" style={{ marginLeft: 6, fontSize: 10, padding: "0 4px" }}>
                                                Admin
                                            </Tag>
                                        ) : null}
                                    </span>
                                ),
                            },
                            {
                                title: "PRIORITY",
                                dataIndex: "priority",
                                key: "priority",
                                width: 90,
                                render: (v: string) => (
                                    <Tag color={v === "urgent" ? "red" : v === "high" ? "orange" : v === "medium" ? "blue" : "default"}>
                                        {v.toUpperCase()}
                                    </Tag>
                                ),
                            },
                            {
                                title: "DURATION",
                                key: "duration",
                                width: 100,
                                render: (_, r) => `${r.allotted_hours}h ${r.allotted_minutes}m`,
                            },
                            { title: "START DATE", dataIndex: "start_date", key: "start_date", width: 110 },
                            { title: "DUE DATE", dataIndex: "due_date", key: "due_date", width: 110 },
                        ]}
                    />
                </div>
            )}

            {/* ══════════════════════════════════════════════════════════════════
                SUB-MODAL: Paste from Google Sheets / Excel
               ══════════════════════════════════════════════════════════════════ */}
            <Modal
                open={pasteModalOpen}
                onCancel={() => {
                    setPasteModalOpen(false);
                    setPasteText("");
                }}
                title={
                    <span style={{ display: "flex", alignItems: "center", gap: 8 }}>
                        <CopyOutlined style={{ color: "#0F9D58" }} /> Paste from Google Sheets or Excel
                    </span>
                }
                centered
                width={600}
                onOk={handlePasteImport}
                okText="Import Rows to Sheet"
                okButtonProps={{ style: { background: "#0F9D58", borderColor: "#0F9D58" } }}
            >
                <div style={{ display: "flex", flexDirection: "column", gap: 10, marginTop: 8 }}>
                    <div style={{ fontSize: 12, color: "#64748B" }}>
                        Copy cells from your Google Sheet or Excel workbook, then paste below (Ctrl+V).
                        Column order: <i>Project, Task Name, Details, Department, Assign To, Priority, Hours, Mins, Start Date, Due Date</i>.
                    </div>
                    <TextArea
                        rows={8}
                        value={pasteText}
                        onChange={(e) => setPasteText(e.target.value)}
                        placeholder="Website Revamp	Hero Section Design	Figma details	Creative Design	Kannan JS	High	1	30	2026-10-21	2026-10-21"
                        style={{ fontFamily: "monospace", fontSize: 12 }}
                    />
                </div>
            </Modal>

            {/* ══════════════════════════════════════════════════════════════════
                SUB-MODAL: Import from Google Sheet Public Link
               ══════════════════════════════════════════════════════════════════ */}
            <Modal
                open={linkModalOpen}
                onCancel={() => {
                    setLinkModalOpen(false);
                    setSheetUrl("");
                }}
                title={
                    <span style={{ display: "flex", alignItems: "center", gap: 8 }}>
                        <LinkOutlined style={{ color: "#0F9D58" }} /> Import via Google Sheet Link
                    </span>
                }
                centered
                width={560}
                onOk={handleGoogleSheetLinkImport}
                confirmLoading={fetchingUrl}
                okText="Fetch & Load Sheet"
                okButtonProps={{ style: { background: "#0F9D58", borderColor: "#0F9D58" } }}
            >
                <div style={{ display: "flex", flexDirection: "column", gap: 10, marginTop: 8 }}>
                    <div style={{ fontSize: 12, color: "#64748B" }}>
                        Paste the URL of your Google Sheet. Ensure the sheet sharing is set to:
                        <br />
                        <b>"Anyone with the link can view"</b>.
                    </div>
                    <Input
                        value={sheetUrl}
                        onChange={(e) => setSheetUrl(e.target.value)}
                        placeholder="https://docs.google.com/spreadsheets/d/1BxiMVs0XRA5nFM.../edit"
                    />
                </div>
            </Modal>
        </Modal>
    );
}
