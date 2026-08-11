// Sidebar.tsx
// One reusable sidebar for admin, employee, and TL. Pass role="admin" or
// role="employee", and for employees also pass isTL — TLs get their own
// nav (My Task = self-assigned tasks, Team Tasks = tasks they created,
// same as a plain employee otherwise) instead of the regular employee nav.
//
// isTL should come from /api/auth/me/'s `is_tl` field (see accounts/views.py
// me_view) — fetch it once in AuthContext right after login and pass it
// down here, rather than re-fetching per-page.
//
// Usage:
//   <Sidebar role={user.role} userName={user.name} isTL={user.isTL} />

import { Link, useLocation, useNavigate } from "react-router-dom";
import {
    LayoutDashboard,
    ClipboardList,
    ClipboardCheck,
    CheckCircle2,
    // CheckCircle,
    XCircle,
    Archive,
    // Clock,
    History,
    BarChart3,
    LogOut,
     ListChecks,
    UsersRound,
    type LucideIcon,
} from "lucide-react";
import { useAuth } from "./AuthContext";

// ── Nav config ──────────────────────────────────────────────────────────────

interface NavItem {
    label: string;
    icon: LucideIcon;
    to: string;
}

interface NavGroup {
    section?: string;
    items: NavItem[];
}

const ADMIN_NAV: NavGroup[] = [
    {
        section: "OVERVIEW",
        items: [{ label: "Dashboard", icon: LayoutDashboard, to: "/admin/dashboard" }],
    },
    {
        section: "TASKS",
        items: [
            { label: "Active Tasks", icon: ClipboardList, to: "/admin/active_tasks" },
            { label: "Completed Tasks", icon: CheckCircle2, to: "/admin/completed_tasks" },
            { label: "Archive Tasks", icon: Archive, to: "/admin/archive_tasks" },
            { label: "Cancel Tasks", icon: XCircle, to: "/admin/cancel_tasks" },
            { label: "Review Tasks", icon: ClipboardCheck, to: "/admin/review_tasks" },
        ],
    },
    // {
    //     section: "REQUESTS",
    //     items: [
    //         { label: "Pending Requests", icon: Clock, to: "/admin/pending_time_correction_requests" },
    //         { label: "Approved Requests", icon: CheckCircle, to: "/admin/approved_requests" },
    //         { label: "Rejected Requests", icon: XCircle, to: "/admin/rejected_requests" },
    //     ],
    // },
     {
        section: "Master Data",
        items: [
            { label: "Task Master", icon: ListChecks, to: "/admin/task_master" },
        ],
    },
      {
        section: "TEAM ACCESS",
        items: [
            { label: "Team Access", icon: UsersRound, to: "/admin/team_access" },
        ],
    },
    {
        section: "INSIGHTS",
        items: [
            { label: "Reports", icon: BarChart3, to: "/admin/reports" },
            { label: "Audit History", icon: History, to: "/admin/audit_history" },
        ],
    },
   
];

const EMPLOYEE_NAV: NavGroup[] = [
    {
        section: "OVERVIEW",
        items: [{ label: "Dashboard", icon: LayoutDashboard, to: "/employee/dashboard" }],
    },
    {
        section: "TASKS",
        items: [{ label: "My Tasks", icon: ClipboardList, to: "/employee/active_tasks" }],
    },
    // {
    //     section: "REQUESTS",
    //     items: [
    //         { label: "Approved Requests", icon: CheckCircle, to: "/employee/approved_requests" },
    //         { label: "Rejected Requests", icon: XCircle, to: "/employee/rejected_requests" },
    //     ],
    // },
    {
        section: "INSIGHTS",
        items: [
            { label: "Reports", icon: BarChart3, to: "/employee/reports" },
            { label: "Audit History", icon: History, to: "/employee/audit_history" },
        ],
    },
];

// ── TL nav — a hybrid of Admin (create/assign) and Employee (do the work).
// "My Task" = tasks self-assigned by the TL (reuse Active_Task_Employee
// with forceScope="mine"); "Team Tasks" = tasks the TL created, whether
// handed to someone else or self-assigned (Active_Task_TL.tsx); "All Tasks"
// keeps the full system-wide read-only view every employee already has.
const TL_NAV: NavGroup[] = [
    { section: "OVERVIEW", items: [{ label: "Dashboard", icon: LayoutDashboard, to: "/employee/dashboard" }] },
    {
        section: "TASKS",
        items: [
            { label: "My Task", icon: ClipboardList, to: "/employee/active_tasks" },
            { label: "Team Tasks", icon: UsersRound, to: "/employee/tl_tasks" },
            { label: "Review Tasks", icon: CheckCircle2, to: "/employee/tl_review_tasks" },
        ],
    },
    { section: "INSIGHTS", items: [
        { label: "Reports", icon: BarChart3, to: "/employee/reports" },
        { label: "Audit History", icon: History, to: "/employee/audit_history" },
    ] },
];
// ── Props ───────────────────────────────────────────────────────────────────

interface SidebarProps {
    role: "admin" | "employee";
    userName: string;
    isTL?: boolean;
}

// ── Component ───────────────────────────────────────────────────────────────

export default function Sidebar({ role, userName, isTL = false }: SidebarProps) {
    const location = useLocation();
    const navigate = useNavigate();
    const { logout } = useAuth();
    const nav = role === "admin" ? ADMIN_NAV : isTL ? TL_NAV : EMPLOYEE_NAV;

    function handleLogout() {
        logout();
        navigate("/login", { replace: true });
    }

    return (
        <aside className="db-sidebar">
            {/* Logo */}
            <div className="db-logo">
                <div className="db-logo-brand">
                    <div className="db-logo-icon">HR</div>
                    <span className="db-logo-name">HRMS</span>
                </div>
                <div className="db-logo-sub">
                    {role === "admin" ? "Admin Portal" : isTL ? "Team Lead Portal" : "Employee Portal"}
                </div>
            </div>

            {/* Nav */}
            <nav className="db-nav">
                {nav.map((group, gi) => (
                    <div key={gi}>
                        {group.section && <div className="db-nav-section">{group.section}</div>}

                        {group.items.map((item) => {
                            const active =
                                location.pathname === item.to || location.pathname.startsWith(item.to + "/");
                            const Icon = item.icon;

                            return (
                                <Link
                                    key={item.to}
                                    to={item.to}
                                    className={`db-nav-item${active ? " active" : ""}`}
                                    style={{ textDecoration: "none" }}
                                >
                                    <span className="db-nav-icon">
                                        <Icon size={16} strokeWidth={1.8} />
                                    </span>
                                    <span className="db-nav-label">{item.label}</span>
                                </Link>
                            );
                        })}
                    </div>
                ))}
            </nav>

            {/* Footer */}
            <div className="db-sidebar-footer">
                <div className="db-sidebar-user">
                    <div className="db-sidebar-avatar">{userName.charAt(0).toUpperCase()}</div>
                    <div>
                        <div className="db-sidebar-uname">{userName}</div>
                        <div className="db-sidebar-urole">
                            {role === "admin" ? "ADMINISTRATOR" : isTL ? "TEAM LEAD" : "EMPLOYEE"}
                        </div>
                    </div>
                </div>

             
                <div
                    onClick={handleLogout}
                    style={{
                        display: "flex",
                        alignItems: "center",
                        gap: 8,
                        padding: "7px 10px",
                        borderRadius: 8,
                        color: "var(--red)",
                        fontSize: 12,
                        fontWeight: 600,
                        cursor: "pointer",
                    }}
                >
                    <LogOut size={14} /> Sign Out
                </div>
            </div>
        </aside>
    );
}