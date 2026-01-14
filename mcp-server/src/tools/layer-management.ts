/**
 * Layer Management Tools
 * Tools for managing graph layers
 */

import { GraphStateManager, Layer } from '../graph-state-manager.js';

export async function setLayer(graphState: GraphStateManager, args: any) {
    const { layer } = args as { layer: Layer };

    graphState.setCurrentLayer(layer);

    return {
        success: true,
        message: `Switched to ${layer} layer`,
        currentLayer: layer
    };
}

export async function getCurrentLayer(graphState: GraphStateManager, args: any) {
    const currentLayer = graphState.getCurrentLayer();

    return {
        success: true,
        currentLayer
    };
}

export async function setAgentOnlyMode(graphState: GraphStateManager, args: any) {
    const { enabled } = args;

    graphState.setAgentOnlyMode(enabled);

    return {
        success: true,
        message: `Agent-only mode ${enabled ? 'enabled' : 'disabled'}`,
        agentOnlyMode: enabled
    };
}

export async function getAgentOnlyMode(graphState: GraphStateManager, args: any) {
    const agentOnlyMode = graphState.getAgentOnlyMode();

    return {
        success: true,
        agentOnlyMode
    };
}


