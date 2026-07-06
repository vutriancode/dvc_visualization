import { BrowserRouter, Routes, Route } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { AuthProvider } from "./hooks/useAuth";
import { AuthGuard } from "./components/AuthGuard";
import { DashboardPage } from "./pages/DashboardPage";
import { DatasetDetailPage } from "./pages/DatasetDetailPage";
import { SettingsPage } from "./pages/SettingsPage";
import { RedminePage } from "./pages/RedminePage";
import { RedmineStatusConfigPage } from "./pages/RedmineStatusConfigPage";
import { ProjectsPage } from "./pages/ProjectsPage";
import { ProjectDetailPage } from "./pages/ProjectDetailPage";
import { LoginPage } from "./pages/LoginPage";
import { ProfilePage } from "./pages/ProfilePage";
import { McpSetupPage } from "./pages/McpSetupPage";
import { HotfixPage } from "./pages/HotfixPage";
import { CVATPage } from "./pages/CVATPage";
import { UserManagementPage } from "./pages/UserManagementPage";
import { ChatSidebar } from "./components/ChatSidebar";

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 60_000,
      retry: 1,
    },
  },
});

export default function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
        <BrowserRouter>
          <Routes>
            {/* Public */}
            <Route path="/login" element={<LoginPage />} />

            {/* Authenticated */}
            <Route
              path="/"
              element={
                <AuthGuard>
                  <DashboardPage />
                </AuthGuard>
              }
            />
            <Route
              path="/datasets/:projectId/:name"
              element={
                <AuthGuard>
                  <DatasetDetailPage />
                </AuthGuard>
              }
            />
            <Route
              path="/settings"
              element={
                <AuthGuard>
                  <SettingsPage />
                </AuthGuard>
              }
            />
            <Route
              path="/redmine"
              element={
                <AuthGuard>
                  <RedminePage />
                </AuthGuard>
              }
            />
            <Route
              path="/redmine/status-config"
              element={
                <AuthGuard>
                  <RedmineStatusConfigPage />
                </AuthGuard>
              }
            />
            <Route
              path="/redmine/hotfix"
              element={
                <AuthGuard>
                  <HotfixPage />
                </AuthGuard>
              }
            />
            <Route
              path="/cvat"
              element={
                <AuthGuard>
                  <CVATPage />
                </AuthGuard>
              }
            />
            <Route
              path="/projects"
              element={
                <AuthGuard>
                  <ProjectsPage />
                </AuthGuard>
              }
            />
            <Route
              path="/projects/:id"
              element={
                <AuthGuard>
                  <ProjectDetailPage />
                </AuthGuard>
              }
            />
            <Route
              path="/profile"
              element={
                <AuthGuard>
                  <ProfilePage />
                </AuthGuard>
              }
            />
            <Route
              path="/mcp"
              element={
                <AuthGuard>
                  <McpSetupPage />
                </AuthGuard>
              }
            />

            {/* Admin only */}
            <Route
              path="/admin/users"
              element={
                <AuthGuard adminOnly>
                  <UserManagementPage />
                </AuthGuard>
              }
            />
          </Routes>
          <AuthGuard>
            <ChatSidebar />
          </AuthGuard>
        </BrowserRouter>
      </AuthProvider>
    </QueryClientProvider>
  );
}
