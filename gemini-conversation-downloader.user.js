// ==UserScript==
// @name         Gemini Conversation Downloader
// @namespace    https://github.com/GeoAnima/Gemini-Conversation-Downloader/
// @version      1.0
// @author       Geo_Anima
// @description  Downloads Gemini shared conversations (gemini.google.com/share/*) as JSON or PDF
// @match        https://gemini.google.com/share/*
// @run-at       document-idle
// @license      MIT
// @require      https://cdn.jsdelivr.net/npm/marked@4.0.0/lib/marked.min.js
// @require      https://cdn.jsdelivr.net/npm/pdfkit@0.16.0/js/pdfkit.standalone.js
// @require      https://cdn.jsdelivr.net/npm/blob-stream@0.1.3/.js
// @require      https://unpkg.com/turndown/dist/turndown.js
// ==/UserScript==

(function() {
    'use strict';

    console.log("Gemini Downloader v1.4 Initializing...");

    // --- Configuration Constants ---
    const SELECTORS = {
        appRoot: '#app-root', // More specific observer target
        titleSection: '.share-title-section',
        titleH1: '.share-title-section h1',
        linkFlag: '.link-flag', // Anchor for button insertion logic
        buttonContainer: '.link-action-buttons', // Actual parent for appended buttons
        turnViewer: 'share-turn-viewer',
        userQueryText: 'user-query .query-text',
        assistantMarkdown: 'response-container message-content .markdown'
    };

    const PDF_STYLES = {
        font: 'Helvetica', fontBold: 'Helvetica-Bold', fontOblique: 'Helvetica-Oblique', fontMono: 'Courier',
        sizeNormal: 12, sizeCode: 10, sizeTable: 9, sizeHeadingBase: 16, sizeHeadingStep: -1, sizeHeadingMin: 10,
        colorUser: 'blue', colorAssistant: 'red', colorLink: 'blue', colorDefault: 'black', colorMeta: 'grey',
        indent: 20, listIndentFactor: 15, lineSpacing: 0.25, paraSpacing: 1.5
    };

    const BUTTON_ICON_STYLE = { margin: '0 4px' };

    let turndownServiceInstance = null; // Cache instance

    // --- Helper Functions ---

    /** Gets and sanitizes the conversation title */
    function getConversationTitle() {
        const titleElement = document.querySelector(SELECTORS.titleH1);
        let title = titleElement ? titleElement.textContent.trim() : 'gemini_conversation';
        title = title.replace(/[\s\\/:*?"<>|]+/g, '_').replace(/[^a-zA-Z0-9_.-]/g, '');
        return title.substring(0, 100) || 'gemini_conversation';
    }

    /** Triggers a browser download */
    function triggerDownload(blob, filename) {
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url; a.download = filename;
        document.body.appendChild(a); a.click();
        console.log(`[Download] Triggered: ${filename}`);
        setTimeout(() => {
            try { document.body.removeChild(a); } catch (e) {}
            URL.revokeObjectURL(url);
            console.log(`[Download] Cleaned up: ${filename}`);
        }, 100);
    }

    /** Initializes TurndownService */
    function getTurndownService() {
        if (!turndownServiceInstance && typeof TurndownService !== 'undefined') {
            turndownServiceInstance = new TurndownService({ headingStyle: 'atx', codeBlockStyle: 'fenced' });
            turndownServiceInstance.keep(['table', 'thead', 'tbody', 'tr', 'th', 'td']); // Basic table support
            console.log("[Turndown] Service Initialized.");
        } else if (!turndownServiceInstance) {
             console.error("[Turndown] TurndownService is not defined/loaded.");
        }
        return turndownServiceInstance;
    }

    // --- Scrape Messages ---
    async function scrapeMessages() {
        const turnViewers = Array.from(document.querySelectorAll(SELECTORS.turnViewer));
        const messages = [];
        console.log(`[Scraper] Found ${turnViewers.length} turn viewers using selector: "${SELECTORS.turnViewer}"`);

        for (const [index, turnViewer] of turnViewers.entries()) {
            // User Prompt
            const userQueryElement = turnViewer.querySelector(SELECTORS.userQueryText);
            if (userQueryElement?.innerText?.trim()) {
                messages.push({ role: 'user', content: userQueryElement.innerText.trim() });
            }

            // Assistant Response
            const assistantMarkdownElement = turnViewer.querySelector(SELECTORS.assistantMarkdown);
            if (assistantMarkdownElement) {
                const assistantContentHtml = assistantMarkdownElement.innerHTML.trim();
                const assistantContentText = assistantMarkdownElement.innerText.trim();
                if (assistantContentHtml || assistantContentText) {
                    messages.push({
                        role: 'assistant',
                        content: assistantContentText,
                        contentHtml: assistantContentHtml
                    });
                }
            }
        }
        console.log(`[Scraper] Scraped ${messages.length} messages.`);
        if (messages.length === 0 && turnViewers.length > 0) {
            console.warn(`[Scraper] Found turn viewers but failed to scrape messages. Selectors might be outdated: User="${SELECTORS.userQueryText}", Assistant="${SELECTORS.assistantMarkdown}"`);
        }
        return messages;
    }

    // --- Download as JSON ---
    async function onDownloadJsonClick() {
        console.log("[JSON] Download sequence started.");
        try {
            const messages = await scrapeMessages();
            if (!messages.length) { alert('No conversation data found.'); console.warn("[JSON] No messages."); return; }
            const jsonData = {
                title: getConversationTitle(),
                url: window.location.href,
                messages: messages.map(msg => ({ role: msg.role, content: msg.content }))
            };
            const blob = new Blob([JSON.stringify(jsonData, null, 2)], { type: 'application/json' });
            triggerDownload(blob, `${getConversationTitle()}_${Date.now()}.json`);
        } catch (err) { console.error("[JSON] Error:", err); alert("Failed to download JSON."); }
    }

    // --- Format Messages for PDF ---
    function formatMessageForPDF(doc, msg) {
        const label = msg.role === 'user' ? 'User:' : 'Assistant:';
        const color = msg.role === 'user' ? PDF_STYLES.colorUser : PDF_STYLES.colorAssistant;

        doc.fontSize(PDF_STYLES.sizeNormal).font(PDF_STYLES.fontBold).fillColor(color).text(label);
        doc.font(PDF_STYLES.font).fillColor(PDF_STYLES.colorDefault).moveDown(0.5);

        let markdownContent = '';
        if (msg.role === 'user') {
            markdownContent = msg.content || '';
        } else {
            const tdService = getTurndownService();
            if (!tdService) { markdownContent = msg.content || '[Turndown library unavailable]'; }
            else {
                try { markdownContent = tdService.turndown(msg.contentHtml || ''); }
                catch (tdError) { console.error("[PDF Format] Turndown failed:", tdError); markdownContent = msg.content || '[HTML conversion failed]'; }
            }
        }

        try {
            const tokens = marked.lexer(markdownContent);
            tokens.forEach(token => {
                 switch (token.type) {
                    case 'heading':
                        const size = Math.max(PDF_STYLES.sizeHeadingMin, PDF_STYLES.sizeHeadingBase + (PDF_STYLES.sizeHeadingStep * (token.depth - 1)) + 2);
                        doc.fontSize(size).font(PDF_STYLES.fontBold).text(token.text); doc.moveDown(0.3); break;
                    case 'paragraph': doc.fontSize(PDF_STYLES.sizeNormal).font(PDF_STYLES.font).text(token.text, { lineBreak: true }); doc.moveDown(PDF_STYLES.lineSpacing); break;
                    case 'list':
                        token.items.forEach((item, index) => {
                            const marker = token.ordered ? `${token.start + index}. ` : '• ';
                            let txt = item.task ? `[${item.checked ? 'X' : ' '}] ${item.text}` : item.text;
                            doc.fontSize(PDF_STYLES.sizeNormal).font(PDF_STYLES.font).text(marker + txt, { indent: (token.depth || 0) * PDF_STYLES.listIndentFactor }); doc.moveDown(0.1);
                        }); doc.moveDown(PDF_STYLES.lineSpacing); break;
                    case 'code': doc.fontSize(PDF_STYLES.sizeCode).font(PDF_STYLES.fontMono).text(token.text.replace(/\r\n/g, '\n'), { indent: PDF_STYLES.indent, lineBreak: true }); doc.moveDown(PDF_STYLES.lineSpacing); break;
                    case 'blockquote': doc.fontSize(PDF_STYLES.sizeNormal).font(PDF_STYLES.fontOblique).text(token.text, { indent: PDF_STYLES.indent }); doc.moveDown(PDF_STYLES.lineSpacing); break;
                    case 'table':
                        let head = token.header.map(c => c.text).join(' | '); let body = token.rows.map(r => r.map(c => c.text).join(' | ')).join('\n');
                        doc.font(PDF_STYLES.fontMono).fontSize(PDF_STYLES.sizeTable);
                        if (head) { doc.text(head); doc.text('-'.repeat(head.length)); } doc.text(body);
                        doc.font(PDF_STYLES.font).fontSize(PDF_STYLES.sizeNormal); doc.moveDown(PDF_STYLES.lineSpacing); break;
                    case 'hr': doc.moveDown(0.5).lineWidth(1).strokeColor(PDF_STYLES.colorMeta).dash(5, { space: 5 }).moveTo(50, doc.y).lineTo(doc.page.width - 50, doc.y).stroke().undash().moveDown(0.5); break;
                    case 'html': doc.fontSize(PDF_STYLES.sizeCode).font(PDF_STYLES.fontMono).text(token.text); doc.moveDown(PDF_STYLES.lineSpacing); break;
                    case 'space': break;
                    default: if (token.text) { doc.fontSize(PDF_STYLES.sizeNormal).font(PDF_STYLES.font).text(token.text); doc.moveDown(PDF_STYLES.lineSpacing); } break;
                 }
            });
        } catch (err) { console.error('[PDF Format] Marked/Render error:', err); doc.fillColor('orange').text(`[Msg Render Error]`).fillColor(PDF_STYLES.colorDefault); doc.fontSize(PDF_STYLES.sizeCode).font(PDF_STYLES.fontMono).text(msg.content || '[Content unavailable]'); doc.moveDown(PDF_STYLES.paraSpacing / 2); }
        doc.moveDown(PDF_STYLES.paraSpacing);
    }

    // --- Download as PDF ---
    async function onDownloadPdfClick() {
        console.log("[PDF] Download sequence started.");
        if (typeof marked === 'undefined' || typeof PDFDocument === 'undefined' || typeof blobStream === 'undefined' || typeof TurndownService === 'undefined') {
            alert('Error: Required libraries not loaded. Check console.'); console.error('Libs missing:', { marked, PDFDocument, blobStream, TurndownService }); return; }
        const messages = await scrapeMessages();
        if (!messages.length) { alert('No conversation data found.'); console.warn("[PDF] No messages."); return; }

        try {
            const doc = new PDFDocument({ margin: 50, autoFirstPage: false, bufferPages: true });
            const stream = doc.pipe(blobStream());
            const tdService = getTurndownService(); // Get/init Turndown
            if (!tdService) { alert("Error initializing Turndown service."); return; }

            console.log("[PDF] Initializing document."); doc.addPage(); const title = getConversationTitle();
            doc.fontSize(16).font(PDF_STYLES.fontBold).text(title, { align: 'center' });
            // Add URL instead of generic text
            doc.fontSize(10).font(PDF_STYLES.font).text(window.location.href, { align: 'center' });
            // Add Generation Date
            doc.fontSize(10).font(PDF_STYLES.font).text(`Generated on ${new Date().toLocaleDateString()}`, { align: 'center' });
            doc.moveDown(2); // Space after header block

            console.log("[PDF] Generating pages...");
            messages.forEach((msg, index) => {
                try { formatMessageForPDF(doc, msg, tdService); }
                catch (err) { console.error(`[PDF] Format Error Msg ${index + 1}:`, err); if (doc.y > doc.page.height - 100) doc.addPage(); doc.fillColor('orange').text(`[Msg Format Error]`).fillColor(PDF_STYLES.colorDefault); doc.fontSize(PDF_STYLES.sizeCode).font(PDF_STYLES.fontMono).text(msg.content || '[Err Content]'); doc.moveDown(PDF_STYLES.paraSpacing / 2); }
            });

            console.log("[PDF] Finalizing document..."); doc.end();
            stream.on('finish', () => {
                console.log("[PDF] Stream finished."); try { const blob = stream.toBlob('application/pdf'); triggerDownload(blob, `${title}_${Date.now()}.pdf`); }
                catch (finishErr) { console.error("[PDF] Finish Error:", finishErr); alert("Error creating/downloading PDF."); } });
            stream.on('error', (streamErr) => { console.error("[PDF] Stream Error:", streamErr); alert("PDF stream error."); });
        } catch (pdfErr) { console.error("[PDF] Setup Error:", pdfErr); alert("PDF setup error."); }
    }

    // --- Insert Download Buttons ---
    function insertDownloadButtons() {
        const buttonContainer = document.querySelector(SELECTORS.buttonContainer);
        if (!buttonContainer) { console.error(`[Inserter] Target ("${SELECTORS.buttonContainer}") not found.`); return; }

        function createIconButton(iconName, tooltipText, clickHandler) {
            const btn = document.createElement('button');
            btn.className = 'mdc-icon-button mat-mdc-icon-button mat-mdc-button-base mat-unthemed';
            btn.title = tooltipText; Object.assign(btn.style, BUTTON_ICON_STYLE);
            const matIcon = document.createElement('mat-icon');
            matIcon.className = 'mat-icon notranslate google-symbols mat-ligature-font mat-icon-no-color';
            matIcon.setAttribute('role', 'img'); matIcon.setAttribute('aria-hidden', 'true'); matIcon.textContent = iconName;
            const rippleSpan = document.createElement('span'); rippleSpan.className = 'mat-mdc-button-persistent-ripple mdc-icon-button__ripple';
            const focusSpan = document.createElement('span'); focusSpan.className = 'mat-focus-indicator';
            const targetSpan = document.createElement('span'); targetSpan.className = 'mat-mdc-button-touch-target';
            btn.append(rippleSpan, matIcon, focusSpan, targetSpan);
            btn.addEventListener('click', clickHandler);
            return btn;
        }

        const jsonBtn = createIconButton('description', 'Download conversation as JSON', onDownloadJsonClick);
        const pdfBtn = createIconButton('file_download', 'Download conversation as PDF', onDownloadPdfClick);

        try { buttonContainer.appendChild(jsonBtn); buttonContainer.appendChild(pdfBtn); console.log(`[Inserter] Buttons appended to "${SELECTORS.buttonContainer}"`); }
        catch (e) { console.error("[Inserter] Failed to append buttons:", e); }
    }

    // --- DOM Observation for Button Placement ---
    let buttonInserted = false;
    const observerCallback = (mutationsList, obs) => {
        const insertAnchor = document.querySelector(SELECTORS.buttonContainer); // Check directly for the button container

        if (insertAnchor && !buttonInserted) { // Simpler check: if the place to insert exists
            console.log(`[Observer] Target insertion anchor ("${SELECTORS.buttonContainer}") found.`);
            try {
                 insertDownloadButtons(); // No need to pass container if function finds it directly
                 buttonInserted = true;
                 obs.disconnect();
                 console.log("[Observer] Buttons inserted; observer disconnected.");
            } catch (insertErr) { console.error("[Observer] Error during button insertion:", insertErr); }
        }
    };

    const observerTarget = document.getElementById('app-root') || document.body; // Prefer #app-root if available
    console.log(`[Observer] Starting observer on ${observerTarget === document.body ? 'document.body' : '#app-root'}.`);
    const observer = new MutationObserver(observerCallback);
    observer.observe(observerTarget, { childList: true, subtree: true });

    // Timeout safeguard
     const observerTimeout = setTimeout(() => {
        if (!buttonInserted) {
           console.warn("[Observer] Target insertion point not found after 15s. Disconnecting.");
           observer.disconnect();
        }
     }, 15000);

})();
