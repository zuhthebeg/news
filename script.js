const CATEGORY_LABELS = {
  "ai-tech": "AI·테크",
  domestic: "국내",
  world: "해외",
  economy: "경제",
};

let selectedDate = new Date();
let allArticles = [];
let selectedCategory = "all";

function pad(value) {
  return String(value).padStart(2, "0");
}

function toDateString(date) {
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

function formatHeaderDate(date) {
  return date.toLocaleDateString("ko-KR", {
    year: "numeric",
    month: "long",
    day: "numeric",
    weekday: "long",
  });
}

function setTheme(theme) {
  document.documentElement.setAttribute("data-theme", theme);
  localStorage.setItem("theme", theme);
}

function initTheme() {
  const savedTheme = localStorage.getItem("theme");
  const preferredDark = window.matchMedia("(prefers-color-scheme: dark)").matches;
  setTheme(savedTheme || (preferredDark ? "dark" : "light"));

  const toggle = document.getElementById("theme-toggle");
  if (!toggle) return;

  toggle.addEventListener("click", () => {
    const current = document.documentElement.getAttribute("data-theme") || "light";
    setTheme(current === "dark" ? "light" : "dark");
  });
}

function updateHeaderDate() {
  const dateElement = document.getElementById("current-date");
  if (dateElement) {
    dateElement.textContent = formatHeaderDate(selectedDate);
  }
}

function articleTimeText(publishedAt) {
  const date = new Date(publishedAt);
  return date.toLocaleString("ko-KR", {
    hour: "2-digit",
    minute: "2-digit",
    month: "2-digit",
    day: "2-digit",
  });
}

function createCard(article) {
  const card = document.createElement("article");
  card.className = "news-card";

  const category = CATEGORY_LABELS[article.category] || article.category;
  card.innerHTML = `
    <span class="badge">${category}</span>
    <h2 class="news-title"><a href="${article.sourceUrl}" target="_blank" rel="noopener noreferrer">${article.title}</a></h2>
    <p class="news-summary">${article.summary}</p>
    <p class="news-meta">${article.source} · ${articleTimeText(article.publishedAt)}</p>
  `;

  return card;
}

function renderNews() {
  const list = document.getElementById("news-list");
  const empty = document.getElementById("empty-state");
  if (!list || !empty) return;

  const filtered = selectedCategory === "all"
    ? allArticles
    : allArticles.filter((article) => article.category === selectedCategory);

  list.innerHTML = "";
  if (!filtered.length) {
    empty.hidden = false;
    return;
  }

  empty.hidden = true;
  filtered.forEach((article) => list.appendChild(createCard(article)));
}

async function loadNewsByDate(date) {
  const dateText = toDateString(date);
  const response = await fetch(`/articles/${dateText}.json`, { cache: "no-store" });

  if (!response.ok) {
    allArticles = [];
    renderNews();
    return;
  }

  const data = await response.json();
  allArticles = Array.isArray(data.articles) ? data.articles : [];
  renderNews();
}

function activateCategoryTabs() {
  const tabs = document.getElementById("category-tabs");
  if (!tabs) return;

  tabs.addEventListener("click", (event) => {
    const button = event.target.closest("button[data-category]");
    if (!button) return;

    selectedCategory = button.dataset.category;
    tabs.querySelectorAll("button").forEach((el) => el.classList.remove("active"));
    button.classList.add("active");
    renderNews();
  });
}

function bindDateNavigation() {
  const prevBtn = document.getElementById("prev-day");
  const nextBtn = document.getElementById("next-day");
  const todayBtn = document.getElementById("today");

  if (!prevBtn || !nextBtn || !todayBtn) return;

  prevBtn.addEventListener("click", async () => {
    selectedDate.setDate(selectedDate.getDate() - 1);
    updateHeaderDate();
    await loadNewsByDate(selectedDate);
  });

  nextBtn.addEventListener("click", async () => {
    selectedDate.setDate(selectedDate.getDate() + 1);
    updateHeaderDate();
    await loadNewsByDate(selectedDate);
  });

  todayBtn.addEventListener("click", async () => {
    selectedDate = new Date();
    updateHeaderDate();
    await loadNewsByDate(selectedDate);
  });
}

async function buildArchiveList() {
  const list = document.getElementById("archive-list");
  const empty = document.getElementById("archive-empty");
  if (!list || !empty) return;

  const foundDates = [];
  const base = new Date();

  for (let i = 0; i < 120; i += 1) {
    const checkDate = new Date(base);
    checkDate.setDate(base.getDate() - i);
    const dateText = toDateString(checkDate);

    try {
      const response = await fetch(`/articles/${dateText}.json`, { cache: "no-store" });
      if (response.ok) foundDates.push(dateText);
    } catch (error) {
      // Skip network/read errors and continue probing.
    }
  }

  if (!foundDates.length) {
    empty.hidden = false;
    return;
  }

  const sorted = foundDates.sort((a, b) => (a > b ? -1 : 1));
  sorted.forEach((dateText) => {
    const li = document.createElement("li");
    const a = document.createElement("a");
    a.href = `/index.html?date=${dateText}`;
    a.textContent = dateText;
    li.appendChild(a);
    list.appendChild(li);
  });
}

function readDateFromQuery() {
  const params = new URLSearchParams(window.location.search);
  const dateText = params.get("date");
  if (!dateText) return null;

  if (!/^\d{4}-\d{2}-\d{2}$/.test(dateText)) return null;
  const parsed = new Date(`${dateText}T00:00:00`);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

async function initHome() {
  const queryDate = readDateFromQuery();
  if (queryDate) selectedDate = queryDate;

  updateHeaderDate();
  activateCategoryTabs();
  bindDateNavigation();
  await loadNewsByDate(selectedDate);
}

async function initArchive() {
  await buildArchiveList();
}

document.addEventListener("DOMContentLoaded", async () => {
  initTheme();

  const page = document.body.dataset.page;
  if (page === "archive") {
    await initArchive();
    return;
  }

  await initHome();
});
