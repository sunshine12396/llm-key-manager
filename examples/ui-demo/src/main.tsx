import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App.tsx'
import './index.css'
import { LLMKeyManagerProvider, getProviderAdapter } from 'llm-key-manager'

try {
  getProviderAdapter('openai').baseUrl = '/api/openai/v1';
  getProviderAdapter('anthropic').baseUrl = '/api/anthropic/v1';
  getProviderAdapter('gemini').baseUrl = '/api/gemini';
} catch (e) {
  console.error('Failed to configure proxy baseUrls:', e);
}

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <LLMKeyManagerProvider>
      <App />
    </LLMKeyManagerProvider>
  </React.StrictMode>,
)
