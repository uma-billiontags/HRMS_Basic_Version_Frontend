// All_Reject_Request.tsx
// Admin-only — read-only history of every REJECTED time-correction request,
// across all employees. Same shape as All_Approved_Request.tsx, but no
// "hours adjusted" stat since a rejection changes nothing.

import { useEffect, useState, useCallback, useMemo } from "react";
import { Table, Button, Input, Select, DatePicker, message } from "antd";
import { SearchOutlined, ReloadOutlined, CloseCircleOutlined } from "@ant-design/icons";
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
    employee_name: string;
    reason: string;
    original_end_time: string;
    requested_end_time: string;
    status: "rejected";
    admin_notes: string;
    decided_by_name: string | null;
    decided_at: string | null;
    created_at: string;
}

// ── Status pill, styled like the other screens' StatusTag ──
function RejectedStatusTag() {
    return (
        <span style={{
            display: "inline-flex", alignItems: "center", gap: 4,
            fontSize: 10.5, fontWeight: 700, padding: "3px 9px", borderRadius: 10,
            color: "var(--red)", background: "var(--red-bg)", whiteSpace: "nowrap",
        }}>
            <CloseCircleOutlined style={{ fontSize: 10 }} />
            Rejected
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

export default function Rejected_Request_Admin() {
    const [rows, setRows] = useState<CorrectionRow[]>([]);
    const [loading, setLoading] = useState(true);
    const [search, setSearch] = useState("");
    const [employeeFilter, setEmployeeFilter] = useState<string | undefined>(undefined);
    const [dateRange, setDateRange] = useState<[dayjs.Dayjs, dayjs.Dayjs] | null>(null);

    const fetchRejected = useCallback(() => {
        setLoading(true);
        fetch(`${BASE_URL}/api/tasks/corrections/rejected/`, { headers: { ...authHeaders() } })
            .then((r) => r.json())
            .then((d) => setRows(Array.isArray(d) ? d : d.results || []))
            .catch(() => message.error("Failed to load rejected corrections"))
            .finally(() => setLoading(false));
    }, []);

    useEffect(() => {
        fetchRejected();
    }, [fetchRejected]);

    const employeeOptions = useMemo(() => {
        const names = Array.from(new Set(rows.map((r) => r.employee_name)));
        return names.map((n) => ({ value: n, label: n }));
    }, [rows]);

    const filtered = useMemo(() => {
        return rows.filter((r) => {
            if (employeeFilter && r.employee_name !== employeeFilter) return false;
            if (dateRange) {
                const decided = dayjs(r.decided_at);
                if (decided.isBefore(dateRange[0], "day") || decided.isAfter(dateRange[1], "day")) return false;
            }
            if (search.trim()) {
                const q = search.toLowerCase();
                if (![r.task_id, r.task_name, r.employee_name, r.reason].some((f) => f?.toLowerCase().includes(q))) return false;
            }
            return true;
        });
    }, [rows, search, employeeFilter, dateRange]);

    // Employees with 2+ rejections in the current filtered view — a quick
    // signal for the admin, nothing more.
    const repeatCount = useMemo(() => {
        const counts: Record<string, number> = {};
        filtered.forEach((r) => { counts[r.employee_name] = (counts[r.employee_name] || 0) + 1; });
        return Object.values(counts).filter((c) => c >= 2).length;
    }, [filtered]);

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
            title: "Reason Given",
            dataIndex: "reason",
            key: "reason",
            width: 200,
            render: (v: string) => (
                <div style={{
                    fontSize: 11.5, color: "var(--text-secondary)", maxWidth: 200,
                    overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
                }} title={v}>
                    {v}
                </div>
            ),
        },
        {
            title: "Original → Requested",
            key: "times",
            width: 210,
            render: (_: any, r: CorrectionRow) => (
                <span style={{ fontSize: 11.5, color: "var(--text-secondary)" }}>
                    {dayjs(r.original_end_time).format("DD MMM, HH:mm")}{" "}
                    <span style={{ color: "var(--text-muted)" }}>→</span>{" "}
                    {dayjs(r.requested_end_time).format("HH:mm")}
                </span>
            ),
        },
        {
            title: "Rejection Notes",
            dataIndex: "admin_notes",
            key: "admin_notes",
            width: 200,
            render: (v: string) => v ? (
                <div style={{
                    fontSize: 11.5, color: "var(--text-secondary)", maxWidth: 200,
                    overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
                }} title={v}>
                    {v}
                </div>
            ) : <span style={{ color: "var(--text-muted)", fontSize: 12 }}>—</span>,
        },
        {
            title: "Decided By",
            dataIndex: "decided_by_name",
            key: "decided_by_name",
            width: 120,
            render: (v: string | null) => (
                <span style={{ fontSize: 12, color: "var(--text-secondary)" }}>{v ?? "—"}</span>
            ),
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
            render: () => <RejectedStatusTag />,
        },
    ];

    return (
        <div>
            <div className="db-stat-grid" style={{ gridTemplateColumns: "repeat(2, 1fr)" }}>
                <StatCard
                    label="Total Rejected"
                    value={filtered.length}
                    changeLabel="Corrections rejected to date"
                    changeType={filtered.length > 0 ? "down" : "neutral"}
                />
                <StatCard
                    label="Employees w/ 2+ Rejections"
                    value={repeatCount}
                    changeLabel="Worth a closer look"
                    changeType={repeatCount > 0 ? "down" : "neutral"}
                />
            </div>

            <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 20, flexWrap: "wrap" }}>
                <Input
                    placeholder="Search by task, employee, reason…"
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
                <Select
                    placeholder="Employee"
                    allowClear
                    value={employeeFilter}
                    onChange={setEmployeeFilter}
                    style={{ width: 170 }}
                    options={employeeOptions}
                />
                <RangePicker
                    value={dateRange}
                    onChange={(v) => setDateRange(v as [dayjs.Dayjs, dayjs.Dayjs] | null)}
                    format="DD MMM YYYY"
                    style={{ height: 35 }}
                />
                <Button
                    onClick={fetchRejected}
                    icon={<ReloadOutlined />}
                    className="db-card-action"
                    style={{ height: 35, fontSize: 12, fontWeight: 600, display: "flex", alignItems: "center", gap: 6, paddingInline: 14 }}
                >
                    Refresh
                </Button>
                <span style={{ fontSize: 12, color: "var(--text-muted)", marginLeft: "auto" }}>
                    {filtered.length} of {rows.length} rejected
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
                    scroll={{ x: 1300 }}
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