(function () {
  const vscode = acquireVsCodeApi();
  const chatContainer = document.getElementById("chat-container");
  const messageInput = document.getElementById("message-input");
  const contextPreview = document.getElementById("context-preview");
  const sendButton = document.getElementById("send-button");
  const llmSelect = document.getElementById("llm-select");
  const autoScrollButton = document.getElementById("auto-scroll");
  const settingsButton = document.getElementById("settings-button");

  let context = "";
  let autoScroll = true;

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
        context,
        model: llmSelect.value,
      });
      messageInput.value = "";
      contextPreview.textContent = "";
      context = "";
    }
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
          message.sender.toLowerCase() + "-message"
        );
        messageElement.textContent = `${message.sender}: ${message.content}`;
        chatContainer.appendChild(messageElement);
        scrollToBottom();
        break;
      case "addSelectedCode":
        context = message.code;
        contextPreview.textContent = context;
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
          lastMessage.classList.add("message", "llm-message");
          lastMessage.textContent = "LLM: ";
          chatContainer.appendChild(lastMessage);
        }
        lastMessage.textContent += message.content;
        scrollToBottom();
        break;
    }
  });
})();
