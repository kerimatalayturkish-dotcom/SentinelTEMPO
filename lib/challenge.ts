/**
 * Phase 3 Challenge Engine
 * Generates 10 deterministic math questions from a seed.
 * 5 question types, each appearing twice, shuffled by seed.
 *
 * Question types:
 *  1. Polynomial evaluation  — evaluate P(x) for a given x
 *  2. Matrix determinant     — 3×3 integer matrix
 *  3. Modular exponentiation — a^b mod m
 *  4. System of equations    — 3-variable linear system (integer solutions)
 *  5. Combinatorics          — C(n,k) or permutation counting
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

/** 3×3 matrix determinant */
function det3(m: number[][]): number {
  return (
    m[0][0] * (m[1][1] * m[2][2] - m[1][2] * m[2][1]) -
    m[0][1] * (m[1][0] * m[2][2] - m[1][2] * m[2][0]) +
    m[0][2] * (m[1][0] * m[2][1] - m[1][1] * m[2][0])
  )
}

/** Factorial */
function factorial(n: number): bigint {
  let f = 1n
  for (let i = 2n; i <= BigInt(n); i++) f *= i
  return f
}

/** C(n, k) */
function combinations(n: number, k: number): bigint {
  if (k > n) return 0n
  if (k === 0 || k === n) return 1n
  return factorial(n) / (factorial(k) * factorial(n - k))
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
    `A sentinel's sensor calibration matrix is:\n${formatMatrix(m)}\nCompute the determinant.`,
  (m: number[][]) =>
    `The grid alignment tensor reads:\n${formatMatrix(m)}\nWhat is its determinant?`,
]

const MODPOW_NARRATIVES = [
  (a: number, b: number, m: number) =>
    `An encrypted beacon transmits ${a}^${b} mod ${m}. Decode the signal value.`,
  (a: number, b: number, m: number) =>
    `The agent key derivation requires computing ${a}^${b} mod ${m}. What is the result?`,
]

const SYSTEM_NARRATIVES = [
  (eqs: string[]) =>
    `A sentinel network balances power across three nodes:\n${eqs.join("\n")}\nSolve for x, y, z. Answer as "x,y,z".`,
  (eqs: string[]) =>
    `Three relay stations must synchronize:\n${eqs.join("\n")}\nFind x, y, z. Answer as "x,y,z".`,
]

const COMBO_NARRATIVES = [
  (n: number, k: number) =>
    `From ${n} available sentinel units, ${k} must be selected for deployment. How many distinct deployment configurations exist?`,
  (n: number, k: number) =>
    `A surveillance grid has ${n} nodes. Choose ${k} for active monitoring. How many ways can this be done?`,
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
  const degree = rng.int(3, 5)
  const coeffs: number[] = []
  for (let i = 0; i <= degree; i++) {
    coeffs.push(rng.int(-9, 9) || 1) // avoid 0 for leading
  }
  coeffs[0] = Math.abs(coeffs[0]) || 1 // positive leading
  const x = rng.int(-5, 5)

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
  for (let i = 0; i < 3; i++) {
    const row: number[] = []
    for (let j = 0; j < 3; j++) {
      row.push(rng.int(-9, 9))
    }
    m.push(row)
  }
  const d = det3(m)
  const narrative = MATRIX_NARRATIVES[variant % MATRIX_NARRATIVES.length]
  return {
    q: {
      type: "matrix_determinant",
      prompt: narrative(m),
      hint: "Compute the 3×3 determinant",
    },
    answer: String(d),
  }
}

function genModPow(rng: ReturnType<typeof createRng>, variant: number): { q: Omit<ChallengeQuestion, "index">; answer: string } {
  const a = rng.int(2, 50)
  const b = rng.int(10, 100)
  const m = rng.int(100, 997)
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

  // Random coefficients for 3 equations
  const eqs: { a: number; b: number; c: number; d: number }[] = []
  for (let i = 0; i < 3; i++) {
    const a = rng.int(-5, 5) || 1
    const b = rng.int(-5, 5) || 1
    const c = rng.int(-5, 5) || 1
    const d = a * x + b * y + c * z
    eqs.push({ a, b, c, d })
  }

  // Verify the system has a unique solution by checking determinant
  const coefMatrix = eqs.map((e) => [e.a, e.b, e.c])
  const d = det3(coefMatrix)
  if (d === 0) {
    // Degenerate — fix by forcing a known good system
    eqs[0] = { a: 1, b: 0, c: 0, d: x }
    eqs[1] = { a: 0, b: 1, c: 0, d: y }
    eqs[2] = { a: 0, b: 0, c: 1, d: z }
  }

  const eqStrings = eqs.map(
    (e) => `${e.a}x + ${e.b}y + ${e.c}z = ${e.d}`
  )

  const narrative = SYSTEM_NARRATIVES[variant % SYSTEM_NARRATIVES.length]
  return {
    q: {
      type: "system_of_equations",
      prompt: narrative(eqStrings),
      hint: "Solve the 3-variable linear system",
    },
    answer: `${x},${y},${z}`,
  }
}

function genCombinatorics(rng: ReturnType<typeof createRng>, variant: number): { q: Omit<ChallengeQuestion, "index">; answer: string } {
  const n = rng.int(8, 20)
  const k = rng.int(2, Math.min(n - 1, 8))
  const result = combinations(n, k)
  const narrative = COMBO_NARRATIVES[variant % COMBO_NARRATIVES.length]
  return {
    q: {
      type: "combinatorics",
      prompt: narrative(n, k),
      hint: `Calculate C(${n}, ${k})`,
    },
    answer: String(result),
  }
}

// ─── Main generator ─────────────────────────────────────────────────

const GENERATORS = [genPolynomial, genMatrix, genModPow, genSystem, genCombinatorics] as const

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
