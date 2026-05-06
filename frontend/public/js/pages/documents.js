/**
 * Documents page controller
 *
 * Click behaviour:
 *   - Single click on a document card/row  → download
 *   - Eye icon button                       → open preview panel
 *   - Edit icon                             → open edit modal
 *   - Trash icon                            → delete
 *
 * Drag-and-drop:
 *   - Drag a document card/row onto a folder item to move it
 *   - Drop onto "All Documents" to remove from folder (root)
 */

let allDocuments = [];
let allFolders = [];
let activeFolder = null;   // null = All Documents
let currentView = 'grid';
let previewDocId = null;
let selectedFile = null;
let currentBlobUrl = null; // revoke when preview closes
let folderCommitInFlight = false; // debounce blur/enter double-fire

// ── Init ──────────────────────────────────────────────────────────────────────

document.addEventListener('DOMContentLoaded', async () => {
    if (!Auth.requireAuth()) return;
    Layout.render('documents');

    const template = document.getElementById('documents-template');
    const main = document.getElementById('main-content');
    if (template && main) {
        main.innerHTML = '';
        main.appendChild(template.content.cloneNode(true));
    }

    const saved = localStorage.getItem('docsView');
    if (saved === 'list') setView('list', false);

    await loadAll();
    setupUploadForm();
    setupEditForm();
    setupModalBackdropDismiss();

    // Must happen after template is in DOM
    hoistPreviewPanel();
    setupPreviewResize();
    setupOutsidePreviewClose();
});

// ── Data loading ──────────────────────────────────────────────────────────────

async function loadAll() {
    try {
        const [docs, folderData] = await Promise.all([
            API.request('/documents'),
            API.request('/documents/folders'),
        ]);
        allDocuments = docs;
        allFolders = folderData.folders || [];
        renderFolders();
        renderDocuments();
        populateFolderSelects();
    } catch {
        Utils.showToast('Failed to load documents', 'error');
    }
}

// ── Folder rendering ──────────────────────────────────────────────────────────

function renderFolders() {
    const panel = document.getElementById('foldersPanel');
    if (!panel) return;

    const totalCount = allDocuments.length;
    const allActive = activeFolder === null ? 'active' : '';

    let html = `
        <div
            class="folder-item ${allActive}"
            onclick="selectFolder(null)"
            ondragover="folderDragOver(event, this)"
            ondragleave="folderDragLeave(this)"
            ondrop="folderDrop(event, '')"
            data-folder=""
        >
            ${folderIcon('all')}
            <span>All Documents</span>
            <span class="folder-count">${totalCount}</span>
        </div>
    `;

    if (allFolders.length > 0) {
        html += `<div class="px-4 py-1 text-xs font-medium opacity-40 uppercase tracking-wider mt-2">Folders</div>`;
        for (const f of allFolders) {
            const isActive = activeFolder === f.name ? 'active' : '';
            const safeName = escHtml(f.name);
            html += `
                <div
                    class="folder-item ${isActive}"
                    onclick="selectFolder('${safeName}')"
                    ondragover="folderDragOver(event, this)"
                    ondragleave="folderDragLeave(this)"
                    ondrop="folderDrop(event, '${safeName}')"
                    data-folder="${safeName}"
                >
                    ${folderIcon('folder')}
                    <span class="truncate flex-1">${safeName}</span>
                    <span class="folder-count">${f.count}</span>
                    <button
                        class="btn btn-ghost btn-xs btn-square shrink-0 opacity-0 group-hover:opacity-100"
                        onclick="event.stopPropagation(); deleteFolder('${safeName}')"
                        title="Delete folder"
                    >
                        <svg xmlns="http://www.w3.org/2000/svg" class="h-3 w-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"/>
                        </svg>
                    </button>
                </div>
            `;
        }
    }

    html += `<div id="newFolderInputSlot"></div>`;
    panel.innerHTML = html;

    // Make folder items behave as a group for hover delete button
    panel.querySelectorAll('.folder-item').forEach(el => el.classList.add('group'));
}

