@echo off
setlocal
echo This optional download enables screenshot understanding in Capri.
echo Model: qwen2.5vl:7b (several GB)
echo Your installed qwen2.5-coder:7b already works for page text and questions.
echo.
ollama pull qwen2.5vl:7b
if errorlevel 1 (
  echo.
  echo Download failed. Make sure Ollama is installed and running.
  pause
  exit /b 1
)
echo.
echo Vision model installed. Restart Capri to refresh its status.
pause
