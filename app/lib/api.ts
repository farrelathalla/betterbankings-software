const API_BASE = "https://103.103.22.207:8002";

// ─── Auth ────────────────────────────────────────────────────

function getToken(): string | null {
  if (typeof window === "undefined") return null;
  return localStorage.getItem("bb_token");
}

function setToken(token: string) {
  localStorage.setItem("bb_token", token);
}

function clearToken() {
  localStorage.removeItem("bb_token");
  localStorage.removeItem("bb_username");
}

function authHeaders(): Record<string, string> {
  const token = getToken();
  if (!token) return {};
  return { Authorization: `Bearer ${token}` };
}

export async function login(
  username: string,
  password: string,
): Promise<{ token: string; username: string; user_id: string; role: string }> {
  const res = await fetch(`${API_BASE}/api/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ username, password }),
  });
  if (!res.ok) {
    const data = await res.json();
    throw new Error(data.error || "Login failed");
  }
  const data = await res.json();
  setToken(data.token);
  localStorage.setItem("bb_username", data.username);
  localStorage.setItem("bb_role", data.role || "user");
  return data;
}

export async function logout() {
  try {
    await fetch(`${API_BASE}/api/auth/logout`, {
      method: "POST",
      headers: authHeaders(),
    });
  } catch {
    // ignore
  }
  clearToken();
}

export async function checkAuth(): Promise<boolean> {
  const token = getToken();
  if (!token) return false;
  try {
    const res = await fetch(`${API_BASE}/api/auth/check`, {
      headers: authHeaders(),
    });
    return res.ok;
  } catch {
    return false;
  }
}

export function isLoggedIn(): boolean {
  return !!getToken();
}

export function getUsername(): string {
  return localStorage.getItem("bb_username") || "";
}

export function getRole(): string {
  return localStorage.getItem("bb_role") || "user";
}

export function isSuperAdmin(): boolean {
  return getRole() === "superadmin";
}

// ─── Upload ──────────────────────────────────────────────────

export interface UploadResponse {
  id: string;
  filename: string;
  status: string;
  errors?: ValidationError[];
}

export interface ValidationError {
  row: number;
  column: string;
  message: string;
}

export async function uploadCSV(file: File): Promise<UploadResponse> {
  const formData = new FormData();
  formData.append("file", file);

  const res = await fetch(`${API_BASE}/api/upload`, {
    method: "POST",
    headers: authHeaders(),
    body: formData,
  });

  const data = await res.json();
  if (!res.ok) {
    if (data.errors && data.errors.length > 0) {
      const err = new Error("CSV validation failed");
      (err as any).validationErrors = data.errors;
      throw err;
    }
    throw new Error(data.error || "Upload failed");
  }
  return data;
}

// ─── Upload Status ───────────────────────────────────────────

export interface UploadStatus {
  id: string;
  status: string; // "processing" | "completed" | "failed"
  total_rows: number;
  error_message?: string;
}

export async function getUploadStatus(id: string): Promise<UploadStatus> {
  const res = await fetch(`${API_BASE}/api/upload/status/${id}`, {
    headers: authHeaders(),
  });
  if (!res.ok) throw new Error("Failed to get upload status");
  return res.json();
}

// Poll until completed or failed
export async function waitForProcessing(
  id: string,
  onProgress?: (status: UploadStatus) => void,
): Promise<UploadStatus> {
  while (true) {
    const status = await getUploadStatus(id);
    if (onProgress) onProgress(status);
    if (status.status === "completed" || status.status === "failed") {
      return status;
    }
    await new Promise((r) => setTimeout(r, 1000));
  }
}

// ─── History ─────────────────────────────────────────────────

export interface HistoryItem {
  id: string;
  filename: string;
  uploaded_at: string;
  total_rows: number;
  status: string;
  error_message?: string;
}

export async function getHistory(): Promise<HistoryItem[]> {
  const res = await fetch(`${API_BASE}/api/history`, {
    headers: authHeaders(),
  });
  if (!res.ok) throw new Error("Failed to fetch history");
  return res.json();
}

export async function deleteUpload(id: string): Promise<void> {
  const res = await fetch(`${API_BASE}/api/history/${id}`, {
    method: "DELETE",
    headers: authHeaders(),
  });
  if (!res.ok) throw new Error("Failed to delete upload");
}

// ─── Results ─────────────────────────────────────────────────

export interface ResultRow {
  row_number: number;
  reporting_date: string;
  account_id: string;
  ccy: string;
  outstanding: number;
  interest_rate: number;
  start_date: string;
  end_date: string;
  installment_frequency: number | null;
  product_type: string;
  segment: string;
  daerah: string;
  kode_pos: string;
  insured_or_uninsured: string;
  transactional_or_non: string;
  method: string;
  interest_payment_frequency: number | null;
  day_count: string;
  remaining_days: number;
  result_type: string;
  irrbb_principal: Record<string, number> | null;
  irrbb_interest: Record<string, number> | null;
  lcr_principal: Record<string, number> | null;
  lcr_interest: Record<string, number> | null;
  nsfr_principal: Record<string, number> | null;
  nsfr_interest: Record<string, number> | null;
}

export interface PaginatedResponse {
  data: ResultRow[];
  total: number;
  page: number;
  limit: number;
  total_pages: number;
}

export interface ResultsParams {
  page?: number;
  limit?: number;
  filter_type?: string; // bbi | interest | both
  sort_by?: string;
  sort_dir?: string;
  filters?: Record<string, string>;
}

export async function getResults(
  uploadId: string,
  params: ResultsParams = {},
): Promise<PaginatedResponse> {
  const searchParams = new URLSearchParams();
  if (params.page) searchParams.set("page", String(params.page));
  if (params.limit) searchParams.set("limit", String(params.limit));
  if (params.filter_type) searchParams.set("filter_type", params.filter_type);
  if (params.sort_by) searchParams.set("sort_by", params.sort_by);
  if (params.sort_dir) searchParams.set("sort_dir", params.sort_dir);
  if (params.filters)
    searchParams.set("filters", JSON.stringify(params.filters));

  const res = await fetch(
    `${API_BASE}/api/results/${uploadId}?${searchParams.toString()}`,
    { headers: authHeaders() },
  );
  if (!res.ok) throw new Error("Failed to fetch results");
  return res.json();
}

// ─── Summary ─────────────────────────────────────────────────

export interface SummaryResponse {
  total_count: number;
  total_outstanding: number;
  currencies: string[];
  bucket_totals: Record<string, number>;
}

export async function getSummary(
  uploadId: string,
  filterType: string = "both",
  filters: Record<string, string> = {},
): Promise<SummaryResponse> {
  const searchParams = new URLSearchParams();
  searchParams.set("filter_type", filterType);
  if (Object.keys(filters).length > 0)
    searchParams.set("filters", JSON.stringify(filters));

  const res = await fetch(
    `${API_BASE}/api/results/${uploadId}/summary?${searchParams.toString()}`,
    { headers: authHeaders() },
  );
  if (!res.ok) throw new Error("Failed to fetch summary");
  return res.json();
}

// ─── Filter Options ──────────────────────────────────────────

export async function getFilterOptions(
  uploadId: string,
  column: string,
): Promise<string[]> {
  const res = await fetch(
    `${API_BASE}/api/results/${uploadId}/filter-options?column=${column}`,
    { headers: authHeaders() },
  );
  if (!res.ok) return [];
  return res.json();
}

// ─── Pivot ───────────────────────────────────────────────────

export interface PivotGroup {
  keys: Record<string, string>;
  count: number;
  aggregates: Record<string, number>;
}

export async function getPivot(
  uploadId: string,
  pivotKeys: string[],
  filterType: string = "both",
  filters: Record<string, string> = {},
): Promise<PivotGroup[]> {
  const searchParams = new URLSearchParams();
  searchParams.set("pivot_keys", pivotKeys.join(","));
  searchParams.set("filter_type", filterType);
  if (Object.keys(filters).length > 0)
    searchParams.set("filters", JSON.stringify(filters));

  const res = await fetch(
    `${API_BASE}/api/pivot/${uploadId}?${searchParams.toString()}`,
    { headers: authHeaders() },
  );
  if (!res.ok) throw new Error("Failed to fetch pivot");
  return res.json();
}

// ─── Export ──────────────────────────────────────────────────

export function getExportUrl(
  uploadId: string,
  filterType: string = "both",
  filters: Record<string, string> = {},
): string {
  const searchParams = new URLSearchParams();
  searchParams.set("filter_type", filterType);
  if (Object.keys(filters).length > 0)
    searchParams.set("filters", JSON.stringify(filters));

  const token = getToken();
  if (token) searchParams.set("token", token);

  return `${API_BASE}/api/export/${uploadId}?${searchParams.toString()}`;
}

export async function downloadExport(
  uploadId: string,
  filterType: string = "both",
  filters: Record<string, string> = {},
) {
  const url = getExportUrl(uploadId, filterType, filters);
  // Use fetch with auth header instead of direct link
  const res = await fetch(url, { headers: authHeaders() });
  if (!res.ok) throw new Error("Export failed");

  const blob = await res.blob();
  const contentDisposition = res.headers.get("Content-Disposition");
  let filename = `cashflow_${filterType}.xlsx`;
  if (contentDisposition) {
    const match = contentDisposition.match(/filename="?(.+?)"?$/);
    if (match) filename = match[1];
  }

  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = filename;
  a.click();
  URL.revokeObjectURL(a.href);
}

// ─── Bucket Labels (for UI rendering) ───────────────────────

export const IRRBB_LABELS = [
  "≤ 1 bulan",
  "1-3 bulan",
  "3-6 bulan",
  "6-9 bulan",
  "9-12 bulan",
  "1-1.5Y",
  "1.5-2Y",
  "2-3Y",
  "3-4Y",
  "4-5Y",
  "5-6Y",
  "6-7Y",
  "7-8Y",
  "8-9Y",
  "9-10Y",
  "10-15Y",
  "15-20Y",
  "> 20Y",
];

export const LCR_LABELS = ["≤30D", ">30D"];
export const NSFR_LABELS = ["<6M", "6-12M", ">12M"];

// ─── Reference Tables (Superadmin) ──────────────────────────

export interface ReferenceItem {
  id: string;
  name: string;
}

export async function listReference(table: string): Promise<ReferenceItem[]> {
  const res = await fetch(`${API_BASE}/api/reference/${table}`, {
    headers: authHeaders(),
  });
  if (!res.ok) throw new Error("Failed to list reference");
  return res.json();
}

export async function createReference(
  table: string,
  item: ReferenceItem,
): Promise<ReferenceItem> {
  const res = await fetch(`${API_BASE}/api/reference/${table}`, {
    method: "POST",
    headers: { ...authHeaders(), "Content-Type": "application/json" },
    body: JSON.stringify(item),
  });
  if (!res.ok) {
    const data = await res.json();
    throw new Error(data.error || "Failed to create");
  }
  return res.json();
}

export async function updateReference(
  table: string,
  id: string,
  item: Partial<ReferenceItem>,
): Promise<ReferenceItem> {
  const res = await fetch(`${API_BASE}/api/reference/${table}/${id}`, {
    method: "PUT",
    headers: { ...authHeaders(), "Content-Type": "application/json" },
    body: JSON.stringify(item),
  });
  if (!res.ok) {
    const data = await res.json();
    throw new Error(data.error || "Failed to update");
  }
  return res.json();
}

export async function deleteReference(
  table: string,
  id: string,
): Promise<void> {
  const res = await fetch(`${API_BASE}/api/reference/${table}/${id}`, {
    method: "DELETE",
    headers: authHeaders(),
  });
  if (!res.ok) throw new Error("Failed to delete");
}

// ─── Behaviours ─────────────────────────────────────────────

export interface Behaviour {
  id: number;
  upload_id: string | null;
  name: string;
  is_default: boolean;
  created_at: string;
  updated_at: string;
  buckets?: BehaviourBucket[];
}

export interface BehaviourBucket {
  id?: number;
  behaviour_id: number;
  bucket_type: string;
  bucket_name: string;
  percentage: number;
}

export async function uploadBehaviour(
  uploadId: string,
  file: File,
  name: string,
): Promise<{ id: number; name: string; buckets: number }> {
  const formData = new FormData();
  formData.append("file", file);
  formData.append("name", name);
  const res = await fetch(`${API_BASE}/api/uploads/${uploadId}/behaviours`, {
    method: "POST",
    headers: authHeaders(),
    body: formData,
  });
  if (!res.ok) {
    const data = await res.json();
    throw new Error(data.error || "Failed to upload behaviour");
  }
  return res.json();
}

export async function listBehaviours(uploadId: string): Promise<Behaviour[]> {
  const res = await fetch(`${API_BASE}/api/uploads/${uploadId}/behaviours`, {
    headers: authHeaders(),
  });
  if (!res.ok) throw new Error("Failed to list behaviours");
  return res.json();
}

export async function getBehaviour(id: number): Promise<Behaviour> {
  const res = await fetch(`${API_BASE}/api/behaviours/${id}`, {
    headers: authHeaders(),
  });
  if (!res.ok) throw new Error("Failed to get behaviour");
  return res.json();
}

export async function deleteBehaviour(id: number): Promise<void> {
  const res = await fetch(`${API_BASE}/api/behaviours/${id}`, {
    method: "DELETE",
    headers: authHeaders(),
  });
  if (!res.ok) {
    const data = await res.json();
    throw new Error(data.error || "Failed to delete behaviour");
  }
}

// ─── Scenario Mappings ──────────────────────────────────────

export interface ScenarioMapping {
  id: number;
  upload_id: string;
  product_type: string;
  ccy: string;
  segment: string;
  transactional: string;
  behaviour_id: number;
  behaviour_name?: string;
}

export async function listMappings(
  uploadId: string,
): Promise<ScenarioMapping[]> {
  const res = await fetch(`${API_BASE}/api/uploads/${uploadId}/mappings`, {
    headers: authHeaders(),
  });
  if (!res.ok) throw new Error("Failed to list mappings");
  return res.json();
}

export async function createMapping(
  uploadId: string,
  mapping: Omit<ScenarioMapping, "id" | "upload_id" | "behaviour_name">,
): Promise<ScenarioMapping> {
  const res = await fetch(`${API_BASE}/api/uploads/${uploadId}/mappings`, {
    method: "POST",
    headers: { ...authHeaders(), "Content-Type": "application/json" },
    body: JSON.stringify(mapping),
  });
  if (!res.ok) {
    const data = await res.json();
    throw new Error(data.error || "Failed to create mapping");
  }
  return res.json();
}

export async function deleteMapping(id: number): Promise<void> {
  const res = await fetch(`${API_BASE}/api/mappings/${id}`, {
    method: "DELETE",
    headers: authHeaders(),
  });
  if (!res.ok) throw new Error("Failed to delete mapping");
}

export async function getMappingOptions(
  uploadId: string,
): Promise<{
  product_types: string[];
  ccys: string[];
  segments: string[];
  transactionals: string[];
}> {
  const res = await fetch(
    `${API_BASE}/api/uploads/${uploadId}/mapping-options`,
    {
      headers: authHeaders(),
    },
  );
  if (!res.ok) throw new Error("Failed to get mapping options");
  return res.json();
}

// ─── Reprocess ──────────────────────────────────────────────

export async function reprocessUpload(uploadId: string): Promise<void> {
  const res = await fetch(`${API_BASE}/api/uploads/${uploadId}/reprocess`, {
    method: "POST",
    headers: authHeaders(),
  });
  if (!res.ok) throw new Error("Failed to trigger reprocess");
}
