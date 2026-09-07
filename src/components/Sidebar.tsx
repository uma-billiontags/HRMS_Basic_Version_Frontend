import { Link, useLocation, useNavigate } from "react-router-dom";
import {
    LayoutDashboard,
    ClipboardList,
    ClipboardCheck,
    CheckCircle2,
    // CheckCircle,
    XCircle,
    // Clock,
    History,
    BarChart3,
    LogOut,
    ListChecks,
    UsersRound,
    CalendarDays, // <-- ADD THIS
    FolderOpen,
    AlarmClock,
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
        section: "MY TASKS",
        items: [
            { label: "All Tasks", icon: LayoutDashboard, to: "/admin/my_tasks" },
            { label: "Upcoming Tasks", icon: CalendarDays, to: "/admin/my_upcoming_tasks" }, // <-- ADD THIS
        ],
    },
    {
        section: "EMPLOYEE TASKS",
        items: [
            { label: "All Tasks", icon: ClipboardList, to: "/admin/all_tasks" },
            { label: "Open Tasks", icon: FolderOpen, to: "/admin/open_tasks" },
            { label: "Overdue Tasks", icon: AlarmClock, to: "/admin/overdue_tasks" },
            { label: "Rework Tasks", icon: ClipboardList, to: "/admin/rework_tasks" },
            { label: "Review Tasks", icon: ClipboardCheck, to: "/admin/review_tasks" },
            { label: "Upcoming Scheduled", icon: CalendarDays, to: "/admin/upcoming_scheduled_tasks" }, // <-- ADD THIS
            { label: "Completed Tasks", icon: CheckCircle2, to: "/admin/completed_tasks" },
            { label: "Cancel Tasks", icon: XCircle, to: "/admin/cancel_tasks" },
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
        items: [
            { label: "My Tasks", icon: ClipboardList, to: "/employee/all_tasks" },
            { label: "Upcoming Tasks", icon: CalendarDays, to: "/employee/my_upcoming_tasks" }, // <-- ADD THIS
            { label: "Completed Tasks", icon: CheckCircle2, to: "/employee/completed_tasks" },
        ],

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

const TL_NAV: NavGroup[] = [
    { section: "OVERVIEW", items: [{ label: "Dashboard", icon: LayoutDashboard, to: "/employee/dashboard" }] },
    {
        section: "MY TASKS",
        items: [
            { label: "My Task", icon: ClipboardList, to: "/employee/all_tasks" },
            { label: "My Upcoming Tasks", icon: CalendarDays, to: "/employee/my_upcoming_tasks" }, // <-- ADD THIS
            { label: "Completed Tasks", icon: CheckCircle2, to: "/employee/completed_tasks" },

        ],
    },
    {
        section: "EMPLOYEE TASKS",
        items: [
            { label: "Team Tasks", icon: UsersRound, to: "/employee/tl_tasks" },
            { label: "Review Tasks", icon: CheckCircle2, to: "/employee/tl_review_tasks" },
            { label: "Upcoming Scheduled", icon: CalendarDays, to: "/employee/upcoming_scheduled_tasks" }, // <-- ADD THISa
            { label: "Team Completed Tasks", icon: CheckCircle2, to: "/employee/tl_completed_tasks" },

        ],
    },
    {
        section: "INSIGHTS", items: [
            { label: "Reports", icon: BarChart3, to: "/employee/reports" },
            { label: "Audit History", icon: History, to: "/employee/audit_history" },
        ]
    },
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
            {/* Logo */}
            <div className="db-logo" style={{ padding: "16px 14px 14px" }}>
                <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                    {/* White badge container for the logo */}
                    <div
                        style={{
                            display: "flex",
                            alignItems: "center",
                            justifyContent: "center",
                            background: "#ffffff",
                            borderRadius: 8,
                            padding: "0px 2px",
                            height: 38,
                            minWidth: 50,
                            boxShadow: "0 2px 8px rgba(0, 0, 0, 0.25)",
                            flexShrink: 0,
                        }}
                    >
                        <img
                            src="/logo.jpg"
                            alt="Billion$"
                            style={{
                                height: 20,
                                width: "auto",
                                maxWidth: 80,
                                objectFit: "contain",
                                display: "block",
                            }}
                        />
                    </div>

                    {/* Text next to the logo */}
                    <div>
                        <div
                            style={{
                                fontSize: 15,
                                fontWeight: 800,
                                color: "var(--sb-text-bright)",
                                letterSpacing: "0.02em",
                                lineHeight: 1.2,
                            }}
                        >
                            HRMS
                        </div>
                        <div
                            style={{
                                fontSize: 10,
                                color: "var(--sb-text-dim)",
                                marginTop: 3,
                                fontWeight: 500,
                            }}
                        >
                            {role === "admin" ? "Admin Portal" : isTL ? "Team Lead Portal" : "Employee Portal"}
                        </div>
                    </div>
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