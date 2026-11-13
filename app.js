(() => {
  const $ = id => document.getElementById(id);
  const state = { messages: [], senders: [], selfSender: null, fileName: "", selected: null, query: "" };
  const fileInput = $("fileInput");
  const datePatterns = [
    /^(\d{1,2})\/(\d{1,2})\/(\d{2,4}),?\s+(\d{1,2}):(\d{2})(?:\s*([ap]m))?\s*-\s*(.*)$/i,
    /^(\d{1,2})-(\d{1,2})-(\d{2,4}),?\s+(\d{1,2}):(\d{2})(?:\s*([ap]m))?\s*-\s*(.*)$/i,
    /^\[(\d{1,2})\/(\d{1,2})\/(\d{2,4}),?\s+(\d{1,2}):(\d{2})(?:\s*([ap]m))?\]\s*(.*)$/i
  ];

  function parseDateLine(line) {
    for (const re of datePatterns) {
      const m = line.match(re);
      if (!m) continue;
      let [, d, mo, y, hh, mm, ampm, rest] = m;
      y = Number(y); if (y < 100) y += y >= 70 ? 1900 : 2000;
      let hour = Number(hh);
      if (ampm) { const ap = ampm.toLowerCase(); hour = hour % 12 + (ap === "pm" ? 12 : 0); }
      const date = new Date(y, Number(mo)-1, Number(d), hour, Number(mm));
      return { date, rest };
    }
    return null;
  }
  function parseChat(raw) {
    const lines = raw.replace(/^\uFEFF/, "").replace(/\r\n?/g, "\n").split("\n");
    const parsed = [];
    for (const line of lines) {
      const head = parseDateLine(line);
      if (head) {
        const colon = head.rest.indexOf(": ");
        if (colon > -1) {
          parsed.push({ date: head.date, sender: head.rest.slice(0, colon), text: head.rest.slice(colon + 2), system: false });
        } else {
          parsed.push({ date: head.date, sender: "", text: head.rest, system: true });
        }
      } else if (parsed.length && line.length) {
        parsed[parsed.length - 1].text += "\n" + line;
      }
    }
    return parsed;
  }
  function timeLabel(date) {
    return date.toLocaleTimeString([], {hour:"numeric", minute:"2-digit"});
  }
  function dayKey(date) { return `${date.getFullYear()}-${date.getMonth()}-${date.getDate()}`; }
  function dayLabel(date) {
    const today = new Date(); const yesterday = new Date(); yesterday.setDate(today.getDate()-1);
    if (dayKey(date) === dayKey(today)) return "Today";
    if (dayKey(date) === dayKey(yesterday)) return "Yesterday";
    return date.toLocaleDateString([], {day:"numeric", month:"long", year:"numeric"});
  }
  function escapeHtml(s) {
    return String(s).replace(/[&<>"']/g, c => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
  }
  function initials(s) {
    const parts = String(s || "?").trim().split(/\s+/);
    return (parts.length > 1 ? parts[0][0]+parts[1][0] : parts[0].slice(0,2)).toUpperCase();
  }
  function toast(msg) {
    const el = $("toast"); el.textContent = msg; el.classList.add("show");
    clearTimeout(toast.timer); toast.timer = setTimeout(() => el.classList.remove("show"), 2200);
  }
  async function copyText(text, success) {
    try {
      await navigator.clipboard.writeText(text);
      toast(success || "Copied to clipboard");
    } catch {
      const ta = document.createElement("textarea"); ta.value = text; document.body.appendChild(ta); ta.select();
      try { document.execCommand("copy"); toast(success || "Copied to clipboard"); } catch { toast("Copy failed — check browser permissions"); }
      ta.remove();
    }
  }
  function filteredMessages() {
    if (!state.query) return state.messages.map((m,i)=>({...m,index:i}));
    const q = state.query.toLocaleLowerCase();
    return state.messages.map((m,i)=>({...m,index:i})).filter(m => `${m.sender} ${m.text}`.toLocaleLowerCase().includes(q));
  }
  function render() {
    const visible = filteredMessages();
    $("setupBanner").hidden = state.messages.length > 0;
    $("messageArea").hidden = state.messages.length === 0;
    $("copyAllBtn").disabled = $("detailsBtn").disabled = $("composerCopyBtn").disabled = state.messages.length === 0;
    $("copySelectionBtn").disabled = !state.selected;
    $("chatTitle").textContent = state.fileName || "WhatsApp conversation";
    $("chatStatus").textContent = `${state.senders.length} participants · ${state.messages.length.toLocaleString()} messages`;
    $("headerAvatar").textContent = state.senders.length ? initials(state.senders[0]) : "?";
    $("chatList").innerHTML = state.messages.length ? `<div class="chat-item active"><div class="chat-avatar">${escapeHtml(initials(state.senders[0] || "Chat"))}</div><div class="chat-item-copy"><strong>${escapeHtml(state.fileName || "Imported conversation")}</strong><span>${escapeHtml(state.messages[state.messages.length-1].text.slice(0,75))}</span></div></div>` : `<div class="empty-chat"><div class="empty-chat-icon">☰</div><strong>No chat loaded</strong><span>Your imported conversation will appear here.</span></div>`;
    const container = $("messages"); container.innerHTML = "";
    let lastDay = null;
    visible.forEach(m => {
      const key = dayKey(m.date);
      if (key !== lastDay) {
        const divider = document.createElement("div"); divider.className = "day-divider";
        divider.innerHTML = `<span>${escapeHtml(dayLabel(m.date))}</span>`; container.appendChild(divider); lastDay = key;
      }
      if (m.system) {
        const sys = document.createElement("div"); sys.className = "system-message"; sys.textContent = m.text; container.appendChild(sys); return;
      }
      const outgoing = state.selfSender && m.sender === state.selfSender;
      const row = document.createElement("div"); row.className = `message-row ${outgoing ? "outgoing" : "incoming"}`;
      const bubble = document.createElement("div"); bubble.className = "bubble" + (state.selected === m.index ? " selected" : "");
      bubble.dataset.index = m.index;
      const sender = (!outgoing && state.senders.length > 2) ? `<div class="sender">${escapeHtml(m.sender)}</div>` : "";
      bubble.innerHTML = `${sender}${escapeHtml(m.text)}<span class="message-meta">${timeLabel(m.date)} ${outgoing ? '<span class="ticks">✓✓</span>' : ""}</span>`;
      bubble.title = "Click to copy this message";
      bubble.addEventListener("click", () => { state.selected = m.index; render(); copyText(m.text, "Message copied"); });
      row.appendChild(bubble); container.appendChild(row);
    });
    if (state.query && visible.length === 0) container.innerHTML = `<div class="system-message">No messages match “${escapeHtml(state.query)}”</div>`;
    $("composerPlaceholder").textContent = state.selected !== null ? "Message selected · click another message to copy it" : "Imported chat is read-only";
  }
  async function loadFile(file) {
    if (!file) return;
    if (!file.name.toLowerCase().endsWith(".txt") && file.type !== "text/plain") { toast("Please choose a WhatsApp .txt export"); return; }
    const raw = await file.text();
    const messages = parseChat(raw);
    if (!messages.length) { toast("No WhatsApp messages found. Check the TXT format."); return; }
    state.messages = messages;
    state.senders = [...new Set(messages.filter(m=>!m.system && m.sender).map(m=>m.sender))];
    state.fileName = file.name.replace(/\.txt$/i,"");
    state.selfSender = state.senders.length > 1 ? state.senders[state.senders.length-1] : state.senders[0] || null;
    state.selected = null; state.query = ""; $("chatSearch").value = "";
    populateSenders(); render();
    $("messageArea").scrollTop = $("messageArea").scrollHeight;
    toast(`Imported ${messages.length.toLocaleString()} messages`);
  }
  function populateSenders() {
    $("selfSender").innerHTML = state.senders.map(s=>`<option value="${escapeHtml(s)}">${escapeHtml(s)}</option>`).join("");
    if (state.selfSender) $("selfSender").value = state.selfSender;
  }
  fileInput.addEventListener("change", e => loadFile(e.target.files[0]));
  $("chatSearch").addEventListener("input", e => { state.query = e.target.value.trim(); render(); });
  $("copyAllBtn").addEventListener("click", () => copyText(state.messages.map(m=>`${m.date.toLocaleString()} - ${m.sender ? m.sender+": " : ""}${m.text}`).join("\n"), "Entire conversation copied"));
  $("composerCopyBtn").addEventListener("click", () => $("copyAllBtn").click());
  $("copySelectionBtn").addEventListener("click", () => { if (state.selected !== null) copyText(state.messages[state.selected].text, "Message copied"); });
  $("detailsBtn").addEventListener("click", () => $("settingsModal").hidden = false);
  $("closeModal").addEventListener("click", () => $("settingsModal").hidden = true);
  $("applySettings").addEventListener("click", () => { state.selfSender = $("selfSender").value; $("settingsModal").hidden = true; render(); toast("Chat layout updated"); });
  $("themeBtn").addEventListener("click", () => { document.body.classList.toggle("dark"); $("themeBtn").textContent = document.body.classList.contains("dark") ? "☀" : "☾"; });
  const drop = $("dropZone");
  ["dragenter","dragover"].forEach(ev=>drop.addEventListener(ev,e=>{e.preventDefault();drop.classList.add("drag");}));
  ["dragleave","drop"].forEach(ev=>drop.addEventListener(ev,e=>{e.preventDefault();drop.classList.remove("drag");}));
  drop.addEventListener("drop", e=>loadFile(e.dataTransfer.files[0]));
  document.addEventListener("keydown", e => { if ((e.ctrlKey||e.metaKey) && e.key.toLowerCase()==="o") { e.preventDefault(); fileInput.click(); } if (e.key==="Escape") $("settingsModal").hidden=true; });
})();