/**
 * Batch Operations Tools
 * 
 * Efficiently process multiple node/edge operations in a single transaction.
 * Benefits:
 * - Single validation pass
 * - Single file write (vs N writes)
 * - Atomic operations (all succeed or all fail)
 */

import { GraphStateManager, GraphNode, GraphEdge } from '../graph-state-manager.js';
import { getLayerGuidance, isNodeTypeRecommended, isEdgeTypeRecommended, suggestLayerForNodeType } from '../config/layer-guidance.js';

export interface BatchNodeOperation {
    action: 'add' | 'update' | 'delete';
    nodeId?: string;  // Required for update/delete
    node?: {  // Required for add
        label: string;
        type: string;
        roleDescription?: string;
        technology?: string;
        path?: string;
        parent?: string;
        supportsFeatures?: string[];
        supportedBy?: string[];
        [key: string]: any; // Allow additional properties
    };
    updates?: any;  // Required for update
}

export interface BatchEdgeOperation {
    action: 'add' | 'update' | 'delete';
    edgeId?: string;  // Required for update/delete
    edge?: {  // Required for add
        sourceId: string;
        targetId: string;
        edgeType?: string;
        label?: string;
        description?: string;
        [key: string]: any; // Allow additional properties
    };
    updates?: any;  // Required for update
}

export interface BatchOperationResult {
    success: boolean;
    totalOperations: number;
    successCount: number;
    failureCount: number;
    results: Array<{
        index: number;
        action: string;
        success: boolean;
        id?: string;
        error?: string;
    }>;
    warnings?: string[];
    layer: string;
    executionTimeMs: number;
}

/**
 * Process multiple node operations in a single batch
 */
