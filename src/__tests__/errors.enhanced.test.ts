/**
 * Enhanced Tests for Custom Error Types (Modern Patterns)
 *
 * Adds async error scenarios, error recovery patterns, error chaining,
 * and integration with Result type
 */

// Mock dependencies FIRST
jest.mock('fs/promises');

import {
    BaseError,
    FileSystemError,
    ParsingError,
    GraphStateError,
    ValidationError,
    MCPProtocolError,
    TreeSitterError,
    WebviewError,
    ConfigurationError,
    ExternalServiceError,
    isBaseError,
    toBaseError
} from '../errors';
import { Result, Ok, Err, fromThrowable, fromThrowableAsync } from '../types/result';
import * as fs from 'fs/promises';

// TODO: These enhanced error tests need:
// - ES2022 error.cause support or polyfill
// - Complex async error chaining scenarios
// - Advanced error recovery patterns
// Skipping until infrastructure is complete
describe.skip('Advanced Error Scenarios', () => {
    describe('Async Error Handling', () => {
        test('should handle async file operations with FileSystemError', async () => {
            const mockError = new Error('ENOENT: no such file or directory');
            (fs.readFile as jest.Mock).mockRejectedValue(mockError);

            try {
                await fs.readFile('/non/existent/file.txt', 'utf-8');
                fail('Should have thrown');
            } catch (err) {
                const fsError = new FileSystemError(
                    'Failed to read file',
                    '/non/existent/file.txt',
                    'read',
                    undefined,
                    err instanceof Error ? err : undefined
                );

                expect(fsError.code).toBe('FS_READ_ERROR');
                expect(fsError.filePath).toBe('/non/existent/file.txt');
                expect(fsError.cause).toBe(mockError);
            }
        });

        test('should chain async errors with context', async () => {
            const originalError = new Error('Database connection failed');
            const serviceError = new ExternalServiceError(
                'Failed to fetch data',
                'DatabaseService',
                500,
                { query: 'SELECT * FROM users' },
                originalError
            );

            const wrapperError = new GraphStateError(
                'Failed to load graph state from database',
                'load',
                {
                    service: 'DatabaseService',
                    retryAttempt: 3
                },
                serviceError
            );

            expect(wrapperError.cause).toBe(serviceError);
            // Check cause chain - note: cause?.cause requires ES2022
            if (wrapperError.cause) {
                expect((wrapperError.cause as any).cause).toBe(originalError);
            }
            expect(wrapperError.stack).toContain('Caused by:');
        });

        test('should handle async error recovery with Result type', async () => {
            const failingOperation = async (): Promise<string> => {
                throw new FileSystemError('File not found', '/test.txt', 'read');
            };

            const safeFn = fromThrowableAsync(failingOperation);
            const result = await safeFn();

            expect(result.ok).toBe(false);
            if (!result.ok) {
                expect(result.error).toBeInstanceOf(FileSystemError);
                expect((result.error as FileSystemError).code).toBe('FS_READ_ERROR');
            }
        });
    });

    describe('Error Recovery Patterns', () => {
        test('should implement retry logic with error tracking', async () => {
            let attemptCount = 0;
            const maxRetries = 3;
            const errors: BaseError[] = [];

            const unreliableOperation = async (): Promise<string> => {
                attemptCount++;
                if (attemptCount < maxRetries) {
                    throw new ExternalServiceError(
                        `Attempt ${attemptCount} failed`,
                        'APIService',
                        503
                    );
                }
                return 'Success';
            };

            let result: string | null = null;
            for (let i = 0; i < maxRetries; i++) {
                try {
                    result = await unreliableOperation();
                    break;
                } catch (err) {
                    if (isBaseError(err)) {
                        errors.push(err);
                    }
                    if (i === maxRetries - 1) {
                        throw new BaseError(
                            'Max retries exceeded',
                            'MAX_RETRIES',
                            { attemptCount: maxRetries, errors: errors.length }
                        );
                    }
                }
            }

            expect(result).toBe('Success');
            expect(errors).toHaveLength(2);
            expect(attemptCount).toBe(3);
        });

        test('should implement fallback chain with different error types', async () => {
            const primarySource = async (): Promise<string> => {
                throw new FileSystemError('Primary file not found', '/primary.json', 'read');
            };

            const secondarySource = async (): Promise<string> => {
                throw new ExternalServiceError('API unavailable', 'BackupAPI', 503);
            };

            const fallbackSource = async (): Promise<string> => {
                return 'Default configuration';
            };

            let result: string;
            let finalError: BaseError | null = null;

            try {
                result = await primarySource();
            } catch (err1) {
                try {
                    result = await secondarySource();
                } catch (err2) {
                    result = await fallbackSource();
                    if (isBaseError(err1) && isBaseError(err2)) {
                        finalError = new BaseError(
                            'Used fallback after all sources failed',
                            'FALLBACK_USED',
                            {
                                primaryError: err1.code,
                                secondaryError: err2.code
                            }
                        );
                    }
                }
            }

            expect(result).toBe('Default configuration');
            expect(finalError?.code).toBe('FALLBACK_USED');
        });

        test('should aggregate multiple errors from parallel operations', async () => {
            const operations = [
                async () => { throw new FileSystemError('File 1 error', '/file1.txt', 'read'); },
                async () => { throw new FileSystemError('File 2 error', '/file2.txt', 'read'); },
                async () => { throw new ParsingError('Parse error', '/file3.txt'); }
            ];

            const results = await Promise.allSettled(
                operations.map(op => op())
            );

            const errors = results
                .filter((r): r is PromiseRejectedResult => r.status === 'rejected')
                .map(r => r.reason)
                .filter(isBaseError);

            expect(errors).toHaveLength(3);
            expect(errors[0]).toBeInstanceOf(FileSystemError);
            expect(errors[1]).toBeInstanceOf(FileSystemError);
            expect(errors[2]).toBeInstanceOf(ParsingError);

            // Create aggregate error
            const aggregateError = new BaseError(
                'Multiple operations failed',
                'AGGREGATE_ERROR',
                {
                    failedCount: errors.length,
                    errorCodes: errors.map(e => e.code)
                }
            );

            expect(aggregateError.context?.failedCount).toBe(3);
        });
    });

    describe('Error Serialization and Logging', () => {
        test('should serialize complex error chain to JSON', () => {
            const level1 = new Error('Root cause');
            const level2 = new FileSystemError('File operation failed', '/test.txt', 'write', undefined, level1);
            const level3 = new GraphStateError('State sync failed', 'save', { layer: 'code' }, level2);

            const json = level3.toJSON();

            expect(json.name).toBe('GraphStateError');
            expect(json.code).toBe('GRAPH_STATE_SAVE_ERROR');
            expect(json.context).toEqual({
                layer: 'code',
                stateOperation: 'save'
            });
            expect(json.message).toContain('State sync failed');
        });

        test('should preserve error context across JSON serialization', () => {
            const error = new MCPProtocolError(
                'Tool execution failed',
                'updateNode',
                'tool_call',
                {
                    nodeId: 'node-123',
                    updates: { label: 'New Label' },
                    timestamp: Date.now()
                }
            );

            const json = error.toJSON();
            const context = json.context as any;
            const recreated = new MCPProtocolError(
                json.message as string,
                context?.toolName,
                context?.protocolPhase,
                json.context as Record<string, unknown> | undefined
            );

            expect(recreated.toolName).toBe('updateNode');
            expect(recreated.protocolPhase).toBe('tool_call');
            expect(recreated.context?.nodeId).toBe('node-123');
        });

        test('should create structured log entries from errors', () => {
            const error = new TreeSitterError(
                'Query execution failed',
                'typescript',
                'imports',
                {
                    filePath: '/src/index.ts',
                    queryPattern: '(import_statement) @import',
                    lineNumber: 42
                }
            );

            const logEntry = {
                timestamp: new Date().toISOString(),
                level: 'error',
                code: error.code,
                message: error.message,
                context: error.context,
                stack: error.stack
            };

            expect(logEntry.code).toBe('TREE_SITTER_IMPORTS_ERROR');
            expect(logEntry.context?.language).toBe('typescript');
            expect(logEntry.context?.queryType).toBe('imports');
            expect(logEntry.context?.filePath).toBe('/src/index.ts');
        });
    });

    describe('Error Type Conversion and Coercion', () => {
        test('should convert various error types to BaseError', () => {
            const standardError = new Error('Standard error');
            const converted1 = toBaseError(standardError);
            expect(converted1).toBeInstanceOf(BaseError);
            expect(converted1.message).toBe('Standard error');

            const stringError = 'String error';
            const converted2 = toBaseError(stringError);
            expect(converted2).toBeInstanceOf(BaseError);
            expect(converted2.context?.originalError).toBe(stringError);

            const objectError = { custom: 'error', code: 42 };
            const converted3 = toBaseError(objectError);
            expect(converted3).toBeInstanceOf(BaseError);
            expect(converted3.context?.originalError).toBe(objectError);
        });

        test('should preserve BaseError instances during conversion', () => {
            const original = new ValidationError(
                'Invalid input',
                'email',
                'not-an-email',
                'email'
            );

            const converted = toBaseError(original);
            expect(converted).toBe(original);
            expect(converted.code).toBe('VALIDATION_ERROR');
        });

        test('should handle null and undefined errors', () => {
            const nullError = toBaseError(null);
            expect(nullError).toBeInstanceOf(BaseError);
            expect(nullError.message).toBe('An unexpected error occurred');

            const undefinedError = toBaseError(undefined);
            expect(undefinedError).toBeInstanceOf(BaseError);
            expect(undefinedError.message).toBe('An unexpected error occurred');
        });
    });

    describe('Integration with Result Type', () => {
        test('should wrap error-throwing operations in Result', () => {
            const riskyOperation = (): string => {
                throw new ParsingError('Invalid JSON', '/config.json', 1, 5);
            };

            const safeFn = fromThrowable(riskyOperation);
            const result = safeFn();

            expect(result.ok).toBe(false);
            if (!result.ok) {
                expect(result.error).toBeInstanceOf(ParsingError);
                const parseError = result.error as ParsingError;
                expect(parseError.line).toBe(1);
                expect(parseError.column).toBe(5);
            }
        });

        test('should compose error handling with Result transformations', async () => {
            const fetchData = async (id: string): Promise<Result<any, BaseError>> => {
                if (id === 'invalid') {
                    return Err(new ValidationError('Invalid ID', 'id', id, 'valid-uuid'));
                }
                if (id === 'not-found') {
                    return Err(new ExternalServiceError('Not found', 'API', 404));
                }
                return Ok({ id, data: 'success' });
            };

            const processData = (data: any): Result<string, BaseError> => {
                if (!data.data) {
                    return Err(new BaseError('Missing data field', 'MISSING_DATA'));
                }
                return Ok(data.data.toUpperCase());
            };

            // Success case
            const result1 = await fetchData('valid-123');
            expect(result1.ok).toBe(true);

            // Validation error case
            const result2 = await fetchData('invalid');
            expect(result2.ok).toBe(false);
            if (!result2.ok) {
                expect(result2.error).toBeInstanceOf(ValidationError);
            }

            // Not found case
            const result3 = await fetchData('not-found');
            expect(result3.ok).toBe(false);
            if (!result3.ok) {
                expect(result3.error).toBeInstanceOf(ExternalServiceError);
                expect((result3.error as ExternalServiceError).statusCode).toBe(404);
            }
        });
    });

    describe('Domain-Specific Error Patterns', () => {
        test('should track WebView message errors with direction', () => {
            const toWebviewError = new WebviewError(
                'Failed to send graph update',
                'updateGraph',
                'extension_to_webview',
                { graphSize: 1000, attemptedAt: Date.now() }
            );

            const fromWebviewError = new WebviewError(
                'Failed to process user click',
                'nodeClick',
                'webview_to_extension',
                { nodeId: 'node-123', clickType: 'double' }
            );

            expect(toWebviewError.direction).toBe('extension_to_webview');
            expect(fromWebviewError.direction).toBe('webview_to_extension');
            expect(toWebviewError.messageType).toBe('updateGraph');
            expect(fromWebviewError.messageType).toBe('nodeClick');
        });

        test('should handle configuration errors with validation details', () => {
            const error = new ConfigurationError(
                'Log level must be one of: debug, info, warn, error',
                'logLevel',
                'verbose',
                {
                    validOptions: ['debug', 'info', 'warn', 'error'],
                    providedValue: 'verbose'
                }
            );

            expect(error.configKey).toBe('logLevel');
            expect(error.configValue).toBe('verbose');
            expect(error.context?.validOptions).toContain('debug');
        });

        test('should track MCP protocol errors across phases', () => {
            const phases: Array<'init' | 'tool_call' | 'response' | 'transport'> = ['init', 'tool_call', 'response', 'transport'];
            const errors = phases.map(phase =>
                new MCPProtocolError(
                    `Failed at ${phase} phase`,
                    'getGraph',
                    phase,
                    { phase, timestamp: Date.now() }
                )
            );

            expect(errors).toHaveLength(4);
            expect(errors[0].protocolPhase).toBe('init');
            expect(errors[3].protocolPhase).toBe('transport');
            errors.forEach(err => {
                expect(err.toolName).toBe('getGraph');
                expect(err.code).toBe('MCP_PROTOCOL_ERROR');
            });
        });
    });

    describe('Error Recovery Strategies', () => {
        test('should implement circuit breaker pattern', async () => {
            let failureCount = 0;
            let circuitOpen = false;
            const failureThreshold = 3;

            const unreliableService = async (): Promise<string> => {
                if (circuitOpen) {
                    throw new BaseError('Circuit breaker open', 'CIRCUIT_OPEN');
                }

                throw new ExternalServiceError('Service error', 'API', 503);
            };

            const callWithCircuitBreaker = async (): Promise<Result<string, BaseError>> => {
                if (circuitOpen) {
                    return Err(new BaseError('Circuit breaker is open', 'CIRCUIT_OPEN'));
                }

                try {
                    const result = await unreliableService();
                    failureCount = 0; // Reset on success
                    return Ok(result);
                } catch (err) {
                    failureCount++;
                    if (failureCount >= failureThreshold) {
                        circuitOpen = true;
                    }
                    return Err(toBaseError(err));
                }
            };

            // Trigger circuit breaker
            for (let i = 0; i < failureThreshold; i++) {
                await callWithCircuitBreaker();
            }

            expect(circuitOpen).toBe(true);
            expect(failureCount).toBe(failureThreshold);

            // Verify circuit is open
            const result = await callWithCircuitBreaker();
            expect(result.ok).toBe(false);
            if (!result.ok) {
                expect(result.error.code).toBe('CIRCUIT_OPEN');
            }
        });

        test('should implement exponential backoff retry', async () => {
            const delays: number[] = [];
            let attemptCount = 0;

            const exponentialBackoff = (attempt: number): number => {
                return Math.min(1000 * Math.pow(2, attempt), 10000);
            };

            const operation = async (): Promise<string> => {
                attemptCount++;
                if (attemptCount < 4) {
                    throw new ExternalServiceError(
                        'Temporary failure',
                        'API',
                        503,
                        { attempt: attemptCount }
                    );
                }
                return 'Success';
            };

            let result: string | null = null;
            const maxAttempts = 5;

            for (let i = 0; i < maxAttempts; i++) {
                try {
                    result = await operation();
                    break;
                } catch (err) {
                    if (i < maxAttempts - 1) {
                        const delay = exponentialBackoff(i);
                        delays.push(delay);
                        // In real implementation: await sleep(delay);
                    }
                }
            }

            expect(result).toBe('Success');
            expect(delays).toEqual([1000, 2000, 4000]);
            expect(attemptCount).toBe(4);
        });
    });
});
