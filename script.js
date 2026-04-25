"use strict";

/* -----------------------------
   PDF.js setup
----------------------------- */

if (window.pdfjsLib) {
  pdfjsLib.GlobalWorkerOptions.workerSrc =
    "https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js";
}

/* -----------------------------
   App state
----------------------------- */

let currentPairs = [];
let currentRound = [];
const STORAGE_KEY = "wizardWordsSavedSetupsV1";
const MAX_SAVES = 500;

/* -----------------------------
   DOM helpers
----------------------------- */

const $ = (id) => document.getElementById(id);

const elements = {
  tabButtons: document.querySelectorAll(".tab-button"),
  tabPanels: document.querySelectorAll(".tab-panel"),

  pdfFileInput: $("pdfFileInput"),
  extractPdfButton: $("extractPdfButton"),
  pdfStatus: $("pdfStatus"),

  teacherInput: $("teacherInput"),
  loadTeacherButton: $("loadTeacherButton"),

  wordsBox: $("wordsBox"),
  definitionsBox: $("definitionsBox"),
  loadTwoBoxButton: $("loadTwoBoxButton"),

  setupSummary: $("setupSummary"),
  setupTitleInput: $("setupTitleInput"),
  saveSetupButton: $("saveSetupButton"),
  startGameButton: $("startGameButton"),

  gameSection: $("gameSection"),
  wordBank: $("wordBank"),
  definitionList: $("definitionList"),
  leaveGameButton: $("leaveGameButton"),

  savedLibraryList: $("savedLibraryList"),
  refreshLibraryButton: $("refreshLibraryButton"),
  exportLibraryButton: $("exportLibraryButton"),
  importLibraryInput: $("importLibraryInput"),

  completionModal: $("completionModal"),
  newRoundButton: $("newRoundButton"),
  newGameButton: $("newGameButton"),
  answerSheetButton: $("answerSheetButton"),
  modalLeaveButton: $("modalLeaveButton"),

  // confettiCanvas removed — using canvas-confetti library instead
};

/* -----------------------------
   Tabs
----------------------------- */

elements.tabButtons.forEach((button) => {
  button.addEventListener("click", () => {
    elements.tabButtons.forEach((btn) => btn.classList.remove("active"));
    elements.tabPanels.forEach((panel) => panel.classList.remove("active"));

    button.classList.add("active");
    $(button.dataset.tab).classList.add("active");

    if (button.dataset.tab === "savedTab") {
      renderSavedLibrary();
    }
  });
});

/* -----------------------------
   Utility functions
----------------------------- */

function normalizeAnswer(text) {
  return String(text)
    .toLowerCase()
    .replace(/[“”]/g, '"')
    .replace(/[‘’]/g, "'")
    .replace(/\s+/g, " ")
    .trim();
}

