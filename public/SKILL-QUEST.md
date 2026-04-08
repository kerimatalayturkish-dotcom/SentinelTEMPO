---
name: sentinel-tempo-quest
description: >
  Complete the SentinelTEMPO Agent Quest to get whitelisted.
  Post a verification tweet from your X account, prove ownership,
  and register your Tempo wallet address. No payment required — all
  endpoints are free. Includes Twitter/X setup instructions if the
  agent does not already have tweet access.
---

# SentinelTEMPO — Agent Quest (Whitelist Registration)

Complete a quest to register your Tempo wallet address for the
SentinelTEMPO whitelist. The quest verifies you control a Twitter/X account
and links it to a Tempo wallet.

**No payment or crypto is needed — all quest endpoints are free.**

---

## IMPORTANT: Before Starting — Twitter/X Access Check (Phase 0)

Before running the quest, you **must** be able to post tweets. Run this check first.

### Step 0.1 — Detect your operating system

Determine the OS to use the correct paths:

| OS | Workspace path |
|---|---|
| **macOS / Linux** | `~/.openclaw/workspace/twitter-quick/` |
| **Windows** | `%USERPROFILE%\.openclaw\workspace\twitter-quick\` |

### Step 0.2 — Check if `twitter-quick` workspace exists

Look for the `.env` file inside the `twitter-quick` workspace folder:

- **macOS / Linux**: Check if `~/.openclaw/workspace/twitter-quick/.env` exists
- **Windows**: Check if `%USERPROFILE%\.openclaw\workspace\twitter-quick\.env` exists

**If the `.env` file exists AND contains non-empty values for all 4 keys** (`TWITTER_API_KEY`, `TWITTER_API_KEY_SECRET`, `TWITTER_ACCESS_TOKEN`, `TWITTER_ACCESS_TOKEN_SECRET`):
→ **Skip to [Quest Overview](#quest-overview)** and begin the quest.

**If the `.env` file does NOT exist or is missing keys:**
→ Continue to Step 0.3 below.

### Step 0.3 — Guide the user to get Twitter/X API credentials

Tell the user:

> I need Twitter/X API credentials to post tweets on your behalf for this quest.
> You'll need to create a free developer account and generate 4 keys.
> This is a one-time setup — the keys don't expire.

**Instructions to give the user:**

1. Go to **https://developer.x.com** and sign in with your X/Twitter account
2. If you don't have a developer account, click **"Sign up for Free Account"**
3. Complete the required fields (describe your use: "AI agent posting tweets")
4. Once in the Developer Portal, go to **Projects & Apps** in the sidebar
5. **Create a new Project** → give it any name (e.g. "My AI Agent")
6. **Create an App** inside that project → give it any name
7. Go to the App's **Settings** tab → **User authentication settings** → click **Set up**
8. Set **App permissions** to **Read and Write** ← this is critical
9. Set **Type of App** to **Web App, Automated App or Bot**
10. For Callback URL and Website URL, enter `https://example.com` (placeholder, not used)
11. Click **Save**
12. Go to the **Keys and Tokens** tab
13. Under **Consumer Keys**, click **Regenerate** → copy **API Key** and **API Key Secret**
14. Under **Authentication Tokens**, click **Generate** → copy **Access Token** and **Access Token Secret**
15. Send me all 4 values

**Tell the user these 4 keys are OAuth 1.0a credentials. They never expire and allow tweeting from their account.**

### Step 0.4 — Create the `twitter-quick` workspace

Once the user provides the 4 keys, set up the workspace.

**If you have exec/shell access**, create the files automatically:

#### macOS / Linux:
```bash
mkdir -p ~/.openclaw/workspace/twitter-quick
cd ~/.openclaw/workspace/twitter-quick
```

#### Windows (PowerShell):
```powershell
New-Item -ItemType Directory -Force -Path "$env:USERPROFILE\.openclaw\workspace\twitter-quick"
Set-Location "$env:USERPROFILE\.openclaw\workspace\twitter-quick"
```

**If you do NOT have exec/shell access**, tell the user to create the folder manually at the path shown above and create the files described below.

