interface LogLevel {
  name: string;
  level: number;
  color: string;
  emoji: string;
}

interface LogConfig {
  enabled: boolean;
  level: number;
  timestamp: boolean;
  colors: boolean;
  prefix: string;
  categories: string[];
  maxHistory: number;
}

interface LogEntry {
  timestamp: Date;
  level: LogLevel;
  category: string;
  message: string;
  data?: any[];
}

class CustomLogger {
  private static instance: CustomLogger;
  private config: LogConfig;
  private history: LogEntry[] = [];
  private originalConsole: Console;

  // Log levels
  private levels: Record<string, LogLevel> = {
    ERROR: { name: 'ERROR', level: 0, color: '#ff4444', emoji: '❌' },
    WARN: { name: 'WARN', level: 1, color: '#ffaa00', emoji: '⚠️' },
    INFO: { name: 'INFO', level: 2, color: '#4488ff', emoji: 'ℹ️' },
    DEBUG: { name: 'DEBUG', level: 3, color: '#888888', emoji: '🐛' },
    TRACE: { name: 'TRACE', level: 4, color: '#666666', emoji: '🔍' },
    MOLSTAR: { name: 'MOLSTAR', level: 2, color: '#00aa88', emoji: '🧬' },
    SELECTION: { name: 'SELECTION', level: 2, color: '#ff8844', emoji: '🎯' },
    VIEWER: { name: 'VIEWER', level: 2, color: '#8844ff', emoji: '👁️' }
  };

  private constructor() {
    // Store original console methods
    this.originalConsole = { ...console };
    
    // Default configuration
    this.config = {
      enabled: true,
      level: 2, // INFO level by default
      timestamp: true,
      colors: true,
      prefix: '[Protein Visualizer]',
      categories: ['MOLSTAR', 'SELECTION', 'VIEWER', 'INFO', 'WARN', 'ERROR'],
      maxHistory: 1000
    };

    this.overrideConsole();
  }

  public static getInstance(): CustomLogger {
    if (!CustomLogger.instance) {
      CustomLogger.instance = new CustomLogger();
    }
    return CustomLogger.instance;
  }

  // Configure the logger
  public configure(config: Partial<LogConfig>): void {
    this.config = { ...this.config, ...config };
  }

  // Get current configuration
  public getConfig(): LogConfig {
    return { ...this.config };
  }

  // Override console methods
  private overrideConsole(): void {
    // Override console.log
    console.log = (...args: any[]) => {
      this.log('INFO', 'GENERAL', args[0], ...args.slice(1));
    };

    // Override console.info
    console.info = (...args: any[]) => {
      this.log('INFO', 'INFO', args[0], ...args.slice(1));
    };

    // Override console.warn
    console.warn = (...args: any[]) => {
      this.log('WARN', 'WARN', args[0], ...args.slice(1));
    };

    // Override console.error
    console.error = (...args: any[]) => {
      this.log('ERROR', 'ERROR', args[0], ...args.slice(1));
    };

    // Override console.debug
    console.debug = (...args: any[]) => {
      this.log('DEBUG', 'DEBUG', args[0], ...args.slice(1));
    };

    // Add custom methods to console
    (console as any).molstar = (...args: any[]) => {
      this.log('MOLSTAR', 'MOLSTAR', args[0], ...args.slice(1));
    };

    (console as any).selection = (...args: any[]) => {
      this.log('SELECTION', 'SELECTION', args[0], ...args.slice(1));
    };

    (console as any).viewer = (...args: any[]) => {
      this.log('VIEWER', 'VIEWER', args[0], ...args.slice(1));
    };
  }

  // Main logging method
  private log(levelName: string, category: string, message: string, ...data: any[]): void {
    if (!this.config.enabled) return;

    const level = this.levels[levelName];
    if (!level || level.level > this.config.level) return;

    if (!this.config.categories.includes(category)) return;

    // Create log entry
    const entry: LogEntry = {
      timestamp: new Date(),
      level,
      category,
      message: String(message),
      data: data.length > 0 ? data : undefined
    };

    // Add to history
    this.history.push(entry);
    if (this.history.length > this.config.maxHistory) {
      this.history = this.history.slice(-this.config.maxHistory);
    }

    // Format and output
    this.output(entry);
  }

