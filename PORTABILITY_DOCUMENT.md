# Portability Document: AI Assistant Extension (v3.0 FINAL)

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

*   **Manifest V3 and the Stateful Service Worker**: The extension is built on Manifest V3, where service workers are non-persistent. To create a seamless user experience, a "stateful" architecture was chosen. All critical information—such as the state of an ongoing AI generation, the full analysis for a match, and user settings—is saved to `chrome.storage.local` immediately after being created or changed. This ensures that even if the service worker is terminated and restarted, the extension can resume its state exactly where it left off.

*   **Persistent Port Communication**: For the frequent and bidirectional communication required between the popup UI and the background service worker, a long-lived port connection (`chrome.runtime.connect`) is used. This is more efficient than single messages and allows the background script to proactively push updates to the UI (e.g., streaming a response). The connection's `onDisconnect` event is also critical for resource management, as it triggers the cancellation of any ongoing `fetch` requests.

*   **Modular, State-Driven Prompt Engineering**: The prompt sent to the AI is not a single static string. It is dynamically constructed by a modular system (`systemPrompt.js`, `contextPrompt.js`, `taskPrompt.js`). This allows for highly nuanced and context-aware AI instructions. By changing the AI's core rules, context, and immediate task based on the real-time `conversationState`, the extension can guide the AI to produce far more relevant and effective messages.

*   **Pluggable Analysis Service**: The extension features a dual-analysis architecture. It includes a robust `localAnalysisService.js` that can perform detailed conversation analysis offline. However, it is also designed to call an external, more powerful analysis service if the user provides a URL. `background.js` is built to merge the results from both, creating a flexible and powerful system.

*   **Free-Tier API Dependencies**: For external services like geocoding and time zone lookups, public and free-to-use APIs (`nominatim.openstreetmap.org` and `timeapi.io`) were chosen to ensure core features remain functional for all users without requiring paid API keys.

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

## 5. File-by-File Breakdown
(This section remains the same as v2.1)

## 6. UI/UX Description (Final, Detailed Version)

The user interface and experience are designed to feel powerful yet intuitive, giving the user a sense of being a "mission controller" for their AI co-pilot.

*   **UI Layout and Visual Flow**: The UI is a single-page application within a fixed-width popup. The layout is vertical, guiding the user's eye from top to bottom. It begins with the output (`#response-area`), moves to the primary action (`#generate-btn`), then to secondary inputs (`#custom-instruction` and toggles), and finally to the fine-tuning controls in the tabbed section. This hierarchy places the most important elements in the most accessible locations. The use of `card` containers visually groups related controls, creating a clean, organized, and uncluttered workspace.

*   **Theme & Styling**: A modern dark theme with a dark grey background (`#1a1a1a`), slightly lighter cards (`#242424`), and a bright amber-yellow accent (`#ffc107`). The aesthetic is functional and tech-oriented, prioritizing clarity and reducing eye strain.

*   **Views**: The UI is composed of four distinct views:
    *   `#loading-view`: A simple view with a spinner and "Reading page..." text.
    *   `#error-view`: Displays an error title and message.
    *   `#main-view`: The primary user interface.
    *   `#settings-view`: A separate screen for global configuration.

### Main View Element Breakdown

*   **Header (`.app-header`)**:
    *   `#reset-match-btn`: **Reset Icon.** Clears settings for the current match.
    *   `#settings-btn`: **Gear Icon.** Switches the display to the `#settings-view`.

*   **Response Area (`#response-area`)**:
    *   **Purpose**: An editable `div` where the final AI-generated message is displayed.
    *   **States**: `loading` class adds a blinking ellipsis; `error` class turns text red.

*   **Refinement Actions (`#refinement-actions`)**:
    *   **Purpose**: A container for `.btn-refine` buttons ("Make it Funnier", etc.) that appear after a message is generated.
    *   **Action**: Sends a "refineAIResponse" message to `background.js`.

*   **Custom Instructions (`#custom-instruction`)**: A `textarea` for the user to type a specific goal for the AI.

*   **Quick Toggles (`.quick-toggles`)**: Custom-styled switches for boolean operations.
    *   `#question-toggle-checkbox`: "End w/ Question"
    *   `#geo-context-toggle`: "Use Geo-context"
    *   `#new-topic-toggle`: "Start Fresh"
    *   `#strict-goal-toggle`: "Strict Goal"

*   **Generate Actions (`.generate-actions`)**:
    *   `#generate-btn`: The primary, amber-colored button. Triggers `handleGenerateClick`. Its text and state change to "Thinking..." or "Refreshing..." when disabled.
    *   `#copy-btn`: **Copy Icon.** Copies the response text.
    *   `#cancel-btn`: **Circle-X Icon.** Becomes visible during generation to send a "cancelGeneration" message.

