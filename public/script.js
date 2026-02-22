/* ── The Transfer Desk – Vanilla JS ── */

const messagesEl = document.getElementById("messages");
const textarea = document.getElementById("question-input");
const sendBtn = document.getElementById("send-btn");
const welcomeEl = document.getElementById("welcome");

let isLoading = false;

/* ── Soccer ball SVG (reused for assistant avatar) ── */
const soccerBallSVG = `<svg viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg"><path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm1 3.3l1.35-.95c1.82.56 3.37 1.76 4.38 3.34l-.39 1.34-1.35.46L13 6.7V5.3zm-3.35-.95L11 5.3v1.4L7.01 9.49l-1.35-.46-.39-1.34c1.01-1.58 2.56-2.78 4.38-3.34zM7.08 17.11l-1.14.1C4.73 15.81 4 13.99 4 12c0-.12.01-.23.02-.35l1-.73 1.38.48 1.46 4.34-.78 1.37zm7.42 2.48c-.79.26-1.63.41-2.5.41s-1.71-.15-2.5-.41l-.69-1.49.64-1.1h5.11l.64 1.11-.7 1.48zM14.27 15H9.73l-1.35-4.02L12 8.44l3.63 2.54L14.27 15zm3.79 2.21l-1.14-.1-.78-1.37 1.46-4.34 1.38-.48 1 .73c.01.12.02.23.02.35 0 1.99-.73 3.81-1.94 5.21z"/></svg>`;

/* ── Auto-resize textarea ── */
textarea.addEventListener("input", function () {
  this.style.height = "auto";
  this.style.height = Math.min(this.scrollHeight, 120) + "px";
});

/* ── Submit on Enter (shift+enter for newline) ── */
textarea.addEventListener("keydown", function (e) {
  if (e.key === "Enter" && !e.shiftKey) {
    e.preventDefault();
    handleSend();
  }
});

sendBtn.addEventListener("click", handleSend);

/* ── Suggestion chip click ── */
document.querySelectorAll(".chip").forEach(function (chip) {
  chip.addEventListener("click", function () {
    textarea.value = this.getAttribute("data-question");
    textarea.dispatchEvent(new Event("input"));
    handleSend();
  });
});

/* ── Main send handler ── */
async function handleSend() {
  const question = textarea.value.trim();
  if (!question || isLoading) return;

  isLoading = true;
  sendBtn.disabled = true;

  // Hide welcome
  if (welcomeEl) {
    welcomeEl.style.display = "none";
  }

  // Add user message
  addMessage("user", question);

  // Clear input
  textarea.value = "";
  textarea.style.height = "auto";

  // Add loading indicator
  const loadingId = addLoading();

  try {
    const response = await fetch("/api/ask", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ question: question }),
    });

    const data = await response.json();

    // Remove loading
    removeLoading(loadingId);

    if (data.error) {
      addMessage("assistant", data.error, true);
    } else {
      addMessage("assistant", data.answer || "No answer received.");
    }
  } catch (err) {
    removeLoading(loadingId);
    addMessage("assistant", "Something went wrong. Please try again.", true);
  }

  isLoading = false;
  sendBtn.disabled = false;
  textarea.focus();
}

/* ── Add a message bubble ── */
function addMessage(role, text, isError) {
  var div = document.createElement("div");
  div.className = "message message-" + role;

  var avatar = document.createElement("div");
  avatar.className = "message-avatar";

  if (role === "user") {
    avatar.textContent = "You";
  } else {
    avatar.innerHTML = soccerBallSVG;
  }

  var bubble = document.createElement("div");
  bubble.className = "message-bubble" + (isError ? " error-bubble" : "");
  bubble.textContent = text;

  div.appendChild(avatar);
  div.appendChild(bubble);
  messagesEl.appendChild(div);

  scrollToBottom();
}

/* ── Loading indicator ── */
var loadingCounter = 0;

function addLoading() {
  var id = "loading-" + ++loadingCounter;

  var div = document.createElement("div");
  div.className = "message message-assistant";
  div.id = id;

  var avatar = document.createElement("div");
  avatar.className = "message-avatar";
  avatar.innerHTML = soccerBallSVG;

  var bubble = document.createElement("div");
  bubble.className = "message-bubble";

  var dots = document.createElement("div");
  dots.className = "loading-dots";
  dots.innerHTML = "<span></span><span></span><span></span>";

  bubble.appendChild(dots);
  div.appendChild(avatar);
  div.appendChild(bubble);
  messagesEl.appendChild(div);

  scrollToBottom();
  return id;
}

function removeLoading(id) {
  var el = document.getElementById(id);
  if (el) el.remove();
}

/* ── Scroll to bottom ── */
function scrollToBottom() {
  messagesEl.scrollTop = messagesEl.scrollHeight;
}
