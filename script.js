const textInput = document.querySelector('#textInput');
const enterButton = document.querySelector('#enterButton');
const clearButton = document.querySelector('#clearButton');
const wordsContainer = document.querySelector('#wordsContainer');
const clearViewButton = document.querySelector('#clearViewButton');
const startSessionButton = document.querySelector('#startSessionButton');
const stopSessionButton = document.querySelector('#stopSessionButton');
const sessionStatus = document.querySelector('#sessionStatus');
const supportMessage = document.querySelector('#supportMessage');
const recognizedOutput = document.querySelector('#recognizedOutput');

const idleRecognizedMessage = 'Say the sentence once listening starts.';
const readyRecognizedMessage = 'Press “Start Listening” and repeat the sentence.';

const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;

let recognition = null;
let targetWords = [];
let shouldResetOnNextResult = false;
let isListening = false;

function normalizeWords(rawText) {
  return rawText
    .split(/\s+/)
    .map(word => word.replace(/[^a-zA-Z0-9]+/g, '').toLowerCase())
    .filter(Boolean);
}

function createWordChip(word, index) {
  const chip = document.createElement('span');
  chip.className = 'word-chip';
  const wordId = index + 1;
  chip.id = `word-${wordId}`;
  chip.dataset.index = String(index);
  chip.dataset.wordId = String(wordId);
  chip.textContent = word;
  chip.setAttribute('role', 'listitem');
  return chip;
}

function renderWordCards(words) {
  wordsContainer.innerHTML = '';
  words.forEach((word, index) => {
    wordsContainer.appendChild(createWordChip(word, index));
  });
}

function resetWordHighlights() {
  wordsContainer.querySelectorAll('.word-chip').forEach(chip => {
    chip.classList.remove('word-match', 'word-mismatch');
  });
}

function applyWordHighlights(recognizedWords) {
  const chips = wordsContainer.querySelectorAll('.word-chip');
  const {
    expectedStatuses,
    recognizedMatches
  } = computeWordStatuses(targetWords, recognizedWords);

  chips.forEach((chip, index) => {
    chip.classList.remove('word-match', 'word-mismatch');
    const status = expectedStatuses[index];
    if (status === 'match') {
      chip.classList.add('word-match');
    } else if (status === 'mismatch') {
      chip.classList.add('word-mismatch');
    }
  });

  updateRecognizedWordTokens(recognizedWords, recognizedMatches);
}

function updateRecognizedWordTokens(recognizedWords, recognizedMatches) {
  const tokens = recognizedOutput.querySelectorAll('.recognized-word');
  if (!tokens.length) {
    return;
  }

  tokens.forEach((token, index) => {
    const match = recognizedMatches[index] || { expectedIndex: null, status: 'unmatched' };
    const baseWordId = index + 1;
    token.classList.remove('recognized-word-match', 'recognized-word-mismatch', 'recognized-word-extra');

    if (match.expectedIndex !== null && typeof match.expectedIndex === 'number') {
      const targetWordId = match.expectedIndex + 1;
      token.dataset.wordId = String(targetWordId);
      token.dataset.targetWordId = `word-${targetWordId}`;

      if (match.status === 'match') {
        token.classList.add('recognized-word-match');
        token.id = `word-${targetWordId}`;
      } else {
        token.classList.add('recognized-word-mismatch');
        token.id = `recognized-word-${targetWordId}`;
      }
      return;
    }

    token.dataset.wordId = String(baseWordId);
    token.dataset.targetWordId = '';
    token.classList.add('recognized-word-extra');
    token.id = `recognized-extra-${baseWordId}`;
  });
}

