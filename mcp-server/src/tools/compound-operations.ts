/**
 * Compound Node Operations
 * 
 * Tools for creating and managing hierarchical compound nodes (parent-child relationships).
 * Compound nodes are containers that can hold other nodes, useful for:
 * - Folder/file hierarchies
 * - Logical groupings (e.g., feature clusters)
 * - Namespaces (e.g., package structures)
 */

import { GraphStateManager, GraphNode } from '../graph-state-manager.js';
import { getLayerGuidance } from '../config/layer-guidance.js';

export interface CompoundNodeInfo {
    nodeId: string;
    label: string;
    type: string;
    isCompound: boolean;
    groupType?: 'folder' | 'logical' | 'namespace' | 'file';
    childCount: number;
    // children calculated dynamically from parent references
    isCollapsed: boolean;
    depth: number;
    parent?: string;
}

/**
 * Create a compound node (parent node that can contain other nodes)
 */
export async function createCompoundNode(
    graphState: GraphStateManager,
    args: any
): Promise<any> {
    const { 
        label, 
        type = 'folder', 
        groupType = 'logical',
        layer,
        roleDescription,
        technology,
        parent,
        isCollapsed = true,  // Default to collapsed like code layer
        ...additionalProps 
    } = args;
    
    if (!label) {
        throw new Error('label is required');
    }
    
    const targetLayer = layer || graphState.getCurrentLayer();
    const nodeId = graphState.generateNodeId(label);
    
    const compoundNode: GraphNode = {
        data: {
            ...additionalProps,
            id: nodeId,
            label,
            type,
            layer: targetLayer,
            roleDescription,
            technology,
            parent,
            isCompound: true,
            isCollapsed,
            groupType,
            childCount: 0,
            // children array removed - Cytoscape uses parent references
            isAgentAdded: true,
            createdBy: 'ai-agent',
            createdAt: new Date().toISOString()
        }
    };
    
    graphState.addNode(compoundNode, targetLayer);
    
    console.error(`[CompoundNode] Created compound node '${nodeId}' (${groupType}) in layer '${targetLayer}'`);
    
    return {
        success: true,
        message: `Compound node '${label}' created successfully`,
        nodeId,
        layer: targetLayer,
        isCompound: true,
        groupType,
        childCount: 0
    };
}

/**
 * Add child nodes to a compound node
 */
