// Lightweight tests for normalizeWord, parseText, and matchWords

const normalizeWord = word => {
  return word.replace(/[^\p{L}\p{N}]/gu, '').toLocaleLowerCase();
};

const parseText = rawText => {
  const words = rawText.trim().split(/\s+/).filter(Boolean);
  return words.map(word => ({
    original: word,
    normalized: normalizeWord(word)
  }));
};

const matchWords = (targetWords, recognizedWords) => {
  const n = targetWords.length;
  const m = recognizedWords.length;

  const targetMatched = new Array(n).fill(false);
  const recognizedMatched = new Array(m).fill(null);

  if (n === 0 || m === 0) {
    for (let i = 0; i < m; i++) {
      recognizedMatched[i] = { targetIndex: null, status: 'extra' };
    }
    return { targetMatched, recognizedMatched, furthestMatch: -1 };
  }

  const dp = Array(n + 1).fill(null).map(() => Array(m + 1).fill(0));

  for (let i = 1; i <= n; i++) {
    for (let j = 1; j <= m; j++) {
      if (targetWords[i - 1] === recognizedWords[j - 1]) {
        dp[i][j] = dp[i - 1][j - 1] + 1;
      } else {
        dp[i][j] = Math.max(dp[i - 1][j], dp[i][j - 1]);
      }
    }
  }

  let i = n, j = m;
  const matches = [];

  while (i > 0 && j > 0) {
    if (targetWords[i - 1] === recognizedWords[j - 1]) {
      matches.push({ targetIdx: i - 1, recIdx: j - 1 });
      i--;
      j--;
    } else if (dp[i - 1][j] > dp[i][j - 1]) {
      i--;
    } else {
      j--;
    }
  }

  matches.reverse();
  let furthestMatch = -1;

  for (const match of matches) {
    targetMatched[match.targetIdx] = true;
    recognizedMatched[match.recIdx] = { targetIndex: match.targetIdx, status: 'match' };
    furthestMatch = Math.max(furthestMatch, match.targetIdx);
  }

  for (let k = 0; k < m; k++) {
    if (!recognizedMatched[k]) {
      recognizedMatched[k] = { targetIndex: null, status: 'extra' };
    }
  }

  return { targetMatched, recognizedMatched, furthestMatch };
};

const assertEqual = (name, actual, expected) => {
  const pass = JSON.stringify(actual) === JSON.stringify(expected);
  console.log(`${pass ? '✅' : '❌'} ${name}`);
  if (!pass) {
    console.log('   expected:', expected);
    console.log('   received:', actual);
  }
  return pass;
};

const testNormalizeWord = () => {
  return [
    assertEqual('normalize basic', normalizeWord('Hello!'), 'hello'),
    assertEqual('normalize accents', normalizeWord('café'), 'café'),
    assertEqual('normalize numbers', normalizeWord('Room-101'), 'room101')
  ];
};

const testParseText = () => {
  const parsed = parseText('Hello, world!');
  return [
    assertEqual('parse length', parsed.length, 2),
    assertEqual('parse normalized', parsed.map(w => w.normalized), ['hello', 'world'])
  ];
};

const testMatchWords = () => {
  const target = ['hello', 'world', 'world'];
  const recognized = ['hello', 'brave', 'world'];
  const { targetMatched, recognizedMatched, furthestMatch } = matchWords(target, recognized);

  return [
    assertEqual('match target flags', targetMatched, [true, true, false]),
    assertEqual('match mapping', recognizedMatched.map(m => m.targetIndex), [0, null, 1]),
    assertEqual('furthest match', furthestMatch, 1)
  ];
};

const runTests = () => {
  const results = [
    ...testNormalizeWord(),
    ...testParseText(),
    ...testMatchWords()
  ];

  const passed = results.filter(Boolean).length;
  console.log(`\n${passed}/${results.length} assertions passed`);
};

runTests();
