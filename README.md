# Online Poll and Survey Creation Tool (Case Study #166)

An enterprise-ready full-stack polling and survey platform built with **Express.js**, **MongoDB / Mongoose**, and **React**. Designed to support multi-option polling, strictly enforced single-vote rules per user, ownership-based authorization for poll closing, and real-time MongoDB aggregation pipelines for instant vote breakdown.

The frontend user interface faithfully replicates the neo-brutalist quiz card aesthetic with a warm golden-yellow canvas, bold typography, option cards (A., B., C., D.), and live results analytics.

---

## 📌 Problem Statement
A community platform wants users to create polls with multiple options and let other users vote. A user should be able to vote only once per poll, and poll creators should be able to close voting and view a breakdown of results.

---

## 🎯 Objectives & Outcomes Matrix

| Objective | Implementation Details | Outcome Status |
| :--- | :--- | :--- |
| **Mongoose Schemas** | Referenced `User`, `Poll`, and `Vote` collections with Mongoose schemas and subdocument options. | ✅ Completed |
| **CRUD Operations** | Create polls (`POST /api/polls`), list polls with filters (`GET /api/polls`), retrieve single poll (`GET /api/polls/:id`), edit (`PATCH /api/polls/:id`), delete (`DELETE /api/polls/:id`). | ✅ Completed |
| **Prevent Duplicate Voting** | Dual-layer protection: Pre-save query check in controller + Database engine level unique compound index `{ poll: 1, user: 1 }`. | ✅ Completed |
| **Ownership Authorization** | Middleware `isPollOwner` ensures only the poll creator can close voting (`PATCH /api/polls/:id/close`), edit, or delete the poll. | ✅ Completed |
| **Aggregation Query** | MongoDB Aggregation Pipeline (`$match`, `$group` by option, vote counts, percentage computation, and winner detection). | ✅ Completed |
| **Postman / Thunder Client** | Ready-to-import collections with preconfigured requests, assertions, and token variables. | ✅ Completed |
| **Environment Configuration** | Secure configuration via `.env` and `.env.example` for MongoDB URI, JWT secret, and ports. | ✅ Completed |
| **UI Matching Screenshot** | Warm yellow background, clean white rounded card with black offset drop-shadow, bold "Quiz Time" header with underline bar, and yellow option pills. | ✅ Completed |

---

## 🏗️ Architecture & Database Schemas

```
                       ┌───────────────────────┐
                       │      User Schema      │
                       ├───────────────────────┤
                       │ _id (ObjectId)        │
                       │ name (String)         │
                       │ email (String, unique)│
                       │ password (bcrypt hash)│
                       └───────────┬───────────┘
                                   │
              1:N Creator          │          1:N Voter
         ┌─────────────────────────┴────────────────────────┐
         │                                                  │
         ▼                                                  ▼
┌─────────────────────────┐                        ┌─────────────────────────┐
│       Poll Schema       │                        │       Vote Schema       │
├─────────────────────────┤                        ├─────────────────────────┤
│ _id (ObjectId)          │◄───────────────────────┤ poll (ObjectId -> Poll) │
│ title (String)          │       1:N Votes        │ user (ObjectId -> User) │
│ brand (String)          │                        │ optionId (ObjectId)     │
│ question (String)       │                        │ optionIndex (Number)    │
│ options: [{_id, text}]  │                        ├─────────────────────────┤
│ status (OPEN | CLOSED)  │                        │ UNIQUE INDEX:           │
│ creator (Ref -> User)   │                        │ { poll: 1, user: 1 }    │
│ closedAt (Date)         │                        └─────────────────────────┘
└─────────────────────────┘
```

### 1. `User` Schema (`src/models/User.js`)
- `name`: String, required, trimmed
- `email`: String, required, unique, lowercase, regex-validated
- `password`: String, hashed via `bcryptjs` with salt rounds
- Method: `matchPassword(enteredPassword)`

