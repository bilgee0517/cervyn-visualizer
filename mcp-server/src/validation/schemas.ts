/**
 * MCP Tool Validation Schemas
 * 
 * Runtime validation schemas for MCP tool arguments using Zod.
 */

import { z } from 'zod';

/**
 * Layer enum schema (5-layer system with workflow)
 */
export const LayerSchema = z.enum(['workflow', 'context', 'container', 'component', 'code']);

/**
 * Progress status enum schema
 */
export const ProgressStatusSchema = z.enum(['done', 'in-progress', 'not-started', 'error']);

/**
 * Edge type enum schema
 * Includes all edge types across all layers
 */
export const EdgeTypeSchema = z.enum([
    // Code & Component layer edges
    'imports',
    'calls',
    'extends',
    'implements',
    'depends-on',  // NOTE: Only for shared-kernel relationships in component layer
    'uses',
    // Component layer edges (DDD-inspired)
    'owns',           // bounded-context → use-case/domain-model
    'invokes',        // use-case → domain-model/policy
    'persists-via',   // use-case → repository
    'implemented-by', // repository → adapter/storage-module
    'integrates-via', // use-case → adapter
    // Workflow layer edges (product semantics only)
    'depends-on-feature',   // Feature dependency (replaces "requires")
    'part-of',              // Feature composition (replaces "composed-of")
    'primary-flow',         // Main journey step ordering
    'alternate-flow',       // Variant paths or edge cases
    'triggers',             // Feature triggers another feature
    // Context layer edges (boundary-focused)
    'authenticates-with',   // Authentication relationships
    'reads-from',           // Data reading from external source
    'writes-to',            // Data writing to external target
    'sends-event-to',       // Event publishing to external system
    'receives-event-from',  // Event subscription from external system
    'integrates-with',      // Generic bidirectional integration
    // Legacy context edges (deprecated - use specific types above)
    'sends-data-to',        // Use 'writes-to' instead
    'receives-data-from',   // Use 'reads-from' instead
    // Container layer edges (runtime semantics)
    'http-request',         // Sync: REST/HTTP call
    'rpc-call',             // Sync: gRPC/RPC call
    'db-query',             // Sync: Database query
    'cache-read',           // Sync: Cache lookup
    'cache-write',          // Sync: Cache update
    'publish-event',        // Async: Publish to message broker
    'consume-event',        // Async: Subscribe/consume from broker
    'enqueue-job',          // Async: Add job to worker queue
    'replicates-to',        // Data: Replication flow
    'syncs-with',           // Data: Bidirectional sync
    // Legacy container edges (deprecated - use runtime-specific types above)
    'publishes-to',         // Use 'publish-event' instead
    'subscribes-to',        // Use 'consume-event' instead
    'calls',                // Use 'http-request' or 'rpc-call' instead
    'synchronizes-with'     // Use 'syncs-with' instead
]);

/**
 * Node type schemas by layer
 */
export const WorkflowNodeTypeSchema = z.enum(['feature', 'feature-group', 'user-journey']);
export const ContextNodeTypeSchema = z.enum([
    'actor',               // People, users, roles, personas (replaces 'person', 'user-role')
    'external-system',     // Generic external systems
    'external-api',        // External REST/GraphQL APIs
    'external-datastore',  // Databases, data warehouses, caches (replaces 'database')
    'external-service'     // SaaS services like Auth0, Stripe, Twilio (replaces 'third-party-service', 'external-dependency')
]);
export const ContainerNodeTypeSchema = z.enum(['frontend', 'service', 'worker', 'gateway', 'message-broker', 'datastore', 'cache', 'object-store']);
export const ComponentNodeTypeSchema = z.enum([
    'bounded-context',  // DDD bounded context - contains use-cases and domain-models
    'use-case',         // Business use case within a bounded context
    'domain-model',     // Domain model/entity
    'adapter',          // Adapter (port-adapter pattern)
    'repository',       // Repository pattern
    'policy',           // Business policy/rule
    'subsystem',        // Escape hatch for large chunks
    'shared-kernel'     // Shared kernel (shared domain model)
]);
export const CodeNodeTypeSchema = z.enum(['file', 'directory', 'class', 'function', 'interface', 'type', 'concept']);

/**
 * Combined node type schema (all valid types across all layers)
 */
export const NodeTypeSchema = z.union([
    WorkflowNodeTypeSchema,
    ContextNodeTypeSchema,
    ContainerNodeTypeSchema,
    ComponentNodeTypeSchema,
    CodeNodeTypeSchema
]);

/**
 * Get Graph tool arguments schema
 */
export const GetGraphArgsSchema = z.object({
    layer: LayerSchema.optional()
}).strict();

/**
 * Add Node tool arguments schema
 */
export const AddNodeArgsSchema = z.object({
    label: z.string().min(1, 'Label is required'),
    type: NodeTypeSchema, // Validate against known node types
    layer: LayerSchema.optional(),
    roleDescription: z.string().optional(),
    technology: z.string().optional(),
    path: z.string().optional(),
    parent: z.string().optional(),
    // Component layer specific fields
    responsibility: z.string().optional(), // REQUIRED for component layer: 1 sentence describing what responsibility it owns
    ownedData: z.array(z.string()).optional(), // Optional: what state/data this component owns
    publicSurface: z.array(z.string()).optional(), // Optional: routes/events exposed by this component
    // Feature annotation properties
    supportsFeatures: z.array(z.string()).optional(), // For all layers except workflow
    supportedBy: z.array(z.string()).optional()       // For workflow layer only
}).passthrough(); // Allow additional properties for enrichment data

/**
 * Delete Node tool arguments schema
 */
export const DeleteNodeArgsSchema = z.object({
    nodeId: z.string().min(1, 'Node ID is required'),
    layer: LayerSchema.optional()
}).strict();

/**
 * Add Edge tool arguments schema
 */
export const AddEdgeArgsSchema = z.object({
    sourceId: z.string().min(1, 'Source ID is required'),
    targetId: z.string().min(1, 'Target ID is required'),
    edgeType: EdgeTypeSchema.optional(),
    label: z.string().optional(),
    description: z.string().optional(), // STRONGLY RECOMMENDED: Detailed description of what flows through this edge
    layer: LayerSchema.optional()
}).passthrough(); // Allow additional properties

/**
 * Delete Edge tool arguments schema
 */
export const DeleteEdgeArgsSchema = z.object({
    edgeId: z.string().min(1, 'Edge ID is required'),
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
    layer: LayerSchema.optional(),
    // Feature annotation properties
    supportsFeatures: z.array(z.string()).optional(),
    supportedBy: z.array(z.string()).optional()
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
