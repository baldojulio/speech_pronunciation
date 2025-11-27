"use strict";

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
const localeSelect = document.querySelector('#localeSelect');
const sessionSummary = document.querySelector('#sessionSummary');

// Optional "skip word" control (may or may not exist in the DOM)
const skipWordButton = document.querySelector('#skipWordButton');

const idleRecognizedMessage = 'Say the sentence once listening starts.';
const readyRecognizedMessage = 'Press "Start Listening" and repeat the sentence.';

// Debug flag - set to true to enable console logging
const DEBUG = false;

const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;

// localStorage keys
const STORAGE_KEY_TEXT = 'speechPronunciation_text';
const STORAGE_KEY_LOCALE = 'speechPronunciation_locale';

let recognition = null;
let targetWords = [];        // Normalized target words for comparison
let displayWords = [];       // Original words for display
let isListening = false;
let currentMatchIndex = 0;   // Track the furthest matched position
let rawTranscript = '';      // Store raw transcript for display
let silenceTimer = null;     // Timer for detecting long silences
const SILENCE_TIMEOUT = 10000; // 10 seconds of silence before prompting
const skippedIndices = new Set(); // Track target word indices explicitly skipped by the user
let lastRecognizedWords = []; // Cache last normalized recognition result for re-rendering (e.g., after skip)

/**
 * Debug logging helper
 */
const debugLog = (...args) => {
  if (DEBUG) {
    console.log(...args);
  }
};

/**
 * Simple debounce helper to limit high-frequency DOM updates
 */
const debounce = (fn, delay = 100) => {
  let timeout;
  return (...args) => {
    clearTimeout(timeout);
    timeout = setTimeout(() => fn(...args), delay);
  };
};

// Queue for recognition rendering to avoid excessive DOM churn
let pendingRecognition = null;
const renderRecognition = debounce(() => {
  if (!pendingRecognition) return;

  const { recognizedWords } = pendingRecognition;
  pendingRecognition = null;

  updateSessionStatus('Listening…', 'status-listening');

  if (!recognizedWords.length) {
    setRecognizedMessage('Listening…');
    return;
  }

  if (recognizedWords.length && targetWords.length) {
    applyWordHighlights(recognizedWords);
  } else {
    // Fall back to raw transcript for readability when no targets
    setRecognizedMessage(rawTranscript || recognizedWords.join(' '));
  }
}, 100);

/**
 * Normalize a single word for comparison (lowercase, remove punctuation)
 * Uses Unicode-aware regex to support international characters
 */
const normalizeWord = word => {
  // Remove non-letter/non-number characters, keeping Unicode letters
  return word.replace(/[^\p{L}\p{N}]/gu, '').toLocaleLowerCase();
};

/**
 * Split text into words, preserving original form and creating normalized version
 */
const parseText = rawText => {
  const words = rawText.trim().split(/\s+/).filter(Boolean);
  return words.map(word => ({
    original: word,
    normalized: normalizeWord(word)
  }));
};

/**
 * Normalize raw text into array of lowercase words for comparison
 */
const normalizeWords = rawText => {
  return rawText
    .trim()
    .split(/\s+/)
    .map(word => normalizeWord(word))
    .filter(Boolean);
};

/**
 * Create a word chip element for display
 */
const createWordChip = (wordData, index) => {
  const chip = document.createElement('span');
  chip.className = 'word-chip';
  chip.id = `word-${index}`;
  chip.dataset.index = String(index);
  chip.dataset.normalized = wordData.normalized;
  chip.textContent = wordData.original;
  chip.setAttribute('role', 'listitem');
  return chip;
};

/**
 * Render word chips in the container
 */
const renderWordCards = words => {
  wordsContainer.innerHTML = '';
  words.forEach((wordData, index) => {
    wordsContainer.appendChild(createWordChip(wordData, index));
  });
};

/**
 * Reset all word highlights to default state
 */
const resetWordHighlights = () => {
  wordsContainer.querySelectorAll('.word-chip').forEach(chip => {
    chip.classList.remove('word-match', 'word-mismatch', 'word-current');
  });
};