export async function batchNodes(
    graphState: GraphStateManager,
    args: any
): Promise<BatchOperationResult> {
    const startTime = Date.now();
    const { operations, layer, atomic = true } = args;
    
    if (!Array.isArray(operations)) {
        throw new Error('operations must be an array');
    }
    
    if (operations.length === 0) {
        throw new Error('operations array cannot be empty');
    }
    
    const targetLayer = layer || graphState.getCurrentLayer();
    const results: BatchOperationResult['results'] = [];
    const warnings: string[] = [];
    let successCount = 0;
    let failureCount = 0;
    
    // Validate all operations first (fail fast)
    for (let i = 0; i < operations.length; i++) {
        const op = operations[i];
        
        if (!op.action || !['add', 'update', 'delete'].includes(op.action)) {
            if (atomic) {
                throw new Error(`Operation ${i}: Invalid action '${op.action}'. Must be 'add', 'update', or 'delete'`);
            }
            results.push({
                index: i,
                action: op.action || 'unknown',
                success: false,
                error: `Invalid action '${op.action}'`
            });
            failureCount++;
            continue;
        }
        
        if (op.action === 'add' && !op.node) {
            if (atomic) {
                throw new Error(`Operation ${i}: 'node' is required for add action`);
            }
            results.push({
                index: i,
                action: 'add',
                success: false,
                error: 'node is required for add action'
            });
            failureCount++;
            continue;
        }
        
        if ((op.action === 'update' || op.action === 'delete') && !op.nodeId) {
            if (atomic) {
                throw new Error(`Operation ${i}: 'nodeId' is required for ${op.action} action`);
            }
            results.push({
                index: i,
                action: op.action,
                success: false,
                error: `nodeId is required for ${op.action} action`
            });
            failureCount++;
            continue;
        }
        
        if (op.action === 'update' && !op.updates) {
            if (atomic) {
                throw new Error(`Operation ${i}: 'updates' is required for update action`);
            }
            results.push({
                index: i,
                action: 'update',
                success: false,
                error: 'updates is required for update action'
            });
            failureCount++;
            continue;
        }
    }
    
    // If atomic mode and any validation failed, don't proceed
    if (atomic && failureCount > 0) {
        throw new Error(`Batch validation failed: ${failureCount} operations have errors`);
    }
    
    // Execute operations
    const addedNodes: GraphNode[] = [];
    
    for (let i = 0; i < operations.length; i++) {
        const op = operations[i];
        
        // Skip already failed operations (in non-atomic mode)
        if (results[i]?.success === false) {
            continue;
        }
        
        try {
            if (op.action === 'add') {
                const { label, type, roleDescription, technology, path, parent, ...additionalProps } = op.node;
                const nodeId = graphState.generateNodeId(label);
                
                // Check if node type is recommended for this layer
                if (!isNodeTypeRecommended(targetLayer, type)) {
                    const suggestedLayer = suggestLayerForNodeType(type);
                    if (suggestedLayer) {
                        warnings.push(
                            `Operation ${i}: Node type '${type}' is typically used in '${suggestedLayer}' layer, not '${targetLayer}' layer`
                        );
                    }
                }
                
                const node: GraphNode = {
                    data: {
                        ...additionalProps,
                        id: nodeId,
                        label,
                        type,
                        layer: targetLayer,
                        roleDescription,
                        technology,
                        path,
                        parent,
                        isAgentAdded: true,
                        createdBy: 'ai-agent-batch',
                        createdAt: new Date().toISOString()
                    }
                };
                
                graphState.addNode(node, targetLayer);
                addedNodes.push(node);
                
                results.push({
                    index: i,
                    action: 'add',
                    success: true,
                    id: nodeId
                });
                successCount++;
                
            } else if (op.action === 'update') {
                graphState.updateNode(op.nodeId, op.updates, targetLayer);
                
                results.push({
                    index: i,
                    action: 'update',
                    success: true,
                    id: op.nodeId
                });
                successCount++;
                
            } else if (op.action === 'delete') {
                graphState.removeNode(op.nodeId, targetLayer);
                
                results.push({
                    index: i,
                    action: 'delete',
                    success: true,
                    id: op.nodeId
                });
                successCount++;
            }
            
        } catch (error) {
            const errorMessage = error instanceof Error ? error.message : String(error);
            
            if (atomic) {
                // In atomic mode, rollback all operations
                console.error(`[BatchNodes] Atomic batch failed at operation ${i}: ${errorMessage}`);
                
                // Rollback: remove all added nodes
                for (const addedNode of addedNodes) {
                    try {
                        graphState.removeNode(addedNode.data.id, targetLayer);
                    } catch (rollbackError) {
                        console.error(`[BatchNodes] Rollback failed for node ${addedNode.data.id}: ${rollbackError}`);
                    }
                }
                
                throw new Error(`Batch operation failed at operation ${i}: ${errorMessage}. All operations rolled back.`);
            } else {
                // In non-atomic mode, continue with other operations
                results.push({
                    index: i,
                    action: op.action,
                    success: false,
                    id: op.nodeId,
                    error: errorMessage
                });
                failureCount++;
            }
        }
    }
    
    const executionTimeMs = Date.now() - startTime;
    
    console.error(`[BatchNodes] Completed: ${successCount} succeeded, ${failureCount} failed in ${executionTimeMs}ms`);
    
    return {
        success: failureCount === 0,
        totalOperations: operations.length,
        successCount,
        failureCount,
        results,
        warnings: warnings.length > 0 ? warnings : undefined,
        layer: targetLayer,
        executionTimeMs
    };
}

/**
 * Process multiple edge operations in a single batch
 */
