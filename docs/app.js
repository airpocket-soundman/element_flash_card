import { ELEMENTS } from './elements.js';

const COURSES = {
  number: { label: "元素番号コース", reveal: "number" },
  english: { label: "元素名(英語)コース", reveal: "english" },
  japanese: { label: "元素名(日本語)コース", reveal: "japanese" },
  symbol: { label: "元素記号コース", reveal: "symbol" },
  symbolInput: { label: "入力モード（番号→記号）", reveal: "number", input: "alpha", answerKey: "symbol" },
  numberInput: { label: "入力モード（記号→番号）", reveal: "symbol", input: "num", answerKey: "number" }
};

const STORAGE_KEY = "element_flash_card_history_v1";
const RANGE_KEY = "element_flash_card_range_v1";
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
const rangeSummary = document.getElementById("range-summary");
const rangeDials = setupRangeDials();

const defaultActions = document.getElementById("default-actions");
const inputActions = document.getElementById("input-actions");
const answerInput = document.getElementById("answer-input");
const inputSubmitBtn = document.getElementById("input-submit");
const judgeResult = document.getElementById("judge-result");

let autoAdvanceTimer = null;

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

  inputSubmitBtn.addEventListener("click", submitInputAnswer);

  answerInput.addEventListener("keydown", (e) => {
    if (e.key === "Enter") {
      e.preventDefault();
      if (autoAdvanceTimer) {
        clearTimeout(autoAdvanceTimer);
        autoAdvanceTimer = null;
        nextQuestion();
      } else {
        submitInputAnswer();
      }
    }
  });

  judgeResult.addEventListener("click", () => {
    if (autoAdvanceTimer) {
      clearTimeout(autoAdvanceTimer);
      autoAdvanceTimer = null;
      nextQuestion();
    }
  });
}

function showScreen(name) {
  if (name !== "quiz" && autoAdvanceTimer) {
    clearTimeout(autoAdvanceTimer);
    autoAdvanceTimer = null;
  }
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

  const course = COURSES[courseKey];
  const isInput = !!course.input;
  defaultActions.hidden = isInput;
  inputActions.hidden = !isInput;
  if (isInput) configureAnswerInput(course);

  nextQuestion();
  showScreen("quiz");
}

function configureAnswerInput(course) {
  if (course.input === "alpha") {
    answerInput.setAttribute("inputmode", "text");
    answerInput.setAttribute("autocapitalize", "characters");
    answerInput.setAttribute("placeholder", "元素記号を入力 (例: Fe)");
    answerInput.removeAttribute("pattern");
  } else {
    answerInput.setAttribute("inputmode", "numeric");
    answerInput.setAttribute("autocapitalize", "off");
    answerInput.setAttribute("pattern", "[0-9]*");
    answerInput.setAttribute("placeholder", "元素番号を入力 (例: 26)");
  }
}

function nextQuestion() {
  currentElement = currentPool[Math.floor(Math.random() * currentPool.length)];
  answerVisible = false;
  renderQuestion();

  const course = COURSES[currentCourse];
  if (course.input) {
    resetInputState();
  } else {
    showAnswerBtn.disabled = false;
    markCorrectBtn.disabled = true;
    markWrongBtn.disabled = true;
  }
}

function renderQuestion() {
  const course = COURSES[currentCourse];
  const revealKey = course.reveal;
  const isInput = !!course.input;
  Object.keys(valueNodes).forEach((key) => {
    const node = valueNodes[key];
    const row = node.parentElement;
    const revealed = answerVisible || key === revealKey;

    if (isInput && !revealed) {
      row.hidden = true;
      return;
    }
    row.hidden = false;

    if (revealed) {
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
  recordResult(isCorrect);
  nextQuestion();
}

function recordResult(isCorrect) {
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
}

function resetInputState() {
  if (autoAdvanceTimer) {
    clearTimeout(autoAdvanceTimer);
    autoAdvanceTimer = null;
  }
  answerInput.value = "";
  answerInput.readOnly = false;
  answerInput.disabled = false;
  inputSubmitBtn.disabled = false;
  judgeResult.hidden = true;
  judgeResult.classList.remove("correct", "wrong");
  answerInput.focus();
}

function submitInputAnswer() {
  if (autoAdvanceTimer) return;
  const raw = answerInput.value.trim();
  if (!raw) return;
  const course = COURSES[currentCourse];
  if (!course || !course.input) return;

  const correct = String(currentElement[course.answerKey]);
  const isCorrect =
    course.input === "alpha"
      ? raw.toLowerCase() === correct.toLowerCase()
      : Number(raw) === Number(correct);

  recordResult(isCorrect);

  answerVisible = true;
  renderQuestion();

  judgeResult.hidden = false;
  judgeResult.classList.toggle("correct", isCorrect);
  judgeResult.classList.toggle("wrong", !isCorrect);
  judgeResult.textContent = isCorrect
    ? `正解！  ${correct}`
    : `不正解  あなた: ${raw}  /  正解: ${correct}`;

  answerInput.readOnly = true;
  inputSubmitBtn.disabled = true;

  const delay = isCorrect ? 700 : 2200;
  autoAdvanceTimer = setTimeout(() => {
    autoAdvanceTimer = null;
    nextQuestion();
  }, delay);
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
  const result = {};
  Object.keys(COURSES).forEach((key) => {
    result[key] = [];
  });
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return result;
    const parsed = JSON.parse(raw);
    Object.keys(result).forEach((key) => {
      if (Array.isArray(parsed[key])) result[key] = parsed[key];
    });
  } catch (_err) {
    /* ignore */
  }
  return result;
}

function saveHistory() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(history));
}

