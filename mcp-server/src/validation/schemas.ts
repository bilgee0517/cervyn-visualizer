/**
 * MCP Tool Validation Schemas
 * 
 * Runtime validation schemas for MCP tool arguments using Zod.
 */

import { z } from 'zod';

/**
 * Layer enum schema
 */
export const LayerSchema = z.enum(['blueprint', 'architecture', 'implementation', 'dependencies']);

/**
 * Progress status enum schema
 */
export const ProgressStatusSchema = z.enum(['done', 'in-progress', 'not-started', 'error']);

/**
 * Edge type enum schema
 */
export const EdgeTypeSchema = z.enum(['imports', 'calls', 'extends', 'implements', 'depends-on', 'uses']);

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
 * Validation error formatter
 */
export function formatValidationError(error: z.ZodError): string {
    const issues = error.issues.map(issue => {
        const path = issue.path.join('.');
        return `${path || 'root'}: ${issue.message}`;
    });
    return `Validation failed:\n${issues.join('\n')}`;
}
