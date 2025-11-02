const textInput = document.querySelector('#textInput');
const enterButton = document.querySelector('#enterButton');
const clearButton = document.querySelector('#clearButton');
const wordsContainer = document.querySelector('#wordsContainer');
const clearViewButton = document.querySelector('#clearViewButton');

function createWordChip(word) {
  const chip = document.createElement('span');
  chip.className = 'word-chip';
  chip.textContent = word;
  chip.setAttribute('role', 'listitem');
  return chip;
}

function addTextToView() {
  const rawText = textInput.value.trim();
  if (!rawText) {
    return;
  }

  const words = rawText.split(/\s+/).map(word => word.replace(/[^a-zA-Z0-9]+/g, '').toLowerCase());
  words.forEach(word => {
    if (word) {
      wordsContainer.appendChild(createWordChip(word));
    }
  });
}

function clearSidebarInput() {
  textInput.value = '';
  textInput.focus();
}

function clearTextView() {
  wordsContainer.innerHTML = '';
}

enterButton.addEventListener('click', addTextToView);
clearButton.addEventListener('click', clearSidebarInput);
clearViewButton.addEventListener('click', clearTextView);

textInput.addEventListener('keydown', event => {
  if (event.key === 'Enter' && (event.metaKey || event.ctrlKey)) {
    event.preventDefault();
    addTextToView();
  }
});
