/**
 * Tests for Custom Error Types
 */

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
    isError,
    getErrorMessage,
    getErrorStack,
    toBaseError
} from '../errors';

describe('BaseError', () => {
    test('should create error with message and code', () => {
        const error = new BaseError('Test error', 'TEST_ERROR');
        
        expect(error.message).toBe('Test error');
        expect(error.code).toBe('TEST_ERROR');
        expect(error.name).toBe('BaseError');
        expect(error.context).toBeUndefined();
        expect(error.cause).toBeUndefined();
    });

    test('should create error with context', () => {
        const context = { userId: '123', action: 'delete' };
        const error = new BaseError('Test error', 'TEST_ERROR', context);
        
        expect(error.context).toEqual(context);
    });

    test('should create error with cause', () => {
        const cause = new Error('Original error');
        const error = new BaseError('Wrapped error', 'WRAP_ERROR', undefined, cause);
        
        expect(error.cause).toBe(cause);
        expect(error.stack).toContain('Caused by:');
    });

    test('should serialize to JSON', () => {
        const error = new BaseError('Test error', 'TEST_ERROR', { key: 'value' });
        const json = error.toJSON();
        
        expect(json.name).toBe('BaseError');
        expect(json.message).toBe('Test error');
        expect(json.code).toBe('TEST_ERROR');
        expect(json.context).toEqual({ key: 'value' });
        expect(json.stack).toBeDefined();
    });
});

describe('FileSystemError', () => {
    test('should create error with file path and operation', () => {
        const error = new FileSystemError(
            'File not found',
            '/path/to/file.txt',
            'read'
        );
        
        expect(error.message).toBe('File not found');
        expect(error.filePath).toBe('/path/to/file.txt');
        expect(error.operation).toBe('read');
        expect(error.code).toBe('FS_READ_ERROR');
        expect(error.context).toEqual({
            filePath: '/path/to/file.txt',
            operation: 'read'
        });
    });

    test('should handle write operations', () => {
        const error = new FileSystemError(
            'Permission denied',
            '/protected/file.txt',
            'write'
        );
        
        expect(error.code).toBe('FS_WRITE_ERROR');
        expect(error.operation).toBe('write');
    });
});

describe('ParsingError', () => {
    test('should create error with file path and position', () => {
        const error = new ParsingError(
            'Syntax error',
            '/path/to/file.ts',
            10,
            5
        );
        
        expect(error.message).toBe('Syntax error');
        expect(error.filePath).toBe('/path/to/file.ts');
        expect(error.line).toBe(10);
        expect(error.column).toBe(5);
        expect(error.context).toEqual({
            filePath: '/path/to/file.ts',
            line: 10,
            column: 5
        });
    });

    test('should work without position information', () => {
        const error = new ParsingError('Invalid JSON');
        
        expect(error.message).toBe('Invalid JSON');
        expect(error.filePath).toBeUndefined();
        expect(error.line).toBeUndefined();
        expect(error.column).toBeUndefined();
    });
});

describe('GraphStateError', () => {
    test('should create error with state operation', () => {
        const error = new GraphStateError(
            'Failed to load state',
            'load'
        );
        
        expect(error.message).toBe('Failed to load state');
        expect(error.stateOperation).toBe('load');
        expect(error.code).toBe('GRAPH_STATE_LOAD_ERROR');
    });

    test('should handle different operations', () => {
        const saveError = new GraphStateError('Save failed', 'save');
        const syncError = new GraphStateError('Sync failed', 'sync');
        
        expect(saveError.code).toBe('GRAPH_STATE_SAVE_ERROR');
        expect(syncError.code).toBe('GRAPH_STATE_SYNC_ERROR');
    });
});

