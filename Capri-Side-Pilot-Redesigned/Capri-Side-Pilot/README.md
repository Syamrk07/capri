# Capri — Side Pilot (Local Ollama Edition)

Capri is a Chrome side-panel assistant that reads the webpage you are viewing and asks a local Ollama model to explain it. It has **Coach** and **Answer** modes. It runs locally and does not need a cloud API key.

## What works with your current setup

You already installed `qwen2.5-coder:7b`. This build uses that model for page text, questions, and coaching immediately. Screenshot analysis is optional and uses `qwen2.5vl:7b`; the extension automatically enables its screenshot checkbox after that vision model is installed.

## Requirements

- Windows 10/11
- Google Chrome 116 or newer
- Python 3.10+ (Python 3.14 is supported; no third-party Python packages are required)
- Ollama installed and running
- `qwen2.5-coder:7b` installed (already on your computer)

## Install and run

1. Extract `Capri-Side-Pilot.zip` somewhere permanent, such as `Documents\Capri-Side-Pilot`.
2. Double-click **`start-capri.bat`** in the extracted `Capri-Side-Pilot` folder. Keep the black terminal window open. It starts the local backend at `http://127.0.0.1:8787`.
3. Open Chrome and go to `chrome://extensions`.
4. Turn on **Developer mode**.
5. Click **Load unpacked**.
6. Select the **`extension`** folder inside `Capri-Side-Pilot` — the folder that directly contains `manifest.json`.
7. Pin **Capri — Side Pilot** to the Chrome toolbar and click it to open the side panel.
8. Open a normal website and click **Scan this page**, or type a question. The status should show `ready · qwen2.5-coder:7b`.

**Important:** Do not select the outer `Capri-Side-Pilot` folder in Load unpacked. Select its `extension` subfolder.

## Optional screenshot understanding

To let Capri inspect screenshots as well as page text, double-click `install-vision-model.bat` once. It downloads `qwen2.5vl:7b` (several GB). Reopen or refresh the extension after the download. The screenshot checkbox will enable itself when the vision model is available. You do not need to download it to use text-based page help.

## Features

- **Coach:** explains what the page is asking and guides you through the next step.
- **Answer:** answers questions about the current webpage directly.
- **Page text:** reads visible webpage text and selected text.
- **Optional screenshot:** sends the visible tab screenshot to the local vision model when enabled.
- **Conversation context:** keeps recent turns in the current panel session.
- **Local processing:** page content is sent to the local Capri backend and then to Ollama on your computer.

## Troubleshooting

- **`start-capri.bat` is not recognized:** double-click it in File Explorer, or open PowerShell in the extracted outer `Capri-Side-Pilot` folder and run `.\start-capri.bat`.
- **Backend offline:** make sure the `start-capri.bat` terminal is still open. Visit `http://127.0.0.1:8787/health` to inspect backend status.
- **Ollama offline:** open the Ollama app. Run `ollama list` in PowerShell. Do not start a second `ollama serve` if Ollama is already running.
- **Model missing:** run `ollama pull qwen2.5-coder:7b` for text use. Screenshot analysis additionally needs `ollama pull qwen2.5vl:7b`.
- **Chrome internal page cannot be scanned:** open a normal website; Chrome blocks extensions from reading internal pages such as `chrome://extensions`.
- **Screenshot checkbox disabled:** install the optional vision model with `install-vision-model.bat`.
- **Port 8787 is occupied:** set `SIDEPILOT_PORT=8788` in `server/.env` and change `SERVER` in `extension/sidepanel.js` to `http://127.0.0.1:8788`.

## Privacy and safety

The backend binds only to `127.0.0.1` (your own computer). Page text and an optional screenshot are sent to your local Ollama server. Capri only analyzes and advises; it does not click buttons, submit forms, or make purchases. Avoid scanning pages containing passwords, payment details, or other sensitive information.

## Project layout

```text
Capri-Side-Pilot/
  extension/                 Chrome extension (load this folder in Chrome)
    manifest.json
    background.js
    sidepanel.html
    sidepanel.css
    sidepanel.js
  server/                    Python local backend
    server.py
    .env.example
  start-capri.bat             Starts the backend
  install-vision-model.bat    Optional screenshot model installer
  README.md
```