### 2. `Poll` Schema (`src/models/Poll.js`)
- `title`: String, default: `'Quiz Time'`
- `brand`: String, default: `'Liceria & Co.'`
- `question`: String, required
- `options`: Array of subdocuments `[{ _id: ObjectId, text: String }]` (validated $\ge$ 2 options)
- `status`: Enum `['OPEN', 'CLOSED']`, default: `'OPEN'`
- `creator`: ObjectId referencing `User`
- `category`: String (e.g., 'Lifestyle', 'Technology', 'General')
- `closedAt`: Date, populated when poll is closed

### 3. `Vote` Schema (`src/models/Vote.js`)
- `poll`: ObjectId referencing `Poll`, indexed
- `user`: ObjectId referencing `User`, indexed
- `optionId`: ObjectId matching an option in `poll.options`
- **Compound Unique Index**:
  ```javascript
  voteSchema.index({ poll: 1, user: 1 }, { unique: true });
  ```
  Guarantees that a user can never cast duplicate votes even under concurrent race conditions.

---

## 🔍 The MongoDB Aggregation Pipeline

Located in `src/controllers/pollController.js` (`getPollResults`):

```javascript
// Step 1: Match votes for the specific poll
// Step 2: Group by optionId and compute total count per option
const aggregationBreakdown = await Vote.aggregate([
  {
    $match: {
      poll: new mongoose.Types.ObjectId(pollId),
    },
  },
  {
    $group: {
      _id: '$optionId',
      voteCount: { $sum: 1 },
    },
  },
  {
    $sort: { voteCount: -1 },
  },
]);
```

The controller maps this back to all configured options so options with $0$ votes are cleanly represented, computes the percentage:
$$\text{percentage} = \frac{\text{voteCount}}{\text{totalVotes}} \times 100$$
and highlights the winning/leading option(s).

---

## 🛡️ Duplicate-Vote Prevention & Ownership Security

### 1. Duplicate Vote Prevention
1. **Application Layer**: Before persisting, the controller executes:
   ```javascript
   const existingVote = await Vote.findOne({ poll: poll._id, user: req.user._id });
   if (existingVote) {
     return res.status(400).json({
       success: false,
       message: 'Duplicate vote prevented: You have already cast your vote on this poll.'
     });
   }
   ```
2. **Database Engine Layer**: The compound unique index `{ poll: 1, user: 1 }` rejects any second insert with MongoDB error code `11000`.
3. **Closed Poll Check**: If `poll.status === 'CLOSED'`, voting is rejected with HTTP 400.

### 2. Ownership-Based Authorization (`isPollOwner` Middleware)
The middleware checks `poll.creator.toString() === req.user._id.toString()`. If a non-creator attempts to close or delete the poll, it returns:
```json
{
  "success": false,
  "message": "Forbidden: You are not authorized to perform this action. Only the poll creator can manage or close this poll."
}
```

---

## 📡 REST API Reference

### Authentication Endpoints
- `POST /api/auth/register` — Register a new account (`name`, `email`, `password`)
- `POST /api/auth/login` — Sign in and receive JWT token (`email`, `password`)
- `GET /api/auth/me` — Retrieve authenticated user profile (Requires `Bearer <token>`)

### Polls Endpoints
- `GET /api/polls` — List all polls with creator details, vote totals, and user vote status (supports `?status=OPEN`, `?search=keyword`)
- `GET /api/polls/:id` — Get single poll details
- `POST /api/polls` — Create a new poll (Requires Auth)
  ```json
  {
    "title": "Quiz Time",
    "brand": "Liceria & Co.",
    "question": "Which color do you like the most?",
    "options": ["Red", "Blue", "Green", "Yellow"],
    "category": "Lifestyle"
  }
  ```
- `PATCH /api/polls/:id` — Update poll question/category (Owner only)
- `DELETE /api/polls/:id` — Delete poll and associated votes (Owner only)

### Voting & Ownership Endpoints
- `POST /api/polls/:id/vote` — Cast vote on an option (Requires Auth, prevents duplicates)
  ```json
  {
    "optionId": "6ac265ff6d922d7fabe5fff9"
  }
  ```
- `PATCH /api/polls/:id/close` — Close voting (Creator/Owner only)
- `PATCH /api/polls/:id/reopen` — Reopen voting (Creator/Owner only)
- `GET /api/polls/:id/results` — Get aggregation breakdown by option with percentages and winner