function folderIcon(type) {
    if (type === 'all') {
        return `<svg xmlns="http://www.w3.org/2000/svg" class="h-4 w-4 opacity-60 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 6a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2V6zM14 6a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2V6zM4 16a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2v-2zM14 16a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2v-2z"/>
        </svg>`;
    }
    return `<svg xmlns="http://www.w3.org/2000/svg" class="h-4 w-4 opacity-60 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M3 7a2 2 0 012-2h4l2 2h8a2 2 0 012 2v8a2 2 0 01-2 2H5a2 2 0 01-2-2V7z"/>
    </svg>`;
}

function selectFolder(name) {
    activeFolder = name;
    renderFolders();
    renderDocuments();
}

// ── Folder creation (inline input) ───────────────────────────────────────────

function showNewFolderInput() {
    const slot = document.getElementById('newFolderInputSlot');
    if (!slot) return;
    folderCommitInFlight = false;
    slot.innerHTML = `
        <input
            class="folder-new-input"
            type="text"
            placeholder="Folder name..."
            id="inlineFolderInput"
            onkeydown="handleFolderInputKey(event)"
            onblur="onFolderInputBlur()"
        />
    `;
    // Small delay so focus doesn't immediately trigger blur
    setTimeout(() => document.getElementById('inlineFolderInput')?.focus(), 30);
}

function handleFolderInputKey(e) {
    if (e.key === 'Enter') {
        e.preventDefault();
        commitFolderInput();
    }
    if (e.key === 'Escape') {
        folderCommitInFlight = true; // prevent blur from re-triggering
        renderFolders();
    }
}

function onFolderInputBlur() {
    // Small delay so Enter key handler can set folderCommitInFlight first
    setTimeout(() => {
        if (!folderCommitInFlight) commitFolderInput();
    }, 120);
}

async function commitFolderInput() {
    if (folderCommitInFlight) return;
    folderCommitInFlight = true;

    const input = document.getElementById('inlineFolderInput');
    if (!input) return;
    const name = input.value.trim();
    if (!name) { renderFolders(); return; }

    try {
        await API.request('/documents/folders', { method: 'POST', body: JSON.stringify({ name }) });
        await loadAll();
        // Keep the new folder selected after creation
        activeFolder = name;
        renderFolders();
        renderDocuments();
        Utils.showToast(`Folder "${name}" created`, 'success');
    } catch (e) {
        const msg = String(e?.message || '');
        if (msg.includes('409') || msg.toLowerCase().includes('already')) {
            Utils.showToast('Folder already exists', 'warning');
        } else {
            Utils.showToast('Could not create folder', 'error');
        }
        renderFolders();
    }
}

async function deleteFolder(name) {
    if (!confirm(`Delete folder "${name}"? Documents inside will be moved to root.`)) return;
    try {
        await API.request(`/documents/folders/${encodeURIComponent(name)}`, { method: 'DELETE' });
        if (activeFolder === name) activeFolder = null;
        await loadAll();
        Utils.showToast('Folder deleted', 'success');
    } catch {
        Utils.showToast('Could not delete folder', 'error');
    }
}

// ── Folder drag-and-drop ──────────────────────────────────────────────────────

let dragDocId = null;

function onDocDragStart(e, docId) {
    dragDocId = docId;
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('text/plain', docId);
    // Slight visual feedback
    setTimeout(() => e.target.closest('.doc-card, .doc-row')?.classList.add('opacity-50'), 0);
}

function onDocDragEnd(e) {
    e.target.closest('.doc-card, .doc-row')?.classList.remove('opacity-50');
    dragDocId = null;
}

function folderDragOver(e, el) {
    if (!dragDocId) return;
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    el.classList.add('ring-2', 'ring-primary', 'ring-offset-1');
}

function folderDragLeave(el) {
    el.classList.remove('ring-2', 'ring-primary', 'ring-offset-1');
}

