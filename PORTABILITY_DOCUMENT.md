# Portability Document: AI Assistant Extension (v2.0)

This document provides a complete technical specification for the "AI Assistant" Chrome Extension. It is designed to be detailed enough for a developer or another AI to recreate the extension with 100% fidelity without access to the original source code.

## 1. Project Overview and Purpose

The AI Assistant (internally branded "Wingman AI") is a sophisticated browser extension designed to act as a ghostwriting assistant for users on dating applications. Its primary purpose is to help users craft more engaging, context-aware, and effective messages.

The extension works by scraping conversation history and profile data from supported dating sites (Tinder and Bumble). It performs a deep analysis of this data to understand the conversational context, the relationship dynamic, and the personalities of the user and their match. It then uses this analysis to generate message suggestions powered by a large language model (LLM), which can be configured by the user. The user can fine-tune the AI's tone, style, and length, and provide custom goals to guide the message generation process.

## 2. Environment Details

The extension is built for the Google Chrome browser and adheres to the following technical specifications.

*   **Manifest Version**: 3
*   **Permissions**: `storage`, `activeTab`, `scripting`, `geolocation`.
*   **Host Permissions**: `*://*.bumble.com/*`, `*://*.tinder.com/*`, `https://nominatim.openstreetmap.org/*`, `https://timeapi.io/*`, `http://localhost:*/*`, `http://10.0.0.24:8000/*`.
*   **Background Logic**: Service Worker (`background.js`), ES Module type.
*   **User Interface**: Default popup (`popup.html`).
*   **Keyboard Shortcut**: `Ctrl+Shift+B` (Mac: `Command+Shift+B`).

## 3. Key Architectural Decisions

This section explains the reasoning behind the extension's core design choices.

*   **Manifest V3 and the Stateful Service Worker**: The extension is built on Manifest V3, where service workers are non-persistent (they can be terminated at any time). To create a seamless user experience, a "stateful" architecture was chosen. All critical information—such as the state of an ongoing AI generation, the full analysis for a match, and user settings—is saved to `chrome.storage.local` immediately after being created or changed. This ensures that even if the service worker is terminated and restarted, the extension can resume its state exactly where it left off, which is crucial for handling long-running AI tasks.

*   **Persistent Port Communication**: For the frequent and bidirectional communication required between the popup UI (`popup.js`) and the background service worker (`background.js`), a long-lived port connection (`chrome.runtime.connect`) is used instead of single messages (`chrome.runtime.sendMessage`). This is more efficient and allows the background script to proactively push updates to the UI (e.g., streaming a response or updating the generation timer) without waiting for a request from the popup. The connection's `onDisconnect` event is also critical for resource management, as it triggers the cancellation of any ongoing `fetch` requests in the background script.

*   **Modular, State-Driven Prompt Engineering**: The prompt sent to the AI is not a single static string. It is dynamically constructed by a modular system (`systemPrompt.js`, `contextPrompt.js`, `taskPrompt.js`). This was an intentional design choice to allow for highly nuanced and context-aware AI instructions. By changing the AI's core rules, context, and immediate task based on the real-time `conversationState` (e.g., `OPENER`, `REENGAGING_DAY`), the extension can guide the AI to produce far more relevant and effective messages than a generic prompt ever could.

*   **Pluggable Analysis Service**: The extension features a dual-analysis architecture. It includes a robust `localAnalysisService.js` that can perform detailed conversation analysis offline using the `compromise.js` library and custom heuristics. However, it is also designed to call an external, more powerful analysis service if the user provides a URL. `background.js` is built to merge the results from both, creating a flexible and powerful system that works for all users while offering enhanced capabilities for those with access to a dedicated backend.

*   **Free-Tier API Dependencies**: For external services like geocoding and time zone lookups, public and free-to-use APIs (`nominatim.openstreetmap.org` and `timeapi.io`) were chosen. This ensures the extension's core geo-context features remain functional for all users without requiring them to sign up for paid API keys.

