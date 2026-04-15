import React from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Route, Routes, Navigate } from "react-router-dom";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { AuthProvider, useAuth } from "@/contexts/AuthContext";
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
        <div className="min-h-full overflow-y-auto bg-slate-100 p-6 text-slate-800">
          <div className="mx-auto mt-10 max-w-2xl rounded-xl border border-red-200 bg-white p-5 shadow-sm">
            <h1 className="text-lg font-semibold text-red-700">Something went wrong</h1>
            <p className="mt-2 text-sm text-slate-600">
              Runtime error aya hai. Page blank hone ke bajaye yeh panel show ho raha hai.
            </p>
            <pre className="mt-3 overflow-auto rounded-md bg-slate-100 p-3 text-xs text-slate-700">{this.state.message}</pre>
            <button
              type="button"
              onClick={() => window.location.reload()}
              className="mt-4 rounded-md bg-slate-900 px-3 py-2 text-xs font-medium text-white hover:bg-slate-800"
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
      <div className="flex min-h-full flex-col items-center justify-center gap-3 bg-slate-100 text-slate-700">
        <div className="w-8 h-8 border-2 border-slate-700 border-t-transparent rounded-full animate-spin" />
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
      <div className="flex min-h-full flex-col items-center justify-center gap-3 bg-slate-100 text-slate-700">
        <div className="w-8 h-8 border-2 border-slate-700 border-t-transparent rounded-full animate-spin" />
        <p className="text-sm font-medium">Checking session...</p>
      </div>
    );
  }
  if (user) return <Navigate to="/" replace />;
  return <>{children}</>;
}

const App = () => (
  <QueryClientProvider client={queryClient}>
    <AppErrorBoundary>
      <TooltipProvider>
        <div className="h-full min-h-0 w-full overflow-hidden">
        <Toaster />
        <Sonner position="bottom-left" richColors closeButton />
        <BrowserRouter>
          <AuthProvider>
            <Routes>
              <Route path="/" element={<ProtectedRoute><Index /></ProtectedRoute>} />
              <Route path="/login" element={<PublicRoute><Login /></PublicRoute>} />
              <Route path="/signup" element={<PublicRoute><Signup /></PublicRoute>} />
              <Route path="/forgot-password" element={<PublicRoute><ForgotPassword /></PublicRoute>} />
              <Route path="/reset-password" element={<ResetPassword />} />
              <Route path="*" element={<NotFound />} />
            </Routes>
          </AuthProvider>
        </BrowserRouter>
        </div>
      </TooltipProvider>
    </AppErrorBoundary>
  </QueryClientProvider>
);

export default App;