async function folderDrop(e, folderName) {
    e.preventDefault();
    const el = e.currentTarget;
    el.classList.remove('ring-2', 'ring-primary', 'ring-offset-1');

    const docId = dragDocId || e.dataTransfer.getData('text/plain');
    if (!docId) return;

    const doc = allDocuments.find(d => d.id === docId);
    if (!doc) return;

    const targetFolder = folderName; // empty string = root

    if ((doc.folder || '') === targetFolder) return; // no-op

    try {
        await API.request(`/documents/${docId}`, {
            method: 'PUT',
            body: JSON.stringify({ folder: targetFolder }),
        });
        Utils.showToast(
            targetFolder ? `Moved to "${targetFolder}"` : 'Moved to root',
            'success'
        );
        await loadAll();
    } catch {
        Utils.showToast('Could not move document', 'error');
    }
}

// ── Document rendering ────────────────────────────────────────────────────────

function renderDocuments() {
    const searchVal = document.getElementById('docSearch')?.value || '';
    let docs = allDocuments;

    if (activeFolder !== null) {
        docs = docs.filter(d => (d.folder || '') === activeFolder);
    }

    if (searchVal.trim()) {
        const q = searchVal.toLowerCase();
        docs = docs.filter(d =>
            d.title.toLowerCase().includes(q) ||
            (d.description || '').toLowerCase().includes(q) ||
            (d.filename || '').toLowerCase().includes(q) ||
            (d.folder || '').toLowerCase().includes(q)
        );
    }

    const grid = document.getElementById('docGrid');
    const panel = document.getElementById('docsPanel');
    if (!grid) return;

    const countEl = document.getElementById('docCount');
    if (countEl) countEl.textContent = `${docs.length} item${docs.length !== 1 ? 's' : ''}`;

    if (docs.length === 0) {
        grid.innerHTML = `
            <div class="doc-empty col-span-full">
                <svg xmlns="http://www.w3.org/2000/svg" class="h-16 w-16 mb-3 opacity-20" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="1" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                </svg>
                <p class="text-sm font-medium opacity-50">${searchVal ? 'No documents match your search' : 'No documents here yet'}</p>
                ${!searchVal ? `<button onclick="document.getElementById('uploadModal').showModal()" class="btn btn-primary btn-sm mt-3 gap-1.5">
                    <svg xmlns="http://www.w3.org/2000/svg" class="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12"/>
                    </svg>
                    Upload your first document
                </button>` : ''}
            </div>
        `;
        return;
    }

    if (currentView === 'grid') {
        panel.classList.remove('doc-list-view');
        grid.innerHTML = docs.map(renderDocCard).join('');
    } else {
        panel.classList.add('doc-list-view');
        grid.innerHTML = docs.map(renderDocRow).join('');
    }
}

function renderDocCard(doc) {
    const { cls, svg } = fileTypeStyle(doc.mime_type, doc.filename);
    const date = formatDate(doc.uploaded_at);
    const size = formatSize(doc.size);
    const id = escHtml(doc.id);

    return `
        <div
            class="doc-card"
            title="Click to download · Hold preview button to preview"
            draggable="true"
            ondragstart="onDocDragStart(event, '${id}')"
            ondragend="onDocDragEnd(event)"
            onclick="downloadDoc('${id}')"
        >
            <div class="doc-actions">
                <button class="btn btn-ghost btn-xs btn-square" onclick="event.stopPropagation(); openPreview('${id}')" title="Preview">
                    <svg xmlns="http://www.w3.org/2000/svg" class="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"/>
                        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z"/>
                    </svg>
                </button>
                <button class="btn btn-ghost btn-xs btn-square" onclick="event.stopPropagation(); openEditModal('${id}')" title="Edit">
                    <svg xmlns="http://www.w3.org/2000/svg" class="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z"/>
                    </svg>
                </button>
                <button class="btn btn-ghost btn-xs btn-square text-error" onclick="event.stopPropagation(); deleteDoc('${id}')" title="Delete">
                    <svg xmlns="http://www.w3.org/2000/svg" class="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"/>
                    </svg>
                </button>
            </div>
            <div class="doc-icon-wrap ${cls}">${svg}</div>
            <div class="doc-name">${escHtml(doc.title)}</div>
            <div class="doc-meta">${size} · ${date}</div>
            ${doc.folder ? `<div class="badge badge-ghost badge-xs">${escHtml(doc.folder)}</div>` : ''}
        </div>
    `;
}

