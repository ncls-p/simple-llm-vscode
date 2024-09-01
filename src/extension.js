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
Object.defineProperty(exports, "__esModule", { value: true });
exports.activate = activate;
exports.deactivate = deactivate;
const vscode = __importStar(require("vscode"));
const chatboxViewProvider_1 = require("./chatboxViewProvider");
const fs = __importStar(require("fs"));
const path = __importStar(require("path"));
function activate(context) {
  const chatboxViewProvider = new chatboxViewProvider_1.ChatboxViewProvider(
    context.extensionUri
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
          chatboxViewProvider.addSelectedCode(selectedText);
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
      if (!fs.existsSync(settingsPath)) {
        const defaultSettings = {
          models: [
            {
              name: "Default Model",
              apiUrl: "https://api.openai.com/v1/chat/completions",
              apiToken: "YOUR_API_TOKEN",
              modelName: "gpt-3.5-turbo",
              systemPrompt: "You are a helpful assistant.",
              temperature: 0.2,
            },
          ],
        };
        fs.writeFileSync(
          settingsPath,
          JSON.stringify(defaultSettings, null, 2)
        );
      }
      vscode.workspace.openTextDocument(settingsPath).then((doc) => {
        vscode.window.showTextDocument(doc);
      });
    })
  );
}
function deactivate() {}
//# sourceMappingURL=extension.js.map
