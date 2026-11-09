const SERVER = "http://127.0.0.1:8787";
const HINTS = {
  coach: "Guides you through the page and explains the next step.",
  answer: "Answers your question about the current page directly."
};
const DEFAULT_QUESTION = {
  coach: "Look at this page. What am I trying to do, and what should I do next?",
  answer: "Summarize what this page is asking me to do and answer my question."
};
const $ = (id) => document.getElementById(id);
const messagesEl = $("messages");
let mode = "coach";
let history = [];
let lastQuestion = "";
let lastAssistantMessage = "";
let serverState = null;
let busy = false;

function setMode(next) {
  mode = next;
  document.body.dataset.mode = next;
  $("mode-coach").classList.toggle("active", next === "coach");
  $("mode-answer").classList.toggle("active", next === "answer");
  $("mode-coach").setAttribute("aria-selected", String(next === "coach"));
  $("mode-answer").setAttribute("aria-selected", String(next === "answer"));
  $("mode-hint").textContent = HINTS[next];
  chrome.storage.local.set({mode: next});
}

function escapeHtml(value) {
  return String(value).replace(/[&<>"']/g, c => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
}
function renderMarkdown(value) {
  let html = escapeHtml(value);
  html = html.replace(/```([\w-]+)?\n([\s\S]*?)```/g, (_, _lang, code) => `<pre><code>${code}</code></pre>`);
  html = html.replace(/`([^`\n]+)`/g, "<code>$1</code>");
  html = html.replace(/\*\*([^*\n]+)\*\*/g, "<strong>$1</strong>");
  const lines = html.split("\n");
  let output = "", list = null;
  for (const line of lines) {
    const ordered = line.match(/^\s*\d+[.)]\s+(.*)$/);
    const unordered = line.match(/^\s*[-*]\s+(.*)$/);
    const kind = ordered ? "ol" : unordered ? "ul" : null;
    if (kind !== list) { if (list) output += `</${list}>`; if (kind) output += `<${kind}>`; list = kind; }
    if (kind) output += `<li>${(ordered || unordered)[1]}</li>`;
    else output += line.trim() ? `${line}<br>` : "<br>";
  }
  if (list) output += `</${list}>`;
  return output;
}
function removeWelcome() { $("empty")?.remove(); }
function addMessage(kind, content, label, actions = false) {
  removeWelcome();
  const el = document.createElement("article");
  el.className = `msg ${kind}`;
  if (label) {
    const tag = document.createElement("span");
    tag.className = "tag";
    tag.textContent = label;
    el.appendChild(tag);
  }
  const body = document.createElement("div");
  body.className = "message-body";
  if (kind === "ai") body.innerHTML = renderMarkdown(content);
  else body.textContent = content;
  el.appendChild(body);
  if (actions && kind === "ai") {
    const controls = document.createElement("div");
    controls.className = "msg-actions";
    const copy = document.createElement("button");
    copy.textContent = "Copy response";
    copy.onclick = async () => {
      try { await navigator.clipboard.writeText(content); copy.textContent = "Copied"; }
      catch { copy.textContent = "Copy unavailable"; }
    };
    const regen = document.createElement("button");
    regen.textContent = "Regenerate";
    regen.onclick = () => ask(lastQuestion, true);
    controls.append(copy, regen);
    el.appendChild(controls);
  }
  messagesEl.appendChild(el);
  messagesEl.scrollTop = messagesEl.scrollHeight;
  return el;
}

async function capturePage(includeScreenshot) {
  const [tab] = await chrome.tabs.query({active:true,lastFocusedWindow:true});
  if (!tab?.id) throw new Error("No active tab found. Open a normal webpage first.");
  if (/^(chrome|edge|about|chrome-extension):/i.test(tab.url || "")) {
    throw new Error("Chrome internal pages cannot be scanned. Open a regular website and try again.");
  }
  let page = {title:tab.title || "",url:tab.url || "",text:"",selection:""};
  try {
    const results = await chrome.scripting.executeScript({
      target:{tabId:tab.id},
      func:() => ({title:document.title,url:location.href,
        text:(document.body?.innerText || "").slice(0,18000),
        selection:String(window.getSelection() || "").slice(0,3000)})
    });
    if (results?.[0]?.result) page = results[0].result;
  } catch (error) { console.warn("Could not read page text:",error); }
  let screenshot = null;
  if (includeScreenshot) {
    try {
      const dataUrl = await chrome.tabs.captureVisibleTab(tab.windowId,{format:"jpeg",quality:55});
      screenshot = dataUrl.split(",",2)[1] || null;
    } catch (error) {
      throw new Error("Could not capture the tab screenshot. Open Capri from the toolbar while viewing a normal website, then try again. " + error.message);
    }
  }
  if (!page.text && !screenshot) throw new Error("I couldn't read this page. Try a normal webpage and enable screenshot capture if the vision model is installed.");
  return {page,screenshot};
}

async function saveRecent(prompt, answer) {
  try {
    const {recentChats = []} = await chrome.storage.local.get("recentChats");
    const item = {title:(prompt || "Page scan").slice(0,70), preview:(answer || "").slice(0,110), date:Date.now(), mode};
    await chrome.storage.local.set({recentChats:[item,...recentChats].slice(0,12)});
    renderRecent();
  } catch (error) { console.warn("Could not save recent chat:",error); }
}
async function renderRecent() {
  const list = $("history-list");
  if (!list) return;
  const {recentChats = []} = await chrome.storage.local.get("recentChats");
  list.innerHTML = "";
  if (!recentChats.length) {
    list.innerHTML = '<p class="drawer-empty">Your recent conversations will appear here.</p>';
    return;
  }
  recentChats.forEach(item => {
    const button = document.createElement("button");
    button.className = "history-item";
    const title = document.createElement("strong");
    title.textContent = item.title || "Conversation";
    const detail = document.createElement("small");
    detail.textContent = `${item.mode === "answer" ? "Answer" : "Coach"} · ${new Date(item.date).toLocaleString()}`;
    button.append(title,detail);
    button.title = item.preview || "";
    button.onclick = () => {
      history = [];
      messagesEl.innerHTML = "";
      addMessage("ai", `This is a saved conversation preview:\n\n${item.preview || "No preview available."}`, "Recent chat");
      closeDrawers();
    };
    list.appendChild(button);
  });
}
function openDrawer(id) {
  closeDrawers();
  $(id).hidden = false;
  if (id === "history-panel") renderRecent();
}
function closeDrawers() {
  $("history-panel").hidden = true;
  $("settings-panel").hidden = true;
}

async function ask(question, regenerate = false) {
  if (busy) return;
  const prompt = (question || "").trim() || DEFAULT_QUESTION[mode];
  lastQuestion = prompt;
  busy = true;
  $("send").disabled = true;
  $("scan").disabled = true;
  $("welcome-scan").disabled = true;
  if (!regenerate) addMessage("user",prompt);
  const thinking = addMessage("ai","Reading the page and contacting your local model…",mode === "coach" ? "Capri · Coach" : "Capri · Answer");
  try {
    const {page,screenshot} = await capturePage($("shot").checked);
    const response = await fetch(`${SERVER}/ask`,{
      method:"POST",headers:{"Content-Type":"application/json"},
      body:JSON.stringify({mode,question:prompt,page,screenshot,history:history.slice(-8)})
    });
    let data;
    try { data = await response.json(); }
    catch { throw new Error(`Local server returned an unreadable response (HTTP ${response.status}).`); }
    if (!response.ok || data.error) throw new Error(data.error || `Local server error ${response.status}`);
    lastAssistantMessage = data.answer;
    thinking.querySelector(".message-body").innerHTML = renderMarkdown(data.answer);
    const tag = thinking.querySelector(".tag");
    if (tag) tag.textContent = `Capri · ${mode === "coach" ? "Coach" : "Answer"}${data.model ? " · " + data.model : ""}`;
    const actions = document.createElement("div");
    actions.className = "msg-actions";
    const copy = document.createElement("button");
    copy.textContent = "Copy response";
    copy.onclick = async () => {
      try { await navigator.clipboard.writeText(data.answer); copy.textContent = "Copied"; }
      catch { copy.textContent = "Copy unavailable"; }
    };
    const regen = document.createElement("button");
    regen.textContent = "Regenerate";
    regen.onclick = () => ask(lastQuestion,true);
    actions.append(copy,regen);
    thinking.appendChild(actions);
    history.push({role:"user",content:prompt},{role:"assistant",content:data.answer});
    await saveRecent(prompt,data.answer);
  } catch (error) {
    thinking.className = "msg err";
    thinking.textContent = error.message.includes("Failed to fetch")
      ? "Can't reach Capri's local backend. Double-click start-capri.bat in the extracted project folder and keep its window open."
      : error.message;
  } finally {
    busy = false;
    $("send").disabled = false;
    $("scan").disabled = false;
    $("welcome-scan").disabled = false;
    messagesEl.scrollTop = messagesEl.scrollHeight;
  }
}

async function checkServer() {
  try {
    const response = await fetch(`${SERVER}/health`,{cache:"no-store"});
    const data = await response.json();
    if (!response.ok || !data.ok) throw new Error("Backend unavailable");
    serverState = data;
    const connection = document.querySelector(".connection-row");
    let label = "Backend online · Ollama offline";
    let ok = false;
    if (!data.online) label = "Ollama offline";
    else if (data.text_model_available || data.vision_model_available) {
      ok = true;
      label = data.text_model_available ? `Ready · ${data.text_model}` : `Ready · ${data.vision_model}`;
    } else label = "Model missing · see setup";
    $("status").textContent = label;
    connection.classList.toggle("online",ok);
    $("settings-text-model").textContent = `${data.text_model || "Not configured"} ${data.text_model_available ? "· ready" : "· not installed"}`;
    $("settings-vision-model").textContent = `${data.vision_model || "Not configured"} ${data.vision_model_available ? "· ready" : "· not installed"}`;
    $("shot-hint").textContent = data.vision_model_available
      ? "When enabled, the visible tab screenshot is sent to your local vision model."
      : "Install qwen2.5vl:7b to enable screenshot understanding.";
    $("shot").disabled = !data.vision_model_available;
    if (!data.vision_model_available) $("shot").checked = false;
    $("status").title = data.error || "Capri local backend status";
  } catch {
    serverState = null;
    $("status").textContent = "Backend offline";
    document.querySelector(".connection-row").classList.remove("online");
    $("settings-text-model").textContent = "Backend unavailable";
    $("settings-vision-model").textContent = "Backend unavailable";
    $("shot-hint").textContent = "Start Capri's local backend to check vision model availability.";
    $("shot").disabled = true;
    $("shot").checked = false;
  }
}

$("mode-coach").onclick = () => setMode("coach");
$("mode-answer").onclick = () => setMode("answer");
$("scan").onclick = () => ask("");
$("welcome-scan").onclick = () => ask("");
$("send").onclick = () => {
  const value = $("input").value;
  if (!value.trim()) return;
  $("input").value = "";
  ask(value);
};
$("input").addEventListener("keydown",event => {
  if (event.key === "Enter" && !event.shiftKey) { event.preventDefault(); $("send").click(); }
});
$("clear").onclick = () => {
  history = [];
  messagesEl.innerHTML = '<section class="welcome" id="empty"><div class="welcome-orb"><div class="orb-core"></div><i></i></div><span class="eyebrow">FRESH START</span><h2>What are we<br/><em>working on?</em></h2><p>Scan the page or ask Capri a question to get started.</p><button id="welcome-scan" class="welcome-action">✳ &nbsp; Scan this page</button><span class="welcome-footnote">Your assistant. Your machine. Your control.</span></section>';
  $("welcome-scan").onclick = () => ask("");
};
$("history-toggle").onclick = () => openDrawer("history-panel");
$("settings-toggle").onclick = () => openDrawer("settings-panel");
document.querySelectorAll("[data-close]").forEach(button => button.onclick = closeDrawers);
$("new-chat").onclick = () => { history=[]; messagesEl.innerHTML='<section class="welcome" id="empty"><div class="welcome-orb"><div class="orb-core"></div><i></i></div><span class="eyebrow">FRESH START</span><h2>What are we<br/><em>working on?</em></h2><p>Scan the page or ask Capri a question to get started.</p><button id="welcome-scan" class="welcome-action">✳ &nbsp; Scan this page</button><span class="welcome-footnote">Your assistant. Your machine. Your control.</span></section>'; $("welcome-scan").onclick=()=>ask(""); closeDrawers(); };
chrome.storage.local.get("mode").then(({mode:saved}) => setMode(saved === "answer" ? "answer" : "coach"));
checkServer();
setInterval(checkServer,5000);
