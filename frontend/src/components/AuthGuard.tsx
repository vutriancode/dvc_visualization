import { ReactNode } from "react";
import { Navigate } from "react-router-dom";
import { useAuth } from "../hooks/useAuth";
import { Loader2, ShieldAlert } from "lucide-react";

interface AuthGuardProps {
  children: ReactNode;
  adminOnly?: boolean;
}

export function AuthGuard({ children, adminOnly = false }: AuthGuardProps) {
  const { user, isLoading } = useAuth();

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <Loader2 size={24} className="animate-spin text-blue-500" />
      </div>
    );
  }

  if (!user) {
    return <Navigate to="/login" replace />;
  }

  if (adminOnly && user.role !== "admin") {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center bg-gray-50 gap-4">
        <ShieldAlert size={48} className="text-red-400" />
        <div className="text-center">
          <h2 className="text-lg font-semibold text-gray-700 mb-1">Không có quyền truy cập</h2>
          <p className="text-sm text-gray-400">Trang này chỉ dành cho quản trị viên.</p>
        </div>
      </div>
    );
  }

  return <>{children}</>;
}
