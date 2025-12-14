// ===== Offline Support & IndexedDB Setup =====
const DB_NAME = 'ChatAppDB';
const DB_VERSION = 1;
const STORE_NAME = 'chatData';

// Check if we're online or offline
let isOnline = navigator.onLine;

// Listen for online/offline events
window.addEventListener('online', () => {
  isOnline = true;
  console.log('Back online');
  updateOnlineStatus();
  // Optionally sync any pending operations
});

window.addEventListener('offline', () => {
  isOnline = false;
  console.log('Offline');
  updateOnlineStatus();
  // Optionally show an offline indicator to the user
  if (document.getElementById("generate")?.disabled !== true) {
    // Show user that we're offline
    const output = document.getElementById("output");
    if (output) {
      const offlineNotice = document.createElement("div");
      offlineNotice.className = "message system offline-notice";
      offlineNotice.innerHTML = `<strong>🌐 System:</strong><br><div class="content">You are currently offline. Chat history is available, but new messages require connection.</div>`;
      output.appendChild(offlineNotice);
      output.scrollTop = output.scrollHeight;
    }
  }
});

// Function to update UI based on online status
function updateOnlineStatus() {
  const statusIndicator = document.getElementById('onlineStatus');
  if (statusIndicator) {
    statusIndicator.textContent = isOnline ? '● Online' : '○ Offline';
    statusIndicator.className = isOnline ? 'online-status online' : 'online-status offline';
  }

  // Disable/enable the generate button based on online status
  const generateBtn = document.getElementById("generate");
  if (generateBtn) {
    generateBtn.disabled = !isOnline;
    generateBtn.title = isOnline ? 'Send message' : 'Offline - connection required';
  }
}

let db;

// Initialize IndexedDB
function initDB() {
  return new Promise((resolve, reject) => {
    if (db) {
      resolve(db);
      return;
    }

    if (!window.indexedDB) {
      console.warn('IndexedDB not supported');
      resolve(null);
      return;
    }

    const request = indexedDB.open(DB_NAME, DB_VERSION);

    request.onerror = () => {
      console.error('Database error:', request.error);
      // Don't reject, resolve with null to use fallback
      resolve(null);
    };

    request.onsuccess = () => {
      db = request.result;
      
      // Handle unexpected close
      db.onversionchange = () => {
        db.close();
        alert("Database is outdated, please reload the page.");
      };
      
      db.onerror = (event) => {
        console.error("Database error:", event.target.error);
      };
      
      resolve(db);
    };

    request.onupgradeneeded = (event) => {
      const upgradeDb = event.target.result;
      
      // Handle errors during upgrade
      event.target.transaction.onerror = (err) => {
        console.error("Upgrade error:", err);
      };
      
      if (!upgradeDb.objectStoreNames.contains(STORE_NAME)) {
        upgradeDb.createObjectStore(STORE_NAME);
      }
    };
    
    request.onblocked = () => {
      console.warn("Database blocked - close other tabs");
    };
  });
}

// Get item from IndexedDB with fallback
async function getItem(key) {
  try {
    await initDB();
    if (!db) {
      // Fallback to memory storage if IndexedDB is not available
      return getMemoryStorage(key);
    }

    return new Promise((resolve, reject) => {
      const transaction = db.transaction([STORE_NAME], 'readonly');
      const objectStore = transaction.objectStore(STORE_NAME);
      const request = objectStore.get(key);

      request.onsuccess = () => {
        resolve(request.result !== undefined ? request.result : null);
      };

      request.onerror = () => {
        console.warn(`IndexedDB get error for key ${key}:`, request.error);
        // Fallback to memory storage if IndexedDB fails
        resolve(getMemoryStorage(key));
      };
    });
  } catch (error) {
    console.error(`Error getting item ${key} from IndexedDB:`, error);
    // Fallback to memory storage if IndexedDB fails
    return getMemoryStorage(key);
  }
}

// Set item in IndexedDB with fallback
async function setItem(key, value) {
  try {
    await initDB();
    if (!db) {
      // Fallback to memory storage if IndexedDB is not available
      setMemoryStorage(key, value);
      return true;
    }

    return new Promise((resolve, reject) => {
      const transaction = db.transaction([STORE_NAME], 'readwrite');
      const objectStore = transaction.objectStore(STORE_NAME);
      const request = objectStore.put(value, key);

      request.onsuccess = () => {
        resolve(true);
      };

      request.onerror = () => {
        console.warn(`IndexedDB set error for key ${key}:`, request.error);
        // Fallback to memory storage if IndexedDB fails
        setMemoryStorage(key, value);
        resolve(false);
      };
    });
  } catch (error) {
    console.error(`Error setting item ${key} in IndexedDB:`, error);
    // Fallback to memory storage if IndexedDB fails
    setMemoryStorage(key, value);
    return false;
  }
}

// Remove item from IndexedDB with fallback
async function removeItem(key) {
  try {
    await initDB();
    if (!db) {
      // Fallback to memory storage if IndexedDB is not available
      removeMemoryStorage(key);
      return true;
    }

    return new Promise((resolve, reject) => {
      const transaction = db.transaction([STORE_NAME], 'readwrite');
      const objectStore = transaction.objectStore(STORE_NAME);
      const request = objectStore.delete(key);

      request.onsuccess = () => {
        resolve(true);
      };

      request.onerror = () => {
        console.warn(`IndexedDB delete error for key ${key}:`, request.error);
        // Fallback to memory storage if IndexedDB fails
        removeMemoryStorage(key);
        resolve(false);
      };
    });
  } catch (error) {
    console.error(`Error removing item ${key} from IndexedDB:`, error);
    // Fallback to memory storage if IndexedDB fails
    removeMemoryStorage(key);
    return false;
  }
}