*   **Tuning Tabs (`.tabs` & `.tab-content`)**:
    *   **`#tune-response` Tab**: Contains dropdowns (`#linguistic-style-select`) and sliders (`#flirty-slider`, etc.) for fine-tuning AI parameters. Slider labels update in real-time.
    *   **Other Tabs (`#analysis`, etc.)**: Display formatted debug information.

### Settings View Element Breakdown

*   **Header (`.settings-header`)**:
    *   `#back-btn`: **Back Arrow Icon.** Returns the user to the `#main-view`.
*   **Connection Details Card**:
    *   `#localLlamaUrl`, `#localModelName`, `#localLlamaApiKey`: Text inputs for power users to connect their own local AI model.
    *   `#test-api-btn`: A "Test" button next to the URL to verify the connection. The button provides feedback by changing the input field's border to green (success) or red (failure).
*   **Analysis Service Card**:
    *   `#analysisUrl`, `#test-analysis-btn`: An input and test button for an optional, external analysis service.
    *   `#analysisType`: A dropdown to select the analysis level (Local, Simple, Enhanced).
*   **Global Defaults Card**:
    *   `#user-location-select`: A dropdown to set a default location for geo-calculations.
    *   `#my-profile-setting`: A large `textarea` for the user to describe themselves, providing the AI with essential context.
    *   `#master-reset-btn`: A button to reset all global settings to their defaults.

### Debug Modal Breakdown

*   **Overlay (`#debug-modal-overlay`)**: A semi-transparent black overlay that covers the popup, focusing attention on the modal.
*   **Modal (`.modal`)**: A card that appears in the center of the overlay.
*   **Multi-Step Navigation**: The modal has "Back" and "Next" buttons to navigate between two views: "Context" and "Final Payload".
*   **Context View**: Displays all the data fed into the prompt-building process (profiles, history, analysis). All fields are presented in editable inputs, textareas, and selects, allowing the user to override any piece of data before generation.
*   **Final Payload View**: Shows the final, constructed System and User prompts that will be sent to the AI. These are also in editable textareas for last-minute changes.
*   **Final Action**: The "Next" button becomes a "Send to AI" button on the final step, which closes the modal and initiates the AI request with the potentially modified data.

## 7. User Workflows (Enhanced UX Focus)

*   **Standard Workflow: The Creative Co-pilot**
    1.  **Intent**: The user wants help breaking the ice or continuing a conversation.
    2.  **Experience**: Upon opening the extension, the user feels a sense of control as the UI quickly loads and presents a clear set of tools. They are not just getting a random suggestion; they are actively directing the AI. Adjusting the "Flirt Level" and "Length" sliders feels tactile and responsive, as the descriptive labels update instantly. Clicking "Generate" provides immediate visual feedback—the UI dims, the timer starts—creating a sense of anticipation. The final message appearing in both the popup and the website's text box feels seamless and magical, like having a co-pilot.

*   **Refinement Workflow: The Iterative Sculptor**
    1.  **Intent**: The first AI suggestion is good but not perfect. The user wants to tweak it.
    2.  **Experience**: Instead of having to start over, the user feels empowered by the refinement buttons. This workflow is quick and iterative. The user feels like they are sculpting the perfect message with the AI's help, rather than just accepting a take-it-or-leave-it suggestion. It turns a simple generation into a creative partnership.

*   **Debug Workflow: The Power User's Deep Dive**
    1.  **Intent**: The user is technically savvy and wants to understand exactly what the AI is being told, or wants to force a very specific, nuanced output that the main UI controls don't allow for.
    2.  **Experience**: Enabling debug mode transforms the user from a pilot to an engineer. The modal provides a "peek under the hood," creating a feeling of transparency and ultimate control. The user can see the raw data the AI is using and can directly edit the final prompts. This workflow provides a powerful escape hatch for advanced users, ensuring they are never limited by the simplified main interface.

## 8. Installation and Usage Instructions

1.  **Download the Code**: Obtain the extension's source code and place it in a directory on your local machine.
2.  **Open Chrome Extensions**: In Google Chrome, navigate to `chrome://extensions`.
3.  **Enable Developer Mode**: In the top-right corner of the Extensions page, toggle on "Developer mode."
4.  **Load the Extension**: Click the "Load unpacked" button, and in the file dialog, select the directory containing `manifest.json`.
5.  **Pin the Extension**: Click the puzzle piece icon in the toolbar and "pin" the AI Assistant to keep it visible.
6.  **Usage**: Navigate to a conversation on `tinder.com` or `bumble.com`. Click the pinned icon to open the popup. The extension will automatically analyze the page. Adjust the controls and click "Generate."
