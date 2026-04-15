/**
 * Phase 3 Challenge Engine (v2 — upgraded difficulty)
 * Generates 10 deterministic math questions from a seed.
 * 5 question types, each appearing twice, shuffled by seed.
 *
 * Question types:
 *  1. Polynomial evaluation  — degree 6-8, evaluate P(x) for a given x
 *  2. Matrix determinant     — 4×4 integer matrix, entries -12 to 12
 *  3. Modular exponentiation — a^b mod m with larger ranges
 *  4. System of equations    — 4-variable linear system (integer solutions)
 *  5. Discrete logarithm     — find x where g^x ≡ h (mod p)
 */

// ─── Seeded PRNG (xoshiro128**) ────────────────────────────────────
// Deterministic: same seed → same questions → same answers.

function splitmix32(seed: number) {
  return () => {
    seed |= 0
    seed = (seed + 0x9e3779b9) | 0
    let t = seed ^ (seed >>> 16)
    t = Math.imul(t, 0x21f0aaad)
    t = t ^ (t >>> 15)
    t = Math.imul(t, 0x735a2d97)
    t = t ^ (t >>> 15)
    return (t >>> 0) / 4294967296
  }
}

function createRng(seed: number) {
  const next = splitmix32(seed)
  return {
    /** float in [0, 1) */
    random: next,
    /** int in [min, max] inclusive */
    int(min: number, max: number) {
      return Math.floor(next() * (max - min + 1)) + min
    },
    /** shuffle array in-place */
    shuffle<T>(arr: T[]): T[] {
      for (let i = arr.length - 1; i > 0; i--) {
        const j = Math.floor(next() * (i + 1))
        ;[arr[i], arr[j]] = [arr[j], arr[i]]
      }
      return arr
    },
  }
}

// ─── Math helpers ──────────────────────────────────────────────────

/** Modular exponentiation: base^exp mod mod */
function modPow(base: bigint, exp: bigint, mod: bigint): bigint {
  let result = 1n
  base = ((base % mod) + mod) % mod
  while (exp > 0n) {
    if (exp & 1n) result = (result * base) % mod
    exp >>= 1n
    base = (base * base) % mod
  }
  return result
}

/** 4×4 matrix determinant via cofactor expansion */
function det4(m: number[][]): number {
  let result = 0
  for (let j = 0; j < 4; j++) {
    const minor: number[][] = []
    for (let row = 1; row < 4; row++) {
      const r: number[] = []
      for (let col = 0; col < 4; col++) {
        if (col !== j) r.push(m[row][col])
      }
      minor.push(r)
    }
    const cofactor =
      minor[0][0] * (minor[1][1] * minor[2][2] - minor[1][2] * minor[2][1]) -
      minor[0][1] * (minor[1][0] * minor[2][2] - minor[1][2] * minor[2][0]) +
      minor[0][2] * (minor[1][0] * minor[2][1] - minor[1][1] * minor[2][0])
    result += (j % 2 === 0 ? 1 : -1) * m[0][j] * cofactor
  }
  return result
}

/** Discrete logarithm: find x where g^x ≡ h (mod p), brute force */
function discreteLog(g: number, h: number, p: number): number {
  let power = 1
  for (let x = 0; x < p; x++) {
    if (power === h % p) return x
    power = (power * g) % p
  }
  return -1 // should never happen with valid inputs
}

// ─── Question interfaces ───────────────────────────────────────────

export interface ChallengeQuestion {
  index: number        // 1-10
  type: string
  prompt: string       // narrative prompt (Sentinel-themed)
  hint: string         // what to compute
}

export interface ChallengeSet {
  seed: number
  questions: ChallengeQuestion[]
  answers: string[]    // server-side only, never sent to client
  expiresAt: Date
}

// ─── Sentinel-themed narrative wrappers ─────────────────────────────

const POLY_NARRATIVES = [
  (coeffs: number[], x: number) =>
    `A sentinel's signal decays according to P(x) = ${formatPoly(coeffs)}. Calculate P(${x}).`,
  (coeffs: number[], x: number) =>
    `The orbital trajectory follows f(x) = ${formatPoly(coeffs)}. What is f(${x})?`,
]

const MATRIX_NARRATIVES = [
  (m: number[][]) =>
    `A sentinel's sensor calibration tensor is:\n${formatMatrix(m)}\nCompute the determinant of this 4×4 matrix.`,
  (m: number[][]) =>
    `The grid alignment tensor reads:\n${formatMatrix(m)}\nWhat is the determinant of this 4×4 matrix?`,
]

const MODPOW_NARRATIVES = [
  (a: number, b: number, m: number) =>
    `An encrypted beacon transmits ${a}^${b} mod ${m}. Decode the signal value.`,
  (a: number, b: number, m: number) =>
    `The agent key derivation requires computing ${a}^${b} mod ${m}. What is the result?`,
]