// Memory storage as fallback for when IndexedDB isn't available
let memoryStorage = {};

// Initialize memory storage from localStorage on startup
function initializeMemoryStorage() {
  // Try to load all stored keys into memory storage
  for (let i = 0; i < localStorage.length; i++) {
    const key = localStorage.key(i);
    if (key && key.startsWith('fallback_')) {
      try {
        const storedValue = localStorage.getItem(key);
        // Attempt to parse JSON, otherwise store as string
        memoryStorage[key.replace('fallback_', '')] = JSON.parse(storedValue);
      } catch (e) {
        // If JSON parsing fails, store as string
        memoryStorage[key.replace('fallback_', '')] = localStorage.getItem(key);
      }
    }
  }
}

function getMemoryStorage(key) {
  // Try memory first
  if (memoryStorage[key] !== undefined) {
    return memoryStorage[key];
  }

  // Fallback to localStorage
  const fallbackKey = `fallback_${key}`;
  const storedValue = localStorage.getItem(fallbackKey);
  if (storedValue !== null) {
    try {
      return JSON.parse(storedValue);
    } catch (e) {
      return storedValue;
    }
  }
  return null;
}

function setMemoryStorage(key, value) {
  // Store in memory
  memoryStorage[key] = value;

  // Also store in localStorage as persistent fallback
  const fallbackKey = `fallback_${key}`;
  try {
    localStorage.setItem(fallbackKey, JSON.stringify(value));
  } catch (e) {
    // If JSON stringification fails, store as string
    localStorage.setItem(fallbackKey, value);
  }
}

function removeMemoryStorage(key) {
  // Remove from memory
  delete memoryStorage[key];

  // Also remove from localStorage
  const fallbackKey = `fallback_${key}`;
  localStorage.removeItem(fallbackKey);
}

// Initialize memory storage on startup
initializeMemoryStorage();

// ===== Load saved conversation if exists =====
let conversation = [];
let chatHistory = [];
let currentChatId = null;

// Initialize data from IndexedDB on startup
async function initializeData() {
  try {
    await initDB();

    // Load chat history first
    const storedChatHistory = await getItem("chatHistory");
    chatHistory = storedChatHistory ? JSON.parse(storedChatHistory) : [];

    // Load current chat ID
    const storedCurrentChatId = await getItem("currentChatId");
    currentChatId = storedCurrentChatId || null;

    // Load the specific conversation for the current chat, or fallback appropriately
    if (currentChatId) {
      // Find the current chat in chat history
      const currentChat = chatHistory.find(chat => chat.id === currentChatId);
      if (currentChat) {
        // Use the conversation from the current chat
        conversation = currentChat.conversation || [];
      } else {
        // If current chat ID doesn't exist in history, reset it
        currentChatId = null;
      }
    }

    // If there's no current chat ID set or current chat doesn't exist, load the first one
    if (!currentChatId && chatHistory.length > 0) {
      currentChatId = chatHistory[0].id;
      const firstChat = chatHistory[0];
      conversation = firstChat.conversation || [];
    }

    // If there's no current chat and no chat history, create a new chat
    if (!currentChatId) {
      currentChatId = generateChatId();
      chatHistory.push({
        id: currentChatId,
        title: "New Chat",
        conversation: [],
        timestamp: new Date().toISOString()
      });
      conversation = [];
      await saveChatHistory();
    }
  } catch (error) {
    console.error("Error initializing data from IndexedDB:", error);
    // Fallback to empty arrays if IndexedDB fails
    conversation = [];
    chatHistory = [];
    currentChatId = null;
  }
}

// ===== Context limit settings =====
const MAX_USER_MSGS = 10;
const MAX_ASSISTANT_MSGS = 10;
const MAX_TOTAL_MSGS = 21; // 10 user + 10 assistant + 1 new user message

// ===== Helper Functions for Chat History =====
function generateChatId() {
  return 'chat_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9);
}

async function saveChatHistory() {
  await setItem("chatHistory", JSON.stringify(chatHistory));
  await setItem("currentChatId", currentChatId);
}

async function createNewChat() {
  // Save the current conversation before creating a new one
  if (currentChatId && conversation.length > 0) {
    await updateCurrentChatInHistory();
  }

  currentChatId = generateChatId();
  conversation = [];

  // Add the new chat to history
  chatHistory.unshift({
    id: currentChatId,
    title: "New Chat",
    conversation: [],
    timestamp: new Date().toISOString()
  });

  // Keep only the last 20 chats to prevent IndexedDB bloat
  if (chatHistory.length > 20) {
    chatHistory = chatHistory.slice(0, 20);
  }

  await saveChatHistory();
  renderFullConversation();
  updateChatHistoryList();
}

async function updateCurrentChatInHistory() {
  if (!currentChatId) return;

  const chatIndex = chatHistory.findIndex(chat => chat.id === currentChatId);

  if (chatIndex !== -1) {
    // Update the existing chat
    chatHistory[chatIndex].conversation = [...conversation];
    chatHistory[chatIndex].timestamp = new Date().toISOString();

    // If it's a "New Chat" and now has content, update the title based on first message
    if (chatHistory[chatIndex].title === "New Chat" && conversation.length > 0) {
      const firstUserMessage = conversation.find(msg => msg.role === 'user');
      if (firstUserMessage) {
        chatHistory[chatIndex].title = formatChatTitle(firstUserMessage.content);
      }
    }

    await saveChatHistory();
  } else {
    // Create new entry if it doesn't exist
    chatHistory.unshift({
      id: currentChatId,
      title: conversation.length > 0 && conversation[0].content
        ? formatChatTitle(conversation[0].content)
        : "New Chat",
      conversation: [...conversation],
      timestamp: new Date().toISOString()
    });

    // Keep only the last 20 chats
    if (chatHistory.length > 20) {
      chatHistory = chatHistory.slice(0, 20);
    }

    await saveChatHistory();
  }
}

