import * as vscode from 'vscode';

export let outputChannel: vscode.OutputChannel | null = null;

/**
 * Log levels in order of severity (higher = more severe)
 * DEBUG < INFO < WARN < ERROR < CRITICAL
 */
export enum LogLevel {
    DEBUG = 0,
    INFO = 1,
    WARN = 2,
    ERROR = 3,
    CRITICAL = 4
}

/**
 * Current log level - only messages at or above this level will be logged
 * Can be configured via VS Code settings
 */
let currentLogLevel: LogLevel = LogLevel.INFO;

/**
 * Performance tracking
 */
let logCounts = {
    debug: 0,
    info: 0,
    warn: 0,
    error: 0,
    critical: 0,
    skipped: 0
};

/**
 * Initialize the output channel and load log level from settings
 */
export function initializeOutputChannel() {
    outputChannel = vscode.window.createOutputChannel('Cervyn Visualizer');
    outputChannel.appendLine('=== Codebase Visualizer Initialized ===');
    
    // Load log level from configuration
    const config = vscode.workspace.getConfiguration('codebaseVisualizer');
    const logLevelSetting = config.get<string>('logLevel', 'info').toLowerCase();
    
    switch (logLevelSetting) {
        case 'debug':
            currentLogLevel = LogLevel.DEBUG;
            break;
        case 'info':
            currentLogLevel = LogLevel.INFO;
            break;
        case 'warn':
            currentLogLevel = LogLevel.WARN;
            break;
        case 'error':
            currentLogLevel = LogLevel.ERROR;
            break;
        default:
            currentLogLevel = LogLevel.INFO;
    }
    
    // Watch for configuration changes
    vscode.workspace.onDidChangeConfiguration(e => {
        if (e.affectsConfiguration('codebaseVisualizer.logLevel')) {
            const newLevel = config.get<string>('logLevel', 'info').toLowerCase();
            const oldLevel = currentLogLevel;
            switch (newLevel) {
                case 'debug': currentLogLevel = LogLevel.DEBUG; break;
                case 'info': currentLogLevel = LogLevel.INFO; break;
                case 'warn': currentLogLevel = LogLevel.WARN; break;
                case 'error': currentLogLevel = LogLevel.ERROR; break;
            }
            if (oldLevel !== currentLogLevel) {
                log(`[Logger] Log level changed to: ${newLevel.toUpperCase()}`);
            }
        }
    });
}

/**
 * Core logging function with level checking
 * Uses lazy evaluation for expensive operations (like JSON.stringify)
 * Supports structured logging with correlation IDs
 */
function logInternal(level: LogLevel, message: string, data?: () => any) {
    // Fast path: skip if below current log level
    if (level < currentLogLevel) {
        logCounts.skipped++;
        return;
    }
    
    // Increment counter
    const levelName = LogLevel[level].toLowerCase();
    logCounts[levelName as keyof typeof logCounts]++;
    
    // Format message with optional data (lazy evaluation)
    let formattedMessage = message;
    let structuredData: any = undefined;
    
    if (data) {
        try {
            // Only stringify if we're actually going to log
            const dataValue = data();
            if (dataValue !== undefined) {
                structuredData = dataValue;
                
                // Format data for display
                const jsonStr = JSON.stringify(dataValue, null, 2);
                
                // For very large objects, provide a link to structured data instead of truncating
                if (jsonStr.length > 2000) {
                    const preview = JSON.stringify(dataValue, null, 2).substring(0, 500);
                    formattedMessage = `${message}\nData: ${preview}...\n(${jsonStr.length} total characters - see structured output)`;
                } else {
                    formattedMessage = `${message}\nData: ${jsonStr}`;
                }
            }
        } catch (err) {
            formattedMessage = `${message}\n[Error serializing data: ${err}]`;
        }
    }
    
    // Add timestamp and level prefix with correlation ID if present
    const timestamp = new Date().toISOString(); // Full ISO timestamp for better debugging
    const correlationId = structuredData?.correlationId;
    const prefix = correlationId 
        ? `[${timestamp}] [${LogLevel[level]}] [${correlationId}]`
        : `[${timestamp}] [${LogLevel[level]}]`;
    const fullMessage = `${prefix} ${formattedMessage}`;
    
    // Write to output channel
    if (outputChannel) {
        outputChannel.appendLine(fullMessage);
    }
    
    // Write to console with appropriate method
    // In development, also log structured data separately for better inspection
    const consoleMessage = fullMessage;
    
    switch (level) {
        case LogLevel.DEBUG:
        case LogLevel.INFO:
            console.log(consoleMessage);
            if (structuredData && process.env.NODE_ENV === 'development') {
                console.log('Structured data:', structuredData);
            }
            break;
        case LogLevel.WARN:
            console.warn(consoleMessage);
            if (structuredData && process.env.NODE_ENV === 'development') {
                console.warn('Structured data:', structuredData);
            }
            break;
        case LogLevel.ERROR:
        case LogLevel.CRITICAL:
            console.error(consoleMessage);
            if (structuredData && process.env.NODE_ENV === 'development') {
                console.error('Structured data:', structuredData);
            }
            break;
    }
}