## 4. Full Folder/File Structure
(Descriptions are in the File-by-File Breakdown)
*   `manifest.json`
*   `background.js`
*   `popup.html`, `popup.css`, `popup.js`
*   `content-scraper.js`
*   `localAnalysisService.js`
*   `prompts.js`, `constants.js`, `uiFormatters.js`
*   `icons/` (icon16.png, icon48.png, icon128.png)
*   `lib/` (compromise.js, spacetime.min.js, spacetime-informal.min.js)
*   `prompts/` (systemPrompt.js, contextPrompt.js, taskPrompt.js)

## 5. File-by-File Breakdown (Enhanced Detail)

### `popup.js`

*   **Natural Language Explanation:** This file is the "brain" of the user interface, responsible for everything the user sees and does. It initializes the UI, loads settings, and sets up event listeners. It communicates constantly with `background.js` via a persistent port, sending requests and receiving updates. It manages the UI state (loading, main, settings, error) and contains the logic for the complex debug modal.

*   **Pseudo-code:**
    ```
    // State object:
    //   currentMatchUUID: String | null - Unique ID for the current conversation partner.
    //   currentViewId: String - The ID of the currently visible view (e.g., "main-view").
    //   pasterFn: Function | null - A reference to the correct function for pasting text on the current site.
    //   isRefreshing: Boolean - A flag to prevent duplicate data refreshes.
    //   sessionMatchProfile: Object | null - The full data profile for the current match, received from background.js.
    //   sessionScrapedData: Object | null - The raw data scraped from the page.

    // Function initializePopup():
    //   Calls setupEventListeners().
    //   Calls setupPort() to connect to background.js.
    //   Calls loadAndApplySettings().
    //   Calls refreshDataAndUI() to start the process.

    // Function refreshDataAndUI():
    //   If isRefreshing is true, return.
    //   Set isRefreshing to true and show the loading view.
    //   Query for the active browser tab.
    //   If tab.url is not a supported site (Tinder/Bumble), show an error view.
    //   Select the correct scraper function (e.g., scrapeTinderPage) based on the URL.
    //   Execute the scraper script on the page via chrome.scripting.executeScript.
    //   In the callback:
    //     If the result contains an error, show the error view.
    //     Else, send the result (scrapedData) to background.js with action "getNlpAnalysis".

    // Port onMessage Listener (handles messages from background.js):
    //   Switch on message.action:
    //     Case "nlpAnalysisResponse": (data: { matchProfile: Object, error?: String })
    //       If an error exists, show the error view.
    //       Store message.matchProfile in state.sessionMatchProfile.
    //       Set state.currentMatchUUID from the profile.
    //       Call loadAndApplySettings() to apply any match-specific settings.
    //       Update the UI with analysis results (e.g., conversation status display).
    //       Show the main view.
    //     Case "generationUpdate": (data: { uuid: String, state: Object })
    //       If message.uuid matches state.currentMatchUUID, call syncUIWithState(message.state).

    // Event Listener handleGenerateClick():
    //   Gather all UI settings into a taskInstructions object.
    //   If the debug-mode checkbox is checked:
    //     Show the debug modal, passing it all the necessary context.
    //   Else:
    //     Send the taskInstructions to background.js with action "getFinalPayload".
    //   Call setUIGeneratingState(true).
    //   Call startTimer().
    ```

### `background.js`

*   **Natural Language Explanation:** This is the extension's backend service worker. It manages state, orchestrates complex tasks like API calls and analysis, and handles data persistence. It uses a `MatchMemory` class to manage profiles for each conversation partner, storing data in `chrome.storage`. It is designed to be robust in a Manifest V3 environment.

