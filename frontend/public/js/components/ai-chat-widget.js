/**
 * AI Chat Widget - floating popup chat backed by the DeepSeek-powered
 * /ai/chat streaming endpoint. Mounted globally by Layout.render() so it's
 * available on every authenticated page (see components/layout.js
 * ensureAiChatWidget). Rendering logic is thin — the streaming/tool-call
 * engine lives in AiChatCore so the widget and the dedicated ai-advisor.html
 * page never drift apart.
 */
const AiChatWidget = {
    conversation: [],
    _mounted: false,
    _streaming: false,
    _configured: null,
    _size: null,

    MIN_W: 320,
    MIN_H: 400,

    mount() {
        // The dedicated full-page chat renders its own composer; don't
        // double up with the floating launcher there.
        if (document.body.classList.contains('ai-fullpage')) return;

        const existing = document.getElementById('ai-chat-widget-root');
        if (existing) existing.remove();

        this._size = this._loadSize();

        const root = document.createElement('div');
        root.id = 'ai-chat-widget-root';
        root.innerHTML = `
            <button id="ai-chat-fab" type="button" class="ai-fab" aria-label="Open AI Advisor chat">
                <span class="ai-fab-ring" aria-hidden="true"></span>
                <svg xmlns="http://www.w3.org/2000/svg" class="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
                </svg>
            </button>

            <div id="ai-chat-panel" class="ai-widget-panel" hidden style="width:${this._size.w}px;height:${this._size.h}px;">
                <div class="ai-resize-handle" id="ai-resize-handle" aria-hidden="true"></div>
                <div class="ai-panel-header">
                    <span class="ai-panel-title"><span class="ai-dot"></span>AI Advisor</span>
                    <div class="flex items-center gap-1">
                        <a href="ai-advisor.html" class="btn btn-ghost btn-xs btn-circle" aria-label="Open full-page chat" title="Open full page">
                            <svg xmlns="http://www.w3.org/2000/svg" class="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 8V4m0 0h4M4 4l5 5m11-1V4m0 0h-4m4 0l-5 5M4 16v4m0 0h4m-4 0l5-5m11 5l-5-5m5 5v-4m0 4h-4" />
                            </svg>
                        </a>
                        <button type="button" class="btn btn-ghost btn-xs btn-circle" onclick="AiChatWidget.close()" aria-label="Close chat">
                            <svg xmlns="http://www.w3.org/2000/svg" class="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12" />
                            </svg>
                        </button>
                    </div>
                </div>

                <div id="ai-chat-not-configured" class="ai-not-configured" hidden>
                    AI chat isn't configured yet. Ask your administrator to set DEEPSEEK_API_KEY.
                </div>

                <div id="ai-chat-messages" class="ai-transcript"></div>

                <div class="ai-composer-wrap">
                    <form id="ai-chat-form" class="ai-composer ai-glass">
                        <textarea id="ai-chat-input" rows="1" placeholder="Ask about your finances…"></textarea>
                        <button type="submit" id="ai-chat-send" class="ai-send-btn" aria-label="Send">
                            <svg xmlns="http://www.w3.org/2000/svg" class="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8" />
                            </svg>
                        </button>
                    </form>
                </div>
            </div>
        `;
        document.body.appendChild(root);

        document.getElementById('ai-chat-fab').addEventListener('click', () => this.toggle());
        const form = document.getElementById('ai-chat-form');
        form.addEventListener('submit', (e) => {
            e.preventDefault();
            this._submit();
        });
        const input = document.getElementById('ai-chat-input');
        input.addEventListener('keydown', (e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                this._submit();
            }
        });
        input.addEventListener('input', () => this._autoGrow(input));

        this._wireResize();
        this._renderConversation();

        if (!this._mounted) {
            this._mounted = true;
            AiChatCore.checkStatus().then((configured) => {
                this._configured = configured;
                this._applyConfiguredState();
            });
        } else {
            this._applyConfiguredState();
        }
    },

    toggle() {
        const panel = document.getElementById('ai-chat-panel');
        if (!panel) return;
        panel.hidden ? this.open() : this.close();
    },

    open() {
        const panel = document.getElementById('ai-chat-panel');
        if (!panel) return;
        panel.hidden = false;
        document.getElementById('ai-chat-input')?.focus();
    },

    close() {
        const panel = document.getElementById('ai-chat-panel');
        if (panel) panel.hidden = true;
    },

    _applyConfiguredState() {
        const notConfigured = document.getElementById('ai-chat-not-configured');
        const messages = document.getElementById('ai-chat-messages');
        const composerWrap = document.querySelector('#ai-chat-widget-root .ai-composer-wrap');
        if (!notConfigured || !messages || !composerWrap) return;
        // Use the `hidden` attribute, not a `.hidden` class — several ai-chat.css
        // rules set `display: flex` on these same elements at equal specificity,
        // and only the attribute form is guaranteed to win (see app.css preflight
        // `[hidden]{ display:none !important }`).
        const isConfigured = this._configured !== false;
        notConfigured.hidden = isConfigured;
        messages.hidden = !isConfigured;
        composerWrap.hidden = !isConfigured;
    },

    /* ── Resizing — drag the top-left grip; persisted per browser. ── */
    _loadSize() {
        try {
            const saved = JSON.parse(localStorage.getItem('aiChatWidgetSize') || 'null');
            if (saved && saved.w >= this.MIN_W && saved.h >= this.MIN_H) return saved;
        } catch (e) { /* ignore malformed value */ }
        return { w: 400, h: 544 };
    },

    _saveSize(w, h) {
        this._size = { w, h };
        localStorage.setItem('aiChatWidgetSize', JSON.stringify(this._size));
    },

    _wireResize() {
        const handle = document.getElementById('ai-resize-handle');
        const panel = document.getElementById('ai-chat-panel');
        if (!handle || !panel) return;

        handle.addEventListener('pointerdown', (e) => {
            e.preventDefault();
            const startX = e.clientX;
            const startY = e.clientY;
            const startW = panel.offsetWidth;
            const startH = panel.offsetHeight;
            const maxW = window.innerWidth - 32;
            const maxH = window.innerHeight - 128;

            const onMove = (ev) => {
                const w = Math.min(maxW, Math.max(this.MIN_W, startW - (ev.clientX - startX)));
                const h = Math.min(maxH, Math.max(this.MIN_H, startH - (ev.clientY - startY)));
                panel.style.width = `${w}px`;
                panel.style.height = `${h}px`;
            };
            const onUp = () => {
                document.removeEventListener('pointermove', onMove);
                document.removeEventListener('pointerup', onUp);
                this._saveSize(panel.offsetWidth, panel.offsetHeight);
            };
            document.addEventListener('pointermove', onMove);
            document.addEventListener('pointerup', onUp);
        });
    },

    _autoGrow(textarea) {
        textarea.style.height = 'auto';
        textarea.style.height = `${Math.min(textarea.scrollHeight, 120)}px`;
    },

    _renderConversation() {
        const container = document.getElementById('ai-chat-messages');
        if (!container) return;
        container.innerHTML = '';
        this.conversation.forEach((msg) => {
            container.appendChild(this._buildTurn(msg.role, AiChatCore.renderMarkdown(msg.content)));
        });
        container.scrollTop = container.scrollHeight;
    },

    _buildTurn(role, html) {
        const wrap = document.createElement('div');
        wrap.className = `ai-turn ai-turn-${role}`;
        wrap.innerHTML = `
            <span class="ai-turn-label">${role === 'user' ? 'You' : 'Advisor'}</span>
            <div class="ai-bubble">${html}</div>
        `;
        return wrap;
    },

    async _submit() {
        if (this._streaming) return;
        const input = document.getElementById('ai-chat-input');
        const text = (input.value || '').trim();
        if (!text) return;

        input.value = '';
        this._autoGrow(input);
        this.conversation.push({ role: 'user', content: text });
        this._renderConversation();
        this._setSending(true);

        const container = document.getElementById('ai-chat-messages');
        const turn = this._buildTurn('assistant', '');
        const bubble = turn.querySelector('.ai-bubble');
        bubble.classList.add('ai-bubble-empty');
        const trail = document.createElement('div');
        trail.className = 'ai-tool-trail';
        turn.appendChild(trail);
        container.appendChild(turn);
        container.scrollTop = container.scrollHeight;

        const toolPills = {};
        const finish = (finalText) => {
            this._setSending(false);
            if (finalText != null) this.conversation.push({ role: 'assistant', content: finalText });
        };

        await AiChatCore.send(this.conversation, {
            onToken: (buffer) => {
                bubble.classList.remove('ai-bubble-empty');
                bubble.innerHTML = AiChatCore.renderMarkdown(buffer);
                container.scrollTop = container.scrollHeight;
            },
            onToolStart: (tool) => {
                const label = AiChatCore.TOOL_LABELS[tool] || `Using ${tool}`;
                const pill = document.createElement('div');
                pill.className = 'ai-tool-pill is-active';
                pill.innerHTML = `<span class="ai-tool-dot"></span>${AiChatCore.escapeHtml(label)}`;
                trail.appendChild(pill);
                toolPills[tool] = pill;
                container.scrollTop = container.scrollHeight;
            },
            onToolResult: (tool) => {
                const pill = toolPills[tool];
                if (pill) pill.classList.replace('is-active', 'is-done');
            },
            onDone: (finalText) => {
                bubble.classList.remove('ai-bubble-empty');
                bubble.innerHTML = AiChatCore.renderMarkdown(finalText || '');
                finish(finalText || '');
            },
            onError: (message) => {
                bubble.classList.remove('ai-bubble-empty');
                const note = document.createElement('div');
                note.className = 'ai-error-note';
                note.textContent = message;
                bubble.appendChild(note);
                finish(null);
            }
        });
    },

    _setSending(sending) {
        this._streaming = sending;
        const sendBtn = document.getElementById('ai-chat-send');
        const input = document.getElementById('ai-chat-input');
        if (sendBtn) sendBtn.disabled = sending;
        if (input) input.disabled = sending;
    }
};

window.AiChatWidget = AiChatWidget;
