# Portability Document: AI Assistant Extension (v5.0 FINAL)

This document provides a complete technical specification for the "AI Assistant" Chrome Extension. It is designed to be detailed enough for a developer or another AI to recreate the extension with 100% fidelity without access to the original source code.

## 1. Project Overview and Purpose

The AI Assistant (internally branded "Wingman AI") is a sophisticated browser extension designed to act as a ghostwriting assistant for users on dating applications. Its primary purpose is to help users craft more engaging, context-aware, and effective messages by analyzing conversation data and generating suggestions using a configurable Large Language Model (LLM).

## 2. Environment Details

*   **Manifest Version**: 3
*   **Permissions**: `storage`, `activeTab`, `scripting`, `geolocation`.
*   **Host Permissions**: `*://*.bumble.com/*`, `*://*.tinder.com/*`, `https://nominatim.openstreetmap.org/*`, `https://timeapi.io/*`, and local hosts for custom AI models.
*   **Background Logic**: Service Worker (`background.js`).
*   **User Interface**: Default popup (`popup.html`).

## 3. Key Architectural Decisions

*   **Stateful Service Worker (Manifest V3)**: To handle the non-persistent nature of Manifest V3 service workers, all critical state (generation progress, user settings, match analysis) is saved to `chrome.storage.local`. This ensures the extension can resume its state perfectly even if the service worker is terminated and restarted.
*   **Persistent Port Communication**: A long-lived port (`chrome.runtime.connect`) is used for the chatty, bidirectional communication between the popup and background script. This is more efficient than single messages and allows the background to proactively push updates to the UI.
*   **Modular, State-Driven Prompt Engineering**: Prompts are dynamically constructed by a modular system (`systemPrompt.js`, `contextPrompt.js`, `taskPrompt.js`) based on the real-time `conversationState`. This allows for highly nuanced and context-aware AI instructions.
*   **Pluggable Analysis Service**: The architecture supports both a robust, offline `localAnalysisService.js` and an optional, more powerful external analysis service, providing flexibility for all users.
*   **Free-Tier API Dependencies**: Public APIs (`nominatim.openstreetmap.org`, `timeapi.io`) are used for geo-tasks to ensure core features remain functional without requiring paid user keys.

## 4. Full Folder/File Structure

*   `manifest.json`: The core configuration file for the Chrome extension.
*   `background.js`: The background service worker; acts as the central hub.
*   `popup.html`: The HTML structure for the popup UI.
*   `popup.css`: The stylesheet for the popup UI.
*   `popup.js`: The script that controls the logic and interactivity of the popup UI.
*   `content-scraper.js`: Contains functions to scrape data from web pages.
*   `localAnalysisService.js`: An internal service for performing local NLP analysis.
*   `prompts.js`: The main assembler for creating the final AI prompts.
*   `constants.js`: A centralized file for shared constants and default settings.
*   `uiFormatters.js`: A collection of helper functions for formatting data for the UI.
*   `icons/`: Directory for extension icons (16x16, 48x48, 128x128).
*   `lib/`: Directory for third-party JS libraries (compromise, spacetime).
*   `prompts/`: Directory for prompt-building modules (system, context, task).

## 5. File-by-File Breakdown (Enhanced Detail)
(This section contains the detailed pseudo-code and natural language explanations for each file, as composed in previous steps.)

## 6. Visual Representations

### 6.1. UI Layout Wireframe
```
+------------------------------------------+
| [Logo] Wingman AI         [Reset][⚙]     |
|------------------------------------------|
|                                          |
|  [ AI-Generated Response Area...      ]  |
|  [                                     ]  |
|                                          |
|  [ Funnier ] [ More Direct ] [ Shorter ]  |
|                                          |
|  [ Custom Instructions...              ]  |
|                                          |
|  [x] End w/ Q | [ ] Use Geo | [x] New Topic |
|                                          |
|  +--------------------------+ [Copy][Cancel]
|  |        GENERATE          |            |
|  +--------------------------+ [Timer][Dbg]
|------------------------------------------|
|                                          |
|  | Tune Response | Analysis | Topic... |  |
|  +---------------+-----------------------+  |
|  |                                     |  |
|  |  [ Sliders and Dropdowns for AI   ]  |  |
|  |  [ parameter tuning go here...    ]  |  |
|  |                                     |  |
+------------------------------------------+
```