/**
 * Log a debug message (development/troubleshooting only)
 * Use for: detailed execution flow, variable values, function entry/exit
 * Performance: Only logged when logLevel is 'debug'
 */
export function debug(message: string, data?: () => any) {
    logInternal(LogLevel.DEBUG, message, data);
}

/**
 * Log an info message (normal operation)
 * Use for: important state changes, user actions, significant operations
 * Performance: Logged by default
 */
export function log(message: string, data?: () => any) {
    logInternal(LogLevel.INFO, message, data);
}

/**
 * Log a warning (something unexpected but handled)
 * Use for: fallback behavior, deprecated features, non-critical errors
 * Performance: Always logged
 */
export function warn(message: string, data?: () => any) {
    logInternal(LogLevel.WARN, message, data);
}

/**
 * Log an error (operation failed but extension continues)
 * Use for: caught exceptions, failed operations, recoverable errors
 * Performance: Always logged
 */
export function error(message: string, err?: Error | unknown, data?: () => any) {
    let errorMessage = message;
    
    if (err instanceof Error) {
        errorMessage = `${message}: ${err.message}`;
        if (err.stack) {
            // Include full stack trace for better debugging
            errorMessage += `\nStack: ${err.stack}`;
        }
    } else if (err) {
        errorMessage = `${message}: ${String(err)}`;
    }
    
    logInternal(LogLevel.ERROR, errorMessage, data);
}

/**
 * Log a critical error (extension may be unstable)
 * Use for: unhandled exceptions, fatal errors, activation failures
 * Performance: Always logged, also shows error notification
 */
export function critical(message: string, err?: Error | unknown, data?: () => any) {
    error(message, err, data);
    
    // Also show user-facing error notification
    if (err instanceof Error) {
        vscode.window.showErrorMessage(`Cervyn Visualizer: ${err.message}`);
    } else {
        vscode.window.showErrorMessage(`Cervyn Visualizer: ${message}`);
    }
}

/**
 * Get logging statistics (useful for debugging performance)
 */
export function getLogStats() {
    return { ...logCounts };
}

/**
 * Reset logging statistics
 */
export function resetLogStats() {
    logCounts = {
        debug: 0,
        info: 0,
        warn: 0,
        error: 0,
        critical: 0,
        skipped: 0
    };
}

/**
 * Performance-aware logging for loops
 * Only logs every Nth iteration to avoid performance degradation
 */
export function createThrottledLogger(
    level: LogLevel,
    interval: number = 10,
    messageFn: (iteration: number) => string
) {
    let lastLogged = -1;
    
    return (iteration: number) => {
        if (iteration % interval === 0 || iteration === lastLogged + 1) {
            logInternal(level, messageFn(iteration));
            lastLogged = iteration;
        }
    };
}

