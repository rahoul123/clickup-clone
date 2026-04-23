import React from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Route, Routes, Navigate } from "react-router-dom";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { AuthProvider, useAuth } from "@/contexts/AuthContext";
import { ThemeProvider } from "@/contexts/ThemeContext";
import { RealtimeProvider } from "@/contexts/RealtimeContext";
import Index from "./pages/Index";
import Login from "./pages/Login";
import Signup from "./pages/Signup";
import ForgotPassword from "./pages/ForgotPassword";
import ResetPassword from "./pages/ResetPassword";
import NotFound from "./pages/NotFound";

const queryClient = new QueryClient();

class AppErrorBoundary extends React.Component<{ children: React.ReactNode }, { hasError: boolean; message: string }> {
  constructor(props: { children: React.ReactNode }) {
    super(props);
    this.state = { hasError: false, message: "" };
  }

  static getDerivedStateFromError(error: unknown) {
    const message = error instanceof Error ? error.message : "Unexpected runtime error";
    return { hasError: true, message };
  }

  componentDidCatch(error: unknown) {
    console.error("App crashed with runtime error:", error);
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="min-h-full overflow-y-auto bg-background p-6 text-foreground">
          <div className="mx-auto mt-10 max-w-2xl rounded-xl border border-destructive/30 bg-card p-5 shadow-sm">
            <h1 className="text-lg font-semibold text-destructive">Something went wrong</h1>
            <p className="mt-2 text-sm text-muted-foreground">
              A runtime error occurred. This panel is shown instead of a blank page.
            </p>
            <pre className="mt-3 overflow-auto rounded-md bg-muted p-3 text-xs text-muted-foreground">{this.state.message}</pre>
            <button
              type="button"
              onClick={() => window.location.reload()}
              className="mt-4 rounded-md bg-primary px-3 py-2 text-xs font-medium text-primary-foreground hover:bg-primary/90"
            >
              Reload page
            </button>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}

function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const { user, loading } = useAuth();
  if (loading) {
    return (
      <div className="flex min-h-full flex-col items-center justify-center gap-3 bg-background text-foreground">
        <div className="w-8 h-8 border-2 border-foreground border-t-transparent rounded-full animate-spin" />
        <p className="text-sm font-medium">Loading workspace...</p>
      </div>
    );
  }
  if (!user) return <Navigate to="/login" replace />;
  return <>{children}</>;
}

function PublicRoute({ children }: { children: React.ReactNode }) {
  const { user, loading } = useAuth();
  if (loading) {
    return (
      <div className="flex min-h-full flex-col items-center justify-center gap-3 bg-background text-foreground">
        <div className="w-8 h-8 border-2 border-foreground border-t-transparent rounded-full animate-spin" />
        <p className="text-sm font-medium">Checking session...</p>
      </div>
    );
  }
  if (user) return <Navigate to="/" replace />;
  return <>{children}</>;
}

const App = () => (
  <QueryClientProvider client={queryClient}>
    <ThemeProvider>
    <AppErrorBoundary>
      <TooltipProvider>
        <div className="h-full min-h-0 w-full overflow-hidden bg-background text-foreground">
        <Toaster />
        <Sonner position="bottom-right" richColors closeButton offset={24} />
        <BrowserRouter>
          <AuthProvider>
            <RealtimeProvider>
              <Routes>
                <Route path="/" element={<ProtectedRoute><Index /></ProtectedRoute>} />
                <Route path="/login" element={<PublicRoute><Login /></PublicRoute>} />
                <Route path="/signup" element={<PublicRoute><Signup /></PublicRoute>} />
                <Route path="/forgot-password" element={<PublicRoute><ForgotPassword /></PublicRoute>} />
                <Route path="/reset-password" element={<ResetPassword />} />
                <Route path="*" element={<NotFound />} />
              </Routes>
            </RealtimeProvider>
          </AuthProvider>
        </BrowserRouter>
        </div>
      </TooltipProvider>
    </AppErrorBoundary>
    </ThemeProvider>
  </QueryClientProvider>
);

export default App;
