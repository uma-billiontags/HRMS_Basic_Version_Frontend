// Audit_History_Employee.tsx
// Employee-facing — GET /api/my_activity/ returns every ActivityLog entry
// for tasks assigned to this employee, including admin-side actions like
// Approve/Rework — so the employee sees the full story of their task, not
// just the actions they personally clicked.

import { useEffect, useState, useCallback, useMemo } from "react";
import { Table, Button, Input, Select, message } from "antd";
import { SearchOutlined, ReloadOutlined } from "@ant-design/icons";
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

interface ActivityRow {
    id: number;
    task_id: string;
    sub_task_id: string | null;
    task_name: string;
    actor_name: string;
    actor_role: "admin" | "employee" | "system";
    action: string;
    action_label: string;
    from_status: string;
    to_status: string;
    details: Record<string, any>;
    created_at: string;
}

const ACTION_OPTIONS = [
    "started", "paused", "resumed", "submitted", "approved",
    "rework_requested", "correction_requested", "correction_decided",
].map((v) => ({ value: v, label: v.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase()) }));

// ── Same palette used across the other task screens ──
const ACTION_META: Record<string, { color: string; bg: string }> = {
    started: { color: "var(--blue)", bg: "var(--blue-bg)" },
    resumed: { color: "var(--blue)", bg: "var(--blue-bg)" },
    submitted: { color: "var(--purple)", bg: "var(--purple-bg)" },
    approved: { color: "var(--green)", bg: "var(--green-bg)" },
    correction_decided: { color: "var(--green)", bg: "var(--green-bg)" },
    paused: { color: "var(--amber)", bg: "var(--amber-bg)" },
    correction_requested: { color: "var(--amber)", bg: "var(--amber-bg)" },
    rework_requested: { color: "var(--red)", bg: "var(--red-bg)" },
};

