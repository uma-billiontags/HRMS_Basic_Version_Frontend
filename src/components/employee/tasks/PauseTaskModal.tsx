import { useState } from "react";
import { Modal, Button, Input, Tag, message } from "antd";
import {
    CoffeeOutlined,
    FileTextOutlined,
    PauseCircleOutlined,
} from "@ant-design/icons";
import { MdRestaurant } from "react-icons/md";

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

interface TaskTarget {
    id: number;
    task_name: string;
    task_id?: string;
}

interface Props {
    open: boolean;
    task: TaskTarget | null;
    onClose: () => void;
    onSuccess: (pauseData?: any) => void;
}

const QUICK_REASONS = [
    "Team Meeting",
    "Client Discussion",
    "System / Internet Issue",
    "Official Discussion",
    "Personal Work",
];

export default function PauseTaskModal({ open, task, onClose, onSuccess }: Props) {
    const [mode, setMode] = useState<"break" | "another_reason">("break");
    const [customReason, setCustomReason] = useState("");
    const [submitting, setSubmitting] = useState(false);

    const handlePause = async (params: {
        pause_type: "break" | "another_reason";
        break_option?: string;
        break_duration_minutes?: number;
        reason?: string;
    }) => {
        if (!task) return;

        setSubmitting(true);
        try {
            const res = await fetch(`${BASE_URL}/api/tasks/${task.id}/pause/`, {
                method: "POST",
                headers: { "Content-Type": "application/json", ...authHeaders() },
                body: JSON.stringify(params),
            });

            if (res.ok) {
                const data = await res.json().catch(() => ({}));
                message.success(
                    params.pause_type === "break"
                        ? `Break started (${params.break_duration_minutes} mins)`
                        : "Task paused"
                );
                handleClose();
                onSuccess(data?.active_pause);
            } else {
                const err = await res.json().catch(() => ({}));
                message.error(err.detail || "Failed to pause task");
            }
        } catch {
            message.error("Network error while pausing task");
        } finally {
            setSubmitting(false);
        }
    };

    const handleClose = () => {
        setMode("break");
        setCustomReason("");
        onClose();
    };

    return (
        <Modal
            open={open}
            onCancel={handleClose}
            footer={null}
            width={520}
            centered
            destroyOnClose
            title={
                <div style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 16 }}>
                    <PauseCircleOutlined style={{ color: "#d97706" }} />
                    <span>Pause Task: <strong style={{ color: "var(--accent)" }}>{task?.task_name}</strong></span>
                </div>
            }
        >
            <div style={{ marginTop: 12 }}>
                {/* ── Mode Selection Buttons ── */}
                <div
                    style={{
                        display: "flex",
                        gap: 10,
                        padding: 4,
                        background: "#f5f5f5",
                        borderRadius: 10,
                        marginBottom: 20,
                    }}
                >
                    <button
                        type="button"
                        onClick={() => setMode("break")}
                        style={{
                            flex: 1,
                            padding: "8px 16px",
                            border: "none",
                            borderRadius: 8,
                            background: mode === "break" ? "#fff" : "transparent",
                            boxShadow: mode === "break" ? "0 2px 6px rgba(0,0,0,0.08)" : "none",
                            fontWeight: 700,
                            color: mode === "break" ? "#d97706" : "#595959",
                            cursor: "pointer",
                            display: "flex",
                            alignItems: "center",
                            justifyContent: "center",
                            gap: 8,
                            fontSize: 13,
                            transition: "all 0.2s",
                        }}
                    >
                        <CoffeeOutlined />
                        <span>Break</span>
                    </button>

                    <button
                        type="button"
                        onClick={() => setMode("another_reason")}
                        style={{
                            flex: 1,
                            padding: "8px 16px",
                            border: "none",
                            borderRadius: 8,
                            background: mode === "another_reason" ? "#fff" : "transparent",
                            boxShadow: mode === "another_reason" ? "0 2px 6px rgba(0,0,0,0.08)" : "none",
                            fontWeight: 700,
                            color: mode === "another_reason" ? "#1677ff" : "#595959",
                            cursor: "pointer",
                            display: "flex",
                            alignItems: "center",
                            justifyContent: "center",
                            gap: 8,
                            fontSize: 13,
                            transition: "all 0.2s",
                        }}
                    >
                        <FileTextOutlined />
                        <span>Another Reason</span>
                    </button>
                </div>

                {/* ── Mode 1: BREAK CARDS (matching screenshot 2) ── */}
                {mode === "break" && (
                    <div style={{ textAlign: "center", padding: "8px 0 16px" }}>
                        <div
                            style={{
                                fontSize: 15,
                                fontWeight: 600,
                                color: "#262626",
                                marginBottom: 18,
                                letterSpacing: "0.01em",
                            }}
                        >
                            Resume Time Champ after ......
                        </div>

                        <div style={{ display: "flex", justifyContent: "center", gap: 24, flexWrap: "wrap" }}>
                            {/* 15 Minutes Card */}
                            <button
                                type="button"
                                disabled={submitting}
                                onClick={() =>
                                    handlePause({
                                        pause_type: "break",
                                        break_option: "15_mins",
                                        break_duration_minutes: 15,
                                        reason: "15 Mins Refreshment Break",
                                    })
                                }
                                style={{
                                    width: 170,
                                    height: 160,
                                    background: "#c27827",
                                    border: "none",
                                    borderRadius: 14,
                                    cursor: submitting ? "not-allowed" : "pointer",
                                    display: "flex",
                                    flexDirection: "column",
                                    alignItems: "center",
                                    justifyContent: "center",
                                    gap: 14,
                                    color: "#fff",
                                    boxShadow: "0 6px 14px rgba(194, 120, 39, 0.35)",
                                    transition: "transform 0.15s, box-shadow 0.15s, opacity 0.15s",
                                    opacity: submitting ? 0.7 : 1,
                                }}
                                onMouseEnter={(e) => {
                                    if (!submitting) {
                                        e.currentTarget.style.transform = "translateY(-3px)";
                                        e.currentTarget.style.boxShadow = "0 8px 18px rgba(194, 120, 39, 0.45)";
                                    }
                                }}
                                onMouseLeave={(e) => {
                                    e.currentTarget.style.transform = "translateY(0)";
                                    e.currentTarget.style.boxShadow = "0 6px 14px rgba(194, 120, 39, 0.35)";
                                }}
                            >
                                <CoffeeOutlined style={{ fontSize: 36, color: "#fff" }} />
                                <div>
                                    <div style={{ fontSize: 18, fontWeight: 700 }}>15 minutes</div>
                                    <div style={{ fontSize: 11, opacity: 0.85, marginTop: 2 }}>Refreshment Break</div>
                                </div>
                            </button>

                            {/* 30 Minutes Card */}
                            <button
                                type="button"
                                disabled={submitting}
                                onClick={() =>
                                    handlePause({
                                        pause_type: "break",
                                        break_option: "30_mins",
                                        break_duration_minutes: 30,
                                        reason: "30 Mins Lunch Break",
                                    })
                                }
                                style={{
                                    width: 170,
                                    height: 160,
                                    background: "#c27827",
                                    border: "none",
                                    borderRadius: 14,
                                    cursor: submitting ? "not-allowed" : "pointer",
                                    display: "flex",
                                    flexDirection: "column",
                                    alignItems: "center",
                                    justifyContent: "center",
                                    gap: 14,
                                    color: "#fff",
                                    boxShadow: "0 6px 14px rgba(194, 120, 39, 0.35)",
                                    transition: "transform 0.15s, box-shadow 0.15s, opacity 0.15s",
                                    opacity: submitting ? 0.7 : 1,
                                }}
                                onMouseEnter={(e) => {
                                    if (!submitting) {
                                        e.currentTarget.style.transform = "translateY(-3px)";
                                        e.currentTarget.style.boxShadow = "0 8px 18px rgba(194, 120, 39, 0.45)";
                                    }
                                }}
                                onMouseLeave={(e) => {
                                    e.currentTarget.style.transform = "translateY(0)";
                                    e.currentTarget.style.boxShadow = "0 6px 14px rgba(194, 120, 39, 0.35)";
                                }}
                            >
                                <MdRestaurant style={{ fontSize: 36, color: "#fff" }} />
                                <div>
                                    <div style={{ fontSize: 18, fontWeight: 700 }}>30 minutes</div>
                                    <div style={{ fontSize: 11, opacity: 0.85, marginTop: 2 }}>Lunch Break</div>
                                </div>
                            </button>
                        </div>
                    </div>
                )}

                {/* ── Mode 2: ANOTHER REASON FORM ── */}
                {mode === "another_reason" && (
                    <div style={{ padding: "8px 4px 12px" }}>
                        <div style={{ marginBottom: 10, fontSize: 13, fontWeight: 600, color: "#262626" }}>
                            Specify the reason for pausing:
                        </div>

                        {/* Quick tags */}
                        <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginBottom: 12 }}>
                            {QUICK_REASONS.map((r) => (
                                <Tag
                                    key={r}
                                    style={{
                                        cursor: "pointer",
                                        padding: "4px 10px",
                                        borderRadius: 6,
                                        fontSize: 11.5,
                                        userSelect: "none",
                                        border: customReason === r ? "1px solid #1677ff" : "1px solid #d9d9d9",
                                        background: customReason === r ? "#e6f4ff" : "#fafafa",
                                        color: customReason === r ? "#1677ff" : "#595959",
                                    }}
                                    onClick={() => setCustomReason(r)}
                                >
                                    {r}
                                </Tag>
                            ))}
                        </div>

                        <Input.TextArea
                            rows={3}
                            placeholder="Type details or reason for pause..."
                            value={customReason}
                            onChange={(e) => setCustomReason(e.target.value)}
                            maxLength={300}
                            showCount
                            style={{ borderRadius: 8, marginBottom: 18 }}
                        />

                        <div style={{ display: "flex", justifyContent: "flex-end", gap: 10 }}>
                            <Button onClick={handleClose} disabled={submitting}>
                                Cancel
                            </Button>
                            <Button
                                type="primary"
                                loading={submitting}
                                disabled={!customReason.trim()}
                                onClick={() =>
                                    handlePause({
                                        pause_type: "another_reason",
                                        reason: customReason.trim(),
                                    })
                                }
                                style={{ background: "var(--accent)", border: "none", borderRadius: 8 }}
                            >
                                Confirm Pause
                            </Button>
                        </div>
                    </div>
                )}
            </div>
        </Modal>
    );
}
