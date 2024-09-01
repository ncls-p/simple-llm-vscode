(() => {
  const vscode = acquireVsCodeApi();
  const elements = {
    chatContainer: document.getElementById('chat-container'),
    messageInput: document.getElementById('message-input'),
    contextPreview: document.getElementById('context-preview'),
    sendButton: document.getElementById('send-button'),
    llmSelect: document.getElementById('llm-select'),
    conversationSelect: document.getElementById('conversation-select'),
    deleteConversationButton: document.getElementById('delete-conversation'),
    autoScrollButton: document.getElementById('auto-scroll'),
    settingsButton: document.getElementById('settings-button'),
    newChatButton: document.getElementById('new-chat-button'),
    inputWrapper: document.getElementById('input-wrapper')
  };

  let state = {
    selectedCode: [],
    autoScroll: true,
    currentConversationId: null,
    isResizing: false,
    lastY: 0
  };

  // Configure marked for syntax highlighting
  marked.setOptions({
    highlight: (code, lang) => hljs.highlightAuto(code, [lang]).value
  });

  // Initialize LLM select and conversations
  vscode.postMessage({ type: 'getLLMs' });
  vscode.postMessage({ type: 'getConversations' });

  // Event listeners
  elements.sendButton.addEventListener('click', sendMessage);
  elements.messageInput.addEventListener('keydown', handleMessageInputKeydown);
  elements.autoScrollButton.addEventListener('click', toggleAutoScroll);
  elements.settingsButton.addEventListener('click', openSettings);
  elements.newChatButton.addEventListener('click', startNewChat);
  elements.chatContainer.addEventListener('mousedown', handleChatContainerMouseDown);
  document.addEventListener('mousemove', handleDocumentMouseMove);
  document.addEventListener('mouseup', handleDocumentMouseUp);
  elements.conversationSelect.addEventListener('change', handleConversationChange);
  elements.deleteConversationButton.addEventListener('click', deleteCurrentConversation);

  // Functions
  function sendMessage() {
    const message = elements.messageInput.value;
    if (message) {
      vscode.postMessage({
        type: 'sendMessage',
        message,
        context: state.selectedCode.map(c => c.code).join('\n\n'),
        model: elements.llmSelect.value,
        conversationId: state.currentConversationId,
      });
      elements.messageInput.value = '';
      updateContextPreview();
      elements.inputWrapper.classList.add('loading');
    }
  }

  function handleMessageInputKeydown(event) {
    if (event.key === 'Enter' && !event.shiftKey) {
      event.preventDefault();
      sendMessage();
    }
  }

  function toggleAutoScroll() {
    state.autoScroll = !state.autoScroll;
    elements.autoScrollButton.classList.toggle('active', state.autoScroll);
  }

  function openSettings() {
    vscode.postMessage({ type: 'openSettings' });
  }

  function startNewChat() {
    state.currentConversationId = null;
    elements.chatContainer.innerHTML = '';
    elements.conversationSelect.value = 'new';
  }

  function handleChatContainerMouseDown(e) {
    if (e.offsetY > elements.chatContainer.clientHeight - 10) {
      state.isResizing = true;
      state.lastY = e.clientY;
    }
  }

  function handleDocumentMouseMove(e) {
    if (!state.isResizing) return;
    const delta = e.clientY - state.lastY;
    elements.chatContainer.style.height = `${elements.chatContainer.clientHeight + delta}px`;
    state.lastY = e.clientY;
  }

  function handleDocumentMouseUp() {
    state.isResizing = false;
  }

  function handleConversationChange() {
    const selectedConversationId = elements.conversationSelect.value;
    if (selectedConversationId === 'new') {
      state.currentConversationId = null;
      elements.chatContainer.innerHTML = '';
    } else {
      state.currentConversationId = selectedConversationId;
      vscode.postMessage({
        type: 'loadConversation',
        conversationId: state.currentConversationId,
      });
    }
  }

  function deleteCurrentConversation() {
    if (state.currentConversationId) {
      vscode.postMessage({
        type: 'deleteConversation',
        conversationId: state.currentConversationId,
      });
      state.currentConversationId = null;
      elements.chatContainer.innerHTML = '';
      elements.conversationSelect.value = 'new';
    }
  }

  function addFixButton() {
    const fixButton = document.createElement('button');
    fixButton.textContent = 'Fix using simple-llm-vscode';
    fixButton.onclick = () => {
      const errorMessage = document.querySelector('.error-message')?.textContent || '';
      vscode.postMessage({
        type: 'fixUsingSimpleLLM',
        errorMessage,
      });
    };
    document.body.appendChild(fixButton);
  }

  addFixButton();

  function updateContextPreview() {
    elements.contextPreview.innerHTML = '';
    state.selectedCode.forEach((codeBlock) => {
      const wrapper = document.createElement('div');
      wrapper.classList.add('code-block');

      const fileInfoElement = document.createElement('div');
      fileInfoElement.classList.add('file-info');
      let lineInfo = '';
      if (codeBlock.startLine !== null && codeBlock.endLine !== null) {
        lineInfo = codeBlock.startLine === codeBlock.endLine
          ? ` (Line ${codeBlock.startLine})`
          : ` (Lines ${codeBlock.startLine}-${codeBlock.endLine})`;
      }
      fileInfoElement.textContent = `${codeBlock.fileName}${lineInfo}`;
      wrapper.appendChild(fileInfoElement);

      if (state.selectedCode.length < 2) {
        const codeElement = document.createElement('pre');
        codeElement.classList.add('hljs');
        const lines = codeBlock.code.split('\n');
        const previewLines = lines.length > 4
          ? [...lines.slice(0, 3), '...', lines[lines.length - 1]]
          : lines;
        codeElement.innerHTML = hljs.highlightAuto(previewLines.join('\n')).value;
        wrapper.appendChild(codeElement);
      }

      const removeButton = createRemoveButton(codeBlock.id);
      wrapper.appendChild(removeButton);
      elements.contextPreview.appendChild(wrapper);
    });
  }

  function createRemoveButton(id) {
    const removeButton = document.createElement('button');
    removeButton.innerHTML = `
      <svg class="icon" viewBox="0 0 24 24" width="16" height="16">
        <path d="M19 6.41L17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12 19 6.41z"/>
      </svg>
    `;
    removeButton.title = 'Remove';
    removeButton.onclick = () => removeCodeBlock(id);
    return removeButton;
  }

  function removeCodeBlock(id) {
    state.selectedCode = state.selectedCode.filter((c) => c.id !== id);
    updateContextPreview();
  }

  function scrollToBottom() {
    if (state.autoScroll) {
      elements.chatContainer.scrollTop = elements.chatContainer.scrollHeight;
    }
  }

  function renderMarkdown(content) {
    if (content.startsWith('```')) {
      content = '\n' + content;
    }
    return marked(content, {
      breaks: true,
      gfm: true,
      highlight: (code, lang) => {
        const language = hljs.getLanguage(lang) ? lang : 'plaintext';
        return hljs.highlight(code, { language }).value;
      },
    });
  }

  function addDeleteButton(messageElement) {
    const deleteButton = document.createElement('button');
    deleteButton.classList.add('delete-message');
    deleteButton.innerHTML = '&times;';
    deleteButton.title = 'Delete message';
    deleteButton.onclick = () => messageElement.remove();
    messageElement.appendChild(deleteButton);
  }

  // Message handler
  window.addEventListener('message', (event) => {
    const message = event.data;
    switch (message.type) {
      case 'addMessage':
        addMessage(message);
        break;
      case 'addSelectedCode':
        addSelectedCode(message);
        break;
      case 'updateLLMs':
        updateLLMs(message.llms);
        break;
      case 'updateConversations':
        updateConversations(message.conversations);
        break;
      case 'loadConversation':
        loadConversation(message.conversation);
        break;
      case 'streamResponse':
        handleStreamResponse(message);
        break;
    }
  });

  function addMessage(message) {
    const messageElement = document.createElement('div');
    messageElement.classList.add(
      'message',
      `${message.sender.toLowerCase()}-message`,
      'markdown-body'
    );
    messageElement.innerHTML = renderMarkdown(`**${message.sender}:** ${message.content}`);
    addDeleteButton(messageElement);
    elements.chatContainer.appendChild(messageElement);
    scrollToBottom();
  }

  function addSelectedCode(message) {
    state.selectedCode.push({
      id: message.id,
      code: message.code,
      fileName: message.fileName || 'Untitled',
      startLine: message.startLine,
      endLine: message.endLine
    });
    updateContextPreview();
  }

  function updateLLMs(llms) {
    elements.llmSelect.innerHTML = '';
    llms.forEach((llm) => {
      const option = document.createElement('option');
      option.value = llm.name;
      option.textContent = llm.name;
      elements.llmSelect.appendChild(option);
    });
  }

  function updateConversations(conversations) {
    elements.conversationSelect.innerHTML = "<option value='new'>New Conversation</option>";
    conversations.forEach((conversation) => {
      const option = document.createElement('option');
      option.value = conversation.id;
      option.textContent = `Conversation ${conversation.id}`;
      elements.conversationSelect.appendChild(option);
    });
  }

  function loadConversation(conversation) {
    elements.chatContainer.innerHTML = '';
    conversation.messages.forEach((msg) => {
      const messageElement = document.createElement('div');
      messageElement.classList.add(
        'message',
        `${msg.role}-message`,
        'markdown-body'
      );
      messageElement.innerHTML = renderMarkdown(
        `**${msg.role === 'user' ? 'User' : 'LLM'}:** ${msg.content}`
      );
      addDeleteButton(messageElement);
      elements.chatContainer.appendChild(messageElement);
    });
    scrollToBottom();
  }

  function handleStreamResponse(message) {
    let lastMessage = elements.chatContainer.lastElementChild;
    if (!lastMessage || !lastMessage.classList.contains('llm-message')) {
      lastMessage = document.createElement('div');
      lastMessage.classList.add('message', 'llm-message', 'markdown-body');
      lastMessage.innerHTML = renderMarkdown('**LLM:** ');
      addDeleteButton(lastMessage);
      elements.chatContainer.appendChild(lastMessage);
    }
    const existingContent = lastMessage.getAttribute('data-content') || '';
    const newContent = existingContent + message.content;
    lastMessage.setAttribute('data-content', newContent);
    lastMessage.innerHTML = renderMarkdown('**LLM:** ' + newContent);
    addDeleteButton(lastMessage);
    scrollToBottom();

    if (message.content.endsWith('\n')) {
      elements.inputWrapper.classList.remove('loading');
    }
  }
})();