const SYSTEM_NARRATIVES = [
  (eqs: string[]) =>
    `A sentinel network balances power across four nodes:\n${eqs.join("\n")}\nSolve for x, y, z, w. Answer as "x,y,z,w".`,
  (eqs: string[]) =>
    `Four relay stations must synchronize:\n${eqs.join("\n")}\nFind x, y, z, w. Answer as "x,y,z,w".`,
]

const DLOG_NARRATIVES = [
  (g: number, h: number, p: number) =>
    `An encrypted sentinel beacon uses the equation ${g}^x ≡ ${h} (mod ${p}). Find the smallest non-negative integer x.`,
  (g: number, h: number, p: number) =>
    `Agent key recovery requires solving: ${g}^x ≡ ${h} (mod ${p}). What is the smallest non-negative x?`,
]

// ─── Formatters ────────────────────────────────────────────────────

function formatPoly(coeffs: number[]): string {
  // coeffs[0] is highest degree
  const terms: string[] = []
  const deg = coeffs.length - 1
  for (let i = 0; i < coeffs.length; i++) {
    const c = coeffs[i]
    if (c === 0) continue
    const power = deg - i
    let term = ""
    if (power === 0) {
      term = `${c}`
    } else if (power === 1) {
      term = c === 1 ? "x" : c === -1 ? "-x" : `${c}x`
    } else {
      term = c === 1 ? `x^${power}` : c === -1 ? `-x^${power}` : `${c}x^${power}`
    }
    terms.push(term)
  }
  return terms.join(" + ").replace(/\+ -/g, "- ") || "0"
}

function formatMatrix(m: number[][]): string {
  return m.map((row) => `| ${row.map((v) => String(v).padStart(4)).join(" ")} |`).join("\n")
}

// ─── Question generators ───────────────────────────────────────────

function genPolynomial(rng: ReturnType<typeof createRng>, variant: number): { q: Omit<ChallengeQuestion, "index">; answer: string } {
  const degree = rng.int(6, 8)
  const coeffs: number[] = []
  for (let i = 0; i <= degree; i++) {
    coeffs.push(rng.int(-12, 12) || 1) // avoid 0 for leading
  }
  coeffs[0] = Math.abs(coeffs[0]) || 1 // positive leading
  const x = rng.int(-6, 6)

  let result = 0
  for (let i = 0; i < coeffs.length; i++) {
    result += coeffs[i] * Math.pow(x, degree - i)
  }

  const narrative = POLY_NARRATIVES[variant % POLY_NARRATIVES.length]
  return {
    q: {
      type: "polynomial",
      prompt: narrative(coeffs, x),
      hint: `Evaluate the polynomial at x=${x}`,
    },
    answer: String(result),
  }
}

function genMatrix(rng: ReturnType<typeof createRng>, variant: number): { q: Omit<ChallengeQuestion, "index">; answer: string } {
  const m: number[][] = []
  for (let i = 0; i < 4; i++) {
    const row: number[] = []
    for (let j = 0; j < 4; j++) {
      row.push(rng.int(-12, 12))
    }
    m.push(row)
  }
  const d = det4(m)
  const narrative = MATRIX_NARRATIVES[variant % MATRIX_NARRATIVES.length]
  return {
    q: {
      type: "matrix_determinant",
      prompt: narrative(m),
      hint: "Compute the 4×4 determinant",
    },
    answer: String(d),
  }
}

function genModPow(rng: ReturnType<typeof createRng>, variant: number): { q: Omit<ChallengeQuestion, "index">; answer: string } {
  const a = rng.int(10, 200)
  const b = rng.int(50, 500)
  const m = rng.int(500, 9973)
  const result = modPow(BigInt(a), BigInt(b), BigInt(m))
  const narrative = MODPOW_NARRATIVES[variant % MODPOW_NARRATIVES.length]
  return {
    q: {
      type: "modular_exponentiation",
      prompt: narrative(a, b, m),
      hint: `Compute ${a}^${b} mod ${m}`,
    },
    answer: String(result),
  }
}

