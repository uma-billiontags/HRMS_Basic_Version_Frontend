// Time_Correction_Request.tsx
// Admin-only — the live queue of PENDING time-correction requests. Approve/
// Reject calls POST /api/corrections/<id>/decision/, which flips status away
// from "pending" — so once decided, a row naturally disappears from this
// queue on the next fetch (it'll show up in All_Approved_Request.tsx or
// All_Reject_Request.tsx instead, no extra logic needed here).

import { useEffect, useState, useCallback, useMemo } from "react";
import { Table, Button, Input, Modal, Form, message } from "antd";
import {
    SearchOutlined, ReloadOutlined, CheckCircleOutlined, CloseCircleOutlined,
} from "@ant-design/icons";
import type { ColumnsType } from "antd/es/table";
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

interface CorrectionRow {
    id: number;
    task_id: string;
    task_name: string;
    employee_name: string;
    reason: string;
    original_end_time: string;
    requested_end_time: string;
    status: "pending" | "approved" | "rejected";
    admin_notes: string;
    decided_by_name: string | null;
    decided_at: string | null;
    created_at: string;
}

function StatCard({ label, value, changeLabel, changeType }: {
    label: string; value: number; changeLabel: string; changeType: "up" | "down" | "neutral";
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

export default function Pending_Time_Correction_Request() {
    const [rows, setRows] = useState<CorrectionRow[]>([]);
    const [loading, setLoading] = useState(true);
    const [search, setSearch] = useState("");
    const [busyId, setBusyId] = useState<number | null>(null);

    const [decisionOpen, setDecisionOpen] = useState(false);
    const [decisionTarget, setDecisionTarget] = useState<CorrectionRow | null>(null);
    const [decisionType, setDecisionType] = useState<"approve" | "reject">("approve");
    const [deciding, setDeciding] = useState(false);
    const [decisionForm] = Form.useForm();

    const fetchPending = useCallback(() => {
        setLoading(true);
        fetch(`${BASE_URL}/api/tasks/corrections/pending/`, { headers: { ...authHeaders() } })
            .then((r) => r.json())
            .then((d) => setRows(Array.isArray(d) ? d : d.results || []))
            .catch(() => message.error("Failed to load correction requests"))
            .finally(() => setLoading(false));
    }, []);

    useEffect(() => {
        fetchPending();
    }, [fetchPending]);

    const filtered = useMemo(() => {
        if (!search.trim()) return rows;
        const q = search.toLowerCase();
        return rows.filter((r) =>
            [r.task_id, r.task_name, r.employee_name, r.reason].some((f) => f?.toLowerCase().includes(q))
        );
    }, [rows, search]);

    // Older-than-24h just calls out anything that's been sitting a while —
    // purely a visual nudge, not a hard rule.
    const staleCount = rows.filter((r) => dayjs().diff(dayjs(r.created_at), "hour") >= 24).length;

    const openDecision = (row: CorrectionRow, type: "approve" | "reject") => {
        setDecisionTarget(row);
        setDecisionType(type);
        decisionForm.resetFields();
        setDecisionOpen(true);
    };

    const handleDecision = async () => {
        if (!decisionTarget) return;
        let values;
        try {
            values = await decisionForm.validateFields();
        } catch {
            return;
        }

        setDeciding(true);
        setBusyId(decisionTarget.id);
        try {
            const res = await fetch(`${BASE_URL}/api/tasks/corrections/${decisionTarget.id}/decision/`, {
                method: "POST",
                headers: { "Content-Type": "application/json", ...authHeaders() },
                body: JSON.stringify({
                    decision: decisionType,
                    admin_notes: values.admin_notes || "",
                }),
            });
            if (res.ok) {
                message.success(decisionType === "approve" ? "Correction approved" : "Correction rejected");
                setDecisionOpen(false);
            } else {
                const err = await res.json().catch(() => ({}));
                message.error(err.detail || "Failed to save decision");
            }
        } catch {
            message.error("Network error");
        } finally {
            setDeciding(false);
            setBusyId(null);
            fetchPending();
        }
    };

    const columns: ColumnsType<CorrectionRow> = [
        {
            title: "Task",
            key: "task",
            width: 200,
            render: (_: any, r: CorrectionRow) => (
                <div>
                    <span style={{
                        fontSize: 11.5, fontWeight: 700, color: "var(--blue)", background: "var(--blue-bg)",
                        border: "1px solid var(--blue)", padding: "2px 10px", borderRadius: 6, whiteSpace: "nowrap",
                    }}>
                        {r.task_id}
                    </span>
                    <div style={{ fontSize: 12.5, fontWeight: 600, color: "var(--text-primary)", marginTop: 4 }}>
                        {r.task_name}
                    </div>
                </div>
            ),
        },
        {
            title: "Employee",
            dataIndex: "employee_name",
            key: "employee_name",
            width: 130,
            render: (v: string) => (
                <span style={{ fontSize: 12.5, fontWeight: 600, color: "var(--text-primary)" }}>{v}</span>
            ),
        },
        {
            title: "Reason",
            dataIndex: "reason",
            key: "reason",
            width: 220,
            render: (v: string) => (
                <div style={{
                    fontSize: 11.5, color: "var(--text-secondary)", maxWidth: 220,
                    overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
                }} title={v}>
                    {v}
                </div>
            ),
        },
        {
            title: "Original End",
            dataIndex: "original_end_time",
            key: "original_end_time",
            width: 140,
            render: (v: string) => (
                <span style={{ fontSize: 11.5, color: "var(--text-secondary)" }}>
                    {dayjs(v).format("DD MMM, HH:mm")}
                </span>
            ),
        },
        {
            title: "Requested End",
            dataIndex: "requested_end_time",
            key: "requested_end_time",
            width: 140,
            render: (v: string) => (
                <span style={{ fontSize: 11.5, fontWeight: 700, color: "var(--blue)" }}>
                    {dayjs(v).format("DD MMM, HH:mm")}
                </span>
            ),
        },
        {
            title: "Requested",
            dataIndex: "created_at",
            key: "created_at",
            width: 130,
            render: (v: string) => (
                <span style={{ fontSize: 11.5, color: "var(--text-secondary)" }}>
                    {dayjs(v).format("DD MMM, HH:mm")}
                </span>
            ),
        },
        {
            title: "Actions",
            key: "actions",
            width: 190,
            fixed: "right",
            render: (_: any, r: CorrectionRow) => (
                <div style={{ display: "flex", gap: 6 }}>
                    <Button
                        size="small"
                        loading={busyId === r.id}
                        icon={<CheckCircleOutlined />}
                        onClick={() => openDecision(r, "approve")}
                        style={{
                            fontSize: 11, fontWeight: 700, borderRadius: 6,
                            background: "var(--green)", color: "#fff", border: "none",
                        }}
                    >
                        Approve
                    </Button>
                    <Button
                        size="small"
                        loading={busyId === r.id}
                        icon={<CloseCircleOutlined />}
                        onClick={() => openDecision(r, "reject")}
                        style={{
                            fontSize: 11, fontWeight: 700, borderRadius: 6,
                            color: "var(--red)", background: "var(--red-bg)", borderColor: "var(--red)",
                        }}
                    >
                        Reject
                    </Button>
                </div>
            ),
        },
    ];

    return (
        <div>
            <div className="db-stat-grid" style={{ gridTemplateColumns: "repeat(2, 1fr)" }}>
                <StatCard
                    label="Pending Requests"
                    value={rows.length}
                    changeLabel="Awaiting your decision"
                    changeType={rows.length > 0 ? "down" : "neutral"}
                />
                <StatCard
                    label="Waiting 24h+"
                    value={staleCount}
                    changeLabel="Sitting longer than a day"
                    changeType={staleCount > 0 ? "down" : "neutral"}
                />
            </div>

            <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 20, flexWrap: "wrap" }}>
                <Input
                    placeholder="Search by task or employee…"
                    prefix={<SearchOutlined style={{ color: "var(--text-muted)" }} />}
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    allowClear
                    style={{
                        flex: 1, minWidth: 220, maxWidth: 500, height: 35, padding: "0 14px",
                        background: "var(--bg-input)", border: "1px solid var(--accent-light)",
                        borderRadius: 9, color: "var(--text-primary)", fontSize: 13, outline: "none",
                    }}
                />
                <Button
                    onClick={fetchPending}
                    icon={<ReloadOutlined />}
                    className="db-card-action"
                    style={{ height: 35, fontSize: 12, fontWeight: 600, display: "flex", alignItems: "center", gap: 6, paddingInline: 14 }}
                >
                    Refresh
                </Button>
                <span style={{ fontSize: 12, color: "var(--text-muted)", marginLeft: "auto" }}>
                    {filtered.length} of {rows.length} pending
                </span>
            </div>

            <div style={{
                background: "var(--bg-card)", borderRadius: 14, border: "1px solid var(--border)",
                overflow: "hidden", boxShadow: "var(--shadow-card)",
            }}>
                <Table
                    columns={columns}
                    dataSource={filtered}
                    rowKey="id"
                    scroll={{ x: 1200 }}
                    loading={loading}
                    pagination={{
                        pageSize: 10,
                        showSizeChanger: true,
                        pageSizeOptions: ["10", "20", "50"],
                        showTotal: (total, range) => `${range[0]}–${range[1]} of ${total}`,
                        style: { padding: "12px 16px", color: "var(--text-primary)" },
                    }}
                    rowClassName={() => "client-table-row"}
                    style={{ fontSize: 13 }}
                />
            </div>

            <Modal
                open={decisionOpen}
                onCancel={() => setDecisionOpen(false)}
                onOk={handleDecision}
                confirmLoading={deciding}
                title={
                    <span style={{ display: "flex", alignItems: "center", gap: 8 }}>
                        {decisionType === "approve" ? (
                            <CheckCircleOutlined style={{ color: "var(--green)" }} />
                        ) : (
                            <CloseCircleOutlined style={{ color: "var(--red)" }} />
                        )}
                        {decisionType === "approve" ? "Approve Time Correction" : "Reject Time Correction"}
                    </span>
                }
                okText={decisionType === "approve" ? "Approve" : "Reject"}
                okButtonProps={decisionType === "reject" ? { danger: true } : { style: { background: "var(--green)", borderColor: "var(--green)" } }}
                width={480}
                centered
                destroyOnClose
            >
                {decisionTarget && (
                    <>
                        <div style={{
                            display: "flex", flexDirection: "column", gap: 4, marginBottom: 16,
                            padding: "8px 12px", background: "var(--bg-input)", borderRadius: 8,
                        }}>
                            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                                <span style={{
                                    fontSize: 11.5, fontWeight: 700, color: "var(--blue)", background: "var(--blue-bg)",
                                    border: "1px solid var(--blue)", padding: "2px 10px", borderRadius: 6,
                                }}>
                                    {decisionTarget.task_id}
                                </span>
                                <span style={{ fontSize: 13, fontWeight: 600, color: "var(--text-primary)" }}>
                                    {decisionTarget.task_name}
                                </span>
                            </div>
                            <span style={{ fontSize: 11.5, color: "var(--text-secondary)" }}>
                                {decisionTarget.employee_name} · {dayjs(decisionTarget.original_end_time).format("HH:mm")} → {dayjs(decisionTarget.requested_end_time).format("HH:mm")}
                            </span>
                        </div>
                        <Form form={decisionForm} layout="vertical">
                            <Form.Item label="Admin Notes" name="admin_notes">
                                <Input.TextArea rows={3} placeholder="Optional notes for the employee…" />
                            </Form.Item>
                        </Form>
                    </>
                )}
            </Modal>
        </div>
    );
}