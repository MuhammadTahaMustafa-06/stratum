import { Navigate, Outlet } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import { PageSpinner } from "./ui/Skeleton";

export default function ProtectedRoute() {
  const { user, loading } = useAuth();
  if (loading) return (
    <div className="min-h-screen flex items-center justify-center bg-background">
      <PageSpinner title="Loading session…" subtitle="Preparing the portal" />
    </div>
  );
  return user ? <Outlet /> : <Navigate to="/login" replace />;
}