  // Format and output log entry
  private output(entry: LogEntry): void {
    const parts: string[] = [];
    
    // Timestamp
    if (this.config.timestamp) {
      const time = entry.timestamp.toLocaleTimeString('en-US', { 
        hour12: false, 
        hour: '2-digit', 
        minute: '2-digit', 
        second: '2-digit',
        fractionalSecondDigits: 3
      });
      parts.push(`[${time}]`);
    }

    // Prefix
    if (this.config.prefix) {
      parts.push(this.config.prefix);
    }

    // Level and category
    const levelTag = this.config.colors 
      ? `${entry.level.emoji} ${entry.level.name}`
      : `[${entry.level.name}]`;
    
    const categoryTag = entry.category !== entry.level.name 
      ? `[${entry.category}]` 
      : '';

    parts.push(levelTag);
    if (categoryTag) parts.push(categoryTag);

    // Message
    const prefix = parts.join(' ');
    const fullMessage = `${prefix} ${entry.message}`;

    // Output using original console methods based on level
    if (this.config.colors && typeof window !== 'undefined') {
      // Browser with color support
      this.originalConsole.log(
        `%c${fullMessage}`,
        `color: ${entry.level.color}; font-weight: ${entry.level.level <= 1 ? 'bold' : 'normal'};`,
        ...(entry.data || [])
      );
    } else {
      // Fallback to original console methods
      const method = entry.level.level <= 0 ? 'error' : 
                    entry.level.level <= 1 ? 'warn' : 
                    'log';
      
      this.originalConsole[method](fullMessage, ...(entry.data || []));
    }
  }

  // Public logging methods
  public error(message: string, ...data: any[]): void {
    this.log('ERROR', 'ERROR', message, ...data);
  }

  public warn(message: string, ...data: any[]): void {
    this.log('WARN', 'WARN', message, ...data);
  }

  public info(message: string, ...data: any[]): void {
    this.log('INFO', 'INFO', message, ...data);
  }

  public debug(message: string, ...data: any[]): void {
    this.log('DEBUG', 'DEBUG', message, ...data);
  }

  public molstar(message: string, ...data: any[]): void {
    this.log('MOLSTAR', 'MOLSTAR', message, ...data);
  }

  public selection(message: string, ...data: any[]): void {
    this.log('SELECTION', 'SELECTION', message, ...data);
  }

  public viewer(message: string, ...data: any[]): void {
    this.log('VIEWER', 'VIEWER', message, ...data);
  }

  // Utility methods
  public getHistory(): LogEntry[] {
    return [...this.history];
  }

  public clearHistory(): void {
    this.history = [];
  }

  public setLevel(level: keyof typeof this.levels | number): void {
    if (typeof level === 'string') {
      const levelObj = this.levels[level];
      if (levelObj) {
        this.config.level = levelObj.level;
      }
    } else {
      this.config.level = level;
    }
  }

  public enable(): void {
    this.config.enabled = true;
  }

  public disable(): void {
    this.config.enabled = false;
  }

  public toggleColors(): void {
    this.config.colors = !this.config.colors;
  }

  public toggleTimestamp(): void {
    this.config.timestamp = !this.config.timestamp;
  }

  // Restore original console (for development/debugging)
  public restoreConsole(): void {
    Object.assign(console, this.originalConsole);
  }

  // Export logs (useful for debugging)
  public exportLogs(): string {
    return this.history.map(entry => {
      const time = entry.timestamp.toISOString();
      const level = entry.level.name;
      const category = entry.category;
      const message = entry.message;
      const data = entry.data ? ` | Data: ${JSON.stringify(entry.data)}` : '';
      return `${time} [${level}] [${category}] ${message}${data}`;
    }).join('\n');
  }
}

// Create and export the singleton instance
export const logger = CustomLogger.getInstance();

// Export types for external use
export type { LogConfig, LogEntry };