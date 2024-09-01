(function () {
  const vscode = acquireVsCodeApi();
  const chatContainer = document.getElementById("chat-container");
  const messageInput = document.getElementById("message-input");
  const contextPreview = document.getElementById("context-preview");
  const sendButton = document.getElementById("send-button");
  const llmSelect = document.getElementById("llm-select");
  const conversationSelect = document.getElementById("conversation-select");
  const deleteConversationButton = document.getElementById(
    "delete-conversation"
  );
  const autoScrollButton = document.getElementById("auto-scroll");
  const settingsButton = document.getElementById("settings-button");
  const newChatButton = document.getElementById("new-chat-button");

  let selectedCode = [];
  let autoScroll = true;
  let currentConversationId = null;

  // Configure marked for syntax highlighting
  marked.setOptions({
    highlight: function (code, lang) {
      return hljs.highlightAuto(code, [lang]).value;
    },
  });

  // Initialize LLM select and conversations
  vscode.postMessage({ type: "getLLMs" });
  vscode.postMessage({ type: "getConversations" });

  sendButton.addEventListener("click", sendMessage);
  messageInput.addEventListener("keydown", (event) => {
    if (event.key === "Enter" && !event.shiftKey) {
      event.preventDefault();
      sendMessage();
    }
  });

  autoScrollButton.addEventListener("click", () => {
    autoScroll = !autoScroll;
    autoScrollButton.classList.toggle("active", autoScroll);
  });

  settingsButton.addEventListener("click", () => {
    vscode.postMessage({ type: "openSettings" });
  });

  newChatButton.addEventListener("click", () => {
    currentConversationId = null;
    chatContainer.innerHTML = "";
    conversationSelect.value = "new";
  });

  // Add resize event listener for chat container
  let isResizing = false;
  let lastY;

  chatContainer.addEventListener("mousedown", (e) => {
    if (e.offsetY > chatContainer.clientHeight - 10) {
      isResizing = true;
      lastY = e.clientY;
    }
  });

  document.addEventListener("mousemove", (e) => {
    if (!isResizing) return;
    const delta = e.clientY - lastY;
    chatContainer.style.height = `${chatContainer.clientHeight + delta}px`;
    lastY = e.clientY;
  });

  document.addEventListener("mouseup", () => {
    isResizing = false;
  });

  conversationSelect.addEventListener("change", () => {
    const selectedConversationId = conversationSelect.value;
    if (selectedConversationId === "new") {
      currentConversationId = null;
      chatContainer.innerHTML = "";
    } else {
      currentConversationId = selectedConversationId;
      vscode.postMessage({
        type: "loadConversation",
        conversationId: currentConversationId,
      });
    }
  });

  deleteConversationButton.addEventListener("click", () => {
    if (currentConversationId) {
      vscode.postMessage({
        type: "deleteConversation",
        conversationId: currentConversationId,
      });
      currentConversationId = null;
      chatContainer.innerHTML = "";
      conversationSelect.value = "new";
    }
  });

  function sendMessage() {
    const message = messageInput.value;
    if (message) {
      vscode.postMessage({
        type: "sendMessage",
        message,
        context: selectedCode.map((c) => c.code).join("\n\n"),
        model: llmSelect.value,
        conversationId: currentConversationId,
      });
      messageInput.value = "";
      updateContextPreview();

      // Show loading spinner
      document.getElementById("input-wrapper").classList.add("loading");
    }
  }

  function addFixButton() {
    const fixButton = document.createElement("button");
    fixButton.textContent = "Fix using simple-llm-vscode";
    fixButton.onclick = () => {
      const errorMessage =
        document.querySelector(".error-message")?.textContent || "";
      vscode.postMessage({
        type: "fixUsingSimpleLLM",
        errorMessage,
      });
    };
    document.body.appendChild(fixButton);
  }

  // Call this function when the webview is initialized
  addFixButton();

  function updateContextPreview() {
    contextPreview.innerHTML = "";
    selectedCode.forEach((codeBlock) => {
      const wrapper = document.createElement("div");
      wrapper.classList.add("code-block");

      const fileNameElement = document.createElement("div");
      fileNameElement.classList.add("file-name");
      fileNameElement.textContent = codeBlock.fileName;
      wrapper.appendChild(fileNameElement);

      const codeElement = document.createElement("pre");
      codeElement.classList.add("hljs");

      const lines = codeBlock.code.split("\n");
      const previewLines =
        lines.length > 4
          ? [...lines.slice(0, 3), "...", lines[lines.length - 1]]
          : lines;

      codeElement.innerHTML = hljs.highlightAuto(previewLines.join("\n")).value;

      wrapper.appendChild(codeElement);

      const removeButton = document.createElement("button");
      removeButton.innerHTML = `
        <svg class="icon" viewBox="0 0 24 24" width="16" height="16">
          <path d="M19 6.41L17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12 19 6.41z"/>
        </svg>
      `;
      removeButton.title = "Remove";
      removeButton.onclick = () => removeCodeBlock(codeBlock.id);

      wrapper.appendChild(removeButton);
      contextPreview.appendChild(wrapper);
    });
  }

  function removeCodeBlock(id) {
    selectedCode = selectedCode.filter((c) => c.id !== id);
    updateContextPreview();
  }

  function scrollToBottom() {
    if (autoScroll) {
      chatContainer.scrollTop = chatContainer.scrollHeight;
    }
  }

  function renderMarkdown(content) {
    if (content.startsWith("```")) {
      content = "\n" + content;
    }
    return marked(content, {
      breaks: true,
      gfm: true,
      highlight: function (code, lang) {
        const language = hljs.getLanguage(lang) ? lang : "plaintext";
        return hljs.highlight(code, { language }).value;
      },
    }).replace(/<pre><code/g, '<pre><code class="hljs"');
  }

  function addDeleteButton(messageElement) {
    const deleteButton = document.createElement("button");
    deleteButton.classList.add("delete-message");
    deleteButton.innerHTML = "&times;";
    deleteButton.title = "Delete message";
    deleteButton.onclick = () => {
      messageElement.remove();
      // You may want to add logic here to update the conversation in the backend
    };
    messageElement.appendChild(deleteButton);
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
        const renderedContent = renderMarkdown(message.content);
        messageElement.innerHTML = `<strong>${message.sender}:</strong> ${renderedContent}`;
        addDeleteButton(messageElement);
        chatContainer.appendChild(messageElement);
        scrollToBottom();
        break;
      case "addSelectedCode":
        selectedCode.push({
          id: message.id,
          code: message.code,
          fileName: message.fileName || "Untitled",
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
      case "updateConversations":
        conversationSelect.innerHTML =
          "<option value='new'>New Conversation</option>";
        message.conversations.forEach((conversation) => {
          const option = document.createElement("option");
          option.value = conversation.id;
          option.textContent = `Conversation ${conversation.id}`;
          conversationSelect.appendChild(option);
        });
        break;
      case "loadConversation":
        chatContainer.innerHTML = "";
        message.conversation.messages.forEach((msg) => {
          const messageElement = document.createElement("div");
          messageElement.classList.add(
            "message",
            msg.role + "-message",
            "markdown-body"
          );
          messageElement.innerHTML = renderMarkdown(
            `**${msg.role === "user" ? "User" : "LLM"}:** ${msg.content}`
          );
          addDeleteButton(messageElement);
          chatContainer.appendChild(messageElement);
        });
        scrollToBottom();
        break;
      case "streamResponse":
        let lastMessage = chatContainer.lastElementChild;
        if (!lastMessage || !lastMessage.classList.contains("llm-message")) {
          lastMessage = document.createElement("div");
          lastMessage.classList.add("message", "llm-message", "markdown-body");
          lastMessage.innerHTML = renderMarkdown("**LLM:** ");
          addDeleteButton(lastMessage);
          chatContainer.appendChild(lastMessage);
        }
        const existingContent = lastMessage.getAttribute("data-content") || "";
        const newContent = existingContent + message.content;
        lastMessage.setAttribute("data-content", newContent);
        const renderedContent = renderMarkdown(newContent);
        lastMessage.innerHTML = `<strong>LLM:</strong> ${renderedContent}`;
        addDeleteButton(lastMessage);
        scrollToBottom();

        // If the message is complete (ends with a newline), hide the loading spinner
        if (message.content.endsWith("\n")) {
          document.getElementById("input-wrapper").classList.remove("loading");
        }
        break;
    }
  });
})();
