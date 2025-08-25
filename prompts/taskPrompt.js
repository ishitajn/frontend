import { validatePromptInputs, sanitizeInputs } from './validator.js';
import { ContentBuilder, CONTENT_PRIORITIES } from './contentPrioritizer.js';

export function buildTaskPrompt(instructions, data, conversationAnalysis) {
    try {
        validatePromptInputs(data, conversationAnalysis, instructions);
        const { sanitizedData, sanitizedAnalysis, sanitizedInstructions } = 
            sanitizeInputs(data, conversationAnalysis, instructions);
        
        // Handle strict goal override early
        if (sanitizedInstructions.strictGoalOverride && sanitizedInstructions.goal) {
            return buildStrictOverridePrompt(sanitizedInstructions, sanitizedAnalysis);
        }
        
        const builder = new ContentBuilder();
        
        // Build sections with appropriate priorities
        const memorySection = buildMemorySection(sanitizedAnalysis.memory);
        if (memorySection) {
            builder.addSection('memory', memorySection, CONTENT_PRIORITIES.MEMORY_STRATEGY);
        }
        
        const directivesSection = buildDirectivesSection(sanitizedInstructions, sanitizedAnalysis);
        builder.addSection('directives', directivesSection, CONTENT_PRIORITIES.TASK_DIRECTIVES);
        
        const strategicSection = buildStrategicSection(sanitizedInstructions, sanitizedAnalysis, sanitizedData);
        if (strategicSection) {
            builder.addSection('strategic', strategicSection, CONTENT_PRIORITIES.CRITICAL_OVERRIDES);
        }
        
        const commandSection = buildFinalCommand(sanitizedInstructions.myName, sanitizedInstructions.theirName);
        builder.addSection('command', commandSection, CONTENT_PRIORITIES.TASK_DIRECTIVES);
        
        return builder.build();
        
    } catch (error) {
        console.error('Error building task prompt:', error);
        return buildFallbackTaskPrompt(instructions);
    }
}

function buildStrictOverridePrompt(instructions, analysis) {
    const { goal, flirtyValue, lengthValue, linguisticStyle, emojiStrategy, myName } = instructions;
    const emojiInstruction = getEmojiInstruction(emojiStrategy, flirtyValue, linguisticStyle);
    
    return `**HARD RESET INITIATED — USER GOAL OVERRIDE TAKES ABSOLUTE PRIORITY**
Your ONLY job is to generate one message that fulfills the user's goal: "${goal}"
Do NOT use any other context. Strictly follow the requested tone, length, and style.

--- EXECUTION PARAMETERS ---
- **TONE:** ${getToneDescription(flirtyValue)}
- **LENGTH:** ${getLengthDescription(lengthValue)}
- **LINGUISTIC STYLE:** ${getStyleDescription(linguisticStyle, analysis)}${emojiInstruction ? `\n- **EMOJI USAGE:** ${emojiInstruction}` : ''}

--- FINAL COMMAND ---
Write the next message for **${myName || 'the male user'}**. Only return the message text.`;
}

function buildMemorySection(memory) {
    const memoryNotes = [];
    
    if (memory?.dateArcPhase === 'planning') {
        memoryNotes.push('**STRATEGIC CONTEXT: PLANNING PHASE.** Focus on confidently solidifying a date.');
    } else if (memory?.dateArcPhase === 'escalation') {
        memoryNotes.push('**STRATEGIC CONTEXT: ESCALATION PHASE.** Build sexual tension and transition towards planning a date.');
    }
    
    if (memory?.insideJokes?.length > 0) {
        memoryNotes.push(`**STRATEGIC CALLBACK:** You can reference this inside joke: "${memory.insideJokes.slice(-1)[0]}"`);
    }
    
    const goodTopics = Object.entries(memory?.topics || {})
        .filter(([, data]) => data.score > 0.5)
        .sort((a, b) => b[1].score - a[1].score)
        .map(([topic]) => topic);
    
    if (goodTopics.length > 0) {
        memoryNotes.push(`**GOOD TOPICS:** The match responds well to: ${goodTopics.slice(0, 2).join(', ')}.`);
    }
    
    if (memory?.questionHistory?.length > 0) {
        memoryNotes.push(`**AVOID REPEATING:** You already asked about: "${memory.questionHistory.slice(-1)[0]}".`);
    }
    
    return memoryNotes.length > 0 ? `--- MEMORY & STRATEGY (Creative Fuel) ---
${memoryNotes.join('\n')}` : null;
}