function computeWordStatuses(expectedWords, recognizedWords) {
  const expectedLength = expectedWords.length;
  const recognizedLength = recognizedWords.length;
  if (!expectedLength) {
    return {
      expectedStatuses: [],
      recognizedMatches: recognizedWords.map(() => ({
        expectedIndex: null,
        status: 'unmatched'
      }))
    };
  }

  const dp = Array.from({ length: expectedLength + 1 }, () =>
    Array(recognizedLength + 1).fill(null)
  );

  dp[0][0] = { cost: 0, prev: null, op: null };
  for (let i = 1; i <= expectedLength; i += 1) {
    dp[i][0] = { cost: i, prev: [i - 1, 0], op: 'delete' };
  }
  for (let j = 1; j <= recognizedLength; j += 1) {
    dp[0][j] = { cost: j, prev: [0, j - 1], op: 'insert' };
  }

  const operationPriority = {
    match: 3,
    substitute: 2,
    delete: 1,
    insert: 0
  };

  for (let i = 1; i <= expectedLength; i += 1) {
    for (let j = 1; j <= recognizedLength; j += 1) {
      const expectedWord = expectedWords[i - 1];
      const recognizedWord = recognizedWords[j - 1];

      const diagonalCost =
        dp[i - 1][j - 1].cost + (expectedWord === recognizedWord ? 0 : 1);
      const deleteCost = dp[i - 1][j].cost + 1;
      const insertCost = dp[i][j - 1].cost + 1;

      const options = [
        {
          cost: diagonalCost,
          op: expectedWord === recognizedWord ? 'match' : 'substitute',
          prev: [i - 1, j - 1]
        },
        { cost: deleteCost, op: 'delete', prev: [i - 1, j] },
        { cost: insertCost, op: 'insert', prev: [i, j - 1] }
      ];

      options.sort((a, b) => {
        if (a.cost !== b.cost) {
          return a.cost - b.cost;
        }
        return operationPriority[b.op] - operationPriority[a.op];
      });

      dp[i][j] = options[0];
    }
  }

  const statuses = new Array(expectedLength).fill('mismatch');
  const recognizedMatches = new Array(recognizedLength).fill(null);
  let i = expectedLength;
  let j = recognizedLength;

  while (i > 0 || j > 0) {
    const cell = dp[i][j];
    if (!cell) {
      break;
    }

    const { op, prev } = cell;
    if (op === 'match') {
      statuses[i - 1] = 'match';
      recognizedMatches[j - 1] = { expectedIndex: i - 1, status: 'match' };
      i -= 1;
      j -= 1;
    } else if (op === 'substitute') {
      statuses[i - 1] = 'mismatch';
      recognizedMatches[j - 1] = { expectedIndex: i - 1, status: 'mismatch' };
      i -= 1;
      j -= 1;
    } else if (op === 'delete') {
      statuses[i - 1] = 'mismatch';
      i -= 1;
    } else if (op === 'insert') {
      recognizedMatches[j - 1] = { expectedIndex: null, status: 'insert' };
      j -= 1;
    } else {
      break;
    }

    if (!prev) {
      break;
    }
  }

  return {
    expectedStatuses: statuses,
    recognizedMatches: recognizedMatches.map(match => {
      if (match) {
        return match;
      }
      return { expectedIndex: null, status: 'unmatched' };
    })
  };
}

function updateSessionStatus(label, variant = 'status-idle') {
  const allowedVariants = new Set([
    'status-idle',
    'status-ready',
    'status-listening',
    'status-error',
    'status-complete'
  ]);

  const appliedVariant = allowedVariants.has(variant) ? variant : 'status-idle';
  sessionStatus.textContent = `Status: ${label}`;
  sessionStatus.className = `status-indicator ${appliedVariant}`;
}

function setListeningState(listening) {
  isListening = listening;
  startSessionButton.disabled = listening;
  stopSessionButton.disabled = !listening;
}

function setRecognizedMessage(message, withWordIds = false) {
  if (!withWordIds) {
    recognizedOutput.textContent = message;
    return;
  }

  const words = normalizeWords(message);
  recognizedOutput.innerHTML = '';

  if (!words.length) {
    recognizedOutput.textContent = message;
    return;
  }

  words.forEach((word, index) => {
    const wordId = index + 1;
    const token = document.createElement('span');
    token.className = 'recognized-word';
    token.id = `recognized-word-${wordId}`;
    token.dataset.wordId = String(wordId);
    token.dataset.index = String(index);
    token.textContent = word;
    recognizedOutput.appendChild(token);
    if (index < words.length - 1) {
      recognizedOutput.appendChild(document.createTextNode(' '));
    }
  });
}

function addTextToView() {
  stopListening();

  const rawText = textInput.value.trim();
  if (!rawText) {
    return;
  }

  const words = normalizeWords(rawText);
  if (!words.length) {
    updateSessionStatus('Add text to practice first.', 'status-error');
    setRecognizedMessage(idleRecognizedMessage);
    return;
  }

  targetWords = words;
  shouldResetOnNextResult = false;
  renderWordCards(targetWords);
  resetWordHighlights();
  setRecognizedMessage(readyRecognizedMessage);
  updateSessionStatus('Ready', 'status-ready');
}

function clearSidebarInput() {
  textInput.value = '';
  textInput.focus();
}

function stopListening() {
  if (!recognition || !isListening) {
    return;
  }

  recognition.stop();
  setListeningState(false);
  shouldResetOnNextResult = false;
  updateSessionStatus('Ready', 'status-ready');
}

function clearTextView() {
  stopListening();
  targetWords = [];
  shouldResetOnNextResult = false;
  wordsContainer.innerHTML = '';
  resetWordHighlights();
  setRecognizedMessage(idleRecognizedMessage);
  updateSessionStatus('Idle', 'status-idle');
}

