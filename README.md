# Simple LLM - VS Code Extension

Simple LLM is a powerful VS Code extension that integrates Large Language Models (LLMs) directly into your development environment. It provides an intuitive interface for interacting with AI models, enhancing your coding experience with intelligent assistance.

## Features

- **AI-Powered Chat Interface**: Engage in conversations with LLMs directly within VS Code.
- **Code Context Integration**: Easily include selected code snippets in your AI conversations for more relevant assistance.
- **Multiple LLM Support**: Configure and use various LLM models based on your preferences and needs.
- **Conversation Management**: Save, load, and manage multiple conversations for different projects or topics.
- **Syntax Highlighting**: Markdown and code snippets in AI responses are beautifully rendered with syntax highlighting.

## How It Works

1. The extension adds a new view to VS Code's sidebar, providing a chat interface.
2. Users can select code in their editor and send it to the chat for context.
3. The extension communicates with configured LLM APIs (Openai Compatible) to generate responses.
4. Responses are streamed back to the chat interface in real-time.
5. Conversations can be saved and loaded for future reference.

## How to Use

1. Install the Simple LLM extension from the VS Code marketplace.
2. Open the Simple LLM view in the sidebar (look for the LLM icon).
3. Configure your preferred LLM model and API key in the settings.
4. Start a new conversation by typing in the chat input or selecting code and using the "Ask LLM" command.
5. Interact with the AI, ask questions, or request code explanations and suggestions.

## Configuration

To configure the extension:

1. Open VS Code settings (File > Preferences > Settings).
2. Search for the setting button in the sidebar and configure your models:`name`, `apiUrl`, `apiToken`, `modelName`, `systemPrompt`, `temperature  `

## Requirements

- Visual Studio Code version 1.92.0 or higher.
- An openai compatible API
- Valid API key(s) for your chosen LLM service(s).

## Release Notes

### 1.0.0

- Initial release of Simple LLM
- Support for multiple LLM models
- Code context integration
- Conversation management features

---

## Feedback and Contributions

We welcome your feedback and contributions! Please report any issues or suggest features on our [GitHub repository](https://github.com/ncls-p/simple-llm-vscode).

**Enjoy coding with AI assistance!**
