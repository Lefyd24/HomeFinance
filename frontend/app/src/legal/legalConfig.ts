/**
 * Operator identity shown on the public Privacy and Terms pages.
 *
 * Enable Banking requires a privacy policy URL, a terms of service URL and a
 * data protection email when registering a PRODUCTION application. Those links
 * are surfaced to end users at https://enablebanking.com/data-sharing-consents/
 * where they review and revoke what they've shared — so the details below are
 * read by real people deciding whether to trust this app with bank access.
 *
 * ── EDIT THESE THREE VALUES BEFORE REGISTERING THE APPLICATION ──
 */
export const legal = {
  /** Who operates this instance. A personal name is fine for a household app. */
  operator: 'Eleftherios Fthenos',

  /**
   * Data protection contact. Must be a mailbox you actually read: Enable
   * Banking asks for it as `gdpr_email`, and users contact it about their data.
   */
  contactEmail: 'fthenosyd@gmail.com',

  /** Governing law for the Terms. Your country of residence is the usual answer. */
  jurisdiction: 'Greece',

  /** Last substantive review of these documents. */
  lastUpdated: '2 August 2026',
} as const

/** True while the placeholders above are untouched. */
export function legalNeedsConfiguring(): boolean {
  return legal.operator.startsWith('CHANGE ME') || legal.contactEmail.startsWith('CHANGE ME')
}