describe('ValidationError', () => {
    test('should create error with field information', () => {
        const error = new ValidationError(
            'Invalid email format',
            'email',
            'notanemail',
            'string (email format)'
        );
        
        expect(error.message).toBe('Invalid email format');
        expect(error.field).toBe('email');
        expect(error.value).toBe('notanemail');
        expect(error.expectedType).toBe('string (email format)');
    });
});

describe('Error Utilities', () => {
    test('isBaseError should identify BaseError instances', () => {
        const baseError = new BaseError('Test', 'TEST');
        const fileError = new FileSystemError('Test', '/path', 'read');
        const regularError = new Error('Test');
        
        expect(isBaseError(baseError)).toBe(true);
        expect(isBaseError(fileError)).toBe(true);
        expect(isBaseError(regularError)).toBe(false);
        expect(isBaseError('string')).toBe(false);
    });

    test('isError should identify Error instances', () => {
        const error = new Error('Test');
        const baseError = new BaseError('Test', 'TEST');
        const string = 'Not an error';
        
        expect(isError(error)).toBe(true);
        expect(isError(baseError)).toBe(true);
        expect(isError(string)).toBe(false);
    });

    test('getErrorMessage should extract message safely', () => {
        const error = new Error('Test message');
        const baseError = new BaseError('Base message', 'TEST');
        const string = 'String error';
        const object = { message: 'Object error' };
        
        expect(getErrorMessage(error)).toBe('Test message');
        expect(getErrorMessage(baseError)).toBe('Base message');
        expect(getErrorMessage(string)).toBe('String error');
        expect(getErrorMessage(object)).toContain('Object error');
    });

    test('getErrorStack should extract stack safely', () => {
        const error = new Error('Test');
        const string = 'No stack';
        
        expect(getErrorStack(error)).toBeDefined();
        expect(getErrorStack(error)).toContain('Test');
        expect(getErrorStack(string)).toBeUndefined();
    });

    test('toBaseError should convert any error to BaseError', () => {
        const regularError = new Error('Regular error');
        const baseError = new BaseError('Base error', 'TEST');
        const string = 'String error';
        
        const converted1 = toBaseError(regularError);
        expect(converted1).toBeInstanceOf(BaseError);
        expect(converted1.message).toBe('Regular error');
        expect(converted1.cause).toBe(regularError);
        
        const converted2 = toBaseError(baseError);
        expect(converted2).toBe(baseError); // Should return as-is
        
        const converted3 = toBaseError(string);
        expect(converted3).toBeInstanceOf(BaseError);
        expect(converted3.message).toBe('An unexpected error occurred');
        expect(converted3.context).toEqual({ originalError: string });
    });
});

describe('Domain-Specific Errors', () => {
    test('MCPProtocolError should track tool information', () => {
        const error = new MCPProtocolError(
            'Tool invocation failed',
            'getGraph',
            'tool_call'
        );
        
        expect(error.toolName).toBe('getGraph');
        expect(error.protocolPhase).toBe('tool_call');
    });

    test('TreeSitterError should track language and query type', () => {
        const error = new TreeSitterError(
            'Query failed',
            'typescript',
            'imports'
        );
        
        expect(error.language).toBe('typescript');
        expect(error.queryType).toBe('imports');
    });

    test('WebviewError should track message direction', () => {
        const error = new WebviewError(
            'Message failed',
            'updateGraph',
            'extension_to_webview'
        );
        
        expect(error.messageType).toBe('updateGraph');
        expect(error.direction).toBe('extension_to_webview');
    });

    test('ConfigurationError should track config key', () => {
        const error = new ConfigurationError(
            'Invalid value',
            'logLevel',
            'invalid'
        );
        
        expect(error.configKey).toBe('logLevel');
        expect(error.configValue).toBe('invalid');
    });

    test('ExternalServiceError should track status code', () => {
        const error = new ExternalServiceError(
            'API request failed',
            'OpenAI',
            429
        );
        
        expect(error.serviceName).toBe('OpenAI');
        expect(error.statusCode).toBe(429);
    });
});