export async function batchEdges(
    graphState: GraphStateManager,
    args: any
): Promise<BatchOperationResult> {
    const startTime = Date.now();
    const { operations, layer, atomic = true } = args;
    
    if (!Array.isArray(operations)) {
        throw new Error('operations must be an array');
    }
    
    if (operations.length === 0) {
        throw new Error('operations array cannot be empty');
    }
    
    const targetLayer = layer || graphState.getCurrentLayer();
    const guidance = getLayerGuidance(targetLayer);
    const results: BatchOperationResult['results'] = [];
    let successCount = 0;
    let failureCount = 0;
    
    // Validate all operations first (fail fast in atomic mode)
    for (let i = 0; i < operations.length; i++) {
        const op = operations[i];
        
        if (!op.action || !['add', 'update', 'delete'].includes(op.action)) {
            if (atomic) {
                throw new Error(`Operation ${i}: Invalid action '${op.action}'. Must be 'add', 'update', or 'delete'`);
            }
            results.push({
                index: i,
                action: op.action || 'unknown',
                success: false,
                error: `Invalid action '${op.action}'`
            });
            failureCount++;
            continue;
        }
        
        if (op.action === 'add' && !op.edge) {
            if (atomic) {
                throw new Error(`Operation ${i}: 'edge' is required for add action`);
            }
            results.push({
                index: i,
                action: 'add',
                success: false,
                error: 'edge is required for add action'
            });
            failureCount++;
            continue;
        }
        
        if ((op.action === 'update' || op.action === 'delete') && !op.edgeId) {
            if (atomic) {
                throw new Error(`Operation ${i}: 'edgeId' is required for ${op.action} action`);
            }
            results.push({
                index: i,
                action: op.action,
                success: false,
                error: `edgeId is required for ${op.action} action`
            });
            failureCount++;
            continue;
        }
        
        if (op.action === 'update' && !op.updates) {
            if (atomic) {
                throw new Error(`Operation ${i}: 'updates' is required for update action`);
            }
            results.push({
                index: i,
                action: 'update',
                success: false,
                error: 'updates is required for update action'
            });
            failureCount++;
            continue;
        }
    }
    
    // If atomic mode and any validation failed, don't proceed
    if (atomic && failureCount > 0) {
        throw new Error(`Batch validation failed: ${failureCount} operations have errors`);
    }
    
    // Execute operations
    const addedEdges: GraphEdge[] = [];
    
    for (let i = 0; i < operations.length; i++) {
        const op = operations[i];
        
        // Skip already failed operations (in non-atomic mode)
        if (results[i]?.success === false) {
            continue;
        }
        
        try {
            if (op.action === 'add') {
                const { sourceId, targetId, edgeType, label, description, ...additionalProps } = op.edge;
                const edgeId = graphState.generateEdgeId(sourceId, targetId);
                
                // Validate edge type for strict layers
                if (edgeType && !isEdgeTypeRecommended(targetLayer, edgeType)) {
                    if (guidance.strictValidation) {
                        throw new Error(
                            `❌ Edge type '${edgeType}' is not allowed in '${targetLayer}' layer. ` +
                            `Allowed: ${guidance.recommendedEdgeTypes.join(', ')}`
                        );
                    }
                }
                
                const edge: GraphEdge = {
                    data: {
                        id: edgeId,
                        source: sourceId,
                        target: targetId,
                        edgeType,
                        label,
                        description,
                        layer: targetLayer,
                        createdBy: 'ai-agent-batch',
                        createdAt: new Date().toISOString(),
                        ...additionalProps
                    }
                };
                
                graphState.addEdge(edge, targetLayer);
                addedEdges.push(edge);
                
                results.push({
                    index: i,
                    action: 'add',
                    success: true,
                    id: edgeId
                });
                successCount++;
                
            } else if (op.action === 'update') {
                // Validate edge type if being updated
                if (op.updates?.edgeType && !isEdgeTypeRecommended(targetLayer, op.updates.edgeType)) {
                    if (guidance.strictValidation) {
                        throw new Error(
                            `❌ Edge type '${op.updates.edgeType}' is not allowed in '${targetLayer}' layer. ` +
                            `Allowed: ${guidance.recommendedEdgeTypes.join(', ')}`
                        );
                    }
                }
                
                graphState.updateEdge(op.edgeId, op.updates, targetLayer);
                
                results.push({
                    index: i,
                    action: 'update',
                    success: true,
                    id: op.edgeId
                });
                successCount++;
                
            } else if (op.action === 'delete') {
                graphState.removeEdge(op.edgeId, targetLayer);
                
                results.push({
                    index: i,
                    action: 'delete',
                    success: true,
                    id: op.edgeId
                });
                successCount++;
            }
            
        } catch (error) {
            const errorMessage = error instanceof Error ? error.message : String(error);
            
            if (atomic) {
                // In atomic mode, rollback all operations
                console.error(`[BatchEdges] Atomic batch failed at operation ${i}: ${errorMessage}`);
                
                // Rollback: remove all added edges
                for (const addedEdge of addedEdges) {
                    try {
                        graphState.removeEdge(addedEdge.data.id, targetLayer);
                    } catch (rollbackError) {
                        console.error(`[BatchEdges] Rollback failed for edge ${addedEdge.data.id}: ${rollbackError}`);
                    }
                }
                
                throw new Error(`Batch operation failed at operation ${i}: ${errorMessage}. All operations rolled back.`);
            } else {
                // In non-atomic mode, continue with other operations
                results.push({
                    index: i,
                    action: op.action,
                    success: false,
                    id: op.edgeId,
                    error: errorMessage
                });
                failureCount++;
            }
        }
    }
    
    const executionTimeMs = Date.now() - startTime;
    
    console.error(`[BatchEdges] Completed: ${successCount} succeeded, ${failureCount} failed in ${executionTimeMs}ms`);
    
    return {
        success: failureCount === 0,
        totalOperations: operations.length,
        successCount,
        failureCount,
        results,
        layer: targetLayer,
        executionTimeMs
    };
}
