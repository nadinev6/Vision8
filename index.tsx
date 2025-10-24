import React from 'react';
import ReactDOM from 'react-dom/client';
import './components/ui/globals.css';
import App from './App';
import ErrorBoundary from './components/ErrorBoundary';

// Debug environment variables
console.log("=== Environment Debug ===");
console.log("VITE_GEMINI_API_KEY:", import.meta.env?.VITE_GEMINI_API_KEY);
console.log("All env vars:", import.meta.env);

const rootElement = document.getElementById('root');
if (!rootElement) {
  throw new Error("Could not find root element to mount to");
}

const root = ReactDOM.createRoot(rootElement);
root.render(
  <React.StrictMode>
    <ErrorBoundary>
      <App />
    </ErrorBoundary>
  </React.StrictMode>
);
