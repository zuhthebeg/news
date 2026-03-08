const CATEGORY_LABELS = {
  "ai-tech": "AI·테크",
  domestic: "국내",
  world: "해외",
  economy: "경제",
  science: "과학",
  blog: "블로그",
};

const LLM_API = "https://llm.cocy.io/v1/chat/completions";
const AUTH_API = "https://relay.cocy.io/api/auth";

let selectedDate = new Date();
let allArticles = [];
let selectedCategory = "all";

/* ── Auth ── */
function getToken() {
  return localStorage.getItem("accessToken") || localStorage.getItem("cocy_auth_token");
}
function getRefresh() {
  return localStorage.getItem("refreshToken") || localStorage.getItem("cocy_refresh_token");
}
function setTokens(access, refresh) {
  localStorage.setItem("accessToken", access);
  localStorage.setItem("refreshToken", refresh);
  localStorage.setItem("cocy_auth_token", access);
  localStorage.setItem("cocy_refresh_token", refresh);
}
function getUser() {
  try { return JSON.parse(localStorage.getItem("user")); } catch { return null; }
}
function setUser(u) { localStorage.setItem("user", JSON.stringify(u)); }
function clearAuth() {
  ["accessToken","refreshToken","cocy_auth_token","cocy_refresh_token","user"].forEach(k => localStorage.removeItem(k));
}

function isLoggedIn() { return !!getToken(); }

async function refreshToken() {
  const rt = getRefresh();
  if (!rt) return false;
  try {
    const res = await fetch(`${AUTH_API}/refresh`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ refreshToken: rt }),
    });
    if (!res.ok) { clearAuth(); return false; }
    const d = await res.json();
    setTokens(d.accessToken, d.refreshToken);
    return true;
  } catch { return false; }
}

async function checkAuth() {
  const token = getToken();
  if (!token) { renderAuthUI(); return; }
  try {
    const res = await fetch(`${AUTH_API}/me`, { headers: { Authorization: `Bearer ${token}` } });
    if (res.ok) { setUser(await res.json()); }
    else if (res.status === 401) { if (!await refreshToken()) clearAuth(); }
  } catch { /* offline */ }
  renderAuthUI();
}

function renderAuthUI() {
  const el = document.getElementById("auth-area");
  if (!el) return;
  const user = getUser();
  if (user) {
    const name = user.nickname || (user.email || "").split("@")[0];
    el.innerHTML = `<span class="auth-user">${name}</span><button class="auth-logout" onclick="logout()">로그아웃</button>`;
  } else {
    el.innerHTML = `<button class="auth-login-btn" onclick="openLogin()">로그인</button>`;
  }
}

function openLogin() {
  const modal = document.getElementById("login-modal");
  if (modal) modal.hidden = false;
}
function closeLogin() {
  const modal = document.getElementById("login-modal");
  if (modal) modal.hidden = true;
  const err = document.getElementById("login-error");
  if (err) err.textContent = "";
}