function renderDocRow(doc) {
    const { cls, svg } = fileTypeStyle(doc.mime_type, doc.filename);
    const date = formatDate(doc.uploaded_at);
    const size = formatSize(doc.size);
    const id = escHtml(doc.id);
    const token = localStorage.getItem('token') || '';

    return `
        <div
            class="doc-row"
            draggable="true"
            ondragstart="onDocDragStart(event, '${id}')"
            ondragend="onDocDragEnd(event)"
            onclick="downloadDoc('${id}')"
        >
            <div class="doc-row-icon ${cls}">${svg}</div>
            <div class="doc-row-name">${escHtml(doc.title)}</div>
            ${doc.folder ? `<div class="badge badge-ghost badge-xs hidden sm:flex">${escHtml(doc.folder)}</div>` : ''}
            <div class="doc-row-meta hidden sm:block">${size}</div>
            <div class="doc-row-meta">${date}</div>
            <div class="doc-row-actions">
                <button class="btn btn-ghost btn-xs btn-square" onclick="event.stopPropagation(); openPreview('${id}')" title="Preview">
                    <svg xmlns="http://www.w3.org/2000/svg" class="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"/>
                        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z"/>
                    </svg>
                </button>
                <button class="btn btn-ghost btn-xs btn-square" onclick="event.stopPropagation(); openEditModal('${id}')" title="Edit">
                    <svg xmlns="http://www.w3.org/2000/svg" class="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z"/>
                    </svg>
                </button>
                <button class="btn btn-ghost btn-xs btn-square text-error" onclick="event.stopPropagation(); deleteDoc('${id}')" title="Delete">
                    <svg xmlns="http://www.w3.org/2000/svg" class="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"/>
                    </svg>
                </button>
            </div>
        </div>
    `;
}

// ── Download ──────────────────────────────────────────────────────────────────

function downloadDoc(docId) {
    const doc = allDocuments.find(d => d.id === docId);
    if (!doc) return;
    const token = localStorage.getItem('token') || '';
    const url = `${API.baseURL}/documents/${docId}/download?token=${encodeURIComponent(token)}`;
    const a = document.createElement('a');
    a.href = url;
    a.download = doc.filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
}

// ── Preview panel ─────────────────────────────────────────────────────────────