/**
 * Word matching algorithm with strict sequential alignment.
 * - You can only advance to the next target word if the
 *   current word was pronounced correctly OR explicitly skipped.
 * - Any spoken word while the current word is incorrect is
 *   treated as another attempt for that same position.
 */
const matchWords = (targetWords, recognizedWords) => {
  const n = targetWords.length;
  const m = recognizedWords.length;

  const targetMatched = new Array(n).fill(false);
  const recognizedMatched = new Array(m).fill(null);

  // No target text: treat all recognized words as extra
  if (n === 0) {
    for (let i = 0; i < m; i++) {
      recognizedMatched[i] = { targetIndex: null, status: 'extra' };
    }
    return { targetMatched, recognizedMatched, furthestMatch: -1 };
  }

  // Target exists but nothing recognized yet: nothing attempted
  if (m === 0) {
    return { targetMatched, recognizedMatched, furthestMatch: -1 };
  }

  let furthestMatch = -1;

  // Helper: has this target index been "completed" already?
  // A word is completed if it was matched in this pass, or
  // the user explicitly skipped it.
  const isCompleted = index => skippedIndices.has(index) || targetMatched[index];

  let currentTargetIndex = 0;

  for (let i = 0; i < m; i++) {
    // Move to the next unfinished target index
    while (currentTargetIndex < n && isCompleted(currentTargetIndex)) {
      furthestMatch = Math.max(furthestMatch, currentTargetIndex);
      currentTargetIndex++;
    }

    // All target words completed – remaining recognitions are extras
    if (currentTargetIndex >= n) {
      recognizedMatched[i] = { targetIndex: null, status: 'extra' };
      continue;
    }

    const spoken = recognizedWords[i];
    const expected = targetWords[currentTargetIndex];

    if (spoken === expected) {
      // Correct pronunciation for the current target word
      targetMatched[currentTargetIndex] = true;
      recognizedMatched[i] = { targetIndex: currentTargetIndex, status: 'match' };
      furthestMatch = Math.max(furthestMatch, currentTargetIndex);
      currentTargetIndex++;
    } else {
      // Mismatch – stay on the same target index.
      // Further words will continue to be attempts for this same word
      // until it is either pronounced correctly or skipped.
      recognizedMatched[i] = { targetIndex: currentTargetIndex, status: 'mismatch' };
    }
  }

  // Ensure furthestMatch also includes any skipped indices beyond
  // the last explicitly matched word.
  skippedIndices.forEach(index => {
    if (index >= 0 && index < n) {
      furthestMatch = Math.max(furthestMatch, index);
    }
  });

  return { targetMatched, recognizedMatched, furthestMatch };
};

/**
 * Apply highlights to word chips based on recognition results
 */
const applyWordHighlights = recognizedWords => {
  if (!targetWords.length) return;

  debugLog('--- Recognition Update ---');
  debugLog('Target words:', targetWords);
  debugLog('Recognized words:', recognizedWords);

  const { targetMatched, recognizedMatched, furthestMatch } = matchWords(targetWords, recognizedWords);

  // Cache the last recognized words so we can re-run highlighting
  // when the user skips a word without needing a new recognition event.
  lastRecognizedWords = [...recognizedWords];

  // Update the current match index for progress tracking
  currentMatchIndex = furthestMatch;

  debugLog('Target matched:', targetMatched);
  debugLog('Recognized matched:', recognizedMatched);
  debugLog('Furthest match:', furthestMatch);

  // Highlight target words
  const chips = wordsContainer.querySelectorAll('.word-chip');
  chips.forEach((chip, index) => {
    chip.classList.remove('word-match', 'word-mismatch', 'word-current');

    if (targetMatched[index]) {
      chip.classList.add('word-match');
    } else if (index <= furthestMatch && recognizedWords.length > 0) {
      // Only mark as mismatch if we've passed this word (it was skipped)
      chip.classList.add('word-mismatch');
    } else if (index === furthestMatch + 1) {
      // Highlight the next expected word
      chip.classList.add('word-current');
    }
    // Words beyond furthestMatch+1 remain neutral (not yet evaluated)
  });

  // Update recognized output with highlighting
  updateRecognizedDisplay(recognizedWords, recognizedMatched);

  // Update session summary
  updateSessionSummary(targetMatched, recognizedWords.length);
};

