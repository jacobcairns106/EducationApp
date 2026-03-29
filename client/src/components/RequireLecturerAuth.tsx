import { Navigate } from "react-router-dom";

// Route guard: wraps lecturer-only pages and redirects to login if no JWT is stored.
// This is a client-side check only — the server independently verifies the token on every API call.
export default function RequireLecturerAuth({ children }: { children: React.ReactNode }) {
  const token = localStorage.getItem("lecturerToken");
  if (!token) return <Navigate to="/lecturer/login" replace />;
  return <>{children}</>;
}
