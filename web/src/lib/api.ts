// Same-origin in production (the API serves the built app); localhost in dev.
// An explicit VITE_API_URL always wins (e.g. a split frontend/backend deploy).
const _env = (import.meta as any).env || {};
const BASE = _env.VITE_API_URL ?? (_env.PROD ? "" : "http://localhost:8000");

let token: string | null = localStorage.getItem("aurelle_token");

export function setToken(t: string) {
  token = t;
  localStorage.setItem("aurelle_token", t);
}
export function clearToken() {
  token = null;
  localStorage.removeItem("aurelle_token");
}
export function getToken() {
  return token;
}

async function req(path: string, opts: RequestInit = {}) {
  const res = await fetch(BASE + path, {
    ...opts,
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(opts.headers || {}),
    },
  });
  if (res.status === 401) {
    clearToken();
    throw new Error("Session expired — please sign in again.");
  }
  if (!res.ok) throw new Error(`Request failed (${res.status})`);
  return res.json();
}

export const api = {
  // generic
  get: (path: string) => req(path),
  post: (path: string, body: any) =>
    req(path, { method: "POST", body: JSON.stringify(body) }),
  // clienteling
  login: (email: string, password: string) =>
    req("/api/auth/login", { method: "POST", body: JSON.stringify({ email, password }) }),
  filters: () => req("/api/clienteling/filters"),
  overview: (f: any) =>
    req("/api/clienteling/overview", { method: "POST", body: JSON.stringify(f) }),
  roles: () => req("/api/clienteling/roles"),
  lookup: (role: string, client_id: string) =>
    req("/api/clienteling/lookup", {
      method: "POST",
      body: JSON.stringify({ role, client_id }),
    }),
  // scenarios
  listScenarios: (storeId: string) => req(`/api/scenarios?store_id=${storeId}`),
  createScenario: (body: any) => req("/api/scenarios", { method: "POST", body: JSON.stringify(body) }),
  getScenario: (id: string) => req(`/api/scenarios/${id}`),
  updateScenario: (id: string, body: any) => req(`/api/scenarios/${id}`, { method: "PUT", body: JSON.stringify(body) }),
  deleteScenario: (id: string) => req(`/api/scenarios/${id}`, { method: "DELETE" }),
  duplicateScenario: (id: string, name: string) => req(`/api/scenarios/${id}/duplicate`, { method: "POST", body: JSON.stringify({ name }) }),
  saveVersion: (id: string, notes: string) => req(`/api/scenarios/${id}/versions`, { method: "POST", body: JSON.stringify({ notes }) }),
  listVersions: (id: string) => req(`/api/scenarios/${id}/versions`),
  restoreVersion: (id: string, versionNumber: number) => req(`/api/scenarios/${id}/restore`, { method: "POST", body: JSON.stringify({ version_number: versionNumber }) }),
  getWeights: () => req("/api/scenarios/weights"),
  saveWeights: (role: string, weights: any) => req("/api/scenarios/weights", { method: "POST", body: JSON.stringify({ role, weights }) }),
  applyPreset: (storeId: string, presetName: string, payload: any) => req("/api/scenarios/preset", { method: "POST", body: JSON.stringify({ store_id: storeId, preset_name: presetName, current_payload: payload }) }),
};

// Generic token-streaming POST (AI reports). Reads the response body stream.
export async function streamReport(
  path: string,
  body: any,
  onToken: (chunk: string) => void,
  onDone: () => void,
) {
  const res = await fetch(BASE + path, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: JSON.stringify(body),
  });
  if (!res.body) {
    onDone();
    return;
  }
  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    onToken(decoder.decode(value, { stream: true }));
  }
  onDone();
}

// Stream the outreach draft token-by-token.
export async function streamOutreach(
  body: any,
  onToken: (chunk: string) => void,
  onDone: () => void,
) {
  const res = await fetch(BASE + "/api/clienteling/outreach", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: JSON.stringify(body),
  });
  if (!res.body) {
    onDone();
    return;
  }
  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    onToken(decoder.decode(value, { stream: true }));
  }
  onDone();
}
