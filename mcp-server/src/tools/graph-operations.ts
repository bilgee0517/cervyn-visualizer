/**
 * Graph Operations Tools
 * Tools for adding, removing, and updating nodes and edges
 */

import { GraphStateManager, GraphNode, GraphEdge } from '../graph-state-manager.js';
import { getLayerGuidance, isNodeTypeRecommended, isEdgeTypeRecommended, suggestLayerForNodeType } from '../config/layer-guidance.js';

export async function addNode(graphState: GraphStateManager, args: any) {
    const { label, type, layer, roleDescription, technology, path, parent, responsibility, ...additionalProps } = args;

    const targetLayer = layer || graphState.getCurrentLayer();
    const nodeId = graphState.generateNodeId(label);
    
    // Component layer specific validation
    if (targetLayer === 'component') {
        // HARD RULE: Require responsibility field
        if (!responsibility || typeof responsibility !== 'string' || responsibility.trim().length === 0) {
            throw new Error(
                `❌ Component layer nodes MUST have a 'responsibility' field (1 sentence describing what responsibility it owns).\n\n` +
                `Example: responsibility: "Manages user authentication and session lifecycle"`
            );
        }
        
        // HARD RULE: Block code-level types (files, classes, functions)
        const forbiddenTypes = ['file', 'directory', 'class', 'function', 'interface', 'type'];
        if (forbiddenTypes.includes(type)) {
            throw new Error(
                `❌ Component layer cannot contain code-level types like '${type}'.\n\n` +
                `HARD RULE: No files/classes/functions in component layer (ever).\n` +
                `Use the 'code' layer for file-level details instead.`
            );
        }
    }
    
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
            // Component layer specific fields
            ...(targetLayer === 'component' && responsibility ? { responsibility } : {}),
            ...(targetLayer === 'component' && additionalProps.ownedData ? { ownedData: additionalProps.ownedData } : {}),
            ...(targetLayer === 'component' && additionalProps.publicSurface ? { publicSurface: additionalProps.publicSurface } : {}),
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
    
    // Component layer edge type validation - enforce source/target type constraints
    if (targetLayer === 'component' && edgeType) {
        const layerIndexes = graphState.getIndexes(targetLayer);
        const sourceNode = layerIndexes.getNodeById(sourceId);
        const targetNode = layerIndexes.getNodeById(targetId);
        
        if (sourceNode && targetNode) {
            const sourceType = sourceNode.data.type;
            const targetType = targetNode.data.type;
            
            // Validate edge type constraints
            switch (edgeType) {
                case 'owns':
                    if (sourceType !== 'bounded-context' || !['use-case', 'domain-model'].includes(targetType || '')) {
                        throw new Error(
                            `❌ Edge type 'owns' is only allowed from 'bounded-context' to 'use-case' or 'domain-model'.\n\n` +
                            `   Source: '${sourceType}', Target: '${targetType}'\n` +
                            `   Use 'owns' to show that a bounded-context owns specific use-cases and domain-models.`
                        );
                    }
                    break;
                case 'invokes':
                    if (sourceType !== 'use-case' || !['domain-model', 'policy'].includes(targetType || '')) {
                        throw new Error(
                            `❌ Edge type 'invokes' is only allowed from 'use-case' to 'domain-model' or 'policy'.\n\n` +
                            `   Source: '${sourceType}', Target: '${targetType}'\n` +
                            `   Use 'invokes' to show that a use-case invokes domain models or policies.`
                        );
                    }
                    break;
                case 'persists-via':
                    if (sourceType !== 'use-case' || targetType !== 'repository') {
                        throw new Error(
                            `❌ Edge type 'persists-via' is only allowed from 'use-case' to 'repository'.\n\n` +
                            `   Source: '${sourceType}', Target: '${targetType}'\n` +
                            `   Use 'persists-via' to show that a use-case persists data via a repository.`
                        );
                    }
                    break;
                case 'implemented-by':
                    if (sourceType !== 'repository' || !['adapter'].includes(targetType || '')) {
                        throw new Error(
                            `❌ Edge type 'implemented-by' is only allowed from 'repository' to 'adapter'.\n\n` +
                            `   Source: '${sourceType}', Target: '${targetType}'\n` +
                            `   Use 'implemented-by' to show that a repository is implemented by an adapter.`
                        );
                    }
                    break;
                case 'integrates-via':
                    if (sourceType !== 'use-case' || targetType !== 'adapter') {
                        throw new Error(
                            `❌ Edge type 'integrates-via' is only allowed from 'use-case' to 'adapter'.\n\n` +
                            `   Source: '${sourceType}', Target: '${targetType}'\n` +
                            `   Use 'integrates-via' to show that a use-case integrates via an adapter.`
                        );
                    }
                    break;
                case 'depends-on':
                    // Only allow depends-on for shared-kernel relationships
                    if (!['shared-kernel'].includes(sourceType || '') && !['shared-kernel'].includes(targetType || '')) {
                        throw new Error(
                            `❌ Edge type 'depends-on' is only allowed for shared-kernel relationships.\n\n` +
                            `   Source: '${sourceType}', Target: '${targetType}'\n` +
                            `   Use 'depends-on' only when a component depends on a shared-kernel.`
                        );
                    }
                    break;
            }
        }
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


