/*
 * Fantasy name patterns + interpreter.
 *
 * Pattern data and phoneme-element interpreter adapted from:
 *   - https://github.com/ironarachne/made-up-names (v2.3.6)
 *   - https://github.com/ironarachne/word-generator (v2.1.1)
 *
 * The MIT License (MIT)
 *
 * Copyright (c) 2023 Ben Overmyer <ben@overmyer.net>
 *
 * Permission is hereby granted, free of charge, to any person obtaining a copy
 * of this software and associated documentation files (the "Software"), to deal
 * in the Software without restriction, including without limitation the rights
 * to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
 * copies of the Software, and to permit persons to whom the Software is
 * furnished to do so, subject to the following conditions:
 *
 * The above copyright notice and this permission notice shall be included in
 * all copies or substantial portions of the Software.
 *
 * THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
 * IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
 * FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
 * AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
 * LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
 * OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN
 * THE SOFTWARE.
 */

/** @typedef {'all'|'female'|'male'|'family'} NameStyle */
/** @typedef {string[] | {patterns: string[], combinations: string[][][]}} PatternSet */
/** @typedef {{male: PatternSet, female: PatternSet, family: PatternSet}} CultureData */

/** Phoneme symbol → element list. Lowercase symbol chars in a pattern emit a random element. */
const ELEMENTS = {
  '#': ['0', '1', '2', '3', '4', '5', '6', '7', '8', '9'],
  a: ['ch', 'j'],
  b: ['d', 'dh'],
  c: ['b', 'c', 'd', 'f', 'g', 'h', 'j', 'k', 'l', 'm', 'n', 'p', 'q', 'r', 's', 't', 'v', 'w', 'x', 'y', 'z'],
  e: ['d', 'n', 't', 'l'],
  f: ['f', 'v'],
  h: ['t', 'th'],
  i: ['h', 'f'],
  k: ['c', 'k'],
  l: ['l', 'r'],
  m: ['i', 'ö', 'eu', 'oe', 'e'],
  n: ['m', 'n', 'ng'],
  o: ['t', 'd', 'p'],
  p: ['g', 'k', 'p', 'b', 't', 'd', 'q'],
  s: ['s', 'sh', 'z', 'zh'],
  t: ['f', 'v', 's', 'sh', 'z', 'zh'],
  v: ['a', 'e', 'i', 'o', 'u'],
  w: ['w', 'wh', 'g'],
  x: ['á', 'é', 'í', 'ó', 'ú'],
  y: ['e', 'ee', 'i', 'oo', 'y', 'ie']
};

