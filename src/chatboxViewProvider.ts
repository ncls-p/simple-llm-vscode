import * as vscode from "vscode";
import axios from "axios";
import * as fs from "fs";
import * as path from "path";

interface LLMModel {
  name: string;
  apiUrl: string;
  apiToken: string;
  modelName: string;
  systemPrompt: string;
  temperature: number;
}

interface Conversation {
  id: string;
  messages: Array<{ role: string; content: string }>;
  model: string;
}

interface CodeSuggestion {
  text: string;
  range: vscode.Range;
}

export class ChatboxViewProvider implements vscode.WebviewViewProvider {
  private _view?: vscode.WebviewView;
  private readonly _settingsPath: string;
  private readonly _conversationsPath: string;

  constructor(
    private readonly _extensionUri: vscode.Uri,
    context: vscode.ExtensionContext
  ) {
    this._settingsPath = path.join(
      context.globalStorageUri.fsPath,
      "llm-settings.json"
    );
    this._conversationsPath = path.join(
      context.globalStorageUri.fsPath,
      "conversations.json"
    );
    this._ensureSettingsFile();
    this._ensureConversationsFile();
  }

  public resolveWebviewView(
    webviewView: vscode.WebviewView,
    _context: vscode.WebviewViewResolveContext,
    _token: vscode.CancellationToken
  ): void {
    this._view = webviewView;

    webviewView.webview.options = {
      enableScripts: true,
      localResourceRoots: [this._extensionUri],
    };

    webviewView.webview.html = this._getHtmlForWebview(webviewView.webview);

    webviewView.webview.onDidReceiveMessage(this._handleMessage.bind(this));
  }

  public addSelectedCode(
    code: string,
    fileName: string,
    startLine?: number,
    endLine?: number
  ): void {
    this._view?.webview.postMessage({
      type: "addSelectedCode",
      code,
      fileName,
      startLine: startLine ?? null,
      endLine: endLine ?? null,
      id: Date.now(),
    });
  }

  public sendMessageToLLM(message: string, context: string): void {
    this._view?.webview.postMessage({
      type: "sendMessage",
      message,
      context,
      model: this._getSettings().models[0].name,
      conversationId: null,
    });
  }

  private async _handleMessage(message: any): Promise<void> {
    switch (message.type) {
      case "sendMessage":
        await this._sendMessageToLLM(
          message.message,
          message.context,
          message.model,
          message.conversationId
        );
        break;
      case "getLLMs":
        this._sendLLMsToWebview();
        break;
      case "openSettings":
        vscode.commands.executeCommand("llmChatbox.openSettings");
        break;
      case "getConversations":
        this._sendConversationsToWebview();
        break;
      case "deleteConversation":
        this._deleteConversation(message.conversationId);
        break;
      case "loadConversation":
        this._loadConversation(message.conversationId);
        break;
      case "fixUsingSimpleLLM":
        this._fixUsingSimpleLLM(message.errorMessage);
        break;
    }
  }

  private _ensureSettingsFile(): void {
    if (!fs.existsSync(this._settingsPath)) {
      const defaultSettings = {
        models: [
          {
            name: "Default Model",
            apiUrl: "https://api.openai.com/v1/chat/completions",
            apiToken: "YOUR_API_TOKEN",
            modelName: "gpt-3.5-turbo",
            systemPrompt: "You are a helpful assistant.",
            temperature: 0.7,
          },
        ],
      };
      fs.mkdirSync(path.dirname(this._settingsPath), { recursive: true });
      fs.writeFileSync(
        this._settingsPath,
        JSON.stringify(defaultSettings, null, 2)
      );
    }
  }

  private _ensureConversationsFile(): void {
    if (!fs.existsSync(this._conversationsPath)) {
      fs.writeFileSync(this._conversationsPath, JSON.stringify([], null, 2));
    }
  }

