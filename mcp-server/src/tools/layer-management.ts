/**
 * Layer Management Tools
 * Tools for managing graph layers
 */

import { GraphStateManager, Layer } from '../graph-state-manager.js';
import { getLayerGuidance } from '../config/layer-guidance.js';

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

export async function describeLayer(graphState: GraphStateManager, args: any) {
    const { layer } = args as { layer: Layer };

    const guidance = getLayerGuidance(layer);

    return {
        success: true,
        layer,
        guidance: {
            name: guidance.name,
            purpose: guidance.purpose,
            description: guidance.description,
            recommendedNodeTypes: guidance.recommendedNodeTypes,
            recommendedEdgeTypes: guidance.recommendedEdgeTypes,
            examples: guidance.examples,
            useCases: guidance.useCases,
            warnings: guidance.warnings,
            // NEW: Enhanced guidance for AI agents
            whatToInclude: guidance.whatToInclude,
            whatToAvoid: guidance.whatToAvoid,
            nodeTypeMapping: guidance.nodeTypeMapping,
            strictValidation: guidance.strictValidation,
            validationMessage: guidance.strictValidation 
                ? '🔒 This layer enforces STRICT type validation - only recommended types are allowed'
                : '⚠️  This layer allows flexible types but will show warnings for non-recommended types'
        }
    };
}

