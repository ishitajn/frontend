# Portability Document: AI Assistant Extension

This document provides a complete technical specification for the "AI Assistant" Chrome Extension. It is designed to be detailed enough for a developer or another AI to recreate the extension with 100% fidelity without access to the original source code.

## 1. Project Overview and Purpose

The AI Assistant (internally branded "Wingman AI") is a sophisticated browser extension designed to act as a ghostwriting assistant for users on dating applications. Its primary purpose is to help users craft more engaging, context-aware, and effective messages.

The extension works by scraping conversation history and profile data from supported dating sites (Tinder and Bumble). It performs a deep analysis of this data to understand the conversational context, the relationship dynamic, and the personalities of the user and their match. It then uses this analysis to generate message suggestions powered by a large language model (LLM), which can be configured by the user. The user can fine-tune the AI's tone, style, and length, and provide custom goals to guide the message generation process.

## 2. Environment Details

The extension is built for the Google Chrome browser and adheres to the following technical specifications.

*   **Manifest Version**: 3
*   **Permissions**:
    *   `storage`: To save user settings, match-specific data, and conversation analysis results persistently.
    *   `activeTab`: To gain access to the currently viewed tab, allowing the extension to be invoked on any page.
    *   `scripting`: To inject the content scraper scripts into the active tab to read page data.
    *   `geolocation`: To allow the user to optionally share their location for calculating distance and time zone differences with their match.
*   **Host Permissions**: The extension requests permission to interact with the following domains:
    *   `*://*.bumble.com/*`: To scrape data and paste messages on Bumble.
    *   `*://*.tinder.com/*`: To scrape data and paste messages on Tinder.
    *   `https://nominatim.openstreetmap.org/*`: To perform geocoding (converting a location name into coordinates).
    *   `https://timeapi.io/*`: To fetch time zone information from coordinates.
    *   `http://localhost:*/*` and `http://10.0.0.24:8000/*`: To allow the user to connect the extension to a locally hosted AI model.
*   **Background Logic**:
    *   **Service Worker**: `background.js`
    *   **Type**: ES Module (`"type": "module"`)
*   **User Interface**:
    *   **Popup**: The main UI is defined in `popup.html`, triggered by the extension's action button.
*   **Keyboard Shortcut**: The popup can be opened with a default shortcut:
    *   **Default**: `Ctrl+Shift+B`
    *   **Mac**: `Command+Shift+B`

## 3. Full Folder/File Structure

The project is organized into a flat structure with logical groupings for libraries, icons, and prompt components.

*   `manifest.json`: The core configuration file for the Chrome extension, defining its permissions and components.
*   `background.js`: The background service worker; acts as the central hub for all heavy lifting, state management, and API calls.
*   `popup.html`: The HTML structure for the extension's popup user interface.
*   `popup.css`: The stylesheet that defines the visual appearance of the popup UI.
*   `popup.js`: The JavaScript file that controls the logic and interactivity of the popup UI.
*   `content-scraper.js`: Contains functions that are injected into web pages to scrape conversation and profile data.
*   `localAnalysisService.js`: An internal service for performing NLP analysis on conversation text without needing an external API.
*   `prompts.js`: The main assembler for creating the final AI prompts, combining context and task-specific instructions.
*   `constants.js`: A centralized file for storing shared constants, default settings, and UI selectors.
*   `uiFormatters.js`: A collection of helper functions used to format data for display in the UI (e.g., generating tooltips).
*   `icons/`: A directory containing the extension's icons.
    *   `icon16.png`: 16x16 icon for the browser toolbar.
    *   `icon48.png`: 48x48 icon for the extensions management page.
    *   `icon128.png`: 128x128 icon for the Chrome Web Store.
*   `lib/`: A directory for third-party JavaScript libraries.
    *   `compromise.js`: A natural language processing library used by `localAnalysisService.js`.
    *   `spacetime.min.js`: A library for handling dates and times.
    *   `spacetime-informal.min.js`: An extension for the spacetime library to parse informal date/time strings.
