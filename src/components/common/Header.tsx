// Header.tsx
// Top navigation header bar for HRMS
// Displays current page title with icon and uppercase subtitle, Refresh button, NotificationBell, and active user profile.

import React, { useState } from "react";
import { useLocation } from "react-router-dom";
import { Button } from "antd";
import {
    DashboardOutlined,
    CalendarOutlined,
    CheckSquareOutlined,
    ClockCircleOutlined,
    CheckCircleOutlined,
    UnorderedListOutlined,
    FolderOpenOutlined,
    AlertOutlined,
    SyncOutlined,
    AuditOutlined,
    ScheduleOutlined,
    CloseCircleOutlined,
    MailOutlined,
    UsergroupAddOutlined,
    BarChartOutlined,
    TrophyOutlined,
    HistoryOutlined,
    TeamOutlined,
    AppstoreOutlined,
    ReloadOutlined,
} from "@ant-design/icons";
import NotificationBell from "./NotificationBell";

interface HeaderProps {
    role: "admin" | "employee";
    userName: string;
    isTL?: boolean;
}

interface HeaderConfig {
    title: string;
    subtitle: string;
    icon: React.ReactNode;
}

const ROUTE_CONFIGS: Record<string, HeaderConfig> = {
    // ── Admin routes ──
    "/admin/dashboard": {
        title: "Dashboard",
        subtitle: "Overview of metrics, activities, and daily progress",
        icon: <DashboardOutlined />,
    },
    "/admin/attendance": {
        title: "Attendance Administration",
        subtitle: "Monitor punches, monthly attendance sheets, and regularization",
        icon: <CalendarOutlined />,
    },
    "/admin/my_tasks": {
        title: "Assigned Tasks",
        subtitle: "Tasks a team lead assigned directly to you",
        icon: <CheckSquareOutlined />,
    },
    "/admin/my_upcoming_tasks": {
        title: "Upcoming Tasks",
        subtitle: "Your personal upcoming scheduled tasks",
        icon: <CalendarOutlined />,
    },
    "/admin/my_submitted_tasks": {
        title: "Submitted Tasks (Assigned by TL)",
        subtitle: "Tasks awaiting review — review outcomes determine completed or rework",
        icon: <ClockCircleOutlined />,
    },
    "/admin/my_completed_tasks": {
        title: "Completed Tasks (Assigned by TL)",
        subtitle: "Your finished work — review outcomes and archive",
        icon: <CheckCircleOutlined />,
    },
    "/admin/all_tasks": {
        title: "Task Management",
        subtitle: "All tasks — create, assign, and track every task's status",
        icon: <UnorderedListOutlined />,
    },
    "/admin/open_tasks": {
        title: "Open Tasks",
        subtitle: "In progress, paused, and rework-needed — work currently in flight",
        icon: <FolderOpenOutlined />,
    },
    "/admin/overdue_tasks": {
        title: "Overdue Tasks",
        subtitle: "Past due date and not yet completed, cancelled, or archived",
        icon: <AlertOutlined />,
    },
    "/admin/rework_tasks": {
        title: "Rework Tasks",
        subtitle: "Every task sent back for rework — tracked through its full lifecycle",
        icon: <SyncOutlined />,
    },
    "/admin/review_tasks": {
        title: "Review Tasks",
        subtitle: "Approve or send back submitted tasks",
        icon: <AuditOutlined />,
    },
    "/admin/upcoming_scheduled_tasks": {
        title: "Upcoming Scheduled Tasks",
        subtitle: "View upcoming multi-day scheduled tasks & untick specific dates to skip them",
        icon: <ScheduleOutlined />,
    },
    "/admin/completed_tasks": {
        title: "Completed Tasks",
        subtitle: "Finished work — review outcomes and archive",
        icon: <CheckCircleOutlined />,
    },
    "/admin/cancel_tasks": {
        title: "Cancelled Tasks",
        subtitle: "Tasks that were cancelled before completion",
        icon: <CloseCircleOutlined />,
    },
    "/admin/requests": {
        title: "Employee Requests",
        subtitle: "Review leave, permission, and time correction requests",
        icon: <MailOutlined />,
    },
    "/admin/approved_requests": {
        title: "Approved Requests",
        subtitle: "History of all approved leave and permission requests",
        icon: <CheckCircleOutlined />,
    },
    "/admin/rejected_requests": {
        title: "Rejected Requests",
        subtitle: "History of all rejected requests",
        icon: <CloseCircleOutlined />,
    },
    "/admin/pending_time_correction_requests": {
        title: "Pending Time Correction Requests",
        subtitle: "Review and decide employee punch correction requests",
        icon: <ClockCircleOutlined />,
    },
    "/admin/team_access": {
        title: "Team Access Control",
        subtitle: "Manage employee and admin login credentials",
        icon: <UsergroupAddOutlined />,
    },
    "/admin/reports": {
        title: "Reports & Analytics",
        subtitle: "Org-wide task performance and time tracking insights",
        icon: <BarChartOutlined />,
    },
    "/admin/performance": {
        title: "Performance & Appraisal Tracker",
        subtitle: "Monthly Task Performance & Appraisal Consistency Tracker (Target: 200h / Month)",
        icon: <TrophyOutlined />,
    },
    "/admin/audit_history": {
        title: "Audit History",
        subtitle: "Every recorded action and system event, sitewide",
        icon: <HistoryOutlined />,
    },

    // ── Employee & TL routes ──
    "/employee/dashboard": {
        title: "Dashboard",
        subtitle: "Overview of metrics, activities, and daily progress",
        icon: <DashboardOutlined />,
    },
    "/employee/attendance": {
        title: "Attendance & Punch Management",
        subtitle: "Track daily check-in/out, production hours, and regularization",
        icon: <CalendarOutlined />,
    },
    "/employee/all_tasks": {
        title: "Assigned Tasks",
        subtitle: "Tasks assigned to you — start, pause, resume, or submit",
        icon: <CheckSquareOutlined />,
    },
    "/employee/my_upcoming_tasks": {
        title: "Upcoming Tasks",
        subtitle: "Your scheduled upcoming daily tasks",
        icon: <CalendarOutlined />,
    },
    "/employee/submitted_tasks": {
        title: "Submitted Tasks (Assigned by TL)",
        subtitle: "Tasks awaiting review — review outcomes determine completed or rework",
        icon: <ClockCircleOutlined />,
    },
    "/employee/completed_tasks": {
        title: "Completed Tasks",
        subtitle: "Your finished work — review outcomes",
        icon: <CheckCircleOutlined />,
    },
    "/employee/requests": {
        title: "Email Requests",
        subtitle: "Send and manage employee leave and permission requests",
        icon: <MailOutlined />,
    },
    "/employee/approved_requests": {
        title: "Approved Requests",
        subtitle: "History of your approved requests",
        icon: <CheckCircleOutlined />,
    },
    "/employee/rejected_requests": {
        title: "Rejected Requests",
        subtitle: "History of your rejected requests",
        icon: <CloseCircleOutlined />,
    },
    "/employee/reports": {
        title: "My Reports",
        subtitle: "Your task performance summary and productivity metrics",
        icon: <BarChartOutlined />,
    },
    "/employee/performance": {
        title: "My Performance & Appraisal",
        subtitle: "Monthly Task Performance & Appraisal Consistency Tracker (Target: 200h / Month)",
        icon: <TrophyOutlined />,
    },
    "/employee/audit_history": {
        title: "Activity History",
        subtitle: "Everything that happened on your tasks",
        icon: <HistoryOutlined />,
    },
    "/employee/tl_tasks": {
        title: "Team Tasks",
        subtitle: "Tasks you created — assign to your team or take one yourself",
        icon: <TeamOutlined />,
    },
    "/employee/tl_review_tasks": {
        title: "Review Queue",
        subtitle: "Approve or send back tasks you assigned to your team",
        icon: <AuditOutlined />,
    },
    "/employee/tl_completed_tasks": {
        title: "Team Completed Tasks",
        subtitle: "Tasks assigned by you that have been reviewed & approved",
        icon: <CheckCircleOutlined />,
    },
    "/employee/upcoming_scheduled_tasks": {
        title: "Upcoming Scheduled Tasks",
        subtitle: "Schedules you created — untick any specific date to skip that day for the assigned member",
        icon: <ScheduleOutlined />,
    },
};

