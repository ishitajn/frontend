// src/prompts.js (Corrected with Consistent Data Structuring)

import { isMessageGeoRelated, getTimeContext } from './conversationHelpers.js';
import { getSystemPrompt } from './prompts/systemPrompt.js';
import { buildContextPrompt } from './prompts/contextPrompt.js';
import { buildTaskPrompt } from './prompts/taskPrompt.js';

/**
 * Determines whether the geographical context should be included in the prompt.
 * @param {object} params
 * @param {import('./conversationHelpers.js').GenerationData['geoContextData']} params.geoContextData
 * @param {boolean} params.forceIncludeGeoContext
 * @param {import('./conversationHelpers.js').ConversationAnalysis} params.conversationAnalysis
 * @param {import('./conversationHelpers.js').Message[]} params.conversationHistory
 * @param {import('./conversationHelpers.js').TaskInstructions} params.taskInstructions
 * @returns {boolean}
 */
function shouldIncludeGeoContext({
    geoContextData,
    forceIncludeGeoContext,
    conversationAnalysis,
    conversationHistory,
    taskInstructions
}) {
    if (!geoContextData) return false;
    if (forceIncludeGeoContext) return true;

    const state = conversationAnalysis.conversationState;
    const lastMessageFromMatch = conversationHistory?.filter(msg => msg.role === 'assistant').pop()?.content || '';

    // Automatically include if distance is significant and certain conditions are met.
    if (geoContextData.distance.miles > 100) {
        const isNewOrReengaging = state === 'OPENER' || state.startsWith('REENGAGING');
        const isGoalGeoRelated = taskInstructions.goal && isMessageGeoRelated(taskInstructions.goal);
        const isLastMessageGeoRelated = state !== 'OPENER' && isMessageGeoRelated(lastMessageFromMatch);

        if (isNewOrReengaging || isGoalGeoRelated || isLastMessageGeoRelated) {
            return true;
        }
    }

    return false;
}


/**
 * @param {import('./conversationHelpers.js').GenerationData} data
 * @returns {{systemMessage: string, userMessage: string}}
 */
export function generatePrompts(data) {
    // FIX: Destructure from the clean, top-level data object
    const { conversationHistory, taskInstructions, geoContextData, forceIncludeGeoContext, conversationAnalysis } = data;

    // If conversationAnalysis is missing, we cannot proceed.
    if (!conversationAnalysis) {
        throw new Error("generatePrompts failed: conversationAnalysis object is missing.");
    }

    const state = conversationAnalysis.conversationState;

    const includeGeoContext = shouldIncludeGeoContext({
        geoContextData,
        forceIncludeGeoContext,
        conversationAnalysis,
        conversationHistory,
        taskInstructions
    });

    const timeContext = getTimeContext();
    const contextData = {
        ...data,
        includeGeoContext
    };

    // The taskInstructions object is already correctly structured from popup.js
    // We just need to add the conversationBreakDetected flag.
    const finalTaskInstructions = {
        ...taskInstructions,
        conversationBreakDetected: state.startsWith('REENGAGING'),
    };

    const systemMessage = getSystemPrompt(conversationAnalysis, timeContext);
    const contextMessage = buildContextPrompt(contextData, conversationAnalysis);
    // FIX: Pass conversationAnalysis explicitly to buildTaskPrompt
    const taskMessage = buildTaskPrompt(finalTaskInstructions, contextData, conversationAnalysis);

    const userMessage = `${contextMessage}\n${taskMessage}`;

    return {
        systemMessage,
        userMessage
    };
}