### Step 0.5 — Create `package.json`

Write this file inside the `twitter-quick` folder:

```json
{
  "name": "twitter-quick",
  "private": true,
  "type": "module",
  "dependencies": {
    "dotenv": "^16.4.5",
    "oauth-1.0a": "^2.2.6",
    "node-fetch": "^3.3.2"
  }
}
```

### Step 0.6 — Create `tweet.js`

Write this file inside the `twitter-quick` folder:

```javascript
import 'dotenv/config';
import fetch from 'node-fetch';
import OAuth from 'oauth-1.0a';
import crypto from 'crypto';

const {
  TWITTER_API_KEY,
  TWITTER_API_KEY_SECRET,
  TWITTER_ACCESS_TOKEN,
  TWITTER_ACCESS_TOKEN_SECRET,
} = process.env;

function requireEnv(name, value) {
  if (!value) {
    console.error(`Missing env var: ${name}`);
    process.exit(2);
  }
}

requireEnv('TWITTER_API_KEY', TWITTER_API_KEY);
requireEnv('TWITTER_API_KEY_SECRET', TWITTER_API_KEY_SECRET);
requireEnv('TWITTER_ACCESS_TOKEN', TWITTER_ACCESS_TOKEN);
requireEnv('TWITTER_ACCESS_TOKEN_SECRET', TWITTER_ACCESS_TOKEN_SECRET);

const text = process.argv.slice(2).join(' ').trim();
if (!text) {
  console.error('Usage: node tweet.js "your tweet text here"');
  process.exit(2);
}

const oauth = new OAuth({
  consumer: { key: TWITTER_API_KEY, secret: TWITTER_API_KEY_SECRET },
  signature_method: 'HMAC-SHA1',
  hash_function(baseString, key) {
    return crypto.createHmac('sha1', key).update(baseString).digest('base64');
  },
});

const token = { key: TWITTER_ACCESS_TOKEN, secret: TWITTER_ACCESS_TOKEN_SECRET };

const url = 'https://api.twitter.com/2/tweets';
const requestData = { url, method: 'POST' };
const authHeader = oauth.toHeader(oauth.authorize(requestData, token));

const resp = await fetch(url, {
  method: 'POST',
  headers: {
    ...authHeader,
    'content-type': 'application/json',
  },
  body: JSON.stringify({ text }),
});

const bodyText = await resp.text();
let body;
try { body = JSON.parse(bodyText); } catch { body = bodyText; }

if (!resp.ok) {
  console.error('Tweet failed:', resp.status, resp.statusText);
  console.error(body);
  process.exit(1);
}

console.log('Tweet posted OK. Response:');
console.log(JSON.stringify(body));
```

### Step 0.7 — Create `.env`

Write the `.env` file using the 4 keys the user provided:

```
TWITTER_API_KEY=<user's API Key>
TWITTER_API_KEY_SECRET=<user's API Key Secret>
TWITTER_ACCESS_TOKEN=<user's Access Token>
TWITTER_ACCESS_TOKEN_SECRET=<user's Access Token Secret>
```

### Step 0.8 — Install dependencies

Run this inside the `twitter-quick` folder:

```bash
npm install
```

### Step 0.9 — Test tweet (and delete)

Post a test tweet to confirm everything works:

#### macOS / Linux:
```bash
cd ~/.openclaw/workspace/twitter-quick
node tweet.js "Testing my AI agent setup — please ignore this tweet."
```

#### Windows (PowerShell):
```powershell
Set-Location "$env:USERPROFILE\.openclaw\workspace\twitter-quick"
node tweet.js "Testing my AI agent setup -- please ignore this tweet."
```

**If the tweet posts successfully**, the output will contain a tweet `id`.

Now **delete the test tweet** to keep the user's timeline clean. Use the tweet ID from the response:

```javascript
// delete-tweet.js — run with: node delete-tweet.js <TWEET_ID>
import 'dotenv/config';
import fetch from 'node-fetch';
import OAuth from 'oauth-1.0a';
import crypto from 'crypto';

const { TWITTER_API_KEY, TWITTER_API_KEY_SECRET, TWITTER_ACCESS_TOKEN, TWITTER_ACCESS_TOKEN_SECRET } = process.env;
const tweetId = process.argv[2];
if (!tweetId) { console.error('Usage: node delete-tweet.js <TWEET_ID>'); process.exit(2); }

const oauth = new OAuth({
  consumer: { key: TWITTER_API_KEY, secret: TWITTER_API_KEY_SECRET },
  signature_method: 'HMAC-SHA1',
  hash_function(baseString, key) { return crypto.createHmac('sha1', key).update(baseString).digest('base64'); },
});
const token = { key: TWITTER_ACCESS_TOKEN, secret: TWITTER_ACCESS_TOKEN_SECRET };
const url = `https://api.twitter.com/2/tweets/${tweetId}`;
const authHeader = oauth.toHeader(oauth.authorize({ url, method: 'DELETE' }, token));

const resp = await fetch(url, { method: 'DELETE', headers: { ...authHeader } });
const body = await resp.json();
if (resp.ok && body.data?.deleted) { console.log('Test tweet deleted.'); }
else { console.error('Delete failed:', resp.status, body); }
```

You can create this as `delete-tweet.js` in the same folder, run it with the tweet ID, then delete the script file.

**If the test tweet fails:**
- `403 Forbidden` → App permissions are not set to "Read and Write". User must go to developer.x.com → App Settings → User authentication → change to Read and Write, then regenerate all 4 keys.
- `401 Unauthorized` → Keys are wrong. Ask user to double-check and re-paste.
- `429 Too Many Requests` → Rate limited. Wait a minute and retry.

### Step 0.10 — Twitter setup complete

Once the test tweet posts and deletes successfully, tell the user:

> ✅ Twitter setup complete! Your AI agent can now tweet from your account.
> Proceeding to the SentinelTEMPO whitelist quest...

Now proceed to the quest below.

---

## Network & Project Info

| Field | Value |
|---|---|
| Blockchain | Tempo (EVM-compatible L1) |
| Chain ID | 42431 |
| NFT Contract | `0x8e8e6e2CcE41Ea982bc730dB489e913766F16e78` |
| Collection | SentinelTEMPO — 10,000 generative NFTs |

---

## Base URL

```
BASE_URL = https://YOUR_RENDER_DOMAIN
```

All quest endpoints are under `/api/quest/`.

---

## Quest Overview

The quest has 4 steps, executed **in order**:

1. **Start** — Register your X/Twitter handle → receive a unique verification code
2. **Tweet** — Post a public tweet containing the code and "SentinelTEMPO"
3. **Verify** — Submit the tweet URL for automated verification
4. **Complete** — Submit your Tempo wallet address for the whitelist

---

## Rules

- One quest per Twitter handle
- One Tempo address per quest (no duplicate addresses)
- The tweet must be **public** and remain posted
- Registered addresses are stored for a future whitelist

---

## Endpoints

### 1. GET /api/quest/info — Quest Instructions (free)

Returns structured JSON describing the full quest flow. Read this first.

```bash
curl -s https://YOUR_RENDER_DOMAIN/api/quest/info
```

**Response:**
```json
{
  "name": "SentinelTEMPO Agent Quest",
  "description": "Complete this quest to register your Tempo wallet address for a future whitelist.",
  "steps": [
    { "step": 1, "action": "POST /api/quest/start", "body": { "twitter": "@your_handle" } },
    { "step": 2, "action": "Post a tweet on X", "example_tweet": "..." },
    { "step": 3, "action": "POST /api/quest/verify", "body": { "questId": "...", "tweetUrl": "..." } },
    { "step": 4, "action": "POST /api/quest/complete", "body": { "questId": "...", "tempoAddress": "0x..." } }
  ],
  "rules": ["One quest per Twitter handle", "One Tempo address per quest", "..."]
}
```

---

### 2. POST /api/quest/start — Begin the Quest (free)

Register your Twitter/X handle to start. Returns a `questId` and a unique `code`.

```bash
curl -s -X POST -H "Content-Type: application/json" \
  -d '{"twitter": "@myhandle"}' \
  https://YOUR_RENDER_DOMAIN/api/quest/start
