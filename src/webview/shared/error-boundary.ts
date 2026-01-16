/**
 * Error Boundary Utilities for Webview
 * 
 * Provides error handling patterns for webview message handlers
 * to prevent uncaught errors from breaking the visualization.
 */

/**
 * Error context for webview operations
 */
export interface WebviewErrorContext {
    operation: string;
    messageType?: string;
    details?: Record<string, any>;
}

/**
 * Wraps a message handler with error boundary
 * Catches and logs errors, sends error message to extension
 */
export function withErrorBoundary<T>(
    handler: () => T,
    context: WebviewErrorContext,
    vscode: any
): T | undefined {
    try {
        return handler();
    } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        const errorStack = error instanceof Error ? error.stack : undefined;
        
        // Log to webview console
        console.error(`[Error Boundary] ${context.operation}:`, error);
        
        // Send error to extension for logging
        vscode.postMessage({
            type: 'error',
            operation: context.operation,
            messageType: context.messageType,
            message: errorMessage,
            stack: errorStack,
            details: context.details
        });
        
        return undefined;
    }
}

/**
 * Async version of error boundary
 */
export async function withErrorBoundaryAsync<T>(
    handler: () => Promise<T>,
    context: WebviewErrorContext,
    vscode: any
): Promise<T | undefined> {
    try {
        return await handler();
    } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        const errorStack = error instanceof Error ? error.stack : undefined;
        
        // Log to webview console
        console.error(`[Error Boundary] ${context.operation}:`, error);
        
        // Send error to extension for logging
        vscode.postMessage({
            type: 'error',
            operation: context.operation,
            messageType: context.messageType,
            message: errorMessage,
            stack: errorStack,
            details: context.details
        });
        
        return undefined;
    }
}

/**
 * Safe message handler wrapper
 * Wraps an entire switch case handler with error boundary
 */
export function safeMessageHandler(
    messageType: string,
    handler: () => void,
    vscode: any
): void {
    withErrorBoundary(
        handler,
        {
            operation: `Handle ${messageType} message`,
            messageType
        },
        vscode
    );
}

/**
 * Safe async message handler wrapper
 */
export async function safeMessageHandlerAsync(
    messageType: string,
    handler: () => Promise<void>,
    vscode: any
): Promise<void> {
    await withErrorBoundaryAsync(
        handler,
        {
            operation: `Handle ${messageType} message`,
            messageType
        },
        vscode
    );
}