*   **Pseudo-code:**
    ```
    // Class MatchMemory:
    //   Function _getMatchUUID(name: String, profile: String): String - Creates a unique SHA-1 hash ID.
    //   Function getMatchProfile(uuid: String): Promise<Object | null> - Retrieves profile from `chrome.storage.local`.
    //   ...

    // Function getGenerationState(uuid: String) / setGenerationState(uuid: String, newState: Object):
    //   Gets or sets the AI generation state object in `chrome.storage.local` to survive service worker termination.
    //   The state object contains: { isGenerating, response, error, generationId, generationStartTime }.

    // onConnect Listener (for connections from popup.js):
    //   Create a messageHandlers object mapping action strings to functions.
    //   Listen for messages on the port and call the corresponding handler.
    //   Listen for the onDisconnect event to abort all ongoing fetch requests.

    // Message Handler "getNlpAnalysis"(request: { data: { scrapedData: Object, uiSettings: Object } }):
    //   Get or create a match UUID from the scrapedData.
    //   Retrieve the existing matchProfile from storage.
    //   Generate a new cache hash from the current conversation history.
    //   If newCacheHash matches the stored hash and analysis exists (cache hit), send the existing profile back to the popup.
    //   If cache miss:
    //     Update the matchProfile with the new scrapedData.
    //     Run local analysis: `runFullConversationAnalysis(history, memory)`.
    //     If an external analysis URL is configured, fetch from it and merge the results.
    //     Save the updated matchProfile (with new analysis and cache hash) to storage.
    //     Send the full matchProfile to the popup.

    // Message Handler "getAIResponse"(request: { data: { payload: Object, generationId: Number, uuid: String } }):
    //   Calls `handleAITask` to manage the fetch request to the AI model.

    // Function handleAITask(uuid: String, generationId: Number, payload: Object, port: Port):
    //   Create a new AbortController and store it in a global map keyed by uuid.
    //   Set the generation state in storage to { isGenerating: true, generationId, generationStartTime }.
    //   Fetch from the user-configured AI server URL, passing the controller's signal.
    //   On success:
    //     Clean the response text (remove stop tokens).
    //     Set generation state to { isGenerating: false, response: cleanedText }.
    //   On error:
    //     If it's not an AbortError, set generation state to { isGenerating: false, error: errorMessage }.
    //   Finally:
    //     Remove the AbortController from the map.
    ```

### `localAnalysisService.js`

*   **Natural Language Explanation:** The local NLP engine. It uses `compromise.js` and custom heuristics to analyze conversation text. It determines emotional tone, topics, and conversation state, maintaining a "memory" object for each match to track liked/disliked topics and inside jokes.

*   **Pseudo-code:**
    ```
    // Dictionaries: extensive key-value maps for positive, negative, arousal, vulnerable, and sexual words.

    // Function runFullConversationAnalysis(conversationHistory: Array<Message>, storedMemory: Object): Object
    //   Calls `updateMemoryFromHistory` to get updatedMemory.
    //   Calls `analyzeLastMessageForSubtext` to get lastMessageAnalysis.
    //   Returns { updatedMemory, lastMessageAnalysis }.

    // Function updateMemoryFromHistory(history: Array<Message>, memory: Object): Object
    //   Loop through pairs of user/match messages in the history.
    //   For each pair:
    //     Identify nouns in the user's message as potential topics.
    //     Analyze the match's reply for emotional reaction using `analyzeMessageSubtext`.
    //     Calculate a score change based on the reaction's valence and arousal.
    //     Update the score for each topic in the memory object.
    //     If a topic's score is very low, add it to `memory.avoidedTopics`.
    //     If the match's reply indicates laughter, save the user's message to `memory.insideJokes`.
    //   Return the updated memory object.

    // Function analyzeMessageSubtext(doc: CompromiseDocument): Object
    //   Initialize a subtext object: { valence: 0.0, arousal: 0.0, intents: Set, ... }.
    //   For each word in the dictionaries, if the doc has the word, adjust valence/arousal scores.
    //   Identify intents (e.g., 'questioning', 'planning') based on keywords.
    //   Identify nuance (e.g., 'isSarcastic', 'isVulnerable') based on keywords.
    //   Return the calculated subtext object.
    ```

## 6. UI/UX Description (Enhanced)

The UI is a single-page application within the popup, designed for quick, intuitive control over the AI generation process.