*   `prompts/`: A directory containing the building blocks for the AI prompts.
    *   `systemPrompt.js`: Generates the high-level system message that defines the AI's persona and core rules.
    *   `contextPrompt.js`: Assembles the contextual background information (profiles, history, analysis).
    *   `taskPrompt.js`: Creates the specific, actionable task instructions for the AI for the current turn.

## 4. Manifest.json Explained

*   **manifest\_version**: Set to `3`, indicating the extension uses the modern Manifest V3 platform, which requires a service worker and has stricter permission models.
*   **name** & **description**: Defines the extension's name ("AI Assistant") and a brief description for the user.
*   **version**: The current version number of the extension.
*   **permissions**:
    *   `storage`: Grants the ability to use the `chrome.storage.local` API, essential for saving user settings and conversation data.
    *   `activeTab`: Allows temporary access to the currently active tab when the user invokes the extension. This is a privacy-friendly permission that avoids needing broad access to all tabs.
    *   `scripting`: Required to execute the `content-scraper.js` functions on the active tab's web page.
    *   `geolocation`: Allows the extension to request the user's geographical location via the browser's geolocation API.
*   **host\_permissions**: A list of specific URL patterns the extension needs to interact with. This includes the dating sites for scraping and the external APIs for geocoding and time zone lookups.
*   **background**:
    *   `service_worker`: Specifies `background.js` as the service worker, which runs in the background to handle events and long-running tasks.
*   **action**:
    *   `default_popup`: Declares that when the user clicks the extension's icon in the toolbar, `popup.html` should be displayed.
*   **web\_accessible\_resources**: Makes certain library files available to the web pages the extension runs on, which can be necessary for some advanced scripting scenarios.
*   **commands**: Defines a keyboard shortcut (`_execute_action`) that triggers the extension's main action (opening the popup).
*   **icons**: Provides paths to the different sizes of icons the browser will use in various contexts.

## 5. File-by-File Breakdown

### `popup.js`

*   **Natural Language Explanation:** This file is the "brain" of the user interface. It is responsible for everything the user sees and does within the popup window. It initializes the UI, loads all saved settings, and sets up event listeners for every button, slider, and input. It communicates constantly with `background.js` via a persistent port, sending requests to get data and receiving updates to display. It manages the UI state, switching between loading, main, settings, and error views. It also contains the logic for the complex debug modal, which allows the user to inspect and override AI generation data.