---

## ⚡ Automated Test Suite Execution

An end-to-end test suite (`test-api.js`) is provided to verify all requirements:

```bash
npm run test:api
```

### Test Output:
```
====================================================
🧪 Starting API Verification & Case Study Tests
====================================================

✅ 1. Health Check GET /: PASSED
✅ 2. Auth Login (Owner Liceria): PASSED
✅ 3. Auth Login (Voter Alex): PASSED
✅ 4. Auth Register (New User): PASSED
✅ 5. GET /api/polls: Found polls
✅ 6. GET /api/polls/:id: PASSED
✅ 7. POST /api/polls/:id/vote (First vote): PASSED
🔒 8. DUPLICATE VOTE PREVENTION TEST: PASSED (Blocked 400)
🛡️ 9. OWNERSHIP AUTHORIZATION (Non-owner close blocked): PASSED (Forbidden 403)
📊 10. AGGREGATION PIPELINE TEST GET /api/polls/:id/results: PASSED ($group by option)
🔒 11. OWNER CLOSE POLL TEST: PASSED (Status CLOSED)
🛑 12. VOTE ON CLOSED POLL TEST: PASSED (Blocked 400)
✨ 13. CREATE POLL (POST /api/polls): PASSED
🔓 14. REOPEN POLL TEST: PASSED

====================================================
🎉 ALL BACKEND OBJECTIVES & OUTCOMES VERIFIED 100%!
====================================================
```

---

## 🚀 How to Run Locally

### 1. Prerequisites
- Node.js (v18+)
- MongoDB (Running locally or MongoDB Atlas URI)

### 2. Setup Backend
```bash
# 1. Install dependencies
npm install

# 2. Seed database with initial test users, sample votes, and photo poll
npm run seed

# 3. Start Express server (runs on port 5001)
npm run dev
```

### 3. Setup Frontend
```bash
# In another terminal window:
cd frontend
npm install
npm run dev
```
Open [http://localhost:5173](http://localhost:5173) in your browser!

### 4. Or Run Both Concurrently:
```bash
npm run dev:all
```

---

## 👥 Seed Demo Accounts (Password for all: `password123`)

| Name | Email | Role |
| :--- | :--- | :--- |
| **Liceria & Co.** | `liceria@example.com` | **Poll Creator / Owner** of "Quiz Time" |
| **Alex Johnson** | `alex@example.com` | Registered Voter |
| **Sarah Miller** | `sarah@example.com` | Registered Voter |
| **David Chen** | `david@example.com` | Registered Voter |

*(The frontend UI includes a 1-click account switcher so you can switch users in 1 second!)*

---

## 🚢 Deployment Guide

### A. Deploy Backend (Render / Railway)
1. **Create a MongoDB Atlas Cluster**:
   - Go to [MongoDB Atlas](https://www.mongodb.com/atlas) and create a free M0 cluster.
   - Whitelist IP `0.0.0.0/0` under Network Access.
   - Create a database user and copy the connection string:
     `mongodb+srv://<username>:<password>@cluster0.mongodb.net/poll_survey_db?retryWrites=true&w=majority`
2. **Deploy on Render**:
   - Link your GitHub repository.
   - Build Command: `npm install`
   - Start Command: `node src/server.js`
   - Environment Variables:
     - `PORT`: `5001`
     - `NODE_ENV`: `production`
     - `MONGO_URI`: `<Your MongoDB Atlas connection URI>`
     - `JWT_SECRET`: `<A strong random secret string>`
     - `CLIENT_URL`: `<Your Vercel frontend URL>`

### B. Deploy Frontend (Vercel / Netlify)
1. **Deploy on Vercel**:
   - Root directory: `frontend`
   - Framework Preset: `Vite`
   - Build Command: `npm run build`
   - Output Directory: `dist`
   - Environment Variables:
     - `VITE_API_URL`: `https://your-backend-service.onrender.com/api`

---

## 📁 Postman & Thunder Client Files
- `postman_collection.json`: Import into Postman. Includes automatic bearer token saving and environment variables.
- `thunder-collection_online-poll-system.json`: Import into VS Code Thunder Client extension.