  private async _fixUsingSimpleLLM(errorMessage: string): Promise<void> {
    const editor = vscode.window.activeTextEditor;
    if (editor) {
      const document = editor.document;
      const fullText = document.getText();
      const fileName = document.fileName;

      this.addSelectedCode(fullText, fileName);

      await this._sendMessageToLLM(
        errorMessage,
        fullText,
        this._getSettings().models[0].name,
        null
      );
    }
  }

  private _getSettings(): { models: LLMModel[] } {
    try {
      const settingsContent = fs.readFileSync(this._settingsPath, "utf8");
      return JSON.parse(settingsContent);
    } catch (error) {
      console.error("Error reading settings file:", error);
      return { models: [] };
    }
  }

  private _sendLLMsToWebview(): void {
    const settings = this._getSettings();
    this._view?.webview.postMessage({
      type: "updateLLMs",
      llms: settings.models,
    });
  }

  private async _sendMessageToLLM(
    message: string,
    context: string,
    modelName: string,
    conversationId: string | null
  ): Promise<void> {
    const settings = this._getSettings();
    const model = settings.models.find((m) => m.name === modelName);

    if (!model) {
      vscode.window.showErrorMessage(
        "Selected LLM model not found in configuration."
      );
      return;
    }

    const conversations = this._getConversations();
    const conversationStrings = conversations.map((c) => JSON.stringify(c));
    vscode.window.showInformationMessage(conversationStrings.join(", "));

    let conversation;
    if (conversationId) {
      conversation = conversations.find((c) => c.id === conversationId);
      if (!conversation) {
        conversation = { id: conversationId, messages: [], model: modelName };
      }
    } else {
      conversation = {
        id: Date.now().toString(),
        messages: [],
        model: modelName,
      };
    }

    vscode.window.showInformationMessage(
      "Conversation ID: " + JSON.stringify(conversation)
    );

    const newMessage = { role: "user", content: message };
    conversation.messages.push(newMessage);

    vscode.window.showInformationMessage(
      "Conversation messages: " + JSON.stringify(conversation.messages)
    );

    try {
      const response = await axios.post(
        model.apiUrl,
        {
          model: model.modelName,
          messages: [
            { role: "system", content: model.systemPrompt },
            ...conversation.messages.map((msg) => ({
              role: msg.role,
              content:
                msg.role === "user"
                  ? `Context:\n${context}\n\nQuestion: ${msg.content}`
                  : msg.content,
            })),
          ],
          temperature: model.temperature,
          stream: true,
        },
        {
          headers: {
            Authorization: `Bearer ${model.apiToken}`,
            "Content-Type": "application/json",
          },
          responseType: "stream",
        }
      );

      this._view?.webview.postMessage({
        type: "addMessage",
        sender: "User",
        content: message,
      });

      let buffer = "";
      let llmResponse = "";

      response.data.on("data", (chunk: Buffer) => {
        const lines = chunk.toString().split("\n");
        for (const line of lines) {
          if (line.startsWith("data: ")) {
            const data = line.slice(6);
            if (data === "[DONE]") {
              if (buffer) {
                this._sendStreamToWebview(buffer);
                llmResponse += buffer;
                buffer = "";
              }
            } else {
              try {
                const parsed = JSON.parse(data);
                const content = parsed.choices[0].delta.content;
                if (content) {
                  buffer += content;
                  if (buffer.endsWith("\n") || buffer.length > 80) {
                    this._sendStreamToWebview(buffer);
                    llmResponse += buffer;
                    buffer = "";
                  }
                }
              } catch (error) {
                console.error("Error parsing streaming data:", error);
              }
            }
          }
        }
      });

      response.data.on("end", () => {
        if (buffer) {
          this._sendStreamToWebview(buffer);
          llmResponse += buffer;
        }
        conversation.messages.push({ role: "assistant", content: llmResponse });
        this._saveConversation(conversation);
      });
    } catch (error) {
      vscode.window.showErrorMessage("Error communicating with the LLM API");
    }
  }

