import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { lazy, Suspense } from "react";
import { BrowserRouter, Navigate, Route, Routes } from "react-router-dom";
import { AuthProvider } from "@/auth/AuthProvider";
import { ProtectedRoute } from "@/auth/ProtectedRoute";
import { AppShell } from "@/components/layout/AppShell";
import { ErrorBoundary } from "@/components/ui/ErrorBoundary";
import { ToastProvider } from "@/components/ui/Toast";
import { ApprovalsPage } from "@/features/approvals/ApprovalsPage";
import { Dashboard } from "@/features/dashboard/Dashboard";
import { PayeesPage } from "@/features/payees/PayeesPage";
import { SettingsPage } from "@/features/settings/SettingsPage";
import { ApiError } from "@/lib/api";
import { useApplyTheme } from "@/lib/settings";
import { FullPageSkeleton } from "@/components/ui/Skeleton";
import { LandingPage } from "@/pages/LandingPage";
import { ResetPasswordPage, SignInPage, SignUpPage, UpdatePasswordPage } from "@/pages/AuthPages";

// AG Studio is large; it only loads when someone opens Insights.
const InsightsPage = lazy(() => import("@/features/insights/InsightsPage"));

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 10_000,
      refetchOnWindowFocus: true,
      // Retry transient failures, not auth or validation problems.
      retry: (count, err) => !(err instanceof ApiError && err.status >= 400 && err.status < 500) && count < 2,
    },
  },
});

export function App() {
  useApplyTheme();
  return (
    <ErrorBoundary region="app" className="m-6 rounded-[var(--radius-card)] border border-border bg-surface p-6">
      <QueryClientProvider client={queryClient}>
        <ToastProvider>
          <BrowserRouter>
            <AuthProvider>
              <Routes>
                <Route path="/welcome" element={<LandingPage />} />
                <Route path="/sign-in" element={<SignInPage />} />
                <Route path="/sign-up" element={<SignUpPage />} />
                <Route path="/reset-password" element={<ResetPasswordPage />} />
                <Route path="/update-password" element={<UpdatePasswordPage />} />
                <Route element={<ProtectedRoute />}>
                  <Route element={<AppShell />}>
                    <Route index element={<Dashboard />} />
                    <Route
                      path="/insights"
                      element={
                        <Suspense fallback={<FullPageSkeleton />}>
                          <InsightsPage />
                        </Suspense>
                      }
                    />
                    <Route path="/approvals" element={<ApprovalsPage />} />
                    <Route path="/payees" element={<PayeesPage />} />
                    <Route path="/settings" element={<SettingsPage />} />
                  </Route>
                </Route>
                <Route path="*" element={<Navigate to="/" replace />} />
              </Routes>
            </AuthProvider>
          </BrowserRouter>
        </ToastProvider>
      </QueryClientProvider>
    </ErrorBoundary>
  );
}
