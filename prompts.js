// src/prompts.js (Corrected with Consistent Data Structuring)

import { getSystemPrompt } from './prompts/systemPrompt.js';
import { buildContextPrompt } from './prompts/contextPrompt.js';
import { buildTaskPrompt } from './prompts/taskPrompt.js';

/**
 * @param {object} data - The data for prompt generation.
 * @returns {{systemMessage: string, userMessage: string}}
 */
export function generatePrompts(data) {
    const { conversationHistory, taskInstructions, geoContextData, forceIncludeGeoContext, conversationAnalysis } = data;

    if (!conversationAnalysis) {
        throw new Error("generatePrompts failed: conversationAnalysis object is missing.");
    }

    // Use system_prompt and user_prompt from payload if they exist
    if (conversationAnalysis.system_prompt && conversationAnalysis.user_prompt) {
        return {
            systemMessage: conversationAnalysis.system_prompt,
            userMessage: conversationAnalysis.user_prompt,
        };
    }

    // Fallback to old logic
    const state = conversationAnalysis.conversationState;

    // Geo-context inclusion logic is now simplified to just the user's toggle.
    const includeGeoContext = forceIncludeGeoContext;

    const timeContext = getTimeContext();
    const contextData = { ...data, includeGeoContext };
    const finalTaskInstructions = { ...taskInstructions, conversationBreakDetected: state && state.startsWith('REENGAGING') };

    const systemMessage = getSystemPrompt(conversationAnalysis, timeContext);
    const contextMessage = buildContextPrompt(contextData, conversationAnalysis);
    const taskMessage = buildTaskPrompt(finalTaskInstructions, contextData, conversationAnalysis);
    const userMessage = `${contextMessage}\n${taskMessage}`;

    return { systemMessage, userMessage };
}

function getTimeContext(now = new Date()) {
    const day = now.getDay();
    const hour = now.getHours();
    const dayName = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'][day];
    let dayPeriod = hour < 5 ? 'late night' : hour < 8 ? 'early morning' : hour < 12 ? 'morning' : hour < 14 ? 'afternoon' : hour < 17 ? 'late afternoon' : hour < 19 ? 'evening' : hour < 22 ? 'late evening' : 'night';
    if (day === 0 || day === 6 || (day === 5 && hour >= 17)) {
        return `It's the weekend, ${dayName}(${dayPeriod}). You can use a more relaxed, fun-oriented greeting.`;
    }
    if (day >= 1 && day <= 5) {
        return `It's a weekday, ${dayName} - ${dayPeriod}. A casual check-in about their day or a light greeting (e.g., "Happy ${dayName}!") is appropriate.`;
    }
    return null;
}