*   **Pseudo-code:**
    ```
    // Imports: content-scraper, uiFormatters, localAnalysisService, prompts, constants

    // State object:
    //   currentMatchUUID: String | null
    //   currentViewId: String
    //   pasterFn: Function | null
    //   isRefreshing: Boolean
    //   sessionMatchProfile: Object | null
    //   sessionScrapedData: Object | null

    // Global variables: port, tooltipTimeout, timerInterval

    // Function initializePopup():
    //   Setup event listeners for all UI elements.
    //   Establish a persistent connection (port) to background.js.
    //   Load all global and match-specific settings from storage.
    //   Trigger the initial data refresh and UI update.

    // Function sendMessage(message):
    //   If the port is disconnected, try to reconnect.
    //   Send the message object through the port to background.js.
    //   Includes error handling for a disconnected port.

    // Function refreshDataAndUI():
    //   If already refreshing, exit.
    //   Show the loading view.
    //   Get the active browser tab.
    //   If the tab URL is Tinder or Bumble:
    //     Select the correct scraper function (scrapeTinderPage or scrapeBumblePage).
    //     Execute the scraper script on the page.
    //     On success, send the scraped data to background.js with action "getNlpAnalysis".
    //   On failure, show an error view.

    // Port onMessage Listener:
    //   Switch on message.action:
    //     Case "nlpAnalysisResponse":
    //       Store the match profile and analysis data in the state.
    //       Load settings again to apply any match-specific overrides.
    //       If geo-context is missing, request it from background.js.
    //       Update the UI with the analysis (e.g., conversation status).
    //       Show the main view.
    //     Case "geoCalculationsResponse":
    //       Update the geo-context table in the UI.
    //     Case "finalPayloadResponse":
    //       If an error occurred, show it.
    //       Else, send the final payload to background.js with action "getAIResponse".
    //     Case "generationUpdate":
    //       Sync the UI with the new generation state (e.g., update the response text, stop the timer).

    // Event Listener handleGenerateClick():
    //   Gather all current UI settings (sliders, toggles, text inputs).
    //   If debug mode is enabled:
    //     Show the multi-step debug modal with all the generation data.
    //   Else:
    //     Send the UI settings to background.js with action "getFinalPayload".
    //   Set the UI to its "generating" state (disable buttons, show timer).

    // Function handleSettingChange(event):
    //   Get the setting's key from the element's data-storage-key attribute.
    //   Get the new value (e.g., checkbox state or input value).
    //   If it's a match-specific setting, save it under the match's UUID.
    //   Else, save it as a global setting in chrome.storage.local.

    // Function loadAndApplySettings():
    //   Get all default keys from storage.
    //   If a match UUID exists, get the match-specific settings.
    //   Merge the settings (match-specific overrides global).
    //   Loop through all elements with a data-storage-key and apply the loaded values.
    //   Update all UI labels (e.g., for sliders).

    // Other UI Functions:
    //   showView(viewId): Hides all views and shows the one with the specified ID.
    //   setUIGeneratingState(isGenerating): Toggles the UI between normal and generating states.
    //   updateSliderLabels(): Updates the text labels next to sliders.
    //   handleTooltipShow(event): Displays the correct tooltip content for an element.
    ```

### `background.js`

*   **Natural Language Explanation:** This is the extension's backend. It runs as a service worker, listening for events and messages. Its primary job is to manage state and orchestrate complex tasks that the popup cannot handle, such as making API calls, performing detailed analysis, and managing data persistence. It contains a `MatchMemory` class to create and manage profiles for each conversation partner, storing the data in `chrome.storage`. It handles all communication with external services (for geocoding) and the user-configurable AI model. It is designed to be robust, using `AbortController` to cancel tasks if the popup closes and storing generation state to survive service worker termination.

*   **Pseudo-code:**
    ```
    // Imports: prompts, localAnalysisService, uiFormatters, constants, spacetime library

    // Global map for AbortControllers, keyed by match UUID.

    // Class PerformanceLogger:
    //   Function log(logData): Saves performance data to chrome.storage.

    // Class MatchMemory:
    //   Function _getMatchUUID(name, profile): Creates a unique hash ID for a match.
    //   Function getMatchProfile(uuid): Retrieves a match's data from storage.
    //   Function saveMatchProfile(uuid, data): Saves a match's data to storage.
    //   Function createInitialProfile(scrapedData): Creates a new, empty profile structure.

    // Function getGenerationState(uuid) / setGenerationState(uuid, newState):
    //   Gets or sets the AI generation state for a specific match in chrome.storage.
    //   Notifies the popup of any state changes.

    // Function handleAITask(uuid, generationId, payload, port):
    //   Creates an AbortController for the task.
    //   Sets the generation state to "generating".
    //   Calls fetchLocalLlamaResponse to communicate with the AI model.
    //   On success, cleans the response and sets the final generation state.
    //   On failure, sets an error state.
    //   Handles cancellation via the AbortController's signal.

    // onConnect Listener (for connections from popup.js):
    //   Create a messageHandlers object (router).
    //   onMessage Listener for the port:
    //     Get the request's action.
    //     Call the corresponding handler from messageHandlers.
    //   onDisconnect Listener for the port:
    //     Abort all ongoing tasks in the AbortController map to clean up.

    // Message Handler "getNlpAnalysis"(request):
    //   Get scrapedData from the request.
    //   Get or create a match UUID.
    //   Get the match's profile from storage.
    //   Generate a hash of the current conversation to check against a cached hash.
    //   If the hash matches and analysis exists (cache hit), return the stored profile.
    //   If cache miss:
    //     Run the local analysis via runFullConversationAnalysis.
    //     If an external analysis URL is configured, call it, transform the response, and merge it with the local analysis.
    //     Store the new analysis and the new cache hash in the match's profile.
    //     Save the updated profile to storage.
    //     Send the full match profile back to the popup.

    // Message Handler "getGeoCalculations"(request):
    //   Geocode the match's location string using OpenStreetMap API.
    //   Get timezone data for user and match coordinates using timeapi.io.
    //   Calculate distance and time differences.
    //   Cache the results in the match's profile and send them to the popup.

    // Message Handler "getFinalPayload"(request):
    //   Get the match profile from storage.
    //   Combine the profile, analysis, and user's UI instructions into one data object.
    //   Call generatePrompts to create the final system and user messages.
    //   Send the final payload back to the popup.

    // Message Handler "getAIResponse"(request):
    //   Calls handleAITask to start the AI generation process.

    // Message Handler "cancelGeneration"(request):
    //   Finds the AbortController for the given UUID and calls abort().
    //   Sets the generation state to "cancelled".
    ```

