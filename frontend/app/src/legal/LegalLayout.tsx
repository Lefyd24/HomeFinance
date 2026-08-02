import type { ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { legal, legalNeedsConfiguring } from './legalConfig'

/**
 * Shell for the two public legal pages.
 *
 * Deliberately outside RequireAuth and AppShell: Enable Banking, the banks'
 * consent screens and the data-sharing-consents portal all link here for people
 * who have no account on this instance. Anything behind the auth guard would be
 * a dead link to them.
 */
export function LegalLayout({
  title,
  intro,
  children,
}: {
  title: string
  intro: string
  children: ReactNode
}) {
  return (
    <div className="min-h-dvh bg-background">
      <div className="mx-auto w-full max-w-3xl px-4 py-10 sm:px-6 sm:py-14">
        <header className="mb-8 border-b border-border pb-6">
          <Link
            to="/dashboard"
            className="text-sm text-muted-foreground underline-offset-4 hover:underline"
          >
            Home Finance
          </Link>
          <h1 className="font-heading mt-3 text-3xl font-semibold tracking-tight text-foreground">
            {title}
          </h1>
          <p className="mt-2 text-muted-foreground">{intro}</p>
          <p className="mt-3 text-sm text-muted-foreground">
            Last updated {legal.lastUpdated}.
          </p>
        </header>

        {legalNeedsConfiguring() && (
          <div className="mb-8 rounded-lg border border-destructive/40 bg-destructive/10 p-4 text-sm text-destructive">
            <strong className="font-semibold">This page is not configured.</strong> Set the
            operator name and contact email in{' '}
            <code className="font-mono">src/legal/legalConfig.ts</code> before submitting these
            URLs to Enable Banking.
          </div>
        )}

        <div className="flex flex-col gap-8 text-[0.95rem] leading-relaxed text-foreground/90">
          {children}
        </div>

        <footer className="mt-12 flex gap-4 border-t border-border pt-6 text-sm text-muted-foreground">
          <Link to="/privacy" className="underline-offset-4 hover:underline">
            Privacy Policy
          </Link>
          <Link to="/terms" className="underline-offset-4 hover:underline">
            Terms of Service
          </Link>
        </footer>
      </div>
    </div>
  )
}

export function Section({ heading, children }: { heading: string; children: ReactNode }) {
  return (
    <section className="flex flex-col gap-3">
      <h2 className="font-heading text-lg font-semibold tracking-tight text-foreground">
        {heading}
      </h2>
      {children}
    </section>
  )
}