export async function addChildNodes(
    graphState: GraphStateManager,
    args: any
): Promise<any> {
    const { parentId, childIds, layer } = args;
    
    if (!parentId) {
        throw new Error('parentId is required');
    }
    
    if (!childIds || !Array.isArray(childIds) || childIds.length === 0) {
        throw new Error('childIds must be a non-empty array');
    }
    
    const targetLayer = layer || graphState.getCurrentLayer();
    const layerIndexes = graphState.getIndexes(targetLayer);
    
    // Verify parent exists and is compound
    const parentNode = layerIndexes.getNodeById(parentId);
    if (!parentNode) {
        throw new Error(`Parent node '${parentId}' not found in layer '${targetLayer}'`);
    }
    
    if (!parentNode.data.isCompound) {
        throw new Error(`Node '${parentId}' is not a compound node. Set isCompound=true first.`);
    }
    
    // Calculate current children dynamically from parent references
    const allNodes = layerIndexes.getAllNodes();
    const existingChildren = allNodes
        .filter(n => n.data.parent === parentId)
        .map(n => n.data.id);
    const newChildren = [...new Set([...existingChildren, ...childIds])]; // Deduplicate
    
    // Update parent node - ensure isCollapsed is set and update childCount
    const updateData: any = {
        childCount: newChildren.length
    };
    
    // If isCollapsed is not set, default to true (like code layer)
    if (parentNode.data.isCollapsed === undefined) {
        updateData.isCollapsed = true;
    }
    
    graphState.updateNode(parentId, updateData, targetLayer);
    
    // Update child nodes to set parent reference
    const updatedChildren: string[] = [];
    const failedChildren: Array<{childId: string, error: string}> = [];
    
    for (const childId of childIds) {
        try {
            const childNode = layerIndexes.getNodeById(childId);
            if (!childNode) {
                failedChildren.push({ childId, error: 'Node not found' });
                continue;
            }
            
            // Remove from old parent if exists
            if (childNode.data.parent && childNode.data.parent !== parentId) {
                const oldParentId = childNode.data.parent;
                const oldParent = layerIndexes.getNodeById(oldParentId);
                if (oldParent) {
                    // Calculate remaining children dynamically
                    const remainingChildren = allNodes
                        .filter(n => n.data.parent === oldParentId && n.data.id !== childId)
                        .length;
                    graphState.updateNode(oldParentId, {
                        childCount: remainingChildren
                    } as any, targetLayer);
                }
            }
            
            // Set new parent
            graphState.updateNode(childId, {
                parent: parentId
            }, targetLayer);
            
            updatedChildren.push(childId);
            
        } catch (error) {
            failedChildren.push({ 
                childId, 
                error: error instanceof Error ? error.message : String(error) 
            });
        }
    }
    
    console.error(`[CompoundNode] Added ${updatedChildren.length} children to '${parentId}'`);
    
    return {
        success: failedChildren.length === 0,
        message: `Added ${updatedChildren.length}/${childIds.length} children to '${parentId}'`,
        parentId,
        addedChildren: updatedChildren,
        failedChildren: failedChildren.length > 0 ? failedChildren : undefined,
        totalChildren: newChildren.length,
        layer: targetLayer
    };
}

/**
 * Remove child nodes from a compound node
 */
export async function removeChildNodes(
    graphState: GraphStateManager,
    args: any
): Promise<any> {
    const { parentId, childIds, layer } = args;
    
    if (!parentId) {
        throw new Error('parentId is required');
    }
    
    if (!childIds || !Array.isArray(childIds) || childIds.length === 0) {
        throw new Error('childIds must be a non-empty array');
    }
    
    const targetLayer = layer || graphState.getCurrentLayer();
    const layerIndexes = graphState.getIndexes(targetLayer);
    
    // Verify parent exists
    const parentNode = layerIndexes.getNodeById(parentId);
    if (!parentNode) {
        throw new Error(`Parent node '${parentId}' not found in layer '${targetLayer}'`);
    }
    
    // Calculate remaining children dynamically from parent references
    const allNodes = layerIndexes.getAllNodes();
    const remainingChildrenCount = allNodes
        .filter(n => n.data.parent === parentId && !childIds.includes(n.data.id))
        .length;
    
    // Update parent node - only childCount
    graphState.updateNode(parentId, {
        childCount: remainingChildrenCount
    } as any, targetLayer);
    
    // Update child nodes - remove parent reference
    const removedChildren: string[] = [];
    
    for (const childId of childIds) {
        const childNode = layerIndexes.getNodeById(childId);
        if (childNode && childNode.data.parent === parentId) {
            graphState.updateNode(childId, {
                parent: undefined
            }, targetLayer);
            removedChildren.push(childId);
        }
    }
    
    console.error(`[CompoundNode] Removed ${removedChildren.length} children from '${parentId}'`);
    
    return {
        success: true,
        message: `Removed ${removedChildren.length} children from '${parentId}'`,
        parentId,
        removedChildren,
        remainingChildren: remainingChildrenCount,
        layer: targetLayer
    };
}

/**
 * Move nodes to a different parent (or remove from parent)
 */