/**
 * Update the recognized output display with word tokens
 * Shows the raw transcript for readability
 */
const updateRecognizedDisplay = (recognizedWords, recognizedMatched) => {
  recognizedOutput.innerHTML = '';

  if (!recognizedWords.length) {
    recognizedOutput.textContent = 'Listening…';
    return;
  }

  // Show raw transcript if available, otherwise show normalized words
  if (rawTranscript) {
    const rawWords = rawTranscript.trim().split(/\s+/);
    rawWords.forEach((word, index) => {
      const token = document.createElement('span');
      token.className = 'recognized-word';
      token.textContent = word;

      // Map to the corresponding normalized word match status
      if (index < recognizedMatched.length) {
        const match = recognizedMatched[index];
        if (match) {
          if (match.status === 'match') {
            token.classList.add('recognized-word-match');
            if (match.targetIndex !== null && match.targetIndex !== undefined) {
              token.dataset.targetIndex = String(match.targetIndex);
            }
          } else if (match.status === 'mismatch') {
            token.classList.add('recognized-word-mismatch');
          } else {
            token.classList.add('recognized-word-extra');
          }
        }
      }

      recognizedOutput.appendChild(token);

      if (index < rawWords.length - 1) {
        recognizedOutput.appendChild(document.createTextNode(' '));
      }
    });
  } else {
    recognizedWords.forEach((word, index) => {
      const token = document.createElement('span');
      token.className = 'recognized-word';
      token.textContent = word;

      const match = recognizedMatched[index];
      if (match) {
        if (match.status === 'match') {
          token.classList.add('recognized-word-match');
          if (match.targetIndex !== null && match.targetIndex !== undefined) {
            token.dataset.targetIndex = String(match.targetIndex);
          }
        } else if (match.status === 'mismatch') {
          token.classList.add('recognized-word-mismatch');
        } else {
          token.classList.add('recognized-word-extra');
        }
      }

      recognizedOutput.appendChild(token);

      if (index < recognizedWords.length - 1) {
        recognizedOutput.appendChild(document.createTextNode(' '));
      }
    });
  }
};

/**
 * Update session summary with match statistics
 */
const updateSessionSummary = (targetMatched, recognizedCount) => {
  if (!sessionSummary) return;

  const totalTarget = targetMatched.length;
  const matchedCount = targetMatched.filter(Boolean).length;
  const percent = totalTarget > 0 ? Math.round((matchedCount / totalTarget) * 100) : 0;

  sessionSummary.innerHTML = `
    <span class="summary-stat">Progress: <strong>${matchedCount}/${totalTarget}</strong> words (${percent}%)</span>
  `;
  sessionSummary.hidden = false;

  // Check if session is complete
  if (matchedCount === totalTarget && totalTarget > 0) {
    showSessionComplete(matchedCount, totalTarget);
  }
};

/**
 * Show session complete state
 */
const showSessionComplete = (matched, total) => {
  updateSessionStatus('Complete! 🎉', 'status-complete');

  if (sessionSummary) {
    sessionSummary.innerHTML = `
      <span class="summary-stat summary-complete">✓ All ${total} words matched!</span>
    `;
  }
};

/**
 * Reset session summary
 */
const resetSessionSummary = () => {
  if (sessionSummary) {
    sessionSummary.innerHTML = '';
    sessionSummary.hidden = true;
  }
};

/**
 * Update session status display
 */
const updateSessionStatus = (label, variant = 'status-idle') => {
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
};

/**
 * Update button states based on listening state
 */
const setListeningState = listening => {
  isListening = listening;
  startSessionButton.disabled = listening;
  stopSessionButton.disabled = !listening;
};