### `content-scraper.js`

*   **Natural Language Explanation:** This file contains the "eyes" of the extension. It holds two main functions, one for Tinder and one for Bumble, that are designed to be injected directly into the web page. These functions navigate the site's complex HTML structure to find and extract all relevant data: user and match profiles, the full conversation history, and metadata like message timestamps and read statuses. The file also contains corresponding "paster" functions that programmatically insert the AI-generated text into the message input field on each site.

*   **Pseudo-code:**
    ```
    // Function scrapeTinderPage():
    //   Find the user's name from the "My Profile" link.
    //   Find the match's name and age from the chat header.
    //   Scrape the match's full profile by looping through profile sections.
    //     Use a helper function parseProfileSection to handle different layouts (About Me, Interests, etc.).
    //   Scrape the match's location/distance string.
    //   Initialize an empty conversationHistory array.
    //   Loop through all child nodes of the chat log container:
    //     If the node is a TIME element, update the current date.
    //     If the node is a message DIV:
    //       Determine if it's the user's or match's message based on class names.
    //       Get the message text.
    //       If the new message is from the same person as the last one on the same day, append the text.
    //       Else, push a new message object to the history array.
    //   Return a single object containing all scraped data.
    //   Wrap the entire function in a try/catch block to return an error object on failure.

    // Function pasteTextIntoTinderInput(text):
    //   Find the message textarea element.
    //   Set the element's value to the provided text.
    //   Dispatch a new 'input' event on the element to notify the site's framework.

    // Function scrapeBumblePage():
    //   (Similar logic to scrapeTinderPage, but with different selectors and structure for Bumble's website.)
    //   It scrapes the profile from the right-hand sidebar.
    //   It scrapes the conversation history from the main message list, also using a top-down approach with date dividers.

    // Function pasteTextIntoBumbleInput(text):
    //   (Similar logic to the Tinder paster, but with Bumble's selectors.)
    ```

### `localAnalysisService.js`

*   **Natural Language Explanation:** This is the extension's local "brain," performing NLP analysis without needing an external API. It uses the `compromise.js` library and a large set of custom rules and dictionaries. Its main job is to analyze the conversation to understand its emotional tone, topics, and overall state. It maintains a "memory" for each match, learning which topics they like and dislike, and even tracks inside jokes. It provides the core analysis that powers the dynamic prompt generation.