function buildDirectivesSection(instructions, analysis) {
    const { flirtyValue, lengthValue, linguisticStyle, emojiStrategy, endWithQuestion, goal } = instructions;
    const emojiInstruction = getEmojiInstruction(emojiStrategy, flirtyValue, linguisticStyle);
    
    const directives = [
        `- **TONE:** ${getToneDescription(flirtyValue)}`,
        `- **LENGTH:** ${getLengthDescription(lengthValue)}`,
        `- **LINGUISTIC STYLE:** ${getStyleDescription(linguisticStyle, analysis)}`
    ];
    
    if (emojiInstruction) {
        directives.push(`- **EMOJI USAGE:** ${emojiInstruction}`);
    }
    
    directives.push(`- **CONVERSATIONAL GOAL:** ${endWithQuestion ? 
        "Conclude with an engaging, open-ended question." : 
        "Avoid ending with a direct question. Aim for a statement that invites a response."}`);
    
    if (goal?.trim()) {
        directives.push(`- **ABSOLUTE PRIORITY – USER'S GOAL:** ${goal}`);
    }
    
    return `--- YOUR TASK & DIRECTIVES (Core Constraints) ---
${directives.join('\n')}`;
}

function buildStrategicSection(instructions, analysis, data) {
    const strategicNotes = [];
    const { suppressGreeting, forceNewTopic, memory, lastMessageAnalysis } = analysis;
    const { conversationBreakDetected } = instructions;
    const { conversationHistory } = data;
    
    // Protocol-level notes (highest importance)
    if (suppressGreeting) {
        strategicNotes.push('**CRITICAL PROTOCOL: NO GREETING.** A greeting was already exchanged today.');
    }
    
    if (forceNewTopic && !conversationBreakDetected) {
        strategicNotes.push('**CRITICAL PROTOCOL: FORCE NEW TOPIC.** Ignore the match\'s last message and start a fresh conversation thread.');
    }
    
    if (conversationBreakDetected) {
        strategicNotes.push('**CRITICAL PROTOCOL: RE-ENGAGEMENT DETECTED.** The conversation stalled. Revive it with a new, high-value message from their profile.');
    }
    
    if (memory?.avoidedTopics?.length > 0) {
        strategicNotes.push(`**CRITICAL PROTOCOL: AVOID THESE TOPICS.** The match has reacted negatively to: ${memory.avoidedTopics.join(', ')}.`);
    }
    
    // Analysis-based strategic notes
    if (lastMessageAnalysis) {
        const lastMessageFromMatch = conversationHistory?.filter(msg => msg.role === 'assistant').pop()?.content || '';
        
        if (lastMessageAnalysis.isSarcastic) {
            strategicNotes.push('**CRITICAL PROTOCOL: SARCASM DETECTED.** Do not take their last statement literally. Respond to the underlying sentiment.');
        }
        
        if (lastMessageAnalysis.intents?.includes('questioning')) {
            strategicNotes.push(`**CRITICAL PROTOCOL: ANSWER THE QUESTION.** The match asked a question: "${lastMessageFromMatch}". You MUST answer it.`);
        }
        
        if (lastMessageAnalysis.isVulnerable) {
            strategicNotes.push('**CRITICAL PROTOCOL: VULNERABILITY DETECTED.** Respond with warmth, validation, and support.');
        }
        
        if (lastMessageAnalysis.valence < -0.5) {
            strategicNotes.push('**CRITICAL PROTOCOL: NEGATIVE TONE DETECTED.** Adjust your tone to be more supportive and empathetic.');
        }
        
        // Strategic notes (medium importance)
        if (lastMessageAnalysis.intents?.includes('flirting_or_sexual')) {
            strategicNotes.push('**STRATEGIC NOTE: SEXUAL TENSION DETECTED.** Match their energy confidently. This is a green light for sexual escalation.');
        }
        
        if (lastMessageAnalysis.isAmbiguous) {
            strategicNotes.push('**STRATEGIC NOTE: AMBIGUITY DETECTED.** Convert their vague positive response into a concrete plan.');
        }
        
        if (lastMessageAnalysis.intents?.includes('planning')) {
            strategicNotes.push('**STRATEGIC NOTE: LOGISTICS SIGNAL DETECTED.** Move towards solidifying plans.');
        }
        
        if (lastMessageAnalysis.isLowEffort) {
            strategicNotes.push('**STRATEGIC NOTE: LOW-EFFORT REPLY DETECTED.** Their last message was short. Your reply needs to be more engaging to carry the conversation.');
        }
    }
    
    return strategicNotes.length > 0 ? `--- CRITICAL OVERRIDES & NOTES ---
${strategicNotes.join('\n')}` : null;
}