*   **Theme & Styling**: A modern dark theme with a dark grey background (`#1a1a1a`), slightly lighter cards (`#242424`), and a bright amber-yellow accent (`#ffc107`). The aesthetic is clean and functional, prioritizing clarity.

*   **Views**: The UI is composed of four distinct views:
    *   `#loading-view`: A simple view with a spinner and "Reading page..." text. Shown automatically on popup open.
    *   `#error-view`: Displays an error title and message. Shown when scraping fails or a critical error occurs.
    *   `#main-view`: The primary user interface, containing all the core controls for generation.
    *   `#settings-view`: A separate screen for global configuration.

### Main View Element Breakdown

*   **Header (`.app-header`)**:
    *   `#reset-match-btn`: **Reset Icon.** Clears all stored settings and history for the current match.
    *   `#settings-btn`: **Gear Icon.** Switches the display to the `#settings-view`.

*   **Response Area (`#response-area`)**:
    *   **Purpose**: An editable `div` where the final AI-generated message is displayed.
    *   **States**:
        *   **Generating**: `loading` class is added, which applies a subtle blinking ellipsis animation.
        *   **Error**: `error` class is added, turning the text color to red.
    *   **Action**: User can manually edit the text before copying.

*   **Refinement Actions (`#refinement-actions`)**:
    *   **Purpose**: A container for buttons that appear after a message is generated.
    *   `.btn-refine`: Buttons like "Make it Funnier", "Be More Direct", "Make it Shorter".
    *   **Action**: Clicking one sends a "refineAIResponse" message to `background.js` with the original response and the refinement type.

*   **Custom Instructions (`#custom-instruction`)**:
    *   **Purpose**: A `textarea` for the user to type a specific goal for the AI (e.g., "ask her about her dog").
    *   **Action**: Its value is included in the "task" prompt for the AI.

*   **Quick Toggles (`.quick-toggles`)**:
    *   `#question-toggle-checkbox`: **"End w/ Question" Toggle.** A custom-styled switch. When checked, instructs the AI to end its message with a question.
    *   `#geo-context-toggle`: **"Use Geo-context" Toggle.** When checked, forces the inclusion of geo-temporal data in the AI prompt.
    *   `#new-topic-toggle`: **"Start Fresh" Toggle.** When checked, instructs the AI to ignore the last message and start a new topic from the match's profile.
    *   `#strict-goal-toggle`: **"Strict Goal" Toggle.** When checked, tells the AI to ignore almost all other context and focus solely on the text in the "Custom Instructions" box.

*   **Generate Actions (`.generate-actions`)**:
    *   `#generate-btn`: **Primary Button.** The main action button.
    *   **Action**: Triggers the `handleGenerateClick` function.
    *   **States**:
        *   **Default**: Amber background, says "Generate".
        *   **Disabled/Refreshing**: Opacity is lowered, says "Refreshing...".
        *   **Generating**: Opacity is lowered, says "Thinking...".
    *   `#copy-btn`: **Copy Icon.** Copies the content of the response area to the clipboard.
    *   `#cancel-btn`: **Circle-X Icon.**
    *   **Visibility**: Hidden by default. Becomes visible only when `isGenerating` is true.
    *   **Action**: Sends a "cancelGeneration" message to `background.js`.

*   **Tuning Tabs (`.tabs` & `.tab-content`)**:
    *   **Purpose**: A standard tabbed interface to switch between different control panels.
    *   **`#tune-response` Tab**:
        *   `#linguistic-style-select`: A dropdown to select the AI's writing style (e.g., Witty, Poetic).
        *   `#flirty-slider`, `#length-slider`, etc.: Range sliders for fine-tuning parameters.
        *   **Behavior**: As the user moves a slider, a label next to it updates in real-time with a descriptive value (e.g., "Flirty", "Medium").
    *   **Other Tabs (`#analysis`, etc.)**: These tabs display formatted debug information from the `conversationAnalysis` object.

## 7. User Workflows
(This section remains largely the same as the previous version, as the workflow is unchanged.)

## 8. Installation and Usage Instructions
(This section remains largely the same as the previous version.)
