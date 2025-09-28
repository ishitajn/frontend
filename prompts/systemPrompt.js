// src/prompts/systemPrompt.js (Fully Updated with Stricter Naming Rules)

/**
 * Builds the system prompt with scenario-based logic.
 * @param {import('../conversationHelpers.js').ConversationAnalysis} conversationAnalysis - The full analysis of the conversation.
 * @param {string | null} timeContext - A string describing the current time context (e.g., "It's the weekend").
 * @param {string} [systemPromptTemplate] - An optional template to override the default prompt structure.
 * @returns {string} The system prompt.
 */
export function getSystemPrompt(conversationAnalysis, timeContext, systemPromptTemplate) {
    const persona = `
You are DateWing, an AI ghostwrites for dating app messages.

**--- CORE RULES ---**
1.  **PERSPECTIVE:** Write from a male perspective to a female.
2.  **Primary Goal:** Your main job is to generate a single, ready-to-send message based on the user's instructions.
3.  **FOLLOW INSTRUCTIONS:** Strictly follow all instructions, especially for TONE, LENGTH, and STYLE, provided in the user's task prompt.
4.  **No Commentary:** Never add your own commentary, labels, or self-references (e.g., "As an AI..."). Only return the message text.
`.trim();

    const guidelines = `
**--- GENERAL GUIDELINES ---**
*   **BE HUMAN:** Write like a real person, not a robot. Use casual language unless the user's style is formal.
*   **USE SPECIFICS:** Use details from the profiles or conversation history. Avoid generic compliments or clichés.
*   **ASK SMART QUESTIONS:** If you ask a question, make it one open-ended question. Do not ask multiple questions in a row.
*   **ADDRESS THEIR MESSAGE:** Always respond to the main point or question in the match's last message before changing the topic (unless told otherwise).
`.trim();

    if (systemPromptTemplate) {
        const { state, suppressGreeting, lastMessageAnalysis, memory } = conversationAnalysis || {};
        const { intents, isVulnerable, isDirectQuestion, isLowEffort, suggestedResponseStyle } = lastMessageAnalysis || {};
        const { dateArcPhase, insideJokes, avoidedTopics, topics } = memory || {};

        const goodTopics = topics ? Object.entries(topics).filter(([, data]) => data.score > 0.5).map(([topic]) => topic) : [];

        return systemPromptTemplate
            .replace('{persona}', persona)
            .replace('{guidelines}', guidelines)
            .replace('{timeContext}', timeContext || 'N/A')
            .replace('{state}', state || 'N/A')
            .replace('{suppressGreeting}', suppressGreeting || 'false')
            .replace('{dateArcPhase}', dateArcPhase || 'N/A')
            .replace('{lastMessageIntents}', intents?.join(', ') || 'N/A')
            .replace('{isVulnerable}', isVulnerable || 'false')
            .replace('{isDirectQuestion}', isDirectQuestion || 'false')
            .replace('{isLowEffort}', isLowEffort || 'false')
            .replace('{suggestedResponseStyle}', suggestedResponseStyle || 'N/A')
            .replace('{insideJokes}', insideJokes?.join(', ') || 'None')
            .replace('{avoidedTopics}', avoidedTopics?.join(', ') || 'None')
            .replace('{goodTopics}', goodTopics.join(', ') || 'None');
    }

    return `${persona}\n\n${guidelines}`;
}