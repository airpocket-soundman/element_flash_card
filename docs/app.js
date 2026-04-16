import { ELEMENTS } from './elements.js';

const COURSES = {
  number: { label: "元素番号コース", reveal: "number" },
  english: { label: "元素名(英語)コース", reveal: "english" },
  japanese: { label: "元素名(日本語)コース", reveal: "japanese" },
  symbol: { label: "元素記号コース", reveal: "symbol" }
};

const STORAGE_KEY = "element_flash_card_history_v1";
const HISTORY_LIMIT = 10000;
const ELEMENT_MIN = 1;
const ELEMENT_MAX = ELEMENTS.length;

let currentCourse = null;
let currentElement = null;
let currentPool = ELEMENTS;
let answerVisible = false;
let history = loadHistory();

const screens = {
  menu: document.getElementById("menu-screen"),
  quiz: document.getElementById("quiz-screen"),
  result: document.getElementById("result-screen")
};

const quizTitle = document.getElementById("quiz-title");
const showAnswerBtn = document.getElementById("show-answer");
const markCorrectBtn = document.getElementById("mark-correct");
const markWrongBtn = document.getElementById("mark-wrong");
const windowSizeSelect = document.getElementById("window-size");
const resultPanels = document.getElementById("result-panels");
const rangeMinInput = document.getElementById("range-min");
const rangeMaxInput = document.getElementById("range-max");

const valueNodes = {
  number: document.getElementById("q-number"),
  english: document.getElementById("q-english"),
  japanese: document.getElementById("q-japanese"),
  symbol: document.getElementById("q-symbol")
};

registerServiceWorker();
setupEvents();
showScreen("menu");

function setupEvents() {
  document.querySelectorAll("[data-course]").forEach((btn) => {
    btn.addEventListener("click", () => startCourse(btn.dataset.course));
  });

  document.getElementById("go-results").addEventListener("click", () => {
    renderResults();
    showScreen("result");
  });

  document.querySelectorAll(".back-menu").forEach((btn) => {
    btn.addEventListener("click", () => showScreen("menu"));
  });

  showAnswerBtn.addEventListener("click", revealAnswer);
  markCorrectBtn.addEventListener("click", () => submitAnswer(true));
  markWrongBtn.addEventListener("click", () => submitAnswer(false));
  windowSizeSelect.addEventListener("change", renderResults);
}

function showScreen(name) {
  Object.keys(screens).forEach((key) => {
    screens[key].classList.toggle("active", key === name);
  });
}

function startCourse(courseKey) {
  const range = getSelectedRange();
  if (!range) return;

  currentPool = ELEMENTS.filter((e) => e.number >= range.min && e.number <= range.max);
  if (currentPool.length === 0) {
    alert("指定範囲に元素がありません。範囲を見直してください。");
    return;
  }

  currentCourse = courseKey;
  quizTitle.textContent = `${COURSES[courseKey].label}（${range.min}〜${range.max}）`;
  nextQuestion();
  showScreen("quiz");
}

function nextQuestion() {
  currentElement = currentPool[Math.floor(Math.random() * currentPool.length)];
  answerVisible = false;
  renderQuestion();
  showAnswerBtn.disabled = false;
  markCorrectBtn.disabled = true;
  markWrongBtn.disabled = true;
}

function renderQuestion() {
  const revealKey = COURSES[currentCourse].reveal;
  Object.keys(valueNodes).forEach((key) => {
    const node = valueNodes[key];
    if (answerVisible || key === revealKey) {
      node.textContent = currentElement[key];
      node.classList.remove("hidden-answer");
    } else {
      node.textContent = "●●●●";
      node.classList.add("hidden-answer");
    }
  });
}

function revealAnswer() {
  answerVisible = true;
  renderQuestion();
  showAnswerBtn.disabled = true;
  markCorrectBtn.disabled = false;
  markWrongBtn.disabled = false;
}

