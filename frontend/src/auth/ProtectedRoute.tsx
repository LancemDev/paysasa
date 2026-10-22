import { Navigate, Outlet, useLocation } from "react-router-dom";
import { FullPageSkeleton } from "@/components/ui/Skeleton";
import { useAuth } from "./AuthProvider";

export function ProtectedRoute() {
  const { user, loading } = useAuth();
  const location = useLocation();
  if (loading) return <FullPageSkeleton />;
  // Visitors without a session land on the public page; deep links go straight to sign-in and come back after.
  if (!user)
    return location.pathname === "/" && !location.search ? (
      <Navigate to="/welcome" replace />
    ) : (
      <Navigate to="/sign-in" replace state={{ from: location.pathname + location.search }} />
    );
  return <Outlet />;
}
