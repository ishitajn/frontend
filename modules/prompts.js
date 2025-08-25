/**
 * Generates the system and user prompts based on the full NLP payload.
 * @param {object} payload - The full NLP payload.
 * @returns {{system_prompt: string, user_prompt: string}}
 */
export function generatePrompts(payload) {
    const {
        matchId,
        conversation_state,
        geo,
        suggestions,
        analysis,
        conversation_analysis,
        pipeline
    } = payload;

    // System prompt providing the AI with its role, context, and instructions.
    const system_prompt = `You are a dating assistant AI. Your goal is to help the user craft a message to their match.

Here is the data you have to work with:
- matchId: ${matchId}
- pipeline: ${pipeline}

Conversation State:
- Topics (Focus): ${JSON.stringify(conversation_state.topics.focus)}
- Topics (Avoid): ${JSON.stringify(conversation_state.topics.avoid)}
- Recent Topics: ${JSON.stringify(conversation_state.recent_topics)}

Geo Context:
- User Location: ${geo.userLocation.city_state}, ${geo.userLocation.country}
- Match Location: ${geo.matchLocation.city_state}, ${geo.matchLocation.country}
- Time Difference: ${geo.time_difference_hours} hours
- Distance: ${geo.distance_miles} miles
- Is Virtual: ${geo.is_virtual}

Analysis:
- Sentiment: ${analysis.sentiment}
- Flirtation Level: ${analysis.flirtation_level}
- Engagement: ${analysis.engagement}
- Pace: ${analysis.pace}
- Power Dynamics: ${analysis.power_dynamics.summary} (User leading: ${analysis.power_dynamics.user_is_leading})

Conversation Analysis:
- Last Message From: ${conversation_analysis.Last_message_from}
- Match Last Message Has Question: ${conversation_analysis.match_last_message_has_question}
- Recent Engagement Score: ${conversation_analysis.recent_engagement_score}

Suggestions:
- Topic Shift Recommended: ${suggestions.topic_shift_recommended}
- Focus Suggestions: ${JSON.stringify(suggestions.focus)}
- Avoid Suggestions: ${JSON.stringify(suggestions.avoid)}
`;

    // User prompt providing the specific task for the AI.
    const user_prompt = `Based on the system context, please draft a message.

Key information for this message:
- Last message from user: "${conversation_analysis.last_message_from_user}"
- Last message from match: "${conversation_analysis.last_message_from_match}"

Suggestions for this turn:
- Suggest Follow-up Question: ${conversation_analysis.suggest_follow_up_question}
- Suggest Flirtation: ${conversation_analysis.suggest_flirtation}
- Suggest Topic Shift: ${conversation_analysis.suggest_topic_shift}
- Suggest Greeting: ${conversation_analysis.suggest_greeting}

Generate a response that is engaging and appropriate.
`;

    return { system_prompt, user_prompt };
}
