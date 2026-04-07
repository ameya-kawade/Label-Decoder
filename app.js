/**
 * app.js — ClearLabel AI Frontend
 *
 * Handles form submission, API communication, and dashboard rendering.
 * Uses DOM APIs (not innerHTML) to prevent XSS from AI-generated content.
 */

// ─── Constants ────────────────────────────────────────────────────────────────

const API_ENDPOINT   = '/api/analyze';
const ANALYSIS_TONE  = 'Clinical Researcher (Fact-based)';
const ANIMATION_CIRCUMFERENCE = 552.9; // 2π × r (r = 88)

const STATUS_CONFIG = {
    safe: {
        bg:        'bg-primary/5',
        strip:     'bg-primary',
        badge:     'bg-primary/10 text-primary',
        iconColor: 'text-primary',
        iconName:  'verified',
        label:     'Verified Safe',
    },
    caution: {
        bg:        'bg-secondary/5',
        strip:     'bg-secondary',
        badge:     'bg-secondary/10 text-secondary',
        iconColor: 'text-secondary',
        iconName:  'warning',
        label:     'Monitor Intake',
    },
    avoid: {
        bg:        'bg-tertiary/5 border border-tertiary/10',
        strip:     'bg-tertiary',
        badge:     'bg-tertiary/10 text-tertiary',
        iconColor: 'text-tertiary',
        iconName:  'dangerous',
        label:     'Restricted Compound',
    },
};

// ─── DOM References ───────────────────────────────────────────────────────────

const inputView         = document.getElementById('input-view');
const dashboardView     = document.getElementById('dashboard-view');
const ingredientForm    = document.getElementById('ingredient-form');
const ingredientInput   = document.getElementById('ingredient-input');
const preferencesInput  = document.getElementById('preferences-input');
const analyzeBtn        = document.getElementById('analyze-btn');
const loadingEl         = document.getElementById('loading');
const backBtn           = document.getElementById('back-btn');
const healthScoreValue  = document.getElementById('health-score-value');
const healthVerdict     = document.getElementById('health-verdict');
const overallAssessment = document.getElementById('overall-assessment');
const resultsContainer  = document.getElementById('results-container');
const scoreCirclePath   = document.getElementById('score-circle-path');
const errorBanner       = document.getElementById('error-banner');
const errorMessage      = document.getElementById('error-message');

// ─── Error Handling ───────────────────────────────────────────────────────────

function showError(message) {
    errorMessage.textContent = message;
    errorBanner.classList.remove('hidden');
    errorBanner.setAttribute('role', 'alert');
    errorBanner.focus();
}

function hideError() {
    errorBanner.classList.add('hidden');
    errorBanner.removeAttribute('role');
}

// ─── View Management ──────────────────────────────────────────────────────────

function showDashboard() {
    inputView.classList.add('hidden');
    dashboardView.classList.remove('hidden');
    // Move focus to the dashboard heading for screen readers
    const heading = dashboardView.querySelector('h1, h2, [data-focus-target]');
    if (heading) heading.focus();
}

function showInput() {
    dashboardView.classList.add('hidden');
    inputView.classList.remove('hidden');
    ingredientInput.focus();
}

// ─── Loading State ────────────────────────────────────────────────────────────

function setLoading(isLoading) {
    analyzeBtn.hidden  = isLoading;
    loadingEl.hidden   = !isLoading;
    analyzeBtn.setAttribute('aria-busy', String(isLoading));
    if (isLoading) {
        loadingEl.setAttribute('aria-live', 'polite');
    }
}

// ─── API Communication ────────────────────────────────────────────────────────