function genSystem(rng: ReturnType<typeof createRng>, variant: number): { q: Omit<ChallengeQuestion, "index">; answer: string } {
  // Generate integer solutions first, then build equations
  const x = rng.int(-5, 5)
  const y = rng.int(-5, 5)
  const z = rng.int(-5, 5)
  const w = rng.int(-5, 5)

  // Random coefficients for 4 equations with 4 variables
  const eqs: { a: number; b: number; c: number; d: number; e: number }[] = []
  for (let i = 0; i < 4; i++) {
    const a = rng.int(-5, 5) || 1
    const b = rng.int(-5, 5) || 1
    const c = rng.int(-5, 5) || 1
    const d = rng.int(-5, 5) || 1
    const e = a * x + b * y + c * z + d * w
    eqs.push({ a, b, c, d, e })
  }

  // Verify the system has a unique solution by checking 4×4 determinant
  const coefMatrix = eqs.map((eq) => [eq.a, eq.b, eq.c, eq.d])
  const d = det4(coefMatrix)
  if (d === 0) {
    // Degenerate — fix by forcing a known good system
    eqs[0] = { a: 1, b: 0, c: 0, d: 0, e: x }
    eqs[1] = { a: 0, b: 1, c: 0, d: 0, e: y }
    eqs[2] = { a: 0, b: 0, c: 1, d: 0, e: z }
    eqs[3] = { a: 0, b: 0, c: 0, d: 1, e: w }
  }

  const eqStrings = eqs.map(
    (eq) => `${eq.a}x + ${eq.b}y + ${eq.c}z + ${eq.d}w = ${eq.e}`
  )

  const narrative = SYSTEM_NARRATIVES[variant % SYSTEM_NARRATIVES.length]
  return {
    q: {
      type: "system_of_equations",
      prompt: narrative(eqStrings),
      hint: "Solve the 4-variable linear system",
    },
    answer: `${x},${y},${z},${w}`,
  }
}

function genDiscreteLog(rng: ReturnType<typeof createRng>, variant: number): { q: Omit<ChallengeQuestion, "index">; answer: string } {
  // Pick a prime p in [101, 499]
  const primes = [101,103,107,109,113,127,131,137,139,149,151,157,163,167,173,179,181,191,193,197,199,211,223,227,229,233,239,241,251,257,263,269,271,277,281,283,293,307,311,313,317,331,337,347,349,353,359,367,373,379,383,389,397,401,409,419,421,431,433,439,443,449,457,461,463,467,479,487,491,499]
  const p = primes[rng.int(0, primes.length - 1)]

  // Pick a generator g (small primitive-root-ish base)
  const g = rng.int(2, 10)

  // Pick secret exponent x in [2, p-2]
  const x = rng.int(2, Math.min(p - 2, 400))

  // h = g^x mod p
  let h = 1
  let base = g % p
  let exp = x
  while (exp > 0) {
    if (exp % 2 === 1) h = (h * base) % p
    base = (base * base) % p
    exp = Math.floor(exp / 2)
  }

  const narrative = DLOG_NARRATIVES[variant % DLOG_NARRATIVES.length]
  return {
    q: {
      type: "discrete_log",
      prompt: narrative(g, h, p),
      hint: `Find x such that ${g}^x ≡ ${h} (mod ${p})`,
    },
    answer: String(x),
  }
}

// ─── Main generator ─────────────────────────────────────────────────

const GENERATORS = [genPolynomial, genMatrix, genModPow, genSystem, genDiscreteLog] as const

const CHALLENGE_WINDOW_MS = 5 * 60 * 1000 // 5 minutes

export function generateChallenge(seedInput: number): ChallengeSet {
  const rng = createRng(seedInput)

  // 2 of each type = 10 questions
  const typeSlots: number[] = []
  for (let t = 0; t < GENERATORS.length; t++) {
    typeSlots.push(t, t) // each type appears twice
  }
  rng.shuffle(typeSlots)

  const questions: ChallengeQuestion[] = []
  const answers: string[] = []
  const variantCounters = [0, 0, 0, 0, 0]

  for (let i = 0; i < typeSlots.length; i++) {
    const typeIdx = typeSlots[i]
    const variant = variantCounters[typeIdx]++
    const gen = GENERATORS[typeIdx]
    const { q, answer } = gen(rng, variant)
    questions.push({ ...q, index: i + 1 })
    answers.push(answer)
  }

  return {
    seed: seedInput,
    questions,
    answers,
    expiresAt: new Date(Date.now() + CHALLENGE_WINDOW_MS),
  }
}

// ─── Validator ──────────────────────────────────────────────────────

export interface ValidationResult {
  correct: boolean
  total: number
  correctCount: number
  wrongIndices: number[]    // 1-based indices of wrong answers
}

export function validateAnswers(seed: number, submitted: string[]): ValidationResult {
  const challenge = generateChallenge(seed)
  const correctAnswers = challenge.answers

  if (submitted.length !== correctAnswers.length) {
    return {
      correct: false,
      total: correctAnswers.length,
      correctCount: 0,
      wrongIndices: Array.from({ length: correctAnswers.length }, (_, i) => i + 1),
    }
  }

  const wrongIndices: number[] = []
  let correctCount = 0

  for (let i = 0; i < correctAnswers.length; i++) {
    const sub = submitted[i].trim().replace(/\s/g, "")
    const expected = correctAnswers[i].trim().replace(/\s/g, "")
    if (sub === expected) {
      correctCount++
    } else {
      wrongIndices.push(i + 1)
    }
  }

  return {
    correct: wrongIndices.length === 0,
    total: correctAnswers.length,
    correctCount,
    wrongIndices,
  }
}

/** Generate a fresh random seed */
export function newSeed(): number {
  return Math.floor(Math.random() * 2147483647) + 1
}
