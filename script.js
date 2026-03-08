const CATEGORY_LABELS = {
  "ai-tech": "AI·테크",
  domestic: "국내",
  world: "해외",
  economy: "경제",
  science: "과학",
  blog: "블로그",
};

const LLM_API = "https://llm.cocy.io/v2/chat/completions";
const AUTH_API = "https://relay.cocy.io/api/auth";
const NEWS_API = "https://relay.cocy.io/api/news";

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

function renderHeadlineBlock(h) {
  if (!h) return "";
  const intentLabel = { "정보전달":"📰 정보전달", "의제설정":"📢 의제설정", "클릭베이트":"🎣 클릭베이트", "정치적":"🏛 정치적", "상업적":"💰 상업적" };
  const fairBadge = h.fair ? '<span class="fc-badge fc-badge-ok">제목 공정</span>' : '<span class="fc-badge fc-badge-warn">제목 주의</span>';
  return `<div class="fc-headline-block">
    <span class="fc-hl-label">🔍 제목 의도</span>
    <span class="fc-hl-intent">${intentLabel[h.intent] || h.intent || "불명확"}</span>
    ${fairBadge}
    ${h.note ? `<p class="fc-hl-note">${h.note}</p>` : ""}
  </div>`;
}

function renderFcResult(resultEl, btn, result) {
  const type = result?.type || "factcheck";
  const summaryHtml = `<p class="fc-summary">🧾 요약: ${result.summary || "요약 정보 없음"}</p>`;
  const headlineHtml = renderHeadlineBlock(result.headline);

  if (type === "review") {
    resultEl.innerHTML = `
      <h4 class="fc-review-title">📝 기사 분석</h4>
      ${summaryHtml}
      <p class="fc-reason">${result.evaluation || "평가 정보 없음"}</p>
      <p class="fc-caution">⚖️ ${result.bias || "논조/편향성 정보 없음"}</p>
      ${headlineHtml}
    `;
  } else {
    const score = Math.min(100, Math.max(0, Number(result.score) || 50));
    const barColor = score >= 70 ? "var(--fc-green)" : score >= 40 ? "var(--fc-yellow)" : "var(--fc-red)";
    resultEl.innerHTML = `
      ${summaryHtml}
      <div class="fc-score-row">
        <span class="fc-label">팩트 신뢰도</span>
        <span class="fc-pct">${score}%</span>
      </div>
      <div class="fc-bar"><div class="fc-bar-fill" style="width:${score}%;background:${barColor}"></div></div>
      <p class="fc-reason">${result.reason || ""}</p>
      <p class="fc-caution">⚠️ ${result.caution || ""}</p>
      ${headlineHtml}
    `;
  }

  resultEl.hidden = false;
  if (btn) { btn.textContent = "✨ 팩트체크 완료"; btn.disabled = false; }
}

function dbFactcheckToResult(row) {
  if (!row) return null;
  return {
    type: row.result_type || "factcheck",
    summary: row.summary || "",
    score: row.score,
    reason: row.reason || "",
    caution: row.caution || "",
    evaluation: row.evaluation || "",
    bias: row.bias || "",
    headline: {
      intent: row.headline_intent || null,
      fair: row.headline_fair === null || row.headline_fair === undefined ? null : !!row.headline_fair,
      note: row.headline_note || "",
    },
    journalist_name: row.journalist_name || null,
    journalist_media: row.journalist_media || null,
  };
}

