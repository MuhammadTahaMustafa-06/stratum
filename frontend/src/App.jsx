import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { HelmetProvider } from "react-helmet-async";
import { AuthProvider, useAuth } from "./context/AuthContext";
import PortalLayout from "./components/PortalLayout";
import PortalGate from "./components/PortalGate";
import ProtectedRoute from "./components/ProtectedRoute";
import Login from "./pages/Login";
import Signup from "./pages/Signup";
import AuthCallback from "./pages/AuthCallback";
import KnowledgeHub from "./pages/KnowledgeHub";
import ArticleDetail from "./pages/ArticleDetail";
import Bookmarks from "./pages/Bookmarks";
import AdminConsole from "./pages/AdminConsole";
import MyProfile from "./pages/MyProfile";
import Privacy from "./pages/Privacy";
import MFAChallenge from "./pages/MFAChallenge";
import ForgotPassword from "./pages/ForgotPassword";
import ResetPassword from "./pages/ResetPassword";
import { PageSpinner } from "./components/ui/Skeleton";
import PortalToaster from "./components/ui/PortalToaster";
import PortalCspHelmet from "./components/PortalCspHelmet";

function RootRedirect() {
  const { user, loading } = useAuth();
  if (loading) return (
    <div className="min-h-screen flex items-center justify-center bg-background">
      <PageSpinner title="Signing you in…" subtitle="Verifying your session" />
    </div>
  );
  return user ? <Navigate to="/portal/knowledge" replace /> : <Navigate to="/login" replace />;
}

export default function App() {
  return (
    <HelmetProvider>
      <BrowserRouter>
        <PortalCspHelmet />
        <PortalToaster />
        <AuthProvider>
          <Routes>
            <Route path="/login" element={<Login />} />
            <Route path="/signup" element={<Signup />} />
            <Route path="/auth/callback" element={<AuthCallback />} />
            <Route path="/forgot-password" element={<ForgotPassword />} />
            <Route path="/reset-password" element={<ResetPassword />} />
            <Route path="/mfa" element={<MFAChallenge />} />
            <Route path="/privacy" element={<Privacy />} />
            <Route path="/" element={<RootRedirect />} />

            <Route element={<ProtectedRoute />}>
              <Route element={<PortalLayout />}>
                {/* Knowledge portal — all employees */}
                <Route
                  path="/portal/knowledge"
                  element={<PortalGate portal="knowledge"><KnowledgeHub /></PortalGate>}
                />
                <Route
                  path="/portal/knowledge/articles/:id"
                  element={<PortalGate portal="knowledge"><ArticleDetail /></PortalGate>}
                />
                <Route
                  path="/portal/knowledge/bookmarks"
                  element={<PortalGate portal="knowledge"><Bookmarks /></PortalGate>}
                />
                <Route
                  path="/portal/profile"
                  element={<PortalGate portal="profile"><MyProfile /></PortalGate>}
                />

                {/* Admin portal — knowledge_admin + system_admin only */}
                <Route path="/portal/admin" element={
                  <PortalGate portal="admin"><AdminConsole /></PortalGate>
                } />
              </Route>
            </Route>

            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </AuthProvider>
      </BrowserRouter>
    </HelmetProvider>
  );
}
