"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.parseExtractedMedicineText = parseExtractedMedicineText;
function normalizeText(text) {
    return text
        .replace(/\r/g, '\n')
        .replace(/[ \t]+/g, ' ')
        .replace(/\n{3,}/g, '\n\n')
        .trim();
}
function pickFirstNonEmpty(lines) {
    for (const l of lines) {
        const s = l.trim();
        if (s.length >= 2)
            return s;
    }
    return '';
}
function parseExtractedMedicineText(rawText) {
    const text = normalizeText(rawText);
    const lines = text
        .split('\n')
        .map((l) => l.trim())
        .filter(Boolean);
    const all = text.replace(/\n/g, ' ');
    // Dosage: common patterns like "500 mg", "5 ml", "250mcg"
    const dosageMatch = all.match(/\b(\d+(?:[.,]\d+)?)\s*(mg|mcg|g|kg|ml|mL)\b/i) ??
        all.match(/\b(\d+(?:[.,]\d+)?)\s*(mg|mcg|g|ml)\s*(?:\/\s*\d+\s*(?:mg|ml))?\b/i);
    const dosage = dosageMatch
        ? `${dosageMatch[1]} ${dosageMatch[2].toLowerCase()}`
        : '—';
    // Frequency heuristics
    let frequency = '';
    const freqDaily = all.match(/\b(\d+)\s*(?:times?|x)\s*(?:a\s*)?day(?:s)?\b/i);
    if (freqDaily)
        frequency = `${freqDaily[1]} times daily`;
    if (!frequency) {
        const twiceDaily = /\b(twice)\b/i.test(all) ? '2 times daily' : '';
        const thriceDaily = /\b(thrice)\b/i.test(all) ? '3 times daily' : '';
        frequency = twiceDaily || thriceDaily || frequency;
    }
    if (!frequency) {
        // "Once daily"
        if (/\bonce\b/i.test(all) && /\bdaily\b/i.test(all))
            frequency = 'Once daily';
    }
    if (!frequency) {
        // Time-of-day list (e.g. "08:00 20:00")
        const times = all.match(/\b(\d{1,2}:\d{2})\b/g);
        if (times?.length)
            frequency = `At ${times.slice(0, 2).join(' & ')}`;
    }
    if (!frequency)
        frequency = 'Once daily';
    // Name: prefer first line that doesn't look like pure dosing.
    const nameCandidate = pickFirstNonEmpty(lines.filter((l) => !/\b(mg|mcg|ml|g)\b/i.test(l) || l.length < 14));
    const name = nameCandidate && nameCandidate.length <= 40 ? nameCandidate : pickFirstNonEmpty(lines) || 'Medicine';
    // Instructions: pick first couple sentences containing common instruction verbs.
    const sentenceCandidates = text
        .split(/(?<=[.!?])\s+/)
        .map((s) => s.trim())
        .filter(Boolean);
    const instructionBits = sentenceCandidates.filter((s) => /\b(take|after|before|with|without|once|twice|daily|swallow|food|meal|meals|course|finish)\b/i.test(s));
    const instructions = instructionBits.length
        ? instructionBits.slice(0, 2).join(' ')
        : lines.slice(0, 3).join(' ');
    return {
        name,
        dosage,
        frequency,
        instructions,
        description: `${name} is identified from prescription text. Verify dosage and schedule with a licensed doctor.`,
        sideEffects: 'Possible nausea, dizziness, stomach upset, rash (varies by medication).',
        precautions: 'Do not self-medicate. Confirm allergies, interactions, pregnancy, and kidney/liver conditions with your clinician.',
    };
}
