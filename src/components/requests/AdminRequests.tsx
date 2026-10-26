import { useCallback, useEffect, useState } from "react";
import { Button, Card, Input, Modal, message, Space, Tag, Typography } from "antd";
import { CheckOutlined, CloseOutlined, ReloadOutlined } from "@ant-design/icons";
import dayjs from "dayjs";

const BASE_URL = import.meta.env.VITE_BASE_URL;
const { Title, Text } = Typography;
const { TextArea } = Input;

interface RequestRow {
    id: number;
    request_type: string;
    sender_email: string;
    recipient_email: string;
    cc_email?: string;
    employee_name: string;
    subject: string;
    body: string;
    start_date: string | null;
    end_date: string | null;
    start_time: string | null;
    end_time: string | null;
    status: "pending" | "approved" | "rejected";
    created_at: string;
    decision_note: string;
}

function authHeaders(): HeadersInit {
    try {
        const raw = localStorage.getItem("task_tracker_auth");
        const token = raw ? JSON.parse(raw).token : null;
        return token ? { Authorization: `Token ${token}` } : {};
    } catch {
        return {};
    }
}

export default function AdminRequests() {
    const [rows, setRows] = useState<RequestRow[]>([]);
    const [loading, setLoading] = useState(false);

    // Rejection modal state
    const [rejectModalOpen, setRejectModalOpen] = useState(false);
    const [targetRow, setTargetRow] = useState<RequestRow | null>(null);
    const [rejectionReason, setRejectionReason] = useState("");
    const [submittingDecision, setSubmittingDecision] = useState(false);

    const load = useCallback(async () => {
        setLoading(true);
        try {
            const response = await fetch(`${BASE_URL}/api/requests/admin/`, { headers: authHeaders() });
            const payload = await response.json();
            if (!response.ok) throw new Error(payload.detail || "Could not load requests");
            setRows(payload);
        } catch (error) {
            message.error(error instanceof Error ? error.message : "Could not load requests");
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => {
        load();
        const timer = window.setInterval(load, 15_000);
        return () => window.clearInterval(timer);
    }, [load]);

    const decide = async (row: RequestRow, decision: "approved" | "rejected", note?: string) => {
        try {
            const response = await fetch(`${BASE_URL}/api/requests/admin/${row.id}/decision/`, {
                method: "POST",
                headers: { "Content-Type": "application/json", ...authHeaders() },
                body: JSON.stringify({ decision, decision_note: note || "" }),
            });
            const payload = await response.json();
            if (!response.ok) throw new Error(payload.detail || "Decision could not be saved");
            message.success(`Request ${decision}.`);
            await load();
        } catch (error) {
            message.error(error instanceof Error ? error.message : "Decision could not be saved");
        }
    };

    const handleOpenRejectModal = (row: RequestRow) => {
        setTargetRow(row);
        setRejectionReason("");
        setRejectModalOpen(true);
    };

    const handleConfirmReject = async () => {
        if (!rejectionReason.trim()) {
            message.warning("Please enter a reason for rejecting this request.");
            return;
        }
        if (!targetRow) return;
        setSubmittingDecision(true);
        try {
            await decide(targetRow, "rejected", rejectionReason.trim());
            setRejectModalOpen(false);
            setTargetRow(null);
            setRejectionReason("");
        } finally {
            setSubmittingDecision(false);
        }
    };

    return (
        <div style={{ maxWidth: 1100, margin: "0 auto" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 18 }}>
                <div>
                    <Title level={3} style={{ margin: 0, color: "var(--accent)" }}>Employee Requests</Title>
                    <Text type="secondary">Review requests and record a decision.</Text>
                </div>
                <Button icon={<ReloadOutlined />} onClick={load} loading={loading}>Refresh</Button>
            </div>

            <Space direction="vertical" size={12} style={{ width: "100%" }}>
                {rows.map((row) => (
                    <Card key={row.id} style={{ borderRadius: 12 }}>
                        <div style={{ display: "flex", justifyContent: "space-between", gap: 14, flexWrap: "wrap" }}>
                            <div>
                                <Text strong style={{ fontSize: 15 }}>{row.subject}</Text>
                                <div style={{ marginTop: 5 }}>
                                    <Text type="secondary">
                                        {row.employee_name} • {row.sender_email} • {dayjs(row.created_at).format("DD MMM YYYY, HH:mm")}
                                    </Text>
                                </div>
                            </div>
                            <Tag color={row.status === "approved" ? "green" : row.status === "rejected" ? "red" : "gold"}>
                                {row.status.toUpperCase()}
                            </Tag>
                        </div>

                        <div style={{ marginTop: 8, display: "flex", flexWrap: "wrap", gap: 10, fontSize: 13, color: "#475569" }}>
                            <span><strong>Template:</strong> {row.request_type}</span>
                            <span>• <strong>To:</strong> {row.recipient_email}</span>
                            {row.cc_email && (
                                <span>• <strong>Cc:</strong> {row.cc_email}</span>
                            )}
                        </div>

                        {(row.start_date || row.start_time) && (
                            <div style={{ marginTop: 6 }}>
                                <Text type="secondary">
                                    {row.start_date}
                                    {row.end_date && row.end_date !== row.start_date ? ` — ${row.end_date}` : ""}
                                    {row.start_time ? ` • ${row.start_time.slice(0, 5)}—${row.end_time?.slice(0, 5)}` : ""}
                                </Text>
                            </div>
                        )}
                        <p style={{ whiteSpace: "pre-wrap", margin: "12px 0" }}>{row.body}</p>

                        {row.status === "pending" && (
                            <Space style={{ marginTop: 6 }}>
                                <Button type="primary" icon={<CheckOutlined />} onClick={() => decide(row, "approved")}>
                                    Approve
                                </Button>
                                <Button danger icon={<CloseOutlined />} onClick={() => handleOpenRejectModal(row)}>
                                    Reject
                                </Button>
                            </Space>
                        )}

                        {row.status === "rejected" && (
                            <div
                                style={{
                                    marginTop: 12,
                                    padding: "10px 14px",
                                    background: "#FEF2F2",
                                    border: "1px solid #FCA5A5",
                                    borderRadius: 8,
                                }}
                            >
                                <Text strong style={{ color: "#DC2626", display: "block", marginBottom: 3 }}>
                                    Reason for Rejection:
                                </Text>
                                <Text style={{ color: "#991B1B", whiteSpace: "pre-wrap" }}>
                                    {row.decision_note || "No reason specified."}
                                </Text>
                            </div>
                        )}

                        {row.status === "approved" && row.decision_note && (
                            <div
                                style={{
                                    marginTop: 12,
                                    padding: "10px 14px",
                                    background: "#F0FDF4",
                                    border: "1px solid #86EFAC",
                                    borderRadius: 8,
                                }}
                            >
                                <Text strong style={{ color: "#16A34A", display: "block", marginBottom: 3 }}>
                                    Approval Note:
                                </Text>
                                <Text style={{ color: "#166534", whiteSpace: "pre-wrap" }}>
                                    {row.decision_note}
                                </Text>
                            </div>
                        )}
                    </Card>
                ))}
                {!loading && rows.length === 0 && <Text type="secondary">No requests found.</Text>}
            </Space>

            {/* Rejection Reason Modal */}
            <Modal
                title="Reject Request"
                open={rejectModalOpen}
                onOk={handleConfirmReject}
                onCancel={() => {
                    if (!submittingDecision) {
                        setRejectModalOpen(false);
                        setTargetRow(null);
                    }
                }}
                okText="Reject Request"
                okButtonProps={{ danger: true, loading: submittingDecision }}
                cancelButtonProps={{ disabled: submittingDecision }}
                destroyOnClose
            >
                {targetRow && (
                    <div style={{ marginBottom: 14, background: "#F8FAFC", padding: 12, borderRadius: 8, border: "1px solid #E2E8F0" }}>
                        <div style={{ color: "#475569", fontSize: 13, marginBottom: 4 }}>
                            Employee: <strong style={{ color: "#1E293B" }}>{targetRow.employee_name}</strong> ({targetRow.sender_email})
                        </div>
                        <div style={{ color: "#475569", fontSize: 13, marginBottom: 4 }}>
                            Subject: <strong style={{ color: "#1E293B" }}>{targetRow.subject}</strong>
                        </div>
                        <div style={{ color: "#475569", fontSize: 13, marginBottom: targetRow.cc_email ? 4 : 0 }}>
                            To: <strong style={{ color: "#1E293B" }}>{targetRow.recipient_email}</strong>
                        </div>
                        {targetRow.cc_email && (
                            <div style={{ color: "#475569", fontSize: 13 }}>
                                Cc: <strong style={{ color: "#1E293B" }}>{targetRow.cc_email}</strong>
                            </div>
                        )}
                    </div>
                )}
                <div style={{ marginBottom: 6 }}>
                    <Text strong>
                        Reason for Rejection <span style={{ color: "#DC2626" }}>*</span>
                    </Text>
                </div>
                <TextArea
                    rows={4}
                    value={rejectionReason}
                    onChange={(e) => setRejectionReason(e.target.value)}
                    placeholder="Please specify why this request is being rejected. This reason will be emailed to the employee and displayed on their dashboard."
                />
            </Modal>
        </div>
    );
}
