(function () {
  const vscode = acquireVsCodeApi();
  const chatContainer = document.getElementById("chat-container");
  const messageInput = document.getElementById("message-input");
  const contextPreview = document.getElementById("context-preview");
  const sendButton = document.getElementById("send-button");
  const llmSelect = document.getElementById("llm-select");
  const autoScrollButton = document.getElementById("auto-scroll");
  const settingsButton = document.getElementById("settings-button");

  let selectedCode = [];
  let autoScroll = true;

  // Configure marked for syntax highlighting
  marked.setOptions({
    highlight: function (code, lang) {
      return hljs.highlightAuto(code, [lang]).value;
    }
  });

  // Initialize LLM select
  vscode.postMessage({ type: "getLLMs" });

  sendButton.addEventListener("click", sendMessage);
  messageInput.addEventListener("keydown", (event) => {
    if (event.key === "Enter" && !event.shiftKey) {
      event.preventDefault();
      sendMessage();
    }
  });

  autoScrollButton.addEventListener("click", () => {
    autoScroll = !autoScroll;
    autoScrollButton.textContent = `Auto-scroll: ${autoScroll ? "On" : "Off"}`;
    autoScrollButton.classList.toggle("active", autoScroll);
  });

  settingsButton.addEventListener("click", () => {
    vscode.postMessage({ type: "openSettings" });
  });

  function sendMessage() {
    const message = messageInput.value;
    if (message) {
      vscode.postMessage({
        type: "sendMessage",
        message,
        context: selectedCode.map(c => c.code).join('\n\n'),
        model: llmSelect.value,
      });
      messageInput.value = "";
      updateContextPreview();
    }
  }

  function updateContextPreview() {
    contextPreview.innerHTML = '';
    selectedCode.forEach(codeBlock => {
      const wrapper = document.createElement('div');
      wrapper.classList.add('code-block');

      const fileNameElement = document.createElement('div');
      fileNameElement.classList.add('file-name');
      fileNameElement.textContent = codeBlock.fileName;
      wrapper.appendChild(fileNameElement);

      const codeElement = document.createElement('pre');
      codeElement.classList.add('hljs');
      
      const lines = codeBlock.code.split('\n');
      const previewLines = lines.length > 4 ? 
        [...lines.slice(0, 3), '...', lines[lines.length - 1]] : 
        lines;
      
      codeElement.innerHTML = hljs.highlightAuto(previewLines.join('\n')).value;
      
      wrapper.appendChild(codeElement);
      
      const removeButton = document.createElement('button');
      removeButton.textContent = 'Remove';
      removeButton.onclick = () => removeCodeBlock(codeBlock.id);
      
      wrapper.appendChild(removeButton);
      contextPreview.appendChild(wrapper);
    });
  }

  function removeCodeBlock(id) {
    selectedCode = selectedCode.filter(c => c.id !== id);
    updateContextPreview();
  }

  function scrollToBottom() {
    if (autoScroll) {
      chatContainer.scrollTop = chatContainer.scrollHeight;
    }
  }

  window.addEventListener("message", (event) => {
    const message = event.data;
    switch (message.type) {
      case "addMessage":
        const messageElement = document.createElement("div");
        messageElement.classList.add(
          "message",
          message.sender.toLowerCase() + "-message",
          "markdown-body"
        );
        messageElement.innerHTML = marked(`${message.sender}: ${message.content}`);
        chatContainer.appendChild(messageElement);
        scrollToBottom();
        break;
      case "addSelectedCode":
        selectedCode.push({ 
          id: message.id, 
          code: message.code,
          fileName: message.fileName || 'Untitled'
        });
        updateContextPreview();
        break;
      case "updateLLMs":
        llmSelect.innerHTML = "";
        message.llms.forEach((llm) => {
          const option = document.createElement("option");
          option.value = llm.name;
          option.textContent = llm.name;
          llmSelect.appendChild(option);
        });
        break;
      case "streamResponse":
        let lastMessage = chatContainer.lastElementChild;
        if (!lastMessage || !lastMessage.classList.contains("llm-message")) {
          lastMessage = document.createElement("div");
          lastMessage.classList.add("message", "llm-message", "markdown-body");
          lastMessage.innerHTML = marked("LLM: ");
          chatContainer.appendChild(lastMessage);
        }
        lastMessage.innerHTML = marked(lastMessage.textContent + message.content);
        scrollToBottom();
        break;
    }
  });
})();
