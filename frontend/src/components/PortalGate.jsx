import { Navigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import { hasPortalAccess } from "../lib/roles";

export default function PortalGate({ portal, children }) {
  const { user } = useAuth();
  if (!hasPortalAccess(user, portal)) {
    return <Navigate to="/portal/knowledge" replace />;
  }
  return children;
}