/** @type {Object<string, CultureData>} */
const CULTURES = {
  easterling: {
    male: ['YO(SHI,TE,DE,HA)H(A,I)(D,T)(O,E)', '(M,N)(A,O)R(A,I,U)(D,T)(A,O)', 'SvSvKE', '(G,K)(A,E)N(J,G,K)(I,E)'],
    female: ['(AI,A)KO', 'SA(R,Y)v', 'Y(A,U,O)R(A,I)', '(SA,YU,YO)R(U,A,I)(M,N)(A,I)', 'K(A,E,U)(TSU,TE,DE,TO,DO)K(A,I)'],
    family: ['(A,U)(G,K)(A,U)H(I,A)(T,D)(A,O)', '(G,K)(A,I)(NN,N,M)O(SU,T)(KE,KA,E,A)', '(T,D)A(G,K)E(T,CH)(A,E)', '(M,N)(A,O)R(I,A)', 'I(Z,S)(A,U)(M,N)I']
  },
  fantasy: {
    male: ['jmB', 'vFFlvn', 'evplvn', 'vpylvn', 'fvLLyn', 'fvlvpml', 'vppvl', 'pmspvn', 'pv+lvn', 'pvlsvp', 'pvDRvC'],
    female: ['vnvlA', 'ynA', 'vbvlyN', 'vlvnA', 'vcnvA', 'pvlvNIA', 'tvlvNA', 'pvSSvkA'],
    family: [
      'Apvlnvn',
      'vpvcnvn',
      'vSHlvnp',
      'SnvTH',
      'pvvLOR',
      'kyPER',
      'sLvTCHER',
      'sv(RR,R)IER',
      'pvn(D,T)ElS(E,O)N',
      'pvnDElS',
      'ypSBURG',
      'ypSBERG',
      'vlnvTHION',
      'vpRvHAM',
      'vkLAND',
      'yfpLmND',
      'vcfFORD',
      'vSnFvRD'
    ]
  },
  'forest-dweller': {
    male: ['vl(D,G,K,B)vlvn', 'vnvnvnpv', 'pARv(TH,l)I(O,E)N', 'vl(M,N)IEL', 'vlMvRION', 'vRvnoUR', 'vNxlION', 'vN(D,T)xRIL', 'vN(D,T)xNE', 'vRvNxRE'],
    female: ['vlpvlvnA', 'pvLvDRIEL', 'pvLvTHRIEL', 'vlWEN', 'vlvnwA', 'vlvnwE', 'vLLUvn', 'vsvLME', 'cvlwEN', 'vnovMIEL', 'vlIxN'],
    family: {
      patterns: ['vlpvlvn'],
      combinations: [
        [
          ['WHITE', 'GREEN', 'BLUE', 'WILD', 'SUMMER', 'WINTER', 'WIND', 'BEACH', 'DAWN', 'DUSK', 'SKY', 'NIGHT'],
          ['FLOWER', 'WALKER', 'SONG', 'RUNNER', 'CROWN', 'BLOSSOM', 'BELL', 'WATCHER', 'GUARD', 'STAR', 'GROVE']
        ]
      ]
    }
  },
  'gem-tinkerer': {
    male: ['Blvocvf', 'oOdvp', 'pvnlv', 'pvnp', 'cvlVER', 'wvlVER', 'pvlwvl', 'pvlwv'],
    female: ['avNNA', 'SHvNvDDI', 'MvoLI', 'voAnA', 'voAnI', 'vvTHNE', 'ovpv', 'SNvflvnv', 'pvdvnv'],
    family: {
      patterns: ['vPSpvMS', 'cvnKLER', 'cvdLER', 'cvdER', 'pvpLOp'],
      combinations: [
        [
          ['AGATE', 'ALLOY', 'COPPER', 'CRYSTAL', 'DIAMOND', 'DUST', 'GEM', 'GOLD', 'IRON', 'JADE', 'JET', 'JEWEL', 'ONYX', 'OPAL', 'PELLET', 'RUBY', 'SAPPHIRE', 'SILVER', 'WIRE'],
          [
            'BITER',
            'BOPPER',
            'BRANDER',
            'CHARMER',
            'CHEST',
            'DROPPER',
            'HAMMER',
            'MALLET',
            'POPPER',
            'SEEDER',
            'SENDER',
            'SHAPER',
            'SWEEPER',
            'TINKER',
            'TRADER',
            'WATCHER',
            'WEAVER',
            'WINKER',
            'WOOSHER',
            'WORKER'
          ]
        ]
      ]
    }
  },
  'hill-feaster': {
    male: ['BvlBv', 'svnwvsE', 'pvPPvn', 'pvlvplvn', 'wvnflvo', 'pvlnO', 'vovlpvRT'],
    female: ['oEOnY', 'oEARL', 'pELInDA', 'mvlvnoA', 'plvSovn', 'Mvovlpvlo', 'pvfvnA'],
    family: {
      patterns: ['BvdvnS', 'pvMpu'],
      combinations: [
        [
          ['BRANDY', 'FEATHER', 'HAIRY', 'HOG', 'HORN', 'LITTLE', 'LONG', 'OAK', 'OLD', 'PROUD', 'PUDDI', 'SWIFT', 'UNDER', 'WANDER', 'WHIT'],
          ['BELLY', 'BOTTOM', 'DALE', 'FOOT', 'HOUSE', 'PEN', 'WOOD', 'WORT']
        ]
      ]
    }
  },
  'metal-miner': {
    male: ['pvRIN', 'pWvlIN', 'pvlIN', 'THvlIN', 'THvlIM', 'pvMLI', 'pvNLI', 'plxIN', 'pvFUR', 'pvFvl', 'slvlIN'],
    female: ['pvRINv', 'pWvlINA', 'pvlInv', 'THvlIn', 'pvMLInA', 'pvNLInA', 'pvFURA', 'pvFvlA', 'slvlINA'],
    family: {
      patterns: [],
      combinations: [
        [
          ['BATTLE', 'BROAD', 'COPPER', 'FIRE', 'GEM', 'GOLD', 'INGOT', 'JADE', 'JET', 'JEWEL', 'ONYX', 'OPAL', 'RUBY', 'SAPPHIRE', 'SILVER', 'STEEL', 'OAK', 'ROCK', 'STONE'],
          ['BANE', 'BEARD', 'BREWER', 'CHIN', 'FALL', 'FOOT', 'GRIP', 'HAMMER', 'HILL', 'MOUNTAIN', 'RIVER', 'TUNNEL']
        ]
      ]
    }
  },
  'mud-grubber': {
    male: ['BvlBvK', 'svnwvsENK', 'pvPPvnK', 'pvlvplvS', 'wvnflvo', 'pvlnO', 'vovlpvRT'],
    female: ['oEOnY', 'oEARL', 'pELInDA', 'mvlvnoA', 'plvSovn', 'Mvovlpvlo', 'pvfvnA'],
    family: {
      patterns: ['BvdvnS', 'pvMpu'],
      combinations: [
        [
          [
            'BIG',
            'CRAZE',
            'FEATHER',
            'FLEA',
            'GREASE',
            'HAIRY',
            'HOG',
            'HORN',
            'LITTLE',
            'LONG',
            'MUD',
            'OLD',
            'PROUD',
            'PUDDI',
            'SLIME',
            'SLUDGE',
            'SMALL',
            'STINK',
            'SWIFT',
            'UGLY',
            'UNDER',
            'WANDER',
            'WART',
            'WHIT',
            'OIL',
            'PUDDING'
          ],
          ['BELLY', 'BOTTOM', 'BUCKET', 'DALE', 'FACE', 'FOOT', 'HOUSE', 'NOSE', 'STENCH', 'TOOTH', 'WART']
        ]
      ]
    }
  },
  'old-worlder': {
    male: ['Mvlk', 'vRNmn', 'MmTHIAS', 'NmkO', 'kOnRAD', 'kmnR', 'oInO', 'lUoA', 'LvRs', 'MvGnUs', 'Nvo'],
    female: ['avNNIiER', 'sAnoRA', 'sARA', 'smlInA', 'imlEN', 'imlENA', 'yLnA', 'bAlIA', 'hAlIA', 'wILnA', 'NAbIA', 'NmbIA', 'kARmlINE', 'vLmNORA'],
    family: ['ivRSoMANN', 'SCHnveZLmR', 'SCHnve', 'wvnZFRyD', 'kmnvG', 'kmnvR', 'kmnIG', 'wmnFRyD']
  },
  'scale-bearer': {
    male: ['vlKvSIA', 'cvLvSAR', 'cvlvt', 'ovnv+R'],
    female: ['tvMvt', 'cv+l', 'cvlv', 'ovRRv', 'lAIvNN'],
    family: {
      patterns: ['vlpvlvn', 'ovlMvRvV', 'pvRRcYlION', 'pvRRcYlIvN', 'pvdcYlIvN', 'cvRvXIUS'],
      combinations: [
        [
          ['WHITE', 'GREEN', 'BLUE', 'WILD', 'SUMMER', 'WINTER', 'WIND', 'DAWN', 'DUSK', 'SKY', 'NIGHT', 'FIRE', 'FLAME', 'RAGE', 'HAMMER', 'RED', 'DARK', 'SPELL', 'WAR'],
          ['BLADE', 'BROW', 'SCALE', 'SPEAR', 'RIDER', 'WALKER', 'RUNNER', 'TALON']
        ]
      ]
    }
  },
  'war-bringer': {
    male: ['vFFlvn', 'cvclvn', 'vpvlvn', 'cvLLvvn', 'cvlvpul', 'vppvl', 'pvspvn', 'pv+lvn', 'pvlsvp', 'pvDRvC', 'pvp', 'pvpvp', 'pvppvs', 'pAlpvs', 'pAlpvG', 'svRM', 'svRN', 'svRNpvK', 'pv+pvK'],
    female: ['vnvlA', 'vnv', 'vdvlvN', 'vlvnA', 'vcnvA', 'cvlvNIA', 'cvlvNA', 'pvdvpa', 'vpBvZA', 'vp+vsA'],
    family: {
      patterns: [
        'Apvlnvn',
        'vpvcnvn',
        'vSHlvnp',
        'SnvTH',
        'pvvLOR',
        'pv+PER',
        'sLvTCHER',
        'svRRIER',
        'pvnDElSON',
        'pvnDElS',
        'vvpSBURG',
        'vvpSBERG',
        'vlnvTHION',
        'vpRvHAM',
        'vcpLAND',
        'vcpLvND',
        'vcfFORD',
        'vcnFvRD'
      ],
      combinations: [
        [
          ['BATTLE', 'BREAK', 'BULL', 'DEATH', 'FEAR', 'FIGHT', 'GROG', 'MURDER', 'RAGE', 'SKULL', 'SMASH', 'WAR'],
          ['AXE', 'BLADE', 'CHOPPER', 'CUTTER', 'FIST', 'KILLER', 'REND', 'SMASH']
        ]
      ]
    }
  }
};