*   **Pseudo-code:**
    ```
    // Imports: compromise.js library

    // Dictionaries: positiveWords, negativeWords, arousalWords, vulnerableWords, sexualWords, etc.

    // Function runFullConversationAnalysis(history, memory):
    //   Calls updateMemoryFromHistory to update long-term memory.
    //   Calls analyzeLastMessageForSubtext to get short-term context.
    //   Returns both the updated memory and the last message analysis.

    // Function updateMemoryFromHistory(history, memory):
    //   Loop through pairs of user/match messages in the history.
    //   Identify nouns in the user's message as potential topics.
    //   Analyze the match's reply for emotional reaction (valence/arousal).
    //   Update the score for each topic based on the reaction.
    //   If a topic's score becomes very negative, add it to an "avoidedTopics" list.
    //   If the match's reply is very positive laughter, save the user's message as an "inside joke".
    //   Track the overall "Date Arc Phase" (rapport, escalation, planning) based on flirtatious or logistic signals.
    //   Return the updated memory object.

    // Function analyzeLastMessageForSubtext(history):
    //   Get the last message from the match.
    //   If no message, return a default neutral analysis.
    //   Call analyzeMessageSubtext to get core emotional data.
    //   Call helper functions (analyzeQuestion, isLowEffortReply, etc.) to enrich the analysis.
    //   Return the complete analysis object for the last message.

    // Function analyzeMessageSubtext(doc):
    //   Calculate valence and arousal scores by checking for words in the dictionaries.
    //   Identify intents (questioning, planning, etc.) using keyword matching.
    //   Detect nuance (sarcasm, ambiguity, vulnerability) using keyword matching.
    //   Return a structured object with the subtext analysis.

    // Function determineConversationState(history):
    //   Check the number of messages and the time since the last message.
    //   Return a state string: OPENER, EARLY_CONVO, ACTIVE_CONVO, or one of the REENGAGING states.
    ```

### `prompts/*.js` (System, Context, and Task)

*   **Natural Language Explanation:** This suite of files is responsible for the final, critical step of prompt engineering. They work together to assemble the perfect prompt for the AI based on all the data and analysis.
    *   `systemPrompt.js`: Defines the AI's core identity and overall strategy. It dynamically changes its instructions based on the conversation state (e.g., providing a different "Focus" for an opener vs. an active conversation).
    *   `contextPrompt.js`: Provides all the background information. It strategically includes or excludes profiles and history, and adds special "NOTE" headers to draw the AI's attention to critical context, like an unanswered question.
    *   `taskPrompt.js`: Provides the specific, actionable commands for the current turn. It translates the user's UI settings (sliders, toggles) into clear, human-readable instructions and adds high-priority "CRITICAL PROTOCOL" notes based on the analysis.

*   **Pseudo-code (Combined concept):**
    ```
    // --- prompts.js ---
    // Function generatePrompts(data):
    //   Determine if geo-context should be included based on smart heuristics.
    //   Call getSystemPrompt(analysis) to get the system message.
    //   Call buildContextPrompt(data, analysis) to get the context block.
    //   Call buildTaskPrompt(instructions, data, analysis) to get the task block.
    //   Combine context and task blocks into the final user message.
    //   Return { systemMessage, userMessage }.

    // --- systemPrompt.js ---
    // Function getSystemPrompt(analysis):
    //   Start with base persona rules ("You are DateWing...").
    //   Add dynamic guidelines based on analysis (e.g., "BE SUPPORTIVE" if match was vulnerable).
    //   Use a switch on the conversation state:
    //     Append a specific "FOCUS" section (e.g., "FOCUS: THE OPENER").
    //     Append a specific "INFORMATION PRIORITY" section (e.g., "Their Profile is primary").
    //   Return the combined string.

    // --- contextPrompt.js ---
    // Function buildContextPrompt(data, analysis):
    //   If geo-context should be included, format and add it.
    //   If not an opener:
    //     Add a contextual "NOTE" based on the last message analysis (e.g., "NOTE: The match asked a question").
    //     Format and add the conversation history.
    //   Use a switch on the conversation state to add the user/match profiles with strategic labels (e.g., "PRIMARY SOURCE", "SECONDARY CONTEXT").
    //   Return the combined string.

    // --- taskPrompt.js ---
    // Function buildTaskPrompt(instructions, data, analysis):
    //   If "Strict Goal Override" is on, return a simplified prompt with only the user's goal.
    //   Format and add a "MEMORY & STRATEGY" section (inside jokes, good topics).
    //   Create a list of "CRITICAL PROTOCOL" notes based on the analysis (e.g., "NO GREETING", "ANSWER THE QUESTION").
    //   Create the "YOUR TASK & DIRECTIVES" section by converting UI settings into text descriptions (e.g., Flirty Value 80 -> "Be very flirty and confident.").
    //   Add a final command telling the AI to write the message.
    //   Return the combined string.
    ```