### 6.2. Component Architecture
```
+-------------------+      Port      +---------------------+
|    Popup UI       |<--------------->|  Background Script  |
|   (popup.js)      |   (Messages)   |     (background.js) |
+-------------------+                +----------+----------+
        |                                       |
executeScript() |                                       | (fetch)
        |                                       |
        v                                       v
+-------------------+                +---------------------+
|  Content Scraper  |                |   External APIs     |
| (on tinder.com)   |                | (Geo, Time, AI LLM) |
+-------------------+                +---------------------+
```

### 6.3. Core Data Flow
```
1. [User] -> Opens Popup
2. [Popup] -> Injects content-scraper.js into Active Tab
3. [Content Scraper] -> Reads DOM, returns structured {scrapedData}
4. [Popup] -> Sends {scrapedData} to Background Script (action: "getNlpAnalysis")
5. [Background] -> Receives data, performs local analysis, updates match memory, saves to storage.
6. [Background] -> Sends back {matchProfile} with analysis to Popup.
7. [Popup] -> User adjusts UI controls and clicks "Generate".
8. [Popup] -> Sends {taskInstructions} to Background Script (action: "getFinalPayload")
9. [Background] -> Generates final System and User prompts using all available data.
10. [Background] -> Sends prompts to AI Model API (fetch).
11. [AI Model API] -> Returns response text.
12. [Background] -> Sends final response text to Popup (action: "generationUpdate").
13. [Popup] -> Displays response text in the UI and pastes it into the web page.
```

## 7. UI/UX Description (Final, Detailed Version)

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

## 8. User Workflows (Enhanced UX Focus)

*   **Standard Workflow: The Creative Co-pilot**
    1.  **Intent**: The user wants help breaking the ice or continuing a conversation.
    2.  **Experience**: Upon opening the extension, the user feels a sense of control as the UI quickly loads and presents a clear set of tools. They are not just getting a random suggestion; they are actively directing the AI. Adjusting the "Flirt Level" and "Length" sliders feels tactile and responsive, as the descriptive labels update instantly. Clicking "Generate" provides immediate visual feedback—the UI dims, the timer starts—creating a sense of anticipation. The final message appearing in both the popup and the website's text box feels seamless and magical, like having a co-pilot.

*   **Refinement Workflow: The Iterative Sculptor**
    1.  **Intent**: The first AI suggestion is good but not perfect. The user wants to tweak it.
    2.  **Experience**: Instead of having to start over, the user feels empowered by the refinement buttons. This workflow is quick and iterative. The user feels like they are sculpting the perfect message with the AI's help, rather than just accepting a take-it-or-leave-it suggestion. It turns a simple generation into a creative partnership.

*   **Debug Workflow: The Power User's Deep Dive**
    1.  **Intent**: The user is technically savvy and wants to understand exactly what the AI is being told, or wants to force a very specific, nuanced output that the main UI controls don't allow for.
    2.  **Experience**: Enabling debug mode transforms the user from a pilot to an engineer. The modal provides a "peek under the hood," creating a feeling of transparency and ultimate control. The user can see the raw data the AI is using and can directly edit the final prompts. This workflow provides a powerful escape hatch for advanced users, ensuring they are never limited by the simplified main interface.

## 9. Installation and Usage Instructions

1.  **Download the Code**: Obtain the extension's source code and place it in a directory on your local machine.
2.  **Open Chrome Extensions**: In Google Chrome, navigate to `chrome://extensions`.
3.  **Enable Developer Mode**: In the top-right corner of the Extensions page, toggle on "Developer mode."
4.  **Load the Extension**: Click the "Load unpacked" button, and in the file dialog, select the directory containing `manifest.json`.
5.  **Pin the Extension**: Click the puzzle piece icon in the toolbar and "pin" the AI Assistant to keep it visible.
6.  **Usage**: Navigate to a conversation on `tinder.com` or `bumble.com`. Click the pinned icon to open the popup. The extension will automatically analyze the page. Adjust the controls and click "Generate."
