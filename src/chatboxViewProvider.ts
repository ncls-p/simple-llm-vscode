import * as vscode from "vscode";
import axios from "axios";
import * as fs from "fs";
import * as path from "path";

export class ChatboxViewProvider implements vscode.WebviewViewProvider {
  private _view?: vscode.WebviewView;
  private _settingsPath: string;

  constructor(
    private readonly _extensionUri: vscode.Uri,
    context: vscode.ExtensionContext
  ) {
    this._settingsPath = path.join(
      context.globalStorageUri.fsPath,
      "llm-settings.json"
    );
    this._ensureSettingsFile();
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

  public addSelectedCode(code: string) {
    if (this._view) {
      this._view.webview.postMessage({ type: "addSelectedCode", code, id: Date.now() });
    }
  }

  private async _handleMessage(message: any) {
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
      case "openSettings":
        vscode.commands.executeCommand("llmChatbox.openSettings");
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
    modelName: string
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

      if (this._view) {
        this._view.webview.postMessage({
          type: "addMessage",
          sender: "User",
          content: message,
        });
      }

      let buffer = "";
      response.data.on("data", (chunk: Buffer) => {
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
        <title>LLM Chatbox</title>
      </head>
      <body>
        <div id="chat-container"></div>
        <div id="input-container">
          <div id="controls">
            <select id="llm-select"></select>
            <button id="auto-scroll">Scroll: On</button>
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
