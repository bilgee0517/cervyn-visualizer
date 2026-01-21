/**
 * Graph Operations Tools
 * Tools for adding, removing, and updating nodes and edges
 */

import { GraphStateManager, GraphNode, GraphEdge } from '../graph-state-manager.js';
import { getLayerGuidance, isNodeTypeRecommended, isEdgeTypeRecommended, suggestLayerForNodeType } from '../config/layer-guidance.js';

export async function addNode(graphState: GraphStateManager, args: any) {
    const { label, type, layer, roleDescription, technology, path, parent, ...additionalProps } = args;

    const targetLayer = layer || graphState.getCurrentLayer();
    const nodeId = graphState.generateNodeId(label);
    
    // Validation: Check if node type is recommended for this layer
    const warnings: string[] = [];
    let recommendations: any = {};
    const guidance = getLayerGuidance(targetLayer);
    
    if (!isNodeTypeRecommended(targetLayer, type)) {
        const suggestedLayer = suggestLayerForNodeType(type);
        
        // STRICT VALIDATION: Block invalid types for strict layers
        if (guidance.strictValidation) {
            throw new Error(
                `❌ Node type '${type}' is not allowed in '${targetLayer}' layer.\n\n` +
                `✅ Allowed types: ${guidance.recommendedNodeTypes.join(', ')}\n\n` +
                `💡 This layer enforces strict type validation to ensure correct visual styling.\n` +
                (suggestedLayer ? `   Suggested layer for '${type}': ${suggestedLayer}` : '')
            );
        }
        
        // SOFT VALIDATION: Warnings for non-strict layers
        if (suggestedLayer) {
            warnings.push(
                `⚠️  Node type '${type}' is typically used in '${suggestedLayer}' layer, not '${targetLayer}' layer`
            );
            warnings.push(
                `Consider: ${getLayerGuidance(suggestedLayer).purpose}`
            );
            recommendations.suggestedLayer = suggestedLayer;
        } else {
            warnings.push(
                `⚠️  Node type '${type}' is not in the recommended types for '${targetLayer}' layer`
            );
        }
        
        warnings.push(
            `💡 Recommended types for '${targetLayer}': ${guidance.recommendedNodeTypes.slice(0, 5).join(', ')}`
        );
        recommendations.suggestedNodeTypes = guidance.recommendedNodeTypes;
        recommendations.nodeTypeMapping = guidance.nodeTypeMapping;
    }
    
    const node: GraphNode = {
        data: {
            ...additionalProps, // Include any additional enrichment data (cline, yutori, macrascope)
            id: nodeId,
            label,
            type,
            layer: targetLayer,
            roleDescription,
            technology,
            path,
            parent,
            isAgentAdded: true, // Always mark as agent-added
            createdBy: 'ai-agent',
            createdAt: new Date().toISOString()
        }
    };

    graphState.addNode(node, layer);

    const response: any = {
        success: true,
        message: `Node '${label}' added successfully`,
        nodeId,
        layer: targetLayer
    };
    
    // Add warnings if any
    if (warnings.length > 0) {
        response.warnings = warnings;
        response.recommendations = recommendations;
    }

    return response;
}

export async function addEdge(graphState: GraphStateManager, args: any) {
    const { sourceId, targetId, edgeType, label, layer, ...additionalProps } = args;

    const targetLayer = layer || graphState.getCurrentLayer();
    const edgeId = graphState.generateEdgeId(sourceId, targetId);
    
    // Validation: Check if edge type is recommended for this layer
    const warnings: string[] = [];
    const guidance = getLayerGuidance(targetLayer);
    
    if (edgeType && !isEdgeTypeRecommended(targetLayer, edgeType)) {
        // STRICT VALIDATION: Block invalid edge types for strict layers
        if (guidance.strictValidation) {
            throw new Error(
                `❌ Edge type '${edgeType}' is not allowed in '${targetLayer}' layer.\n\n` +
                `✅ Allowed edge types: ${guidance.recommendedEdgeTypes.join(', ')}\n\n` +
                `💡 This layer enforces strict edge type validation to ensure runtime semantics are clear.\n` +
                `   Use specific edge types that describe what happens at runtime.`
            );
        }
        
        // SOFT VALIDATION: Warnings for non-strict layers
        warnings.push(
            `⚠️  Edge type '${edgeType}' is not in the recommended types for '${targetLayer}' layer`
        );
        warnings.push(
            `💡 Recommended edge types for '${targetLayer}': ${guidance.recommendedEdgeTypes.slice(0, 5).join(', ')}`
        );
    }
    
    const edge: GraphEdge = {
        data: {
            id: edgeId,
            source: sourceId,
            target: targetId,
            edgeType,
            label,
            layer: targetLayer,
            createdBy: 'ai-agent',
            createdAt: new Date().toISOString(),
            ...additionalProps // Include any additional data
        }
    };

    graphState.addEdge(edge, layer);

    const response: any = {
        success: true,
        message: `Edge from '${sourceId}' to '${targetId}' added successfully`,
        edgeId,
        edgeType,
        layer: targetLayer
    };
    
    // Add warnings if any
    if (warnings.length > 0) {
        response.warnings = warnings;
    }

    return response;
}

