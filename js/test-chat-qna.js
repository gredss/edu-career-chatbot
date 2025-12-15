document.addEventListener('DOMContentLoaded', () => {
    /* ===============================
       CONFIG & SESSION
    =============================== */
    const WEBHOOK_URL = "https://wh.white-rabbit.my.id/webhook/ce587a0d-50a4-4460-b5b7-c39f7156066a";

    let sessionId = localStorage.getItem('carin_session');
    if (!sessionId) {
        sessionId = crypto.randomUUID();
        localStorage.setItem('carin_session', sessionId);
    }

    /* ===============================
       DOM ELEMENTS
    =============================== */
    const chatMessages = document.getElementById('chatMessages');
    const chatInput = document.getElementById('chatInput');
    const sendBtn = document.getElementById('sendBtn');
    const mobileToggle = document.getElementById('mobileToggle');
    const navbarMenu = document.getElementById('navbarMenu');

    /* ===============================
       EVENTS
    =============================== */
    mobileToggle?.addEventListener('click', () => {
        navbarMenu.classList.toggle('active');
    });

    sendBtn.addEventListener('click', handleUserInput);

    chatInput.addEventListener('keydown', e => {
        if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            handleUserInput();
        }
    });

    chatMessages.addEventListener('click', e => {
        const btn = e.target.closest('.suggestion-btn');
        if (btn?.dataset.suggestion) {
            sendMessage(btn.dataset.suggestion);
        }
    });

    /* ===============================
       CORE
    =============================== */
    let isSending = false;

    function handleUserInput() {
        const text = chatInput.value.trim();
        if (!text) return;
        chatInput.value = '';
        sendMessage(text);
    }

    async function sendMessage(text) {
        if (isSending) return;
        isSending = true;

        appendMessage(text, 'user');
        const typingId = showTypingIndicator();

        try {
            const res = await fetch(WEBHOOK_URL, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ message: text, sessionId })
            });

            const data = await res.json();
            removeTypingIndicator(typingId);

            const parsed = parseResponse(data);
            const msgEl = renderAI(parsed);

            if (window.renderMathInElement && msgEl) {
                renderMathInElement(msgEl, {
                    delimiters: [
                        { left: '$$', right: '$$', display: true },
                        { left: '$', right: '$', display: false }
                    ],
                    throwOnError: false
                });
            }

        } catch (err) {
            console.error(err);
            removeTypingIndicator(typingId);
            appendMessage("⚠️ Terjadi kesalahan sistem.", 'ai');
        } finally {
            isSending = false;
        }
    }

    /* ===============================
       PARSER
    =============================== */
    function parseResponse(data) {
        let raw =
            typeof data === 'string'
                ? data
                : data?.output || data?.[0]?.output || JSON.stringify(data);

        const jsonMatch = raw.match(/\{[\s\S]*\}/);
        if (!jsonMatch) {
            return { type: 'text', content: raw };
        }

        try {
            const obj = JSON.parse(jsonMatch[0]);

            if (obj.question && obj.options) {
                return { type: 'quiz', ...obj };
            }
            if (obj.feedback) {
                return { type: 'feedback', ...obj };
            }
            if (obj.explanation || obj.topic) {
                return { type: 'tutorial', ...obj };
            }

            return { type: 'text', content: raw };
        } catch {
            return { type: 'text', content: raw };
        }
    }

    /* ===============================
       RENDERING
    =============================== */
    function renderAI(parsed) {
        let html = '';

        switch (parsed.type) {
            case 'quiz':
                html = renderQuiz(parsed);
                break;
            case 'feedback':
                html = renderFeedback(parsed);
                break;
            case 'tutorial':
                html = renderTutorial(parsed);
                break;
            default:
                html = formatMarkdown(parsed.content);
        }

        return appendMessage(html, 'ai');
    }

    function renderQuiz(q) {
        return `
            <div class="quiz">
                <div class="quiz-question">❓ ${escapeHtml(q.question)}</div>
                <div class="quiz-options">
                    ${q.options.map(o => `
                        <button class="quiz-btn" data-answer="${escapeHtml(o)}">
                            ${escapeHtml(o)}
                        </button>
                    `).join('')}
                </div>
            </div>
        `;
    }

    function renderFeedback(fb) {
        return `
            <div class="feedback">
                ${formatMarkdown(fb.feedback)}
                <div class="feedback-actions">
                    <button class="suggestion-btn" data-suggestion="Lanjut ke soal berikutnya">📝 Lanjut</button>
                    <button class="suggestion-btn" data-suggestion="Kembali ke materi">📚 Materi</button>
                </div>
            </div>
        `;
    }

    function renderTutorial(t) {
        return `
            <div class="tutorial">
                ${t.topic ? `<h4>${escapeHtml(t.topic)}</h4>` : ''}
                ${formatMarkdown(t.explanation || '')}
                ${t.formula_example ? `<div class="formula">${formatMarkdown(t.formula_example)}</div>` : ''}
            </div>
        `;
    }

    /* ===============================
       UI HELPERS
    =============================== */
    function appendMessage(content, type) {
        const div = document.createElement('div');
        div.className = `message ${type}`;
        div.innerHTML = `<div class="message-bubble">${type === 'user' ? escapeHtml(content) : content}</div>`;
        chatMessages.appendChild(div);
        chatMessages.scrollTop = chatMessages.scrollHeight;
        return div;
    }

    function showTypingIndicator() {
        const id = 'typing-' + Date.now();
        chatMessages.insertAdjacentHTML('beforeend', `
            <div class="message ai" id="${id}">
                <div class="message-bubble typing-indicator active">
                    <span></span><span></span><span></span>
                </div>
            </div>
        `);
        return id;
    }

    function removeTypingIndicator(id) {
        document.getElementById(id)?.remove();
    }

    function escapeHtml(text) {
        const d = document.createElement('div');
        d.textContent = text;
        return d.innerHTML;
    }

    function formatMarkdown(text = '') {
        return text
            .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
            .replace(/\*(.*?)\*/g, '<em>$1</em>')
            .split('\n')
            .map(l => `<p>${l}</p>`)
            .join('');
    }
});
