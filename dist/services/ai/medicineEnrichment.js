"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.getConfiguredAiProvider = getConfiguredAiProvider;
exports.enrichMedicineWithLLM = enrichMedicineWithLLM;
exports.chatEnrichWithLLM = chatEnrichWithLLM;
exports.generateAdherenceInsights = generateAdherenceInsights;
const SYSTEM_PROMPT = `You are a highly precise Medical Information Processing Agent. Your task is to take raw, noisy OCR (Optical Character Recognition) text extracted from medicine labels and transform it into a structured, user-friendly medical profile.

Guidelines & Constraints
Identity Accuracy: Identify the primary active ingredient and the brand name from the provided text.

Safety First: Always include a mandatory disclaimer that this information is for educational purposes and is not a substitute for professional medical advice.

Defaulting: If the OCR text is too garbled to identify a specific medication, state: "Medicine identification failed. Please provide a clearer image."

Formatting: Return data in a clean Markdown format (or JSON if requested). Use bolding for emphasis.

Structured Response Template
For every input, provide information in this exact order:

Medicine Name & Category: (e.g., Paracetamol - Antipyretic/Analgesic)

Primary Use: What disease or symptom does this treat?

Standard Dosage (Average Adult): Based on standard medical guidelines.

Note: Remind the user that dosage varies based on weight/age.

Daily Frequency: How often it is typically taken.

Precautions: Specific warnings (e.g., "Do not take with alcohol," "Avoid if pregnant").

Common Side Effects: List 3-5 common reactions.

Interaction Warning: Mention common drugs it might react with.

Tone
Professional, clinical, and cautious. Do not use flowery or overly conversational language.`;
function getProvider() {
    const provider = (process.env.AI_PROVIDER ?? '').toLowerCase();
    if (provider === 'gemini' || provider === 'openai')
        return provider;
    // If provider is not explicitly set but Gemini key exists, default to Gemini.
    if (process.env.GEMINI_API_KEY)
        return 'gemini';
    if (process.env.OPENAI_API_KEY)
        return 'openai';
    return null;
}
function getConfiguredAiProvider() {
    return getProvider();
}
function sleep(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
}
async function withRetry(fn, retries = 2) {
    let last;
    for (let i = 0; i <= retries; i++) {
        try {
            return await fn();
        }
        catch (e) {
            last = e;
            const msg = e instanceof Error ? e.message : String(e);
            const retryable = msg.includes('429') ||
                msg.includes('503') ||
                msg.includes('502') ||
                msg.includes('500') ||
                msg.toLowerCase().includes('resource exhausted');
            if (i < retries && retryable) {
                await sleep(500 * 2 ** i);
                continue;
            }
            throw e;
        }
    }
    throw last;
}
function cleanJsonText(raw) {
    return raw
        .trim()
        .replace(/^```json\s*/i, '')
        .replace(/^```\s*/i, '')
        .replace(/```$/i, '')
        .trim();
}
function mergeWithFallback(base, incoming) {
    return {
        name: incoming.name?.trim() || base.name,
        dosage: incoming.dosage?.trim() || base.dosage,
        frequency: incoming.frequency?.trim() || base.frequency,
        instructions: incoming.instructions?.trim() || base.instructions,
        description: incoming.description?.trim() || base.description,
        sideEffects: incoming.sideEffects?.trim() || base.sideEffects,
        precautions: incoming.precautions?.trim() || base.precautions,
    };
}
function buildPrompt(ocrText, base) {
    return `
SYSTEM PROMPT (follow it exactly):
${SYSTEM_PROMPT}

Task:
Use the OCR text and the fallback parsed values to produce a structured medical profile.

Return ONLY valid JSON (no markdown outside of fields) with this exact schema:
{
  "name": string,
  "dosage": string,
  "frequency": string,
  "instructions": string,
  "description": string,
  "sideEffects": string,
  "precautions": string,
  "profileMarkdown": string
}

Rules:
- profileMarkdown must follow the Structured Response Template in the SYSTEM PROMPT and include the mandatory disclaimer.
- If OCR is too garbled to identify: set name/dosage/frequency to "Medicine identification failed. Please provide a clearer image." and reflect that in profileMarkdown.
- Keep all fields as plain strings. JSON only.

OCR TEXT:
${ocrText}

Fallback values:
${JSON.stringify(base, null, 2)}
  `.trim();
}
function buildChatPrompt(ocrText, base, messages) {
    const transcript = messages
        .map((m) => `${m.role === 'user' ? 'User' : 'Assistant'}: ${m.content}`)
        .join('\n');
    return `
SYSTEM PROMPT (follow it exactly):
${SYSTEM_PROMPT}

You are continuing a conversation about the same medication extracted from OCR.

OCR TEXT:
${ocrText}

Fallback/current fields:
${JSON.stringify(base, null, 2)}

Conversation so far:
${transcript || 'None yet'}

User's latest request is included above.

Now return ONLY valid JSON with the exact schema:
{
  "name": string,
  "dosage": string,
  "frequency": string,
  "instructions": string,
  "description": string,
  "sideEffects": string,
  "precautions": string,
  "profileMarkdown": string
}

Rules:
- profileMarkdown must reflect the updated profile.
- If identification is impossible, follow the SYSTEM PROMPT defaulting instruction.
- JSON only. No other text.
  `.trim();
}
async function enrichWithGemini(apiKey, prompt) {
    const model = process.env.GEMINI_MODEL ?? 'gemini-2.0-flash';
    const resp = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent?key=${encodeURIComponent(apiKey)}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            contents: [{ role: 'user', parts: [{ text: prompt }] }],
            generationConfig: {
                temperature: 0.2,
                responseMimeType: 'application/json',
            },
        }),
    });
    if (!resp.ok) {
        const errorBody = await resp.text().catch(() => '');
        throw new Error(`Gemini API failed (${resp.status}) model=${model} body=${errorBody}`);
    }
    const data = (await resp.json());
    const text = data?.candidates?.[0]?.content?.parts?.[0]?.text;
    if (!text || typeof text !== 'string')
        return {};
    return JSON.parse(cleanJsonText(text));
}
async function enrichWithOpenAI(apiKey, prompt) {
    const model = process.env.OPENAI_MODEL ?? 'gpt-4o-mini';
    const resp = await fetch('https://api.openai.com/v1/chat/completions', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${apiKey}`,
        },
        body: JSON.stringify({
            model,
            temperature: 0.2,
            response_format: { type: 'json_object' },
            messages: [
                {
                    role: 'system',
                    content: 'You extract medicine data from OCR text. Return only JSON object with requested fields.',
                },
                { role: 'user', content: prompt },
            ],
        }),
    });
    if (!resp.ok)
        throw new Error(`OpenAI API failed (${resp.status})`);
    const data = (await resp.json());
    const text = data?.choices?.[0]?.message?.content;
    if (!text || typeof text !== 'string')
        return {};
    return JSON.parse(cleanJsonText(text));
}
async function enrichMedicineWithLLM(ocrText, fallbackParsed) {
    const provider = getProvider();
    const prompt = buildPrompt(ocrText, fallbackParsed);
    if (!provider) {
        throw new Error('AI provider not configured. Set AI_PROVIDER=gemini or AI_PROVIDER=openai.');
    }
    if (provider === 'gemini') {
        const key = process.env.GEMINI_API_KEY ?? '';
        if (!key)
            throw new Error('AI_PROVIDER is gemini but GEMINI_API_KEY is missing');
        const llmData = await withRetry(() => enrichWithGemini(key, prompt));
        return {
            enriched: mergeWithFallback(fallbackParsed, llmData),
            provider: 'gemini',
            profileMarkdown: llmData?.profileMarkdown ?? '',
        };
    }
    const key = process.env.OPENAI_API_KEY ?? '';
    if (!key)
        throw new Error('AI_PROVIDER is openai but OPENAI_API_KEY is missing');
    const llmData = await withRetry(() => enrichWithOpenAI(key, prompt));
    return {
        enriched: mergeWithFallback(fallbackParsed, llmData),
        provider: 'openai',
        profileMarkdown: llmData?.profileMarkdown ?? '',
    };
}
async function chatEnrichWithLLM(ocrText, current, messages) {
    const provider = getProvider();
    if (!provider) {
        throw new Error('AI provider not configured. Set AI_PROVIDER=gemini or AI_PROVIDER=openai.');
    }
    const prompt = buildChatPrompt(ocrText, current, messages);
    if (provider === 'gemini') {
        const key = process.env.GEMINI_API_KEY ?? '';
        if (!key)
            throw new Error('AI_PROVIDER is gemini but GEMINI_API_KEY is missing');
        const llmData = await withRetry(() => enrichWithGemini(key, prompt));
        return {
            enriched: mergeWithFallback(current, llmData),
            provider: 'gemini',
            profileMarkdown: llmData?.profileMarkdown ?? '',
        };
    }
    const key = process.env.OPENAI_API_KEY ?? '';
    if (!key)
        throw new Error('AI_PROVIDER is openai but OPENAI_API_KEY is missing');
    const llmData = await withRetry(() => enrichWithOpenAI(key, prompt));
    return {
        enriched: mergeWithFallback(current, llmData),
        provider: 'openai',
        profileMarkdown: llmData?.profileMarkdown ?? '',
    };
}
function buildInsightsPrompt(meds) {
    return `
You are a medication adherence coach. The user uses an app to track medicines and reminders.

Medication list (JSON):
${JSON.stringify(meds, null, 2)}

Produce concise, actionable guidance in Markdown:
- A short summary of their schedule complexity (1 paragraph).
- 3–6 bullet tips to improve adherence (timing, routines, travel, missed doses — general education only).
- A "Questions for your clinician or pharmacist" section with 2–4 non-diagnostic prompts if anything looks unclear from the data.

Rules:
- Do NOT diagnose or prescribe. Include: "This is not medical advice."
- If the list is empty, explain they should add medications first.
- Return ONLY valid JSON: { "markdown": string }
`.trim();
}
async function insightsWithGemini(apiKey, prompt) {
    const model = process.env.GEMINI_MODEL ?? 'gemini-2.0-flash';
    const resp = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent?key=${encodeURIComponent(apiKey)}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            contents: [{ role: 'user', parts: [{ text: prompt }] }],
            generationConfig: {
                temperature: 0.35,
                responseMimeType: 'application/json',
            },
        }),
    });
    if (!resp.ok) {
        const errorBody = await resp.text().catch(() => '');
        throw new Error(`Gemini API failed (${resp.status}) model=${model} body=${errorBody}`);
    }
    const data = (await resp.json());
    const text = data?.candidates?.[0]?.content?.parts?.[0]?.text;
    if (!text || typeof text !== 'string')
        return { markdown: '' };
    return JSON.parse(cleanJsonText(text));
}
async function insightsWithOpenAI(apiKey, prompt) {
    const model = process.env.OPENAI_MODEL ?? 'gpt-4o-mini';
    const resp = await fetch('https://api.openai.com/v1/chat/completions', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${apiKey}`,
        },
        body: JSON.stringify({
            model,
            temperature: 0.35,
            response_format: { type: 'json_object' },
            messages: [
                {
                    role: 'system',
                    content: 'Return only JSON with a single string field markdown.',
                },
                { role: 'user', content: prompt },
            ],
        }),
    });
    if (!resp.ok)
        throw new Error(`OpenAI API failed (${resp.status})`);
    const data = (await resp.json());
    const text = data?.choices?.[0]?.message?.content;
    if (!text || typeof text !== 'string')
        return { markdown: '' };
    return JSON.parse(cleanJsonText(text));
}
async function generateAdherenceInsights(medicines) {
    const provider = getProvider();
    if (!provider) {
        throw new Error('AI provider not configured. Set AI_PROVIDER and API keys.');
    }
    const prompt = buildInsightsPrompt(medicines);
    if (provider === 'gemini') {
        const key = process.env.GEMINI_API_KEY ?? '';
        if (!key)
            throw new Error('GEMINI_API_KEY is missing');
        const out = await withRetry(() => insightsWithGemini(key, prompt));
        return { markdown: out.markdown || '', provider: 'gemini' };
    }
    const key = process.env.OPENAI_API_KEY ?? '';
    if (!key)
        throw new Error('OPENAI_API_KEY is missing');
    const out = await withRetry(() => insightsWithOpenAI(key, prompt));
    return { markdown: out.markdown || '', provider: 'openai' };
}