function formatChatTitle(content) {
  // Get the first 30 characters of the first message and add ellipsis if needed
  const title = content.length > 30 ? content.substring(0, 30) + "..." : content;
  // Remove newlines and extra spaces
  return title.replace(/\s+/g, " ").trim();
}

async function loadChat(chatId) {
  const chat = chatHistory.find(chat => chat.id === chatId);

  if (chat) {
    // Save the current conversation before switching
    if (currentChatId && conversation.length > 0) {
      await updateCurrentChatInHistory();
    }

    const sidebar = document.getElementById("sidebar");
    if (sidebar) {
      sidebar.classList.toggle("active");
    }

    currentChatId = chatId;
    conversation = [...chat.conversation];
    await saveChatHistory();
    renderFullConversation();
    updateChatHistoryList();
  }
}

async function deleteChat(chatId) {
  if (confirm("Are you sure you want to delete this chat?")) {
    // Remove the chat from history
    chatHistory = chatHistory.filter(chat => chat.id !== chatId);

    // If we're deleting the current chat, create a new one
    if (currentChatId === chatId) {
      if (chatHistory.length > 0) {
        // Load the first available chat
        currentChatId = chatHistory[0].id;
        conversation = [...chatHistory[0].conversation];
      } else {
        // Create a completely new chat
        await createNewChat();
      }
    }

    await saveChatHistory();
    renderFullConversation();
    updateChatHistoryList();
  }
}

function updateChatHistoryList() {
  const chatHistoryList = document.getElementById('chatHistoryList');
  if (!chatHistoryList) return;

  // Clear existing content AND listeners
  chatHistoryList.innerHTML = '';

  chatHistory.forEach(chat => {
    const chatItem = document.createElement('div');
    chatItem.className = `chat-item ${chat.id === currentChatId ? 'active' : ''}`;
    
    // Use event delegation instead
    chatItem.dataset.chatId = chat.id;
    chatItem.innerHTML = `
      <span class="chat-title">${chat.title}</span>
      <div class="chat-actions">
        <span class="edit-btn" data-action="edit">✎</span>
        <span class="delete-btn" data-action="delete">&times;</span>
      </div>
    `;
    
    chatHistoryList.appendChild(chatItem);
  });
}

// Add single delegated listener
document.getElementById('chatHistoryList')?.addEventListener('click', (e) => {
  const chatItem = e.target.closest('.chat-item');
  if (!chatItem) return;
  
  const chatId = chatItem.dataset.chatId;
  const action = e.target.dataset.action;
  
  if (action === 'edit') {
    e.stopPropagation();
    editChatName(chatId);
  } else if (action === 'delete') {
    e.stopPropagation();
    deleteChat(chatId);
  } else {
    loadChat(chatId);
  }
});

// Add this function to handle editing
async function editChatName(chatId) {
  const chat = chatHistory.find(c => c.id === chatId);
  if (!chat) return;

  const newName = prompt('Enter new chat name:', chat.title);

  if (newName && newName.trim() !== '') {
    chat.title = newName.trim();
    await saveChatHistory();
    updateChatHistoryList();
  }
}

