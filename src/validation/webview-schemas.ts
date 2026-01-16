/**
 * Webview Message Validation Schemas
 * 
 * Runtime validation schemas for messages passed between extension and webview.
 * Ensures type safety for all communication across the boundary.
 */

import { z } from 'zod';

/**
 * Layout type schema
 */
export const LayoutTypeSchema = z.enum([
    'fcose',
    'swimlane',
    'dagre',
    'concentric',
    'grid',
    'cose',
    'circle',
    'organic'
]);

/**
 * Layer schema
 */
export const LayerSchema = z.enum(['blueprint', 'architecture', 'implementation', 'dependencies']);

/**
 * Base message schema
 */
const BaseMessageSchema = z.object({
    type: z.string()
});

/**
 * Ready message (webview signals it's ready)
 */
export const ReadyMessageSchema = BaseMessageSchema.extend({
    type: z.literal('ready')
}).strict();

/**
 * Request graph data message
 */
export const RequestGraphMessageSchema = BaseMessageSchema.extend({
    type: z.literal('requestGraph')
}).strict();

/**
 * Update graph message (full replace)
 */
export const UpdateGraphMessageSchema = BaseMessageSchema.extend({
    type: z.literal('updateGraph'),
    data: z.object({
        nodes: z.array(z.any()),
        edges: z.array(z.any())
    })
}).strict();

/**
 * Update graph incremental message
 */
export const UpdateGraphIncrementalMessageSchema = BaseMessageSchema.extend({
    type: z.literal('updateGraphIncremental'),
    data: z.object({
        addedNodes: z.array(z.any()),
        addedEdges: z.array(z.any()),
        removedNodeIds: z.array(z.string()),
        removedEdgeIds: z.array(z.string()).optional(),
        newlyAddedNodeIds: z.array(z.string()).optional()
    })
}).strict();

/**
 * Update node properties message
 */
export const UpdateNodePropertiesMessageSchema = BaseMessageSchema.extend({
    type: z.literal('updateNodeProperties'),
    data: z.object({
        nodeUpdates: z.record(z.string(), z.any())
    })
}).strict();

/**
 * Update edge properties message
 */
export const UpdateEdgePropertiesMessageSchema = BaseMessageSchema.extend({
    type: z.literal('updateEdgeProperties'),
    data: z.object({
        edgeUpdates: z.record(z.string(), z.any())
    })
}).strict();

/**
 * Set layout message
 */
export const SetLayoutMessageSchema = BaseMessageSchema.extend({
    type: z.literal('setLayout'),
    layout: LayoutTypeSchema
}).strict();

/**
 * Set layer message
 */
export const SetLayerMessageSchema = BaseMessageSchema.extend({
    type: z.literal('setLayer'),
    layer: LayerSchema
}).strict();

/**
 * Node selected message (from webview to extension)
 */
export const NodeSelectedMessageSchema = BaseMessageSchema.extend({
    type: z.literal('nodeSelected'),
    nodeId: z.string(),
    filePath: z.string().optional()
}).strict();

/**
 * Open file message (from webview to extension)
 */
export const OpenFileMessageSchema = BaseMessageSchema.extend({
    type: z.literal('openFile'),
    filePath: z.string().min(1, 'File path is required')
}).strict();

/**
 * Stats update message (from webview to extension)
 */
export const StatsUpdateMessageSchema = BaseMessageSchema.extend({
    type: z.literal('stats'),
    stats: z.object({
        nodes: z.number().int().nonnegative(),
        edges: z.number().int().nonnegative(),
        visibleNodes: z.number().int().nonnegative().optional(),
        visibleEdges: z.number().int().nonnegative().optional()
    })
}).strict();

/**
 * Zoom update message (from webview to extension)
 */
export const ZoomUpdateMessageSchema = BaseMessageSchema.extend({
    type: z.literal('zoom'),
    level: z.number().min(0.1).max(10)
}).strict();

/**
 * Error message
 */
export const ErrorMessageSchema = BaseMessageSchema.extend({
    type: z.literal('error'),
    message: z.string(),
    details: z.string().optional()
}).strict();

/**
 * Log message (from webview to extension)
 */
export const LogMessageSchema = BaseMessageSchema.extend({
    type: z.literal('log'),
    message: z.string(),
    level: z.enum(['debug', 'info', 'warn', 'error']).optional()
}).strict();

/**
 * Union of all webview-to-extension messages
 */
export const WebviewToExtensionMessageSchema = z.discriminatedUnion('type', [
    ReadyMessageSchema,
    RequestGraphMessageSchema,
    NodeSelectedMessageSchema,
    OpenFileMessageSchema,
    StatsUpdateMessageSchema,
    ZoomUpdateMessageSchema,
    ErrorMessageSchema,
    LogMessageSchema
]);

/**
 * Union of all extension-to-webview messages
 */
export const ExtensionToWebviewMessageSchema = z.discriminatedUnion('type', [
    UpdateGraphMessageSchema,
    UpdateGraphIncrementalMessageSchema,
    UpdateNodePropertiesMessageSchema,
    UpdateEdgePropertiesMessageSchema,
    SetLayoutMessageSchema,
    SetLayerMessageSchema,
    ErrorMessageSchema
]);

/**
 * Type exports for TypeScript inference
 */
export type ReadyMessage = z.infer<typeof ReadyMessageSchema>;
export type RequestGraphMessage = z.infer<typeof RequestGraphMessageSchema>;
export type UpdateGraphMessage = z.infer<typeof UpdateGraphMessageSchema>;
export type UpdateGraphIncrementalMessage = z.infer<typeof UpdateGraphIncrementalMessageSchema>;
export type UpdateNodePropertiesMessage = z.infer<typeof UpdateNodePropertiesMessageSchema>;
export type UpdateEdgePropertiesMessage = z.infer<typeof UpdateEdgePropertiesMessageSchema>;
export type SetLayoutMessage = z.infer<typeof SetLayoutMessageSchema>;
export type SetLayerMessage = z.infer<typeof SetLayerMessageSchema>;
export type NodeSelectedMessage = z.infer<typeof NodeSelectedMessageSchema>;
export type OpenFileMessage = z.infer<typeof OpenFileMessageSchema>;
export type StatsUpdateMessage = z.infer<typeof StatsUpdateMessageSchema>;
export type ZoomUpdateMessage = z.infer<typeof ZoomUpdateMessageSchema>;
export type ErrorMessage = z.infer<typeof ErrorMessageSchema>;
export type LogMessage = z.infer<typeof LogMessageSchema>;

export type WebviewToExtensionMessage = z.infer<typeof WebviewToExtensionMessageSchema>;
export type ExtensionToWebviewMessage = z.infer<typeof ExtensionToWebviewMessageSchema>;
