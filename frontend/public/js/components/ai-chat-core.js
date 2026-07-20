/**
 * Shared engine behind the AI chat widget (popup) and the dedicated AI
 * Advisor page — SSE streaming, tool-call bookkeeping, and the small set of
 * pure render helpers both surfaces need. Neither UI owns this logic so the
 * two never drift apart.
 */
const AiChatCore = {
    TOOL_LABELS: {
        get_transactions_tool: 'Looking up transactions',
        get_totals_tool: 'Checking totals',
        get_account_balances_tool: 'Checking account balances',
        get_budgets_status_tool: 'Reviewing budgets',
        get_recurring_expenses_tool: 'Checking recurring expenses',
        get_debts_tool: 'Reviewing debts',
        send_analysis_email_tool: 'Sending email'
    },

    SUGGESTIONS: [
        'What are my top 3 expense categories this month?',
        'Am I on track with my budgets?',
        'Which recurring expenses hit in the next 7 days?',
        'How much total debt do I have, and what should I pay off first?'
    ],

    _statusPromise: null,

    /** Cached GET /ai/status — both surfaces call this on mount; only fetch once. */
    async checkStatus() {
        if (!this._statusPromise) {
            this._statusPromise = (API?.ai?.status
                ? API.ai.status()
                : Promise.reject(new Error('API.ai is unavailable (stale api.js?)')))
                .then((s) => !!s?.configured)
                .catch(() => false);
        }
        return this._statusPromise;
    },

    escapeHtml(text) {
        const el = document.createElement('span');
        el.textContent = text ?? '';
        return el.innerHTML;
    },

    /**
     * Render a full markdown response (tables, code fences, lists, links —
     * whatever the model produces) via marked + DOMPurify, both loaded from
     * CDN alongside this script (see layout.js ensureAiChatWidget and the
     * <head> of ai-advisor.html). Falls back to a minimal escaped-text
     * renderer in the unlikely case those haven't finished loading yet, so
     * we never dump raw/unescaped model output into the DOM.
     */
    renderMarkdown(text) {
        const raw = text ?? '';
        if (window.marked && window.DOMPurify) {
            const html = window.marked.parse(raw, { breaks: true, gfm: true });
            return window.DOMPurify.sanitize(html);
        }
        return this._fallbackMarkdown(raw);
    },

    _fallbackMarkdown(text) {
        let escaped = this.escapeHtml(text);
        escaped = escaped.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');
        escaped = escaped.replace(/(^|\n)- (.+)/g, '$1<li>$2</li>');
        escaped = escaped.replace(/(<li>.*<\/li>)/gs, '<ul class="ai-list">$1</ul>');
        escaped = escaped.replace(/\n/g, '<br>');
        return escaped;
    },

    /**
     * Drive one turn of the conversation. `conversation` is the full
     * {role, content}[] history including the just-pushed user message.
     * Handlers receive plain data — no DOM knowledge lives here.
     */
    async send(conversation, { onToken, onToolStart, onToolResult, onDone, onError } = {}) {
        if (!API?.ai?.chat) {
            onError && onError('AI client is unavailable. Hard-refresh the page (Ctrl+Shift+R) and try again.');
            return;
        }
        let buffer = '';
        await API.ai.chat(conversation, {
            onEvent: (evt) => {
                if (evt.type === 'token') {
                    buffer += evt.content;
                    onToken && onToken(buffer, evt.content);
                } else if (evt.type === 'tool_call_start') {
                    onToolStart && onToolStart(evt.tool, evt.args);
                } else if (evt.type === 'tool_call_result') {
                    onToolResult && onToolResult(evt.tool, evt.result);
                } else if (evt.type === 'done') {
                    onDone && onDone(evt.content || buffer);
                } else if (evt.type === 'error') {
                    onError && onError(evt.message || 'Something went wrong.');
                }
            },
            onError: (err) => onError && onError(err?.message || 'Connection error.')
        });
    }
};

window.AiChatCore = AiChatCore;
