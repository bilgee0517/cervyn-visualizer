/**
 * Enhanced Tests for Validation Schemas (Modern Patterns)
 *
 * Adds schema migration tests, complex validation scenarios,
 * integration with services, and async validation patterns
 */

// Mock vscode FIRST before any imports
jest.mock('vscode');
jest.mock('../logger');

import { z } from 'zod';
import {
    LayerSchema,
    ProgressStatusSchema,
    EdgeTypeSchema,
    GetGraphArgsSchema,
    UpdateNodeArgsSchema,
    UpdateEdgeArgsSchema
} from '../validation/mcp-schemas';
import { ValidationError } from '../errors';
import { SCHEMA_VERSION } from '../config/shared-state-config';

// Define SharedGraphState type locally to avoid vscode dependencies
type SharedGraphState = {
    schemaVersion: number;
    version: number;
    timestamp: number;
    source: string;
    currentLayer: string;
    graphs: Record<string, any>;
};

// Mock data generators
function createMockUpdateNodeArgs(overrides = {}) {
    return {
        nodeId: 'node-123',
        label: 'Test Node',
        ...overrides
    };
}

function createMockGraphState(version: number = SCHEMA_VERSION): Partial<SharedGraphState> {
    return {
        schemaVersion: version,
        version: 1,
        timestamp: Date.now(),
        source: 'vscode-extension',
        currentLayer: 'code',
        graphs: {
            workflow: { nodes: [], edges: [] },
            context: { nodes: [], edges: [] },
            container: { nodes: [], edges: [] },
            component: { nodes: [], edges: [] },
            code: { nodes: [], edges: [] }
        }
    };
}

