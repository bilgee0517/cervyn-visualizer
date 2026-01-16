import * as vscode from 'vscode';
import * as crypto from 'crypto';
import { error, critical, warn, log } from '../logger';
import { 
    BaseError, 
    isBaseError, 
    isError, 
    toBaseError,
    FileSystemError,
    ParsingError,
    GraphStateError,
    ValidationError,
    TreeSitterError,
    WebviewError,
    ConfigurationError
} from '../errors';
import { Result, Ok, Err } from '../types/result';

/**
 * Error handling utilities for consistent error management across the extension
 */

export interface ErrorContext {
    operation: string;
    component?: string;
    metadata?: Record<string, any>;
    correlationId?: string;
}

/**
 * Error severity levels
 */
export type ErrorSeverity = 'info' | 'warning' | 'error' | 'critical';

/**
 * Classified error information
 */
export interface ClassifiedError {
    severity: ErrorSeverity;
    recoverable: boolean;
    userMessage: string;
    technicalDetails: string;
    error: BaseError;
    correlationId: string;
}

/**
 * Generate a unique correlation ID for error tracking
 */
export function generateCorrelationId(): string {
    return crypto.randomUUID();
}

/**
 * Classify an error based on its type and content
 */
export function classifyError(err: unknown, context?: ErrorContext): ClassifiedError {
    const correlationId = context?.correlationId || generateCorrelationId();
    const baseError = toBaseError(err);
    
    // Determine severity
    let severity: ErrorSeverity = 'error';
    let recoverable = true;
    let userMessage = 'An error occurred';
    
    if (isBaseError(err)) {
        // Custom error types - use specific classification
        if (err instanceof ValidationError) {
            severity = 'warning';
            recoverable = true;
            userMessage = `Invalid input: ${err.message}`;
        } else if (err instanceof FileSystemError) {
            severity = err.operation === 'read' ? 'error' : 'critical';
            recoverable = err.operation === 'read';
            userMessage = `File operation failed: ${err.message}`;
        } else if (err instanceof GraphStateError) {
            severity = err.stateOperation === 'load' ? 'critical' : 'error';
            recoverable = err.stateOperation !== 'load';
            userMessage = `Graph state error: ${err.message}`;
        } else if (err instanceof ParsingError) {
            severity = 'warning';
            recoverable = true;
            userMessage = `Failed to parse file: ${err.filePath || 'unknown'}`;
        } else if (err instanceof TreeSitterError) {
            severity = 'warning';
            recoverable = true;
            userMessage = 'Code analysis encountered an issue';
        } else if (err instanceof WebviewError) {
            severity = 'error';
            recoverable = true;
            userMessage = 'Visualization update failed';
        } else if (err instanceof ConfigurationError) {
            severity = 'warning';
            recoverable = true;
            userMessage = `Configuration issue: ${err.message}`;
        }
    } else if (isError(err)) {
        // Generic Error - classify by message content
        if (err.message.includes('fatal') || err.message.includes('critical') || err.message.includes('cannot activate')) {
            severity = 'critical';
            recoverable = false;
            userMessage = err.message;
        } else if (err.message.includes('ENOENT') || err.message.includes('not found')) {
            severity = 'error';
            recoverable = true;
            userMessage = 'Resource not found';
        } else if (err.message.includes('EACCES') || err.message.includes('permission')) {
            severity = 'error';
            recoverable = false;
            userMessage = 'Permission denied';
        }
    }
    
    const technicalDetails = `[${context?.component || 'Unknown'}] ${context?.operation || 'Operation'}: ${baseError.message}`;
    
    return {
        severity,
        recoverable,
        userMessage,
        technicalDetails,
        error: baseError,
        correlationId
    };
}

/**
 * Wraps an async function with error handling
 * Returns a Result instead of null
 */
export async function safeExecute<T>(
    fn: () => Promise<T>,
    context: ErrorContext
): Promise<Result<T, BaseError>> {
    const correlationId = context.correlationId || generateCorrelationId();
    try {
        const value = await fn();
        return Ok(value);
    } catch (err) {
        const baseError = toBaseError(err);
        handleError(baseError, { ...context, correlationId });
        return Err(baseError);
    }
}

/**
 * Wraps a sync function with error handling
 * Returns a Result instead of null
 */
export function safeExecuteSync<T>(
    fn: () => T,
    context: ErrorContext
): Result<T, BaseError> {
    const correlationId = context.correlationId || generateCorrelationId();
    try {
        const value = fn();
        return Ok(value);
    } catch (err) {
        const baseError = toBaseError(err);
        handleError(baseError, { ...context, correlationId });
        return Err(baseError);
    }
}

/**
 * Legacy null-returning versions (for backward compatibility during migration)
 * @deprecated Use safeExecute which returns Result<T, BaseError>
 */
export async function safeExecuteNull<T>(
    fn: () => Promise<T>,
    context: ErrorContext
): Promise<T | null> {
    const result = await safeExecute(fn, context);
    return result.ok ? result.value : null;
}

/**
 * @deprecated Use safeExecuteSync which returns Result<T, BaseError>
 */
export function safeExecuteSyncNull<T>(
    fn: () => T,
    context: ErrorContext
): T | null {
    const result = safeExecuteSync(fn, context);
    return result.ok ? result.value : null;
}

/**
 * Centralized error handling with classification and correlation
 * Logs errors appropriately based on severity and context
 */
