# Browser-Based-Client-Side-Multi-LLM

Browser-based, privacy-first demo for running *multiple* ultra-light models in the browser.
This repo demonstrates:

- Selecting from multiple small models
- Loading models and reporting progress
- Running model inference **inside a Web Worker** so the UI stays responsive
- Streaming outputs for text-generation
- Cancellation and basic error handling

> **Important:** this project uses `@xenova/transformers` (via CDN) to load Hugging Face / Xenova model packages into the browser. Model files must be reachable from the browser (Hugging Face, GitHub Pages, S3, etc). See below for usage tips.

## Files

- `index.html` – UI skeleton
- `style.css` – styling
- `script.js` – main thread UI logic and worker comms
- `modelWorker.js` – module web worker: imports `@xenova/transformers`, loads pipeline and performs inference
- `README.md` – this file

## How to run locally

1. Clone the repo:
   ```bash
   git clone https://github.com/<you>/multi-model-llm-browser-deployment.git
   cd multi-model-llm-browser-deployment
