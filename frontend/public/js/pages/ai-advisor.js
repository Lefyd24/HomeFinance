/**
 * Dedicated full-page AI Advisor chat. Same conversation engine as the
 * floating widget (AiChatCore) — this page just gives it more room and a
 * docked glass composer instead of a popup.
 */
let aiPageConversation = [];
let aiPageStreaming = false;

document.addEventListener('DOMContentLoaded', async () => {
    if (!Auth.requireAuth()) return;

    Layout.render('ai-advisor');

    const template = document.getElementById('ai-advisor-template');
    const mainContent = document.getElementById('main-content');
    if (template && mainContent) {
        mainContent.innerHTML = '';
        mainContent.appendChild(template.content.cloneNode(true));
    }

    renderSuggestions();
    wireComposer();
    autoGrow(document.getElementById('ai-page-input'));
    fitShellHeight();
    window.addEventListener('resize', fitShellHeight);

    const configured = await AiChatCore.checkStatus();
    if (!configured) {
        // `.hidden` classes don't win here — ai-chat.css sets `display: flex`
        // on these same elements at equal specificity. The `hidden` attribute
        // is forced with !important by the app's Tailwind preflight, so it's
        // the one toggle that's guaranteed to actually hide them.
        document.getElementById('ai-page-not-configured').hidden = false;
        document.querySelector('.ai-page-composer-dock').hidden = true;
        document.getElementById('ai-page-empty').hidden = true;
    }
});

/** Size the shell to exactly fill the visible area below/above it, rather
 * than guessing the header/footer chrome height in CSS. */
function fitShellHeight() {
    const shell = document.querySelector('.ai-page-shell');
    const scroller = document.querySelector('.layout-main-scroll');
    if (!shell || !scroller) return;
    const top = shell.getBoundingClientRect().top - scroller.getBoundingClientRect().top;
    const footer = document.querySelector('.footer');
    const footerH = footer ? footer.offsetHeight : 0;
    const available = scroller.clientHeight - top - footerH;
    shell.style.height = `${Math.max(384, available)}px`;
}

function renderSuggestions() {
    const grid = document.getElementById('ai-suggestion-grid');
    if (!grid) return;
    grid.innerHTML = AiChatCore.SUGGESTIONS.map((s) => `
        <button type="button" class="ai-suggestion-chip" data-suggestion="${AiChatCore.escapeHtml(s)}">${AiChatCore.escapeHtml(s)}</button>
    `).join('');
    grid.querySelectorAll('.ai-suggestion-chip').forEach((btn) => {
        btn.addEventListener('click', () => {
            const input = document.getElementById('ai-page-input');
            input.value = btn.dataset.suggestion;
            submitMessage();
        });
    });
}

function wireComposer() {
    const form = document.getElementById('ai-page-form');
    const input = document.getElementById('ai-page-input');
    form.addEventListener('submit', (e) => {
        e.preventDefault();
        submitMessage();
    });
    input.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            submitMessage();
        }
    });
    input.addEventListener('input', () => autoGrow(input));
}

function autoGrow(textarea) {
    if (!textarea) return;
    textarea.style.height = 'auto';
    textarea.style.height = `${Math.min(textarea.scrollHeight, 144)}px`;
}

function buildTurn(role, html) {
    const wrap = document.createElement('div');
    wrap.className = `ai-turn ai-turn-${role}`;
    wrap.innerHTML = `
        <span class="ai-turn-label">${role === 'user' ? 'You' : 'Advisor'}</span>
        <div class="ai-bubble">${html}</div>
    `;
    return wrap;
}

function renderConversation() {
    const container = document.getElementById('ai-page-transcript');
    container.innerHTML = '';
    aiPageConversation.forEach((msg) => {
        container.appendChild(buildTurn(msg.role, AiChatCore.renderMarkdown(msg.content)));
    });
    container.scrollTop = container.scrollHeight;
}

async function submitMessage() {
    if (aiPageStreaming) return;
    const input = document.getElementById('ai-page-input');
    const text = (input.value || '').trim();
    if (!text) return;

    document.getElementById('ai-page-empty').hidden = true;
    document.getElementById('ai-page-transcript').hidden = false;

    input.value = '';
    autoGrow(input);
    aiPageConversation.push({ role: 'user', content: text });
    renderConversation();
    setSending(true);

    const container = document.getElementById('ai-page-transcript');
    const turn = buildTurn('assistant', '');
    const bubble = turn.querySelector('.ai-bubble');
    bubble.classList.add('ai-bubble-empty');
    const trail = document.createElement('div');
    trail.className = 'ai-tool-trail';
    turn.appendChild(trail);
    container.appendChild(turn);
    container.scrollTop = container.scrollHeight;

    const toolPills = {};
    const finish = (finalText) => {
        setSending(false);
        if (finalText != null) aiPageConversation.push({ role: 'assistant', content: finalText });
    };

    await AiChatCore.send(aiPageConversation, {
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
}

function setSending(sending) {
    aiPageStreaming = sending;
    const sendBtn = document.getElementById('ai-page-send');
    const input = document.getElementById('ai-page-input');
    if (sendBtn) sendBtn.disabled = sending;
    if (input) input.disabled = sending;
}