  private _sendStreamToWebview(content: string): void {
    this._view?.webview.postMessage({ type: "streamResponse", content });
  }

  private _getHtmlForWebview(webview: vscode.Webview): string {
    const scriptUri = webview.asWebviewUri(
      vscode.Uri.joinPath(this._extensionUri, "media", "main.js")
    );
    const styleUri = webview.asWebviewUri(
      vscode.Uri.joinPath(this._extensionUri, "media", "style.css")
    );

    return `
      <!DOCTYPE html>
      <html lang="en">
      <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <link href="${styleUri}" rel="stylesheet">
        <script src="https://cdnjs.cloudflare.com/ajax/libs/marked/2.0.3/marked.min.js"></script>
        <script src="https://cdnjs.cloudflare.com/ajax/libs/highlight.js/10.7.2/highlight.min.js"></script>
        <link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/highlight.js/10.7.2/styles/vs2015.min.css">
        <title>LLM Chatbox</title>
      </head>
      <body>
        <div id="chat-container"></div>
        <div id="input-container">
          <div id="controls">
            <select id="llm-select"></select>
            <select id="conversation-select">
              <option value="new">New Conversation</option>
            </select>
            <div class="button-group">
              <button id="auto-scroll" title="Auto-scroll">
                <svg class="icon" viewBox="0 0 24 24">
                  <path d="M16 13h-3V3h-2v10H8l4 4 4-4zM4 19v2h16v-2H4z"/>
                </svg>
              </button>
              <button id="new-chat-button" title="New Chat">
                <svg class="icon" viewBox="0 0 24 24">
                  <path d="M19 13h-6v6h-2v-6H5v-2h6V5h2v6h6v2z"/>
                </svg>
              </button>
              <button id="delete-conversation" title="Delete Conversation">
                <svg class="icon" viewBox="0 0 24 24">
                  <path d="M6 19c0 1.1.9 2 2 2h8c1.1 0 2-.9 2-2V7H6v12zM19 4h-3.5l-1-1h-5l-1 1H5v2h14V4z"/>
                </svg>
              </button>
              <button id="settings-button" title="Settings">
                <svg class="icon" viewBox="0 0 24 24">
                  <path d="M19.14 12.94c.04-.3.06-.61.06-.94 0-.32-.02-.64-.07-.94l2.03-1.58c.18-.14.23-.41.12-.61l-1.92-3.32c-.12-.22-.37-.29-.59-.22l-2.39.96c-.5-.38-1.03-.7-1.62-.94l-.36-2.54c-.04-.24-.24-.41-.48-.41h-3.84c-.24 0-.43.17-.47.41l-.36 2.54c-.59.24-1.13.57-1.62.94l-2.39-.96c-.22-.08-.47 0-.59.22L2.74 8.87c-.12.21-.08.47.12.61l2.03 1.58c-.05.3-.09.63-.09.94s.02.64.07.94l-2.03 1.58c-.18.14-.23.41-.12.61l1.92 3.32c.12.22.37.29.59.22l2.39-.96c.5.38 1.03.7 1.62.94l.36 2.54c.05.24.24.41.48.41h3.84c.24 0 .44-.17.47-.41l.36-2.54c.59-.24 1.13-.56 1.62-.94l2.39.96c.22.08.47 0 .59-.22l1.92-3.32c.12-.22.07-.47-.12-.61l-2.01-1.58zM12 15.6c-1.98 0-3.6-1.62-3.6-3.6s1.62-3.6 3.6-3.6 3.6 1.62 3.6 3.6-1.62 3.6-3.6 3.6z"/>
                </svg>
              </button>
            </div>
          </div>
          <div id="context-preview"></div>
          <div id="input-wrapper">
            <textarea id="message-input" placeholder="Type your message..."></textarea>
            <button id="send-button" title="Send">
              <svg class="icon" viewBox="0 0 24 24">
                <path d="M2.01 21L23 12 2.01 3 2 10l15 2-15 2z"/>
              </svg>
            </button>
            <div class="loading-spinner">
              <svg class="icon" viewBox="0 0 24 24">
                <path d="M12 6v3l4-4-4-4v3c-4.42 0-8 3.58-8 8 0 1.57.46 3.03 1.24 4.26L6.7 14.8c-.45-.83-.7-1.79-.7-2.8 0-3.31 2.69-6 6-6zm6.76 1.74L17.3 9.2c.44.84.7 1.79.7 2.8 0 3.31-2.69 6-6 6v-3l-4 4 4 4v-3c4.42 0 8-3.58 8-8 0-1.57-.46-3.03-1.24-4.26z"/>
              </svg>
            </div>
          </div>
        </div>
        <script src="${scriptUri}"></script>
      </body>
      </html>
    `;
  }

