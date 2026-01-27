/**
 * Tests for Validation Schemas and Error Recovery
 */

import { z } from 'zod';
import {
    LayerSchema,
    ProgressStatusSchema,
    EdgeTypeSchema,
    GetGraphArgsSchema,
    UpdateNodeArgsSchema,
    UpdateEdgeArgsSchema
} from '../validation/mcp-schemas';

describe('Layer Schema', () => {
    test('should accept valid layers', () => {
        expect(() => LayerSchema.parse('workflow')).not.toThrow();
        expect(() => LayerSchema.parse('context')).not.toThrow();
        expect(() => LayerSchema.parse('container')).not.toThrow();
        expect(() => LayerSchema.parse('component')).not.toThrow();
        expect(() => LayerSchema.parse('code')).not.toThrow();
    });

    test('should reject invalid layers', () => {
        expect(() => LayerSchema.parse('invalid')).toThrow();
        expect(() => LayerSchema.parse('')).toThrow();
        expect(() => LayerSchema.parse(null)).toThrow();
    });
});

describe('Progress Status Schema', () => {
    test('should accept valid statuses', () => {
        expect(() => ProgressStatusSchema.parse('done')).not.toThrow();
        expect(() => ProgressStatusSchema.parse('in-progress')).not.toThrow();
        expect(() => ProgressStatusSchema.parse('not-started')).not.toThrow();
        expect(() => ProgressStatusSchema.parse('error')).not.toThrow();
    });

    test('should reject invalid statuses', () => {
        expect(() => ProgressStatusSchema.parse('completed')).toThrow();
        expect(() => ProgressStatusSchema.parse('pending')).toThrow();
    });
});

describe('Edge Type Schema', () => {
    test('should accept valid edge types', () => {
        expect(() => EdgeTypeSchema.parse('imports')).not.toThrow();
        expect(() => EdgeTypeSchema.parse('calls')).not.toThrow();
        expect(() => EdgeTypeSchema.parse('extends')).not.toThrow();
        expect(() => EdgeTypeSchema.parse('implements')).not.toThrow();
        expect(() => EdgeTypeSchema.parse('depends-on')).not.toThrow();
        expect(() => EdgeTypeSchema.parse('uses')).not.toThrow();
    });

    test('should reject invalid edge types', () => {
        expect(() => EdgeTypeSchema.parse('references')).toThrow();
        expect(() => EdgeTypeSchema.parse('contains')).toThrow();
    });
});

describe('Get Graph Args Schema', () => {
    test('should accept empty object', () => {
        const result = GetGraphArgsSchema.parse({});
        expect(result).toEqual({});
    });

    test('should accept valid layer', () => {
        const result = GetGraphArgsSchema.parse({ layer: 'code' });
        expect(result.layer).toBe('code');
    });

    test('should reject invalid properties', () => {
        expect(() => GetGraphArgsSchema.parse({ invalid: 'prop' })).toThrow();
    });

    test('should reject invalid layer', () => {
        expect(() => GetGraphArgsSchema.parse({ layer: 'invalid' })).toThrow();
    });
});

describe('Update Node Args Schema', () => {
    test('should require nodeId', () => {
        expect(() => UpdateNodeArgsSchema.parse({})).toThrow(z.ZodError);
        expect(() => UpdateNodeArgsSchema.parse({ nodeId: '' })).toThrow();
    });

    test('should accept valid node update', () => {
        const result = UpdateNodeArgsSchema.parse({
            nodeId: 'node-123',
            label: 'New Label',
            roleDescription: 'Does something',
            technology: 'React'
        });
        
        expect(result.nodeId).toBe('node-123');
        expect(result.label).toBe('New Label');
        expect(result.roleDescription).toBe('Does something');
        expect(result.technology).toBe('React');
    });

    test('should accept valid progress status', () => {
        const result = UpdateNodeArgsSchema.parse({
            nodeId: 'node-123',
            progressStatus: 'in-progress'
        });
        
        expect(result.progressStatus).toBe('in-progress');
    });

    test('should reject invalid progress status', () => {
        expect(() => UpdateNodeArgsSchema.parse({
            nodeId: 'node-123',
            progressStatus: 'invalid'
        })).toThrow();
    });

    test('should reject extra properties', () => {
        expect(() => UpdateNodeArgsSchema.parse({
            nodeId: 'node-123',
            extraProp: 'not allowed'
        })).toThrow();
    });
});