```

**Request body:**
```json
{ "twitter": "@myhandle" }
```

**Success response (200):**
```json
{
  "questId": "a1b2c3d4-...",
  "code": "SQ-1A2B3C4D",
  "twitter": "@myhandle",
  "message": "Quest started! Now post a public tweet from @myhandle containing the code \"SQ-1A2B3C4D\" and the word \"SentinelTEMPO\". Then submit the tweet URL to POST /api/quest/verify.",
  "next": {
    "action": "POST /api/quest/verify",
    "body": { "questId": "a1b2c3d4-...", "tweetUrl": "https://x.com/..." }
  }
}
```

**Duplicate handle (409):**
```json
{
  "error": "This Twitter handle already has a quest. If this is you, use the questId from your original /start response.",
  "hint": "Submit your tweet URL to POST /api/quest/verify."
}
```

> **IMPORTANT:** The questId and code are only returned once — in the original `/start` response. Save them immediately.

---

### 3. Post a Tweet on X (agent action)

Post a **public** tweet from the registered handle. The tweet **must contain**:
- The exact verification code (e.g. `SQ-1A2B3C4D`)
- The word `SentinelTEMPO`

**Example tweet text:**
```
I just completed a quest for SentinelTEMPO — the first agentic NFT collection on Tempo Chain 🔴⛓️ SQ-1A2B3C4D #SentinelTEMPO
```

**To post the tweet**, use the `tweet.js` tool set up in Phase 0:

macOS / Linux:
```bash
cd ~/.openclaw/workspace/twitter-quick
node tweet.js "I just completed a quest for SentinelTEMPO — the first agentic NFT collection on Tempo Chain 🔴⛓️ SQ-1A2B3C4D #SentinelTEMPO"
```

Windows (PowerShell):
```powershell
Set-Location "$env:USERPROFILE\.openclaw\workspace\twitter-quick"
node tweet.js "I just completed a quest for SentinelTEMPO -- the first agentic NFT collection on Tempo Chain SQ-1A2B3C4D #SentinelTEMPO"
```

The response contains the tweet `id`. Construct the tweet URL as:
```
https://x.com/<handle>/status/<tweet_id>
```

Save this URL for the next step.

---

### 4. POST /api/quest/verify — Verify the Tweet (free)

Submit the tweet URL for automated verification. The server checks:
- Tweet exists and is public (via X oEmbed API)
- Tweet was posted by the registered handle
- Tweet contains the verification code

```bash
curl -s -X POST -H "Content-Type: application/json" \
  -d '{"questId": "a1b2c3d4-...", "tweetUrl": "https://x.com/myhandle/status/123456789"}' \
  https://YOUR_RENDER_DOMAIN/api/quest/verify
```

**Request body:**
```json
{
  "questId": "a1b2c3d4-...",
  "tweetUrl": "https://x.com/myhandle/status/123456789"
}
```

**Success response (200):**
```json
{
  "message": "Tweet verified successfully! Now submit your Tempo wallet address.",
  "questId": "a1b2c3d4-...",
  "verified": true,
  "next": {
    "action": "POST /api/quest/complete",
    "body": { "questId": "a1b2c3d4-...", "tempoAddress": "0x..." }
  }
}
```

**Verification failed (422):**
```json
{
  "error": "Tweet verification failed.",
  "reason": "Tweet does not contain the verification code",
  "hint": "Make sure the tweet is public, posted from @myhandle, and contains the code \"SQ-1A2B3C4D\"."
}
```

---

### 5. POST /api/quest/complete — Submit Wallet Address (free)

After tweet verification, submit your Tempo wallet address to register for the whitelist.

```bash
curl -s -X POST -H "Content-Type: application/json" \
  -d '{"questId": "a1b2c3d4-...", "tempoAddress": "0xYOUR_WALLET_ADDRESS"}' \
  https://YOUR_RENDER_DOMAIN/api/quest/complete
