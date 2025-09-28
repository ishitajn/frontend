// src/prompts/taskPrompt.js (Corrected with Defensive Destructuring and Optional Chaining)

import { getToneDescription, getLengthDescription, getStyleDescription, getEmojiInstruction } from '../conversationHelpers.js';

// FIX: Accept conversationAnalysis and timeContext as parameters
export function buildTaskPrompt(instructions, data, conversationAnalysis, timeContext) {
    // FIX: Destructure only what's needed from instructions
    const { goal, flirtyValue, lengthValue, endWithQuestion, linguisticStyle, strictGoalOverride, forceNewTopic, myName, theirName, emojiStrategy, conversationBreakDetected, assistantPromptTemplate } = instructions;

    // FIX: Use the explicit conversationAnalysis parameter, providing a fallback.
    const { suppressGreeting, memory, lastMessageAnalysis, conversationState } = conversationAnalysis || {};

    const { conversationHistory } = data;

    const emojiInstruction = getEmojiInstruction(emojiStrategy, flirtyValue, linguisticStyle);

	const lastMessageFromMatch = conversationHistory?.filter(msg => msg.role === 'assistant').pop()?.content || '';

    if (strictGoalOverride && goal) {
        const finalPrompt = `
**HARD RESET INITIATED — USER GOAL OVERRIDE TAKES ABSOLUTE PRIORITY**
Your ONLY job is to generate one message that fulfills the user’s goal: "${goal}"
Do NOT use any other context. Strictly follow the requested tone, length, and style.

--- EXECUTION PARAMETERS ---
- **TONE:** ${getToneDescription(flirtyValue)}
- **LENGTH:** ${getLengthDescription(lengthValue)}
- **LINGUISTIC STYLE:** ${getStyleDescription(linguisticStyle, conversationAnalysis)}
${emojiInstruction ? `- **EMOJI USAGE:** ${emojiInstruction}` : ''}
`;
        const finalCommand = `--- FINAL COMMAND ---\nWrite the next message for **${myName || 'the male user'}**. Only return the message text.`;
        return [finalPrompt, finalCommand].join('\n\n');
    }

    const userGoal = goal?.trim() ? `- **ABSOLUTE PRIORITY – USER'S GOAL:** ${goal}` : '';

    const directives = `
--- YOUR TASK & DIRECTIVES (Core Constraints) ---
- **TONE:** ${getToneDescription(flirtyValue)}
- **LENGTH:** ${getLengthDescription(lengthValue)}
- **LINGUISTIC STYLE:** ${getStyleDescription(linguisticStyle, conversationAnalysis)}
${emojiInstruction ? `- **EMOJI USAGE:** ${emojiInstruction}` : ''}
- **CONVERSATIONAL GOAL:** ${endWithQuestion ? "Conclude with an engaging, open-ended question." : "Avoid ending with a direct question. Aim for a statement that invites a response."}
${userGoal}
`.trim();

    const finalCommand = (assistantPromptTemplate || `Write the next message for **{myName}** - the male, replying to **{theirName}** - the female. Only return the message text. No labels, no quotes, no extra formatting.`)
        .replace('{myName}', myName || 'USER')
        .replace('{theirName}', theirName || 'MATCH')
        .trim();

    let focusSection = '';
    const timeContextInstruction = (timeContext && !['ACTIVE_CONVO', 'EARLY_CONVO'].includes(conversationState)) ? `\n*   **Time Hint:** ${timeContext}` : '';
    switch (conversationState) {
    case 'OPENER':
        focusSection = `
**--- FOCUS: THE OPENER ---**
Your goal is to write a compelling opening message based on a specific detail from the match's profile.
You MUST start the message with a greeting that includes the match's name (e.g., "Hey [Name]," or "[Name]! ..."). This is non-negotiable.${timeContextInstruction}
`;
        break;
    case 'EARLY_CONVO':
        focusSection = `
**--- FOCUS: EARLY CONVERSATION ---**
The conversation is new. Your goal is to build rapport. Keep the tone light. After replying to their message, you can broaden the topic.
`;
        break;
    case 'REENGAGING_DAY':
        focusSection = `
**--- FOCUS: SOFT RE-ENGAGEMENT (1-7 Day Gap) ---**
The chat stalled. Your goal is to revive it casually. Be friendly and low-pressure.${timeContextInstruction}
**--- MANDATORY MESSAGE STRUCTURE ---**
1.  **GREETING WITH NAME:** You MUST start with a friendly greeting that uses their name to re-establish a personal connection (e.g., "Hey [Name],").
2.  **RULE:** Do NOT talk about the old topic unless you are answering a direct question they asked.
3.  **NEW TOPIC:** Pivot to a new, lighthearted question or comment from their profile.
`;
        break;
    case 'REENGAGING_WEEK':
        focusSection = `
**--- FOCUS: COLD RE-ENGAGEMENT (1-4 Week Gap) ---**
The chat is likely dead. Your goal is a confident message to restart it. Be direct and charming.${timeContextInstruction}
`;
        break;
    case 'REENGAGING_MONTH':
        focusSection = `
**--- FOCUS: RESURRECTION (1+ Month Gap) ---**
This is a "hail mary" attempt. Be bold and lighthearted. Acknowledge the time gap with humor.${timeContextInstruction}
`;
        break;
    case 'ACTIVE_CONVO':
    default:
        focusSection = `
**--- FOCUS: DEEPEN CONNECTION ---**
The conversation has momentum. Your goal is to deepen the connection using callbacks and inside jokes from the history. The profile is now secondary.
`;
        break;
    }


    return [
        focusSection,
        directives,
        finalCommand
    ].filter(Boolean).join('\n\n');
}