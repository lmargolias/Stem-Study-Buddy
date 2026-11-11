const $ = id => document.getElementById(id);
let history = [], busy = false;

// ---- setup from config.js ----
document.title = CONFIG.name;
document.documentElement.style.setProperty("--accent", CONFIG.themeColor);
document.documentElement.style.setProperty("--user", CONFIG.themeColor);
$("emoji").textContent = CONFIG.emoji;
$("name").textContent = CONFIG.name;
$("tagline").textContent = CONFIG.tagline;

// ---- API key storage (never in the code) ----
function getKey() {
  try { return sessionStorage.getItem("gk") || localStorage.getItem("gk") || ""; } catch (e) { return ""; }
}
function saveKey(k, remember) {
  try {
    sessionStorage.setItem("gk", k);
    if (remember) localStorage.setItem("gk", k); else localStorage.removeItem("gk");
  } catch (e) {}
}
function openKey() { $("keyInput").value = ""; $("keyDialog").showModal(); }
$("keyBtn").onclick = openKey;
$("keyCancel").onclick = () => $("keyDialog").close();
$("keySave").onclick = () => {
  const k = $("keyInput").value.trim();
  if (k) saveKey(k, $("remember").checked);
  $("keyDialog").close();
};

// ---- safe formatting: escape HTML first, then bold and bullets ----
function esc(s) { return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;"); }
function fmt(text) {
  const bold = s => esc(s).replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>");
  let html = "", list = false;
  for (const line of text.split("\n")) {
    const m = line.match(/^\s*[-*•]\s+(.*)/);
    if (m) { if (!list) { html += "<ul>"; list = true; } html += "<li>" + bold(m[1]) + "</li>"; }
    else { if (list) { html += "</ul>"; list = false; } if (line.trim()) html += "<p>" + bold(line) + "</p>"; }
  }
  return html + (list ? "</ul>" : "");
}

// ---- chat display ----
function add(role, text, isError) {
  const d = document.createElement("div");
  d.className = "msg " + role + (isError ? " error" : "");
  if (role === "user") d.textContent = text; else d.innerHTML = isError ? "<p>" + esc(text) + "</p>" : fmt(text);
  $("chat").appendChild(d);
  $("chat").scrollTop = $("chat").scrollHeight;
  return d;
}
function reset() {
  history = [];
  $("chat").innerHTML = "";
  add("bot", CONFIG.welcome);
  $("starters").style.display = "flex";
}
$("newBtn").onclick = reset;
CONFIG.starters.forEach(q => {
  const b = document.createElement("button");
  b.textContent = q;
  b.onclick = () => send(q);
  $("starters").appendChild(b);
});

// ---- friendly errors ----
function errorText(status) {
  if (status === 400 || status === 403) return "Your API key was not accepted. Click “API key” and paste it again.";
  if (status === 429) return "Too many requests. Wait a minute and try again.";
  if (status === 404) return "The model name was not found. Check “model” in config.js.";
  if (status >= 500) return "Google's server had a problem. Try again in a moment.";
  return "Something went wrong (error " + status + "). Copy this message into your notes.";
}

// ---- send a message to Gemini ----
async function send(text) {
  text = (text || "").trim();
  if (!text || busy) return;
  const key = getKey();
  if (!key) { openKey(); return; }
  busy = true; $("sendBtn").disabled = true;
  $("starters").style.display = "none";
  add("user", text);
  history.push({ role: "user", parts: [{ text }] });
  $("input").value = ""; $("input").style.height = "auto";
  const wait = add("bot", "");
  wait.innerHTML = '<span class="dots"><span></span><span></span><span></span></span>';
  try {
    const res = await fetch("https://generativelanguage.googleapis.com/v1beta/models/" + CONFIG.model + ":generateContent", {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-goog-api-key": key },
      body: JSON.stringify({
        systemInstruction: { parts: [{ text: CONFIG.systemInstructions }] },
        contents: history
      })
    });
    wait.remove();
    if (!res.ok) { history.pop(); add("bot", errorText(res.status), true); }
    else {
      const data = await res.json();
      const parts = (data.candidates && data.candidates[0] && data.candidates[0].content && data.candidates[0].content.parts) || [];
      const reply = parts.filter(p => p.text && !p.thought).map(p => p.text).join("");
      if (reply) { history.push({ role: "model", parts: [{ text: reply }] }); add("bot", reply); }
      else { history.pop(); add("bot", "The bot sent an empty reply. Try rephrasing your question.", true); }
    }
  } catch (e) {
    wait.remove(); history.pop();
    add("bot", "Can't reach Gemini. Check your internet connection and try again.", true);
  }
  busy = false; $("sendBtn").disabled = false; $("input").focus();
}

$("sendBtn").onclick = () => send($("input").value);
$("input").addEventListener("keydown", e => {
  if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); send($("input").value); }
});
$("input").addEventListener("input", e => {
  e.target.style.height = "auto";
  e.target.style.height = Math.min(e.target.scrollHeight, 120) + "px";
});
reset();
if (!getKey()) openKey();
