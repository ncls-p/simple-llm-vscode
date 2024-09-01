import * as vscode from "vscode";
import axios from "axios";
import * as fs from "fs";
import * as path from "path";

export class ChatboxViewProvider implements vscode.WebviewViewProvider {
  private _view?: vscode.WebviewView;
  private _settingsPath: string;
  private _conversationsPath: string;

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

  private _ensureSettingsFile() {
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

  private _ensureConversationsFile() {
    if (!fs.existsSync(this._conversationsPath)) {
      fs.writeFileSync(this._conversationsPath, JSON.stringify([], null, 2));
    }
  }

  public resolveWebviewView(
    webviewView: vscode.WebviewView,
    context: vscode.WebviewViewResolveContext,
    _token: vscode.CancellationToken
  ) {
    this._view = webviewView;

    webviewView.webview.options = {
      enableScripts: true,
      localResourceRoots: [this._extensionUri],
    };

    webviewView.webview.html = this._getHtmlForWebview(webviewView.webview);

    webviewView.webview.onDidReceiveMessage(this._handleMessage, this);
  }

  public addSelectedCode(code: string, fileName: string) {
    if (this._view) {
      this._view.webview.postMessage({ type: "addSelectedCode", code, fileName, id: Date.now() });
    }
  }

  private async _handleMessage(message: any) {
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
    }
  }

  private _getSettings() {
    try {
      const settingsContent = fs.readFileSync(this._settingsPath, "utf8");
      return JSON.parse(settingsContent);
    } catch (error) {
      console.error("Error reading settings file:", error);
      return { models: [] };
    }
  }

  private _sendLLMsToWebview() {
    const settings = this._getSettings();
    if (this._view) {
      this._view.webview.postMessage({
        type: "updateLLMs",
        llms: settings.models,
      });
    }
  }

  private async _sendMessageToLLM(
    message: string,
    context: string,
    modelName: string,
    conversationId: string | null
  ) {
    const settings = this._getSettings();
    const model = settings.models.find((m: any) => m.name === modelName);

    if (!model) {
      vscode.window.showErrorMessage(
        "Selected LLM model not found in configuration."
      );
      return;
    }

    try {
      const response = await axios.post(
        model.apiUrl,
        {
          model: model.modelName,
          messages: [
            { role: "system", content: model.systemPrompt },
            {
              role: "user",
              content: `Context:\n${context}\n\nQuestion: ${message}`,
            },
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

      const newMessage = { role: "user", content: message };
      let conversation;
      if (conversationId) {
        conversation = this._getConversations().find((c: any) => c.id === conversationId);
        if (conversation) {
          conversation.messages.push(newMessage);
        }
      }
      if (!conversation) {
        conversation = {
          id: Date.now().toString(),
          messages: [newMessage],
          model: modelName,
        };
      }

      if (this._view) {
        this._view.webview.postMessage({
          type: "addMessage",
          sender: "User",
          content: message,
        });
      }

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

  private _sendStreamToWebview(content: string) {
    if (this._view) {
      this._view.webview.postMessage({ type: "streamResponse", content });
    }
  }

  private _getHtmlForWebview(webview: vscode.Webview) {
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
            <button id="new-chat-button" title="New Chat"><i class="icon-plus"></i></button>
            <button id="delete-conversation" title="Delete Conversation"><i class="icon-trash"></i></button>
            <button id="auto-scroll" title="Auto-scroll"><i class="icon-scroll"></i></button>
            <button id="settings-button" title="Settings"><i class="icon-settings"></i></button>
          </div>
          <div id="context-preview"></div>
          <div id="input-wrapper">
            <textarea id="message-input" placeholder="Type your message..."></textarea>
            <button id="send-button" title="Send"><i class="icon-send"></i></button>
          </div>
        </div>
        <script src="${scriptUri}"></script>
      </body>
      </html>
    `;
  }

  private _sendConversationsToWebview() {
    const conversations = this._getConversations();
    if (this._view) {
      this._view.webview.postMessage({
        type: "updateConversations",
        conversations: conversations,
      });
    }
  }

  private _getConversations() {
    try {
      const conversationsContent = fs.readFileSync(this._conversationsPath, "utf8");
      return JSON.parse(conversationsContent);
    } catch (error) {
      console.error("Error reading conversations file:", error);
      return [];
    }
  }

  private _saveConversation(conversation: any) {
    const conversations = this._getConversations();
    const existingIndex = conversations.findIndex((c: any) => c.id === conversation.id);
    if (existingIndex !== -1) {
      conversations[existingIndex] = conversation;
    } else {
      conversations.push(conversation);
    }
    fs.writeFileSync(this._conversationsPath, JSON.stringify(conversations, null, 2));
    this._sendConversationsToWebview();
  }

  private _deleteConversation(conversationId: string) {
    let conversations = this._getConversations();
    conversations = conversations.filter((c: any) => c.id !== conversationId);
    fs.writeFileSync(this._conversationsPath, JSON.stringify(conversations, null, 2));
    this._sendConversationsToWebview();
  }

  private _loadConversation(conversationId: string) {
    const conversations = this._getConversations();
    const conversation = conversations.find((c: any) => c.id === conversationId);
    if (conversation && this._view) {
      this._view.webview.postMessage({
        type: "loadConversation",
        conversation: conversation,
      });
    }
  }
}
