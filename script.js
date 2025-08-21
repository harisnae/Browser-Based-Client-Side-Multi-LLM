// script.js (main UI)
// This file creates a module web worker and handles UI updates
import MODEL_CONFIGS_RAW from './model-configs-placeholder.js'; // optional: for modularity (not required). We'll inline.

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

// UI elements
const elements = {
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
let isGenerating = false;
let loadedModelKey = null;
let assistantContentEl = null;

// start worker
function startWorker() {
  if (worker) return;
  worker = new Worker('./modelWorker.js', { type: 'module' });

  worker.addEventListener('message', (ev) => {
    const msg = ev.data;
    switch (msg.type) {
      case 'progress':
        elements.progressContainer.style.display = 'block';
        updateProgress(msg.progress);
        updateStatus(`Loading model: ${Math.round(msg.progress * 100)}%`);
        break;

      case 'ready':
        updateProgress(1);
        setTimeout(() => {
          elements.progressContainer.style.display = 'none';
        }, 700);
        setStatus('Model loaded — ready for inference!');
        loadedModelKey = msg.modelKey;
        elements.currentModel.textContent = loadedModelKey;
        elements.generateBtn.disabled = false;
        break;

      case 'chunk':
        // streaming text
        if (assistantContentEl) assistantContentEl.textContent = (assistantContentEl.textContent || '') + msg.text;
        break;

      case 'done':
        setStatus('Generation complete');
        finishGeneration();
        break;

      case 'result':
        // used for classification/feature extraction or non-streaming pipelines
        handleFinalResult(msg.result);
        finishGeneration();
        break;

      case 'aborted':
        setStatus('Generation aborted');
        if (assistantContentEl) assistantContentEl.textContent += '\n\n[Cancelled]';
        finishGeneration();
        break;

      case 'error':
        setStatus(`Error: ${msg.message}`);
        console.error('Worker error:', msg.message);
        finishGeneration();
        break;

      default:
        console.log('Unknown worker message', msg);
        break;
    }
  });
}
startWorker();

// helpers
function updateModelInfo(modelKey) {
  if (!modelKey || !MODEL_CONFIGS[modelKey]) {
    elements.modelInfo.style.display = 'none';
    return;
  }
  const cfg = MODEL_CONFIGS[modelKey];
  elements.modelParams.textContent = cfg.params;
  elements.modelType.textContent = cfg.type;
  elements.modelSize.textContent = cfg.size;
  elements.modelTask.textContent = cfg.task;
  elements.modelDescription.textContent = cfg.description;
  elements.modelInfo.style.display = 'block';
}

function updateProgress(p) {
  const percentage = Math.round(Math.max(0, Math.min(1, p)) * 100);
  elements.progressFill.style.width = `${percentage}%`;
  elements.progressText.textContent = `${percentage}%`;
}

function updateStatus(s) {
  elements.currentStatus.innerHTML = `<div class="spinner"></div>${s}`;
}
function setStatus(s) {
  elements.currentStatus.textContent = s;
}

function addMessage(role, content) {
  const messageDiv = document.createElement('div');
  messageDiv.className = `message ${role}-message`;

  const avatar = document.createElement('div'); avatar.className = 'message-avatar';
  avatar.textContent = role === 'user' ? 'U' : 'AI';

  const messageContent = document.createElement('div'); messageContent.className = 'message-content';
  messageContent.textContent = content;

  messageDiv.appendChild(avatar);
  messageDiv.appendChild(messageContent);
  elements.chatHistory.appendChild(messageDiv);
  elements.chatHistory.scrollTop = elements.chatHistory.scrollHeight;

  return messageContent;
}

function handleFinalResult(result) {
  // result could be an array or structured object depending on pipeline
  if (!assistantContentEl) {
    assistantContentEl = addMessage('assistant', '');
  }
  if (Array.isArray(result)) {
    // heuristics: sentiment returns array of objects, embeddings return arrays
    if (result[0] && result[0].label) {
      // sentiment
      assistantContentEl.textContent = `Sentiment: ${result[0].label} (${(result[0].score * 100).toFixed(1)}%)`;
    } else if (Array.isArray(result[0])) {
      assistantContentEl.textContent = `Embedding vector length: ${result[0].length}`;
    } else if (result[0].generated_text) {
      assistantContentEl.textContent = result[0].generated_text;
    } else {
      assistantContentEl.textContent = JSON.stringify(result).slice(0, 1000);
    }
  } else if (result.generated_text) {
    assistantContentEl.textContent = result.generated_text;
  } else {
    assistantContentEl.textContent = JSON.stringify(result).slice(0, 1000);
  }
}

function finishGeneration() {
  isGenerating = false;
  elements.generateBtn.disabled = false;
  elements.cancelBtn.style.display = 'none';
  elements.userInput.disabled = false;
}

// events
elements.modelSelect.addEventListener('change', async (e) => {
  const modelKey = e.target.value;
  updateModelInfo(modelKey);
  if (!modelKey) {
    setStatus('Select a model to load');
    return;
  }
  setStatus('Preparing to load selected model...');
  elements.generateBtn.disabled = true;
  elements.progressContainer.style.display = 'block';
  updateProgress(0);

  // send load request to worker
  const cfg = MODEL_CONFIGS[modelKey];
  worker.postMessage({ type: 'loadModel', modelKey, pipeline: cfg.pipeline });
});

elements.generateBtn.addEventListener('click', () => {
  if (isGenerating) return;
  const input = elements.userInput.value.trim();
  if (!input) {
    setStatus('Please enter text first.');
    return;
  }
  const modelKey = elements.modelSelect.value;
  if (!modelKey) {
    setStatus('Choose a model first.');
    return;
  }

  // create a fresh assistant bubble for results / streaming
  assistantContentEl = addMessage('assistant', '');

  // start generation
  isGenerating = true;
  elements.generateBtn.disabled = true;
  elements.cancelBtn.style.display = 'inline-flex';
  elements.userInput.disabled = true;
  setStatus('Generating response...');

  const cfg = MODEL_CONFIGS[modelKey];
  worker.postMessage({
    type: 'generate',
    input,
    pipelineType: cfg.pipeline,
    options: {
      max_new_tokens: 150,
      temperature: 0.7
    }
  });
});

elements.cancelBtn.addEventListener('click', () => {
  if (!isGenerating) return;
  worker.postMessage({ type: 'abort' });
});

elements.clearBtn.addEventListener('click', () => {
  elements.chatHistory.innerHTML = '';
  setStatus('Cleared');
});