function buildFinalCommand(myName, theirName) {
    return `--- FINAL COMMAND ---
Write the next message for **${myName || 'USER'}** - the male, replying to **${theirName || 'MATCH'}** - the female. Only return the message text. No labels, no quotes, no extra formatting.`;
}

function buildFallbackTaskPrompt(instructions) {
    const goal = instructions?.goal || 'Write a dating message';
    const myName = instructions?.myName || 'User';
    
    return `--- FALLBACK TASK PROMPT ---
**CRITICAL ERROR:** Using fallback prompt due to validation error.

**BASIC TASK:** ${goal}

**FINAL COMMAND:** Write the next message for **${myName}**. Only return the message text.`;
}

// Helper functions for prompt construction
function getToneDescription(value) {
    const levels = {
        100: 'Be explicitly sexual and daring.',
        90: 'Be intensely flirty and bold.',
        80: 'Be very flirty and confident.',
        70: 'Be flirty and playful.',
        60: 'Be moderately flirty and engaging.',
        50: 'Be lightly flirty and casually engaging.',
        40: 'Be friendly and approachable.',
        30: 'Be warm and relaxed.',
        20: 'Be polite and friendly.',
        10: 'Be polite and straightforward.',
        0: 'Be completely neutral and formal.'
    };
    return levels[Object.keys(levels).reverse().find(k => value >= k) || 0];
}

function getLengthDescription(value) {
    const levels = {
        100: 'Strictly 8+ sentences (a manifesto).',
        90: 'Strictly 6–7 sentences (epic).',
        80: 'Strictly 5–6 sentences (very long).',
        70: 'Strictly 4–5 sentences (long).',
        60: 'Strictly 3–4 sentences (moderately long).',
        50: 'Strictly 2–3 sentences (medium).',
        40: 'Strictly 2 sentences (moderately short).',
        30: 'Strictly 1–2 sentences (short).',
        20: 'Strictly one full sentence (very short).',
        10: 'Strictly 5–10 words (ultra short).',
        0: 'Strictly 2–5 words (micro).'
    };
    return levels[Object.keys(levels).reverse().find(k => value >= k) || 0];
}

function getStyleDescription(style, analysis) {
    if (style === 'auto' && analysis?.lastMessageAnalysis?.suggestedResponseStyle) {
        return `Strictly adopt a ${analysis.lastMessageAnalysis.suggestedResponseStyle} style.`;
    }
    const styles = {
        'witty': 'Write with a witty and humorous style.',
        'intellectual': 'Write with an intellectual and deep style.',
        'playful': 'Write with a playful and teasing style.',
        'direct': 'Write with a direct and confident style.',
        'poetic': 'Write with a poetic and romantic style.',
        'sexual': 'Write with a bold, provocative and sexual style.',
        'sarcastic': 'Write with a sarcastic and sharp style.',
        'charming': 'Write with a charming and suave style.',
        'casual': 'Write with a casual and laid-back style.',
        'mysterious': 'Write with a mysterious and intriguing style.'
    };
    return styles[style] || 'Write with a natural and conversational style.';
}

function getEmojiInstruction(strategy, flirtyValue, linguisticStyle) {
    if (!strategy || strategy === 'no_emoji')
        return '';
    const autoDesc = () => {
        if (['intellectual', 'poetic', 'sarcastic'].includes(linguisticStyle))
            return 'Avoid emojis almost entirely.';
        if (flirtyValue >= 80)
            return 'Feel free to use 1-3 bold or suggestive emojis (e.g., 😏, 😈, 🔥).';
        if (flirtyValue >= 60)
            return 'Incorporate one or two well-placed, playful emojis (e.g., 😉, 😂, 😜).';
        if (flirtyValue >= 40)
            return 'You may use a single, simple, and friendly emoji (e.g., 🙂, 👍).';
        if (['playful', 'witty', 'charming'].includes(linguisticStyle))
            return 'You can use one well-placed emoji to add personality.';
        return 'Be very conservative with emojis.';
    };
    const map = {
        'auto': autoDesc(),
        'friendly': 'You may use a single, simple, and friendly emoji (e.g., 🙂, 👍).',
        'playful': 'Incorporate one or two well-placed, playful emojis (e.g., 😉, 😂).',
        'bold': 'Feel free to use 1-3 bold or suggestive emojis (e.g., 😏, 😈, 🔥).'
    };
    return map[strategy] || '';
}