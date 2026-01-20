/**
 * MCP Tool Validation Schemas
 * 
 * Runtime validation schemas for MCP tool arguments using Zod.
 * Ensures type safety and prevents invalid data from entering the system.
 */

import { z } from 'zod';

/**
 * Layer enum schema (C4 Model)
 */
export const LayerSchema = z.enum(['context', 'container', 'component', 'code']);

/**
 * Progress status enum schema
 */
export const ProgressStatusSchema = z.enum(['done', 'in-progress', 'not-started', 'error']);

/**
 * Edge type enum schema
 */
export const EdgeTypeSchema = z.enum(['imports', 'calls', 'extends', 'implements', 'depends-on', 'uses']);

/**
 * Node type enum schema
 */
export const NodeTypeSchema = z.enum(['file', 'directory', 'module', 'class', 'function', 'cluster']);

/**
 * Get Graph tool arguments schema
 */
export const GetGraphArgsSchema = z.object({
    layer: LayerSchema.optional()
}).strict();

/**
 * Update Node tool arguments schema
 */
export const UpdateNodeArgsSchema = z.object({
    nodeId: z.string().min(1, 'Node ID is required'),
    label: z.string().optional(),
    roleDescription: z.string().optional(),
    technology: z.string().optional(),
    progressStatus: ProgressStatusSchema.optional(),
    layer: LayerSchema.optional()
}).strict();

/**
 * Update Edge tool arguments schema
 */
export const UpdateEdgeArgsSchema = z.object({
    edgeId: z.string().min(1, 'Edge ID is required'),
    label: z.string().optional(),
    edgeType: EdgeTypeSchema.optional(),
    description: z.string().optional(),
    layer: LayerSchema.optional()
}).strict();

/**
 * Add Node tool arguments schema
 */
export const AddNodeArgsSchema = z.object({
    nodeId: z.string().min(1, 'Node ID is required'),
    label: z.string().min(1, 'Label is required'),
    type: NodeTypeSchema.optional(),
    path: z.string().optional(),
    roleDescription: z.string().optional(),
    technology: z.string().optional(),
    progressStatus: ProgressStatusSchema.optional(),
    layer: LayerSchema.optional(),
    parent: z.string().optional(),
    isCompound: z.boolean().optional()
}).strict();

/**
 * Add Edge tool arguments schema
 */
export const AddEdgeArgsSchema = z.object({
    source: z.string().min(1, 'Source node ID is required'),
    target: z.string().min(1, 'Target node ID is required'),
    label: z.string().optional(),
    edgeType: EdgeTypeSchema.optional(),
    description: z.string().optional(),
    layer: LayerSchema.optional()
}).strict();

/**
 * Remove Node tool arguments schema
 */
export const RemoveNodeArgsSchema = z.object({
    nodeId: z.string().min(1, 'Node ID is required'),
    layer: LayerSchema.optional()
}).strict();

/**
 * Remove Edge tool arguments schema
 */
export const RemoveEdgeArgsSchema = z.object({
    edgeId: z.string().min(1, 'Edge ID is required'),
    layer: LayerSchema.optional()
}).strict();

/**
 * Propose Change tool arguments schema
 */
export const ProposeChangeArgsSchema = z.object({
    nodeId: z.string().optional(),
    filePath: z.string().optional(),
    name: z.string().optional(),
    summary: z.string().optional(),
    intention: z.string().optional(),
    additionalInfo: z.string().optional(),
    layer: LayerSchema.optional()
}).refine(
    (data) => data.nodeId || data.filePath,
    { message: 'Either nodeId or filePath must be provided' }
).strict();

/**
 * Set Layer tool arguments schema
 */
export const SetLayerArgsSchema = z.object({
    layer: LayerSchema
}).strict();

/**
 * Set Agent Only Mode tool arguments schema
 */
export const SetAgentOnlyModeArgsSchema = z.object({
    enabled: z.boolean()
}).strict();

/**
 * Semantic Clustering tool arguments schema
 */
export const SemanticClusteringArgsSchema = z.object({
    layer: LayerSchema.optional(),
    numClusters: z.number().int().min(2).max(20).optional(),
    description: z.string().optional()
}).strict();

/**
 * Type exports for TypeScript inference
 */
export type GetGraphArgs = z.infer<typeof GetGraphArgsSchema>;
export type UpdateNodeArgs = z.infer<typeof UpdateNodeArgsSchema>;
export type UpdateEdgeArgs = z.infer<typeof UpdateEdgeArgsSchema>;
export type AddNodeArgs = z.infer<typeof AddNodeArgsSchema>;
export type AddEdgeArgs = z.infer<typeof AddEdgeArgsSchema>;
export type RemoveNodeArgs = z.infer<typeof RemoveNodeArgsSchema>;
export type RemoveEdgeArgs = z.infer<typeof RemoveEdgeArgsSchema>;
export type ProposeChangeArgs = z.infer<typeof ProposeChangeArgsSchema>;
export type SetLayerArgs = z.infer<typeof SetLayerArgsSchema>;
export type SetAgentOnlyModeArgs = z.infer<typeof SetAgentOnlyModeArgsSchema>;
export type SemanticClusteringArgs = z.infer<typeof SemanticClusteringArgsSchema>;