function cleanLine(line) {
  return String(line)
    .replace(/\u00a0/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function stripListMarker(line) {
  return cleanLine(line)
    .replace(/^[-–—•*]\s*/, "")
    .replace(/^\(?\d+\)?[.)]\s*/, "")
    .trim();
}

function shuffleArray(array) {
  const copy = [...array];

  for (let i = copy.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }

  return copy;
}

function escapeHTML(text) {
  return String(text)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function setStatus(message, isError = false) {
  elements.pdfStatus.textContent = message;
  elements.pdfStatus.style.color = isError ? "#c62828" : "#252525";
}

function validatePairs(pairs) {
  if (!Array.isArray(pairs) || pairs.length === 0) {
    throw new Error("No word-definition pairs were found.");
  }

  const cleaned = pairs.map((pair) => ({
    word: cleanLine(pair.word),
    definition: cleanLine(pair.definition)
  }));

  const badPair = cleaned.find((pair) => !pair.word || !pair.definition);

  if (badPair) {
    throw new Error("Every pair must have both a word and a definition.");
  }

  return cleaned;
}

/* -----------------------------
   Setup loading and preview
----------------------------- */

/* -----------------------------
   Setup loading and preview
----------------------------- */

function loadPairs(pairs, sourceName) {
  try {
    currentPairs = validatePairs(pairs);
    renderSetupSummary(sourceName);
    elements.startGameButton.disabled = false;
  } catch (error) {
    alert(error.message);
  }
}

function renderSetupSummary(sourceName = "Current setup") {
  if (!currentPairs.length) {
    elements.setupSummary.textContent = "No setup loaded yet.";
    return;
  }

  elements.setupSummary.textContent = `Setup loaded. ${currentPairs.length} words ready.`;
}

/* -----------------------------
   Teacher/Admin Mode
----------------------------- */

elements.loadTeacherButton.addEventListener("click", () => {
  const text = elements.teacherInput.value;
  const pairs = parseTeacherText(text);
  loadPairs(pairs, "Teacher/Admin Mode");
});

function parseTeacherText(text) {
  const lines = text
    .split(/\r?\n/)
    .map(cleanLine)
    .filter(Boolean);

  const pairs = [];

  for (const line of lines) {
    let match = line.match(/^(.+?)\s*=\s*(.+)$/);

    if (!match) {
      match = line.match(/^(.+?)\s*:\s*(.+)$/);
    }

    if (match) {
      pairs.push({
        word: stripListMarker(match[1]),
        definition: stripListMarker(match[2])
      });
    }
  }

  if (!pairs.length) {
    throw new Error("No pairs found. Use WORD = definition, one pair per line.");
  }

  return pairs;
}

/* -----------------------------
   Two-Box Paste Mode
----------------------------- */

elements.loadTwoBoxButton.addEventListener("click", () => {
  const words = splitSimpleList(elements.wordsBox.value);
  const definitions = splitSimpleList(elements.definitionsBox.value);

  if (words.length !== definitions.length) {
    alert(
      `The number of words and definitions does not match.\n\n` +
      `Words: ${words.length}\n` +
      `Definitions: ${definitions.length}`
    );
    return;
  }

  const pairs = words.map((word, index) => ({
    word,
    definition: definitions[index]
  }));

  loadPairs(pairs, "Two-Box Paste Mode");
});

function splitSimpleList(text) {
  return text
    .split(/\r?\n/)
    .map(stripListMarker)
    .filter(Boolean);
}

/* -----------------------------
   PDF Import
----------------------------- */

elements.extractPdfButton.addEventListener("click", async () => {
  const file = elements.pdfFileInput.files[0];

  if (!file) {
    alert("Please choose a PDF file first.");
    return;
  }

  try {
    setStatus("Reading PDF...");

    const rawText = await extractTextFromPDF(file);
    const pairs = parsePDFVocabularyText(rawText);

    loadPairs(pairs, "PDF Import");

    setStatus(
      `Success! Extracted ${pairs.length} word-definition pairs.\n\n` +
      `The game is ready. Click Start Game when you are ready.`
    );
  } catch (error) {
    setStatus(
      error.message +
      "\n\nMake sure the PDF is text-based and has clear Words and Definitions sections.",
      true
    );
  }
});

async function extractTextFromPDF(file) {
  if (!window.pdfjsLib) {
    throw new Error("PDF.js did not load. Check your internet connection.");
  }

  const arrayBuffer = await file.arrayBuffer();
  const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;

  let allText = "";

  for (let pageNumber = 1; pageNumber <= pdf.numPages; pageNumber++) {
    const page = await pdf.getPage(pageNumber);
    const textContent = await page.getTextContent();

    const lines = groupPDFItemsIntoLines(textContent.items);

    allText += `\n--- PAGE ${pageNumber} ---\n`;
    allText += lines.join("\n");
    allText += "\n";
  }

  const cleaned = allText
    .replace(/\u00a0/g, " ")
    .replace(/[ \t]+/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .trim();

  if (!cleaned) {
    throw new Error(
      "No readable text was found in this PDF. It may be a scanned image PDF."
    );
  }

  return cleaned;
}

function groupPDFItemsIntoLines(items) {
  const rows = [];

  for (const item of items) {
    const text = cleanLine(item.str);

    if (!text) continue;

    const transform = item.transform;
    const x = transform[4];
    const y = transform[5];

    let row = rows.find((existingRow) => Math.abs(existingRow.y - y) < 4);

    if (!row) {
      row = { y, parts: [] };
      rows.push(row);
    }

    row.parts.push({ x, text });
  }

  rows.sort((a, b) => b.y - a.y);

  return rows.map((row) => {
    row.parts.sort((a, b) => a.x - b.x);
    return row.parts.map((part) => part.text).join(" ").trim();
  });
}

function parsePDFVocabularyText(text) {
  const lines = text
    .split(/\r?\n/)
    .map(cleanLine)
    .filter((line) => line && !/^--- PAGE \d+ ---$/i.test(line));

  const wordsHeadingIndex = findHeadingIndex(lines, ["word", "words"]);
  const definitionsHeadingIndex = findHeadingIndex(lines, [
    "definition",
    "definitions"
  ]);

  if (wordsHeadingIndex === -1 || definitionsHeadingIndex === -1) {
    throw new Error(
      "No Words and Definitions headings were found. The PDF should contain headings like Words: and Definitions:"
    );
  }

  if (definitionsHeadingIndex < wordsHeadingIndex) {
    throw new Error(
      "The Definitions section was found before the Words section. Please use a PDF with Words first and Definitions second."
    );
  }

  const wordLines = lines.slice(wordsHeadingIndex + 1, definitionsHeadingIndex);
  const definitionLines = lines.slice(definitionsHeadingIndex + 1);

  const words = parsePDFWordSection(wordLines);
  const definitions = parsePDFDefinitionSection(definitionLines);

  if (!words.length) {
    throw new Error("The Words section was found, but no words were extracted.");
  }

  if (!definitions.length) {
    throw new Error(
      "The Definitions section was found, but no definitions were extracted."
    );
  }

  if (words.length !== definitions.length) {
    throw new Error(
      `The number of words and definitions does not match.\n\n` +
      `Words found: ${words.length}\n` +
      `Definitions found: ${definitions.length}\n\n` +
      `Tip: Numbering each word and each definition can help the extractor read the PDF more accurately.`
    );
  }

  return words.map((word, index) => ({
    word,
    definition: definitions[index]
  }));
}

function findHeadingIndex(lines, possibleHeadings) {
  return lines.findIndex((line) => {
    const normalized = line
      .toLowerCase()
      .replace(/[:\-–—]/g, "")
      .replace(/\s+/g, " ")
      .trim();

    return possibleHeadings.includes(normalized);
  });
}

function parsePDFWordSection(lines) {
  const numbered = parseNumberedOrBulletedLines(lines, false);

  return numbered
    .map((line) => stripListMarker(line))
    .map(removeTrailingPunctuationForWord)
    .filter(Boolean);
}

function parsePDFDefinitionSection(lines) {
  return parseNumberedOrBulletedLines(lines, true)
    .map(stripListMarker)
    .filter(Boolean);
}

function parseNumberedOrBulletedLines(lines, allowContinuation) {
  const cleanedLines = lines.map(cleanLine).filter(Boolean);

  const hasNumberedItems = cleanedLines.some((line) =>
    /^\(?\d+\)?[.)]\s+/.test(line)
  );

  const hasBulletedItems = cleanedLines.some((line) =>
    /^[-–—•*]\s+/.test(line)
  );

  if (!allowContinuation) {
    return cleanedLines.map(stripListMarker).filter(Boolean);
  }

  if (!hasNumberedItems && !hasBulletedItems) {
    return cleanedLines.map(stripListMarker).filter(Boolean);
  }

  const items = [];
  let current = "";

  for (const line of cleanedLines) {
    const startsNewNumberedItem = /^\(?\d+\)?[.)]\s+/.test(line);
    const startsNewBulletedItem = /^[-–—•*]\s+/.test(line);

    if (startsNewNumberedItem || startsNewBulletedItem) {
      if (current) items.push(current);
      current = stripListMarker(line);
    } else if (current) {
      current += " " + line;
    } else {
      current = stripListMarker(line);
    }
  }

  if (current) items.push(current);

  return items;
}

function removeTrailingPunctuationForWord(word) {
  return String(word)
    .replace(/[.,;:]$/g, "")
    .trim();
}

/* -----------------------------
   Save library
----------------------------- */

elements.saveSetupButton.addEventListener("click", () => {
  if (!currentPairs.length) {
    alert("Load a setup before saving.");
    return;
  }

  const title =
    cleanLine(elements.setupTitleInput.value) ||
    `Wizard Words Setup ${new Date().toLocaleString()}`;

  const library = getLibrary();

  if (library.length >= MAX_SAVES) {
    alert(`You already have ${MAX_SAVES} saved setups. Delete one before saving another.`);
    return;
  }

  library.push({
    id: crypto.randomUUID ? crypto.randomUUID() : String(Date.now()),
    title,
    createdAt: new Date().toISOString(),
    pairs: currentPairs
  });

  saveLibrary(library);
  elements.setupTitleInput.value = "";
  renderSavedLibrary();

  alert("Setup saved.");
});

elements.refreshLibraryButton.addEventListener("click", renderSavedLibrary);

elements.exportLibraryButton.addEventListener("click", () => {
  const library = getLibrary();
  const blob = new Blob([JSON.stringify(library, null, 2)], {
    type: "application/json"
  });

  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");

  link.href = url;
  link.download = "wizard-words-library.json";
  link.click();

  URL.revokeObjectURL(url);
});

elements.importLibraryInput.addEventListener("change", async () => {
  const file = elements.importLibraryInput.files[0];

  if (!file) return;

  try {
    const text = await file.text();
    const imported = JSON.parse(text);

    if (!Array.isArray(imported)) {
      throw new Error("The JSON file must contain an array of saved setups.");
    }

    const current = getLibrary();
    const combined = [...current];

    for (const setup of imported) {
      if (!setup.title || !Array.isArray(setup.pairs)) continue;
      if (combined.length >= MAX_SAVES) break;

      combined.push({
        id: crypto.randomUUID ? crypto.randomUUID() : String(Date.now() + Math.random()),
        title: cleanLine(setup.title),
        createdAt: setup.createdAt || new Date().toISOString(),
        pairs: validatePairs(setup.pairs)
      });
    }

    saveLibrary(combined);
    renderSavedLibrary();

    alert("Library imported.");
  } catch (error) {
    alert("Import failed: " + error.message);
  } finally {
    elements.importLibraryInput.value = "";
  }
});

function getLibrary() {
  try {
    return JSON.parse(localStorage.getItem(STORAGE_KEY)) || [];
  } catch {
    return [];
  }
}

function saveLibrary(library) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(library));
}

