import { LegalLayout, Section } from './LegalLayout'
import { legal } from './legalConfig'

/**
 * Describes what this instance actually does with data. Kept in step with the
 * code: bank access via Enable Banking (services/enable_banking_client.py),
 * encrypted session storage (utils/crypto.py), and the optional AI advisor
 * (services/ai_service.py) which is the only path that sends financial data to
 * a third party.
 */
export function PrivacyPage() {
  return (
    <LegalLayout
      title="Privacy Policy"
      intro="Home Finance is a self-hosted personal finance tracker. This policy explains what it collects, why, and how to get rid of it."
    >
      <Section heading="Who is responsible">
        <p>
          This instance is operated privately by <strong>{legal.operator}</strong>, who is the
          data controller for everything described here. It is a small household deployment,
          not a commercial service, and accounts are available by invitation only.
        </p>
        <p>
          For any question about your data, or to exercise any right below, contact{' '}
          <a
            href={`mailto:${legal.contactEmail}`}
            className="text-primary underline underline-offset-4"
          >
            {legal.contactEmail}
          </a>
          .
        </p>
      </Section>

      <Section heading="What is collected">
        <ul className="list-disc space-y-2 pl-5">
          <li>
            <strong>Account details</strong> — your email address, display name and password
            (stored only as a bcrypt hash, never in readable form).
          </li>
          <li>
            <strong>Financial data you enter</strong> — accounts, transactions, categories,
            budgets, goals, debts and recurring expenses.
          </li>
          <li>
            <strong>Bank data, only if you connect a bank</strong> — account names and
            identifiers, currency, balances, and booked transactions including their date,
            amount, and description or counterparty name.
          </li>
          <li>
            <strong>Documents</strong> you choose to upload.
          </li>
          <li>
            <strong>Operational logs</strong> — errors and request records used to keep the
            app running.
          </li>
        </ul>
        <p>
          There is no advertising, no analytics, no tracking pixels and no profiling. Your data
          is never sold or shared for marketing.
        </p>
      </Section>

      <Section heading="Connecting a bank">
        <p>
          Bank connections use{' '}
          <a
            href="https://enablebanking.com"
            className="text-primary underline underline-offset-4"
            target="_blank"
            rel="noreferrer noopener"
          >
            Enable Banking
          </a>
          , a licensed account information service provider, under the EU PSD2 framework.
        </p>
        <ul className="list-disc space-y-2 pl-5">
          <li>
            You authenticate directly with your bank. <strong>This app never sees, receives
            or stores your bank credentials.</strong>
          </li>
          <li>Access is read-only. No payment can be initiated.</li>
          <li>
            Your consent is time-limited by your bank — typically 90 days — after which access
            stops until you reconnect.
          </li>
          <li>
            The access token identifying your bank session is encrypted at rest before being
            stored.
          </li>
          <li>
            You can disconnect at any time from the Connections page, which revokes the consent
            with Enable Banking. You can also review and revoke it directly at{' '}
            <a
              href="https://enablebanking.com/data-sharing-consents/"
              className="text-primary underline underline-offset-4"
              target="_blank"
              rel="noreferrer noopener"
            >
              Enable Banking&rsquo;s consent portal
            </a>
            .
          </li>
        </ul>
      </Section>

      <Section heading="The AI advisor">
        <p>
          The app includes an optional AI advisor. <strong>If, and only if, you use it</strong>,
          the questions you ask and the financial data needed to answer them — which can include
          transaction descriptions and amounts, account balances, budgets and debts — are sent
          to the third-party model provider configured on this instance (DeepSeek by default) for
          processing.
        </p>
        <p>
          If you would rather no financial data ever leave this server, do not use the AI
          advisor. The operator can also disable it entirely by removing the provider API key.
        </p>
      </Section>

      <Section heading="Who else processes your data">
        <ul className="list-disc space-y-2 pl-5">
          <li>
            <strong>Enable Banking</strong> — only if you connect a bank, to retrieve account
            and transaction data on your behalf.
          </li>
          <li>
            <strong>The configured AI provider</strong> — only if you use the AI advisor, as
            described above.
          </li>
          <li>
            <strong>The configured email provider</strong> — to send account emails such as
            password resets, verification and notifications you opt into.
          </li>
        </ul>
        <p>
          Everything else stays on the server this instance runs on. There are no other
          recipients.
        </p>
      </Section>

      <Section heading="Legal basis">
        <p>
          Account and financial data you enter are processed to provide the service you asked
          for (performance of a contract). Bank account access is processed on the basis of your
          explicit consent, given through your bank&rsquo;s own strong authentication, and can
          be withdrawn at any time without affecting anything processed beforehand.
        </p>
      </Section>

      <Section heading="How long it is kept">
        <p>
          Your data is kept for as long as your account exists. Disconnecting a bank stops any
          further data being retrieved; transactions already imported remain in your ledger
          until you delete them or ask for your account to be removed. Ask at{' '}
          <a
            href={`mailto:${legal.contactEmail}`}
            className="text-primary underline underline-offset-4"
          >
            {legal.contactEmail}
          </a>{' '}
          and your account and its data will be deleted.
        </p>
      </Section>

      <Section heading="Security">
        <p>
          Data is held in a database on the operator&rsquo;s own server rather than a shared
          cloud service. Passwords are hashed, bank session tokens are encrypted at rest, access
          requires authentication, and all traffic is served over HTTPS. Each user can only ever
          read their own records.
        </p>
        <p>
          No system is perfectly secure. This is a self-hosted personal project, and it is
          offered without warranty — see the Terms of Service.
        </p>
      </Section>

      <Section heading="Your rights">
        <p>
          Under the GDPR you may request access to your data, correct it, have it erased, obtain
          a portable copy, object to or restrict processing, and withdraw consent at any time.
          Contact{' '}
          <a
            href={`mailto:${legal.contactEmail}`}
            className="text-primary underline underline-offset-4"
          >
            {legal.contactEmail}
          </a>
          . You also have the right to complain to your national data protection authority.
        </p>
      </Section>

      <Section heading="Changes">
        <p>
          If this policy changes materially, the updated version will appear here with a new
          date, and anyone with a bank connection will be told before the change takes effect.
        </p>
      </Section>
    </LegalLayout>
  )
}
