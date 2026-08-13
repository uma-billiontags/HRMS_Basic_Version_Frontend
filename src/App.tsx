// App.tsx

import { BrowserRouter, Routes, Route, Navigate, Outlet } from "react-router-dom";
import { AuthProvider, useAuth } from "./components/AuthContext";
import ProtectedRoute from "./components/ProtectedRoute";
import Login from "./components/Login";
import Sidebar from "./components/Sidebar";
import Review_Tasks from "./components/admin/tasks/Review_Tasks";
import Approved_Request_Admin from "./components/admin/requests/Approved_Request_Admin";
import Rejected_Request_Admin from "./components/admin/requests/Rejected_Request_Admin";
import Reports_Admin from "./components/admin/insights/Reports_Admin";
import Audit_History_Admin from "./components/admin/insights/Audit_History_Admin";
import Approved_Request_Employee from "./components/employee/requests/Approved_Request_Employee";
import Rejected_Request_Employee from "./components/employee/requests/Rejected_Request_Employee";
import Reports_Employee from "./components/employee/insights/Reports_Employee";
import Audit_History_Employee from "./components/employee/insights/Audit_History_Employee";
import Pending_Time_Correction_Request from "./components/admin/requests/Pending_Time_Correction_Request";
import Active_Task_Admin from "./components/admin/tasks/Active_Task_Admin";
import Archive_Task_Admin from "./components/admin/tasks/Archive_Task_Admin";
import Completed_Task_Admin from "./components/admin/tasks/Completed_Task_Admin";
import Cancel_Task_Admin from "./components/admin/tasks/Cancel_Task_Admin";
import Active_Task_Employee from "./components/employee/tasks/Active_Task_Employee";
import Admin_Dashboard from "./components/admin/Admin_Dashboard";
import Employee_Dashboard from "./components/employee/Employee_Dashboard";
import Active_Task_TL from "./components/employee/tasks/Active_Task_TL";
import Task_Master_Admin from "./components/admin/tasks/Task_Master_Admin";
import Review_Tasks_By_TL from "./components/employee/tasks/Review_Tasks_By_TL";
import Team_Access from "./components/admin/Team_Access";
import Recurring_Task_Admin from "./components/admin/tasks/Recurring_Task_Admin";
import Recurring_Task_TL from "./components/employee/tasks/Recurring_Task_TL";


// Shared shell: Sidebar on the left, page content on the right.
// Every admin page and every employee page renders inside this.
function DashboardLayout({ role }: { role: "admin" | "employee" }) {
  const { user } = useAuth();
  if (!user) return null; // ProtectedRoute guarantees this won't render without a user, but satisfies TS

  return (
    <div className="db-root">
      <Sidebar role={role} userName={user.name} isTL={user.isTL} />
      <div className="db-main">
        <main className="db-content">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
// Decides where "/" sends someone, based on whether they're logged in and their role.
function RootRedirect() {
  const { user } = useAuth();
  if (!user) return <Navigate to="/login" replace />;
  return <Navigate to={user.role === "admin" ? "/admin/dashboard" : "/employee/dashboard"} replace />;
}

function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <Routes>
          {/* Public */}
          <Route path="/login" element={<Login />} />

          {/* Admin-only */}
          <Route element={<ProtectedRoute allowedRoles={["admin"]} />}>
            <Route element={<DashboardLayout role="admin" />}>
              <Route path="/admin/dashboard" element={<Admin_Dashboard />} />
              <Route path="/admin/active_tasks" element={<Active_Task_Admin />} />
              <Route path="/admin/completed_tasks" element={<Completed_Task_Admin />} />
              <Route path="/admin/cancel_tasks" element={<Cancel_Task_Admin />} />
              <Route path="/admin/review_tasks" element={<Review_Tasks />} />
              <Route path="/admin/archive_tasks" element={<Archive_Task_Admin />} />
              <Route path="/admin/approved_requests" element={<Approved_Request_Admin />} />
              <Route path="/admin/rejected_requests" element={<Rejected_Request_Admin />} />
              <Route path="/admin/pending_time_correction_requests" element={<Pending_Time_Correction_Request />} />
              <Route path="/admin/reports" element={<Reports_Admin />} />
              <Route path="/admin/audit_history" element={<Audit_History_Admin />} />
              <Route path="/admin/task_master" element={<Task_Master_Admin />} />
              <Route path="/admin/team_access" element={<Team_Access />} />
              <Route path="/admin/recurring_tasks" element={<Recurring_Task_Admin />} />

            </Route>
          </Route>

          {/* Employee-only */}
          <Route element={<ProtectedRoute allowedRoles={["employee"]} />}>
            <Route element={<DashboardLayout role="employee" />}>
              <Route path="/employee/dashboard" element={<Employee_Dashboard />} />
              <Route path="/employee/active_tasks" element={<Active_Task_Employee />} />
              <Route path="/employee/approved_requests" element={<Approved_Request_Employee />} />
              <Route path="/employee/rejected_requests" element={<Rejected_Request_Employee />} />
              <Route path="/employee/reports" element={<Reports_Employee />} />
              <Route path="/employee/audit_history" element={<Audit_History_Employee />} />
              <Route path="/employee/tl_tasks" element={<Active_Task_TL />} />
              <Route path="/employee/tl_review_tasks" element={<Review_Tasks_By_TL />} />
              <Route path="/employee/recurring_tasks" element={<Recurring_Task_TL />} />

            </Route>
          </Route>

          {/* "/" and unknown URLs */}
          <Route path="/" element={<RootRedirect />} />
          <Route path="*" element={<RootRedirect />} />
        </Routes>
      </AuthProvider>
    </BrowserRouter>
  );
}

export default App;