function renderSavedLibrary() {
  const library = getLibrary();

  if (!library.length) {
    elements.savedLibraryList.innerHTML = "<p>No saved setups yet.</p>";
    return;
  }

  elements.savedLibraryList.innerHTML = "";

  library.forEach((setup) => {
    const item = document.createElement("div");
    item.className = "saved-item";

    const left = document.createElement("div");

    left.innerHTML = `
      <div class="saved-item-title">${escapeHTML(setup.title)}</div>
      <div class="saved-item-small">${setup.pairs.length} pairs</div>
    `;

    const actions = document.createElement("div");

    const loadButton = document.createElement("button");
    loadButton.textContent = "Load";
    loadButton.addEventListener("click", () => {
      loadPairs(setup.pairs, `Saved Setup: ${setup.title}`);
    });

    const deleteButton = document.createElement("button");
    deleteButton.textContent = "Delete";
    deleteButton.addEventListener("click", () => {
      const confirmed = confirm(`Delete "${setup.title}"?`);
      if (!confirmed) return;

      const updated = getLibrary().filter((item) => item.id !== setup.id);
      saveLibrary(updated);
      renderSavedLibrary();
    });

    actions.append(loadButton, deleteButton);
    item.append(left, actions);

    elements.savedLibraryList.appendChild(item);
  });
}