export function handleError(
    err: unknown,
    context: ErrorContext,
    showUserNotification: boolean = false
): ClassifiedError {
    const classified = classifyError(err, context);
    const { severity, technicalDetails, userMessage, correlationId, error: baseError } = classified;
    
    // Enhanced metadata with correlation ID
    const enhancedMetadata = {
        ...context.metadata,
        correlationId,
        errorCode: baseError.code,
        errorContext: baseError.context
    };
    
    // Log with appropriate level based on classification
    switch (severity) {
        case 'critical':
            critical(technicalDetails, baseError, () => enhancedMetadata);
            break;
        case 'error':
            error(technicalDetails, baseError, () => enhancedMetadata);
            break;
        case 'warning':
            warn(technicalDetails, () => enhancedMetadata);
            break;
        case 'info':
            log(technicalDetails, () => enhancedMetadata);
            break;
    }
    
    // Show user notification if requested or if critical
    if (showUserNotification || severity === 'critical') {
        const notificationMessage = `Cervyn Visualizer: ${userMessage}`;
        
        if (severity === 'critical') {
            vscode.window.showErrorMessage(notificationMessage, 'View Logs').then(selection => {
                if (selection === 'View Logs') {
                    vscode.commands.executeCommand('workbench.action.output.toggleOutput');
                }
            });
        } else if (severity === 'error') {
            vscode.window.showErrorMessage(notificationMessage);
        } else if (severity === 'warning') {
            vscode.window.showWarningMessage(notificationMessage);
        }
    }
    
    return classified;
}

/**
 * Creates a safe wrapper for event handlers
 * Prevents unhandled promise rejections
 */
export function safeEventHandler<T extends (...args: any[]) => any>(
    handler: T,
    context: ErrorContext
): T {
    const correlationId = context.correlationId || generateCorrelationId();
    return ((...args: Parameters<T>) => {
        try {
            const result = handler(...args);
            // Handle async results
            if (result instanceof Promise) {
                result.catch(err => {
                    handleError(err, {
                        ...context,
                        correlationId,
                        operation: `${context.operation} (async)`
                    });
                });
            }
            return result;
        } catch (err) {
            handleError(err, { ...context, correlationId });
            throw err;
        }
    }) as T;
}

/**
 * Retry wrapper with exponential backoff
 * Returns Result instead of null
 */
export async function retryWithBackoff<T>(
    fn: () => Promise<T>,
    context: ErrorContext,
    maxRetries: number = 3,
    initialDelay: number = 100
): Promise<Result<T, BaseError>> {
    const correlationId = context.correlationId || generateCorrelationId();
    let lastError: unknown = null;
    
    for (let attempt = 0; attempt < maxRetries; attempt++) {
        try {
            const value = await fn();
            if (attempt > 0) {
                log(`[${context.component || 'Retry'}] ${context.operation} succeeded on attempt ${attempt + 1}`, () => ({ correlationId }));
            }
            return Ok(value);
        } catch (err) {
            lastError = err;
            
            if (attempt < maxRetries - 1) {
                const delay = initialDelay * Math.pow(2, attempt);
                warn(
                    `[${context.component || 'Retry'}] ${context.operation} failed (attempt ${attempt + 1}/${maxRetries}), retrying in ${delay}ms...`,
                    () => ({ 
                        correlationId,
                        error: isError(err) ? err.message : String(err),
                        nextRetryDelay: delay
                    })
                );
                await new Promise(resolve => setTimeout(resolve, delay));
            }
        }
    }
    
    // All retries failed
    const baseError = toBaseError(lastError, `${context.operation} failed after ${maxRetries} retries`);
    handleError(baseError, {
        ...context,
        correlationId,
        operation: `${context.operation} (after ${maxRetries} retries)`,
        metadata: {
            ...context.metadata,
            maxRetries,
            allAttemptsFailed: true
        }
    });
    return Err(baseError);
}

/**
 * Timeout wrapper for async operations
 * Returns Result instead of null
 */
export async function withTimeout<T>(
    promise: Promise<T>,
    timeoutMs: number,
    context: ErrorContext
): Promise<Result<T, BaseError>> {
    const correlationId = context.correlationId || generateCorrelationId();
    
    const timeoutPromise = new Promise<never>((_, reject) => {
        setTimeout(() => {
            reject(new BaseError(
                `Operation timed out after ${timeoutMs}ms`,
                'TIMEOUT_ERROR',
                { timeoutMs, operation: context.operation },
                undefined
            ));
        }, timeoutMs);
    });
    
    try {
        const result = await Promise.race([promise, timeoutPromise]);
        return Ok(result);
    } catch (err) {
        const baseError = toBaseError(err);
        handleError(baseError, { ...context, correlationId });
        return Err(baseError);
    }
}

/**
 * Validates that a required value exists
 * Throws ValidationError if validation fails
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
        throw new ValidationError(message, name, value, typeof value, { context });
    }
    return value;
}

/**
 * Validates that a file exists before operations
 * Throws FileSystemError if file doesn't exist
 */
export async function requireFileExists(
    filePath: string,
    operation: string
): Promise<void> {
    try {
        await vscode.workspace.fs.stat(vscode.Uri.file(filePath));
    } catch (err) {
        throw new FileSystemError(
            `File not found: ${filePath} (required for ${operation})`,
            filePath,
            'stat',
            { operation },
            isError(err) ? err : undefined
        );
    }
}

/**
 * Error boundary for catching and handling errors in a code block
 * Returns Result<T, BaseError>
 */
export async function errorBoundary<T>(
    fn: () => Promise<T>,
    context: ErrorContext
): Promise<Result<T, BaseError>> {
    return safeExecute(fn, context);
}

/**
 * Synchronous error boundary
 */
export function errorBoundarySync<T>(
    fn: () => T,
    context: ErrorContext
): Result<T, BaseError> {
    return safeExecuteSync(fn, context);
}




