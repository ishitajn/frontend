import { validatePromptInputs, sanitizeInputs } from './validator.js';
import { ContentBuilder, CONTENT_PRIORITIES } from './contentPrioritizer.js';

/**
 * Generates the system prompt for the AI based on conversation analysis.
 * It builds the prompt by combining a core directive, dynamic guidelines based on the last message,
 * state-specific instructions, and general best practices.
 * @param {object} conversationAnalysis - The analysis object for the conversation.
 * @param {string} timeContext - A string describing the current time context (e.g., "weekday afternoon").
 * @returns {string} The complete system prompt.
 */
export function getSystemPrompt(conversationAnalysis, timeContext) {
    try {
        validatePromptInputs({}, conversationAnalysis);
        const { sanitizedAnalysis } = sanitizeInputs({}, conversationAnalysis);
        
        const { conversationState, lastMessageAnalysis, memory, forceNewTopic } = sanitizedAnalysis;
        
        const builder = new ContentBuilder();
        
        // Core system prompt (highest priority)
        const corePrompt = buildCorePrompt();
        builder.addSection('core', corePrompt, CONTENT_PRIORITIES.TASK_DIRECTIVES);
        
        // Dynamic guidelines based on analysis
        const dynamicGuidelines = buildDynamicGuidelines(lastMessageAnalysis, memory);
        if (dynamicGuidelines) {
            builder.addSection('dynamic', dynamicGuidelines, CONTENT_PRIORITIES.CRITICAL_OVERRIDES);
        }
        
        // State-specific focus and hierarchy
        const stateContent = buildStateSpecificContent(conversationState, forceNewTopic);
        builder.addSection('state', stateContent, CONTENT_PRIORITIES.LAST_MESSAGE_CONTEXT);
        
        // Base guidelines (medium priority)
        const baseGuidelines = buildBaseGuidelines(forceNewTopic, conversationState);
        builder.addSection('guidelines', baseGuidelines, CONTENT_PRIORITIES.MEMORY_STRATEGY);
        
        return builder.build();
        
    } catch (error) {
        console.error('Error building system prompt:', error);
        return buildFallbackSystemPrompt();
    }
}

/**
 * Builds the core, high-priority system prompt directives.
 * @returns {string} The core system prompt text.
 */
function buildCorePrompt() {
    return `You are DateWing, an AI ghostwriter for dating app messages.

**--- CORE RULES ---**
1. **PERSPECTIVE:** Write from a male perspective to a female.
2. **FOLLOW INSTRUCTIONS:** Strictly follow the user's instructions for **TONE**, **LENGTH**, and **STYLE** in the task.`;
}

/**
 * Builds dynamic guidelines based on the analysis of the last message and conversation memory.
 * @param {object} lastMessageAnalysis - The analysis of the last message from the match.
 * @param {object} memory - The conversation memory object.
 * @returns {string|null} A string of dynamic guidelines or null if none are applicable.
 */
function buildDynamicGuidelines(lastMessageAnalysis, memory) {
    const guidelines = [];
    
    if (lastMessageAnalysis?.isVulnerable) {
        guidelines.push('* **BE SUPPORTIVE:** Respond with warmth and validation.');
    }
    if (lastMessageAnalysis?.valence < -0.5) {
        guidelines.push('* **EMPATHIZE:** Acknowledge their feelings with empathy.');
    }
    if (memory?.dateArcPhase === 'planning') {
        guidelines.push('* **SOLIDIFY PLANS:** Be confident about logistics.');
    }
    if (memory?.dateArcPhase === 'escalation') {
        guidelines.push('* **BUILD TENSION:** Focus on sexual/romantic tension.');
    }
    
    return guidelines.length > 0 ? `**--- DYNAMIC GUIDELINES ---**
${guidelines.join('\n')}` : null;
}

/**
 * Builds state-specific content to guide the AI's focus and information priority.
 * @param {string} state - The current conversation state (e.g., 'OPENER', 'ACTIVE_CONVO').
 * @param {boolean} forceNewTopic - Whether to force a new topic.
 * @returns {string} The state-specific section of the system prompt.
 */
function buildStateSpecificContent(state, forceNewTopic) {
    const stateConfig = {
        'OPENER': {
            focus: 'Start with a greeting using their name. Pull a detail from their profile.',
            hierarchy: '1. **Their Profile**'
        },
        'EARLY_CONVO': {
            focus: 'Build rapport. Light tone. Expand on common interests.',
            hierarchy: '1. **Their Last Message**\n2. **Conversation History**'
        },
        'REENGAGING_DAY': {
            focus: 'Start with a warm greeting. Pivot to a fresh topic. Avoid rehashing.',
            hierarchy: '1. **Their Profile:** For new topic selection.\n2. **Conversation History:** For topic avoidance only.'
        },
        'REENGAGING_WEEK': {
            focus: 'Start with a warm greeting. Pivot to a fresh topic. Avoid rehashing.',
            hierarchy: '1. **Their Profile:** For new topic selection.\n2. **Conversation History:** For topic avoidance only.'
        },
        'REENGAGING_MONTH': {
            focus: 'Start with a warm greeting. Pivot to a fresh topic. Avoid rehashing.',
            hierarchy: '1. **Their Profile:** For new topic selection.\n2. **Conversation History:** For topic avoidance only.'
        }
    };
    
    const config = stateConfig[state] || {
        focus: 'Deepen connection. Use callbacks and inside jokes. Profile is secondary.',
        hierarchy: `1. ${forceNewTopic ? 'CONVERSATION HISTORY (for context)' : 'Their Last Message'}\n2. Conversation History`
    };
    
    return `**--- FOCUS: ${state.replace(/_/g, ' ')} ---**
${config.focus}

**--- INFORMATION PRIORITY ---**
${config.hierarchy}`;
}

/**
 * Builds the base guidelines for the AI's writing style.
 * @param {boolean} forceNewTopic - Whether a new topic is being forced.
 * @param {string} state - The current conversation state.
 * @returns {string} The base guidelines section of the system prompt.
 */
function buildBaseGuidelines(forceNewTopic, state) {
    const guidelines = [
        '* **BE HUMAN:** Write like a real person, not a bot.',
        '* **USE SPECIFICS:** Use real details. No clichés.',
        '* **ASK SMART QUESTIONS:** Only one open-ended question if any.'
    ];
    
    if (!forceNewTopic && state !== 'OPENER') {
        guidelines.push('* **ADDRESS THEIR MESSAGE:** Reply to their main point before changing topic.');
    }
    
    return `**--- GUIDELINES ---**
${guidelines.join('\n')}`;
}

/**
 * Builds a fallback system prompt to be used in case of an error.
 * @returns {string} The fallback system prompt.
 */
function buildFallbackSystemPrompt() {
    return `You are DateWing, an AI ghostwriter for dating app messages.

**--- CORE RULES ---**
1. **PERSPECTIVE:** Write from a male perspective to a female.
2. **BE HUMAN:** Write like a real person, not a bot.

**--- CRITICAL ERROR NOTICE ---**
Using fallback system prompt due to validation error. Proceed with basic guidelines.`;
}