export async function moveNodes(
    graphState: GraphStateManager,
    args: any
): Promise<any> {
    const { nodeIds, targetParentId, layer } = args;
    
    if (!nodeIds || !Array.isArray(nodeIds) || nodeIds.length === 0) {
        throw new Error('nodeIds must be a non-empty array');
    }
    
    const targetLayer = layer || graphState.getCurrentLayer();
    const layerIndexes = graphState.getIndexes(targetLayer);
    
    // If targetParentId is null/undefined, remove from parent
    if (targetParentId !== null && targetParentId !== undefined) {
        // Verify target parent exists and is compound
        const targetParent = layerIndexes.getNodeById(targetParentId);
        if (!targetParent) {
            throw new Error(`Target parent '${targetParentId}' not found in layer '${targetLayer}'`);
        }
        
        if (!targetParent.data.isCompound) {
            throw new Error(`Node '${targetParentId}' is not a compound node`);
        }
    }
    
    const movedNodes: string[] = [];
    const failedNodes: Array<{nodeId: string, error: string}> = [];
    
    for (const nodeId of nodeIds) {
        try {
            const node = layerIndexes.getNodeById(nodeId);
            if (!node) {
                failedNodes.push({ nodeId, error: 'Node not found' });
                continue;
            }
            
            // Remove from old parent
            if (node.data.parent) {
                const oldParentId = node.data.parent;
                const oldParent = layerIndexes.getNodeById(oldParentId);
                if (oldParent) {
                    // Calculate remaining children dynamically
                    const allNodes = layerIndexes.getAllNodes();
                    const remainingChildren = allNodes
                        .filter(n => n.data.parent === oldParentId && n.data.id !== nodeId)
                        .length;
                    graphState.updateNode(oldParentId, {
                        childCount: remainingChildren
                    } as any, targetLayer);
                }
            }
            
            // Add to new parent (or set to undefined)
            if (targetParentId) {
                graphState.updateNode(nodeId, {
                    parent: targetParentId
                }, targetLayer);
                
                // Update target parent's child count
                const targetParent = layerIndexes.getNodeById(targetParentId);
                if (targetParent) {
                    // Calculate new child count dynamically
                    const allNodes = layerIndexes.getAllNodes();
                    const newChildCount = allNodes
                        .filter(n => n.data.parent === targetParentId)
                        .length;
                    graphState.updateNode(targetParentId, {
                        childCount: newChildCount
                    } as any, targetLayer);
                }
            } else {
                graphState.updateNode(nodeId, {
                    parent: undefined
                }, targetLayer);
            }
            
            movedNodes.push(nodeId);
            
        } catch (error) {
            failedNodes.push({ 
                nodeId, 
                error: error instanceof Error ? error.message : String(error) 
            });
        }
    }
    
    const action = targetParentId ? `moved to '${targetParentId}'` : 'removed from parent';
    console.error(`[CompoundNode] ${movedNodes.length} nodes ${action}`);
    
    return {
        success: failedNodes.length === 0,
        message: `${movedNodes.length}/${nodeIds.length} nodes ${action}`,
        movedNodes,
        failedNodes: failedNodes.length > 0 ? failedNodes : undefined,
        targetParentId,
        layer: targetLayer
    };
}

/**
 * Get compound node hierarchy (parent-child tree)
 */
