document.addEventListener('DOMContentLoaded', () => {
    // ==========================================
    // 1. KONFIGURASI & SESSION
    // ==========================================
    const WEBHOOK_URL = "https://wh.white-rabbit.my.id/webhook/ce587a0d-50a4-4460-b5b7-c39f7156066a";
    
    // Cek apakah user sudah punya Session ID (biar chat tidak reset saat refresh)
    let sessionId = localStorage.getItem('carin_session');
    if (!sessionId) {
        sessionId = crypto.randomUUID();
        localStorage.setItem('carin_session', sessionId);
    }
    console.log("Session ID:", sessionId);

    // ==========================================
    // 2. DOM ELEMENTS
    // ==========================================
    const chatMessages = document.getElementById('chatMessages');
    const chatInput = document.getElementById('chatInput');
    const sendBtn = document.getElementById('sendBtn');
    const mobileToggle = document.getElementById('mobileToggle');
    const navbarMenu = document.getElementById('navbarMenu');

    // ==========================================
    // 3. EVENT LISTENERS
    // ==========================================
    
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

    // Event Delegation untuk Tombol Saran (Suggestion Buttons)
    // Ini menangani klik tombol saran, baik yang ada dari awal maupun yang dinamis
    chatMessages.addEventListener('click', (e) => {
        const btn = e.target.closest('.suggestion-btn');
        if (btn) {
            const text = btn.getAttribute('data-suggestion');
            if (text) {
                sendMessage(text);
            }
        }
    });

    // ==========================================
    // 4. CORE LOGIC
    // ==========================================

    function handleUserInput() {
        const text = chatInput.value.trim();
        if (!text) return;
        
        sendMessage(text);
        chatInput.value = ''; // Kosongkan input setelah kirim
        
        // Reset tinggi input jika menggunakan textarea auto-resize (opsional)
        chatInput.style.height = 'auto'; 
    }

    async function sendMessage(text) {
        // 1. Tampilkan pesan User
        appendMessage(text, 'user');
        
        // 2. Tampilkan Loading Indicator
        const loadingId = showTypingIndicator();
        scrollToBottom();

        try {
            // 3. Request ke Webhook n8n
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
            
            // 4. Hapus Loading Indicator
            removeTypingIndicator(loadingId);

            // 5. Parse Data (Ekstrak JSON dari respons AI yang mungkin 'kotor')
            const parsed = parseTutorResponse(data);
            
            // 6. Render Jawaban AI ke Layar
            const msgElement = renderAIResponse(parsed);

            // 7. Trigger KaTeX untuk merender Rumus Matematika (LaTeX)
            // Mengecek apakah library KaTeX sudah dimuat di HTML
            if (window.renderMathInElement && msgElement) {
                renderMathInElement(msgElement, {
                    delimiters: [
                        {left: '$$', right: '$$', display: true}, // Display Math (Blok)
                        {left: '$', right: '$', display: false},   // Inline Math
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

    // ==========================================
    // 5. PARSING & RENDERING LOGIC (PENTING)
    // ==========================================

    /**
     * Fungsi ini bertugas membersihkan output AI.
     * Seringkali LLM memberikan teks intro sebelum JSON, contoh:
     * "Tentu, ini JSON nya: { ... }" -> Kita hanya butuh { ... }
     */
    function parseTutorResponse(data) {
        let rawText = "";

        // 1. Extract raw text from response
        if (Array.isArray(data) && data[0]?.output) {
            rawText = data[0].output;
        } else if (data.output) {
            rawText = data.output;
        } else if (typeof data === 'string') {
            rawText = data;
        } else {
            rawText = JSON.stringify(data);
        }

        // 2. Jika sudah object, langsung identifikasi
        if (typeof rawText === 'object' && rawText !== null && !Array.isArray(rawText)) {
            return identifyResponseType(rawText);
        }

        // 3. Parse string response
        let introText = "";
        let jsonObj = null;
        let jsonStr = "";

        // Pattern 1: Ada code block json
        const jsonBlockMatch = rawText.match(/```json\s*([\s\S]*?)\s*```/);
        if (jsonBlockMatch) {
            jsonStr = jsonBlockMatch[1].trim();
            introText = rawText.substring(0, jsonBlockMatch.index).trim();
        } 
        // Pattern 2: Ada code block tanpa label
        else if (rawText.includes('```')) {
            const codeBlockMatch = rawText.match(/```\s*([\s\S]*?)\s*```/);
            if (codeBlockMatch) {
                jsonStr = codeBlockMatch[1].trim();
                introText = rawText.substring(0, codeBlockMatch.index).trim();
                
                // Coba parse sebagai JSON
                if (jsonStr.startsWith('{') && jsonStr.endsWith('}')) {
                    try {
                        jsonObj = JSON.parse(jsonStr);
                    } catch (e) {
                        console.warn("Failed to parse code block as JSON:", e);
                    }
                }
            }
        }
        // Pattern 3: JSON langsung tanpa code block
        else {
            const jsonMatch = rawText.match(/\{[\s\S]*\}/);
            if (jsonMatch) {
                jsonStr = jsonMatch[0];
                introText = rawText.substring(0, jsonMatch.index).trim();
            } else {
                // Jika tidak ada JSON sama sekali, return sebagai text biasa
                return {
                    type: 'text',
                    content: rawText.trim(),
                    intro: ""
                };
            }
        }

        // 4. Parse JSON jika belum
        if (!jsonObj && jsonStr) {
            try {
                jsonObj = JSON.parse(jsonStr);
            } catch (e) {
                console.warn("Failed to parse JSON string:", e);
                // Jika gagal parse, anggap sebagai raw text dengan code block
                return {
                    type: 'text',
                    content: rawText.trim(),
                    intro: ""
                };
            }
        }

        // 5. Identifikasi response type
        if (jsonObj) {
            const response = identifyResponseType(jsonObj);
            response.intro = introText;
            return response;
        }

        // 6. Fallback
        return {
            type: 'unknown',
            content: rawText.trim(),
            intro: introText
        };
    }

    // Helper function to identify response type based on system message rules
    function identifyResponseType(obj) {
        // FORMAT 1: QUESTION JSON (Testing)
        if (obj.question && Array.isArray(obj.options) && obj.correct_answer) {
            return {
                type: 'quiz_question',
                question: obj.question,
                options: obj.options,
                correct_answer: obj.correct_answer,
                topic: obj.topic || null,
                intro: null
            };
        }
        
        // FORMAT 2: FEEDBACK / CONVERSATION JSON
        if (obj.feedback !== undefined) {
            return {
                type: 'feedback',
                feedback: obj.feedback,
                next_question: obj.next_question || null,
                is_correct: obj.is_correct,
                requires_action: obj.requires_action || false, // e.g., apakah perlu lanjut atau kembali
                intro: null
            };
        }
        
        // FORMAT 3: TUTORIAL / MATERIAL JSON
        if ((obj.topic || obj.explanation) && !obj.question && !obj.feedback) {
            return {
                type: 'tutorial',
                topic: obj.topic || 'Panduan Belajar',
                explanation: obj.explanation || '',
                formula_example: obj.formula_example || null,
                followUp: obj.followUp || obj.follow_up || null,
                intro: null
            };
        }
        
        // Unknown format
        return {
            type: 'raw_json',
            data: obj,
            intro: null
        };
    }

    // Helper untuk memetakan field JSON ke format standar internal kita
    function mapResponseObject(obj) {
        return {
            topic: obj.topic,
            explanation: obj.explanation,
            formula_example: obj.formula_example, // Handle field rumus khusus request kamu
            followUp: obj.followUp || obj.follow_up
        };
    }

    /**
     * Merender hasil parse ke HTML
     */
    function renderAIResponse(parsed) {
    // Buat container untuk message
    const container = document.createElement('div');
    
    // 1. Always show tsundere remark (intro) if exists
    if (parsed.intro && parsed.intro.trim()) {
        const introDiv = document.createElement('div');
        introDiv.className = 'tsundere-remark';
        introDiv.style.cssText = `
            font-style: italic;
            color: #e91e63;
            margin-bottom: 12px;
            padding: 8px 12px;
            background: rgba(233, 30, 99, 0.05);
            border-radius: 8px;
            border-left: 3px solid #e91e63;
        `;
        introDiv.innerHTML = formatMarkdown(parsed.intro);
        container.appendChild(introDiv);
    }
    
    // 2. Render based on response type
    let contentHtml = '';
    
    switch (parsed.type) {
        case 'quiz_question':
            contentHtml = renderQuizQuestion(parsed);
            break;
            
        case 'feedback':
            contentHtml = renderFeedbackResponse(parsed);
            break;
            
        case 'tutorial':
            contentHtml = renderTutorialResponse(parsed);
            break;
            
        case 'text':
            contentHtml = formatMarkdown(parsed.content);
            break;
            
        case 'raw_json':
            contentHtml = `<pre><code>${JSON.stringify(parsed.data, null, 2)}</code></pre>`;
            break;
            
        default:
            contentHtml = formatMarkdown(parsed.content || "Tidak bisa merender respons.");
    }
    
    // 3. Add content to container
    const contentDiv = document.createElement('div');
    contentDiv.innerHTML = contentHtml;
    container.appendChild(contentDiv);
    
    // 4. Convert container to HTML string for appendMessage
    const tempDiv = document.createElement('div');
    tempDiv.appendChild(container);
    
    // 5. Append to chat
    const msgElement = appendMessage(tempDiv.innerHTML, 'ai');
    
    // 6. Add event listeners for quiz buttons if it's a quiz
    if (parsed.type === 'quiz_question') {
        attachQuizButtonListeners(msgElement, parsed);
    }
    
    return msgElement;
}

// Helper function untuk quiz questions
function renderQuizQuestion(quiz) {
    return `
        <div class="quiz-container" style="margin-top: 10px;">
            <div class="quiz-question" style="
                font-weight: 600;
                margin-bottom: 15px;
                padding: 12px;
                background: #f5f9ff;
                border-radius: 8px;
                border-left: 4px solid var(--primary-blue);
            ">
                <span style="color: var(--primary-blue);">❓</span> ${escapeHtml(quiz.question)}
            </div>
            <div class="quiz-options-grid" style="display: grid; grid-template-columns: 1fr; gap: 10px;">
                ${quiz.options.map((option, index) => `
                    <button class="quiz-option-button" 
                            data-option="${escapeHtml(option)}"
                            data-index="${index}"
                            style="
                                text-align: left;
                                padding: 12px 16px;
                                border: 1px solid #ddd;
                                border-radius: 8px;
                                background: white;
                                cursor: pointer;
                                transition: all 0.2s;
                                font-size: 0.95em;
                            "
                            onmouseover="this.style.background='#f9f9f9';this.style.borderColor='var(--primary-blue)';"
                            onmouseout="this.style.background='white';this.style.borderColor='#ddd';">
                        <span style="
                            display: inline-block;
                            width: 24px;
                            height: 24px;
                            line-height: 24px;
                            text-align: center;
                            background: #eef5ff;
                            border-radius: 50%;
                            margin-right: 10px;
                            font-weight: 600;
                            color: var(--primary-blue);
                        ">${String.fromCharCode(65 + index)}</span>
                        ${escapeHtml(option)}
                    </button>
                `).join('')}
            </div>
        </div>
    `;
}

// Helper function untuk feedback responses
function renderFeedbackResponse(feedback) {
    let html = '';
    
    if (feedback.feedback) {
        html += formatMarkdown(feedback.feedback);
    }
    
    // Tambahkan action prompt berdasarkan system message rules
    if (feedback.requires_action !== false) {
        html += `
            <div class="feedback-actions" style="
                margin-top: 15px;
                padding-top: 10px;
                border-top: 1px dashed #ccc;
            ">
                <div style="
                    display: flex;
                    gap: 10px;
                    margin-top: 10px;
                ">
                    <button class="suggestion-btn" 
                            data-suggestion="Lanjut ke soal berikutnya"
                            style="
                                padding: 8px 16px;
                                background: var(--primary-blue);
                                color: white;
                                border: none;
                                border-radius: 6px;
                                cursor: pointer;
                                font-size: 0.9em;
                            ">
                        📝 Lanjut ke soal berikutnya
                    </button>
                    <button class="suggestion-btn" 
                            data-suggestion="Kembali ke materi"
                            style="
                                padding: 8px 16px;
                                background: #f5f5f5;
                                color: #333;
                                border: 1px solid #ddd;
                                border-radius: 6px;
                                cursor: pointer;
                                font-size: 0.9em;
                            ">
                        📚 Kembali ke materi
                    </button>
                </div>
            </div>
        `;
    }
    
    return html;
}

// Helper function untuk tutorial responses
function renderTutorialResponse(tutorial) {
    let html = '';
    
    if (tutorial.topic) {
        html += `<div class="topic-header" style="
            font-weight: 700;
            color: var(--primary-blue);
            margin-bottom: 15px;
            padding-bottom: 8px;
            border-bottom: 2px solid var(--primary-blue);
            font-size: 1.1em;
        ">📚 ${escapeHtml(tutorial.topic)}</div>`;
    }
    
    if (tutorial.explanation) {
        html += formatMarkdown(tutorial.explanation);
    }
    
    if (tutorial.formula_example) {
        html += `<div class="formula-example" style="
            margin: 15px 0;
            padding: 12px;
            background: #f9f9f9;
            border-radius: 8px;
            border-left: 4px solid #4CAF50;
        ">
            <strong>🧮 Contoh Rumus:</strong><br>
            ${formatMarkdown(tutorial.formula_example)}
        </div>`;
    }
    
    if (tutorial.followUp) {
        html += `<div class="follow-up" style="
            margin-top: 20px;
            padding: 12px;
            background: #fff8e1;
            border-radius: 8px;
            border-left: 4px solid #ff9800;
            font-style: italic;
        ">
            <strong>💡 Follow-up:</strong> ${escapeHtml(tutorial.followUp)}
        </div>`;
    }
    
    return html;
}

// Function untuk attach event listeners ke quiz buttons
function attachQuizButtonListeners(msgElement, quiz) {
    const buttons = msgElement.querySelectorAll('.quiz-option-button');
    
    buttons.forEach(button => {
        button.addEventListener('click', function() {
            const selected = this.dataset.option;
            handleQuizAnswer(selected, quiz, this);
        });
    });
}

// Function untuk handle quiz answer
function handleQuizAnswer(selected, quiz, clickedButton) {
    // Disable semua buttons
    const allButtons = clickedButton.closest('.quiz-options-grid').querySelectorAll('button');
    allButtons.forEach(btn => btn.disabled = true);
    
    // Highlight jawaban
    const isCorrect = selected === quiz.correct_answer;
    
    if (isCorrect) {
        clickedButton.style.background = '#e8f5e9';
        clickedButton.style.borderColor = '#4CAF50';
        clickedButton.style.color = '#2e7d32';
        clickedButton.innerHTML += ' <span style="color: #4CAF50;">✓</span>';
    } else {
        clickedButton.style.background = '#ffebee';
        clickedButton.style.borderColor = '#f44336';
        clickedButton.style.color = '#c62828';
        clickedButton.innerHTML += ' <span style="color: #f44336;">✗</span>';
        
        // Highlight jawaban yang benar
        allButtons.forEach(btn => {
            if (btn.dataset.option === quiz.correct_answer) {
                btn.style.background = '#e8f5e9';
                btn.style.borderColor = '#4CAF50';
                btn.style.color = '#2e7d32';
                btn.innerHTML += ' <span style="color: #4CAF50;">✓</span>';
            }
        });
    }
    
    // Kirim jawaban ke server
    setTimeout(() => {
        sendMessage(selected);
    }, 1000);
}

    // ==========================================
    // 6. UTILITIES (FORMATTER & UI)
    // ==========================================

    function appendMessage(htmlContent, type) {
        const msgDiv = document.createElement('div');
        msgDiv.className = `message ${type}`;
        
        // Keamanan: Escape input user, tapi biarkan HTML untuk bot (AI)
        const content = type === 'user' ? escapeHtml(htmlContent) : htmlContent;

        msgDiv.innerHTML = `<div class="message-bubble">${content}</div>`;
        chatMessages.appendChild(msgDiv);
        scrollToBottom();
        
        return msgDiv; // Return elemen agar bisa diproses KaTeX
    }

    function formatMarkdown(text) {
        if (!text) return '';

        // 1. Bold (**text**)
        text = text.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');
        
        // 2. Italic (*text*)
        text = text.replace(/\*(.+?)\*/g, '<em>$1</em>');

        // 3. List Handling (Simple)
        // Pisahkan per baris
        const lines = text.split('\n');
        let html = '';
        let insideList = false;

        lines.forEach(line => {
            const trimmed = line.trim();
            
            // Deteksi Bullet Points (- atau *)
            if (trimmed.startsWith('- ') || trimmed.startsWith('* ')) {
                if (!insideList) {
                    html += '<ul>';
                    insideList = true;
                }
                html += `<li>${trimmed.substring(2)}</li>`;
            } 
            // Deteksi Numbered List (1. )
            else if (/^\d+\.\s/.test(trimmed)) {
                if (!insideList) {
                    html += '<ul>'; // Gunakan UL biar style konsisten dengan CSS
                    insideList = true;
                }
                // Hilangkan angka (misal "1. ") karena browser akan nambahin bullet sendiri
                html += `<li>${trimmed.replace(/^\d+\.\s/, '')}</li>`;
            } 
            // Teks Biasa / Paragraf
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
        // Menggunakan class CSS 'typing-indicator' yang sudah ada di chat.css
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