function handleRecognitionResult(event) {
  const results = Array.from(event.results);
  const resultIndex = event.resultIndex ?? results.length - 1;
  const result = results[resultIndex];

  if (!result) {
    return;
  }

  const currentTranscript = (result[0] && result[0].transcript ? result[0].transcript : '').trim();
  const aggregateTranscript = results
    .map(res => (res[0] && res[0].transcript ? res[0].transcript : ''))
    .join(' ')
    .trim();

  if (result.isFinal === false) {
    const interimTranscript = aggregateTranscript || currentTranscript;
    if (interimTranscript) {
      const interimMessage = interimTranscript.toLowerCase();
      setRecognizedMessage(interimMessage, true);
      const interimWords = normalizeWords(interimMessage);
      if (interimWords.length && targetWords.length) {
        const { recognizedMatches } = computeWordStatuses(targetWords, interimWords);
        updateRecognizedWordTokens(interimWords, recognizedMatches);
      }
    } else {
      setRecognizedMessage('Listening…');
    }
    updateSessionStatus('Listening…', 'status-listening');
    return;
  }

  if (shouldResetOnNextResult) {
    resetWordHighlights();
    shouldResetOnNextResult = false;
  }

  const finalTranscript = results
    .filter(res => res.isFinal)
    .map(res => (res[0] && res[0].transcript ? res[0].transcript : ''))
    .join(' ')
    .trim();

  if (!finalTranscript) {
    setRecognizedMessage('No speech detected. Try again.');
    updateSessionStatus(isListening ? 'Listening…' : 'Ready', isListening ? 'status-listening' : 'status-ready');
    return;
  }

  setRecognizedMessage(finalTranscript.toLowerCase(), true);
  const recognizedWords = normalizeWords(finalTranscript);
  if (!recognizedWords.length || !targetWords.length) {
    updateSessionStatus(isListening ? 'Listening…' : 'Ready', isListening ? 'status-listening' : 'status-ready');
    return;
  }

  applyWordHighlights(recognizedWords);
  updateSessionStatus(isListening ? 'Listening…' : 'Ready', isListening ? 'status-listening' : 'status-ready');
}

function handleRecognitionEnd() {
  if (isListening) {
    updateSessionStatus('Listening…', 'status-listening');
    shouldResetOnNextResult = true;
    if (!recognition) {
      return;
    }
    setTimeout(() => {
      try {
        recognition.start();
      } catch (error) {
        if (error.name !== 'InvalidStateError') {
          handleRecognitionError({ error: error.name || error.message });
        }
      }
    }, 250);
    return;
  }

  setListeningState(false);
  updateSessionStatus('Ready', 'status-ready');
}

function handleRecognitionError(event) {
  const errorKey = String(event.error || 'unknown').toLowerCase();

  if (errorKey === 'no-speech') {
    setRecognizedMessage('No speech detected. Still listening…');
    updateSessionStatus('Listening…', 'status-listening');
    return;
  }

  if (errorKey === 'aborted') {
    return;
  }

  let message = 'Speech recognition error. Please try again.';

  if (errorKey === 'not-allowed' || errorKey === 'notallowederror') {
    message = 'Microphone access was denied.';
  } else if (errorKey === 'audio-capture' || errorKey === 'notfounderror') {
    message = 'No microphone was found.';
  }

  setRecognizedMessage(message);
  updateSessionStatus('Error', 'status-error');
  setListeningState(false);
}

function startListening() {
  if (!recognition) {
    return;
  }

  if (!targetWords.length) {
    updateSessionStatus('Add text to practice first.', 'status-error');
    textInput.focus();
    return;
  }

  if (isListening) {
    return;
  }

  shouldResetOnNextResult = false;
  resetWordHighlights();
  setRecognizedMessage('Listening…');
  updateSessionStatus('Listening…', 'status-listening');
  setListeningState(true);

  try {
    recognition.start();
  } catch (error) {
    if (error.name === 'InvalidStateError') {
      // Ignore invalid state errors when recognition is already running.
      return;
    }
    handleRecognitionError({ error: error.name || error.message });
  }
}

function initializeSpeechRecognition() {
  if (!SpeechRecognition) {
    supportMessage.hidden = false;
    startSessionButton.disabled = true;
    stopSessionButton.disabled = true;
    updateSessionStatus('Unsupported in this browser', 'status-error');
    return;
  }

  recognition = new SpeechRecognition();
  recognition.lang = navigator.language || 'en-US';
  recognition.interimResults = true;
  recognition.maxAlternatives = 1;
  recognition.continuous = true;

  recognition.addEventListener('result', handleRecognitionResult);
  recognition.addEventListener('end', handleRecognitionEnd);
  recognition.addEventListener('error', handleRecognitionError);
}

enterButton.addEventListener('click', addTextToView);
clearButton.addEventListener('click', clearSidebarInput);
clearViewButton.addEventListener('click', clearTextView);
startSessionButton.addEventListener('click', startListening);
stopSessionButton.addEventListener('click', stopListening);

textInput.addEventListener('keydown', event => {
  if (event.key === 'Enter' && (event.metaKey || event.ctrlKey)) {
    event.preventDefault();
    addTextToView();
  }
});

initializeSpeechRecognition();
setRecognizedMessage(idleRecognizedMessage);
updateSessionStatus('Idle', 'status-idle');