async function openPreview(docId) {
    const doc = allDocuments.find(d => d.id === docId);
    if (!doc) return;
    previewDocId = docId;

    const panel     = document.getElementById('previewPanel');
    const body      = document.getElementById('previewBody');
    const titleEl   = document.getElementById('previewTitle');
    const metaEl    = document.getElementById('previewMeta');
    const iconWrap  = document.getElementById('previewIconWrap');
    const dlBtn     = document.getElementById('previewDownloadBtn');

    if (!panel) return;

    titleEl.textContent = doc.title;
    metaEl.textContent  = `${formatSize(doc.size)} · ${doc.filename} · ${formatDate(doc.uploaded_at)}`;

    const { cls, svg } = fileTypeStyle(doc.mime_type, doc.filename);
    iconWrap.className  = `w-10 h-10 rounded-lg flex items-center justify-center shrink-0 ${cls}`;
    iconWrap.innerHTML  = svg;

    const token = localStorage.getItem('token') || '';
    const downloadUrl = `${API.baseURL}/documents/${docId}/download?token=${encodeURIComponent(token)}`;
    dlBtn.href = downloadUrl;

    // Revoke previous blob URL to free memory
    if (currentBlobUrl) { URL.revokeObjectURL(currentBlobUrl); currentBlobUrl = null; }

    body.innerHTML = `
        <div class="flex items-center justify-center h-full gap-2 text-base-content/40 text-sm">
            <span class="loading loading-spinner loading-sm"></span>
            Loading preview...
        </div>`;

    panel.classList.add('open');
    sizePreviewBody();

    const mime = doc.mime_type || '';
    const canPreview = mime === 'application/pdf' || mime.startsWith('image/') || mime === 'text/plain' || mime === 'text/csv';

    if (!canPreview) {
        body.innerHTML = buildUnsupportedPreview(doc, downloadUrl, cls, svg);
        return;
    }

    // Fetch with auth header and build a blob URL — works for all protected content
    try {
        const resp = await fetch(`${API.baseURL}/documents/${docId}/preview`, {
            headers: { 'Authorization': `Bearer ${token}` },
        });

        if (!resp.ok) throw new Error(`Server returned ${resp.status}`);

        const blob = await resp.blob();
        currentBlobUrl = URL.createObjectURL(blob);

        if (mime === 'application/pdf') {
            body.innerHTML = `<iframe src="${currentBlobUrl}" style="width:100%;height:100%;border:none;display:block"></iframe>`;
        } else if (mime.startsWith('image/')) {
            body.innerHTML = `
                <div style="display:flex;align-items:center;justify-content:center;height:100%;padding:1rem;overflow:auto;">
                    <img src="${currentBlobUrl}" alt="${escHtml(doc.title)}" style="max-width:100%;max-height:100%;object-fit:contain;border-radius:0.5rem">
                </div>`;
        } else {
            // text/plain or text/csv — render as text
            const text = await blob.text();
            body.innerHTML = `
                <pre style="padding:1rem;font-size:0.78rem;line-height:1.6;white-space:pre-wrap;word-break:break-word;overflow:auto;height:100%;margin:0">${escHtml(text)}</pre>`;
        }
    } catch (err) {
        body.innerHTML = `
            <div class="flex flex-col items-center justify-center h-full gap-3 p-6 text-center">
                <svg xmlns="http://www.w3.org/2000/svg" class="h-10 w-10 opacity-30" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"/>
                </svg>
                <p class="text-sm opacity-50">Could not load preview</p>
                <a href="${downloadUrl}" class="btn btn-primary btn-sm gap-1.5">
                    <svg xmlns="http://www.w3.org/2000/svg" class="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4"/>
                    </svg>
                    Download instead
                </a>
            </div>`;
    }
}

function buildUnsupportedPreview(doc, downloadUrl, cls, svg) {
    return `
        <div class="flex flex-col items-center justify-center h-full gap-4 p-8 text-center">
            <div class="w-16 h-16 rounded-2xl ${cls} flex items-center justify-center">
                ${svg.replace(/h-\d+\.?\d* w-\d+\.?\d*/g, 'h-8 w-8')}
            </div>
            <div>
                <p class="font-medium">${escHtml(doc.title)}</p>
                <p class="text-sm opacity-50 mt-1">${escHtml(doc.filename)}</p>
                <p class="text-xs opacity-40 mt-0.5">${formatSize(doc.size)}</p>
            </div>
            <p class="text-xs opacity-40">Preview not available for this file type</p>
            <a href="${downloadUrl}" class="btn btn-primary btn-sm gap-1.5">
                <svg xmlns="http://www.w3.org/2000/svg" class="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4"/>
                </svg>
                Download to open
            </a>
        </div>`;
}

function sizePreviewBody() {
    // Give the preview body an explicit pixel height so iframes/images fill it
    const panel  = document.getElementById('previewPanel');
    const header = panel?.querySelector('.doc-preview-header');
    const footer = panel?.querySelector('.doc-preview-footer');
    const body   = document.getElementById('previewBody');
    if (!panel || !body) return;
    const hh = header?.offsetHeight || 72;
    const fh = footer?.offsetHeight || 56;
    body.style.height = `${window.innerHeight - hh - fh}px`;
}

window.addEventListener('resize', () => {
    if (document.getElementById('previewPanel')?.classList.contains('open')) sizePreviewBody();
});

// ── Panel hoisting & resize ───────────────────────────────────────────────────

function hoistPreviewPanel() {
    // Move the panel to <body> so no ancestor overflow/stacking-context clips it
    const panel = document.getElementById('previewPanel');
    if (panel && panel.parentElement !== document.body) {
        document.body.appendChild(panel);
    }
    // Restore saved width
    const saved = parseInt(localStorage.getItem('previewPanelWidth'), 10);
    if (panel && saved >= 280) {
        panel.style.width = Math.min(saved, window.innerWidth * 0.9) + 'px';
    }
}