async function analyzeIngredients(ingredients, preferences) {
    const prefsString = preferences.length > 0
        ? `User dietary preferences: ${preferences.join(', ')}.`
        : 'No specific dietary preferences.';

    const systemPrompt = `You are a food ingredient analyzer and health-conscious product advisor.
${prefsString}
Explanation Tone: ${ANALYSIS_TONE}. Ensure the verdict and reasons match this tone.

Analyze the given list of ingredients based on their general health impact and the user's dietary preferences.
If an ingredient violates a dietary preference (e.g. Gelatin when Vegan is selected), it must be marked as "avoid" and the reason must state why.

Based on the product type you detect from the ingredients, also recommend 2-3 specific, real-world products that are widely available and are considered a healthier alternative. These should be actual brand names that a consumer could find in a store or online. Match the recommendations to the user's dietary preferences if provided.

You MUST respond strictly with a valid JSON object matching the following structure exactly, with no additional markdown outside the JSON block.
{
  "overall_score": 50,
  "one_sentence_verdict": "Moderate Risk",
  "overall_assessment": "Detailed 2-sentence clinical assessment of the cumulative impact.",
  "ingredients": [
    {
      "name": "Original ingredient name",
      "plain_english": "What it actually is",
      "status": "safe",
      "reason": "Why it got this status"
    }
  ],
  "better_alternative": "String suggesting a better alternative product category based on the flaws",
  "good_products": [
    {
      "name": "Specific Product Brand Name",
      "reason": "One sentence on why this product is a better choice"
    }
  ]
}`;

    const requestBody = {
        systemInstruction: { parts: [{ text: systemPrompt }] },
        contents:          [{ parts: [{ text: ingredients }] }],
        generationConfig:  { responseMimeType: 'application/json' },
    };

    const response = await fetch(API_ENDPOINT, {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify(requestBody),
    });

    if (!response.ok) {
        let msg = `Request failed: ${response.status} ${response.statusText}`;
        try {
            const err = await response.json();
            if (err.error)   msg = err.error;
            if (err.message) msg = err.message;
        } catch { /* non-JSON error — use HTTP status message */ }
        throw new Error(msg);
    }

    const result = await response.json();

    // Guard against unexpected Gemini response shapes
    const raw = result?.candidates?.[0]?.content?.parts?.[0]?.text;
    if (!raw) throw new Error('Unexpected response format from analysis service.');

    // Strip optional markdown code fences (e.g. ```json ... ```)
    const cleaned = raw.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '').trim();

    try {
        return JSON.parse(cleaned);
    } catch {
        console.error('[app] JSON parse error. Raw response:', raw);
        throw new Error('Failed to parse analysis response. Please try again.');
    }
}

// ─── DOM Builders (XSS-safe — textContent only) ───────────────────────────────

/** Creates a single ingredient status card using DOM APIs, not innerHTML. */
function createIngredientCard(item) {
    const status  = (item.status || 'safe').toLowerCase();
    const config  = STATUS_CONFIG[status] || STATUS_CONFIG.safe;

    const card = document.createElement('article');
    card.className = `group relative ${config.bg} p-6 rounded-2xl transition-all duration-300`;
    card.setAttribute('aria-label', `${item.name} — ${config.label}`);

    // Left colour strip
    const strip = document.createElement('div');
    strip.className = `absolute top-0 left-0 w-1.5 h-full ${config.strip} rounded-l-2xl`;
    strip.setAttribute('aria-hidden', 'true');

    // Header row
    const header = document.createElement('div');
    header.className = 'flex justify-between items-start';

    const titleGroup = document.createElement('div');
    titleGroup.className = 'space-y-1';

    const nameEl = document.createElement('h4');
    nameEl.className = 'font-headline font-bold text-xl text-on-surface';
    nameEl.textContent = item.name;

    const badge = document.createElement('span');
    badge.className = `inline-block px-2 py-0.5 text-xs font-semibold ${config.badge} rounded`;
    badge.textContent = config.label;

    titleGroup.append(nameEl, badge);

    const iconWrap = document.createElement('div');
    iconWrap.setAttribute('aria-hidden', 'true');

    const icon = document.createElement('span');
    icon.className = `material-symbols-outlined ${config.iconColor} text-3xl`;
    icon.style.fontVariationSettings = "'FILL' 1";
    icon.textContent = config.iconName;

    iconWrap.appendChild(icon);
    header.append(titleGroup, iconWrap);

    // Details grid
    const grid = document.createElement('div');
    grid.className = 'mt-4 grid grid-cols-2 gap-4';

    const makeDetailCell = (labelText, valueText) => {
        const cell = document.createElement('div');
        const lbl  = document.createElement('span');
        lbl.className = 'text-xs font-label text-outline block mb-1';
        lbl.textContent = labelText;
        const val = document.createElement('p');
        val.className = 'text-sm font-medium';
        val.textContent = valueText;
        cell.append(lbl, val);
        return cell;
    };

    grid.append(
        makeDetailCell('Plain English',  item.plain_english || '—'),
        makeDetailCell('Classification', item.status        || '—'),
    );

    // Reason paragraph
    const reason = document.createElement('p');
    reason.className = 'mt-4 text-sm text-on-surface-variant leading-snug';
    reason.textContent = item.reason;

    card.append(strip, header, grid, reason);
    return card;
}

/** Creates the "Recommended Alternative" block. */
function createAlternativeBlock(text) {
    const wrap = document.createElement('section');
    wrap.className = 'mt-6 p-6 bg-surface-container-low rounded-2xl border-l-4 border-primary';

    const heading = document.createElement('h4');
    heading.className = 'font-headline font-bold text-lg mb-2 flex items-center gap-2';

    const icon = document.createElement('span');
    icon.className = 'material-symbols-outlined text-primary text-xl';
    icon.setAttribute('aria-hidden', 'true');
    icon.textContent = 'recommend';

    const title = document.createTextNode(' Recommended Alternative');
    heading.append(icon, title);

    const body = document.createElement('p');
    body.className = 'text-sm text-on-surface-variant leading-relaxed italic';
    body.textContent = text;

    wrap.append(heading, body);
    return wrap;
}

