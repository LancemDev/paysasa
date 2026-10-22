import { Navigate, Outlet, useLocation } from "react-router-dom";
import { FullPageSkeleton } from "@/components/ui/Skeleton";
import { useAuth } from "./AuthProvider";

export function ProtectedRoute() {
  const { user, loading } = useAuth();
  const location = useLocation();
  if (loading) return <FullPageSkeleton />;
  if (!user) return <Navigate to="/sign-in" replace state={{ from: location.pathname + location.search }} />;
  return <Outlet />;
}
