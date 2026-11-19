const BASE = process.env.NEXT_PUBLIC_API_URL || "http://localhost:4000";
export const loginWithGoogleUrl = `${BASE}/auth/google`;
export async function api(path, options = {}) {
  const res = await fetch(`${BASE}${path}`, {
    credentials: "include", 
    headers: { "Content-Type": "application/json" },
    ...options,
    body: options.body ? JSON.stringify(options.body) : undefined,
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw Object.assign(new Error(data.error || "Request failed"), { status: res.status });
  return data;
}
