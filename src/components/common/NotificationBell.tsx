// NotificationBell.tsx
// Header Notification Bell with Unread Badge & Interactive Popover Dropdown
// Polls unread count every 20 seconds and navigates to target task/request on click.

import { useEffect, useState, useCallback, useRef } from "react";
import { Badge, Popover, Button, Spin, Empty } from "antd";
import {
    BellOutlined,
    CheckCircleFilled,
    CheckCircleOutlined,
    CloseCircleFilled,
    ExclamationCircleFilled,
    FileTextOutlined,
    SendOutlined,
    InboxOutlined,
    ReloadOutlined,
} from "@ant-design/icons";
import { useNavigate } from "react-router-dom";
import dayjs from "dayjs";
import relativeTime from "dayjs/plugin/relativeTime";

dayjs.extend(relativeTime);

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

interface NotificationItem {
    id: number;
    sender_name: string;
    title: string;
    message: string;
    event_type: string;
    action_url: string;
    is_read: boolean;
    created_at: string;
}

function getEventIcon(eventType: string, title: string = "") {
    // Check if it's explicitly 'request_rejected' or a decided request where title contains 'reject'
    if (
        eventType === "request_rejected" ||
        (eventType === "request_decided" && title.toLowerCase().includes("reject"))
    ) {
        return (
            <div
                style={{
                    width: 28,
                    height: 28,
                    borderRadius: "50%",
                    background: "#fef2f2",
                    color: "#dc2626",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    fontSize: 13,
                    flexShrink: 0,
                }}
            >
                <CloseCircleFilled />
            </div>
        );
    }

    switch (eventType) {
        case "task_assigned":
            return (
                <div
                    style={{
                        width: 28,
                        height: 28,
                        borderRadius: "50%",
                        background: "#eff6ff",
                        color: "#2563eb",
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                        fontSize: 13,
                        flexShrink: 0,
                    }}
                >
                    <FileTextOutlined />
                </div>
            );
        case "task_submitted":
            return (
                <div
                    style={{
                        width: 28,
                        height: 28,
                        borderRadius: "50%",
                        background: "#faf5ff",
                        color: "#9333ea",
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                        fontSize: 13,
                        flexShrink: 0,
                    }}
                >
                    <SendOutlined />
                </div>
            );
        case "task_rework":
            return (
                <div
                    style={{
                        width: 28,
                        height: 28,
                        borderRadius: "50%",
                        background: "#fffbeb",
                        color: "#d97706",
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                        fontSize: 13,
                        flexShrink: 0,
                    }}
                >
                    <ExclamationCircleFilled />
                </div>
            );
        case "task_approved":
        case "request_approved":
            return (
                <div
                    style={{
                        width: 28,
                        height: 28,
                        borderRadius: "50%",
                        background: "#ecfdf5",
                        color: "#059669",
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                        fontSize: 13,
                        flexShrink: 0,
                    }}
                >
                    <CheckCircleFilled />
                </div>
            );
        case "request_created":
            return (
                <div
                    style={{
                        width: 28,
                        height: 28,
                        borderRadius: "50%",
                        background: "#f0fdfa",
                        color: "#0d9488",
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                        fontSize: 13,
                        flexShrink: 0,
                    }}
                >
                    <InboxOutlined />
                </div>
            );
        case "request_rejected":
            return (
                <div
                    style={{
                        width: 28,
                        height: 28,
                        borderRadius: "50%",
                        background: "#fef2f2",
                        color: "#dc2626",
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                        fontSize: 13,
                        flexShrink: 0,
                    }}
                >
                    <CloseCircleFilled />
                </div>
            );
        case "request_decided":
            return (
                <div
                    style={{
                        width: 28,
                        height: 28,
                        borderRadius: "50%",
                        background: "#f1f5f9",
                        color: "#475569",
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                        fontSize: 13,
                        flexShrink: 0,
                    }}
                >
                    <CheckCircleOutlined />
                </div>
            );
        default:
            return (
                <div
                    style={{
                        width: 28,
                        height: 28,
                        borderRadius: "50%",
                        background: "#f3f4f6",
                        color: "#4b5563",
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                        fontSize: 13,
                        flexShrink: 0,
                    }}
                >
                    <BellOutlined />
                </div>
            );
    }
}