// ===== HTML Escape Helper =====
function escapeHtml(text) {
  if (!text) return "";
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

// ===== Enhanced Markdown Parser with Table Support =====
function parseMarkdown(text) {
  if (!text) return "";

  // Storage for protected content
  const codeBlocks = [];
  const inlineCodes = [];
  const tables = [];

  // ============================================
  // STEP 1a: Extract and protect fenced code blocks first to avoid internal parsing
  // ============================================
  // Match ```lang\ncode\n``` format with a non-greedy approach - require proper opening and closing
  text = text.replace(/(```)([a-zA-Z0-9_+\-.#]+)\s*\n([\s\S]*?)\n?(```)/g, (match, opening, lang, code, closing) => {
    // Only process if we have a proper closing fence and a language specified
    if (closing === '```') {
      // Trim empty lines from start and end of code
      const cleanCode = (code || '').replace(/^\n+|\n+$/g, '');
      const language = lang.trim();

      // Define known languages - if not in this list, don't wrap as code block
      const knownLanguages = [
        'javascript', 'js', 'typescript', 'ts', 'python', 'py', 'java', 'c', 'cpp',
        'csharp', 'cs', 'php', 'html', 'css', 'json', 'xml', 'sql', 'bash', 'sh',
        'yaml', 'yml', 'markdown', 'md', 'ruby', 'rb', 'go', 'rust', 'rs', 'swift',
        'kotlin', 'kt', 'scala', 'perl', 'pl', 'lua', 'r', 'matlab', 'jsx', 'tsx',
        'dart', 'erlang', 'elixir', 'haskell', 'clojure', 'fsharp', 'powershell',
        'shell', 'dockerfile', 'makefile', 'cmake', 'nginx', 'apache', 'diff',
        'ini', 'toml', 'graphql', 'docker', 'sql', 'vim', 'regex', 'apache', 'nginx',
        'armasm', 'avrasm', 'actionscript', 'ada', 'apache', 'applescript', 'arduino',
        'coffeescript', 'd', 'delphi', 'oxygene', 'elixir', 'elm', 'erlang', 'fsharp',
        'gcode', 'golang', 'groovy', 'haml', 'handlebars', 'haskell', 'haxe', 'java',
        'javascript', 'json', 'julia', 'kotlin', 'latex', 'less', 'lisp', 'livescript',
        'lua', 'makefile', 'markdown', 'matlab', 'mathematica', 'nginx', 'objectivec',
        'ocaml', 'perl', 'php', 'powershell', 'python', 'r', 'ruby', 'rust', 'scala',
        'scheme', 'scss', 'shell', 'sql', 'swift', 'tcl', 'typescript', 'verilog',
        'vhdl', 'xml', 'yaml', 'text', 'txt', 'plain'
      ];

      // Only create code block if language is specified AND is a known language
      if (language && knownLanguages.includes(language.toLowerCase())) {
        const placeholder = `__CODEBLOCK_${codeBlocks.length}__`;
        codeBlocks.push({
          language: language.toLowerCase(),
          code: cleanCode
        });
        return placeholder;
      } else {
        // If language is not known or not specified, don't wrap as a code block - return original text
        return match;
      }
    }
    // If no proper closing, return the original match
    return match;
  });

  // ============================================
  // STEP 1b: Extract and protect plain code blocks (no language specified) as plaintext
  // ============================================
  // Match ```\ncode\n``` format (no language specified) - treat these as plaintext code blocks
  text = text.replace(/(```)\s*\n?([\s\S]*?)\n?(```)/g, (match, opening, code, closing) => {
    if (closing === '```') {
      // Trim empty lines from start and end of code
      const cleanCode = (code || '').replace(/^\n+|\n+$/g, '');
      const language = "plaintext"; // Always use plaintext for blocks without language

      const placeholder = `__CODEBLOCK_${codeBlocks.length}__`;
      codeBlocks.push({
        language: language,
        code: cleanCode
      });
      return placeholder;
    }
    // If no proper closing, return the original match
    return match;
  });

  // ============================================
  // STEP 1c: Extract and protect inline code before other parsing to avoid conflicts
  // ============================================
  // Match inline code with backticks that are NOT inside already protected code blocks
  text = text.replace(/(?<!`)`([^`\n]+?)`(?!`)/g, (match, code) => {
    const placeholder = `__INLINECODE_${inlineCodes.length}__`;
    inlineCodes.push(code);
    return placeholder;
  });

  // ============================================
  // STEP 2: Extract and protect tables
  // ============================================
  // Match markdown tables (lines starting and ending with |)
  const tableRegex = /((?:^\s*\|.*\|\s*$\n?)+)/gm;
  text = text.replace(tableRegex, (match) => {
    const lines = match.trim().split('\n').filter(line => line.trim());

    if (lines.length < 2) return match;

    // Check if this is actually a table (has separator line with dashes/colons)
    const hasSeparator = lines.some(line => /^\s*\|[\s\-:|]+\|\s*$/.test(line.trim()));
    if (!hasSeparator) return match;

    const placeholder = `__TABLE_${tables.length}__`;
    tables.push(lines);
    return placeholder;
  });

  // ============================================
  // STEP 3: Extract and protect any remaining inline code (improved)
  // ============================================
  // Match inline code with backticks (more robust) - this handles any that weren't caught earlier
  text = text.replace(/(`+)([^`]+?)\1(?!`)/g, (match, ticks, code) => {
    if (ticks.length % 2 === 1) { // Only odd number of backticks count as inline code
      const placeholder = `__INLINECODE_${inlineCodes.length}__`;
      inlineCodes.push(code);
      return placeholder;
    }
    return match; // Return original if it's an even number (escaped)
  });

  // ============================================
  // STEP 4: Now escape HTML in remaining text
  // ============================================
  let html = escapeHtml(text);

  // ============================================
  // STEP 5: Apply markdown formatting
  // ============================================

  // Headers (# to ######) - must be at start of line, with flexible spacing after hash
  html = html.replace(/^######\s+(.+)$/gm, "<h6>$1</h6>");
  html = html.replace(/^#####\s+(.+)$/gm, "<h5>$1</h5>");
  html = html.replace(/^####\s+(.+)$/gm, "<h4>$1</h4>");
  html = html.replace(/^###\s+(.+)$/gm, "<h3>$1</h3>");
  html = html.replace(/^##\s+(.+)$/gm, "<h2>$1</h2>");
  html = html.replace(/^#\s+(.+)$/gm, "<h1>$1</h1>");

  // Horizontal rules (---, ***, ___) - must be on a line by itself
  html = html.replace(/^\s*(-{3,}|\*{3,}|_{3,})\s*$/gm, "<hr>");

  // Blockquotes (> text) - escaped as &gt;
  html = html.replace(/^&gt;\s?(.+)$/gm, "<blockquote>$1</blockquote>");

  // Unordered lists (- item, * item, + item)
  html = html.replace(/^[\-+*]\s+(.+)$/gm, "<li>$1</li>");

  // Ordered lists (1. item)
  html = html.replace(/^\d+\.\s+(.+)$/gm, "<li>$1</li>");

  // Wrap consecutive <li> in <ul> or <ol>
  html = html.replace(/(<li>.*<\/li>\n?)+/g, (match) => {
    // Check if it contains ordered list pattern
    if (/\d+\.\s/.test(match)) {
      return `<ol>${match}</ol>`;
    } else {
      return `<ul>${match}</ul>`;
    }
  });

  // Bold (**text** or __text__)
  html = html.replace(/\*\*([^*]+?)\*\*/g, "<strong>$1</strong>");

  // Italic (*text* or _text_)
  html = html.replace(/(?<!\*)\*([^\*\n]+?)\*(?!\*)/g, "<em>$1</em>");
  html = html.replace(/(?<!_)_([^\_\n]+?)_(?!_)/g, "<em>$1</em>");

  // Strikethrough (~~text~~)
  html = html.replace(/~~([^~]+?)~~/g, "<del>$1</del>");

  // Links [text](url)
  html = html.replace(/\[([^\]]+)\]\(([^)]+)\)/g,
    '<a href="$2" target="_blank" rel="noopener noreferrer">$1</a>');

  // Images ![alt](url)
  html = html.replace(/!\[([^\]]*)\]\(([^)]+)\)/g,
    '<img src="$2" alt="$1" loading="lazy">');

  // Convert newlines to <br> tags, but preserve paragraph structure
  html = html.replace(/\n\n/g, "</p><p>")
             .replace(/\n/g, "<br>");
  html = `<p>${html}</p>`
             .replace(/<\/p><p>\s*<p>/g, '</p><p>') // Clean up double paragraph tags
             .replace(/<p>\s*<\/p>/g, ''); // Remove empty paragraphs

  // ============================================
  // STEP 6: Restore protected content in the correct order
  // ============================================
  // First restore inline codes
  for (let i = 0; i < inlineCodes.length; i++) {
    const escaped = escapeHtml(inlineCodes[i]);
    html = html.replace(
      new RegExp(`__INLINECODE_${i}__`, 'g'),
      `<code class="inline-code">${escaped}</code>`
    );
  }

  // Then restore tables
  for (let i = 0; i < tables.length; i++) {
    const tableHtml = parseTable(tables[i], inlineCodes);
    html = html.replace(new RegExp(`__TABLE_${i}__`, 'g'), tableHtml);
  }

  // Finally restore code blocks - these contain escaped HTML content
  for (let i = 0; i < codeBlocks.length; i++) {
    const block = codeBlocks[i];
    const escaped = escapeHtml(block.code);
    const langClass = `language-${block.language}`;
    const langDisplay = block.language === "plaintext" ? "text" : block.language;

    const codeHtml = `
      <div class="code-block-wrapper">
        <div class="code-header">
          <span class="code-language">${escapeHtml(langDisplay)}</span>
          <button class="copy-btn" onclick="copyCode(this)" title="Copy code">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect>
              <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path>
            </svg>
            <span>Copy</span>
          </button>
        </div>
        <pre class="code-block"><code class="${langClass}">${escaped}</code></pre>
      </div>`;

    html = html.replace(new RegExp(`__CODEBLOCK_${i}__`, 'g'), codeHtml);
  }

  // Clean up extra <br> tags around block elements
  html = html.replace(/<br>\n?<(div|table|ul|ol|blockquote|h[1-6]|hr|pre)/g, '<$1');
  html = html.replace(/<\/(div|table|ul|ol|blockquote|h[1-6]|pre)><br>/g, '</$1>');

  // Final cleanup
  html = html.replace(/<br><\/p>/g, '</p>')
             .replace(/<p><br>/g, '<p>');

  return html;
}

// ===== Table Parser =====
function parseTable(lines, inlineCodes) {
  if (lines.length < 2) return '';

  let separatorIndex = -1;
  for (let i = 0; i < lines.length; i++) {
    if (/^\|[\s\-:|]+\|$/.test(lines[i].trim())) {
      separatorIndex = i;
      break;
    }
  }

  if (separatorIndex === -1) return lines.join('\n');

  const separatorCells = lines[separatorIndex]
    .split('|')
    .filter(cell => cell.trim() !== '');

  const alignments = separatorCells.map(cell => {
    const trimmed = cell.trim();
    const leftColon = trimmed.startsWith(':');
    const rightColon = trimmed.endsWith(':');

    if (leftColon && rightColon) return 'center';
    if (rightColon) return 'right';
    if (leftColon) return 'left';
    return 'left';
  });

  const headerRows = lines.slice(0, separatorIndex);
  const bodyRows = lines.slice(separatorIndex + 1);

  let tableHtml = '<div class="table-wrapper"><table>';

  if (headerRows.length > 0) {
    tableHtml += '<thead>';
    headerRows.forEach(row => {
      tableHtml += '<tr>';
      const cells = row.split('|').filter((cell, idx, arr) => {
        return !(idx === 0 && cell.trim() === '') &&
               !(idx === arr.length - 1 && cell.trim() === '');
      });

      cells.forEach((cell, idx) => {
        const align = alignments[idx] || 'left';
        // Process markdown within each cell's content (instead of just escaping HTML)
        const cellContent = parseInlineMarkdown(escapeHtml(cell.trim()), inlineCodes);
        tableHtml += `<th style="text-align: ${align}">${cellContent}</th>`;
      });
      tableHtml += '</tr>';
    });
    tableHtml += '</thead>';
  }

  if (bodyRows.length > 0) {
    tableHtml += '<tbody>';
    bodyRows.forEach(row => {
      if (!row.trim()) return;

      tableHtml += '<tr>';
      const cells = row.split('|').filter((cell, idx, arr) => {
        return !(idx === 0 && cell.trim() === '') &&
               !(idx === arr.length - 1 && cell.trim() === '');
      });

      cells.forEach((cell, idx) => {
        const align = alignments[idx] || 'left';
        // Process markdown within each cell's content (instead of just escaping HTML)
        const cellContent = parseInlineMarkdown(escapeHtml(cell.trim()), inlineCodes);
        tableHtml += `<td style="text-align: ${align}">${cellContent}</td>`;
      });
      tableHtml += '</tr>';
    });
    tableHtml += '</tbody>';
  }

  tableHtml += '</table></div>';

  return tableHtml;
}

// ===== Inline Markdown Parser for table cells =====
function parseInlineMarkdown(text, inlineCodes = []) {
  if (!text) return "";

  // Handle inline code placeholders first (these were already extracted)
  // Match __INLINECODE_N__ patterns and convert them back to inline code
  text = text.replace(/__INLINECODE_(\d+)__/g, (match, num) => {
    const codeIndex = parseInt(num);
    if (inlineCodes && Array.isArray(inlineCodes) && codeIndex >= 0 && codeIndex < inlineCodes.length) {
      const escaped = escapeHtml(inlineCodes[codeIndex]);
      return `<code class="inline-code">${escaped}</code>`;
    }
    return match; // Return original if not found
  });

  // Bold (**text** or __text__)
  text = text.replace(/\*\*([^*]+?)\*\*/g, "<strong>$1</strong>");

  // Italic (*text* or _text_)
  text = text.replace(/(?<!\*)\*([^\*\n]+?)\*(?!\*)/g, "<em>$1</em>");
  text = text.replace(/(?<!_)_([^\_\n]+?)_(?!_)/g, "<em>$1</em>");

  // Strikethrough (~~text~~)
  text = text.replace(/~~([^~]+?)~~/g, "<del>$1</del>");

  // Links [text](url)
  text = text.replace(/\[([^\]]+)\]\(([^)]+)\)/g,
    '<a href="$2" target="_blank" rel="noopener noreferrer">$1</a>');

  // Images ![alt](url) - though typically not used in tables
  text = text.replace(/!\[([^\]]*)\]\(([^)]+)\)/g,
    '<img src="$2" alt="$1" loading="lazy">');

  return text;
}

// ===== Debugging & Error Handling =====
function debugLog(message, data = null) {
  if (window.DEBUG_MODE) {
    console.log(`[DEBUG] ${message}`, data || '');
  }
}

function showError(message, error = null) {
  console.error(`[ERROR] ${message}`, error);
  const output = document.getElementById("output");
  const errorDiv = document.createElement("div");
  errorDiv.className = "message assistant error";
  errorDiv.innerHTML = `<strong>🤖 Claude:</strong><br><div class="content error-message">${escapeHtml(message)}</div>`;
  output.appendChild(errorDiv);
  output.scrollTop = output.scrollHeight;
}

// ===== Copy Code Function =====
function copyCode(button) {
  try {
    const wrapper = button.closest('.code-block-wrapper');
    const codeElement = wrapper.querySelector('code');
    const code = codeElement.textContent;

    navigator.clipboard.writeText(code).then(() => {
      const span = button.querySelector('span');
      const originalText = span.textContent;
      span.textContent = 'Copied!';
      button.classList.add('copied');

      setTimeout(() => {
        span.textContent = originalText;
        button.classList.remove('copied');
      }, 2000);
    }).catch(err => {
      console.error('Failed to copy to clipboard:', err);
      fallbackCopy(code);
    });
  } catch (error) {
    console.error('Copy error:', error);
    showError('Failed to copy code: ' + error.message);
  }
}

function fallbackCopy(text) {
  try {
    const textarea = document.createElement('textarea');
    textarea.value = text;
    textarea.style.position = 'fixed';
    textarea.style.opacity = '0';
    document.body.appendChild(textarea);
    textarea.select();
    const success = document.execCommand('copy');
    if (!success) {
      throw new Error('ExecCommand failed');
    }
    alert('Copied to clipboard!');
  } catch (err) {
    console.error('Fallback copy failed:', err);
    alert('Failed to copy code. Please try again.');
  } finally {
    if (document.body.contains(textarea)) {
      document.body.removeChild(textarea);
    }
  }
}

window.copyCode = copyCode;

// ===== Render Functions =====
function renderReplyStreamInit() {
  try {
    const output = document.getElementById("output");
    const container = document.createElement("div");
    container.className = "message assistant streaming";
    container.innerHTML = '<strong>🤖 Claude:</strong><br><div class="content"><em>Thinking...</em></div>';
    output.appendChild(container);
    output.scrollTop = output.scrollHeight;
    return container.querySelector('.content');
  } catch (error) {
    console.error("Error in renderReplyStreamInit:", error);
    showError("Error initializing stream display: " + error.message);
  }
}

function renderReplyStreamUpdate(container, text) {
  try {
    if (!container) {
      throw new Error("Container element is null");
    }

    // Parse markdown and handle any errors
    const parsedHtml = parseMarkdown(text || "");
    container.innerHTML = parsedHtml;

    // Highlight code blocks after parsing
    container.querySelectorAll('pre code').forEach((block) => {
      if (!block.dataset.highlighted) {
        try {
          Prism.highlightElement(block);
          block.dataset.highlighted = 'true';
        } catch (highlightError) {
          console.warn("Prism highlighting failed:", highlightError);
          // Still set as highlighted to prevent repeated attempts on same block
          block.dataset.highlighted = 'true';
        }
      }
    });

    const output = document.getElementById("output");

    // Apply display limits to keep UI responsive
    enforceDisplayLimits(output);

    // output.scrollTop = output.scrollHeight;
  } catch (error) {
    console.error("Error in renderReplyStreamUpdate:", error);
    showError("Error updating stream display: " + error.message);
  }
}

function renderFullConversation() {
  try {
    const output = document.getElementById("output");
    output.innerHTML = "";

    if (conversation.length === 0) return;

    conversation.forEach((msg, index) => {
      try {
        const roleLabel = msg.role === "user" ? "👤 You" : "🤖 Claude";
        const bubble = document.createElement("div");
        bubble.className = `message ${msg.role}`;

        let content = "";
        if (Array.isArray(msg.content)) {
          content = msg.content.map(c => c.text || c).join(" ");
        } else if (typeof msg.content === "string") {
          content = msg.content;
        } else {
          content = String(msg.content);
        }

        bubble.innerHTML = `<strong>${roleLabel}:</strong><br><div class="content">${parseMarkdown(content)}</div>`;
        output.appendChild(bubble);
      } catch (msgError) {
        console.error(`Error rendering message ${index}:`, msgError);
        showError(`Error rendering message: ${msgError.message}`);
      }
    });

    // Apply display limits to keep UI responsive
    enforceDisplayLimits(output);

    // Highlight all code blocks after rendering
    try {
      Prism.highlightAllUnder(output);
    } catch (highlightError) {
      console.warn("Prism highlighting failed:", highlightError);
    }

    output.scrollTop = output.scrollHeight;
  } catch (error) {
    console.error("Error in renderFullConversation:", error);
    showError("Error rendering conversation: " + error.message);
  }
}

// ===== File Save/Load Functions =====
function downloadConversation() {
  try {
    if (conversation.length === 0) {
      alert("No conversation to save!");
      return;
    }
    const data = JSON.stringify(conversation, null, 2);
    const blob = new Blob([data], { type: "application/json" });
    const url = URL.createObjectURL(blob);

    const a = document.createElement("a");
    a.href = url;
    a.download = `conversation-${Date.now()}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  } catch (error) {
    console.error("Error downloading conversation:", error);
    showError("Error saving conversation: " + error.message);
  }
}

async function loadFromFile(file) {
  const reader = new FileReader();
  reader.onload = async (e) => {
    try {
      const loaded = JSON.parse(e.target.result);
      if (Array.isArray(loaded)) {
        // Save the current conversation before loading a new one
        await updateCurrentChatInHistory();

        conversation = loaded;
        await setItem("conversation", JSON.stringify(conversation));
        renderFullConversation();

        // Create a new chat entry for the loaded conversation
        currentChatId = generateChatId();
        const firstUserMessage = conversation.find(msg => msg.role === 'user');
        const title = firstUserMessage
          ? formatChatTitle(firstUserMessage.content)
          : "Loaded Chat";

        chatHistory.unshift({
          id: currentChatId,
          title: title,
          conversation: [...conversation],
          timestamp: new Date().toISOString()
        });

        // Keep only the last 20 chats
        if (chatHistory.length > 20) {
          chatHistory = chatHistory.slice(0, 20);
        }

        await saveChatHistory();
        updateChatHistoryList();
        alert("Conversation loaded successfully!");
      } else {
        throw new Error("Invalid format");
      }
    } catch (err) {
      console.error("Error loading conversation:", err);
      alert("Invalid file format. Please select a valid conversation JSON file.");
    }
  };
  reader.onerror = (error) => {
    console.error("File read error:", error);
    showError("Error reading file: " + error.message);
  };
  reader.readAsText(file);
}

// ===== Context limiter =====
function enforceContextLimits() {
  if (conversation.length <= MAX_TOTAL_MSGS) {
    return; // No need to limit if we're under the total limit
  }

  // Count user and assistant messages
  const userMsgs = conversation.filter(msg => msg.role === 'user');
  const assistantMsgs = conversation.filter(msg => msg.role === 'assistant');

  // If we have too many user messages, remove oldest ones
  if (userMsgs.length > MAX_USER_MSGS) {
    for (let i = 0; i < userMsgs.length - MAX_USER_MSGS; i++) {
      // Find and remove the oldest user message
      const index = conversation.findIndex(msg => msg.role === 'user');
      if (index !== -1) {
        conversation.splice(index, 1);
      }
    }
  }

  // If we have too many assistant messages, remove oldest ones
  if (assistantMsgs.length > MAX_ASSISTANT_MSGS) {
    for (let i = 0; i < assistantMsgs.length - MAX_ASSISTANT_MSGS; i++) {
      // Find and remove the oldest assistant message
      const index = conversation.findIndex(msg => msg.role === 'assistant');
      if (index !== -1) {
        conversation.splice(index, 1);
      }
    }
  }

  // If we still exceed total limit, remove oldest messages until we're under limit
  while (conversation.length > MAX_TOTAL_MSGS) {
    conversation.shift(); // Remove the oldest message
  }
}

// ===== Display limiter for UI =====
const MAX_DISPLAY_MSGS = 50;
function enforceDisplayLimits(outputElement) {
  const messages = outputElement.querySelectorAll('.message');
  if (messages.length > MAX_DISPLAY_MSGS) {
    // Remove the oldest messages from the UI
    for (let i = 0; i < messages.length - MAX_DISPLAY_MSGS; i++) {
      messages[i].remove();
    }
  }
}

// ===== Auto-save =====
let saveTimeout;
async function autoSave() {
  clearTimeout(saveTimeout);
  saveTimeout = setTimeout(async () => {
    try {
      enforceContextLimits();
      await setItem("conversation", JSON.stringify(conversation));
      await saveChatHistory();
    } catch (error) {
      console.error("Error saving:", error);
    }
  }, 1000); // Save after 1 second of inactivity
}

// ===== Initialize on page load =====
document.addEventListener("DOMContentLoaded", async () => {
  try {
    // Initialize data from IndexedDB
    await initializeData();

    // Initialize debug mode from URL parameter or IndexedDB
    const urlParams = new URLSearchParams(window.location.search);
    const storedDebugMode = await getItem('debugMode');
    window.DEBUG_MODE = urlParams.get('debug') === 'true' || storedDebugMode === 'true';

    renderFullConversation();
    updateChatHistoryList();
    updateOnlineStatus(); // Update the online status indicator
  } catch (error) {
    console.error("Error initializing app:", error);
    showError("Error initializing application: " + error.message);
  }
});

async function sendMessage() {
  const generateBtn = document.getElementById("generate");
  
  try {
    generateBtn.disabled = true;
    
    try {
    const promptEl = document.getElementById("prompt");
    const prompt = promptEl.value.trim();
    if (!prompt) return;

    // Check if we're online before attempting API call
    if (!isOnline) {
      showError("You are currently offline. Please reconnect to send messages.");
      return;
    }

    const model = document.getElementById("model").value;

    // Add user message to conversation
    conversation.push({
      role: "user",
      content: prompt
    });

    // Enforce context limits before proceeding
    enforceContextLimits();
    await autoSave();
    renderFullConversation();
    promptEl.value = "";
    promptEl.style.height = 'auto';
    promptEl.style.height = Math.min(promptEl.scrollHeight, 200) + 'px';

    const contentContainer = renderReplyStreamInit();
    if (!contentContainer) {
      throw new Error("Failed to initialize stream container");
    }

    // Call the AI API
    const response = await puter.ai.chat(conversation, { model, stream: true });

    let reply = "";
    for await (const part of response) {
      if (part?.text) {
        reply += part.text;
        renderReplyStreamUpdate(contentContainer, reply);
      }
    }

    console.log(reply);

    // Add AI response to conversation
    conversation.push({
      role: "assistant",
      content: reply
    });

    // Enforce context limits again after adding assistant response
    enforceContextLimits();
    await autoSave();
    await updateCurrentChatInHistory(); // Update chat history after conversation

    contentContainer.parentElement.classList.remove('streaming');
  } catch (err) {
    console.error("AI request error:", err);
    const output = document.getElementById("output");
    if (output && output.lastChild) {
      const lastChild = output.lastChild.querySelector('.content');
      if (lastChild) {
        // Check if this is an offline error
        if (err.message && (err.message.includes("offline") || err.message.includes("Network connection"))) {
          lastChild.innerHTML = `<span class="error-message">⚠️ ${escapeHtml("You are currently offline. Please reconnect to continue.")}</span>`;
        } else {
          lastChild.innerHTML = `<span class="error-message">Error: ${escapeHtml(err.message || "Unknown error")}</span>`;
        }
      }
    }
  }
    
  } finally {
    generateBtn.disabled = false;
  }
}

// ===== Event Listeners =====
document.getElementById("generate")?.addEventListener("click", async () => {
  await sendMessage()
});

document.getElementById("newChat")?.addEventListener("click", async () => {
  await createNewChat();
});

document.getElementById("clearCurrentChat")?.addEventListener("click", async () => {
  try {
    if (conversation.length > 0) {
      if (!confirm("Clear current chat? All messages will be deleted from this chat.")) {
        return;
      }
    }
    conversation = [];
    await removeItem("conversation");
    document.getElementById("output").innerHTML = "";
    await updateCurrentChatInHistory(); // Update the chat history with the cleared conversation
    updateChatHistoryList();
  } catch (error) {
    console.error("Error clearing chat:", error);
    showError("Error clearing chat: " + error.message);
  }
});

document.getElementById("newChatBtn")?.addEventListener("click", async () => {
  await createNewChat();
});

document.getElementById("saveLocal")?.addEventListener("click", downloadConversation);

document.getElementById("loadLocal")?.addEventListener("click", () => {
  document.getElementById("fileInput").click();
});

document.getElementById("fileInput")?.addEventListener("change", async (e) => {
  try {
    if (e.target.files[0]) {
      await loadFromFile(e.target.files[0]);
      e.target.value = "";
    }
  } catch (error) {
    console.error("Error handling file input:", error);
    showError("Error loading file: " + error.message);
  }
});

document.getElementById("prompt")?.addEventListener("keydown", (e) => {
  // Use Ctrl+Enter to submit
  if (e.ctrlKey && e.key === "Enter") {
    e.preventDefault(); // Prevent default behavior
    document.getElementById("generate")?.click();
  }
  // Use Escape to clear the prompt
  else if (e.key === "Escape") {
    e.preventDefault();
    document.getElementById("prompt").value = "";
  }
});

// ===== Sidebar Toggle Functionality =====
document.getElementById("toggleSidebar")?.addEventListener("click", () => {
  const sidebar = document.getElementById("sidebar");
  if (sidebar) {
    sidebar.classList.toggle("active");
  }
});

// Close sidebar when clicking outside of it on mobile
document.addEventListener("click", (e) => {
  const sidebar = document.getElementById("sidebar");
  const toggleBtn = document.getElementById("toggleSidebar");

  if (window.innerWidth <= 768 &&
      sidebar &&
      toggleBtn &&
      sidebar.classList.contains("active") &&
      !sidebar.contains(e.target) &&
      e.target !== toggleBtn) {
    sidebar.classList.remove("active");
  }
});

// Update sidebar state when window is resized
window.addEventListener("resize", () => {
  const sidebar = document.getElementById("sidebar");
  if (window.innerWidth > 768 && sidebar) {
    sidebar.classList.remove("active"); // Remove active class on larger screens
  }
});

// Register service worker
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js')
      .then(registration => {
        console.log('SW registered:', registration);
      })
      .catch(error => {
        console.log('SW registration failed:', error);
      });
  });
}

window.addEventListener('error', (event) => {
  console.error('Global error:', event.error);
  showError('An unexpected error occurred. Please refresh the page.');
});

window.addEventListener('unhandledrejection', (event) => {
  console.error('Unhandled promise rejection:', event.reason);
  showError('An unexpected error occurred. Please try again.');
});