function submitAnswer(isCorrect) {
  const courseHistory = history[currentCourse];
  courseHistory.push({
    elementNumber: currentElement.number,
    correct: isCorrect,
    ts: Date.now()
  });
  if (courseHistory.length > HISTORY_LIMIT) {
    history[currentCourse] = courseHistory.slice(-HISTORY_LIMIT);
  }
  saveHistory();
  nextQuestion();
}

function renderResults() {
  const windowSize = Number(windowSizeSelect.value);
  resultPanels.innerHTML = "";

  Object.keys(COURSES).forEach((courseKey) => {
    const items = history[courseKey].slice(-windowSize);
    const statsMap = new Map();

    items.forEach((entry) => {
      if (!statsMap.has(entry.elementNumber)) {
        statsMap.set(entry.elementNumber, { total: 0, wrong: 0 });
      }
      const s = statsMap.get(entry.elementNumber);
      s.total += 1;
      if (!entry.correct) s.wrong += 1;
    });

    const ranked = [...statsMap.entries()]
      .map(([elementNumber, s]) => {
        const element = ELEMENTS[elementNumber - 1];
        const rate = s.total ? (s.wrong / s.total) * 100 : 0;
        return { element, total: s.total, wrong: s.wrong, rate };
      })
      .sort((a, b) => b.rate - a.rate || b.total - a.total)
      .slice(0, 10);

    const panel = document.createElement("article");
    panel.className = "panel";
    panel.innerHTML = `
      <h3>${COURSES[courseKey].label}</h3>
      <p>対象履歴: ${items.length}件 / 保持上限: ${HISTORY_LIMIT}件</p>
      ${
        ranked.length === 0
          ? "<p>まだ履歴がありません。</p>"
          : `<table>
              <thead>
                <tr>
                  <th>順位</th>
                  <th>番号</th>
                  <th>記号</th>
                  <th>英語名</th>
                  <th>日本語名</th>
                  <th>誤答率</th>
                  <th>誤答/総数</th>
                </tr>
              </thead>
              <tbody>
                ${ranked
                  .map(
                    (row, idx) => `
                      <tr>
                        <td>${idx + 1}</td>
                        <td>${row.element.number}</td>
                        <td>${row.element.symbol}</td>
                        <td>${row.element.english}</td>
                        <td>${row.element.japanese}</td>
                        <td>${row.rate.toFixed(1)}%</td>
                        <td>${row.wrong}/${row.total}</td>
                      </tr>
                    `
                  )
                  .join("")}
              </tbody>
            </table>`
      }
    `;
    resultPanels.appendChild(panel);
  });
}

function loadHistory() {
  const empty = { number: [], english: [], japanese: [], symbol: [] };
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return empty;
    const parsed = JSON.parse(raw);
    return {
      number: Array.isArray(parsed.number) ? parsed.number : [],
      english: Array.isArray(parsed.english) ? parsed.english : [],
      japanese: Array.isArray(parsed.japanese) ? parsed.japanese : [],
      symbol: Array.isArray(parsed.symbol) ? parsed.symbol : []
    };
  } catch (_err) {
    return empty;
  }
}

function saveHistory() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(history));
}

function getSelectedRange() {
  const min = Number.parseInt(rangeMinInput.value, 10);
  const max = Number.parseInt(rangeMaxInput.value, 10);

  if (!Number.isInteger(min) || !Number.isInteger(max)) {
    alert("出題範囲は整数で入力してください。");
    return null;
  }

  if (min < ELEMENT_MIN || max > ELEMENT_MAX || min > max) {
    alert(`出題範囲は ${ELEMENT_MIN}〜${ELEMENT_MAX} で、開始<=終了にしてください。`);
    return null;
  }

  return { min, max };
}

function registerServiceWorker() {
  if (!("serviceWorker" in navigator)) return;

  window.addEventListener("load", () => {
    navigator.serviceWorker.register("./service-worker.js").catch(() => {
      // no-op
    });
  });
}