function ActionTag({ action, label }: { action: string; label: string }) {
    const meta = ACTION_META[action] ?? { color: "var(--text-secondary)", bg: "var(--bg-input)" };
    return (
        <span style={{
            fontSize: 10.5, fontWeight: 700, padding: "3px 9px", borderRadius: 10,
            color: meta.color, background: meta.bg, whiteSpace: "nowrap",
        }}>
            {label}
        </span>
    );
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

function summarizeDetails(details: Record<string, any>): string {
    if (!details || Object.keys(details).length === 0) return "—";
    return Object.entries(details)
        .slice(0, 3)
        .map(([k, v]) => `${k.replace(/_/g, " ")}: ${v}`)
        .join(" · ");
}

export default function Audit_History_Employee() {
    const [rows, setRows] = useState<ActivityRow[]>([]);
    const [loading, setLoading] = useState(true);
    const [search, setSearch] = useState("");
    const [actionFilter, setActionFilter] = useState<string | undefined>(undefined);

    const fetchActivity = useCallback(() => {
        setLoading(true);
        fetch(`${BASE_URL}/api/tasks/my_activity/`, { headers: { ...authHeaders() } })
            .then((r) => r.json())
            .then((d) => setRows(Array.isArray(d) ? d : d.results || []))
            .catch(() => message.error("Failed to load your activity history"))
            .finally(() => setLoading(false));
    }, []);

    useEffect(() => {
        fetchActivity();
    }, [fetchActivity]);

    const filtered = useMemo(() => {
        return rows.filter((r) => {
            if (actionFilter && r.action !== actionFilter) return false;
            if (search.trim()) {
                const q = search.toLowerCase();
                if (![r.task_id, r.sub_task_id, r.task_name, r.action_label].some((f) => f?.toLowerCase().includes(q))) return false;
            }
            return true;
        });
    }, [rows, search, actionFilter]);

    const myActionsCount = rows.filter((r) => r.actor_role === "employee").length;

    const columns: ColumnsType<ActivityRow> = [
        {
            title: "When",
            dataIndex: "created_at",
            key: "created_at",
            width: 140,
            render: (v: string) => (
                <span style={{ fontSize: 11.5, color: "var(--text-secondary)" }}>{dayjs(v).format("DD MMM, HH:mm")}</span>
            ),
        },
        {
            title: "Task ID",
            key: "task",
            width: 200,
            render: (_: any, r: ActivityRow) => (
                <div>
                    <span style={{
                        fontSize: 11.5, fontWeight: 700, color: "var(--blue)", background: "var(--blue-bg)",
                        border: "1px solid var(--blue)", padding: "2px 10px", borderRadius: 6, whiteSpace: "nowrap",
                    }}>
                        {r.task_id}
                    </span>
                </div>
            ),
        },
        {
            title: "Sub Task ID",
            key: "sub_task_id",
            width: 200,
            render: (_: any, r: ActivityRow) => (
                <div>
                    {r.sub_task_id ? (
                        <span style={{
                            fontSize: 11.5, fontWeight: 700, color: "var(--green)", background: "var(--green-bg)",
                            border: "1px solid var(--green)", padding: "2px 10px", borderRadius: 6, whiteSpace: "nowrap",
                        }}>
                            {r.sub_task_id}
                        </span>
                    ) : (
                        <span style={{ color: "var(--text-muted)", fontSize: 12 }}>—</span>
                    )}

                    <div style={{ fontSize: 12.5, fontWeight: 600, color: "var(--text-primary)", marginTop: 4 }}>
                        {r.task_name}
                    </div>
                </div>
            ),
        },
        {
            title: "By",
            key: "actor",
            width: 140,
            render: (_: any, r: ActivityRow) => (
                <div>
                    <div style={{ fontSize: 12.5, fontWeight: 600, color: "var(--text-primary)" }}>{r.actor_name}</div>
                    <div style={{ fontSize: 10, color: "var(--text-muted)", textTransform: "capitalize" }}>{r.actor_role}</div>
                </div>
            ),
        },
        {
            title: "Action",
            dataIndex: "action",
            key: "action",
            width: 150,
            render: (v: string, r: ActivityRow) => <ActionTag action={v} label={r.action_label} />,
        },
        {
            title: "Status Change",
            key: "status_change",
            width: 180,
            render: (_: any, r: ActivityRow) => (
                r.from_status || r.to_status ? (
                    <span style={{ fontSize: 11.5, color: "var(--text-secondary)" }}>
                        {r.from_status ? r.from_status.replace(/_/g, " ") : "—"}{" "}
                        <span style={{ color: "var(--text-muted)" }}>→</span>{" "}
                        {r.to_status ? r.to_status.replace(/_/g, " ") : "—"}
                    </span>
                ) : <span style={{ color: "var(--text-muted)", fontSize: 12 }}>—</span>
            ),
        },
        {
            title: "Details",
            key: "details",
            width: 260,
            render: (_: any, r: ActivityRow) => (
                <div
                    style={{
                        fontSize: 11, color: "var(--text-secondary)", maxWidth: 260,
                        overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
                    }}
                    title={summarizeDetails(r.details)}
                >
                    {summarizeDetails(r.details)}
                </div>
            ),
        },
    ];

    return (
        <div>
            <div className="db-stat-grid" style={{ gridTemplateColumns: "repeat(2, 1fr)" }}>
                <StatCard
                    label="Total Events"
                    value={rows.length}
                    changeLabel="Across all your tasks"
                    changeType="neutral"
                />
                <StatCard
                    label="Your Own Actions"
                    value={myActionsCount}
                    changeLabel="Actions you personally took"
                    changeType="up"
                />
            </div>

            <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 20, flexWrap: "wrap" }}>
                <Input
                    placeholder="Search by task or action…"
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
                    placeholder="Action"
                    allowClear
                    value={actionFilter}
                    onChange={setActionFilter}
                    style={{ width: 170 }}
                    options={ACTION_OPTIONS}
                />
                <Button
                    onClick={fetchActivity}
                    icon={<ReloadOutlined />}
                    className="db-card-action"
                    style={{ height: 35, fontSize: 12, fontWeight: 600, display: "flex", alignItems: "center", gap: 6, paddingInline: 14 }}
                >
                    Refresh
                </Button>
                <span style={{ fontSize: 12, color: "var(--text-muted)", marginLeft: "auto" }}>
                    {filtered.length} of {rows.length} events
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
                        pageSize: 15,
                        showSizeChanger: true,
                        pageSizeOptions: ["15", "30", "50"],
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