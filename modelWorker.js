// modelWorker.js (module worker)
let pipelineFactory = null;       // function returned from import
let currentPipeline = null;       // the pipeline instance for the loaded model
let currentModelKey = null;
let currentAbortController = null;

self.addEventListener('message', async (ev) => {
  const msg = ev.data;
  try {
    switch (msg.type) {
      case 'loadModel':
        await handleLoadModel(msg);
        break;

      case 'generate':
        await handleGenerate(msg);
        break;

      case 'abort':
        if (currentAbortController) {
          currentAbortController.abort();
        }
        break;

      default:
        // ignore
        break;
    }
  } catch (err) {
    self.postMessage({ type: 'error', message: err?.message || String(err) });
  }
});

async function ensureTransformersImported() {
  if (pipelineFactory) return;
  // Import transformers package inside the worker
  const mod = await import('https://cdn.jsdelivr.net/npm/@xenova/transformers@2.10.0');
  pipelineFactory = mod.pipeline;
}

async function handleLoadModel({ modelKey, pipeline }) {
  if (!modelKey) {
    self.postMessage({ type: 'error', message: 'No model key provided to worker.' });
    return;
  }

  // If already loaded same model, return ready
  if (currentModelKey === modelKey && currentPipeline) {
    self.postMessage({ type: 'ready', modelKey });
    return;
  }

  try {
    await ensureTransformersImported();
    self.postMessage({ type: 'progress', progress: 0.01 });

    // request pipeline and load model weights; forward progress updates
    currentPipeline = await pipelineFactory(pipeline, modelKey, {
      progress_callback: (p) => {
        // send 0..1 progress
        self.postMessage({ type: 'progress', progress: p });
      }
    });

    currentModelKey = modelKey;
    self.postMessage({ type: 'ready', modelKey });
  } catch (err) {
    currentPipeline = null;
    currentModelKey = null;
    self.postMessage({ type: 'error', message: err?.message || String(err) });
  }
}

async function handleGenerate({ input, pipelineType, options = {} }) {
  if (!currentPipeline) {
    self.postMessage({ type: 'error', message: 'No model loaded' });
    return;
  }

  // create a new abort controller for this run
  currentAbortController = new AbortController();
  const signal = currentAbortController.signal;

  try {
    // two kinds of pipelines: streaming text generation OR single-call classification/embeddings
    if (pipelineType === 'sentiment-analysis' || pipelineType === 'feature-extraction') {
      // not streaming
      const result = await currentPipeline(input, options);
      self.postMessage({ type: 'result', result });
    } else if (pipelineType === 'text-generation' || pipelineType === 'text2text-generation') {
      // streaming supported by transformers: we call with stream: true and iterate
      const resultIter = await currentPipeline(input, {
        ...options,
        signal,
        stream: true
      });

      // If resultIter is not async iterable, handle fallback:
      if (typeof resultIter[Symbol.asyncIterator] !== 'function') {
        // Some pipeline implementations return an array immediately
        self.postMessage({ type: 'result', result: resultIter });
      } else {
        for await (const upd of resultIter) {
          // send partial text
          // many pipeline implementations include upd.generated_text as cumulative text
          const text = upd.generated_text ?? '';
          self.postMessage({ type: 'chunk', text });
        }
        self.postMessage({ type: 'done' });
      }
    } else {
      // fallback: call pipeline normally
      const result = await currentPipeline(input, { ...options, signal });
      self.postMessage({ type: 'result', result });
    }
  } catch (err) {
    if (err?.name === 'AbortError') {
      self.postMessage({ type: 'aborted' });
    } else {
      self.postMessage({ type: 'error', message: err?.message || String(err) });
    }
  } finally {
    currentAbortController = null;
  }
}
