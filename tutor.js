// tutor.js - Tutor Agent Webhook Handler

const tutorOutput = document.getElementById("tutorOutput");
const tutorInput = document.getElementById("tutorInput");
const teachBtn = document.getElementById("teachBtn");

// Webhook tutor
const whtutor = "https://wh.white-rabbit.my.id/webhook/d3aa3901-bd35-403b-9916-5f37175db3cd";

// Session ID
let tutorSession = crypto.randomUUID();
console.log("Tutor session:", tutorSession);

teachBtn.addEventListener("click", sendTutorMessage);
tutorInput.addEventListener("keypress", (e) => {
    if (e.key === "Enter" && !e.shiftKey) {
        e.preventDefault();
        sendTutorMessage();
    }
});

// Auto-resize textarea
tutorInput.addEventListener("input", () => {
    tutorInput.style.height = "auto";
    tutorInput.style.height = tutorInput.scrollHeight + "px";
});

function sendTutorMessage() {
    const message = tutorInput.value.trim();
    if (!message) return;

    appendUser(message);
    tutorInput.value = "";
    scrollToBottom();

    sendToTutorWebhook(message);
}

async function sendToTutorWebhook(message) {
    const payload = {
        message,
        sessionId: tutorSession
    };

    const thinkingMsg = appendAI("⏳ Thinking...");

    try {
        const res = await fetch(whtutor, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(payload)
        });

        const data = await res.json();
        console.log("📥 Tutor response:", data);

        // Remove thinking message
        thinkingMsg.remove();

        // Parse the response
        const parsed = parseTutorResponse(data);

        // Show topic if exists
        if (parsed.topic) {
            appendAI(`<strong>📚 ${parsed.topic}</strong>`);
        }

        // Show explanation
        if (parsed.explanation) {
            appendAI(parsed.explanation);
        }

        // Show follow-up question if exists
        if (parsed.followUp) {
            appendAI(`<em>${parsed.followUp}</em>`);
        }

        // If nothing parsed, show raw
        if (!parsed.topic && !parsed.explanation && !parsed.followUp) {
            if (parsed.text) {
                appendAI(parsed.text);
            } else {
                appendAI(JSON.stringify(data));
            }
        }

        scrollToBottom();

    } catch (err) {
        console.error(err);
        thinkingMsg.remove();
        appendAI("❌ Failed to contact tutor webhook.");
        scrollToBottom();
    }
}

// ==============================
// ===== PARSE TUTOR RESPONSE ===
// ==============================

function parseTutorResponse(data) {
    try {
        // Handle array wrapper: [{"output":"..."}]
        let raw = data;
        if (Array.isArray(data) && data[0]?.output) {
            raw = data[0].output;
        } else if (data.output) {
            raw = data.output;
        }

        // If it's already an object with explanation, return it
        if (typeof raw === 'object' && (raw.explanation || raw.topic)) {
            return raw;
        }

        // If it's a string, try to extract JSON
        if (typeof raw === 'string') {
            // Remove markdown code fences
            let jsonStr = raw.replace(/```json/g, '').replace(/```/g, '').trim();
            
            // Parse JSON
            const parsed = JSON.parse(jsonStr);
            
            return {
                topic: parsed.topic || null,
                explanation: parsed.explanation || null,
                followUp: parsed.followUp || parsed.follow_up || null
            };
        }

        return { text: "Format tidak dikenali" };
    } catch (err) {
        console.error("Parse error:", err);
        // If parsing fails, return the raw text
        return { text: typeof data === 'string' ? data : JSON.stringify(data) };
    }
}

// ==============================
// ===== UI HELPERS =====
// ==============================

function appendUser(text) {
    const div = document.createElement("div");
    div.className = "message user";
    div.innerHTML = `<div class="message-bubble">${text}</div>`;
    tutorOutput.appendChild(div);
    return div;
}

function appendAI(text) {
    const div = document.createElement("div");
    div.className = "message ai";
    div.innerHTML = `<div class="message-bubble">${formatText(text)}</div>`;
    tutorOutput.appendChild(div);
    return div;
}

// ==============================
// ===== TEXT FORMATTER =====
// ==============================

function formatText(text) {
    // Convert **bold** to <strong>
    text = text.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');
    
    // Convert *italic* to <em>
    text = text.replace(/\*(.+?)\*/g, '<em>$1</em>');
    
    // Convert bullet points (* item) to proper list
    // Split by double newlines to preserve paragraphs
    const sections = text.split('\n\n');
    
    const formatted = sections.map(section => {
        // Check if section contains bullet points
        const lines = section.split('\n');
        const hasBullets = lines.some(line => line.trim().startsWith('*'));
        
        if (hasBullets) {
            // Convert to HTML list
            let listItems = '';
            let inList = false;
            let result = '';
            
            lines.forEach(line => {
                const trimmed = line.trim();
                if (trimmed.startsWith('*')) {
                    if (!inList) {
                        inList = true;
                        listItems = '';
                    }
                    // Remove the * and add as list item
                    listItems += `<li>${trimmed.substring(1).trim()}</li>`;
                } else if (trimmed) {
                    // Not a bullet, close list if open
                    if (inList) {
                        result += `<ul>${listItems}</ul>`;
                        listItems = '';
                        inList = false;
                    }
                    result += `<p>${trimmed}</p>`;
                }
            });
            
            // Close list if still open
            if (inList) {
                result += `<ul>${listItems}</ul>`;
            }
            
            return result;
        } else {
            // No bullets, just wrap in paragraph
            return section.trim() ? `<p>${section.trim()}</p>` : '';
        }
    }).join('');
    
    return formatted || text;
}

function scrollToBottom() {
    tutorOutput.scrollTop = tutorOutput.scrollHeight;
}