/** Ordered list of culture keys for UI population. */
export const CULTURE_KEYS = Object.keys(CULTURES);

/** @type {NameStyle[]} */
export const STYLE_KEYS = ['all', 'female', 'male', 'family'];

/**
 * Generate a single name.
 * @param {object} opts Generation options.
 * @param {string} [opts.culture] A `CULTURE_KEYS` member or `'all'`; unknown values are treated as `'all'`.
 * @param {NameStyle} [opts.style] Style of name to generate; unknown values are treated as `'all'`.
 * @returns {string} Title-cased name.
 */
export function generateName({ culture, style = 'all' } = {}) {
  const cultureKey = culture === 'all' || !CULTURES[culture] ? pick(CULTURE_KEYS) : culture;
  const data = CULTURES[cultureKey];
  const styleKey = STYLE_KEYS.includes(style) ? style : 'all';
  const pool = styleKey === 'all' ? mergePools(data.male, data.female) : data[styleKey];
  const { patterns, combinations } = normalizePool(pool);
  const total = patterns.length + combinations.length;
  const choice = Math.floor(Math.random() * total);
  const raw = choice < patterns.length ? interpretPattern(patterns[choice]) : interpretPattern(combine(combinations[choice - patterns.length]));
  return titleCase(raw);
}

/**
 * Merge two pools into one normalized `{patterns, combinations}` set.
 * @param {PatternSet} a First pool.
 * @param {PatternSet} b Second pool.
 * @returns {{patterns: string[], combinations: string[][][]}} Combined pool.
 */