async function handleLogin(e) {
  e.preventDefault();
  const email = document.getElementById("login-email").value;
  const password = document.getElementById("login-pw").value;
  const errEl = document.getElementById("login-error");
  errEl.textContent = "";
  try {
    const res = await fetch(`${AUTH_API}/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, password }),
    });
    const d = await res.json();
    if (!res.ok) throw new Error(d.error || "로그인 실패");
    setTokens(d.accessToken, d.refreshToken);
    setUser(d.user);
    closeLogin();
    renderAuthUI();
    renderNews(); // re-render to show fact-check buttons
  } catch (err) { errEl.textContent = err.message; }
}

function logout() { clearAuth(); renderAuthUI(); renderNews(); }

/* ── Helpers ── */
function pad(v) { return String(v).padStart(2, "0"); }
function toDateString(d) { return `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}`; }
function formatHeaderDate(d) {
  return d.toLocaleDateString("ko-KR", { year:"numeric", month:"long", day:"numeric", weekday:"long" });
}
function articleTimeText(p) {
  const d = new Date(p);
  return d.toLocaleString("ko-KR", { hour:"2-digit", minute:"2-digit", month:"2-digit", day:"2-digit" });
}

function setTheme(t) { document.documentElement.setAttribute("data-theme", t); localStorage.setItem("theme", t); }
function initTheme() {
  const saved = localStorage.getItem("theme");
  const dark = window.matchMedia("(prefers-color-scheme: dark)").matches;
  setTheme(saved || (dark ? "dark" : "light"));
  const toggle = document.getElementById("theme-toggle");
  if (toggle) toggle.addEventListener("click", () => {
    setTheme((document.documentElement.getAttribute("data-theme") || "light") === "dark" ? "light" : "dark");
  });
}

/* ── Fact Check Cache ── */
const FC_PREFIX = "fc_";

function getFcCache(id) {
  try { return JSON.parse(localStorage.getItem(FC_PREFIX + id)); } catch { return null; }
}
function setFcCache(id, result) {
  try { localStorage.setItem(FC_PREFIX + id, JSON.stringify(result)); } catch {}
}

function renderFcResult(resultEl, btn, result) {
  const score = Math.min(100, Math.max(0, Number(result.score) || 50));
  const barColor = score >= 70 ? "var(--fc-green)" : score >= 40 ? "var(--fc-yellow)" : "var(--fc-red)";
  resultEl.innerHTML = `
    <div class="fc-score-row">
      <span class="fc-label">팩트 신뢰도</span>
      <span class="fc-pct">${score}%</span>
    </div>
    <div class="fc-bar"><div class="fc-bar-fill" style="width:${score}%;background:${barColor}"></div></div>
    <p class="fc-reason">${result.reason || ""}</p>
    <p class="fc-caution">⚠️ ${result.caution || ""}</p>
  `;
  resultEl.hidden = false;
  if (btn) { btn.textContent = "✨ 팩트체크 완료"; btn.disabled = false; }
}

/* ── Fact Check ── */
async function factCheck(articleId, btn) {
  if (!isLoggedIn()) { openLogin(); return; }

  const article = allArticles.find(a => a.id === articleId);
  if (!article) return;

  const resultEl = btn.closest(".news-card").querySelector(".factcheck-result");

  // 캐시 확인
  const cached = getFcCache(articleId);
  if (cached) { renderFcResult(resultEl, btn, cached); return; }

  btn.disabled = true;
  btn.textContent = "분석 중...";

  try {
    const res = await fetch(LLM_API, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        model: "spark",
        messages: [
          {
            role: "system",
            content: `당신은 중립적 팩트체커입니다. 기사 제목과 요약을 보고:
1) 사실 신뢰도를 0~100% 숫자로 판단
2) 근거 1~2줄
3) 주의할 점 1줄

