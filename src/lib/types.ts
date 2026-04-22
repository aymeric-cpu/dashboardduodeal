// ── Duodeal API types (subset needed for dashboard) ──

export interface DuodealDeal {
  id: number;
  uid: string;
  name: string;
  number: string;
  customer: { id: number; fullName: string } | null;
  primaryQuotationId: number | null;
  quotations?: DuodealQuotation[];
  createdAt: string;
  updatedAt?: string;
  owner?: { id: number; fullName: string } | null;
}

export interface DuodealQuotation {
  id: number;
  title: string;
  amountHt: number;
  amountTtc: number;
  taxAmount: number;
  uuid: string;
}

export interface DuodealListResponse<T> {
  data: T[];
  meta?: {
    total?: number;
    pages?: number;
    page?: number;
    limit?: number;
  };
}

// ── Airtable Management types ──

export interface AirtableCompany {
  recordId: string;
  id: number | null; // Duodeal internal company ID (Airtable "ID" field)
  name: string;
  statut: string | null;
  customerSuccess: string | null;
  apiKey: string | null;
  lastAlertSent: string | null; // ISO datetime
  /** Raw JSON string from Airtable "Monthly Counts Snapshot" field. Parsed via parseSnapshot(). */
  monthlyCountsSnapshot: string | null;
  userRecordIds: string[];
}

export interface AirtableUser {
  recordId: string;
  id: number | null; // Duodeal internal user ID
  email: string;
  firstName: string;
  lastName: string;
  active: boolean;
  loginAsUrl: string | null;
  companyRecordIds: string[];
  companyName: string | null;
}

// ── Dashboard domain types ──

export type HealthStatus = "healthy" | "warning" | "critical" | "unknown";

export interface MonthlyBucket {
  yearMonth: string; // "2026-04"
  label: string; // "Apr 26"
  dealCount: number;
  amountHtSum: number;
}

export interface ClientStats {
  companyRecordId: string;
  companyName: string;
  apiKey: string | null;
  totalDeals: number;
  dealsThisMonth: number;
  dealsLastMonth: number;
  /** Projected full-month count extrapolated from day of month: dealsThisMonth × daysInMonth / dayOfMonth */
  projectedThisMonth: number;
  /** Current day of month (1-31, UTC) */
  dayOfMonth: number;
  /** Total days in the current calendar month */
  daysInMonth: number;
  avgTrailing3mo: number; // average deals/month over trailing 3 complete months
  momChangePct: number | null; // null if last month is zero
  health: HealthStatus;
  healthReason: string;
  monthlyBuckets: MonthlyBucket[]; // last 13 months (oldest → newest)
  lastDealAt: string | null;
  error: string | null;
}

export interface ClientDetail extends ClientStats {
  recentDeals: DuodealDeal[]; // last 10
  users: AirtableUser[];
}

export interface DashboardSummary {
  clients: ClientStats[];
  generatedAt: string;
}
