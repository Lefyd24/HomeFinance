import { useQuery } from '@tanstack/react-query'

/**
 * Operator identity shown on the public Privacy and Terms pages.
 *
 * Enable Banking requires a privacy policy URL, a terms of service URL and a
 * data protection email when registering a PRODUCTION application. Those links
 * are surfaced to end users at https://enablebanking.com/data-sharing-consents/
 * where they review and revoke what they've shared, so the details are read by
 * real people deciding whether to trust this app with bank access.
 *
 * The values are NOT compiled in. Each operator sets LEGAL_OPERATOR_NAME,
 * LEGAL_CONTACT_EMAIL and LEGAL_JURISDICTION in the server's .env and they are
 * served from the public GET /api/legal endpoint, so one published image works
 * for everyone without showing the maintainer's name on other people's servers.
 */

/** Last substantive review of the policy text itself (not of the operator's details). */
export const LEGAL_TEXT_LAST_UPDATED = '2 August 2026'

interface LegalConfigResponse {
  operator: string | null
  contact_email: string | null
  jurisdiction: string | null
  configured: boolean
}

export interface Legal {
  operator: string
  contactEmail: string | null
  jurisdiction: string
  /** True once the server has an operator name and a contact email. */
  configured: boolean
  /** False until the first response arrives, so callers can avoid flashing a warning. */
  loaded: boolean
  lastUpdated: string
}

const FALLBACK_OPERATOR = 'the operator of this instance'
const FALLBACK_JURISDICTION = "the operator's country of residence"

// Plain fetch rather than apiFetch: this runs for people with no session, and
// apiFetch would attach a stale token and treat a 401 as a dead login.
async function fetchLegalConfig(): Promise<LegalConfigResponse> {
  const base = window.API_BASE_URL || window.localStorage.getItem('backendUrl') || '/api'
  const response = await fetch(`${base}/legal`)
  if (!response.ok) {
    throw new Error(`Failed to load legal configuration: ${response.status}`)
  }
  return (await response.json()) as LegalConfigResponse
}

export function useLegal(): Legal {
  const { data } = useQuery({
    queryKey: ['legal-config'],
    queryFn: fetchLegalConfig,
    staleTime: Infinity,
    retry: 1,
  })

  return {
    operator: data?.operator || FALLBACK_OPERATOR,
    contactEmail: data?.contact_email || null,
    jurisdiction: data?.jurisdiction || FALLBACK_JURISDICTION,
    configured: data?.configured ?? false,
    loaded: data !== undefined,
    lastUpdated: LEGAL_TEXT_LAST_UPDATED,
  }
}
