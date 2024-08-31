"use strict";
var __createBinding =
  (this && this.__createBinding) ||
  (Object.create
    ? function (o, m, k, k2) {
        if (k2 === undefined) k2 = k;
        var desc = Object.getOwnPropertyDescriptor(m, k);
        if (
          !desc ||
          ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)
        ) {
          desc = {
            enumerable: true,
            get: function () {
              return m[k];
            },
          };
        }
        Object.defineProperty(o, k2, desc);
      }
    : function (o, m, k, k2) {
        if (k2 === undefined) k2 = k;
        o[k2] = m[k];
      });
var __setModuleDefault =
  (this && this.__setModuleDefault) ||
  (Object.create
    ? function (o, v) {
        Object.defineProperty(o, "default", { enumerable: true, value: v });
      }
    : function (o, v) {
        o["default"] = v;
      });
var __importStar =
  (this && this.__importStar) ||
  function (mod) {
    if (mod && mod.__esModule) return mod;
    var result = {};
    if (mod != null)
      for (var k in mod)
        if (k !== "default" && Object.prototype.hasOwnProperty.call(mod, k))
          __createBinding(result, mod, k);
    __setModuleDefault(result, mod);
    return result;
  };
var __importDefault =
  (this && this.__importDefault) ||
  function (mod) {
    return mod && mod.__esModule ? mod : { default: mod };
  };
Object.defineProperty(exports, "__esModule", { value: true });
exports.ChatboxPanel = void 0;
const vscode = __importStar(require("vscode"));
const axios_1 = __importDefault(require("axios"));
class ChatboxPanel {
  static currentPanel;
  _panel;
  _disposables = [];
  constructor(panel) {
    this._panel = panel;
    this._panel.onDidDispose(() => this.dispose(), null, this._disposables);
    this._panel.webview.html = this._getWebviewContent();
    this._setWebviewMessageListener(this._panel.webview);
  }
  static createOrShow() {
    const column = vscode.window.activeTextEditor
      ? vscode.window.activeTextEditor.viewColumn
      : undefined;
    if (ChatboxPanel.currentPanel) {
      ChatboxPanel.currentPanel._panel.reveal(column);
      return;
    }
    const panel = vscode.window.createWebviewPanel(
      "llmChatbox",
      "LLM Chatbox",
      column || vscode.ViewColumn.One,
      {
        enableScripts: true,
      }
    );
    ChatboxPanel.currentPanel = new ChatboxPanel(panel);
  }
  _getWebviewContent() {
    return `
      <!DOCTYPE html>
      <html lang="en">
      <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>LLM Chatbox</title>
        <style>
          body { font-family: Arial, sans-serif; }
          #chat-container { height: 300px; overflow-y: auto; border: 1px solid #ccc; padding: 10px; }
          #input-container { margin-top: 10px; }
          #message-input { width: 70%; }
          #send-button { width: 20%; }
        </style>
      </head>
      <body>
        <div id="chat-container"></div>
        <div id="input-container">
          <input type="text" id="message-input" placeholder="Type your message...">
          <button id="send-button">Send</button>
        </div>
        <script>
          const vscode = acquireVsCodeApi();
          const chatContainer = document.getElementById('chat-container');
          const messageInput = document.getElementById('message-input');
          const sendButton = document.getElementById('send-button');

          sendButton.addEventListener('click', () => {
            const message = messageInput.value;
            if (message) {
              vscode.postMessage({ type: 'sendMessage', message });
              messageInput.value = '';
            }
          });

          window.addEventListener('message', event => {
            const message = event.data;
            switch (message.type) {
              case 'addMessage':
                const messageElement = document.createElement('div');
                messageElement.textContent = \`\${message.sender}: \${message.content}\`;
                chatContainer.appendChild(messageElement);
                chatContainer.scrollTop = chatContainer.scrollHeight;
                break;
            }
          });
        </script>
      </body>
      </html>
    `;
  }
  _setWebviewMessageListener(webview) {
    webview.onDidReceiveMessage(
      async (message) => {
        switch (message.type) {
          case "sendMessage":
            await this._sendMessageToLLM(message.message);
            break;
        }
      },
      undefined,
      this._disposables
    );
  }
  async _sendMessageToLLM(message) {
    const config = vscode.workspace.getConfiguration("llmChatbox");
    const models = config.get("models");
    if (models.length === 0) {
      vscode.window.showErrorMessage(
        "No LLM models configured. Please add models in settings."
      );
      return;
    }
    const selectedModel = await vscode.window.showQuickPick(
      models.map((model) => model.name),
      { placeHolder: "Select an LLM model" }
    );
    if (!selectedModel) return;
    const model = models.find((m) => m.name === selectedModel);
    try {
      const response = await axios_1.default.post(
        model.apiUrl,
        {
          model: "gpt-3.5-turbo",
          messages: [{ role: "user", content: message }],
        },
        {
          headers: {
            Authorization: `Bearer ${model.apiToken}`,
            "Content-Type": "application/json",
          },
        }
      );
      const reply = response.data.choices[0].message.content;
      this._panel.webview.postMessage({
        type: "addMessage",
        sender: "User",
        content: message,
      });
      this._panel.webview.postMessage({
        type: "addMessage",
        sender: "LLM",
        content: reply,
      });
    } catch (error) {
      vscode.window.showErrorMessage("Error communicating with the LLM API");
    }
  }
  dispose() {
    ChatboxPanel.currentPanel = undefined;
    this._panel.dispose();
    while (this._disposables.length) {
      const disposable = this._disposables.pop();
      if (disposable) {
        disposable.dispose();
      }
    }
  }
}
exports.ChatboxPanel = ChatboxPanel;
//# sourceMappingURL=chatboxPanel.js.map