function mergePools(a, b) {
  const A = normalizePool(a);
  const B = normalizePool(b);
  return { patterns: [...A.patterns, ...B.patterns], combinations: [...A.combinations, ...B.combinations] };
}

/**
 * Normalize a `PatternSet` into a `{patterns, combinations}` shape.
 * @param {PatternSet} pool Plain pattern array or `{patterns, combinations}` set.
 * @returns {{patterns: string[], combinations: string[][][]}} Always-populated shape with defaulted empty arrays.
 */
function normalizePool(pool) {
  if (Array.isArray(pool)) return { patterns: pool, combinations: [] };
  return { patterns: pool.patterns ?? [], combinations: pool.combinations ?? [] };
}

/**
 * Run a pattern string through the phoneme interpreter.
 * @param {string} pattern Mixed pattern: lowercase symbols (from `ELEMENTS`), uppercase literals, `(a,b)` alternation, `+` repeats prior phoneme.
 * @returns {string} Lowercase generated string.
 */
function interpretPattern(pattern) {
  let out = '';
  let last = '';
  let i = 0;
  while (i < pattern.length) {
    const ch = pattern[i];
    if (ch === '+') {
      out += last;
      i += 1;
      continue;
    }
    if (ch === '(') {
      i += 1;
      const parts = [''];
      while (i < pattern.length && pattern[i] !== ')') {
        if (pattern[i] === ',') parts.push('');
        else parts[parts.length - 1] += pattern[i];
        i += 1;
      }
      i += 1;
      const chosen = pick(parts);
      let phoneme = '';
      for (const c of chosen) phoneme += parseElement(c);
      out += phoneme;
      last = phoneme;
      continue;
    }
    const phoneme = parseElement(ch);
    out += phoneme;
    last = phoneme;
    i += 1;
  }
  return out;
}

/**
 * Resolve a single pattern character. Lowercase chars in `ELEMENTS` emit a random element; everything else lowercases through.
 * @param {string} ch Single pattern character.
 * @returns {string} Resolved phoneme (element pick or literal lowercase).
 */
function parseElement(ch) {
  if (ELEMENTS[ch]) return pick(ELEMENTS[ch]);
  return ch.toLowerCase();
}

/**
 * Pick one element from each part-set in a combination and concatenate.
 * @param {string[][]} combination Ordered list of part-sets to choose-one-each.
 * @returns {string} Concatenated raw string (still needs interpreter pass + title-case).
 */
function combine(combination) {
  let result = '';
  for (const partSet of combination) {
    if (partSet.length > 0) result += pick(partSet);
  }
  return result;
}

/**
 * Title-case the output: capitalize after start, whitespace, or hyphen; leave intra-word casing alone.
 * @param {string} s Generated lowercase string.
 * @returns {string} Title-cased string.
 */
function titleCase(s) {
  return s.replace(/(^|[\s-])(\w)/g, (_, sep, c) => sep + c.toUpperCase());
}

/**
 * Pick a random element from a non-empty array.
 * @param {any[]} arr Source array.
 * @returns {any} Random element.
 */
function pick(arr) {
  return arr[Math.floor(Math.random() * arr.length)];
}
