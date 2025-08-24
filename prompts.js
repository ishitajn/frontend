// src/prompts.js (Corrected with Consistent Data Structuring)

import { isMessageGeoRelated, getTimeContext } from './conversationHelpers.js';
import { getSystemPrompt } from './prompts/systemPrompt.js';
import { buildContextPrompt } from './prompts/contextPrompt.js';
import { buildTaskPrompt } from './prompts/taskPrompt.js';

/**
 * @param {import('./conversationHelpers.js').GenerationData} data
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
    const lastMessageFromMatch = conversationHistory?.filter(msg => msg.role === 'assistant').pop()?.content || '';
    let includeGeoContext = false;
    if (geoContextData) {
        if (forceIncludeGeoContext || (geoContextData.distance.miles > 100 && (state === 'OPENER' || state.startsWith('REENGAGING') || (taskInstructions.goal && isMessageGeoRelated(taskInstructions.goal)) || (state !== 'OPENER' && isMessageGeoRelated(lastMessageFromMatch))))) {
            includeGeoContext = true;
        }
    }

    const timeContext = getTimeContext();
    const contextData = { ...data, includeGeoContext };
    const finalTaskInstructions = { ...taskInstructions, conversationBreakDetected: state.startsWith('REENGAGING') };

    const systemMessage = getSystemPrompt(conversationAnalysis, timeContext);
    const contextMessage = buildContextPrompt(contextData, conversationAnalysis);
    const taskMessage = buildTaskPrompt(finalTaskInstructions, contextData, conversationAnalysis);
    const userMessage = `${contextMessage}\n${taskMessage}`;

    return { systemMessage, userMessage };
}