/* ── Fact Check ── */
async function factCheck(articleId, btn) {
  if (!isLoggedIn()) { openLogin(); return; }

  const article = allArticles.find(a => a.id === articleId);
  if (!article) return;

  const resultEl = btn.closest(".news-card").querySelector(".factcheck-result");
  const articleUrl = article.url || article.link || article.sourceUrl || "";

  btn.disabled = true;
  btn.textContent = "분석 중...";

  try {
    if (articleUrl) {
      const cacheRes = await fetch(`${NEWS_API}/factcheck?url=${encodeURIComponent(articleUrl)}`);
      if (cacheRes.ok) {
        const cacheData = await cacheRes.json();
        const cached = dbFactcheckToResult(cacheData?.data);
        if (cached) {
          renderFcResult(resultEl, btn, cached);
          return;
        }
      }
    }

    const res = await fetch(LLM_API, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        model: "spark",
        messages: [
          {
            role: "system",
            content: `당신은 중립적인 뉴스 분석 AI입니다. 기사 URL과 제목/요약을 받아:

STEP 1: 기사 내용을 2~3문장으로 요약 (핵심 사실 중심)

STEP 2: 아래 두 가지 중 하나를 선택:
- [팩트체크 가능] 사실 확인이 가능한 구체적 주장이 있으면: 신뢰도 점수(0-100) + 근거 + 주의점
- [평가 모드] 의견/전망/예측/홍보성 기사이거나 팩트체크 불가하면: 기사 논조 + 균형성 + 주의사항

STEP 3: 제목 분석 — 제목이 내용을 공정하게 반영하는지 평가
- 과장/낚시성 여부 (클릭베이트, 공포 조장, 과장된 표현)
- 생략된 핵심 (제목에서 빠진 중요 맥락)
- 저널리즘 의도 추정 (정보 전달 / 의제 설정 / 상업적 / 정치적)

STEP 4: 기사 URL의 byline(기자명)을 파싱. 이름과 소속 언론사.
JSON에 journalist_name, journalist_media 필드 추가.
모르면 null.

반드시 아래 JSON 형식으로 응답:
팩트체크: {"type":"factcheck","summary":"요약","score":75,"reason":"근거","caution":"주의점","headline":{"intent":"정보전달|의제설정|클릭베이트|정치적|상업적","fair":true,"note":"한 줄 평"},"journalist_name":"홍길동|null","journalist_media":"한겨레|null"}
평가: {"type":"review","summary":"요약","evaluation":"객관적 평가","bias":"논조/편향성","headline":{"intent":"정보전달|의제설정|클릭베이트|정치적|상업적","fair":true,"note":"한 줄 평"},"journalist_name":"홍길동|null","journalist_media":"한겨레|null"}`
          },
          {
            role: "user",
            content: `기사 URL: ${articleUrl}\n제목: ${article.title}\n요약: ${article.summary}\n출처: ${article.source}`
          }
        ],
        max_tokens: 700
      })
    });

    const data = await res.json();
    const text = data.choices?.[0]?.message?.content || "";
    const match = text.match(/\{[\s\S]*\}/);
    if (!match) throw new Error("파싱 실패");
    const result = JSON.parse(match[0]);

    if (articleUrl) {
      await fetch(`${NEWS_API}/factcheck`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          article_url: articleUrl,
          article_title: article.title || null,
          summary: result.summary || article.summary || null,
          result_type: result.type === "review" ? "review" : "factcheck",
          score: result.type === "factcheck" ? (result.score ?? null) : null,
          reason: result.reason ?? null,
          caution: result.caution ?? null,
          evaluation: result.evaluation ?? null,
          bias: result.bias ?? null,
          headline_intent: result.headline?.intent ?? null,
          headline_fair: result.headline?.fair ?? null,
          headline_note: result.headline?.note ?? null,
          journalist_name: result.journalist_name ?? null,
          journalist_media: result.journalist_media ?? null
        })
      }).catch(() => {});
    }

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

  card.innerHTML = `
    <span class="badge">${cat}</span>
    <h2 class="news-title"><a href="${article.sourceUrl}" target="_blank" rel="noopener noreferrer">${article.title}</a></h2>
    <p class="news-summary">${article.summary}</p>
    <p class="news-meta">${article.source} · ${articleTimeText(article.publishedAt)}</p>
    <div class="fc-area">
      <button class="fc-btn" onclick="factCheck('${article.id}', this)" title="${loggedIn ? '팩트체크 실행' : '로그인 후 이용 가능'}">✨ 팩트체크</button>
      <div class="factcheck-result" hidden></div>
    </div>
  `;

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
