/**
 * Proposed Changes Tools
 * Tools for proposing, applying, listing, and clearing changes
 */

import { GraphStateManager } from '../graph-state-manager.js';

export async function proposeChange(graphState: GraphStateManager, args: any) {
    const { nodeId, changeName, summary, intention, additionalInfo, layer } = args;

    graphState.addProposedChange(nodeId, {
        name: changeName,
        summary,
        intention,
        additionalInfo
    }, layer);

    return {
        success: true,
        message: `Proposed change '${changeName}' added for node '${nodeId}'`,
        nodeId,
        changeName,
        layer: layer || graphState.getCurrentLayer()
    };
}

export async function applyProposedChanges(graphState: GraphStateManager, args: any) {
    const { layer } = args;

    const result = graphState.applyProposedChanges(layer);

    return {
        success: true,
        message: `Applied ${result.appliedCount} proposed change(s)`,
        appliedCount: result.appliedCount,
        notFoundCount: result.notFoundCount,
        layer: layer || graphState.getCurrentLayer()
    };
}

export async function listProposedChanges(graphState: GraphStateManager, args: any) {
    const { layer } = args;

    const changes = graphState.listProposedChanges(layer);

    return {
        success: true,
        count: changes.length,
        layer: layer || graphState.getCurrentLayer(),
        proposedChanges: changes
    };
}

export async function clearProposedChange(graphState: GraphStateManager, args: any) {
    const { nodeId, layer } = args;

    graphState.clearProposedChange(nodeId, layer);

    return {
        success: true,
        message: `Cleared proposed change for node '${nodeId}'`,
        nodeId,
        layer: layer || graphState.getCurrentLayer()
    };
}


