import * as vscode from 'vscode';
import { error, critical, warn } from '../logger';

/**
 * Error handling utilities for consistent error management across the extension
 */

export interface ErrorContext {
    operation: string;
    component?: string;
    metadata?: Record<string, any>;
}

/**
 * Wraps an async function with error handling
 * Returns the result or null if error occurred
 */
export async function safeExecute<T>(
    fn: () => Promise<T>,
    context: ErrorContext
): Promise<T | null> {
    try {
        return await fn();
    } catch (err) {
        handleError(err, context);
        return null;
    }
}

/**
 * Wraps a sync function with error handling
 * Returns the result or null if error occurred
 */
export function safeExecuteSync<T>(
    fn: () => T,
    context: ErrorContext
): T | null {
    try {
        return fn();
    } catch (err) {
        handleError(err, context);
        return null;
    }
}

/**
 * Centralized error handling
 * Logs errors appropriately based on severity and context
 */
export function handleError(
    err: unknown,
    context: ErrorContext,
    showUserNotification: boolean = false
): void {
    const component = context.component || 'Unknown';
    const operation = context.operation;
    
    // Determine error severity
    const isCritical = err instanceof Error && 
        (err.message.includes('fatal') || 
         err.message.includes('critical') ||
         err.message.includes('cannot activate'));
    
    const errorMessage = err instanceof Error ? err.message : String(err);
    const fullMessage = `[${component}] ${operation}: ${errorMessage}`;
    
    // Log with appropriate level
    if (isCritical) {
        critical(fullMessage, err, () => context.metadata);
    } else {
        error(fullMessage, err, () => context.metadata);
    }
    
    // Show user notification if requested
    if (showUserNotification) {
        const userMessage = err instanceof Error 
            ? err.message 
            : `Operation failed: ${operation}`;
        vscode.window.showErrorMessage(`Cervyn Visualizer: ${userMessage}`);
    }
}

/**
 * Creates a safe wrapper for event handlers
 * Prevents unhandled promise rejections
 */
export function safeEventHandler<T extends (...args: any[]) => any>(
    handler: T,
    context: ErrorContext
): T {
    return ((...args: Parameters<T>) => {
        try {
            const result = handler(...args);
            // Handle async results
            if (result instanceof Promise) {
                result.catch(err => {
                    handleError(err, {
                        ...context,
                        operation: `${context.operation} (async)`
                    });
                });
            }
            return result;
        } catch (err) {
            handleError(err, context);
            throw err;
        }
    }) as T;
}

/**
 * Retry wrapper with exponential backoff
 * Useful for network operations or file system operations that might fail transiently
 */
export async function retryWithBackoff<T>(
    fn: () => Promise<T>,
    context: ErrorContext,
    maxRetries: number = 3,
    initialDelay: number = 100
): Promise<T | null> {
    let lastError: unknown = null;
    
    for (let attempt = 0; attempt < maxRetries; attempt++) {
        try {
            return await fn();
        } catch (err) {
            lastError = err;
            
            if (attempt < maxRetries - 1) {
                const delay = initialDelay * Math.pow(2, attempt);
                warn(
                    `[${context.component || 'Retry'}] ${context.operation} failed (attempt ${attempt + 1}/${maxRetries}), retrying in ${delay}ms...`,
                    () => ({ error: err instanceof Error ? err.message : String(err) })
                );
                await new Promise(resolve => setTimeout(resolve, delay));
            }
        }
    }
    
    // All retries failed
    handleError(lastError, {
        ...context,
        operation: `${context.operation} (after ${maxRetries} retries)`
    });
    return null;
}

/**
 * Timeout wrapper for async operations
 * Prevents operations from hanging indefinitely
 */
export async function withTimeout<T>(
    promise: Promise<T>,
    timeoutMs: number,
    context: ErrorContext
): Promise<T | null> {
    const timeoutPromise = new Promise<null>((resolve) => {
        setTimeout(() => resolve(null), timeoutMs);
    });
    
    const result = await Promise.race([promise, timeoutPromise]);
    
    if (result === null) {
        const timeoutError = new Error(`Operation timed out after ${timeoutMs}ms`);
        handleError(timeoutError, context);
        return null;
    }
    
    return result;
}

/**
 * Validates that a required value exists
 * Throws a descriptive error if validation fails
 */
export function requireValue<T>(
    value: T | null | undefined,
    name: string,
    context?: string
): T {
    if (value === null || value === undefined) {
        const message = context 
            ? `${name} is required in ${context}`
            : `${name} is required`;
        throw new Error(message);
    }
    return value;
}

/**
 * Validates that a file exists before operations
 */
export async function requireFileExists(
    filePath: string,
    operation: string
): Promise<void> {
    try {
        await vscode.workspace.fs.stat(vscode.Uri.file(filePath));
    } catch (err) {
        throw new Error(`File not found: ${filePath} (required for ${operation})`);
    }
}