```

**Request body:**
```json
{
  "questId": "a1b2c3d4-...",
  "tempoAddress": "0x1234567890abcdef1234567890abcdef12345678"
}
```

**Success response (200):**
```json
{
  "message": "Quest completed! Your Tempo address has been registered for the whitelist.",
  "questId": "a1b2c3d4-...",
  "twitter": "@myhandle",
  "tempoAddress": "0x1234...",
  "completedAt": "2026-04-04T12:00:00.000Z"
}
```

**Tweet not verified yet (400):**
```json
{
  "error": "Tweet not yet verified. Complete POST /api/quest/verify first."
}
```

**Address already used (409):**
```json
{
  "error": "This Tempo address is already registered to another quest."
}
```

---

## Step-by-Step Agent Guide

### When a user asks to join the whitelist / complete the quest:

**Phase 0 — Check Twitter access** (see above):
- Check if `twitter-quick` workspace + `.env` exist
- If not → guide user through credential setup (Steps 0.3–0.9)
- If yes → proceed

**Step 1 — Read quest info:**
```bash
curl -s https://YOUR_RENDER_DOMAIN/api/quest/info
```

**Step 2 — Ask for Twitter handle** and start quest:
```bash
curl -s -X POST -H "Content-Type: application/json" \
  -d '{"twitter": "@theirhandle"}' \
  https://YOUR_RENDER_DOMAIN/api/quest/start
```
Save the `questId` and `code` from the response.

**Step 3 — Post the tweet** using the `twitter-quick` tool:

Navigate to the `twitter-quick` workspace and run:
```bash
node tweet.js "<tweet text containing the code and SentinelTEMPO>"
```
Extract the tweet `id` from the response and construct the URL:
`https://x.com/<handle>/status/<tweet_id>`

**Step 4 — Verify the tweet:**
```bash
curl -s -X POST -H "Content-Type: application/json" \
  -d '{"questId": "...", "tweetUrl": "https://x.com/handle/status/123"}' \
  https://YOUR_RENDER_DOMAIN/api/quest/verify
```

**Step 5 — Ask for Tempo wallet address** and complete:
```bash
curl -s -X POST -H "Content-Type: application/json" \
  -d '{"questId": "...", "tempoAddress": "0xWALLET"}' \
  https://YOUR_RENDER_DOMAIN/api/quest/complete
```

**Step 6 — Confirm to user** that they are registered for the whitelist.

---

## Error Reference

| HTTP Code | Meaning | What to Do |
|---|---|---|
| 400 | Bad request / missing fields | Check the required body fields |
| 404 | Quest not found | Invalid questId — start a new quest |
| 409 | Duplicate handle or address | Handle already has a quest, or address already registered |
| 422 | Tweet verification failed | Tweet is not public, wrong handle, or missing code |
| 429 | Rate limited | Too many requests — wait and retry after the `Retry-After` header value |

---

## User Intent → Action Mapping

| User says | What to do |
|---|---|
| "join whitelist" / "get whitelisted" | Run the full quest flow (Steps 1–6 above) |
| "start quest" / "begin quest" | Call `POST /api/quest/start` with their Twitter handle |
| "verify my tweet" | Call `POST /api/quest/verify` with their questId + tweet URL |
| "register my wallet" / "submit address" | Call `POST /api/quest/complete` with questId + tempoAddress |
| "quest status" / "quest info" | Call `GET /api/quest/info` |

---

## Response Formatting

**Quest started:**
```
🔴 SentinelTEMPO Quest Started!

🐦 Handle: @myhandle
🔑 Code: SQ-1A2B3C4D

Next: Post a public tweet containing your code and "SentinelTEMPO",
then come back with the tweet URL.
```

**Tweet verified:**
```
✅ Tweet Verified!

Your tweet has been confirmed. Now submit your Tempo wallet address
to complete the quest and register for the whitelist.
```

**Quest complete:**
```
🎉 Quest Complete!

🐦 Twitter: @myhandle
👛 Tempo Address: 0x1234...5678
📅 Completed: 2026-04-04

Your address is registered for the SentinelTEMPO whitelist!
```
