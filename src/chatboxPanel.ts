import * as vscode from "vscode";
import axios from "axios";

export class ChatboxPanel {
  public static currentPanel: ChatboxPanel | undefined;
  private readonly _panel: vscode.WebviewPanel;
  private _disposables: vscode.Disposable[] = [];

  private constructor(panel: vscode.WebviewPanel) {
    this._panel = panel;
    this._panel.onDidDispose(() => this.dispose(), null, this._disposables);
    this._panel.webview.html = this._getWebviewContent();
    this._setWebviewMessageListener(this._panel.webview);
  }

  public static createOrShow() {
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

  private _getWebviewContent() {
    return `
      <!DOCTYPE html>
      <html lang="en">
      <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>LLM Chatbox</title>
        <style>
          body { font-family: Arial, sans-serif; }
          #chat-container { height: 30px; overflow-y: auto; border: 1px solid #ccc; padding: 10px; }
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

  private _setWebviewMessageListener(webview: vscode.Webview) {
    webview.onDidReceiveMessage(
      async (message: any) => {
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

  private async _sendMessageToLLM(message: string) {
    const config = vscode.workspace.getConfiguration("llmChatbox");
    const models = config.get("models") as any[];

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
      const response = await axios.post(
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

  public dispose() {
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