## 6. Data Flow and Message Passing

The extension's components communicate through a well-defined message-passing system.

1.  **Popup -> Content Script (Scraping)**
    *   **Mechanism**: `chrome.scripting.executeScript()`
    *   **Flow**:
        1.  `popup.js` determines the correct scraper function to use based on the tab's URL.
        2.  It calls `chrome.scripting.executeScript`, passing the target tab ID and the function to execute (e.g., `scrapeBumblePage`).
        3.  Chrome executes this function in an isolated world on the web page.
        4.  The scraper function returns a single data object (or an error object).
        5.  This return value is passed back to the callback function in `popup.js`.

2.  **Popup <-> Background (Core Logic)**
    *   **Mechanism**: A long-lived port connection (`chrome.runtime.connect`).
    *   **Flow**:
        1.  `popup.js` establishes the connection when it initializes. `background.js` listens for this connection.
        2.  **Popup to Background**: `popup.js` uses `port.postMessage()` to send a request object. This object always has an `action` key (e.g., `"getNlpAnalysis"`) and a `data` payload.
        3.  **Background Processing**: `background.js` receives the message in its `port.onMessage` listener. A handler function corresponding to the `action` is invoked. This handler can perform async operations like API calls or heavy computation.
        4.  **Background to Popup**: Once the task is complete, `background.js` uses its own `port.postMessage()` to send a response back. The response object also has an `action` key (e.g., `"nlpAnalysisResponse"`) so the popup knows how to handle it. For long-running tasks like AI generation, the background script can send multiple updates (e.g., `action: "generationUpdate"`) over the same port.

3.  **Background -> External APIs**
    *   **Mechanism**: `fetch()` API.
    *   **Flow**:
        1.  `background.js` receives a request from the popup that requires external data (e.g., `getGeoCalculations` or `getAIResponse`).
        2.  It constructs the appropriate URL and request parameters.
        3.  It calls `fetch()` to make the HTTP request.
        4.  It processes the response (e.g., parsing JSON) and uses the data to fulfill the original request from the popup.
        5.  All `fetch` calls are wrapped in an `AbortController` so they can be cancelled if the popup is closed.

## 7. UI/UX Description

*   **Overall Layout**: The UI is presented in a fixed-width popup window with a dark theme. The layout is organized into "views" (Loading, Main, Settings, Error), with only one view being visible at a time. The main view uses a card-based design to group related controls.

*   **Styling and Appearance**:
    *   **Theme**: Dark mode. The primary background is a very dark grey (`#1a1a1a`), with slightly lighter cards (`#242424`) and a bright, amber-yellow (`#ffc107`) as the accent color for buttons, sliders, and highlights.
    *   **Typography**: A clean, sans-serif font (`Segoe UI` or system default) is used for all text.
    *   **Controls**: All controls (buttons, sliders, toggles) are custom-styled to match the dark theme. Toggles are styled as switches, and sliders have a custom track and thumb.