function setupPreviewResize() {
    const handle = document.getElementById('previewResizeHandle');
    const panel  = document.getElementById('previewPanel');
    if (!handle || !panel) return;

    let startX = 0, startW = 0;

    function onMove(e) {
        const clientX = e.touches ? e.touches[0].clientX : e.clientX;
        const delta   = startX - clientX;            // drag left → wider
        const newW    = Math.min(Math.max(startW + delta, 280), window.innerWidth * 0.9);
        panel.style.width = newW + 'px';
        sizePreviewBody();
    }

    function onUp() {
        panel.classList.remove('resizing');
        document.removeEventListener('mousemove', onMove);
        document.removeEventListener('mouseup',   onUp);
        document.removeEventListener('touchmove', onMove);
        document.removeEventListener('touchend',  onUp);
        localStorage.setItem('previewPanelWidth', panel.offsetWidth);
    }

    function onDown(e) {
        if (e.button !== undefined && e.button !== 0) return;
        startX = e.touches ? e.touches[0].clientX : e.clientX;
        startW = panel.offsetWidth;
        panel.classList.add('resizing');
        document.addEventListener('mousemove', onMove);
        document.addEventListener('mouseup',   onUp);
        document.addEventListener('touchmove', onMove, { passive: false });
        document.addEventListener('touchend',  onUp);
        e.preventDefault();
    }

    handle.addEventListener('mousedown',  onDown);
    handle.addEventListener('touchstart', onDown, { passive: false });
}

function closePreview() {
    document.getElementById('previewPanel')?.classList.remove('open');
    if (currentBlobUrl) { URL.revokeObjectURL(currentBlobUrl); currentBlobUrl = null; }
    previewDocId = null;
}

function setupModalBackdropDismiss() {
    // DaisyUI modals already handle backdrop clicks via <form method="dialog" class="modal-backdrop">
    // Nothing extra needed here.
}

function setupOutsidePreviewClose() {
    document.addEventListener('click', (e) => {
        // Ignore synthetic clicks (e.g. programmatic a.click() used for downloads)
        if (!e.isTrusted) return;
        const panel = document.getElementById('previewPanel');
        if (!panel?.classList.contains('open')) return;
        if (!panel.contains(e.target)) closePreview();
    }, true); // capture phase so panel-internal clicks don't bubble past it
}

async function deleteCurrentPreview() {
    if (!previewDocId) return;
    closePreview();
    await deleteDoc(previewDocId);
}

// ── Upload ────────────────────────────────────────────────────────────────────

function setupUploadForm() {
    document.getElementById('uploadForm')?.addEventListener('submit', async (e) => {
        e.preventDefault();
        if (!selectedFile) { Utils.showToast('Please select a file', 'warning'); return; }

        const title = document.getElementById('docTitle').value.trim();
        if (!title) { Utils.showToast('Please enter a title', 'warning'); return; }

        const description  = document.getElementById('docDescription').value.trim();
        const folderSelect = document.getElementById('docFolder').value;
        const folderNew    = document.getElementById('docFolderNew').value.trim();
        const folder       = folderNew || folderSelect;

        const btn  = document.getElementById('uploadBtn');
        const prog = document.getElementById('uploadProgress');
        btn.disabled = true;
        prog.classList.remove('hidden');

        try {
            const fd = new FormData();
            fd.append('file', selectedFile);
            fd.append('title', title);
            fd.append('description', description);
            fd.append('folder', folder);

            await API.request('/documents/upload', { method: 'POST', body: fd });
            Utils.showToast('Document uploaded', 'success');
            closeUploadModal();
            await loadAll();
        } catch (err) {
            Utils.showToast(err?.message || 'Upload failed', 'error');
        } finally {
            btn.disabled = false;
            prog.classList.add('hidden');
        }
    });
}

function handleFileSelect(input) {
    const file = input.files[0];
    if (file) setSelectedFile(file);
}

function handleDragOver(e) {
    e.preventDefault();
    document.getElementById('dropZone')?.classList.add('drop-zone-active');
}

function handleDragLeave() {
    document.getElementById('dropZone')?.classList.remove('drop-zone-active');
}