export default function NotificationBell() {
    const navigate = useNavigate();
    const [unreadCount, setUnreadCount] = useState<number>(0);
    const [notifications, setNotifications] = useState<NotificationItem[]>([]);
    const [open, setOpen] = useState<boolean>(false);
    const [loading, setLoading] = useState<boolean>(false);
    const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

    // Fetch unread count for badge
    const fetchUnreadCount = useCallback(() => {
        fetch(`${BASE_URL}/api/tasks/notifications/unread_count/`, {
            headers: { ...authHeaders() },
        })
            .then((r) => (r.ok ? r.json() : null))
            .then((data) => {
                if (data && typeof data.unread_count === "number") {
                    setUnreadCount(data.unread_count);
                }
            })
            .catch(() => {});
    }, []);

    // Fetch full notification list when popover opens
    const fetchNotifications = useCallback(() => {
        setLoading(true);
        fetch(`${BASE_URL}/api/tasks/notifications/`, {
            headers: { ...authHeaders() },
        })
            .then((r) => (r.ok ? r.json() : []))
            .then((data: NotificationItem[]) => {
                if (Array.isArray(data)) {
                    setNotifications(data);
                    const unread = data.filter((n) => !n.is_read).length;
                    setUnreadCount(unread);
                }
            })
            .catch(() => {})
            .finally(() => setLoading(false));
    }, []);

    // Set up polling interval (every 20 seconds)
    useEffect(() => {
        fetchUnreadCount();
        timerRef.current = setInterval(fetchUnreadCount, 20000);
        return () => {
            if (timerRef.current) clearInterval(timerRef.current);
        };
    }, [fetchUnreadCount]);

    // When popover opens, fetch notifications
    const handleOpenChange = (newOpen: boolean) => {
        setOpen(newOpen);
        if (newOpen) {
            fetchNotifications();
        }
    };

    // Mark single notification as read & navigate to action_url
    const handleItemClick = (item: NotificationItem) => {
        if (!item.is_read) {
            fetch(`${BASE_URL}/api/tasks/notifications/${item.id}/mark_read/`, {
                method: "POST",
                headers: { ...authHeaders(), "Content-Type": "application/json" },
            }).catch(() => {});

            // Optimistically mark as read in local state
            setNotifications((prev) =>
                prev.map((n) => (n.id === item.id ? { ...n, is_read: true } : n))
            );
            setUnreadCount((prev) => Math.max(0, prev - 1));
        }

        setOpen(false);

        if (item.action_url) {
            navigate(item.action_url);
        }
    };

    // Mark all as read
    const handleMarkAllRead = () => {
        fetch(`${BASE_URL}/api/tasks/notifications/mark_all_read/`, {
            method: "POST",
            headers: { ...authHeaders(), "Content-Type": "application/json" },
        })
            .then(() => {
                setNotifications((prev) => prev.map((n) => ({ ...n, is_read: true })));
                setUnreadCount(0);
            })
            .catch(() => {});
    };

    const popoverContent = (
        <div style={{ width: 360, maxWidth: "90vw" }}>
            {/* Header */}
            <div
                style={{
                    display: "flex",
                    justifyContent: "space-between",
                    alignItems: "center",
                    paddingBottom: 10,
                    marginBottom: 8,
                    borderBottom: "1px solid var(--border, #e2e8f0)",
                }}
            >
                <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                    <span style={{ fontSize: 14, fontWeight: 700, color: "var(--text-primary, #0f172a)" }}>
                        Notifications
                    </span>
                    {unreadCount > 0 && (
                        <span
                            style={{
                                fontSize: 11,
                                fontWeight: 600,
                                padding: "1px 6px",
                                borderRadius: 10,
                                background: "#eff6ff",
                                color: "#2563eb",
                            }}
                        >
                            {unreadCount} unread
                        </span>
                    )}
                </div>

                <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                    {unreadCount > 0 && (
                        <Button
                            type="link"
                            size="small"
                            onClick={handleMarkAllRead}
                            style={{ fontSize: 11.5, padding: 0, height: "auto" }}
                        >
                            Mark all read
                        </Button>
                    )}
                    <Button
                        type="text"
                        size="small"
                        icon={<ReloadOutlined style={{ fontSize: 12 }} />}
                        onClick={fetchNotifications}
                        loading={loading}
                    />
                </div>
            </div>

            {/* List */}
            {loading && notifications.length === 0 ? (
                <div style={{ padding: "30px 0", textAlign: "center" }}>
                    <Spin size="small" />
                </div>
            ) : notifications.length === 0 ? (
                <div style={{ padding: "24px 0" }}>
                    <Empty
                        image={Empty.PRESENTED_IMAGE_SIMPLE}
                        description={<span style={{ fontSize: 12, color: "var(--text-muted)" }}>No notifications</span>}
                    />
                </div>
            ) : (
                <div style={{ maxHeight: 380, overflowY: "auto", margin: "0 -8px", padding: "0 4px" }}>
                    {notifications.map((item) => (
                        <div
                            key={item.id}
                            onClick={() => handleItemClick(item)}
                            style={{
                                display: "flex",
                                alignItems: "flex-start",
                                gap: 10,
                                padding: "9px 10px",
                                borderRadius: 8,
                                cursor: "pointer",
                                transition: "background 0.15s ease",
                                background: item.is_read ? "transparent" : "var(--blue-bg, #f0f7ff)",
                                marginBottom: 4,
                            }}
                            onMouseEnter={(e) => {
                                e.currentTarget.style.backgroundColor = item.is_read
                                    ? "var(--bg-input, #f8fafc)"
                                    : "#e0f2fe";
                            }}
                            onMouseLeave={(e) => {
                                e.currentTarget.style.backgroundColor = item.is_read
                                    ? "transparent"
                                    : "var(--blue-bg, #f0f7ff)";
                            }}
                        >
                            {getEventIcon(item.event_type, item.title)}

                            <div style={{ flex: 1, minWidth: 0 }}>
                                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                                    <span
                                        style={{
                                            fontSize: 12.5,
                                            fontWeight: item.is_read ? 600 : 700,
                                            color: "var(--text-primary, #0f172a)",
                                        }}
                                    >
                                        {item.title}
                                    </span>
                                    <span style={{ fontSize: 10.5, color: "var(--text-muted, #94a3b8)", flexShrink: 0 }}>
                                        {dayjs(item.created_at).fromNow()}
                                    </span>
                                </div>
                                <div
                                    style={{
                                        fontSize: 11.5,
                                        color: "var(--text-secondary, #475569)",
                                        marginTop: 2,
                                        lineHeight: 1.4,
                                        wordBreak: "break-word",
                                    }}
                                >
                                    {item.message}
                                </div>
                            </div>

                            {!item.is_read && (
                                <span
                                    style={{
                                        width: 7,
                                        height: 7,
                                        borderRadius: "50%",
                                        background: "#2563eb",
                                        marginTop: 6,
                                        flexShrink: 0,
                                    }}
                                />
                            )}
                        </div>
                    ))}
                </div>
            )}
        </div>
    );

    return (
        <Popover
            content={popoverContent}
            trigger="click"
            open={open}
            onOpenChange={handleOpenChange}
            placement="bottomRight"
            arrow={{ pointAtCenter: true }}
        >
            <div
                className="db-icon-btn"
                title="Notifications"
                style={{
                    position: "relative",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    cursor: "pointer",
                }}
            >
                <Badge count={unreadCount} overflowCount={99} size="small" offset={[2, -2]}>
                    <BellOutlined style={{ fontSize: 16, color: "var(--text-secondary, #64748b)" }} />
                </Badge>
            </div>
        </Popover>
    );
}