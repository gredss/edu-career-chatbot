document.addEventListener('DOMContentLoaded', () => {
    const WEBHOOK_URL = "https://wh.white-rabbit.my.id/webhook/d3aa3901-bd35-403b-9916-5f37175db3cd";

    let sessionId = localStorage.getItem('carin_session');
    if (!sessionId) {
        sessionId = crypto.randomUUID();
        localStorage.setItem('carin_session', sessionId);
    }
    console.log("Session ID:", sessionId);
    const chatMessages = document.getElementById('chatMessages');
    const chatInput = document.getElementById('chatInput');
    const sendBtn = document.getElementById('sendBtn');
    const mobileToggle = document.getElementById('mobileToggle');
    const navbarMenu = document.getElementById('navbarMenu');

// Event Listener
    // Toggle Menu Mobile
    if (mobileToggle) {
        mobileToggle.addEventListener('click', () => {
            navbarMenu.classList.toggle('active');
        });
    }

    // Klik Tombol Kirim
    sendBtn.addEventListener('click', () => handleUserInput());
    
    // Tekan Enter di Input Box
    chatInput.addEventListener('keypress', (e) => {
        if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            handleUserInput();
        }
    });

    chatMessages.addEventListener('click', (e) => {
        const btn = e.target.closest('.suggestion-btn');
        if (btn) {
            const text = btn.getAttribute('data-suggestion');
            if (text) {
                sendMessage(text);
            }
        }
    });

// Base Logic
    function handleUserInput() {
        const text = chatInput.value.trim();
        if (!text) return;
        
        sendMessage(text);
        chatInput.value = '';
        chatInput.style.height = 'auto'; 
    }

    async function sendMessage(text) {
        appendMessage(text, 'user');
        const loadingId = showTypingIndicator();
        scrollToBottom();

        try {
            const payload = {
                message: text,
                sessionId: sessionId
            };

            const response = await fetch(WEBHOOK_URL, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(payload)
            });

            const data = await response.json();
            removeTypingIndicator(loadingId);
            const parsed = parseTutorResponse(data);
            const msgElement = renderAIResponse(parsed);

            if (window.renderMathInElement && msgElement) {
                renderMathInElement(msgElement, {
                    delimiters: [
                        {left: '$$', right: '$$', display: true},
                        {left: '$', right: '$', display: false},
                        {left: '\\(', right: '\\)', display: false},
                        {left: '\\[', right: '\\]', display: true}
                    ],
                    throwOnError: false
                });
            }

        } catch (error) {
            console.error("Error:", error);
            removeTypingIndicator(loadingId);
            appendMessage("Maaf, terjadi kesalahan koneksi atau sistem sedang sibuk.", 'ai');
        }
    }

// Parsing Logic

    function parseTutorResponse(data) {
        let rawText = "";

        if (Array.isArray(data) && data[0]?.output) {
            rawText = data[0].output;
        } else if (data.output) {
            rawText = data.output;
        } else {
            rawText = JSON.stringify(data);
        }

        if (typeof rawText === 'object') {
            return mapResponseObject(rawText);
        }

        if (typeof rawText === 'string') {
            try {
                const firstBrace = rawText.indexOf('{');
                const lastBrace = rawText.lastIndexOf('}');

                if (firstBrace !== -1 && lastBrace !== -1) {
                    const jsonCandidate = rawText.substring(firstBrace, lastBrace + 1);
                    const parsed = JSON.parse(jsonCandidate);
                    return mapResponseObject(parsed);
                }
            } catch (e) {
                console.warn("Gagal parse JSON strict, fallback ke raw text.", e);
            }
            const cleanText = rawText.replace(/```json/g, '').replace(/```/g, '').trim();
            return { originalText: cleanText };
        }

        return { originalText: "Format respons tidak dikenali." };
    }

    function mapResponseObject(obj) {
        return {
            topic: obj.topic,
            explanation: obj.explanation,
            formula_example: obj.formula_example,
            followUp: obj.followUp || obj.follow_up
        };
    }

    function renderAIResponse(parsed) {
        let htmlBuffer = '';

        if (parsed.topic && parsed.topic !== 'None') {
            htmlBuffer += `<div style="font-weight: 700; color: var(--primary-blue); margin-bottom: 10px; font-size: 1.05em;">📚 ${parsed.topic}</div>`;
        }

        let content = parsed.explanation || '';

        if (parsed.formula_example) {
            content += `\n\n**Contoh Rumus:**\n${parsed.formula_example}`;
        }

        if (content) {
            htmlBuffer += formatMarkdown(content);
        }

        if (parsed.followUp) {
            htmlBuffer += `
                <div style="margin-top: 15px; padding-top: 10px; border-top: 1px dashed #ccc; font-style: italic; color: #555;">
                    💡 ${parsed.followUp}
                </div>`;
        }

        if (!htmlBuffer && parsed.originalText) {
            htmlBuffer = formatMarkdown(parsed.originalText);
        }

        return appendMessage(htmlBuffer, 'ai');
    }

// Formatter

    function appendMessage(htmlContent, type) {
        const msgDiv = document.createElement('div');
        msgDiv.className = `message ${type}`;

        const content = type === 'user' ? escapeHtml(htmlContent) : htmlContent;

        msgDiv.innerHTML = `<div class="message-bubble">${content}</div>`;
        chatMessages.appendChild(msgDiv);
        scrollToBottom();
        
        return msgDiv;
    }

    function formatMarkdown(text) {
        if (!text) return '';

        text = text.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');

        text = text.replace(/\*(.+?)\*/g, '<em>$1</em>');

        const lines = text.split('\n');
        let html = '';
        let insideList = false;

        lines.forEach(line => {
            const trimmed = line.trim();
            
            if (trimmed.startsWith('- ') || trimmed.startsWith('* ')) {
                if (!insideList) {
                    html += '<ul>';
                    insideList = true;
                }
                html += `<li>${trimmed.substring(2)}</li>`;
            } 

            else if (/^\d+\.\s/.test(trimmed)) {
                if (!insideList) {
                    html += '<ul>';
                    insideList = true;
                }

                html += `<li>${trimmed.replace(/^\d+\.\s/, '')}</li>`;
            } 

            else {
                if (insideList) {
                    html += '</ul>';
                    insideList = false;
                }
                if (trimmed) {
                    html += `<p>${trimmed}</p>`;
                }
            }
        });

        if (insideList) html += '</ul>';
        return html;
    }

    function showTypingIndicator() {
        const id = 'typing-' + Date.now();
        const div = document.createElement('div');
        div.id = id;
        div.className = 'message ai';
        div.innerHTML = `
            <div class="message-bubble" style="padding: 10px 15px;">
                <div class="typing-indicator active" style="padding:0; background:none;">
                    <div class="typing-dot"></div>
                    <div class="typing-dot"></div>
                    <div class="typing-dot"></div>
                </div>
            </div>
        `;
        chatMessages.appendChild(div);
        return id;
    }

    function removeTypingIndicator(id) {
        const el = document.getElementById(id);
        if (el) el.remove();
    }

    function scrollToBottom() {
        chatMessages.scrollTop = chatMessages.scrollHeight;
    }

    function escapeHtml(text) {
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    }
});