/**
 * Set a simple text message in recognized output
 */
const setRecognizedMessage = message => {
  recognizedOutput.textContent = message;
};

/**
 * Add text from input to the view
 */
const addTextToView = () => {
  stopListening();

  const rawText = textInput.value.trim();
  if (!rawText) {
    updateSessionStatus('Enter some text first', 'status-error');
    return;
  }

  const parsedWords = parseText(rawText);
  if (!parsedWords.length) {
    updateSessionStatus('No valid words found', 'status-error');
    setRecognizedMessage(idleRecognizedMessage);
    return;
  }

  // Filter out empty normalized words
  const validWords = parsedWords.filter(w => w.normalized.length > 0);
  if (!validWords.length) {
    updateSessionStatus('No valid words found', 'status-error');
    return;
  }

  displayWords = validWords;
  targetWords = validWords.map(w => w.normalized);

  renderWordCards(displayWords);
  resetWordHighlights();
  setRecognizedMessage(readyRecognizedMessage);
  updateSessionStatus('Ready', 'status-ready');
  resetSessionSummary();
  currentMatchIndex = -1;
  rawTranscript = '';

  // Save to localStorage
  saveToStorage();
};

/**
 * Clear the sidebar input
 */
const clearSidebarInput = () => {
  textInput.value = '';
  textInput.focus();
};

/**
 * Stop speech recognition
 */
const stopListening = () => {
  if (!recognition) return;

  isListening = false; // Set this first to prevent restart in handleRecognitionEnd
  clearSilenceTimer();

  try {
    recognition.stop();
  } catch (e) {
    // Ignore errors when stopping
  }

  setListeningState(false);

  // Show final summary if we have results
  if (targetWords.length > 0 && currentMatchIndex >= 0) {
    const matchedCount = wordsContainer.querySelectorAll('.word-match').length;
    const total = targetWords.length;
    if (matchedCount === total) {
      updateSessionStatus('Complete! 🎉', 'status-complete');
    } else {
      updateSessionStatus(`Stopped - ${matchedCount}/${total} matched`, 'status-ready');
    }
  } else if (targetWords.length) {
    updateSessionStatus('Ready', 'status-ready');
  } else {
    updateSessionStatus('Idle', 'status-idle');
  }
};

/**
 * Clear the text view
 */
const clearTextView = () => {
  stopListening();
  targetWords = [];
  displayWords = [];
  currentMatchIndex = -1;
  skippedIndices.clear();
  rawTranscript = '';
  wordsContainer.innerHTML = '';
  setRecognizedMessage(idleRecognizedMessage);
  updateSessionStatus('Idle', 'status-idle');
  resetSessionSummary();
};

/**
 * Handle speech recognition results
 * Processes results efficiently using event.resultIndex
 */
const handleRecognitionResult = event => {
  if (!isListening) return;

  // Reset silence timer on any speech
  resetSilenceTimer();

  // Build transcript from all results
  let fullTranscript = '';
  let hasFinalResult = false;

  for (let i = 0; i < event.results.length; i++) {
    const result = event.results[i];
    const transcript = result[0]?.transcript || '';
    fullTranscript += transcript + ' ';

    if (result.isFinal) {
      hasFinalResult = true;
    }
  }

  fullTranscript = fullTranscript.trim();
  rawTranscript = fullTranscript; // Store raw for display

  if (!fullTranscript) {
    setRecognizedMessage('Listening…');
    return;
  }

  // Normalize and match words
  const recognizedWords = normalizeWords(fullTranscript);

  pendingRecognition = { recognizedWords: [...recognizedWords] };
  renderRecognition();
};

/**
 * Skip the current target word and move on to the next one.
 * This does NOT count as a correct match in the summary,
 * but it allows progressing when a word is too difficult.
 */