/* -----------------------------
   Game rendering
----------------------------- */

elements.startGameButton.addEventListener("click", startGame);
elements.leaveGameButton.addEventListener("click", leaveGame);
elements.modalLeaveButton.addEventListener("click", leaveGame);
elements.newRoundButton.addEventListener("click", () => {
  // Stop the confetti when the user chooses to start a new round
  stopConfetti();
  elements.completionModal.classList.add("hidden");
  startGame();
});

elements.newGameButton.addEventListener("click", newGame);

function newGame() {
  elements.completionModal.classList.add("hidden");

  // Hide the game UI and stop any confetti
  leaveGame();

  // Clear the current round state and rendered definitions
  currentRound = [];
  elements.definitionList.innerHTML = "";

  // Bring user to the setup area so they can load a new setup
  const previewCard = document.getElementById("previewCard");
  if (previewCard) {
    previewCard.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  // Clear any selected PDF file so the same file can be chosen again
  try {
    elements.pdfFileInput.value = "";
    elements.pdfStatus.textContent = "";
  } catch (e) {
    // ignore if inputs are not present
  }

  // Ensure Start Game button reflects whether a setup is loaded
  elements.startGameButton.disabled = !currentPairs.length;
}

function startGame() {
  if (!currentPairs.length) {
    alert("Load a setup first.");
    return;
  }

  currentRound = shuffleArray(currentPairs);

  renderWordBank();
  renderDefinitions();

  elements.gameSection.classList.remove("hidden");
  elements.completionModal.classList.add("hidden");

  window.scrollTo({
    top: elements.gameSection.offsetTop - 12,
    behavior: "smooth"
  });
}

function leaveGame() {
  elements.gameSection.classList.add("hidden");
  elements.completionModal.classList.add("hidden");
  stopConfetti();
}

function renderWordBank() {
  // Show the word bank in alphabetical order (A → Z). Definitions remain randomized.
  const words = currentPairs
    .map((pair) => pair.word)
    .slice()
    .sort((a, b) => normalizeAnswer(a).localeCompare(normalizeAnswer(b)));

  elements.wordBank.innerHTML = "";

  words.forEach((word) => {
    const chip = document.createElement("span");
    chip.className = "word-chip";
    chip.textContent = word;
    chip.dataset.normalized = normalizeAnswer(word);
    elements.wordBank.appendChild(chip);
  });

  // Adjust layout based on number of words: add classes to the word-bank-box
  const container = elements.wordBank.parentElement; // .word-bank-box
  if (container) {
    container.classList.remove("many-words", "very-many-words");

    const count = words.length;
    if (count > 50) {
      container.classList.add("very-many-words");
    } else if (count > 25) {
      container.classList.add("many-words");
    }
  }
}

function markWordUsed(word) {
  const normalized = normalizeAnswer(word);
  const chips = [...elements.wordBank.querySelectorAll(".word-chip")];

  chips.forEach((chip) => {
    if (chip.dataset.normalized === normalized) {
      chip.classList.add("used");
    }
  });
}

function renderDefinitions() {
  elements.definitionList.innerHTML = "";

  currentRound.forEach((pair, index) => {
    const item = document.createElement("div");
    item.className = "definition-item";

    const definition = document.createElement("div");
    definition.className = "definition-text";
    definition.textContent = `${index + 1}. ${pair.definition}`;

    const answerRow = document.createElement("div");
    answerRow.className = "answer-row";

    const input = document.createElement("input");
    input.className = "answer-input";
    input.type = "text";
    input.placeholder = "Type the matching word";
    input.autocomplete = "off";

    const checkButton = document.createElement("button");
    checkButton.textContent = "Check";

    const feedback = document.createElement("span");
    feedback.className = "feedback";

    function checkAnswer() {
      const userAnswer = normalizeAnswer(input.value);
      const correctAnswer = normalizeAnswer(pair.word);

      if (userAnswer === correctAnswer) {
        feedback.textContent = "✓ Correct";
        feedback.className = "feedback correct";
        input.disabled = true;
        checkButton.disabled = true;
        item.dataset.correct = "true";

        markWordUsed(pair.word);

        checkCompletion();
      } else {
        feedback.textContent = "Try again";
        feedback.className = "feedback wrong";
      }
    }

    checkButton.addEventListener("click", checkAnswer);

    input.addEventListener("keydown", (event) => {
      if (event.key === "Enter") {
        checkAnswer();
      }
    });

    answerRow.append(input, checkButton, feedback);
    item.append(definition, answerRow);

    elements.definitionList.appendChild(item);
  });
}

function checkCompletion() {
  const items = [...document.querySelectorAll(".definition-item")];
  const allCorrect = items.every((item) => item.dataset.correct === "true");

  if (allCorrect) {
    startConfetti();
    elements.completionModal.classList.remove("hidden");
  }
}

/* -----------------------------
   Answer sheet
----------------------------- */

elements.answerSheetButton.addEventListener("click", () => {
  stopConfetti();
  createAnswerSheet();
});

function createAnswerSheet() {
  if (!currentPairs.length) return;

  const rows = currentPairs
    .map((pair, index) => {
      return `
        <tr>
          <td>${index + 1}</td>
          <td><strong>${escapeHTML(pair.word)}</strong></td>
          <td>${escapeHTML(pair.definition)}</td>
        </tr>
      `;
    })
    .join("");

  const printWindow = window.open("", "_blank");

  printWindow.document.write(`
    <!DOCTYPE html>
    <html>
    <head>
      <title>Wizard Words Answer Sheet</title>
      <style>
        body {
          font-family: Arial, Helvetica, sans-serif;
          padding: 30px;
          color: #222;
        }

        h1 {
          text-align: center;
        }

        table {
          width: 100%;
          border-collapse: collapse;
          margin-top: 24px;
        }

        th, td {
          border: 1px solid #333;
          padding: 8px;
          text-align: left;
          vertical-align: top;
        }

        th {
          background: #eee;
        }
      </style>
    </head>

    <body>
      <h1>Wizard Words Answer Sheet</h1>

      <table>
        <thead>
          <tr>
            <th>#</th>
            <th>Word</th>
            <th>Definition</th>
          </tr>
        </thead>

        <tbody>
          ${rows}
        </tbody>
      </table>

      <script>
        window.onload = function () {
          window.print();
        };
      <\/script>
    </body>
    </html>
  `);

  printWindow.document.close();
}

/* -----------------------------
   Confetti
----------------------------- */
let confettiInterval = null;

function startConfetti() {
  // Stop any existing confetti interval
  stopConfetti();

  // Use canvas-confetti library (global `confetti`) to launch colourful bursts repeatedly
  confettiInterval = setInterval(() => {
    if (window.confetti) {
      confetti({
        particleCount: 80,
        spread: 80,
        origin: { y: 0.6 },
        colors: ["#ff4757", "#ff7f50", "#ffa502", "#2ed573", "#1e90ff", "#5352ed", "#e84393", "#a55eea"]
      });
    }
  }, 700);
}

function stopConfetti() {
  if (confettiInterval) {
    clearInterval(confettiInterval);
    confettiInterval = null;
  }
}