*   **UI Components and Behaviors**:
    *   **Header**: Contains the extension title and two icon buttons: "Reset Match" (to clear settings for the current match) and "Settings" (to navigate to the settings view).
    *   **Response Area**: A large, editable text area where the AI-generated response appears. It shows a subtle blinking cursor animation while the AI is "thinking."
    *   **Refinement Buttons**: A row of small buttons ("Make it Funnier," "Shorter," etc.) that appear below the response area, allowing the user to request modifications.
    *   **Generate Actions**: The main action bar containing the primary "Generate" button, a "Copy" button, and a "Cancel" button that only appears during generation. A digital timer (`00:00`) is also present here, showing the duration of the AI request.
    *   **Tuning Tabs**: A tabbed interface allows the user to switch between different sets of controls.
        *   **Tune Response**: This is the main tab, containing sliders to control "Linguistic Style," "Flirt Level," "Length," "Creativity," etc. Each slider has a dynamic label that updates to a human-readable value (e.g., "Medium," "Flirty").
        *   **Analysis Tabs**: Several other tabs (`Analysis`, `Topic Analysis`) are present to display the detailed results from the conversation analysis service, primarily for debugging and advanced use.
    *   **Settings View**: A separate screen with controls for global configuration, such as setting the AI API URL, API key, and providing a default "My Profile" for the AI to use.
    *   **State Changes**: The UI provides clear feedback. When the user clicks "Generate," the button becomes disabled and says "Thinking...", the Cancel button appears, and the timer starts. If an error occurs, the entire main view is replaced with a clear error message.

## 8. User Workflows

*   **Standard Workflow: Generating a Message**
    1.  User is on a Tinder or Bumble conversation page.
    2.  User clicks the extension icon in the toolbar (or uses the keyboard shortcut).
    3.  The popup appears, showing a "Reading page..." loading screen for 1-2 seconds.
    4.  The main view appears, populated with the analysis of the conversation. The "Conversation Status" might display "Active Convo."
    5.  User adjusts the "Flirt Level" and "Length" sliders to their preference.
    6.  User clicks the "Generate" button.
    7.  The UI enters the "generating" state: the button shows "Thinking...", the response area shows a loading animation, and the timer starts counting up.
    8.  After a few seconds, the generated message appears in the response area. The text is automatically copied to the clipboard, and a "Copied!" notification appears briefly.
    9.  The text is also automatically pasted into the dating site's message input field.

*   **Refinement Workflow**
    1.  After a message has been generated, the user decides it's not quite right.
    2.  The user clicks the "Make it Funnier" button.
    3.  The UI re-enters the "generating" state.
    4.  A new, modified version of the message appears in the response area.

*   **Debug Workflow**
    1.  User checks the "Debug" checkbox next to the "Generate" button.
    2.  User clicks "Generate."
    3.  Instead of an immediate AI call, a full-screen modal appears, titled "Debug & Override Mode."
    4.  The modal shows the user and match profiles, the full conversation history, and the raw analysis data, all of which are editable.
    5.  User clicks "Next."
    6.  The modal now shows the final, constructed System and User prompts that will be sent to the AI. These are also editable.
    7.  User clicks "Send to AI."
    8.  The modal closes, and the normal generation process begins using the (potentially modified) data.

## 9. Installation and Usage Instructions

1.  **Download the Code**: Obtain the extension's source code and place it in a directory on your local machine.
2.  **Open Chrome Extensions**: In Google Chrome, navigate to `chrome://extensions`.
3.  **Enable Developer Mode**: In the top-right corner of the Extensions page, toggle on "Developer mode."
4.  **Load the Extension**:
    *   Click the "Load unpacked" button that appears on the top-left.
    *   In the file dialog, select the directory containing the extension's source code (the one with `manifest.json` in it).
5.  **Pin the Extension**: The "AI Assistant" icon should appear in your Chrome toolbar. It's recommended to click the puzzle piece icon and "pin" the extension to keep it visible.
6.  **Usage**:
    *   Navigate to a conversation page on `tinder.com` or `bumble.com`.
    *   Click the "AI Assistant" icon in your toolbar to open the popup.
    *   The extension will automatically scrape the page and prepare for generation.
    *   Adjust the controls as needed and click "Generate."
