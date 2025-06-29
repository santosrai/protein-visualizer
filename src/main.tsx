import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { ErrorBoundary } from './components/ErrorBoundary.tsx'
import { logger } from './utils/logger.ts'
import './index.css'
import App from './App.tsx'

// Configure the custom logger
logger.configure({
  enabled: true,
  level: 2, // INFO level - change to 3 for DEBUG, 1 for WARN only, 0 for ERROR only
  timestamp: true,
  colors: true,
  prefix: '[🧬 Protein Visualizer]',
  categories: ['MOLSTAR', 'SELECTION', 'VIEWER', 'INFO', 'WARN', 'ERROR', 'DEBUG'],
  maxHistory: 500
});

// Log startup
logger.info('🚀 Application starting...');

// Development helpers - available globally in dev mode
if (import.meta.env.DEV) {
  (window as any).logger = logger;
  (window as any).setLogLevel = (level: number) => logger.setLevel(level);
  (window as any).toggleLogs = () => {
    const config = logger.getConfig();
    if (config.enabled) {
      logger.disable();
      console.log('📵 Logging disabled');
    } else {
      logger.enable();
      console.log('📱 Logging enabled');
    }
  };
  (window as any).exportLogs = () => {
    const logs = logger.exportLogs();
    console.log('📋 Exported logs to clipboard');
    navigator.clipboard?.writeText(logs);
    return logs;
  };
  
  logger.info('🛠️ Development mode - Logger utilities available globally');
  logger.info('📝 Use window.logger, window.setLogLevel(level), window.toggleLogs(), window.exportLogs()');
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ErrorBoundary>
      <App />
    </ErrorBoundary>
  </StrictMode>,
)