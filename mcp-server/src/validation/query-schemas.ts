/**
 * Validation Schemas for Query and Batch Operations
 * 
 * Zod schemas for validating arguments to new MCP tools:
 * - Batch operations
 * - Query/filtering
 * - Traversal
 */

import { z } from 'zod';
import { LayerSchema, NodeTypeSchema, EdgeTypeSchema, ProgressStatusSchema } from './schemas.js';

// ============================================================================
// BATCH OPERATIONS SCHEMAS
// ============================================================================

/**
 * Single node operation in a batch
 */
export const BatchNodeOperationSchema = z.object({
    action: z.enum(['add', 'update', 'delete']),
    nodeId: z.string().optional(), // Required for update/delete
    node: z.object({
        label: z.string().min(1),
        type: z.string(),
        roleDescription: z.string().optional(),
        technology: z.string().optional(),
        path: z.string().optional(),
        parent: z.string().optional(),
        supportsFeatures: z.array(z.string()).optional(),
        supportedBy: z.array(z.string()).optional()
    }).passthrough().optional(), // Required for add, allow additional properties
    updates: z.record(z.string(), z.any()).optional() // Required for update
}).superRefine((data, ctx) => {
    if (data.action === 'add' && !data.node) {
        ctx.addIssue({
            code: z.ZodIssueCode.custom,
            message: "action 'add' requires 'node' property",
            path: ['node']
        });
    }
    if (data.action === 'update' && (!data.nodeId || !data.updates)) {
        ctx.addIssue({
            code: z.ZodIssueCode.custom,
            message: "action 'update' requires 'nodeId' and 'updates' properties",
            path: data.nodeId ? ['updates'] : ['nodeId']
        });
    }
    if (data.action === 'delete' && !data.nodeId) {
        ctx.addIssue({
            code: z.ZodIssueCode.custom,
            message: "action 'delete' requires 'nodeId' property",
            path: ['nodeId']
        });
    }
});

/**
 * Batch nodes tool arguments
 */
export const BatchNodesArgsSchema = z.object({
    operations: z.array(BatchNodeOperationSchema).min(1, 'operations array must contain at least one operation'),
    layer: LayerSchema.optional(),
    atomic: z.boolean().optional().default(true) // If true, all operations succeed or all fail
}).strict();

/**
 * Single edge operation in a batch
 */
export const BatchEdgeOperationSchema = z.object({
    action: z.enum(['add', 'update', 'delete']),
    edgeId: z.string().optional(), // Required for update/delete
    edge: z.object({
        sourceId: z.string().min(1),
        targetId: z.string().min(1),
        edgeType: EdgeTypeSchema.optional(),
        label: z.string().optional(),
        description: z.string().optional()
    }).passthrough().optional(), // Required for add, allow additional properties
    updates: z.record(z.string(), z.any()).optional() // Required for update
}).superRefine((data, ctx) => {
    if (data.action === 'add' && !data.edge) {
        ctx.addIssue({
            code: z.ZodIssueCode.custom,
            message: "action 'add' requires 'edge' property",
            path: ['edge']
        });
    }
    if (data.action === 'update' && (!data.edgeId || !data.updates)) {
        ctx.addIssue({
            code: z.ZodIssueCode.custom,
            message: "action 'update' requires 'edgeId' and 'updates' properties",
            path: data.edgeId ? ['updates'] : ['edgeId']
        });
    }
    if (data.action === 'delete' && !data.edgeId) {
        ctx.addIssue({
            code: z.ZodIssueCode.custom,
            message: "action 'delete' requires 'edgeId' property",
            path: ['edgeId']
        });
    }
});

/**
 * Batch edges tool arguments
 */
export const BatchEdgesArgsSchema = z.object({
    operations: z.array(BatchEdgeOperationSchema).min(1, 'operations array must contain at least one operation'),
    layer: LayerSchema.optional(),
    atomic: z.boolean().optional().default(true)
}).strict();

// ============================================================================
// QUERY/FILTER SCHEMAS
// ============================================================================

/**
 * Query filter schema
 */
export const QueryFilterSchema = z.object({
    // Node filtering
    nodeTypes: z.array(z.string()).optional(),
    nodeIds: z.array(z.string()).optional(),
    
    // Label filtering
    labelPattern: z.string().optional(),
    labelPrefix: z.string().optional(),
    
    // Feature filtering
    supportsFeatures: z.array(z.string()).optional(),
    supportedBy: z.array(z.string()).optional(),
    
    // Property filtering
    technology: z.string().optional(),
    progressStatus: ProgressStatusSchema.optional(),
    isAgentAdded: z.boolean().optional(),
    
    // Edge filtering
    edgeTypes: z.array(z.string()).optional(),
    sourceIds: z.array(z.string()).optional(),
    targetIds: z.array(z.string()).optional(),
    
    // Pagination
    limit: z.number().int().min(1).max(1000).optional(),
    offset: z.number().int().min(0).optional()
}).strict();

/**
 * Query nodes tool arguments
 */
export const QueryNodesArgsSchema = z.object({
    layer: LayerSchema.optional(),
    filter: QueryFilterSchema.optional().default({}),
    includeEdges: z.boolean().optional().default(false)
}).strict();

/**
 * Query edges tool arguments
 */
export const QueryEdgesArgsSchema = z.object({
    layer: LayerSchema.optional(),
    filter: QueryFilterSchema.optional().default({})
}).strict();

