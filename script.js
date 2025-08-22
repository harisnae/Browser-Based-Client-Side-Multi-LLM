// script.js — Main UI logic for browser-based LLMs

// --- Model Configuration ---
const MODEL_CONFIGS = {
  'Xenova/blenderbot_small-90M': {
    params: '90M',
    type: 'BlenderBot',
    size: '~180MB',
    task: 'Conversational AI',
    description: 'Small conversational model.',
    pipeline: 'text2text-generation'
  },
  'Xenova/distilbert-base-uncased-finetuned-sst-2-english': {
    params: '66M',
    type: 'DistilBERT',
    size: '120MB',
    task: 'Sentiment Analysis',
    description: 'Fine-tuned DistilBERT for sentiment.',
    pipeline: 'sentiment-analysis'
  },
  'Xenova/all-MiniLM-L6-v2': {
    params: '22M',
    type: 'MiniLM',
    size: '45MB',
    task: 'Text Embeddings',
    description: 'Lightweight sentence embeddings.',
    pipeline: 'feature-extraction'
  },
  'Xenova/t5-small': {
    params: '60M',
    type: 'T5',
    size: '120MB',
    task: 'Text-to-text (T5)',
    description: 'T5 small for text-to-text tasks.',
    pipeline: 'text2text-generation'
  },
  'Xenova/gpt2': {
    params: '124M',
    type: 'GPT-2',
    size: '250MB',
    task: 'Text Generation',
    description: 'GPT-2 small for creative generation.',
    pipeline: 'text-generation'
  }
};

// --- UI Elements ---
const el = {
  modelSelect: document.getElementById('modelSelect'),
  modelInfo: document.getElementById('modelInfo'),
  modelParams: document.getElementById('modelParams'),
  modelType: document.getElementById('modelType'),
  modelSize: document.getElementById('modelSize'),
  modelTask: document.getElementById('modelTask'),
  modelDescription: document.getElementById('modelDescription'),
  currentModel: document.getElementById('currentModel'),
  chatHistory: document.getElementById('chatHistory'),
  userInput: document.getElementById('userInput'),
  generateBtn: document.getElementById('generateBtn'),
  cancelBtn: document.getElementById('cancelBtn'),
  clearBtn: document.getElementById('clearBtn'),
  currentStatus: document.getElementById('currentStatus'),
  progressContainer: document.getElementById('progressContainer'),
  progressFill: document.getElementById('progressFill'),
  progressText: document.getElementById('progressText'),
};

let worker = null;
let loadedModelKey = null;
let isGenerating = false;
let assistantContentEl = null;

// --- Worker Setup ---
function startWorker() {
  if (worker) return;
  worker = new Worker('./modelWorker.js', { type: 'module' });

  worker.onmessage = (ev) => {
    const msg = ev.data;
    switch (msg.type) {
      case 'progress':
        el.progressContainer.style.display = 'block';
        updateProgress(msg.progress);
        updateStatus(`Loading model: ${Math.round(msg.progress * 100)}%`);
        break;

      case 'ready':
        updateProgress(1);
        setTimeout(() => el.progressContainer.style.display = 'none', 500);
        setStatus('Model loaded — ready for inference!');
        loadedModelKey = msg.modelKey;
        el.currentModel.textContent = loadedModelKey;
        el.generateBtn.disabled = false;
        break;

      case 'chunk':
        if (assistantContentEl) {
          assistantContentEl.textContent += msg.text;
        }
        break;

      case 'done':
        setStatus('Generation complete');
        finishGeneration();
        break;

      case 'result':
        displayResult(msg.result);
        finishGeneration();
        break;

      case 'aborted':
        setStatus('Generation cancelled');
        finishGeneration();
        break;

      case 'error':
        setStatus(`Error: ${msg.message}`);
        finishGeneration();
        break;
    }
  };
}

// --- Model Selection ---
el.modelSelect.addEventListener('change', async () => {
  const key = el.modelSelect.value;
  if (!key) return;

  const cfg = MODEL_CONFIGS[key];
  el.modelParams.textContent = cfg.params;
  el.modelType.textContent = cfg.type;
  el.modelSize.textContent = cfg.size;
  el.modelTask.textContent = cfg.task;
  el.modelDescription.textContent = cfg.description;
  el.modelInfo.style.display = 'block';

  el.generateBtn.disabled = true;
  el.currentStatus.textContent = 'Loading model...';
  startWorker();

  worker.postMessage({ type: 'loadModel', modelKey: key, pipeline: cfg.pipeline });
});

// --- Generate Button ---
el.generateBtn.addEventListener('click', () => {
  const input = el.userInput.value.trim();
  if (!input || !loadedModelKey || isGenerating) return;

  const pipeline = MODEL_CONFIGS[loadedModelKey].pipeline;
  const chatEl = addChatBubble('user', input);
  assistantContentEl = addChatBubble('assistant', '');

  isGenerating = true;
  el.generateBtn.disabled = true;
  el.cancelBtn.style.display = 'inline-block';
  updateStatus('Generating...');

  worker.postMessage({ type: 'generate', input, pipelineType: pipeline });
  
// Clear the input field after sending the message
el.userInput.value = '';
});

// --- Cancel Button ---
el.cancelBtn.addEventListener('click', () => {
  if (!isGenerating) return;
  worker.postMessage({ type: 'abort' });
});

// --- Clear Chat ---
el.clearBtn.addEventListener('click', () => {
  el.chatHistory.innerHTML = '<div class="current-status"><div class="status-text">Welcome! Select a model to begin.</div></div>';
  assistantContentEl = null;
});

// --- Helper Functions ---
function addChatBubble(role, text) {
  const div = document.createElement('div');
  div.className = `chat-bubble ${role}`;
  div.textContent = text;
  el.chatHistory.appendChild(div);
  el.chatHistory.scrollTop = el.chatHistory.scrollHeight;
  return div;
}

function displayResult(result) {
  if (Array.isArray(result) && typeof result[0] === 'object') {
    // Check if the array contains objects with 'generated_text'
    if (result[0].hasOwnProperty('generated_text')) {
      assistantContentEl.textContent = result[0].generated_text;
    } else {
      assistantContentEl.textContent = JSON.stringify(result, null, 2);
    }
  } else {
    assistantContentEl.textContent = String(result);
  }
}

function updateProgress(p) {
  el.progressFill.style.width = `${p * 100}%`;
  el.progressText.textContent = `${Math.round(p * 100)}%`;
}

function updateStatus(msg) {
  el.currentStatus.textContent = msg;
}

function setStatus(msg) {
  el.currentStatus.textContent = msg;
  el.generateBtn.disabled = !loadedModelKey;
  el.cancelBtn.style.display = 'none';
  isGenerating = false;
}

function finishGeneration() {
  isGenerating = false;
  el.generateBtn.disabled = !loadedModelKey;
  el.cancelBtn.style.display = 'none';
}
