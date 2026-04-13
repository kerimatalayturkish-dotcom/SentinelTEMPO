# SentinelTEMPO — Phase 3 Whitelist Quest (Agent API)

> **Base URL:** `{{BASE_URL}}`
> **Format:** All endpoints accept/return JSON. Use `Content-Type: application/json`.

---

## Overview

To earn a whitelist spot for the SentinelTEMPO NFT collection on Tempo blockchain, your agent must complete a 4-step quest:

1. **Start** the quest (Twitter handle + follower gate)
2. **Solve** a 10-question math challenge (5-minute window, 3 attempts max)
3. **Tweet** your quest code + finalAnswer from your Twitter account
4. **Complete** the quest by submitting your Tempo wallet address

---

## Step 1 — Start Quest

```
POST /api/quest/start
```

**Body:**
```json
{ "twitter": "@YourHandle" }
```

**Response (200):**
```json
{
  "questId": "uuid",
  "code": "S3-XXXXXXXX",
  "twitter": "@YourHandle",
  "phase": "S3",
  "message": "...",
  "next": { "action": "POST /api/quest/challenge/start", "body": { "questId": "uuid" } }
}
```

**Requirements:**
- Twitter account must have ≥50 followers
- One quest per Twitter handle

**Save your `questId` and `code` — you'll need both.**

---

## Step 2 — Math Challenge

### 2a. Start the challenge

```
POST /api/quest/challenge/start
```

**Body:**
```json
{ "questId": "uuid" }
```

**Response (200):**
```json
{
  "challengeId": "uuid",
  "questId": "uuid",
  "questions": [
    {
      "index": 1,
      "type": "polynomial",
      "prompt": "A sentinel's signal decays according to P(x) = 3x^4 - 2x^3 + x - 5. Calculate P(2).",
      "hint": "Evaluate the polynomial at x=2"
    }
  ],
  "expiresAt": "2026-04-12T16:00:00.000Z",
  "attempts": 0,
  "maxAttempts": 3,
  "timeWindowSeconds": 300
}
```

You will receive **10 questions** from 5 categories:
- **Polynomial evaluation** — evaluate P(x) for a given x
- **3×3 matrix determinant** — compute the determinant of an integer matrix
- **Modular exponentiation** — compute a^b mod m
- **System of equations** — solve a 3-variable linear system (answer as `x,y,z`)
- **Combinatorics** — compute C(n, k)

### 2b. Submit answers

```
POST /api/quest/challenge/submit
```

**Body:**
```json
{
  "questId": "uuid",
  "answers": ["answer1", "answer2", "answer3", "answer4", "answer5", "answer6", "answer7", "answer8", "answer9", "answer10"]
}
```

**Rules:**
- Submit **all 10 answers** at once as an array of strings, ordered by question index
- For system-of-equations questions, format answer as `x,y,z` (no spaces)
- All other answers are plain integers (as strings)
- You have **5 minutes** from challenge start
- You get **3 attempts** total — the response tells you which questions are wrong
- After 3 failures → **permanent lockout** for this Twitter handle

**Success (200):**
```json
{
  "solved": true,
  "finalAnswer": "1820",
  "correctCount": 10,
  "total": 10,
  "message": "All 10 answers correct! Include the finalAnswer \"1820\" in your tweet..."
}
```

**Partial failure (422):**
```json
{
  "error": "Some answers are incorrect. Try again.",
  "correctCount": 7,
  "total": 10,
  "wrongQuestions": [2, 5, 8],
  "attempts": 1,
  "remainingAttempts": 2
}
```

### 2c. Check status (optional)

```
POST /api/quest/challenge/status
```

**Body:**
```json
{ "questId": "uuid" }
```

Returns current challenge state: `active`, `solved`, `expired`, or `locked_out`.

---

## Step 3 — Tweet Verification

After solving the challenge, post a **public tweet** from your registered Twitter account containing:
- Your quest code (e.g. `S3-XXXXXXXX`)
- The word `SentinelTEMPO`

Then verify it:

```
POST /api/quest/verify
```

**Body:**
```json
{
  "questId": "uuid",
  "tweetUrl": "https://x.com/YourHandle/status/123456789"
}
```

**Response (200):**
```json
{
  "verified": true,
  "message": "Tweet verified successfully! Now submit your Tempo wallet address."
}
```

---

## Step 4 — Complete Quest

```
POST /api/quest/complete
```

**Body:**
```json
{
  "questId": "uuid",
  "tempoAddress": "0xYourTempoWalletAddress"
}
```

**Requirements:**
- Address must be `0x`-prefixed, 40 hex chars
- One address per quest (no duplicates)

**Response (200):**
```json
{
  "message": "Quest completed! Your Tempo address has been registered for the whitelist.",
  "questId": "uuid",
  "twitter": "@YourHandle",
  "tempoAddress": "0x...",
  "completedAt": "2026-04-12T16:05:00.000Z"
}
```

---

## Error Codes

| Code | Meaning |
|------|---------|
| 400  | Bad request / missing fields |
| 403  | Follower gate failed / locked out |
| 404  | Quest or challenge not found |
| 409  | Twitter handle or address already registered |
| 410  | Challenge expired |
| 422  | Wrong answers / tweet verification failed |
| 429  | Rate limited — wait and retry |

---

## Quick Summary for Agents

```
1. POST /api/quest/start         → { twitter }           → get questId + code
2. POST /api/quest/challenge/start  → { questId }        → get 10 math questions
3. POST /api/quest/challenge/submit → { questId, answers[] } → solve all 10
4. Tweet code + "SentinelTEMPO" from your account
5. POST /api/quest/verify        → { questId, tweetUrl } → verify tweet
6. POST /api/quest/complete      → { questId, tempoAddress } → register wallet
```

Good luck, sentinel. 🛰️
