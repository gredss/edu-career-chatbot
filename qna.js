// qna.js - QnA Quiz Webhook Handler

// ===== ELEMENTS =====
const chatMessages = document.getElementById('chatMessages');
const chatInput = document.getElementById('chatInput');
const sendBtn = document.getElementById('sendBtn');

// ===== QNA WEBHOOK =====
const whqna = "https://wh.white-rabbit.my.id/webhook/ce587a0d-50a4-4460-b5b7-c39f7156066a";

// ===== SESSION ID =====
let sessionId = crypto.randomUUID();
console.log("QNA session:", sessionId);

// ==============================
// ========== SEND LOGIC =========
// ==============================

sendBtn.addEventListener('click', sendQnaMessage);
chatInput.addEventListener('keypress', e => {
    if (e.key === 'Enter') sendQnaMessage();
});

function sendQnaMessage() {
    const message = chatInput.value.trim();
    if (!message) return;

    chatMessages.appendChild(createUserMessage(message));
    chatInput.value = "";
    scrollToBottom();

    sendToQnaWebhook(message);
}

// ==============================
// ====== SEND TO WEBHOOK =======
// ==============================

async function sendToQnaWebhook(message) {
    const payload = {
        message,
        sessionId
    };
    console.log("📤 Sending to AI:", payload);
    
    try {
        const res = await fetch(whqna, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(payload)
        });

        const data = await res.json();
        console.log("📥 Received:", data);

        // Parse the response
        const parsed = parseQuizResponse(data);
        
        if (parsed.question && parsed.options) {
            // Show intro text if exists
            if (parsed.intro) {
                chatMessages.appendChild(createAIMessage(parsed.intro));
            }
            // Render quiz
            renderQuiz(parsed);
        } else if (parsed.text) {
            chatMessages.appendChild(createAIMessage(parsed.text));
        } else {
            chatMessages.appendChild(createAIMessage(JSON.stringify(data)));
        }
        scrollToBottom();

    } catch (err) {
        console.error(err);
        chatMessages.appendChild(createAIMessage("❌ Gagal mengirim pesan ke server Q&A."));
    }
}

// ==============================
// ===== PARSE QUIZ RESPONSE ====
// ==============================

function parseQuizResponse(data) {
    try {
        // Handle array wrapper: [{"output":"..."}]
        let raw = data;
        if (Array.isArray(data) && data[0]?.output) {
            raw = data[0].output;
        } else if (data.output) {
            raw = data.output;
        }

        // If it's already an object with question, return it
        if (typeof raw === 'object' && raw.question) {
            return raw;
        }

        // If it's a string, try to extract JSON
        if (typeof raw === 'string') {
            // Split intro text and JSON
            const parts = raw.split('```json');
            const intro = parts[0]?.trim() || null;
            
            // Extract JSON content
            let jsonStr = parts[1] || raw;
            jsonStr = jsonStr.replace(/```/g, '').trim();
            
            // Parse JSON
            const parsed = JSON.parse(jsonStr);
            
            return {
                intro,
                question: parsed.question,
                options: parsed.options,
                correct_answer: parsed.correct_answer
            };
        }

        return { text: "Format tidak dikenali" };
    } catch (err) {
        console.error("Parse error:", err);
        return { text: typeof data === 'string' ? data : JSON.stringify(data) };
    }
}

// ==============================
// ========== QUIZ RENDER ========
// ==============================

function renderQuiz(quiz) {
    lockChat();
    
    const container = document.createElement("div");
    container.className = "message ai quiz-container";

    const q = document.createElement("div");
    q.className = "quiz-question";
    q.textContent = quiz.question;

    const opts = document.createElement("div");
    opts.className = "quiz-options-grid";

    quiz.options.forEach((opt, index) => {
        const btn = document.createElement("button");
        btn.className = "quiz-option-button";
        btn.textContent = opt;
        btn.dataset.option = opt;

        btn.onclick = () => handleOptionClick(btn, opt, quiz, opts);
        opts.appendChild(btn);
    });

    container.appendChild(q);
    container.appendChild(opts);

    chatMessages.appendChild(container);
    scrollToBottom();
}

// ==============================
// ===== OPTION CLICK HANDLER ===
// ==============================

function handleOptionClick(clickedBtn, selected, quiz, optionsContainer) {
    // Disable all buttons
    const allButtons = optionsContainer.querySelectorAll('.quiz-option-button');
    allButtons.forEach(btn => btn.disabled = true);

    const isCorrect = selected === quiz.correct_answer;

    // Color the clicked button
    if (isCorrect) {
        clickedBtn.classList.add('correct');
    } else {
        clickedBtn.classList.add('wrong');
        
        // Highlight the correct answer
        allButtons.forEach(btn => {
            if (btn.dataset.option === quiz.correct_answer) {
                btn.classList.add('correct');
            }
        });
    }

    // Show user's selection
    setTimeout(() => {
        chatMessages.appendChild(createUserMessage(selected));
        
        // Send to webhook for feedback
        sendQuizAnswer(selected, quiz, isCorrect);
    }, 800);
}

// ==============================
// ===== QUIZ ANSWER LOGIC ======
// ==============================

async function sendQuizAnswer(selected, quiz, isCorrect) {
    const payload = {
        answer: selected,
        question: quiz.question,
        correct_answer: quiz.correct_answer,
        is_correct: isCorrect,
        sessionId
    };

    try {
        const res = await fetch(whqna, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(payload)
        });

        const data = await res.json();
        console.log("📥 Feedback:", data);

        // Show feedback
        if (data.feedback) {
            chatMessages.appendChild(createAIMessage(data.feedback));
        } else {
            // Fallback feedback
            const fallbackFeedback = isCorrect 
                ? "✅ Benar! Jawabanmu tepat." 
                : `❌ Salah. Jawaban yang benar adalah: ${quiz.correct_answer}`;
            chatMessages.appendChild(createAIMessage(fallbackFeedback));
        }

        // Render next question if exists
        if (data.next_question) {
            const parsed = parseQuizResponse(data.next_question);
            if (parsed.question) {
                renderQuiz(parsed);
            }
        }

    } catch (err) {
        console.error(err);
        // Show fallback feedback even on error
        const fallbackFeedback = isCorrect 
            ? "✅ Benar! Jawabanmu tepat." 
            : `❌ Salah. Jawaban yang benar adalah: ${quiz.correct_answer}`;
        chatMessages.appendChild(createAIMessage(fallbackFeedback));
    }

    unlockChat();
    scrollToBottom();
}

// ==============================
// ===== UI MESSAGE BUILDERS ==== 
// ==============================

function createUserMessage(text) {
    const div = document.createElement('div');
    div.className = 'message user';
    div.innerHTML = `<div class="message-bubble">${text}</div>`;
    return div;
}

function createAIMessage(text) {
    const div = document.createElement('div');
    div.className = 'message ai';
    div.innerHTML = `<div class="message-bubble">${text}</div>`;
    return div;
}

function scrollToBottom() {
    chatMessages.scrollTop = chatMessages.scrollHeight;
}

function lockChat() {
    chatInput.disabled = true;
    sendBtn.disabled = true;
}

function unlockChat() {
    chatInput.disabled = false;
    sendBtn.disabled = false;
}