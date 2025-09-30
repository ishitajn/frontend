# Changelog

All notable changes to this project will be documented in this file.

## [1.0.0] - 2025-09-30

This release marks the first stable, refactored version of the Bumble Wingman AI extension. The codebase has undergone a significant architectural overhaul to improve modularity, maintainability, and stability.

### Added
- **Modular Frontend Architecture:** The main `popup.js` script was completely refactored into a modular architecture with distinct modules for API communication, state management, UI updates, event handling, and settings.
- **Modular Backend Logic:** The `background.js` service worker was refactored to break down large functions into smaller, single-responsibility helpers, improving readability and maintainability.
- **Structured Error Handling:** A custom `WingmanError` class was introduced in `background.js` for more robust and informative error handling between the backend and frontend.
- **Customizable Chat Templates:** Added settings to allow users to define custom templates for the system prompt, chat messages, and assistant prompt, enabling support for various LLM formats.
- **Enhanced System Prompt:** The system prompt template was enhanced to support a wide range of dynamic variables from the conversation analysis, allowing for powerful, fine-grained customization.
- **Debug & Override Mode:** A hidden debug modal was integrated to allow developers to inspect and override the data payload sent to the AI, which is critical for testing and prompt engineering.
- **UI/UX Improvements:**
    - An "Advanced Settings" toggle was added to simplify the main UI.
    - Visual feedback for button clicks was implemented.
    - Visual indicators for match-specific setting overrides were improved.
    - Accessibility was improved with the addition of ARIA labels.
    - The API key input was changed to a password field for better security.

### Fixed
- **Critical `TypeError` in Prompt Generation:** Resolved a recurring `TypeError` caused by an undefined `state` variable by applying defensive checks to all points of failure.
- **Broken UI After Refactoring:** Fixed critical bugs related to the frontend refactoring where the main `popup.js` was not correctly orchestrating the new modules.
- **Incorrect Module Import Paths:** Corrected several broken JavaScript module import paths that were causing runtime errors.
- **Incomplete Data Payload for Debug Modal:** Fixed a bug where the debug modal would render incorrectly due to a non-robust data construction method.
- **Timer Persistence:** Corrected an issue where the response timer would reset immediately instead of displaying the final generation time.

### Removed
- **Redundant/Obsolete Files:** Deleted several unused and duplicate files, including `prompts - Copy/`, `debug-modal.js`, `ui-components.js`, and their associated tests, to clean up the codebase. *(Note: `debug-modal.js` and `ui-components.js` were later restored after their on-demand loading mechanism was correctly identified).*