const skipCurrentWord = () => {
  if (!targetWords.length) {
    return;
  }

  // The "current" word is always the next index after the last
  // completed word (matched or skipped).
  const nextIndex = currentMatchIndex + 1;

  if (nextIndex < 0 || nextIndex >= targetWords.length) {
    return;
  }

  skippedIndices.add(nextIndex);

  // Re-run highlighting based on the last recognition data so the
  // UI moves on to the next word immediately.
  if (lastRecognizedWords.length) {
    applyWordHighlights(lastRecognizedWords);
  } else {
    // No recognition yet; force a basic visual update so the
    // "current" marker advances.
    applyWordHighlights([]);
  }
};

/**
 * Reset the silence detection timer
 */
const resetSilenceTimer = () => {
  if (silenceTimer) {
    clearTimeout(silenceTimer);
  }

  silenceTimer = setTimeout(() => {
    if (isListening) {
      updateSessionStatus('Listening… (continue speaking)', 'status-listening');
    }
  }, SILENCE_TIMEOUT);
};

/**
 * Clear the silence timer
 */
const clearSilenceTimer = () => {
  if (silenceTimer) {
    clearTimeout(silenceTimer);
    silenceTimer = null;
  }
};

/**
 * Handle recognition end event
 */
const handleRecognitionEnd = () => {
  if (!isListening) {
    setListeningState(false);
    if (targetWords.length) {
      updateSessionStatus('Ready', 'status-ready');
    } else {
      updateSessionStatus('Idle', 'status-idle');
    }
    return;
  }

  // Auto-restart if still supposed to be listening
  setTimeout(() => {
    if (!isListening || !recognition) return;

    try {
      recognition.start();
    } catch (error) {
      if (error.name !== 'InvalidStateError') {
        console.error('Failed to restart recognition:', error);
        handleRecognitionError({ error: error.name || 'unknown' });
      }
    }
  }, 100);
};

/**
 * Handle recognition errors
 */
const handleRecognitionError = event => {
  const errorKey = String(event.error || 'unknown').toLowerCase();

  // Ignore no-speech errors - just keep listening
  if (errorKey === 'no-speech') {
    if (isListening) {
      updateSessionStatus('Listening… (no speech detected)', 'status-listening');
    }
    return;
  }

  // Ignore aborted errors (happens when we stop manually)
  if (errorKey === 'aborted') {
    return;
  }

  let message = 'Speech recognition error. Please try again.';

  if (errorKey === 'not-allowed' || errorKey === 'notallowederror') {
    message = 'Microphone access was denied. Please allow microphone access and try again.';
  } else if (errorKey === 'audio-capture' || errorKey === 'notfounderror') {
    message = 'No microphone was found. Please connect a microphone.';
  } else if (errorKey === 'network') {
    message = 'Network error. Please check your internet connection.';
  }

  console.error('Speech recognition error:', errorKey);
  setRecognizedMessage(message);
  updateSessionStatus('Error', 'status-error');
  setListeningState(false);
  isListening = false;
};

/**
 * Start speech recognition
 */
const startListening = async () => {
  if (!recognition) {
    updateSessionStatus('Speech recognition not supported', 'status-error');
    return;
  }

  if (!targetWords.length) {
    updateSessionStatus('Add text to practice first', 'status-error');
    textInput.focus();
    return;
  }

  if (isListening) {
    return;
  }

  // Preflight microphone permission check
  const micStatus = await checkMicrophonePermission();
  if (micStatus === 'denied') {
    updateSessionStatus('Microphone access denied', 'status-error');
    setRecognizedMessage('Please allow microphone access in your browser settings and reload the page.');
    return;
  }

  // Reset state for new session
  currentMatchIndex = -1;
  skippedIndices.clear();
  rawTranscript = '';
  resetWordHighlights();
  resetSessionSummary();
  setRecognizedMessage('Listening…');
  updateSessionStatus('Listening…', 'status-listening');
  setListeningState(true);
  resetSilenceTimer();

  // Update recognition language from selector
  if (localeSelect && recognition) {
    recognition.lang = localeSelect.value;
  }

  try {
    recognition.start();
  } catch (error) {
    if (error.name === 'InvalidStateError') {
      // Already running, that's fine
      return;
    }
    console.error('Failed to start recognition:', error);
    handleRecognitionError({ error: error.name || error.message });
  }
};