export async function removeNode(graphState: GraphStateManager, args: any) {
    const { nodeId, layer } = args;

    graphState.removeNode(nodeId, layer);

    return {
        success: true,
        message: `Node '${nodeId}' removed successfully`,
        nodeId,
        layer: layer || graphState.getCurrentLayer()
    };
}

export async function removeEdge(graphState: GraphStateManager, args: any) {
    const { edgeId, layer } = args;

    graphState.removeEdge(edgeId, layer);

    return {
        success: true,
        message: `Edge '${edgeId}' removed successfully`,
        edgeId,
        layer: layer || graphState.getCurrentLayer()
    };
}

export async function getGraph(graphState: GraphStateManager, args: any) {
    const { layer } = args;

    const currentLayer = layer || graphState.getCurrentLayer();
    const graphData = graphState.getGraph(layer);
    const guidance = getLayerGuidance(currentLayer);

    return {
        success: true,
        layer: currentLayer,
        layerInfo: {
            name: guidance.name,
            purpose: guidance.purpose,
            recommendedNodeTypes: guidance.recommendedNodeTypes,
            recommendedEdgeTypes: guidance.recommendedEdgeTypes,
            examples: guidance.examples,
            useCases: guidance.useCases,
            warnings: guidance.warnings
        },
        agentOnlyMode: graphState.getAgentOnlyMode(),
        nodeCount: graphData.nodes.length,
        edgeCount: graphData.edges.length,
        nodes: graphData.nodes,
        edges: graphData.edges
    };
}

export async function updateNode(graphState: GraphStateManager, args: any) {
    const { nodeId, label, roleDescription, technology, progressStatus, layer, ...extraArgs } = args;

    // Structural fields that should NEVER be modified via updateNode
    const protectedFields = ['parent', 'isCompound', 'groupType', 
                           'childCount', 'id', 'type', 'path', 'category', 'isCollapsed', 
                           'sizeMultiplier', 'shape'];
    
    // Check if any protected fields are being passed
    const attemptedProtectedFields = Object.keys(extraArgs).filter(key => 
        protectedFields.includes(key)
    );
    
    if (attemptedProtectedFields.length > 0) {
        throw new Error(
            `Cannot modify structural fields via updateNode: ${attemptedProtectedFields.join(', ')}. ` +
            `These fields maintain graph hierarchy and must be preserved.`
        );
    }

    const updates: any = {};
    if (label !== undefined) updates.label = label;
    if (roleDescription !== undefined) updates.roleDescription = roleDescription;
    if (technology !== undefined) updates.technology = technology;
    if (progressStatus !== undefined) updates.progressStatus = progressStatus;
    
    // Allow any extra enrichment fields that aren't protected
    Object.keys(extraArgs).forEach(key => {
        if (extraArgs[key] !== undefined && !protectedFields.includes(key)) {
            updates[key] = extraArgs[key];
        }
    });

    graphState.updateNode(nodeId, updates, layer);

    return {
        success: true,
        message: `Node '${nodeId}' updated successfully`,
        nodeId,
        updates,
        layer: layer || graphState.getCurrentLayer()
    };
}

export async function updateEdge(graphState: GraphStateManager, args: any) {
    const { edgeId, label, edgeType, description, layer } = args;

    const targetLayer = layer || graphState.getCurrentLayer();
    const warnings: string[] = [];
    const guidance = getLayerGuidance(targetLayer);
    
    // Validation: Check if new edge type is recommended for this layer
    if (edgeType !== undefined && !isEdgeTypeRecommended(targetLayer, edgeType)) {
        // STRICT VALIDATION: Block invalid edge types for strict layers
        if (guidance.strictValidation) {
            throw new Error(
                `❌ Edge type '${edgeType}' is not allowed in '${targetLayer}' layer.\n\n` +
                `✅ Allowed edge types: ${guidance.recommendedEdgeTypes.join(', ')}\n\n` +
                `💡 This layer enforces strict edge type validation to ensure runtime semantics are clear.`
            );
        }
        
        // SOFT VALIDATION: Warnings for non-strict layers
        warnings.push(
            `⚠️  Edge type '${edgeType}' is not in the recommended types for '${targetLayer}' layer`
        );
    }

    const updates: any = {};
    if (label !== undefined) updates.label = label;
    if (edgeType !== undefined) updates.edgeType = edgeType;
    if (description !== undefined) updates.description = description;

    graphState.updateEdge(edgeId, updates, layer);

    const response: any = {
        success: true,
        message: `Edge '${edgeId}' updated successfully`,
        edgeId,
        updates,
        layer: targetLayer
    };
    
    // Add warnings if any
    if (warnings.length > 0) {
        response.warnings = warnings;
    }

    return response;
}