/** Creates the "Healthier Products" block. */
function createGoodProductsBlock(products) {
    const wrap = document.createElement('section');
    wrap.className = 'mt-6 p-6 bg-surface-container-lowest rounded-2xl';

    const heading = document.createElement('h4');
    heading.className = 'font-headline font-bold text-lg mb-4 flex items-center gap-2';

    const icon = document.createElement('span');
    icon.className = 'material-symbols-outlined text-secondary text-xl';
    icon.setAttribute('aria-hidden', 'true');
    icon.textContent = 'verified_user';

    const title = document.createTextNode(' Healthier Products To Try');
    heading.append(icon, title);

    const list = document.createElement('ul');
    list.className = 'space-y-3';
    list.setAttribute('aria-label', 'Recommended healthy products');

    for (const product of products) {
        const li = document.createElement('li');
        li.className = 'flex items-start gap-3 p-3 bg-surface-container rounded-xl';

        const starIcon = document.createElement('span');
        starIcon.className = 'material-symbols-outlined text-primary mt-0.5 text-base';
        starIcon.style.fontVariationSettings = "'FILL' 1";
        starIcon.setAttribute('aria-hidden', 'true');
        starIcon.textContent = 'grade';

        const textWrap = document.createElement('div');

        const productName = document.createElement('p');
        productName.className = 'font-semibold text-sm text-on-surface';
        productName.textContent = product.name;

        const productReason = document.createElement('p');
        productReason.className = 'text-xs text-on-surface-variant mt-0.5';
        productReason.textContent = product.reason;

        textWrap.append(productName, productReason);
        li.append(starIcon, textWrap);
        list.appendChild(li);
    }

    wrap.append(heading, list);
    return wrap;
}

// ─── Dashboard Renderer ───────────────────────────────────────────────────────

function renderDashboard(data) {
    const score = Number.isFinite(data.overall_score) ? data.overall_score : 0;

    // Update score & verdict
    healthScoreValue.textContent = score;
    healthVerdict.textContent    = data.one_sentence_verdict ?? '—';
    overallAssessment.textContent = data.overall_assessment
        ?? `${data.one_sentence_verdict}. Based on the detected compounds, this is the clinical evaluation.`;

    // Reset SVG ring
    scoreCirclePath.style.strokeDashoffset = String(ANIMATION_CIRCUMFERENCE);

    // Clear previous results safely
    resultsContainer.replaceChildren();

    // Render ingredient cards
    const fragment = document.createDocumentFragment();
    for (const item of (data.ingredients ?? [])) {
        fragment.appendChild(createIngredientCard(item));
    }

    if (data.better_alternative) {
        fragment.appendChild(createAlternativeBlock(data.better_alternative));
    }

    if (Array.isArray(data.good_products) && data.good_products.length > 0) {
        fragment.appendChild(createGoodProductsBlock(data.good_products));
    }

    resultsContainer.appendChild(fragment);
}

// ─── Score Animation ──────────────────────────────────────────────────────────

function animateScore(score) {
    const offset = ANIMATION_CIRCUMFERENCE - (score / 100) * ANIMATION_CIRCUMFERENCE;

    let strokeColor = 'var(--color-tertiary, #bb171c)';
    if (score >= 70)      strokeColor = 'var(--color-primary,   #006c46)';
    else if (score >= 40) strokeColor = 'var(--color-secondary, #7c5800)';

    scoreCirclePath.style.stroke = strokeColor;

    // Use requestAnimationFrame for a smooth, reliable animation trigger
    requestAnimationFrame(() => {
        scoreCirclePath.style.strokeDashoffset = String(offset);
    });
}

// ─── Event Listeners ──────────────────────────────────────────────────────────

backBtn.addEventListener('click', showInput);

ingredientForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    hideError();

    const ingredients = ingredientInput.value.trim();
    if (!ingredients) {
        showError('Please enter some ingredients to analyze.');
        ingredientInput.focus();
        return;
    }

    const preferences = preferencesInput.value.trim()
        ? [preferencesInput.value.trim()]
        : [];

    setLoading(true);

    try {
        const data = await analyzeIngredients(ingredients, preferences);
        renderDashboard(data);
        showDashboard();
        // Animate after the view is visible in the next frame
        requestAnimationFrame(() => animateScore(data.overall_score ?? 0));
    } catch (error) {
        showError(`Analysis failed: ${error.message}`);
    } finally {
        setLoading(false);
    }
});
