# Bumble Wingman AI Chrome Extension

## Overview

Bumble Wingman AI is a Chrome extension designed to assist users on dating apps like Bumble and Tinder by providing AI-powered message suggestions. It analyzes conversation context, user profiles, and user-defined goals to generate tailored, engaging responses.

The extension runs locally in the browser and communicates with a local or remote Large Language Model (LLM) to generate responses. It features a highly modular architecture and a rich set of configurable options for advanced users.

## Key Features

- **AI-Powered Suggestions:** Generates message suggestions based on conversation history, profiles, and strategic goals.
- **Context-Aware Analysis:** Performs local analysis of conversation state, subtext, and user intent to inform the AI.
- **Customizable Prompts:** Allows users to define custom templates for system prompts, chat messages, and assistant prompts to support various LLM formats.
- **Rich Configuration:** Provides a detailed settings panel to configure LLM endpoints, API keys, user profiles, and prompt strategies.
- **Dynamic UI:** A modern, responsive UI that provides real-time feedback during AI generation.
- **Debug & Override Mode:** An advanced debug view that allows developers to inspect the data payload sent to the AI and override it for testing and fine-tuning.
- **Multi-Platform Support:** Works with both Bumble.com and Tinder.com.

## Installation and Setup

This extension has no external dependencies or build steps required.

To install and run the extension in developer mode, follow these steps:

1.  Clone or download the repository to your local machine.
2.  Open Google Chrome and navigate to `chrome://extensions`.
3.  Enable the **"Developer mode"** toggle in the top-right corner.
4.  Click the **"Load unpacked"** button that appears.
5.  Select the root directory of this project.

The extension should now be installed and visible in your Chrome toolbar.

## Testing

The extension includes a small suite of automated tests for core utility functions.

To run the tests, you need to have Node.js installed. From the root directory of the project, run the following command in your terminal:

```bash
node tests/test-background.js
```

All tests should pass, confirming that the core helper functions are working as expected.

## Configuration

The extension's functionality is configured through its popup UI.

1.  **Open the Popup:** Navigate to a supported dating site (e.g., a conversation on Bumble.com) and click the extension's icon in your Chrome toolbar.
2.  **Access Settings:** Click the gear icon in the top-right corner of the popup to open the settings panel.
3.  **Configure Endpoints:**
    - **LLM URL:** Set the URL for your local or remote LLM's chat completions endpoint (e.g., `http://localhost:8080/v1/chat/completions`).
    - **Model Name:** Specify the model to be used (e.g., `llama3:latest`).
    - **API Key (Optional):** If your LLM requires an API key, enter it here.
4.  **Set Global Defaults:** Configure your personal profile, default prompt templates, and other preferences that will apply to all conversations.