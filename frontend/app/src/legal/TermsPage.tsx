import { ContactEmail, LegalLayout, Section } from './LegalLayout'
import { useLegal } from './legalConfig'

export function TermsPage() {
  const legal = useLegal()
  return (
    <LegalLayout
      title="Terms of Service"
      intro="The terms on which this private, self-hosted instance of Home Finance is made available."
    >
      <Section heading="What this is">
        <p>
          Home Finance is a personal finance tracker operated privately by{' '}
          <strong>{legal.operator}</strong> for a small number of invited users. It is not a
          commercial product, it is not offered to the public, and there is no fee.
        </p>
      </Section>

      <Section heading="Who may use it">
        <p>
          Accounts are created by invitation only. You must be at least 18, use the service only for
          your own personal finances, keep your password confidential, and not attempt to access
          anyone else&rsquo;s data. The operator may suspend or remove an account that is misused.
        </p>
      </Section>

      <Section heading="Bank connections">
        <p>
          Connecting a bank is entirely optional. Access is read-only and cannot move money.
          Authentication happens at your bank, and access lasts only as long as the consent your
          bank grants — typically 90 days — after which you must reconnect.
        </p>
        <p>
          Bank data is retrieved through Enable Banking, whose own terms apply to that retrieval.
          Banks impose their own limits on how often accounts may be read, so synchronisation is
          periodic rather than instant, and imported data may lag behind your bank statement.{' '}
          <strong>Your bank&rsquo;s own records are always authoritative.</strong>
        </p>
      </Section>

      <Section heading="Not financial advice">
        <p>
          Any forecast, insight, budget suggestion or AI-generated response in this app is
          informational only. It is not financial, investment, tax or legal advice, it may be
          inaccurate or incomplete, and it must not be relied on for decisions. Verify anything that
          matters against your bank and a qualified professional.
        </p>
      </Section>

      <Section heading="Availability">
        <p>
          This is a self-hosted application running on private infrastructure. There is no uptime
          guarantee. It may be unavailable, be changed, or be discontinued at any time, and features
          that depend on third parties — bank synchronisation in particular — may stop working
          without notice.
        </p>
        <p>
          Keep your own records. Do not treat this app as your only copy of important financial
          information.
        </p>
      </Section>

      <Section heading="No warranty and limited liability">
        <p>
          The service is provided &ldquo;as is&rdquo;, without warranties of any kind, express or
          implied. To the fullest extent permitted by law, the operator is not liable for any loss
          arising from use of the service, including inaccurate data, lost data, or decisions made
          on the basis of anything shown here. Nothing here limits liability that cannot lawfully be
          limited.
        </p>
      </Section>

      <Section heading="Your data">
        <p>
          Your data belongs to you. How it is handled is set out in the{' '}
          <a href="/privacy" className="text-primary underline underline-offset-4">
            Privacy Policy
          </a>
          , which forms part of these terms.
        </p>
      </Section>

      <Section heading="Ending your use">
        <p>
          You may stop at any time: disconnect any linked banks and ask for your account to be
          deleted at <ContactEmail />. The operator may also close the instance, with reasonable
          notice where possible.
        </p>
      </Section>

      <Section heading="Governing law">
        <p>
          These terms are governed by the laws of {legal.jurisdiction}, without prejudice to any
          mandatory consumer protections available to you where you live.
        </p>
      </Section>

      <Section heading="Contact">
        <p>
          <ContactEmail />
        </p>
      </Section>
    </LegalLayout>
  )
}
