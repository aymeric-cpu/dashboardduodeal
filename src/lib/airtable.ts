import type { AirtableCompany, AirtableUser } from "./types";

// ── Config ──

const BASE_ID = process.env.AIRTABLE_MANAGEMENT_BASE_ID || "appvoxHefQgJYWqND";
const COMPANIES_TABLE = "tblMauMvSlkmzdZxa";
const USERS_TABLE = "tblBKKh99a80JsneX";

// Companies field IDs
const F_COMPANY_NAME = "fldd1BkIhIrS0dp0R";
const F_COMPANY_ID = "fldCE3Af8niE9isM5";
const F_COMPANY_STATUT = "fldg81iP5Fzv09TZz";
const F_COMPANY_USERS = "fldwidwtAGpIkbIXj";
const F_COMPANY_CS = "fldGyKNBvgPOxigK8";
const F_COMPANY_API_KEY = "fldmh5wDq9khLdUbl"; // "API Key" (singleLineText)
const F_COMPANY_LAST_ALERT = "fldwRvxcOJlo8EtTT"; // "Last Alert Sent" (dateTime, UTC)
const F_COMPANY_SNAPSHOT = "fldLjEBeuUGXTT29T"; // "Monthly Counts Snapshot" (multilineText, JSON)

// Users field IDs
const F_USER_EMAIL = "fldzmrWZe5vJz1f7Q";
const F_USER_ID = "fldUySroQ14M4dffm";
const F_USER_FIRST = "fldi69uSCFnpJsxIt";
const F_USER_LAST = "fldmyXYpFV2ktKDSY";
const F_USER_ACTIVE = "fldpaFewneR8VFiAl";
const F_USER_LOGIN_AS = "fldzyfW6LvP8M4jhM";
const F_USER_COMPANY = "fld7ZJDMYbr0Hqezs";
const F_USER_COMPANY_NAME = "fldLpI1T6lg8N8RWs";

// ── Low-level fetch ──

interface AirtableRecord {
  id: string;
  fields: Record<string, unknown>;
  createdTime: string;
}

interface AirtableListResponse {
  records: AirtableRecord[];
  offset?: string;
}

async function airtableFetch(
  path: string,
  options: RequestInit = {}
): Promise<unknown> {
  const token = process.env.AIRTABLE_TOKEN;
  if (!token) throw new Error("AIRTABLE_TOKEN not configured");

  const res = await fetch(`https://api.airtable.com/v0/${path}`, {
    ...options,
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
      ...options.headers,
    },
    cache: "no-store",
  });
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Airtable ${res.status}: ${body}`);
  }
  return res.json();
}

async function listAllRecords(tableId: string): Promise<AirtableRecord[]> {
  const records: AirtableRecord[] = [];
  let offset: string | undefined;
  do {
    const url: string = `${BASE_ID}/${tableId}?pageSize=100&returnFieldsByFieldId=true${
      offset ? `&offset=${encodeURIComponent(offset)}` : ""
    }`;
    const res = (await airtableFetch(url)) as AirtableListResponse;
    records.push(...res.records);
    offset = res.offset;
  } while (offset);
  return records;
}

// ── Value extractors (Airtable fields are heterogeneous) ──

function str(v: unknown): string | null {
  if (v == null) return null;
  if (typeof v === "string") return v;
  if (typeof v === "number") return String(v);
  return null;
}

function num(v: unknown): number | null {
  if (typeof v === "number") return v;
  if (typeof v === "string" && v.trim() !== "" && !Number.isNaN(Number(v))) {
    return Number(v);
  }
  return null;
}

function bool(v: unknown): boolean {
  return v === true;
}

function linkedIds(v: unknown): string[] {
  if (!Array.isArray(v)) return [];
  return v.filter((x): x is string => typeof x === "string");
}

function linkedFirstName(v: unknown): string | null {
  if (!Array.isArray(v) || v.length === 0) return null;
  const first = v[0];
  if (typeof first === "string") return first;
  if (typeof first === "object" && first && "name" in first) {
    return str((first as { name: unknown }).name);
  }
  return null;
}

function selectName(v: unknown): string | null {
  if (typeof v === "string") return v;
  if (typeof v === "object" && v && "name" in v) {
    return str((v as { name: unknown }).name);
  }
  return null;
}

function collaboratorName(v: unknown): string | null {
  if (typeof v === "object" && v && "name" in v) {
    return str((v as { name: unknown }).name);
  }
  return null;
}

function buttonUrl(v: unknown): string | null {
  if (typeof v === "object" && v && "url" in v) {
    return str((v as { url: unknown }).url);
  }
  return null;
}

// ── Public API ──

export async function readCompanies(): Promise<AirtableCompany[]> {
  const records = await listAllRecords(COMPANIES_TABLE);
  return records.map((r) => ({
    recordId: r.id,
    id: num(r.fields[F_COMPANY_ID]),
    name: str(r.fields[F_COMPANY_NAME]) || "—",
    statut: selectName(r.fields[F_COMPANY_STATUT]),
    customerSuccess: collaboratorName(r.fields[F_COMPANY_CS]),
    apiKey: str(r.fields[F_COMPANY_API_KEY]),
    lastAlertSent: str(r.fields[F_COMPANY_LAST_ALERT]),
    monthlyCountsSnapshot: str(r.fields[F_COMPANY_SNAPSHOT]),
    userRecordIds: linkedIds(r.fields[F_COMPANY_USERS]),
  }));
}

export async function readUsers(): Promise<AirtableUser[]> {
  const records = await listAllRecords(USERS_TABLE);
  return records.map((r) => ({
    recordId: r.id,
    id: num(r.fields[F_USER_ID]),
    email: str(r.fields[F_USER_EMAIL]) || "",
    firstName: str(r.fields[F_USER_FIRST]) || "",
    lastName: str(r.fields[F_USER_LAST]) || "",
    active: bool(r.fields[F_USER_ACTIVE]),
    loginAsUrl: buttonUrl(r.fields[F_USER_LOGIN_AS]),
    companyRecordIds: linkedIds(r.fields[F_USER_COMPANY]),
    companyName: linkedFirstName(r.fields[F_USER_COMPANY_NAME]),
  }));
}

export async function readUsersForCompany(
  companyRecordId: string
): Promise<AirtableUser[]> {
  const allUsers = await readUsers();
  return allUsers.filter((u) => u.companyRecordIds.includes(companyRecordId));
}

export async function markAlertSent(
  companyRecordId: string,
  at: Date = new Date()
): Promise<void> {
  await airtableFetch(`${BASE_ID}/${COMPANIES_TABLE}/${companyRecordId}`, {
    method: "PATCH",
    body: JSON.stringify({
      fields: {
        [F_COMPANY_LAST_ALERT]: at.toISOString(),
      },
    }),
  });
}

/**
 * Persist the monthly counts snapshot JSON to the Companies table.
 * Caller is responsible for JSON.stringify on the snapshot shape.
 */
export async function writeSnapshot(
  companyRecordId: string,
  snapshotJson: string
): Promise<void> {
  await airtableFetch(`${BASE_ID}/${COMPANIES_TABLE}/${companyRecordId}`, {
    method: "PATCH",
    body: JSON.stringify({
      fields: {
        [F_COMPANY_SNAPSHOT]: snapshotJson,
      },
    }),
  });
}
