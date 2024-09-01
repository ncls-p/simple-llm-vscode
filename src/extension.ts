import * as vscode from "vscode";
import { ChatboxViewProvider } from "./chatboxViewProvider";
import * as path from "path";

class ChatboxPanel {
  /*...*/
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
          #chat-container { height: 300px; overflow-y: auto; border: 1px solid #ccc; padding: 10px; }
          #input-container { margin-top: 10px; }
          #message-input { width: 60%; }
          #send-button { width: 15%; }
          #clear-button { width: 15%; }
          #loading-spinner {
            display: none;
            border: 4px solid #f3f3f3;
            border-radius: 50%;
            border-top: 4px solid #3498db;
            width: 20px;
            height: 20px;
            animation: spin 2s linear infinite;
          }
          @keyframes spin {
            0% { transform: rotate(0deg); }
            100% { transform: rotate(360deg); }
          }
        </style>
      </head>
      <body>
        <div id="chat-container"></div>
        <div id="input-container">
          <input type="text" id="message-input" placeholder="Type your message...">
          <button id="send-button">Send</button>
          <button id="clear-button">Clear</button>
          <div id="loading-spinner"></div>
        </div>
        <script>
          const vscode = acquireVsCodeApi();
          const chatContainer = document.getElementById('chat-container');
          const messageInput = document.getElementById('message-input');
          const sendButton = document.getElementById('send-button');
          const clearButton = document.getElementById('clear-button');
          const loadingSpinner = document.getElementById('loading-spinner');

          sendButton.addEventListener('click', () => {
            const message = messageInput.value;
            if (message) {
              vscode.postMessage({ type: 'sendMessage', message });
              messageInput.value = '';
              loadingSpinner.style.display = 'inline-block';
            }
          });

          clearButton.addEventListener('click', () => {
            chatContainer.innerHTML = '';
          });

          window.addEventListener('message', event => {
            const message = event.data;
            switch (message.type) {
              case 'addMessage':
                const messageElement = document.createElement('div');
                messageElement.textContent = \`\${message.sender}: \${message.content}\`;
                chatContainer.appendChild(messageElement);
                chatContainer.scrollTop = chatContainer.scrollHeight;
                loadingSpinner.style.display = 'none';
                break;
            }
          });

          window.addEventListener('keydown', event => {
            if (event.ctrlKey && event.key === 'l') {
              event.preventDefault();
              chatContainer.innerHTML = '';
            }
          });
        </script>
      </body>
      </html>
    `;
  }
  /*...*/
}

export function activate(context: vscode.ExtensionContext) {
  const chatboxViewProvider = new ChatboxViewProvider(
    context.extensionUri,
    context
  );

  context.subscriptions.push(
    vscode.window.registerWebviewViewProvider(
      "llmChatbox.chatView",
      chatboxViewProvider
    )
  );

  context.subscriptions.push(
    vscode.commands.registerCommand("llmChatbox.addSelectedCode", () => {
      const editor = vscode.window.activeTextEditor;
      if (editor) {
        const selection = editor.selection;
        const selectedText = editor.document.getText(selection);
        if (selectedText) {
          chatboxViewProvider.addSelectedCode(
            selectedText,
            editor.document.fileName
          );
        }
      }
    })
  );

  context.subscriptions.push(
    vscode.commands.registerCommand("llmChatbox.openSettings", () => {
      const settingsPath = path.join(
        context.globalStorageUri.fsPath,
        "llm-settings.json"
      );
      vscode.workspace
        .openTextDocument(vscode.Uri.file(settingsPath))
        .then((doc) => {
          vscode.window.showTextDocument(doc);
        });
    })
  );

  // Register the code action provider
  context.subscriptions.push(
    vscode.languages.registerCodeActionsProvider(
      { scheme: "file", language: "*" },
      new LLMFixCodeActionProvider(chatboxViewProvider),
      {
        providedCodeActionKinds: [vscode.CodeActionKind.QuickFix],
      }
    )
  );
  context.subscriptions.push(
    vscode.commands.registerCommand(
      "llmChatbox.fixUsingSimpleLLM",
      (document: vscode.TextDocument, errorMessage: string) => {
        const fullText = document.getText();
        const fileName = document.fileName;
        chatboxViewProvider.addSelectedCode(fullText, fileName);
        const fixMessage = `fix this code:\n\n${errorMessage}`;
        chatboxViewProvider.sendMessageToLLM(fixMessage, fullText);
      }
    )
  );
}

export function deactivate() {}

class LLMFixCodeActionProvider implements vscode.CodeActionProvider {
  constructor(private chatboxViewProvider: ChatboxViewProvider) {}

  provideCodeActions(
    document: vscode.TextDocument,
    range: vscode.Range | vscode.Selection,
    context: vscode.CodeActionContext,
    token: vscode.CancellationToken
  ): vscode.ProviderResult<(vscode.Command | vscode.CodeAction)[]> {
    const diagnostics = context.diagnostics;
    if (diagnostics.length === 0) {
      return [];
    }

    const action = new vscode.CodeAction(
      "Fix using simple-llm-vscode",
      vscode.CodeActionKind.QuickFix
    );
    action.command = {
      title: "Fix using simple-llm-vscode",
      command: "llmChatbox.fixUsingSimpleLLM",
      arguments: [document, `Fix this code: ${diagnostics[0].message}`],
    };

    return [action];
  }
}