function getSelectedRange() {
  const min = rangeDials.minDial.getValue();
  const max = rangeDials.maxDial.getValue();
  return { min, max };
}

function setupRangeDials() {
  const saved = loadRange();
  const minDial = createDial(document.getElementById("dial-min"), {
    min: ELEMENT_MIN,
    max: ELEMENT_MAX,
    value: saved.min
  });
  const maxDial = createDial(document.getElementById("dial-max"), {
    min: ELEMENT_MIN,
    max: ELEMENT_MAX,
    value: saved.max
  });

  document.querySelectorAll(".dial-step").forEach((btn) => {
    const target = btn.dataset.target === "min" ? minDial : maxDial;
    const step = Number(btn.dataset.step);
    btn.addEventListener("click", () => {
      target.setValue(target.getValue() + step);
    });
  });

  function updateSummary() {
    rangeSummary.textContent = `${minDial.getValue()}〜${maxDial.getValue()}`;
  }

  function persist() {
    saveRange(minDial.getValue(), maxDial.getValue());
  }

  minDial.onChange = updateSummary;
  maxDial.onChange = updateSummary;

  minDial.onSettle = (v) => {
    if (v > maxDial.getValue()) maxDial.setValue(v);
    persist();
  };
  maxDial.onSettle = (v) => {
    if (v < minDial.getValue()) minDial.setValue(v);
    persist();
  };

  updateSummary();
  return { minDial, maxDial };
}

function loadRange() {
  const fallback = { min: 1, max: Math.min(40, ELEMENT_MAX) };
  try {
    const raw = localStorage.getItem(RANGE_KEY);
    if (!raw) return fallback;
    const parsed = JSON.parse(raw);
    const min = Number.parseInt(parsed.min, 10);
    const max = Number.parseInt(parsed.max, 10);
    if (
      Number.isInteger(min) &&
      Number.isInteger(max) &&
      min >= ELEMENT_MIN &&
      max <= ELEMENT_MAX &&
      min <= max
    ) {
      return { min, max };
    }
  } catch (_err) {
    /* ignore */
  }
  return fallback;
}

function saveRange(min, max) {
  try {
    localStorage.setItem(RANGE_KEY, JSON.stringify({ min, max }));
  } catch (_err) {
    /* ignore */
  }
}

function createDial(host, { min, max, value }) {
  const ITEM_WIDTH = 44;
  const list = host.querySelector(".dial-list");

  const startSpacer = document.createElement("li");
  startSpacer.className = "dial-spacer";
  list.appendChild(startSpacer);

  const items = [];
  for (let i = min; i <= max; i++) {
    const li = document.createElement("li");
    li.textContent = i;
    li.dataset.value = String(i);
    list.appendChild(li);
    items.push(li);
  }

  const endSpacer = document.createElement("li");
  endSpacer.className = "dial-spacer";
  list.appendChild(endSpacer);

  function updateSpacers() {
    const trackWidth = list.clientWidth;
    const spacer = Math.max(0, (trackWidth - ITEM_WIDTH) / 2);
    startSpacer.style.flex = `0 0 ${spacer}px`;
    endSpacer.style.flex = `0 0 ${spacer}px`;
  }

  let currentValue = clamp(value, min, max);

  const api = {
    onChange: null,
    onSettle: null,
    getValue: () => currentValue,
    setValue: (v) => {
      const next = clamp(Math.round(v), min, max);
      const idx = next - min;
      list.scrollTo({ left: idx * ITEM_WIDTH, behavior: "smooth" });
    }
  };

  function setActive(v) {
    if (v === currentValue) return;
    currentValue = v;
    items.forEach((li) => {
      li.classList.toggle("active", Number(li.dataset.value) === v);
    });
    if (api.onChange) api.onChange(v);
  }

  let settleTimer = null;
  function syncFromScroll() {
    const idx = Math.round(list.scrollLeft / ITEM_WIDTH);
    const v = clamp(min + idx, min, max);
    setActive(v);
    clearTimeout(settleTimer);
    settleTimer = setTimeout(() => {
      if (api.onSettle) api.onSettle(currentValue);
    }, 120);
  }

  list.addEventListener("scroll", syncFromScroll, { passive: true });

  items.forEach((li) => {
    li.addEventListener("click", () => {
      api.setValue(Number(li.dataset.value));
    });
  });

  host.tabIndex = 0;
  host.addEventListener("keydown", (e) => {
    if (e.key === "ArrowLeft") {
      e.preventDefault();
      api.setValue(currentValue - 1);
    } else if (e.key === "ArrowRight") {
      e.preventDefault();
      api.setValue(currentValue + 1);
    }
  });

  function initialize() {
    updateSpacers();
    const idx = currentValue - min;
    list.scrollLeft = idx * ITEM_WIDTH;
    items.forEach((li) => {
      li.classList.toggle("active", Number(li.dataset.value) === currentValue);
    });
  }

  requestAnimationFrame(initialize);
  window.addEventListener("resize", () => {
    updateSpacers();
    const idx = currentValue - min;
    list.scrollLeft = idx * ITEM_WIDTH;
  });

  return api;
}

function clamp(v, lo, hi) {
  return Math.max(lo, Math.min(hi, v));
}

function registerServiceWorker() {
  if (!("serviceWorker" in navigator)) return;

  window.addEventListener("load", () => {
    navigator.serviceWorker.register("./service-worker.js").catch(() => {
      // no-op
    });
  });
}