  private _sendConversationsToWebview(): void {
    const conversations = this._getConversations();
    this._view?.webview.postMessage({
      type: "updateConversations",
      conversations: conversations,
    });
  }

  private _getConversations(): Conversation[] {
    try {
      const conversationsContent = fs.readFileSync(
        this._conversationsPath,
        "utf8"
      );
      return JSON.parse(conversationsContent);
    } catch (error) {
      console.error("Error reading conversations file:", error);
      return [];
    }
  }

  private _saveConversation(conversation: Conversation): void {
    const conversations = this._getConversations();
    const existingIndex = conversations.findIndex(
      (c) => c.id === conversation.id
    );
    if (existingIndex !== -1) {
      conversations[existingIndex] = conversation;
    } else {
      conversations.push(conversation);
    }
    fs.writeFileSync(
      this._conversationsPath,
      JSON.stringify(conversations, null, 2)
    );
    this._sendConversationsToWebview();
  }

  private _deleteConversation(conversationId: string): void {
    let conversations = this._getConversations();
    conversations = conversations.filter((c) => c.id !== conversationId);
    fs.writeFileSync(
      this._conversationsPath,
      JSON.stringify(conversations, null, 2)
    );
    this._sendConversationsToWebview();
  }

  private _loadConversation(conversationId: string): void {
    const conversations = this._getConversations();
    const conversation = conversations.find((c) => c.id === conversationId);
    if (conversation && this._view) {
      this._view.webview.postMessage({
        type: "loadConversation",
        conversation: conversation,
      });
    }
  }

  public async getCodeSuggestion(
    document: vscode.TextDocument,
    position: vscode.Position
  ): Promise<CodeSuggestion | null> {
    const config = vscode.workspace.getConfiguration("llmChatbox");
    const enableCodeSuggestions = config.get<boolean>("enableCodeSuggestions");
    const codeSuggestionModelName = config.get<string>("codeSuggestionModel");

    if (!enableCodeSuggestions || !codeSuggestionModelName) {
      return null;
    }

    const model = this._getSettings().models.find(
      (m) => m.name === codeSuggestionModelName
    );

    if (!model) {
      vscode.window.showErrorMessage(
        "Selected code suggestion model not found in configuration."
      );
      return null;
    }

    const linePrefix = document.lineAt(position).text.substr(0, position.character);
    const prompt = `Complete the following code:\n\n${linePrefix}`;

    try {
      const response = await axios.post(
        model.apiUrl,
        {
          model: model.modelName,
          messages: [
            { role: "system", content: "You are a helpful code completion assistant." },
            { role: "user", content: prompt },
          ],
          temperature: model.temperature,
          max_tokens: 100,
          n: 1,
          stop: ["\n"],
        },
        {
          headers: {
            Authorization: `Bearer ${model.apiToken}`,
            "Content-Type": "application/json",
          },
        }
      );

      const suggestion = response.data.choices[0].message.content.trim();
      return {
        text: suggestion,
        range: new vscode.Range(position, position),
      };
    } catch (error) {
      console.error("Error getting code suggestion:", error);
      return null;
    }
  }
}