describe('Update Edge Args Schema', () => {
    test('should require edgeId', () => {
        expect(() => UpdateEdgeArgsSchema.parse({})).toThrow();
        expect(() => UpdateEdgeArgsSchema.parse({ edgeId: '' })).toThrow();
    });

    test('should accept valid edge update', () => {
        const result = UpdateEdgeArgsSchema.parse({
            edgeId: 'edge-123',
            label: 'imports from',
            edgeType: 'imports',
            description: 'Module import'
        });
        
        expect(result.edgeId).toBe('edge-123');
        expect(result.label).toBe('imports from');
        expect(result.edgeType).toBe('imports');
        expect(result.description).toBe('Module import');
    });

    test('should reject invalid edge type', () => {
        expect(() => UpdateEdgeArgsSchema.parse({
            edgeId: 'edge-123',
            edgeType: 'invalid'
        })).toThrow();
    });
});

describe('Validation Error Messages', () => {
    test('should provide helpful error messages', () => {
        try {
            UpdateNodeArgsSchema.parse({});
        } catch (error) {
            expect(error).toBeInstanceOf(z.ZodError);
            if (error instanceof z.ZodError) {
                const issue = error.issues[0];
                expect(issue.path).toContain('nodeId');
                // Zod v4 changed error messages
                expect(issue.message).toMatch(/required|expected string, received undefined/i);
            }
        }
    });

    test('should validate multiple fields', () => {
        try {
            UpdateNodeArgsSchema.parse({
                nodeId: '',
                progressStatus: 'invalid',
                extraField: 'not allowed'
            });
        } catch (error) {
            expect(error).toBeInstanceOf(z.ZodError);
            if (error instanceof z.ZodError) {
                expect(error.issues.length).toBeGreaterThan(1);
            }
        }
    });
});

describe('Schema Composition', () => {
    test('schemas should be composable', () => {
        const ComposedSchema = z.object({
            layer: LayerSchema,
            status: ProgressStatusSchema,
            edgeType: EdgeTypeSchema
        });

        const valid = {
            layer: 'code' as const,
            status: 'done' as const,
            edgeType: 'imports' as const
        };

        expect(() => ComposedSchema.parse(valid)).not.toThrow();
    });
});

describe('Error Recovery Patterns', () => {
    test('should handle validation errors gracefully', () => {
        const input = { nodeId: '', label: 'Test' };
        const result = UpdateNodeArgsSchema.safeParse(input);
        
        expect(result.success).toBe(false);
        if (!result.success) {
            expect(result.error).toBeInstanceOf(z.ZodError);
        }
    });

    test('should use safeParse for non-throwing validation', () => {
        const validInput = { nodeId: 'node-123' };
        const invalidInput = {};
        
        const validResult = UpdateNodeArgsSchema.safeParse(validInput);
        const invalidResult = UpdateNodeArgsSchema.safeParse(invalidInput);
        
        expect(validResult.success).toBe(true);
        expect(invalidResult.success).toBe(false);
    });

    test('should provide default values where appropriate', () => {
        const SchemaWithDefaults = z.object({
            required: z.string(),
            optional: z.string().optional(),
            withDefault: z.string().default('default value')
        });
        
        const result = SchemaWithDefaults.parse({
            required: 'test'
        });
        
        expect(result.required).toBe('test');
        expect(result.optional).toBeUndefined();
        expect(result.withDefault).toBe('default value');
    });
});

describe('Type Inference', () => {
    test('should infer correct TypeScript types', () => {
        type UpdateNodeArgs = z.infer<typeof UpdateNodeArgsSchema>;
        
        const validArgs: UpdateNodeArgs = {
            nodeId: 'node-123',
            label: 'Test',
            progressStatus: 'done'
        };
        
        // TypeScript should accept this without errors
        expect(validArgs.nodeId).toBe('node-123');
    });

    test('should enforce type constraints at compile time', () => {
        type Layer = z.infer<typeof LayerSchema>;

        // These should be valid
        const layer1: Layer = 'workflow';
        const layer2: Layer = 'code';

        // This would cause a TypeScript error if uncommented:
        // const invalid: Layer = 'invalid';

        expect(layer1).toBe('workflow');
        expect(layer2).toBe('code');
    });
});
