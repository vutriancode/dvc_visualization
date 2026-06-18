import { BrowserRouter, Routes, Route } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { DashboardPage } from "./pages/DashboardPage";
import { DatasetDetailPage } from "./pages/DatasetDetailPage";
import { SettingsPage } from "./pages/SettingsPage";
import { RedminePage } from "./pages/RedminePage";
import { RedmineStatusConfigPage } from "./pages/RedmineStatusConfigPage";
import { ProjectsPage } from "./pages/ProjectsPage";
import { ProjectDetailPage } from "./pages/ProjectDetailPage";

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
      <BrowserRouter>
        <Routes>
          <Route path="/" element={<DashboardPage />} />
          <Route path="/datasets/:projectId/:name" element={<DatasetDetailPage />} />
          <Route path="/settings" element={<SettingsPage />} />
          <Route path="/redmine" element={<RedminePage />} />
          <Route path="/redmine/status-config" element={<RedmineStatusConfigPage />} />
          <Route path="/projects" element={<ProjectsPage />} />
          <Route path="/projects/:id" element={<ProjectDetailPage />} />
        </Routes>
      </BrowserRouter>
    </QueryClientProvider>
  );
}