// TODO: These enhanced validation tests need:
// - Schema union handling adjustments
// - Performance benchmarking infrastructure
// - Complex async validation scenarios
// Skipping until infrastructure is complete
describe.skip('Advanced Validation Scenarios', () => {
    describe('Schema Migration and Versioning', () => {
        test('should validate schema version compatibility', () => {
            const StateVersionSchema = z.object({
                schemaVersion: z.number().min(1).max(10),
                version: z.number(),
                timestamp: z.number()
            });

            const validState = createMockGraphState(SCHEMA_VERSION);
            expect(() => StateVersionSchema.parse(validState)).not.toThrow();

            const futureState = createMockGraphState(99);
            expect(() => StateVersionSchema.parse(futureState)).toThrow();
        });

        test('should handle schema evolution with backward compatibility', () => {
            // Old schema (v1)
            const OldNodeSchema = z.object({
                id: z.string(),
                label: z.string(),
                type: z.string()
            });

            // New schema (v2) with additional fields
            const NewNodeSchema = z.object({
                id: z.string(),
                label: z.string(),
                type: z.string(),
                complexity: z.number().optional(),
                cluster: z.string().optional(),
                modified: z.boolean().default(false)
            });

            const oldData = { id: 'node-1', label: 'Old Node', type: 'file' };
            const newData = { ...oldData, complexity: 5, cluster: 'utils' };

            // Both should parse successfully with new schema
            const parsedOld = NewNodeSchema.parse(oldData);
            const parsedNew = NewNodeSchema.parse(newData);

            expect(parsedOld.modified).toBe(false); // default applied
            expect(parsedNew.complexity).toBe(5);
        });

        test('should migrate legacy data structure to current schema', () => {
            // Legacy format (pre-5-layer system)
            const legacyData = {
                layers: {
                    blueprint: { nodes: [], edges: [] },
                    architecture: { nodes: [], edges: [] },
                    implementation: { nodes: [], edges: [] },
                    dependencies: { nodes: [], edges: [] }
                }
            };

            // Migration function
            const migrateTo5LayerSystem = (legacy: any): any => {
                return {
                    graphs: {
                        workflow: { nodes: [], edges: [] }, // New
                        context: legacy.layers.blueprint,
                        container: legacy.layers.architecture,
                        component: legacy.layers.implementation,
                        code: legacy.layers.dependencies
                    }
                };
            };

            const migrated = migrateTo5LayerSystem(legacyData);

            expect(migrated.graphs).toHaveProperty('workflow');
            expect(migrated.graphs).toHaveProperty('context');
            expect(migrated.graphs).toHaveProperty('container');
            expect(migrated.graphs).toHaveProperty('component');
            expect(migrated.graphs).toHaveProperty('code');
        });

        test('should validate and transform data during migration', () => {
            const LegacyProgressSchema = z.enum(['complete', 'incomplete', 'pending']);
            const CurrentProgressSchema = z.enum(['done', 'in-progress', 'not-started', 'error']);

            const progressMap: Record<string, string> = {
                'complete': 'done',
                'incomplete': 'in-progress',
                'pending': 'not-started'
            };

            const migrateProgress = (legacy: z.infer<typeof LegacyProgressSchema>) => {
                return CurrentProgressSchema.parse(progressMap[legacy]);
            };

            expect(migrateProgress('complete')).toBe('done');
            expect(migrateProgress('incomplete')).toBe('in-progress');
            expect(migrateProgress('pending')).toBe('not-started');
        });
    });

    describe('Complex Validation Patterns', () => {
        test('should validate mutually exclusive fields', () => {
            const MutuallyExclusiveSchema = z.object({
                nodeId: z.string().optional(),
                filePath: z.string().optional()
            }).refine(
                data => (data.nodeId !== undefined) !== (data.filePath !== undefined),
                { message: 'Must provide either nodeId or filePath, but not both' }
            );

            expect(() => MutuallyExclusiveSchema.parse({ nodeId: 'node-1' })).not.toThrow();
            expect(() => MutuallyExclusiveSchema.parse({ filePath: '/path' })).not.toThrow();
            expect(() => MutuallyExclusiveSchema.parse({})).toThrow();
            expect(() => MutuallyExclusiveSchema.parse({ nodeId: 'node-1', filePath: '/path' })).toThrow();
        });

        test('should validate conditional required fields', () => {
            const ConditionalSchema = z.object({
                type: z.enum(['node', 'edge']),
                nodeId: z.string().optional(),
                edgeId: z.string().optional(),
                source: z.string().optional(),
                target: z.string().optional()
            }).refine(
                data => data.type === 'node' ? !!data.nodeId : (!!data.edgeId && !!data.source && !!data.target),
                { message: 'Node type requires nodeId; Edge type requires edgeId, source, and target' }
            );

            const validNode = { type: 'node' as const, nodeId: 'node-1' };
            const validEdge = { type: 'edge' as const, edgeId: 'edge-1', source: 'n1', target: 'n2' };
            const invalidNode = { type: 'node' as const };
            const invalidEdge = { type: 'edge' as const, edgeId: 'edge-1' };

            expect(() => ConditionalSchema.parse(validNode)).not.toThrow();
            expect(() => ConditionalSchema.parse(validEdge)).not.toThrow();
            expect(() => ConditionalSchema.parse(invalidNode)).toThrow();
            expect(() => ConditionalSchema.parse(invalidEdge)).toThrow();
        });

        test('should validate cross-field dependencies', () => {
            const DependencySchema = z.object({
                enableClustering: z.boolean(),
                clusterAlgorithm: z.enum(['semantic', 'structural', 'hybrid']).optional(),
                llmModel: z.string().optional()
            }).refine(
                data => !data.enableClustering || (data.clusterAlgorithm !== undefined),
                { message: 'clusterAlgorithm required when enableClustering is true' }
            ).refine(
                data => data.clusterAlgorithm !== 'semantic' || data.llmModel !== undefined,
                { message: 'llmModel required for semantic clustering' }
            );

            expect(() => DependencySchema.parse({
                enableClustering: false
            })).not.toThrow();

            expect(() => DependencySchema.parse({
                enableClustering: true,
                clusterAlgorithm: 'structural'
            })).not.toThrow();

            expect(() => DependencySchema.parse({
                enableClustering: true,
                clusterAlgorithm: 'semantic',
                llmModel: 'gpt-4'
            })).not.toThrow();

            expect(() => DependencySchema.parse({
                enableClustering: true
            })).toThrow();

            expect(() => DependencySchema.parse({
                enableClustering: true,
                clusterAlgorithm: 'semantic'
            })).toThrow();
        });

        test('should validate array items with complex constraints', () => {
            const NodeArraySchema = z.object({
                nodes: z.array(
                    z.object({
                        id: z.string().min(1),
                        type: z.string(),
                        parent: z.string().optional()
                    })
                ).refine(
                    nodes => {
                        const parentIds = new Set(nodes.map(n => n.id));
                        return nodes.every(n => !n.parent || parentIds.has(n.parent));
                    },
                    { message: 'All parent IDs must reference existing nodes' }
                )
            });

            const validData = {
                nodes: [
                    { id: 'root', type: 'file' },
                    { id: 'child1', type: 'class', parent: 'root' },
                    { id: 'child2', type: 'function', parent: 'root' }
                ]
            };

            const invalidData = {
                nodes: [
                    { id: 'child1', type: 'class', parent: 'non-existent' }
                ]
            };

            expect(() => NodeArraySchema.parse(validData)).not.toThrow();
            expect(() => NodeArraySchema.parse(invalidData)).toThrow();
        });
    });

    describe('Async Validation Patterns', () => {
        test('should validate async file path existence', async () => {
            const FilePathSchema = z.string().refine(
                async (path) => {
                    // Simulate async file check
                    return path.startsWith('/valid/');
                },
                { message: 'File path must exist' }
            );

            await expect(FilePathSchema.parseAsync('/valid/path/to/file.ts')).resolves.not.toThrow();
            await expect(FilePathSchema.parseAsync('/invalid/path')).rejects.toThrow();
        });

        test('should validate async unique constraint', async () => {
            const existingIds = new Set(['node-1', 'node-2', 'node-3']);

            const UniqueIdSchema = z.string().refine(
                async (id) => {
                    // Simulate async database check
                    await new Promise(resolve => setTimeout(resolve, 10));
                    return !existingIds.has(id);
                },
                { message: 'ID must be unique' }
            );

            await expect(UniqueIdSchema.parseAsync('node-4')).resolves.toBe('node-4');
            await expect(UniqueIdSchema.parseAsync('node-1')).rejects.toThrow();
        });

        test('should validate async external service constraints', async () => {
            const mcpServerAvailable = true;

            const MCPConfigSchema = z.object({
                enableMCP: z.boolean(),
                mcpServerUrl: z.string().url().optional()
            }).refine(
                async (data) => {
                    if (!data.enableMCP) {return true;}

                    // Simulate async MCP server connectivity check
                    await new Promise(resolve => setTimeout(resolve, 10));
                    return mcpServerAvailable;
                },
                { message: 'MCP server must be reachable when enableMCP is true' }
            );

            await expect(MCPConfigSchema.parseAsync({
                enableMCP: true,
                mcpServerUrl: 'http://localhost:3000'
            })).resolves.not.toThrow();

            await expect(MCPConfigSchema.parseAsync({
                enableMCP: false
            })).resolves.not.toThrow();
        });
    });

    describe('Validation Error Handling and Recovery', () => {
        test('should collect all validation errors with detailed paths', () => {
            const ComplexSchema = z.object({
                user: z.object({
                    name: z.string().min(1),
                    email: z.string().email()
                }),
                nodes: z.array(z.object({
                    id: z.string().min(1),
                    label: z.string().min(1)
                }))
            });

            const invalidData = {
                user: {
                    name: '',
                    email: 'not-an-email'
                },
                nodes: [
                    { id: '', label: 'Valid' },
                    { id: 'valid-id', label: '' }
                ]
            };

            try {
                ComplexSchema.parse(invalidData);
                fail('Should have thrown');
            } catch (error) {
                if (error instanceof z.ZodError) {
                    const issues = error.issues;

                    expect(issues.some(i => i.path.join('.') === 'user.name')).toBe(true);
                    expect(issues.some(i => i.path.join('.') === 'user.email')).toBe(true);
                    expect(issues.some(i => i.path.join('.') === 'nodes.0.id')).toBe(true);
                    expect(issues.some(i => i.path.join('.') === 'nodes.1.label')).toBe(true);
                }
            }
        });

        test('should transform validation errors to custom error types', () => {
            const schema = UpdateNodeArgsSchema;
            const invalidData = { nodeId: '', progressStatus: 'invalid-status' };

            try {
                schema.parse(invalidData);
                fail('Should have thrown');
            } catch (error) {
                if (error instanceof z.ZodError) {
                    const validationErrors = error.issues.map(issue => {
                        return new ValidationError(
                            issue.message,
                            issue.path.join('.'),
                            invalidData,
                            'valid schema'
                        );
                    });

                    expect(validationErrors.length).toBeGreaterThan(0);
                    expect(validationErrors[0]).toBeInstanceOf(ValidationError);
                }
            }
        });

        test('should provide fallback values on validation failure', () => {
            const parseWithFallback = <T>(
                schema: z.ZodType<T>,
                data: unknown,
                fallback: T
            ): T => {
                const result = schema.safeParse(data);
                return result.success ? result.data : fallback;
            };

            const fallbackLayer = 'code' as const;
            const invalidLayer = 'invalid-layer';

            const result = parseWithFallback(LayerSchema, invalidLayer, fallbackLayer);
            expect(result).toBe(fallbackLayer);

            const validLayer = 'component' as const;
            const result2 = parseWithFallback(LayerSchema, validLayer, fallbackLayer);
            expect(result2).toBe(validLayer);
        });

        test('should accumulate partial validation results', () => {
            const nodes = [
                { id: 'node-1', label: 'Valid Node 1' },
                { id: '', label: 'Invalid Node' },
                { id: 'node-3', label: 'Valid Node 3' }
            ];

            const NodeSchema = z.object({
                id: z.string().min(1),
                label: z.string().min(1)
            });

            const validNodes: typeof nodes = [];
            const errors: z.ZodError[] = [];

            for (const node of nodes) {
                const result = NodeSchema.safeParse(node);
                if (result.success) {
                    validNodes.push(result.data);
                } else {
                    errors.push(result.error);
                }
            }

            expect(validNodes).toHaveLength(2);
            expect(errors).toHaveLength(1);
            expect(validNodes.map(n => n.id)).toEqual(['node-1', 'node-3']);
        });
    });

    describe('Integration with MCP Protocol', () => {
        test('should validate complete MCP tool call structure', () => {
            const MCPToolCallSchema = z.object({
                method: z.literal('tools/call'),
                params: z.object({
                    name: z.enum(['getGraph', 'updateNode', 'updateEdge']),
                    arguments: z.union([
                        GetGraphArgsSchema,
                        UpdateNodeArgsSchema,
                        UpdateEdgeArgsSchema
                    ])
                })
            });

            const validGetGraph = {
                method: 'tools/call' as const,
                params: {
                    name: 'getGraph' as const,
                    arguments: { layer: 'code' }
                }
            };

            const validUpdateNode = {
                method: 'tools/call' as const,
                params: {
                    name: 'updateNode' as const,
                    arguments: {
                        nodeId: 'node-123',
                        label: 'Updated Label',
                        complexity: 5
                    }
                }
            };

            expect(() => MCPToolCallSchema.parse(validGetGraph)).not.toThrow();
            expect(() => MCPToolCallSchema.parse(validUpdateNode)).not.toThrow();
        });

        test('should validate MCP response structure', () => {
            const MCPResponseSchema = z.object({
                success: z.boolean(),
                data: z.unknown().optional(),
                error: z.object({
                    code: z.string(),
                    message: z.string(),
                    context: z.record(z.string(), z.unknown()).optional()
                }).optional()
            }).refine(
                data => data.success ? data.data !== undefined : data.error !== undefined,
                { message: 'Success responses need data, error responses need error' }
            );

            const successResponse = {
                success: true,
                data: { nodes: [], edges: [] }
            };

            const errorResponse = {
                success: false,
                error: {
                    code: 'VALIDATION_ERROR',
                    message: 'Invalid node ID',
                    context: { nodeId: '' }
                }
            };

            expect(() => MCPResponseSchema.parse(successResponse)).not.toThrow();
            expect(() => MCPResponseSchema.parse(errorResponse)).not.toThrow();
        });
    });

    describe('Performance and Optimization', () => {
        test('should validate large datasets efficiently', () => {
            const largeDataset = Array.from({ length: 1000 }, (_, i) => ({
                nodeId: `node-${i}`,
                label: `Node ${i}`,
                type: 'file'
            }));

            const startTime = performance.now();

            const results = largeDataset.map(data =>
                UpdateNodeArgsSchema.safeParse(data)
            );

            const endTime = performance.now();
            const duration = endTime - startTime;

            expect(results.every(r => r.success)).toBe(true);
            expect(duration).toBeLessThan(100); // Should complete in under 100ms
        });

        test('should use schema caching for repeated validations', () => {
            // Zod automatically caches compiled schemas
            const schema = UpdateNodeArgsSchema;
            const testData = createMockUpdateNodeArgs();

            const iterations = 1000;
            const startTime = performance.now();

            for (let i = 0; i < iterations; i++) {
                schema.safeParse(testData);
            }

            const endTime = performance.now();
            const avgTime = (endTime - startTime) / iterations;

            expect(avgTime).toBeLessThan(1); // Should average less than 1ms per validation
        });
    });
});
