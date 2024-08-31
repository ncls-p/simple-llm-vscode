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
exports.ChatboxViewProvider = void 0;
const vscode = __importStar(require("vscode"));
const axios_1 = __importDefault(require("axios"));
const fs = __importStar(require("fs"));
const path = __importStar(require("path"));
class ChatboxViewProvider {
  _extensionUri;
  _view;
  _settingsPath;
  constructor(_extensionUri) {
    this._extensionUri = _extensionUri;
    this._settingsPath = path.join(
      _extensionUri.fsPath,
      "..",
      "..",
      "llm-settings.json"
    );
  }
  resolveWebviewView(webviewView, context, _token) {
    this._view = webviewView;
    webviewView.webview.options = {
      enableScripts: true,
      localResourceRoots: [this._extensionUri],
    };
    webviewView.webview.html = this._getHtmlForWebview(webviewView.webview);
    webviewView.webview.onDidReceiveMessage(this._handleMessage, this);
  }
  addSelectedCode(code) {
    if (this._view) {
      this._view.webview.postMessage({ type: "addSelectedCode", code });
    }
  }
  async _handleMessage(message) {
    switch (message.type) {
      case "sendMessage":
        await this._sendMessageToLLM(
          message.message,
          message.context,
          message.model
        );
        break;
      case "getLLMs":
        this._sendLLMsToWebview();
        break;
    }
  }
  _getSettings() {
    if (fs.existsSync(this._settingsPath)) {
      const settingsContent = fs.readFileSync(this._settingsPath, "utf8");
      return JSON.parse(settingsContent);
    }
    return { models: [] };
  }
  _sendLLMsToWebview() {
    const settings = this._getSettings();
    if (this._view) {
      this._view.webview.postMessage({
        type: "updateLLMs",
        llms: settings.models,
      });
    }
  }
  async _sendMessageToLLM(message, context, modelName) {
    const settings = this._getSettings();
    const model = settings.models.find((m) => m.name === modelName);
    if (!model) {
      vscode.window.showErrorMessage(
        "Selected LLM model not found in configuration."
      );
      return;
    }
    try {
      const response = await axios_1.default.post(
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
      if (this._view) {
        this._view.webview.postMessage({
          type: "addMessage",
          sender: "User",
          content: message,
        });
      }
      let buffer = "";
      response.data.on("data", (chunk) => {
        const lines = chunk.toString().split("\n");
        for (const line of lines) {
          if (line.startsWith("data: ")) {
            const data = line.slice(6);
            if (data === "[DONE]") {
              if (buffer) {
                this._sendStreamToWebview(buffer);
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
        }
      });
    } catch (error) {
      vscode.window.showErrorMessage("Error communicating with the LLM API");
    }
  }
  _sendStreamToWebview(content) {
    if (this._view) {
      this._view.webview.postMessage({ type: "streamResponse", content });
    }
  }
  _getHtmlForWebview(webview) {
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
        <title>LLM Chatbox</title>
      </head>
      <body>
        <div id="chat-container"></div>
        <div id="input-container">
          <div id="controls">
            <select id="llm-select"></select>
            <button id="auto-scroll">Auto-scroll: On</button>
            <button id="settings-button">Settings</button>
          </div>
          <textarea id="message-input" placeholder="Type your message..."></textarea>
          <div id="context-preview"></div>
          <button id="send-button">Send</button>
        </div>
        <script src="${scriptUri}"></script>
      </body>
      </html>
    `;
  }
}
exports.ChatboxViewProvider = ChatboxViewProvider;
//# sourceMappingURL=chatboxViewProvider.js.map
