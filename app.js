document.addEventListener('DOMContentLoaded', () => {
    // Views
    const inputView = document.getElementById('input-view');
    const dashboardView = document.getElementById('dashboard-view');

    // Form Inputs
    const ingredientForm = document.getElementById('ingredient-form');
    const rawIngredientsInput = document.getElementById('ingredient-input');
    const preferencesInput = document.getElementById('preferences-input');
    const analyzeBtn = document.getElementById('analyze-btn');
    const loadingEl = document.getElementById('loading');

    // Dashboard Elements
    const backBtn = document.getElementById('back-btn');
    const healthScoreValue = document.getElementById('health-score-value');
    const healthVerdict = document.getElementById('health-verdict');
    const overallAssessment = document.getElementById('overall-assessment');
    const resultsContainer = document.getElementById('results-container');
    const scoreCirclePath = document.getElementById('score-circle-path');

    // Back to input
    backBtn.addEventListener('click', () => {
        dashboardView.classList.add('hidden');
        inputView.classList.remove('hidden');
    });

    ingredientForm.addEventListener('submit', async (e) => {
        e.preventDefault();

        const ingredients = rawIngredientsInput.value.trim();
        const preferences = preferencesInput.value.trim() ? [preferencesInput.value.trim()] : [];
        const tone = "Clinical Researcher (Fact-based)";

        if (!ingredients) {
            alert("Please enter some ingredients to analyze.");
            return;
        }

        // Set Loading state
        analyzeBtn.classList.add('hidden');
        loadingEl.classList.remove('hidden');

        try {
            const data = await analyzeIngredients(ingredients, preferences, tone);
            renderDashboard(data);

            // Switch views
            inputView.classList.add('hidden');
            dashboardView.classList.remove('hidden');

            // Trigger score animation shortly after view transition
            setTimeout(() => animateScore(data.overall_score), 100);

        } catch (error) {
            alert("Analysis failed: " + error.message);
        } finally {
            // Unset loading state
            analyzeBtn.classList.remove('hidden');
            loadingEl.classList.add('hidden');
        }
    });

    async function analyzeIngredients(ingredients, prefs, tone) {
        let prefsString = prefs.length > 0 ? `User dietary preferences: ${prefs.join(', ')}.` : 'No specific dietary preferences.';

        const systemPrompt = `
You are a food ingredient analyzer and health-conscious product advisor.
${prefsString}
Explanation Tone: ${tone}. Ensure the verdict and reasons match this tone.

Analyze the given list of ingredients based on their general health impact and the user's dietary preferences.
If an ingredient violates a dietary preference (e.g. Gelatin when Vegan is selected), it must be marked as "avoid" and the reason must state why.

Based on the product type you detect from the ingredients, also recommend 2-3 specific, real-world products that are widely available and are considered a healthier alternative. These should be actual brand names that a consumer could find in a store or online (e.g., "Organic Valley Whole Milk", "KIND Dark Chocolate Nuts Bar", "Dr. Bronner's Pure-Castile Soap"). Match the recommendations to the user's dietary preferences if provided.

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
}
`;

        const requestBody = {
            systemInstruction: { parts: [{ text: systemPrompt }] },
            contents: [{ parts: [{ text: ingredients }] }],
            generationConfig: { responseMimeType: "application/json" }
        };

        // Call the secure local proxy instead of the Gemini API directly
        const response = await fetch('/api/analyze', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(requestBody)
        });

        if (!response.ok) {
            let errorMsg = `API Request failed: ${response.status} ${response.statusText}`;
            try {
                const errorData = await response.json();
                if (errorData.message) errorMsg = errorData.message;
                else if (errorData.error) errorMsg = errorData.error;
            } catch (e) {
                // Not JSON, fallback to generic HTTP status message
            }
            throw new Error(errorMsg);
        }

        const result = await response.json();
        let content = result.candidates[0].content.parts[0].text;

        if (content.startsWith("\`\`\`json")) {
            content = content.replace(/^\\\`\\\`\\\`json/i, '').replace(/\\\`\\\`\\\`$/, '').trim();
        } else if (content.startsWith("\`\`\`")) {
            content = content.replace(/^\\\`\\\`\\\`/i, '').replace(/\\\`\\\`\\\`$/, '').trim();
        }

        try {
            return JSON.parse(content);
        } catch (e) {
            console.error("JSON Parse Error:", e, content);
            throw new Error("Failed to parse the API response. Format invalid.");
        }
    }

    function renderDashboard(data) {
        // Update Static Texts
        healthScoreValue.textContent = data.overall_score;
        healthVerdict.textContent = data.one_sentence_verdict;
        overallAssessment.textContent = data.overall_assessment || `${data.one_sentence_verdict}. Based on the detected compounds and your profile preferences, this is the clinical evaluation.`;

        // Reset path
        scoreCirclePath.style.strokeDashoffset = "552.9";

        // Clear previous cards
        resultsContainer.innerHTML = '';

        // Render Ingredient Cards
        data.ingredients.forEach(item => {
            const card = document.createElement('div');

            // Define styles based on status
            let styles = {
                bg: "bg-primary/5", strip: "bg-primary", badge: "bg-primary/10 text-primary",
                iconColor: "text-primary", iconName: "verified", typeStr: "Verified Safe"
            };

            const normalizedStatus = item.status.toLowerCase();
            if (normalizedStatus === 'caution') {
                styles = {
                    bg: "bg-secondary/5", strip: "bg-secondary", badge: "bg-secondary/10 text-secondary bg-secondary-container/20",
                    iconColor: "text-secondary", iconName: "warning", typeStr: "Monitor Intake"
                };
            } else if (normalizedStatus === 'avoid') {
                styles = {
                    bg: "bg-tertiary/5 border border-tertiary/10", strip: "bg-tertiary", badge: "bg-tertiary/10 text-tertiary",
                    iconColor: "text-tertiary", iconName: "dangerous", typeStr: "Restricted Compound"
                };
            }

            card.className = `group relative ${styles.bg} p-6 rounded-2xl transition-all duration-300`;
            card.innerHTML = `
                <div class="absolute top-0 left-0 w-1.5 h-full ${styles.strip} rounded-l-2xl"></div>
                <div class="flex justify-between items-start">
                    <div class="space-y-1">
                        <h4 class="font-headline font-bold text-xl text-on-surface">${item.name}</h4>
                        <span class="inline-block px-2 py-0.5 text-xs font-semibold ${styles.badge} rounded">${styles.typeStr}</span>
                    </div>
                    <div class="text-right">
                        <span class="material-symbols-outlined ${styles.iconColor} text-3xl" style="font-variation-settings: 'FILL' 1;">${styles.iconName}</span>
                    </div>
                </div>
                <div class="mt-4 grid grid-cols-2 gap-4">
                    <div>
                        <span class="text-xs font-label text-outline block mb-1">Plain English</span>
                        <p class="text-sm font-medium">${item.plain_english}</p>
                    </div>
                    <div>
                        <span class="text-xs font-label text-outline block mb-1">Classification</span>
                        <p class="text-sm font-medium capitalize">${item.status}</p>
                    </div>
                </div>
                <p class="mt-4 text-sm text-on-surface-variant leading-snug">${item.reason}</p>
            `;

            resultsContainer.appendChild(card);
        });

        // Add Better Alternative block if present
        if (data.better_alternative) {
            const altDiv = document.createElement('div');
            altDiv.className = "mt-6 p-6 bg-surface-container-low rounded-2xl border-l-4 border-primary";
            altDiv.innerHTML = `
                <h4 class="font-headline font-bold text-lg mb-2 flex items-center gap-2">
                    <span class="material-symbols-outlined text-primary text-xl">recommend</span> Recommended Alternative
                </h4>
                <p class="text-sm text-on-surface-variant leading-relaxed italic">${data.better_alternative}</p>
            `;
            resultsContainer.appendChild(altDiv);
        }

        // Add Good Products block if present
        if (data.good_products && data.good_products.length > 0) {
            const productsDiv = document.createElement('div');
            productsDiv.className = "mt-6 p-6 bg-surface-container-lowest rounded-2xl";
            productsDiv.innerHTML = `
                <h4 class="font-headline font-bold text-lg mb-4 flex items-center gap-2">
                    <span class="material-symbols-outlined text-secondary text-xl">verified_user</span> Healthier Products To Try
                </h4>
                <div class="space-y-3">
                    ${data.good_products.map(p => `
                        <div class="flex items-start gap-3 p-3 bg-surface-container rounded-xl">
                            <span class="material-symbols-outlined text-primary mt-0.5 text-base" style="font-variation-settings: 'FILL' 1;">grade</span>
                            <div>
                                <p class="font-semibold text-sm text-on-surface">${p.name}</p>
                                <p class="text-xs text-on-surface-variant mt-0.5">${p.reason}</p>
                            </div>
                        </div>
                    `).join('')}
                </div>
            `;
            resultsContainer.appendChild(productsDiv);
        }
    }

    function animateScore(score) {
        const circumference = 552.9; // 2 * pi * r (r=88)
        const offset = circumference - (score / 100) * circumference;

        // Define color based on score
        let strokeColor = "var(--color-tertiary, #bb171c)";
        if (score >= 70) {
            strokeColor = "var(--color-primary, #006c46)";
        } else if (score >= 40) {
            strokeColor = "var(--color-secondary, #7c5800)";
        }

        scoreCirclePath.style.stroke = strokeColor;
        scoreCirclePath.style.strokeDashoffset = offset;
    }
});
