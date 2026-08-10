import { useState } from "react";
import { Modal, Button, Upload, Table, message } from "antd";
import { InboxOutlined } from "@ant-design/icons";
import type { UploadProps } from "antd";
import * as XLSX from "xlsx";

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

interface ParsedRow {
    task_name: string;
    default_hours: number | string;
    _rowNum: number;
}

interface BulkResult {
    created_count: number;
    skipped_count: number;
    error_count: number;
    skipped: { row: number; task_name: string; reason: string }[];
    errors: { row: number; task_name?: string; error: string }[];
}

interface Props {
    open: boolean;
    onClose: () => void;
    /** Fires after any successful upload so the caller can refresh its list. */
    onSaved?: () => void;
}

/**
 * Bulk Excel/CSV upload for the Task Master catalog. This lives ONLY on the
 * Task Master Admin screen, opened by its own "Bulk Upload" button — the
 * Create Task form's "+ Add New Task" flow stays single-add-only.
 */
export default function BulkUploadTaskMasterModal({ open, onClose, onSaved }: Props) {
    const [parsedRows, setParsedRows] = useState<ParsedRow[]>([]);
    const [fileName, setFileName] = useState("");
    const [submitting, setSubmitting] = useState(false);
    const [result, setResult] = useState<BulkResult | null>(null);

    const resetAll = () => {
        setParsedRows([]);
        setFileName("");
        setResult(null);
    };

    const handleClose = () => {
        resetAll();
        onClose();
    };

    const parseWorkbook = (file: File) => {
        const reader = new FileReader();
        reader.onload = (e) => {
            try {
                const data = e.target?.result;
                const workbook = XLSX.read(data, { type: "binary" });
                const sheet = workbook.Sheets[workbook.SheetNames[0]];
                const rows: any[] = XLSX.utils.sheet_to_json(sheet, { defval: "" });

                const normalized: ParsedRow[] = rows
                    .map((row, idx) => {
                        // Accept a couple of header spellings so a slightly-off template still works.
                        const nameKey = Object.keys(row).find(
                            (k) => k.trim().toLowerCase().replace(/\s|_/g, "") === "taskname"
                        );
                        const hoursKey = Object.keys(row).find((k) =>
                            ["hours", "defaulthours", "hrs"].includes(k.trim().toLowerCase().replace(/\s|_/g, ""))
                        );
                        return {
                            task_name: String(nameKey ? row[nameKey] : "").trim(),
                            default_hours: hoursKey ? row[hoursKey] : "",
                            _rowNum: idx + 2, // header row + 1-indexing, matches what admin sees in Excel
                        };
                    })
                    .filter((r) => r.task_name || r.default_hours);

                if (normalized.length === 0) {
                    message.error('No valid rows found. Make sure the sheet has "task_name" and "hours" columns.');
                    return;
                }
                setParsedRows(normalized);
                setResult(null);
            } catch {
                message.error("Couldn't read that file. Make sure it's a valid .xlsx or .csv file.");
            }
        };
        reader.readAsBinaryString(file);
    };

    const uploadProps: UploadProps = {
        accept: ".xlsx,.xls,.csv",
        showUploadList: false,
        beforeUpload: (file) => {
            setFileName(file.name);
            parseWorkbook(file);
            return false; // stop antd from trying to auto-upload it anywhere
        },
    };

    const handleSubmit = async () => {
        if (parsedRows.length === 0) return;
        setSubmitting(true);
        try {
            const res = await fetch(`${BASE_URL}/api/tasks/task_master/bulk_create/`, {
                method: "POST",
                headers: { "Content-Type": "application/json", ...authHeaders() },
                body: JSON.stringify({
                    items: parsedRows.map((r) => ({
                        task_name: r.task_name,
                        default_hours: r.default_hours,
                    })),
                }),
            });
            const data = await res.json();
            if (res.ok) {
                setResult(data);
                if (data.created_count > 0) {
                    message.success(
                        `Added ${data.created_count} task${data.created_count !== 1 ? "s" : ""} to the catalog`
                    );
                    onSaved?.();
                }
                if (data.skipped_count === 0 && data.error_count === 0) {
                    setTimeout(handleClose, 900); // clean run — close automatically
                }
            } else {
                message.error(data.detail || "Bulk upload failed");
            }
        } catch {
            message.error("Network error");
        } finally {
            setSubmitting(false);
        }
    };

    return (
        <Modal
            open={open}
            onCancel={handleClose}
            footer={null}
            title="Bulk Upload Tasks"
            width={640}
            centered
            destroyOnClose
        >
            <div
                style={{
                    border: "1px dashed var(--border)", borderRadius: 10, padding: 20,
                    textAlign: "center", background: "var(--bg-input)",
                }}
            >
                <Upload.Dragger {...uploadProps} style={{ background: "transparent", border: "none", padding: 0 }}>
                    <p style={{ fontSize: 28, color: "var(--accent)", margin: "0 0 8px" }}>
                        <InboxOutlined />
                    </p>
                    <p style={{ fontSize: 13, fontWeight: 600, color: "var(--text-primary)", margin: 0 }}>
                        Click or drag an Excel file here
                    </p>
                    <p style={{ fontSize: 11, color: "var(--text-muted)", margin: "4px 0 0" }}>
                        Two columns: <b>task_name</b> and <b>hours</b>. .xlsx, .xls, or .csv
                    </p>
                </Upload.Dragger>
                {fileName && (
                    <div style={{ marginTop: 10, fontSize: 12, color: "var(--text-secondary)" }}>
                        Loaded: {fileName} — {parsedRows.length} row{parsedRows.length !== 1 ? "s" : ""} found
                    </div>
                )}
            </div>

            {parsedRows.length > 0 && (
                <div style={{ marginTop: 16 }}>
                    <Table
                        size="small"
                        dataSource={parsedRows}
                        rowKey="_rowNum"
                        pagination={{ pageSize: 5 }}
                        columns={[
                            { title: "Row", dataIndex: "_rowNum", width: 60 },
                            { title: "Task Name", dataIndex: "task_name" },
                            { title: "Hours", dataIndex: "default_hours", width: 100 },
                        ]}
                    />
                </div>
            )}

            {result && (
                <div
                    style={{
                        marginTop: 16, padding: 12, borderRadius: 8,
                        background: "var(--bg-input)", fontSize: 12, color: "var(--text-secondary)",
                    }}
                >
                    <div>✅ Created: {result.created_count}</div>
                    {result.skipped_count > 0 && (
                        <div>
                            ⚠️ Skipped (already exist): {result.skipped_count} —{" "}
                            {result.skipped.map((s) => s.task_name).join(", ")}
                        </div>
                    )}
                    {result.error_count > 0 && (
                        <div style={{ color: "var(--red)" }}>
                            ❌ Errors: {result.error_count} —{" "}
                            {result.errors.map((e) => `row ${e.row}: ${e.error}`).join("; ")}
                        </div>
                    )}
                </div>
            )}

            <div style={{ display: "flex", justifyContent: "flex-end", gap: 8, marginTop: 16 }}>
                <Button onClick={handleClose}>{result ? "Done" : "Cancel"}</Button>
                {!result && (
                    <Button
                        type="primary"
                        loading={submitting}
                        disabled={parsedRows.length === 0}
                        onClick={handleSubmit}
                    >
                        Upload {parsedRows.length > 0 ? `${parsedRows.length} Tasks` : ""}
                    </Button>
                )}
            </div>
        </Modal>
    );
}