/**
 * Check microphone permission status
 */
const checkMicrophonePermission = async () => {
  try {
    if (navigator.permissions && navigator.permissions.query) {
      const result = await navigator.permissions.query({ name: 'microphone' });
      return result.state; // 'granted', 'denied', or 'prompt'
    }
    // Fallback: try to get user media
    return 'prompt';
  } catch (e) {
    // Permission API not supported, assume prompt
    return 'prompt';
  }
};

/**
 * Initialize speech recognition
 */
const initializeSpeechRecognition = () => {
  if (!SpeechRecognition) {
    supportMessage.hidden = false;
    startSessionButton.disabled = true;
    stopSessionButton.disabled = true;
    updateSessionStatus('Not supported in this browser', 'status-error');
    return;
  }

  const defaultLocale = localStorage.getItem(STORAGE_KEY_LOCALE) || navigator.language || 'en-US';

  recognition = new SpeechRecognition();
  recognition.lang = defaultLocale;
  recognition.interimResults = true;
  recognition.maxAlternatives = 1;
  recognition.continuous = true;

  recognition.addEventListener('result', handleRecognitionResult);
  recognition.addEventListener('end', handleRecognitionEnd);
  recognition.addEventListener('error', handleRecognitionError);

  // Also handle audiostart/audioend for better status feedback
  recognition.addEventListener('audiostart', () => {
    if (isListening) {
      updateSessionStatus('Listening…', 'status-listening');
    }
  });

  // Initialize locale selector if present
  if (localeSelect) {
    localeSelect.value = defaultLocale;
    localeSelect.addEventListener('change', () => {
      if (recognition) {
        recognition.lang = localeSelect.value;
        localStorage.setItem(STORAGE_KEY_LOCALE, localeSelect.value);
      }
    });
  }
};

/**
 * Save current state to localStorage
 */
const saveToStorage = () => {
  try {
    localStorage.setItem(STORAGE_KEY_TEXT, textInput.value);
  } catch (e) {
    // localStorage might be unavailable
    debugLog('Failed to save to localStorage:', e);
  }
};

/**
 * Load state from localStorage
 */
const loadFromStorage = () => {
  try {
    const savedText = localStorage.getItem(STORAGE_KEY_TEXT);
    if (savedText && textInput) {
      textInput.value = savedText;
    }
  } catch (e) {
    debugLog('Failed to load from localStorage:', e);
  }
};

// Event listeners
enterButton.addEventListener('click', addTextToView);
clearButton.addEventListener('click', clearSidebarInput);
clearViewButton.addEventListener('click', clearTextView);
startSessionButton.addEventListener('click', startListening);
stopSessionButton.addEventListener('click', stopListening);

if (skipWordButton) {
  skipWordButton.addEventListener('click', skipCurrentWord);
}

textInput.addEventListener('keydown', event => {
  if (event.key === 'Enter' && (event.metaKey || event.ctrlKey)) {
    event.preventDefault();
    addTextToView();
  }
});

// Save text on input change (debounced)
let saveTimeout = null;
textInput.addEventListener('input', () => {
  if (saveTimeout) clearTimeout(saveTimeout);
  saveTimeout = setTimeout(saveToStorage, 500);
});

// Keyboard shortcuts for accessibility
document.addEventListener('keydown', event => {
  // Alt+S to start listening
  if (event.altKey && event.key === 's') {
    event.preventDefault();
    if (!isListening && targetWords.length) {
      startListening();
    }
  }
  // Alt+J to skip the current word
  if (event.altKey && event.key === 'j') {
    event.preventDefault();
    skipCurrentWord();
  }
  // Alt+X or Escape to stop listening
  if ((event.altKey && event.key === 'x') || (event.key === 'Escape' && isListening)) {
    event.preventDefault();
    stopListening();
  }
});

// Initialize
initializeSpeechRecognition();
loadFromStorage();
setRecognizedMessage(idleRecognizedMessage);
updateSessionStatus('Idle', 'status-idle');