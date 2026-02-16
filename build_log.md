# SABIAN CORE BUILD LOG

## 🎯 GOAL
Build and deploy **Conversational** and **Boardroom** modules.
Integrate with Supabase (for user data) and n8n (for intelligent flow).
Frontend will be WordPress → plug-and-play experience with no friction.

---

## ✅ TRACKING FORMAT
- All steps logged by day
- Tasks marked as:
  - `[x]` = Done
  - `[ ]` = Pending

---

## 🧠 USER TIERS (Defined)
- **Dom**: Small business — 50 mins/month
- **David**: Enterprise — 180 mins/month + premium unlocks

---

## 📆 DAY 1 – FOUNDATION (✅ Complete)
- [x] Repo + Codespace created
- [x] GitHub Copilot + Chat installed
- [x] `BUILD_LOG.md` initialized
- [x] `sabian_core/` folder created
- [x] Empty files:
  - `conversation.js`
  - `boardroom.js`
  - `supabase.js`
- [x] Supabase tables defined:
  - `users`: `id`, `name`, `tier`, `minutes`, `usage`
  - `sessions`: `id`, `user_id`, `module`, `transcript`, `summary`, `created_at`

---

## 📆 DAY 2 – SUPABASE CONNECTION
- [ ] Connect Supabase SDK in `supabase.js`
- [ ] Create `getUser(id)` and `logSession()` functions
- [ ] Test data read/write with local dummy user

---

## 📆 DAY 3 – N8N AGENT
- [ ] Create basic webhook flow:
  - Trigger → check minutes → route to GPT
  - Update usage log
- [ ] Deploy to n8n cloud and test webhook from local

---

## 📆 DAY 4 – CONVERSATIONAL ENGINE
- [ ] In `conversation.js`:
  - Prompt input → send to n8n → return GPT reply
  - Track usage + log to Supabase
- [ ] Handle tier-based checks (Dom = 50 mins)

---

## 📆 DAY 5 – BOARDROOM ENGINE
- [ ] In `boardroom.js`:
  - Generate summaries based on dummy data
  - Assign status: green / yellow / red
  - Save result to `sessions`
  - Prepare for PDF/MP3 download output

---

## 📆 DAY 6 – API LAYER
- [ ] Build `sabian_api.js`:
  - `startSession(module, user_id)`
  - `getSessionData(session_id)`
- [ ] Link with WordPress frontend via fetch

---

## 📆 DAY 7 – WORDPRESS HOOK
- [ ] Create simple button:
  - User clicks → triggers API call
- [ ] JSON response shows:
  - Summary
  - Flash status (R/Y/G)
  - Download link

---

## 📆 DAY 8 – TIER ENFORCEMENT
- [ ] Add access rules per tier (Dom vs David)
- [ ] Unlock premium for David (full transcript + insights)

---

## 📆 DAY 9 – TEST: DOM
- [ ] Create Dom in `users`
- [ ] Run full Conversational flow
- [ ] Confirm usage logging + response return

---

## 📆 DAY 10 – TEST: DAVID
- [ ] Create David in `users`
- [ ] Run Boardroom flow
- [ ] Confirm premium unlocks
- [ ] Validate full return data

---

## 📆 DAY 11 – BUGFIX + POLISH
- [ ] Retry logic if GPT/n8n fails
- [ ] Format responses cleanly
- [ ] Finalize status logic

---

## 📆 DAY 12 – FINAL DEPLOY
- [ ] Push final integration
- [ ] WordPress button calls endpoint correctly
- [ ] User sees result with no config
- [ ] Final commit + freeze phase 1

---

## 🔗 Supabase
- Dashboard: [insert link]
- API Key: [paste here if needed]

## 🔗 n8n
- Webhook URL: [paste here]
# SABIAN CORE BUILD LOG

## 🎯 GOAL
Build and deploy **Conversational** and **Boardroom** modules.
Integrate with Supabase (for user data) and n8n (for intelligent flow).
Frontend will be WordPress → plug-and-play experience with no friction.

---

## ✅ TRACKING FORMAT
- All steps logged by day
- Tasks marked as:
  - `[x]` = Done
  - `[ ]` = Pending

---

## 🧠 USER TIERS (Defined)
- **Dom**: Small business — 50 mins/month
- **David**: Enterprise — 180 mins/month + premium unlocks

---

## 📆 DAY 1 – FOUNDATION (✅ Complete)
- [x] Repo + Codespace created
- [x] GitHub Copilot + Chat installed
- [x] `BUILD_LOG.md` initialized
- [x] `sabian_core/` folder created
- [x] Empty files:
  - `conversation.js`
  - `boardroom.js`
  - `supabase.js`
- [x] Supabase tables defined:
  - `users`: `id`, `name`, `tier`, `minutes`, `usage`
  - `sessions`: `id`, `user_id`, `module`, `transcript`, `summary`, `created_at`

---

## 📆 DAY 2 – SUPABASE CONNECTION
- [ ] Connect Supabase SDK in `supabase.js`
- [ ] Create `getUser(id)` and `logSession()` functions
- [ ] Test data read/write with local dummy user

---

## 📆 DAY 3 – N8N AGENT
- [ ] Create basic webhook flow:
  - Trigger → check minutes → route to GPT
  - Update usage log
- [ ] Deploy to n8n cloud and test webhook from local

---

## 📆 DAY 4 – CONVERSATIONAL ENGINE
- [ ] In `conversation.js`:
  - Prompt input → send to n8n → return GPT reply
  - Track usage + log to Supabase
- [ ] Handle tier-based checks (Dom = 50 mins)

---

## 📆 DAY 5 – BOARDROOM ENGINE
- [ ] In `boardroom.js`:
  - Generate summaries based on dummy data
  - Assign status: green / yellow / red
  - Save result to `sessions`
  - Prepare for PDF/MP3 download output

---

## 📆 DAY 6 – API LAYER
- [ ] Build `sabian_api.js`:
  - `startSession(module, user_id)`
  - `getSessionData(session_id)`
- [ ] Link with WordPress frontend via fetch

---

## 📆 DAY 7 – WORDPRESS HOOK
- [ ] Create simple button:
  - User clicks → triggers API call
- [ ] JSON response shows:
  - Summary
  - Flash status (R/Y/G)
  - Download link

---

## 📆 DAY 8 – TIER ENFORCEMENT
- [ ] Add access rules per tier (Dom vs David)
- [ ] Unlock premium for David (full transcript + insights)

---

## 📆 DAY 9 – TEST: DOM
- [ ] Create Dom in `users`
- [ ] Run full Conversational flow
- [ ] Confirm usage logging + response return

---

## 📆 DAY 10 – TEST: DAVID
- [ ] Create David in `users`
- [ ] Run Boardroom flow
- [ ] Confirm premium unlocks
- [ ] Validate full return data

---

## 📆 DAY 11 – BUGFIX + POLISH
- [ ] Retry logic if GPT/n8n fails
- [ ] Format responses cleanly
- [ ] Finalize status logic

---

## 📆 DAY 12 – FINAL DEPLOY
- [ ] Push final integration
- [ ] WordPress button calls endpoint correctly
- [ ] User sees result with no config
- [ ] Final commit + freeze phase 1

---

## 🔗 Supabase
- Dashboard: [insert link]
- API Key: [paste here if needed]

## 🔗 n8n
- Webhook URL: [paste here]