function handleDrop(e) {
    e.preventDefault();
    document.getElementById('dropZone')?.classList.remove('drop-zone-active');
    const file = e.dataTransfer?.files[0];
    if (file) setSelectedFile(file);
}

function setSelectedFile(file) {
    selectedFile = file;
    document.getElementById('dropZoneContent').classList.add('hidden');
    document.getElementById('dropZoneSelected').classList.remove('hidden');
    document.getElementById('selectedFileName').textContent = file.name;
    document.getElementById('selectedFileSize').textContent = formatSize(file.size);

    const { cls, svg } = fileTypeStyle(file.type, file.name);
    const iconEl = document.getElementById('selectedFileIcon');
    iconEl.className = `mx-auto mb-2 w-12 h-12 rounded-lg flex items-center justify-center ${cls}`;
    iconEl.innerHTML = svg.replace('h-5 w-5', 'h-7 w-7');

    const titleInput = document.getElementById('docTitle');
    if (!titleInput.value) {
        titleInput.value = file.name.replace(/\.[^.]+$/, '').replace(/[-_]/g, ' ');
    }
}

function closeUploadModal() {
    document.getElementById('uploadModal').close();
    document.getElementById('uploadForm').reset();
    document.getElementById('dropZoneContent').classList.remove('hidden');
    document.getElementById('dropZoneSelected').classList.add('hidden');
    document.getElementById('docFolderNew').classList.add('hidden');
    document.getElementById('docFolder').classList.remove('hidden');
    selectedFile = null;
}

function toggleFolderInput() {
    const select = document.getElementById('docFolder');
    const input  = document.getElementById('docFolderNew');
    const showing = !input.classList.contains('hidden');
    input.classList.toggle('hidden', showing);
    select.classList.toggle('hidden', !showing);
    if (!showing) input.focus();
}

// ── Edit modal ────────────────────────────────────────────────────────────────

function openEditModal(docId) {
    const doc = allDocuments.find(d => d.id === docId);
    if (!doc) return;

    document.getElementById('editDocId').value          = docId;
    document.getElementById('editTitle').value          = doc.title;
    document.getElementById('editDescription').value    = doc.description || '';

    const sel = document.getElementById('editFolder');
    sel.innerHTML = `<option value="">No folder</option>` +
        allFolders.map(f =>
            `<option value="${escHtml(f.name)}" ${doc.folder === f.name ? 'selected' : ''}>${escHtml(f.name)}</option>`
        ).join('');
    if (doc.folder && !allFolders.find(f => f.name === doc.folder)) {
        sel.innerHTML += `<option value="${escHtml(doc.folder)}" selected>${escHtml(doc.folder)}</option>`;
    }

    document.getElementById('editFolderNew').classList.add('hidden');
    document.getElementById('editFolder').classList.remove('hidden');
    document.getElementById('editModal').showModal();
}

function toggleEditFolderInput() {
    const sel  = document.getElementById('editFolder');
    const inp  = document.getElementById('editFolderNew');
    const show = inp.classList.contains('hidden');
    inp.classList.toggle('hidden', !show);
    sel.classList.toggle('hidden', show);
    if (show) inp.focus();
}

function setupEditForm() {
    document.getElementById('editForm')?.addEventListener('submit', async (e) => {
        e.preventDefault();
        const id       = document.getElementById('editDocId').value;
        const folderNew = document.getElementById('editFolderNew').value.trim();
        const folderSel = document.getElementById('editFolder').value;

        try {
            await API.request(`/documents/${id}`, {
                method: 'PUT',
                body: JSON.stringify({
                    title:       document.getElementById('editTitle').value.trim(),
                    description: document.getElementById('editDescription').value.trim(),
                    folder:      folderNew || folderSel,
                }),
            });
            Utils.showToast('Document updated', 'success');
            document.getElementById('editModal').close();
            await loadAll();
        } catch {
            Utils.showToast('Could not update document', 'error');
        }
    });
}

// ── Delete ────────────────────────────────────────────────────────────────────

