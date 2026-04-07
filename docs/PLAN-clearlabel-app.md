# ClearLabel — Food Ingredient Analyzer

## Goal
Build a web app that parses food ingredient lists, scores them against user dietary preferences, and renders color-coded results via OpenRouter (Claude 3.5 Sonnet / Gemini 1.5 Pro).

**Time budget:** 2 hours | **Stack:** Vanilla HTML/CSS/JS + OpenRouter API

---

## Phase 1: Frontend Scaffold & Form Inputs
> **Blocked by:** None

- [ ] **1.1** Create `<textarea id="raw_ingredients">` with placeholder "Paste ingredients here..."
- [ ] **1.2** Create `<div id="dietary_prefs">` checkbox group — values: `Vegan`, `Gluten-Free`
- [ ] **1.3** Create `<select id="tone_selector">` — options: `Standard`, `Fitness Coach`, `5-Year-Old`
- [ ] **1.4** Create `<button id="btn_analyze">Analyze</button>`
- [ ] **Verify:** Open `index.html` in browser — all 4 inputs visible and interactive

---

## Phase 2: API Integration & Prompt Engineering
> **Blocked by:** Phase 1

- [ ] **2.1** Wire `btn_analyze` click to `POST https://openrouter.ai/api/v1/chat/completions` (model: `anthropic/claude-3.5-sonnet`)
- [ ] **2.2** Assemble system prompt: concatenate `raw_ingredients` value + active `dietary_prefs` checkboxes + `tone_selector` value
- [ ] **2.3** Enforce strict JSON-only output via system prompt — schema:
  ```json
  {
    "overall_score": 45,
    "one_sentence_verdict": "String",
    "ingredients": [
      { "name": "String", "plain_english": "String", "status": "safe|caution|avoid", "reason": "String" }
    ],
    "better_alternative": "String"
  }
  ```
- [ ] **2.4** Parse `response.choices[0].message.content` via `JSON.parse()`; log result to console
- [ ] **Verify:** Submit "High Fructose Corn Syrup, Gelatin" — valid JSON object logged to DevTools console

---

## Phase 3: Results UI & Data Binding
> **Blocked by:** Phase 2

- [ ] **3.1** Create `<progress id="overall_score">` bar bound to `overall_score` (0-100)
- [ ] **3.2** Create `<p id="verdict">` text component bound to `one_sentence_verdict`
- [ ] **3.3** Create `<div id="ingredients_list">` repeater — iterate `ingredients` array via `innerHTML` loop
- [ ] **3.4** Per ingredient, render card: `<h3>` (name) + `<p>` (plain_english) + `<footer>` (reason)
- [ ] **Verify:** UI renders score bar + verdict text + ingredient cards on valid API response

---

## Phase 4: Dynamic Styling & Edge Cases
> **Blocked by:** Phase 3

- [ ] **4.1** Map `status` to card background color:
  - `safe` -> `#dcfce7` (green)
  - `caution` -> `#fef08a` (yellow)
  - `avoid` -> `#fee2e2` (red)
- [ ] **4.2** Show loading spinner (`#spinner`) while API fetch is pending; hide on completion/error
- [ ] **4.3** Add static `<p class="disclaimer">Not Medical Advice.</p>` below results
- [ ] **4.4** Handle API error gracefully — show user-facing message if fetch or JSON.parse fails
- [ ] **Verify:** Full flow: input -> loading spinner -> color-coded results -> disclaimer visible

---

## UAT Checklist (Done When All Pass)

- [ ] **UAT 1 - Input:** User can select "Vegan" checkbox + "Standard" tone, form submits without error
- [ ] **UAT 2 - API:** "High Fructose Corn Syrup, Gelatin" returns a valid, parseable JSON object
- [ ] **UAT 3 - Logic:** "Gelatin" returns `status: "avoid"` when "Vegan" is active
- [ ] **UAT 4 - UI:** Ingredient cards render separately with correct color-coded backgrounds

---

## Notes

- **API Key:** Prompt the user to paste their OpenRouter key into a `<input id="api_key">` field — do NOT hard-code in source
- **CORS:** OpenRouter supports browser-side fetch calls; no backend proxy needed
- **Tone injection:** Append tone instruction to system prompt (e.g., "Explain like I am 5 years old")
- **Fallback model:** If `anthropic/claude-3.5-sonnet` fails, retry with `google/gemini-1.5-pro`