export async function getCompoundHierarchy(
    graphState: GraphStateManager,
    args: any
): Promise<any> {
    const { rootNodeId, layer, maxDepth = 10 } = args;
    
    const targetLayer = layer || graphState.getCurrentLayer();
    const layerIndexes = graphState.getIndexes(targetLayer);
    
    const buildHierarchy = (nodeId: string, depth: number): CompoundNodeInfo | null => {
        if (depth > maxDepth) return null;
        
        const node = layerIndexes.getNodeById(nodeId);
        if (!node) return null;
        
        // Calculate children dynamically from parent references
        const allNodes = layerIndexes.getAllNodes();
        const children = allNodes
            .filter(n => n.data.parent === nodeId)
            .map(n => n.data.id);
        const childInfos: CompoundNodeInfo[] = [];
        
        // Recursively build child hierarchy
        if (node.data.isCompound && !node.data.isCollapsed) {
            for (const childId of children) {
                const childInfo = buildHierarchy(childId, depth + 1);
                if (childInfo) {
                    childInfos.push(childInfo);
                }
            }
        }
        
        return {
            nodeId: node.data.id,
            label: node.data.label,
            type: node.data.type || 'unknown',
            isCompound: node.data.isCompound || false,
            groupType: node.data.groupType,
            childCount: children.length,
            // children array removed - calculated dynamically
            isCollapsed: node.data.isCollapsed || false,
            depth,
            parent: node.data.parent
        };
    };
    
    let hierarchy;
    if (rootNodeId) {
        // Get hierarchy starting from specific node
        hierarchy = buildHierarchy(rootNodeId, 0);
        if (!hierarchy) {
            throw new Error(`Root node '${rootNodeId}' not found in layer '${targetLayer}'`);
        }
    } else {
        // Get all root nodes (nodes without parents) and their hierarchies
        const allNodes = layerIndexes.getAllNodes();
        const rootNodes = allNodes.filter(n => !n.data.parent);
        hierarchy = rootNodes.map(n => buildHierarchy(n.data.id, 0)).filter(h => h !== null);
    }
    
    console.error(`[CompoundNode] Retrieved hierarchy for layer '${targetLayer}'`);
    
    return {
        success: true,
        layer: targetLayer,
        hierarchy,
        maxDepth
    };
}

/**
 * Toggle collapse state of a compound node
 */
export async function toggleCompoundCollapse(
    graphState: GraphStateManager,
    args: any
): Promise<any> {
    const { nodeId, isCollapsed, layer } = args;
    
    if (!nodeId) {
        throw new Error('nodeId is required');
    }
    
    const targetLayer = layer || graphState.getCurrentLayer();
    const layerIndexes = graphState.getIndexes(targetLayer);
    
    const node = layerIndexes.getNodeById(nodeId);
    if (!node) {
        throw new Error(`Node '${nodeId}' not found in layer '${targetLayer}'`);
    }
    
    if (!node.data.isCompound) {
        throw new Error(`Node '${nodeId}' is not a compound node`);
    }
    
    const newCollapsedState = isCollapsed !== undefined ? isCollapsed : !node.data.isCollapsed;
    
    graphState.updateNode(nodeId, {
        isCollapsed: newCollapsedState
    }, targetLayer);
    
    console.error(`[CompoundNode] Toggled collapse state for '${nodeId}': ${newCollapsedState}`);
    
    return {
        success: true,
        message: `Compound node '${nodeId}' is now ${newCollapsedState ? 'collapsed' : 'expanded'}`,
        nodeId,
        isCollapsed: newCollapsedState,
        childCount: node.data.childCount || 0,
        layer: targetLayer
    };
}

/**
 * Convert a regular node to a compound node
 */
export async function convertToCompound(
    graphState: GraphStateManager,
    args: any
): Promise<any> {
    const { nodeId, groupType = 'logical', layer } = args;
    
    if (!nodeId) {
        throw new Error('nodeId is required');
    }
    
    const targetLayer = layer || graphState.getCurrentLayer();
    const layerIndexes = graphState.getIndexes(targetLayer);
    
    const node = layerIndexes.getNodeById(nodeId);
    if (!node) {
        throw new Error(`Node '${nodeId}' not found in layer '${targetLayer}'`);
    }
    
    if (node.data.isCompound) {
        return {
            success: true,
            message: `Node '${nodeId}' is already a compound node`,
            nodeId,
            isCompound: true,
            layer: targetLayer
        };
    }
    
    graphState.updateNode(nodeId, {
        isCompound: true,
        groupType,
        childCount: 0,
        isCollapsed: true  // Default to collapsed like code layer
    } as any, targetLayer);
    
    console.error(`[CompoundNode] Converted '${nodeId}' to compound node (${groupType})`);
    
    return {
        success: true,
        message: `Node '${nodeId}' converted to compound node`,
        nodeId,
        isCompound: true,
        groupType,
        layer: targetLayer
    };
}
