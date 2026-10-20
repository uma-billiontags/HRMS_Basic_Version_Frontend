import { useCallback, useEffect, useState } from "react";
import { Button, Card, DatePicker, Input, message, Select, Space, Tag, TimePicker, Typography } from "antd";
import { MailOutlined, SendOutlined, ReloadOutlined } from "@ant-design/icons";
import dayjs, { type Dayjs } from "dayjs";
import { useAuth } from "../AuthContext";

const BASE_URL = import.meta.env.VITE_BASE_URL;
const { TextArea } = Input;
const { Title, Text } = Typography;
type RequestType = "leave" | "permission" | "custom";
interface RequestRow {
    id: number; request_type: RequestType; sender_email: string; recipient_email: string;
    subject: string; body: string; start_date: string | null; end_date: string | null;
    start_time: string | null; end_time: string | null; status: "pending" | "approved" | "rejected";
    decision_note: string; created_at: string; employee_name: string;
}

function authHeaders(): HeadersInit {
    try {
        const raw = localStorage.getItem("task_tracker_auth");
        const token = raw ? JSON.parse(raw).token : null;
        return token ? { Authorization: `Token ${token}` } : {};
    } catch { return {}; }
}

export default function EmployeeRequests() {
    const { user } = useAuth();
    const [requestType, setRequestType] = useState<RequestType>("leave");
    const [recipient, setRecipient] = useState("");
    const [subject, setSubject] = useState("Leave Request");
    const [body, setBody] = useState("");
    const [startDate, setStartDate] = useState<Dayjs | null>(null);
    const [endDate, setEndDate] = useState<Dayjs | null>(null);
    const [startTime, setStartTime] = useState<Dayjs | null>(null);
    const [endTime, setEndTime] = useState<Dayjs | null>(null);
    const [sending, setSending] = useState(false);
    const [rows, setRows] = useState<RequestRow[]>([]);
    const [loading, setLoading] = useState(false);

    const loadRequests = useCallback(async () => {
        setLoading(true);
        try {
            const response = await fetch(`${BASE_URL}/api/requests/mine/`, { headers: authHeaders() });
            const payload = await response.json();
            if (!response.ok) throw new Error(payload.detail || "Could not load requests");
            setRows(payload);
        } catch (error) { message.error(error instanceof Error ? error.message : "Could not load requests"); }
        finally { setLoading(false); }
    }, []);

    useEffect(() => {
        loadRequests();
        const timer = window.setInterval(loadRequests, 15_000);
        return () => window.clearInterval(timer);
    }, [loadRequests]);

    const changeType = (value: RequestType) => {
        setRequestType(value);
        setSubject(value === "leave" ? "Leave Request" : value === "permission" ? "Permission Request" : "");
    };

    const submit = async () => {
        if (!recipient.trim() || !subject.trim() || !body.trim()) {
            message.warning("Fill in the recipient, subject, and message."); return;
        }
        if (requestType === "leave" && (!startDate || !endDate || endDate.isBefore(startDate, "day"))) {
            message.warning("Choose a valid leave start and end date."); return;
        }
        if (requestType === "permission" && (!startDate || !startTime || !endTime)) {
            message.warning("Choose the permission date and time range."); return;
        }
        setSending(true);
        try {
            const response = await fetch(`${BASE_URL}/api/requests/create/`, {
                method: "POST", headers: { "Content-Type": "application/json", ...authHeaders() },
                body: JSON.stringify({
                    request_type: requestType, recipient_email: recipient.trim(), subject: subject.trim(), body: body.trim(),
                    start_date: startDate?.format("YYYY-MM-DD") ?? null,
                    end_date: endDate?.format("YYYY-MM-DD") ?? null,
                    start_time: startTime?.format("HH:mm:ss") ?? null,
                    end_time: endTime?.format("HH:mm:ss") ?? null,
                }),
            });
            const payload = await response.json();
            if (!response.ok) throw new Error(payload.detail || "Request could not be sent");
            message.success("Request email sent successfully.");
            setRecipient(""); setBody(""); setStartDate(null); setEndDate(null); setStartTime(null); setEndTime(null);
            await loadRequests();
        } catch (error) { message.error(error instanceof Error ? error.message : "Request could not be sent"); }
        finally { setSending(false); }
    };

    const statusColor = (status: RequestRow["status"]) => status === "approved" ? "green" : status === "rejected" ? "red" : "gold";

    return <div style={{ maxWidth: 1100, margin: "0 auto" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 18 }}>
            <div><Title level={3} style={{ margin: 0, color: "var(--accent)" }}>Create a Request</Title><Text type="secondary">Compose and send a request for approval.</Text></div>
            <Button icon={<ReloadOutlined />} onClick={loadRequests} loading={loading}>Refresh</Button>
        </div>
        <Card style={{ borderRadius: 14, marginBottom: 22 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 20, color: "#1d4ed8" }}><MailOutlined /><Text strong>New message</Text></div>
            <Space direction="vertical" size={14} style={{ width: "100%" }}>
                <div style={{ display: "grid", gridTemplateColumns: "minmax(140px, 1fr) minmax(220px, 2fr)", gap: 12 }}>
                    <Select value={requestType} onChange={changeType} options={[{ value: "leave", label: "Leave template" }, { value: "permission", label: "Permission template" }, { value: "custom", label: "Custom request" }]} />
                    <Input addonBefore="From" value={user?.email || "Your account email"} readOnly />
                </div>
                <Input addonBefore="To" type="email" value={recipient} onChange={(event) => setRecipient(event.target.value)} placeholder="Approver email address" />
                <Input addonBefore="Subject" value={subject} onChange={(event) => setSubject(event.target.value)} maxLength={200} placeholder="Request subject" />
                {requestType === "leave" && <div style={{ display: "flex", flexWrap: "wrap", gap: 12 }}>
                    <DatePicker value={startDate} onChange={setStartDate} placeholder="Leave start date" />
                    <DatePicker value={endDate} onChange={setEndDate} placeholder="Leave end date" />
                </div>}
                {requestType === "permission" && <div style={{ display: "flex", flexWrap: "wrap", gap: 12 }}>
                    <DatePicker value={startDate} onChange={setStartDate} placeholder="Permission date" />
                    <TimePicker value={startTime} onChange={setStartTime} format="HH:mm" placeholder="From time" />
                    <TimePicker value={endTime} onChange={setEndTime} format="HH:mm" placeholder="To time" />
                </div>}
                <TextArea value={body} onChange={(event) => setBody(event.target.value)} rows={7} placeholder={requestType === "leave" ? "Dear Manager,\n\nI would like to request leave because...\n\nThank you" : "Write your request message..."} />
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 12 }}>
                    <Text type="secondary">The email is sent by HRMS. Replies go to your account email.</Text>
                    <Button type="primary" icon={<SendOutlined />} onClick={submit} loading={sending}>Send request</Button>
                </div>
            </Space>
        </Card>
        <Title level={4}>My requests</Title>
        <Space direction="vertical" size={12} style={{ width: "100%" }}>
            {rows.map((row) => <Card key={row.id} size="small" style={{ borderRadius: 12 }}>
                <div style={{ display: "flex", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
                    <div><Text strong>{row.subject}</Text><div style={{ marginTop: 5 }}><Text type="secondary">To {row.recipient_email} · {dayjs(row.created_at).format("DD MMM YYYY, HH:mm")}</Text></div></div>
                    <Tag color={statusColor(row.status)}>{row.status.toUpperCase()}</Tag>
                </div>
                {(row.start_date || row.start_time) && <div style={{ marginTop: 8 }}><Text type="secondary">{row.start_date}{row.end_date && row.end_date !== row.start_date ? ` – ${row.end_date}` : ""}{row.start_time ? ` · ${row.start_time.slice(0, 5)}–${row.end_time?.slice(0, 5)}` : ""}</Text></div>}
                <p style={{ whiteSpace: "pre-wrap", margin: "10px 0 0" }}>{row.body}</p>
                {row.status === "rejected" && (
                    <div
                        style={{
                            marginTop: 10,
                            padding: "9px 13px",
                            background: "#FEF2F2",
                            border: "1px solid #FCA5A5",
                            borderRadius: 8,
                        }}
                    >
                        <Text strong style={{ color: "#DC2626", display: "block", marginBottom: 2 }}>
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
                            marginTop: 10,
                            padding: "9px 13px",
                            background: "#F0FDF4",
                            border: "1px solid #86EFAC",
                            borderRadius: 8,
                        }}
                    >
                        <Text strong style={{ color: "#16A34A", display: "block", marginBottom: 2 }}>
                            Approval Note:
                        </Text>
                        <Text style={{ color: "#166534", whiteSpace: "pre-wrap" }}>
                            {row.decision_note}
                        </Text>
                    </div>
                )}
            </Card>)}
            {!loading && rows.length === 0 && <Text type="secondary">No requests sent yet.</Text>}
        </Space>
    </div>;
}
