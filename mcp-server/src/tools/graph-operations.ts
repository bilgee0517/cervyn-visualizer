/**
 * Graph Operations Tools
 * Tools for adding, removing, and updating nodes and edges
 */

import { GraphStateManager, GraphNode, GraphEdge } from '../graph-state-manager.js';

export async function addNode(graphState: GraphStateManager, args: any) {
    const { label, type, layer, roleDescription, technology, path, parent } = args;

    const nodeId = graphState.generateNodeId(label);
    
    const node: GraphNode = {
        data: {
            id: nodeId,
            label,
            type,
            roleDescription,
            technology,
            path,
            parent,
            isAgentAdded: true // Always mark as agent-added
        }
    };

    graphState.addNode(node, layer);

    return {
        success: true,
        message: `Node '${label}' added successfully`,
        nodeId,
        layer: layer || graphState.getCurrentLayer()
    };
}

export async function addEdge(graphState: GraphStateManager, args: any) {
    const { sourceId, targetId, edgeType, label, layer } = args;

    const edgeId = graphState.generateEdgeId(sourceId, targetId);
    
    const edge: GraphEdge = {
        data: {
            id: edgeId,
            source: sourceId,
            target: targetId,
            edgeType,
            label
        }
    };

    graphState.addEdge(edge, layer);

    return {
        success: true,
        message: `Edge from '${sourceId}' to '${targetId}' added successfully`,
        edgeId,
        edgeType,
        layer: layer || graphState.getCurrentLayer()
    };
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

    const graphData = graphState.getGraph(layer);

    return {
        success: true,
        layer: layer || graphState.getCurrentLayer(),
        agentOnlyMode: graphState.getAgentOnlyMode(),
        nodeCount: graphData.nodes.length,
        edgeCount: graphData.edges.length,
        nodes: graphData.nodes,
        edges: graphData.edges
    };
}

export async function updateNode(graphState: GraphStateManager, args: any) {
    const { nodeId, label, roleDescription, technology, progressStatus, layer } = args;

    const updates: any = {};
    if (label !== undefined) updates.label = label;
    if (roleDescription !== undefined) updates.roleDescription = roleDescription;
    if (technology !== undefined) updates.technology = technology;
    if (progressStatus !== undefined) updates.progressStatus = progressStatus;

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

    const updates: any = {};
    if (label !== undefined) updates.label = label;
    if (edgeType !== undefined) updates.edgeType = edgeType;
    if (description !== undefined) updates.description = description;

    graphState.updateEdge(edgeId, updates, layer);

    return {
        success: true,
        message: `Edge '${edgeId}' updated successfully`,
        edgeId,
        updates,
        layer: layer || graphState.getCurrentLayer()
    };
}