const FALLBACK_CONFIG: HeaderConfig = {
    title: "HRMS Portal",
    subtitle: "Human Resource & Task Management System",
    icon: <AppstoreOutlined />,
};

export default function Header({ role, userName, isTL = false }: HeaderProps) {
    const location = useLocation();
    const [isRefreshing, setIsRefreshing] = useState(false);

    const handleRefresh = () => {
        setIsRefreshing(true);
        setTimeout(() => {
            window.location.reload();
        }, 150);
    };

    // Determine current page configuration
    const currentPath = location.pathname.toLowerCase().replace(/\/$/, "");
    let config = ROUTE_CONFIGS[currentPath];
    if (!config) {
        const matchedKey = Object.keys(ROUTE_CONFIGS).find((key) =>
            currentPath.startsWith(key)
        );
        config = matchedKey ? ROUTE_CONFIGS[matchedKey] : FALLBACK_CONFIG;
    }

    // Dynamic title & subtitle for Dashboard: "Welcome back, {userName}"
    const isDashboard = currentPath === "/admin/dashboard" || currentPath === "/employee/dashboard";
    const titleText = isDashboard
        ? `Welcome back${userName ? `, ${userName}` : ""}`
        : config.title;
    const subtitleText = isDashboard
        ? "Overview of metrics, activities, and daily progress"
        : config.subtitle;

    const roleBadgeText = role === "admin" ? "Admin" : isTL ? "Team Lead" : "Employee";
    const roleBadgeColor =
        role === "admin"
            ? { bg: "#fef3c7", text: "#92400e", border: "#fde68a" }
            : isTL
            ? { bg: "#ede9fe", text: "#6d28d9", border: "#ddd6fe" }
            : { bg: "#f1f5f9", text: "#475569", border: "#e2e8f0" };

    return (
        <header className="db-header">
            {/* Left: Icon, Page Title, and Uppercase Subtitle */}
            <div className="db-header-left">
                <div style={{ display: "flex", flexDirection: "column", justifyContent: "center" }}>
                    <div
                        style={{
                            fontSize: 16,
                            fontWeight: 700,
                            margin: 0,
                            color: "var(--accent)",
                            display: "flex",
                            alignItems: "center",
                            gap: 8,
                        }}
                    >
                        {config.icon}
                        <span>{titleText}</span>
                    </div>
                    <p
                        style={{
                            fontSize: 9,
                            color: "var(--text-muted)",
                            margin: "2px 0 0",
                            fontWeight: 500,
                            letterSpacing: "0.04em",
                            textTransform: "uppercase",
                        }}
                    >
                        {subtitleText}
                    </p>
                </div>
            </div>

            {/* Right: Refresh button, Notifications & User profile pill */}
            <div className="db-header-right" style={{ display: "flex", alignItems: "center", gap: 12 }}>
                {/* Global Refresh Button */}
                <Button
                    onClick={handleRefresh}
                    icon={<ReloadOutlined spin={isRefreshing} style={{ fontSize: 13, color: "var(--accent)" }} />}
                    loading={isRefreshing}
                    style={{
                        display: "flex",
                        alignItems: "center",
                        gap: 6,
                        height: 32,
                        padding: "0 12px",
                        borderRadius: 8,
                        border: "1px solid var(--border, #e2e8f0)",
                        background: "var(--bg-card, #ffffff)",
                        color: "var(--accent, #16284F)",
                        fontSize: 12,
                        fontWeight: 600,
                        cursor: "pointer",
                        transition: "all 0.15s ease",
                    }}
                >
                    Refresh
                </Button>

                {/* Notifications */}
                <NotificationBell />

                {/* User Profile Pill */}
                <div
                    className="db-header-user"
                    style={{
                        display: "flex",
                        alignItems: "center",
                        gap: 10,
                        padding: "4px 10px",
                        borderRadius: 20,
                        background: "var(--bg-card, #ffffff)",
                        border: "1px solid var(--border, #e2e8f0)",
                    }}
                >
                    <div className="db-header-avatar" style={{ width: 28, height: 28, fontSize: 12 }}>
                        {userName ? userName.charAt(0).toUpperCase() : "U"}
                    </div>
                    <div style={{ display: "flex", flexDirection: "column", lineHeight: 1.15 }}>
                        <span className="db-header-uname" style={{ fontSize: 12, fontWeight: 600 }}>
                            {userName}
                        </span>
                        <span
                            style={{
                                fontSize: 9.5,
                                fontWeight: 700,
                                textTransform: "uppercase",
                                letterSpacing: "0.03em",
                                color: roleBadgeColor.text,
                            }}
                        >
                            {roleBadgeText}
                        </span>
                    </div>
                </div>
            </div>
        </header>
    );
}