async function deleteDoc(docId) {
    const doc  = allDocuments.find(d => d.id === docId);
    const name = doc?.title || 'this document';
    if (!confirm(`Delete "${name}"? This cannot be undone.`)) return;
    try {
        await API.request(`/documents/${docId}`, { method: 'DELETE' });
        Utils.showToast('Document deleted', 'success');
        await loadAll();
    } catch {
        Utils.showToast('Could not delete document', 'error');
    }
}

// ── UI helpers ────────────────────────────────────────────────────────────────

function handleSearch() { renderDocuments(); }

function setView(v, save = true) {
    currentView = v;
    if (save) localStorage.setItem('docsView', v);

    document.getElementById('viewGrid')?.classList.toggle('btn-active', v === 'grid');
    document.getElementById('viewList')?.classList.toggle('btn-active', v === 'list');

    renderDocuments();
}

function populateFolderSelects() {
    const sel = document.getElementById('docFolder');
    if (!sel) return;
    sel.innerHTML = `<option value="">No folder</option>` +
        allFolders.map(f => `<option value="${escHtml(f.name)}">${escHtml(f.name)}</option>`).join('');
}

// ── File type helpers ─────────────────────────────────────────────────────────

function fileTypeStyle(mime, filename) {
    const ext = (filename || '').split('.').pop()?.toLowerCase();
    if (mime === 'application/pdf' || ext === 'pdf')
        return { cls: 'ftype-pdf', svg: pdfIcon() };
    if ((mime || '').startsWith('image/'))
        return { cls: 'ftype-image', svg: imageIcon() };
    if (['doc', 'docx'].includes(ext) || (mime || '').includes('word'))
        return { cls: 'ftype-word', svg: docIcon() };
    if (['xls', 'xlsx'].includes(ext) || (mime || '').includes('excel') || (mime || '').includes('spreadsheet'))
        return { cls: 'ftype-excel', svg: sheetIcon() };
    if (['txt', 'csv'].includes(ext) || mime === 'text/plain' || mime === 'text/csv')
        return { cls: 'ftype-text', svg: textIcon() };
    if (ext === 'zip' || mime === 'application/zip')
        return { cls: 'ftype-zip', svg: zipIcon() };
    return { cls: 'ftype-other', svg: fileIcon() };
}

function pdfIcon()   { return `<svg xmlns="http://www.w3.org/2000/svg" class="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"/></svg>`; }
function imageIcon() { return `<svg xmlns="http://www.w3.org/2000/svg" class="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z"/></svg>`; }
function docIcon()   { return `<svg xmlns="http://www.w3.org/2000/svg" class="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"/></svg>`; }
function sheetIcon() { return `<svg xmlns="http://www.w3.org/2000/svg" class="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M3 10h18M3 14h18M10 3v18M14 3v18M5 3h14a2 2 0 012 2v14a2 2 0 01-2 2H5a2 2 0 01-2-2V5a2 2 0 012-2z"/></svg>`; }
function textIcon()  { return `<svg xmlns="http://www.w3.org/2000/svg" class="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 6h16M4 10h16M4 14h12M4 18h8"/></svg>`; }
function zipIcon()   { return `<svg xmlns="http://www.w3.org/2000/svg" class="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 8h14M5 8a2 2 0 110-4h14a2 2 0 110 4M5 8v10a2 2 0 002 2h10a2 2 0 002-2V8m-9 4h4"/></svg>`; }
function fileIcon()  { return `<svg xmlns="http://www.w3.org/2000/svg" class="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M7 21h10a2 2 0 002-2V9.414a1 1 0 00-.293-.707l-5.414-5.414A1 1 0 0012.586 3H7a2 2 0 00-2 2v14a2 2 0 002 2z"/></svg>`; }

function formatSize(bytes) {
    if (!bytes) return '0 B';
    if (bytes < 1024)             return bytes + ' B';
    if (bytes < 1024 * 1024)      return (bytes / 1024).toFixed(1) + ' KB';
    return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
}

function formatDate(iso) {
    if (!iso) return '';
    try {
        return new Date(iso).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' });
    } catch { return iso; }
}

function escHtml(s) {
    return String(s)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
}