반드시 아래 JSON 형식으로만 응답:
{"score":75,"reason":"근거","caution":"주의점"}`
          },
          {
            role: "user",
            content: `제목: ${article.title}\n요약: ${article.summary}\n출처: ${article.source}`
          }
        ],
        max_tokens: 300
      })
    });

    const data = await res.json();
    const text = data.choices?.[0]?.message?.content || "";
    const match = text.match(/\{[\s\S]*\}/);
    if (!match) throw new Error("파싱 실패");
    const result = JSON.parse(match[0]);
    setFcCache(articleId, result);
    renderFcResult(resultEl, btn, result);
  } catch (err) {
    resultEl.innerHTML = `<p class="fc-error">팩트체크 실패: ${err.message}</p>`;
    resultEl.hidden = false;
    btn.textContent = "✨ 팩트체크";
    btn.disabled = false;
  }
}

/* ── Card Render ── */
function createCard(article) {
  const card = document.createElement("article");
  card.className = "news-card";
  const cat = CATEGORY_LABELS[article.category] || article.category;
  const loggedIn = isLoggedIn();
  const cached = getFcCache(article.id);

  card.innerHTML = `
    <span class="badge">${cat}</span>
    <h2 class="news-title"><a href="${article.sourceUrl}" target="_blank" rel="noopener noreferrer">${article.title}</a></h2>
    <p class="news-summary">${article.summary}</p>
    <p class="news-meta">${article.source} · ${articleTimeText(article.publishedAt)}</p>
    <div class="fc-area">
      <button class="fc-btn" onclick="factCheck('${article.id}', this)" title="${loggedIn ? '팩트체크 실행' : '로그인 후 이용 가능'}">${cached ? "✨ 팩트체크 완료" : "✨ 팩트체크"}</button>
      <div class="factcheck-result" hidden></div>
    </div>
  `;

  // 캐시 있으면 결과 자동 표시
  if (cached) {
    const resultEl = card.querySelector(".factcheck-result");
    const btn = card.querySelector(".fc-btn");
    renderFcResult(resultEl, btn, cached);
  }

  return card;
}

/* ── Render / Load ── */
function renderNews() {
  const list = document.getElementById("news-list");
  const empty = document.getElementById("empty-state");
  if (!list || !empty) return;
  const filtered = selectedCategory === "all" ? allArticles : allArticles.filter(a => a.category === selectedCategory);
  list.innerHTML = "";
  if (!filtered.length) { empty.hidden = false; return; }
  empty.hidden = true;
  filtered.forEach(a => list.appendChild(createCard(a)));
}

async function loadNewsByDate(date) {
  const dt = toDateString(date);
  try {
    const res = await fetch(`/articles/${dt}.json`, { cache: "no-store" });
    if (!res.ok) { allArticles = []; renderNews(); return; }
    const data = await res.json();
    allArticles = Array.isArray(data.articles) ? data.articles : [];
  } catch { allArticles = []; }
  renderNews();
}

function activateCategoryTabs() {
  const tabs = document.getElementById("category-tabs");
  if (!tabs) return;
  tabs.addEventListener("click", e => {
    const btn = e.target.closest("button[data-category]");
    if (!btn) return;
    selectedCategory = btn.dataset.category;
    tabs.querySelectorAll("button").forEach(el => el.classList.remove("active"));
    btn.classList.add("active");
    renderNews();
  });
}

function bindDateNavigation() {
  const prev = document.getElementById("prev-day");
  const next = document.getElementById("next-day");
  const today = document.getElementById("today");
  if (!prev || !next || !today) return;
  prev.addEventListener("click", async () => { selectedDate.setDate(selectedDate.getDate()-1); updateHeaderDate(); await loadNewsByDate(selectedDate); });
  next.addEventListener("click", async () => { selectedDate.setDate(selectedDate.getDate()+1); updateHeaderDate(); await loadNewsByDate(selectedDate); });
  today.addEventListener("click", async () => { selectedDate = new Date(); updateHeaderDate(); await loadNewsByDate(selectedDate); });
}

function updateHeaderDate() {
  const el = document.getElementById("current-date");
  if (el) el.textContent = formatHeaderDate(selectedDate);
}

/* ── Archive ── */
async function buildArchiveList() {
  const list = document.getElementById("archive-list");
  const empty = document.getElementById("archive-empty");
  if (!list || !empty) return;
  const found = [];
  const base = new Date();
  for (let i = 0; i < 120; i++) {
    const d = new Date(base); d.setDate(base.getDate() - i);
    try { const r = await fetch(`/articles/${toDateString(d)}.json`, { cache: "no-store" }); if (r.ok) found.push(toDateString(d)); } catch {}
  }
  if (!found.length) { empty.hidden = false; return; }
  found.sort((a,b) => a > b ? -1 : 1).forEach(dt => {
    const li = document.createElement("li");
    const a = document.createElement("a");
    a.href = `/index.html?date=${dt}`;
    a.textContent = dt;
    li.appendChild(a);
    list.appendChild(li);
  });
}

function readDateFromQuery() {
  const p = new URLSearchParams(window.location.search).get("date");
  if (!p || !/^\d{4}-\d{2}-\d{2}$/.test(p)) return null;
  const d = new Date(`${p}T00:00:00`);
  return Number.isNaN(d.getTime()) ? null : d;
}

/* ── Init ── */
document.addEventListener("DOMContentLoaded", async () => {
  initTheme();
  await checkAuth();
  const page = document.body.dataset.page;
  if (page === "archive") { await buildArchiveList(); return; }
  const qd = readDateFromQuery();
  if (qd) selectedDate = qd;
  updateHeaderDate();
  activateCategoryTabs();
  bindDateNavigation();
  await loadNewsByDate(selectedDate);
});