/**
 * Enhanced getGraph tool arguments (with filtering)
 */
export const GetGraphFilteredArgsSchema = z.object({
    layer: LayerSchema.optional(),
    filter: QueryFilterSchema.optional(),
    summaryOnly: z.boolean().optional().default(false),
    includeEdges: z.boolean().optional().default(true)
}).strict();

// ============================================================================
// TRAVERSAL SCHEMAS
// ============================================================================

/**
 * Traversal filter schema
 */
export const TraversalFilterSchema = z.object({
    edgeTypes: z.array(z.string()).optional(),
    nodeTypes: z.array(z.string()).optional(),
    maxDepth: z.number().int().min(1).max(10).optional()
}).strict();

/**
 * Traverse graph tool arguments
 */
export const TraverseGraphArgsSchema = z.object({
    operation: z.enum(['neighbors', 'path', 'subgraph', 'bfs', 'dfs']),
    startNodeId: z.string().min(1, 'startNodeId is required'),
    endNodeId: z.string().optional(), // Required for 'path' operation
    layer: LayerSchema.optional(),
    direction: z.enum(['incoming', 'outgoing', 'both']).optional().default('both'),
    depth: z.number().int().min(1).max(10).optional().default(1),
    filter: TraversalFilterSchema.optional().default({})
}).superRefine((data, ctx) => {
    if (data.operation === 'path' && !data.endNodeId) {
        ctx.addIssue({
            code: z.ZodIssueCode.custom,
            message: "operation 'path' requires 'endNodeId'",
            path: ['endNodeId']
        });
    }
}).strict();

/**
 * Find neighbors tool arguments
 */
export const FindNeighborsArgsSchema = z.object({
    startNodeId: z.string().min(1, 'startNodeId is required'),
    layer: LayerSchema.optional(),
    direction: z.enum(['incoming', 'outgoing', 'both']).optional().default('both'),
    depth: z.number().int().min(1).max(10).optional().default(1),
    filter: TraversalFilterSchema.optional().default({})
}).strict();

/**
 * Find path tool arguments
 */
export const FindPathArgsSchema = z.object({
    startNodeId: z.string().min(1, 'startNodeId is required'),
    endNodeId: z.string().min(1, 'endNodeId is required'),
    layer: LayerSchema.optional(),
    filter: TraversalFilterSchema.optional().default({})
}).strict();

/**
 * Extract subgraph tool arguments
 */
export const ExtractSubgraphArgsSchema = z.object({
    startNodeId: z.string().min(1, 'startNodeId is required'),
    layer: LayerSchema.optional(),
    depth: z.number().int().min(1).max(10).optional().default(2),
    filter: TraversalFilterSchema.optional().default({})
}).strict();

// ============================================================================
// COMPOUND NODE SCHEMAS
// ============================================================================

/**
 * Group type for compound nodes
 */
export const GroupTypeSchema = z.enum(['folder', 'logical', 'namespace', 'file']);

/**
 * Create compound node tool arguments
 */
export const CreateCompoundNodeArgsSchema = z.object({
    label: z.string().min(1, 'label is required'),
    type: z.string().optional().default('folder'),
    groupType: GroupTypeSchema.optional().default('logical'),
    layer: LayerSchema.optional(),
    roleDescription: z.string().optional(),
    technology: z.string().optional(),
    parent: z.string().optional(),
    isCollapsed: z.boolean().optional().default(false),
    supportsFeatures: z.array(z.string()).optional(),
    supportedBy: z.array(z.string()).optional()
}).passthrough().strict();

/**
 * Add child nodes tool arguments
 */
export const AddChildNodesArgsSchema = z.object({
    parentId: z.string().min(1, 'parentId is required'),
    childIds: z.array(z.string().min(1)).min(1, 'childIds must contain at least one ID'),
    layer: LayerSchema.optional()
}).strict();

/**
 * Remove child nodes tool arguments
 */
export const RemoveChildNodesArgsSchema = z.object({
    parentId: z.string().min(1, 'parentId is required'),
    childIds: z.array(z.string().min(1)).min(1, 'childIds must contain at least one ID'),
    layer: LayerSchema.optional()
}).strict();

/**
 * Move nodes tool arguments
 */
export const MoveNodesArgsSchema = z.object({
    nodeIds: z.array(z.string().min(1)).min(1, 'nodeIds must contain at least one ID'),
    targetParentId: z.string().nullable(), // null = remove from parent
    layer: LayerSchema.optional()
}).strict();

/**
 * Get compound hierarchy tool arguments
 */
export const GetCompoundHierarchyArgsSchema = z.object({
    rootNodeId: z.string().optional(), // If not provided, returns all root nodes
    layer: LayerSchema.optional(),
    maxDepth: z.number().int().min(1).max(20).optional().default(10)
}).strict();

/**
 * Toggle compound collapse tool arguments
 */
export const ToggleCompoundCollapseArgsSchema = z.object({
    nodeId: z.string().min(1, 'nodeId is required'),
    isCollapsed: z.boolean().optional(), // If not provided, toggles current state
    layer: LayerSchema.optional()
}).strict();

/**
 * Convert to compound tool arguments
 */
export const ConvertToCompoundArgsSchema = z.object({
    nodeId: z.string().min(1, 'nodeId is required'),
    groupType: GroupTypeSchema.optional().default('logical'),
    layer: LayerSchema.optional()
}).strict();
