import { toast } from 'sonner'
import { HugeiconsIcon } from '@hugeicons/react'
import { Copy01Icon } from '@hugeicons/core-free-icons'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { API_ENDPOINT_GROUPS, curlExample, type ApiEndpoint } from './apiKeyEndpoints'

async function copy(text: string) {
  try {
    await navigator.clipboard.writeText(text)
    toast.success('Copied to clipboard')
  } catch {
    toast.error('Could not copy — select the text and copy manually')
  }
}

function MethodBadge({ method }: { method: ApiEndpoint['method'] }) {
  return (
    <Badge variant={method === 'GET' ? 'secondary' : 'outline'} className="font-mono w-14 justify-center">
      {method}
    </Badge>
  )
}

export function ApiKeyGuide() {
  const origin = window.location.origin

  return (
    <Card>
      <CardHeader>
        <CardTitle>What you can do with API keys</CardTitle>
        <CardDescription>
          An API key lets a script, spreadsheet or dashboard read (and optionally change) your data
          without your password.
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-6">
        <section aria-labelledby="api-guide-auth" className="flex flex-col gap-2">
          <h3 id="api-guide-auth" className="text-sm font-semibold">
            1. Authenticate
          </h3>
          <p className="text-sm text-muted-foreground">
            Send the key in an <code className="font-mono">X-API-Key</code> header on every request.
            All endpoints live under <code className="font-mono">{origin}/api</code>.
          </p>
          <div className="relative">
            <pre className="rounded-lg border border-border bg-muted/60 p-3 pr-12 text-xs font-mono overflow-x-auto">
              {curlExample({ method: 'GET', path: '/accounts/', description: '' }, origin)}
            </pre>
            <Button
              type="button"
              size="icon"
              variant="ghost"
              className="absolute top-1.5 right-1.5"
              onClick={() =>
                void copy(curlExample({ method: 'GET', path: '/accounts/', description: '' }, origin))
              }
            >
              <HugeiconsIcon icon={Copy01Icon} strokeWidth={2} />
              <span className="sr-only">Copy example request</span>
            </Button>
          </div>
        </section>

        <section aria-labelledby="api-guide-scopes" className="flex flex-col gap-2">
          <h3 id="api-guide-scopes" className="text-sm font-semibold">
            2. Pick the right access level
          </h3>
          <ul className="text-sm text-muted-foreground list-disc pl-5 flex flex-col gap-1">
            <li>
              <strong className="text-foreground">Read-only</strong> keys can only make{' '}
              <code className="font-mono">GET</code> requests. Anything that would change data is
              rejected with <code className="font-mono">403</code>. Use these for dashboards and
              reporting.
            </li>
            <li>
              <strong className="text-foreground">Full access</strong> keys can also create, edit
              and delete (<code className="font-mono">POST</code>, <code className="font-mono">PUT</code>,{' '}
              <code className="font-mono">DELETE</code>) — as you, on your own data.
            </li>
            <li>Keys can&apos;t create or revoke other keys; that needs you signed in.</li>
            <li>Revoking a key stops it working immediately.</li>
          </ul>
        </section>

        <section aria-labelledby="api-guide-endpoints" className="flex flex-col gap-3">
          <h3 id="api-guide-endpoints" className="text-sm font-semibold">
            3. Endpoints
          </h3>
          {API_ENDPOINT_GROUPS.map((group) => (
            <div key={group.title} className="flex flex-col gap-1">
              <h4 className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                {group.title}
              </h4>
              <ul className="flex flex-col divide-y divide-border rounded-lg border border-border">
                {group.endpoints.map((endpoint) => (
                  <li
                    key={`${endpoint.method} ${endpoint.path}`}
                    className="flex items-center gap-3 px-3 py-2"
                  >
                    <MethodBadge method={endpoint.method} />
                    <div className="min-w-0 flex-1">
                      <code className="font-mono text-sm break-all">{endpoint.path}</code>
                      <p className="text-xs text-muted-foreground">{endpoint.description}</p>
                    </div>
                    <Button
                      type="button"
                      size="icon"
                      variant="ghost"
                      onClick={() => void copy(curlExample(endpoint, origin))}
                    >
                      <HugeiconsIcon icon={Copy01Icon} strokeWidth={2} />
                      <span className="sr-only">
                        Copy curl for {endpoint.method} {endpoint.path}
                      </span>
                    </Button>
                  </li>
                ))}
              </ul>
            </div>
          ))}
          <p className="text-sm text-muted-foreground">
            This is a highlight reel. The full interactive list, with request and response shapes,
            is at{' '}
            <a className="text-primary underline" href="/docs" target="_blank" rel="noreferrer">
              /docs
            </a>
            .
          </p>
        </section>

        <section aria-labelledby="api-guide-safety" className="flex flex-col gap-2">
          <h3 id="api-guide-safety" className="text-sm font-semibold">
            Keep keys safe
          </h3>
          <ul className="text-sm text-muted-foreground list-disc pl-5 flex flex-col gap-1">
            <li>Treat a key like a password — don&apos;t commit it to git or paste it into chats.</li>
            <li>Create one key per integration, so you can revoke just the one that leaks.</li>
            <li>Prefer read-only unless the integration really needs to write.</li>
          </ul>
        </section>
      </CardContent>
    </Card>
  )
}
