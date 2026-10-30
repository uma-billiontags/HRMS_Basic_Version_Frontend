// User_Approved_Request.tsx
// Employee-facing — GET /api/corrections/approved/ is auto-scoped to the
// logged-in employee's own requests on the backend (_corrections_queryset
// filters by requested_by when the caller isn't admin), so no employee
// param needs to be sent from here.

import { useEffect, useState, useCallback, useMemo } from "react";
import { Table, Button, Input, DatePicker, message } from "antd";
import { SearchOutlined, ReloadOutlined, CheckCircleOutlined } from "@ant-design/icons";
import type { ColumnsType } from "antd/es/table";
import dayjs from "dayjs";

const BASE_URL = import.meta.env.VITE_BASE_URL;
const { RangePicker } = DatePicker;

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
    reason: string;
    original_end_time: string;
    requested_end_time: string;
    admin_notes: string;
    decided_by_name: string | null;
    decided_at: string | null;
    created_at: string;
}

// ── Status pill, styled like the other screens' StatusTag ──
function ApprovedStatusTag() {
    return (
        <span style={{
            display: "inline-flex", alignItems: "center", gap: 4,
            fontSize: 10.5, fontWeight: 700, padding: "3px 9px", borderRadius: 10,
            color: "var(--green)", background: "var(--green-bg)", whiteSpace: "nowrap",
        }}>
            <CheckCircleOutlined style={{ fontSize: 10 }} />
            Approved
        </span>
    );
}

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

export default function Approved_Request_Employee() {
    const [rows, setRows] = useState<CorrectionRow[]>([]);
    const [loading, setLoading] = useState(true);
    const [search, setSearch] = useState("");
    const [dateRange, setDateRange] = useState<[dayjs.Dayjs, dayjs.Dayjs] | null>(null);

    const fetchApproved = useCallback(() => {
        setLoading(true);
        fetch(`${BASE_URL}/api/tasks/corrections/approved/`, { headers: { ...authHeaders() } })
            .then((r) => r.json())
            .then((d) => setRows(Array.isArray(d) ? d : d.results || []))
            .catch(() => message.error("Failed to load your approved requests"))
            .finally(() => setLoading(false));
    }, []);

    useEffect(() => {
        fetchApproved();
    }, [fetchApproved]);

    const filtered = useMemo(() => {
        return rows.filter((r) => {
            if (dateRange) {
                const decided = dayjs(r.decided_at);
                if (decided.isBefore(dateRange[0], "day") || decided.isAfter(dateRange[1], "day")) return false;
            }
            if (search.trim()) {
                const q = search.toLowerCase();
                if (![r.task_id, r.task_name, r.reason].some((f) => f?.toLowerCase().includes(q))) return false;
            }
            return true;
        });
    }, [rows, search, dateRange]);

    const totalHoursAdjusted = filtered.reduce((sum, r) => {
        const diff = dayjs(r.requested_end_time).diff(dayjs(r.original_end_time), "minute") / 60;
        return sum + diff;
    }, 0);

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
            title: "Your Reason",
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
            title: "Original → Corrected",
            key: "times",
            width: 220,
            render: (_: any, r: CorrectionRow) => (
                <span style={{ fontSize: 11.5, color: "var(--text-secondary)" }}>
                    {dayjs(r.original_end_time).format("DD MMM, HH:mm")}{" "}
                    <span style={{ color: "var(--text-muted)" }}>→</span>{" "}
                    <b style={{ color: "var(--green)" }}>{dayjs(r.requested_end_time).format("HH:mm")}</b>
                </span>
            ),
        },
        {
            title: "Admin Notes",
            dataIndex: "admin_notes",
            key: "admin_notes",
            width: 180,
            render: (v: string) => v ? (
                <div style={{
                    fontSize: 11.5, color: "var(--text-secondary)", maxWidth: 180,
                    overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
                }} title={v}>
                    {v}
                </div>
            ) : <span style={{ color: "var(--text-muted)", fontSize: 12 }}>—</span>,
        },
        {
            title: "Decided At",
            dataIndex: "decided_at",
            key: "decided_at",
            width: 140,
            render: (v: string | null) => (
                <span style={{ fontSize: 11.5, color: "var(--text-secondary)" }}>
                    {v ? dayjs(v).format("DD MMM, HH:mm") : "—"}
                </span>
            ),
        },
        {
            title: "Status",
            key: "status",
            width: 110,
            render: () => <ApprovedStatusTag />,
        },
    ];

    return (
        <div>
            <div className="db-stat-grid" style={{ gridTemplateColumns: "repeat(2, 1fr)" }}>
                <StatCard
                    label="Total Approved"
                    value={filtered.length}
                    changeLabel="Your approved corrections"
                    changeType="up"
                />
                <StatCard
                    label="Net Hours Adjusted"
                    value={totalHoursAdjusted.toFixed(1)}
                    changeLabel="Across your approved requests"
                    changeType="neutral"
                />
            </div>

            <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 20, flexWrap: "wrap" }}>
                <Input
                    placeholder="Search by task or reason…"
                    prefix={<SearchOutlined style={{ color: "var(--text-muted)" }} />}
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    allowClear
                    style={{
                        flex: 1, minWidth: 220, maxWidth: 320, height: 35, padding: "0 14px",
                        background: "var(--bg-input)", border: "1px solid var(--accent-light)",
                        borderRadius: 9, color: "var(--text-primary)", fontSize: 13, outline: "none",
                    }}
                />
                <RangePicker
                    value={dateRange}
                    onChange={(v) => setDateRange(v as [dayjs.Dayjs, dayjs.Dayjs] | null)}
                    format="DD MMM YYYY"
                    style={{ height: 35 }}
                />
                <Button
                    onClick={fetchApproved}
                    icon={<ReloadOutlined />}
                    className="db-card-action"
                    style={{ height: 35, fontSize: 12, fontWeight: 600, display: "flex", alignItems: "center", gap: 6, paddingInline: 14 }}
                >
                    Refresh
                </Button>
                <span style={{ fontSize: 12, color: "var(--text-muted)", marginLeft: "auto" }}>
                    {filtered.length} of {rows.length} approved
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
                    scroll={{ x: 1100 }}
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
        </div>
    );
}