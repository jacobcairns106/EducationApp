const API_BASE =
  import.meta.env.VITE_API_URL ||
  (window.location.hostname === "localhost"
    ? "http://localhost:4000"
    : `http://${window.location.hostname}:4000`);

export async function createSession(): Promise<{ code: string; sessionId: string }> {
  const res = await fetch(`${API_BASE}/api/sessions`, { method: "POST" });
  if (!res.ok) throw new Error(`Failed to create session (${res.status})`);
  return res.json();
}
