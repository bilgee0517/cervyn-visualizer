/**
 * Custom Error Type Hierarchy
 * 
 * Provides domain-specific error types with enhanced context for better error handling,
 * debugging, and recovery strategies.
 */

/**
 * Base error class with enhanced context and error chaining support
 */
export class BaseError extends Error {
    constructor(
        message: string,
        public readonly code: string,
        public readonly context?: Record<string, unknown>,
        public readonly cause?: Error
    ) {
        super(message);
        this.name = this.constructor.name;
        
        // Capture stack trace, excluding constructor call from it
        if (Error.captureStackTrace) {
            Error.captureStackTrace(this, this.constructor);
        }
        
        // Preserve cause error's stack trace
        if (cause && cause.stack) {
            this.stack = `${this.stack}\nCaused by: ${cause.stack}`;
        }
    }

    /**
     * Returns a JSON-serializable representation of the error
     */
    toJSON(): Record<string, unknown> {
        return {
            name: this.name,
            message: this.message,
            code: this.code,
            context: this.context,
            stack: this.stack,
            cause: this.cause ? {
                name: this.cause.name,
                message: this.cause.message,
                stack: this.cause.stack
            } : undefined
        };
    }
}

/**
 * File system operation errors (read, write, watch, etc.)
 */
export class FileSystemError extends BaseError {
    constructor(
        message: string,
        public readonly filePath: string,
        public readonly operation: 'read' | 'write' | 'watch' | 'delete' | 'stat',
        context?: Record<string, unknown>,
        cause?: Error
    ) {
        super(
            message,
            `FS_${operation.toUpperCase()}_ERROR`,
            { ...context, filePath, operation },
            cause
        );
    }
}

/**
 * Code parsing errors (tree-sitter, syntax errors, etc.)
 */
export class ParsingError extends BaseError {
    constructor(
        message: string,
        public readonly filePath?: string,
        public readonly line?: number,
        public readonly column?: number,
        context?: Record<string, unknown>,
        cause?: Error
    ) {
        super(
            message,
            'PARSING_ERROR',
            { ...context, filePath, line, column },
            cause
        );
    }
}

/**
 * Graph state management errors (invalid state, sync failures, etc.)
 */
export class GraphStateError extends BaseError {
    constructor(
        message: string,
        public readonly stateOperation: 'load' | 'save' | 'sync' | 'validate' | 'merge',
        context?: Record<string, unknown>,
        cause?: Error
    ) {
        super(
            message,
            `GRAPH_STATE_${stateOperation.toUpperCase()}_ERROR`,
            { ...context, stateOperation },
            cause
        );
    }
}

/**
 * Input validation errors (schema validation, type checking, etc.)
 */
export class ValidationError extends BaseError {
    constructor(
        message: string,
        public readonly field?: string,
        public readonly value?: unknown,
        public readonly expectedType?: string,
        context?: Record<string, unknown>,
        cause?: Error
    ) {
        super(
            message,
            'VALIDATION_ERROR',
            { ...context, field, value, expectedType },
            cause
        );
    }
}

/**
 * MCP protocol errors (communication, tool invocation, etc.)
 */
export class MCPProtocolError extends BaseError {
    constructor(
        message: string,
        public readonly toolName?: string,
        public readonly protocolPhase?: 'init' | 'tool_call' | 'response' | 'transport',
        context?: Record<string, unknown>,
        cause?: Error
    ) {
        super(
            message,
            'MCP_PROTOCOL_ERROR',
            { ...context, toolName, protocolPhase },
            cause
        );
    }
}

/**
 * Tree-sitter specific errors (parser initialization, query failures, etc.)
 */
export class TreeSitterError extends BaseError {
    constructor(
        message: string,
        public readonly language?: string,
        public readonly queryType?: 'imports' | 'symbols' | 'structure',
        context?: Record<string, unknown>,
        cause?: Error
    ) {
        super(
            message,
            'TREE_SITTER_ERROR',
            { ...context, language, queryType },
            cause
        );
    }
}

/**
 * Webview communication errors (message passing, rendering, etc.)
 */
export class WebviewError extends BaseError {
    constructor(
        message: string,
        public readonly messageType?: string,
        public readonly direction?: 'extension_to_webview' | 'webview_to_extension',
        context?: Record<string, unknown>,
        cause?: Error
    ) {
        super(
            message,
            'WEBVIEW_ERROR',
            { ...context, messageType, direction },
            cause
        );
    }
}

/**
 * Configuration errors (invalid settings, missing config, etc.)
 */
export class ConfigurationError extends BaseError {
    constructor(
        message: string,
        public readonly configKey?: string,
        public readonly configValue?: unknown,
        context?: Record<string, unknown>,
        cause?: Error
    ) {
        super(
            message,
            'CONFIGURATION_ERROR',
            { ...context, configKey, configValue },
            cause
        );
    }
}

/**
 * Network/External service errors (LLM API calls, external tools, etc.)
 */
export class ExternalServiceError extends BaseError {
    constructor(
        message: string,
        public readonly serviceName: string,
        public readonly statusCode?: number,
        context?: Record<string, unknown>,
        cause?: Error
    ) {
        super(
            message,
            'EXTERNAL_SERVICE_ERROR',
            { ...context, serviceName, statusCode },
            cause
        );
    }
}

/**
 * Type guard to check if an error is a BaseError
 */
export function isBaseError(error: unknown): error is BaseError {
    return error instanceof BaseError;
}

/**
 * Type guard to check if an error is an Error
 */
export function isError(error: unknown): error is Error {
    return error instanceof Error;
}

/**
 * Safely extract error message from unknown error type
 */
export function getErrorMessage(error: unknown): string {
    if (isError(error)) {
        return error.message;
    }
    return String(error);
}

/**
 * Safely extract error stack from unknown error type
 */
export function getErrorStack(error: unknown): string | undefined {
    if (isError(error)) {
        return error.stack;
    }
    return undefined;
}

/**
 * Convert any error to BaseError for consistent handling
 */
export function toBaseError(error: unknown, defaultMessage: string = 'An unexpected error occurred'): BaseError {
    if (isBaseError(error)) {
        return error;
    }
    
    if (isError(error)) {
        return new BaseError(
            error.message || defaultMessage,
            'WRAPPED_ERROR',
            undefined,
            error
        );
    }
    
    return new BaseError(
        defaultMessage,
        'UNKNOWN_ERROR',
        { originalError: error }
    );
}
