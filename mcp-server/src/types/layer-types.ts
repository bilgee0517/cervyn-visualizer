/**
 * Type definitions for layer system
 * 
 * Defines types for layer metadata, validation, and guidance.
 */

import { Layer } from '../graph-state-manager.js';

/**
 * Metadata about a specific layer
 */
export interface LayerMetadata {
    name: string;
    purpose: string;
    description: string;
    level: number; // 0 (workflow) to 4 (code)
    isAutoPopulated: boolean;
}

/**
 * Recommendation for node types in a layer
 */
export interface NodeTypeRecommendation {
    type: string;
    description: string;
    example: string;
}

/**
 * Recommendation for edge types in a layer
 */
export interface EdgeTypeRecommendation {
    type: string;
    description: string;
    example: string;
}

/**
 * Validation warning when layer/type mismatch occurs
 */
export interface ValidationWarning {
    code: string;
    message: string;
    suggestion?: string;
    suggestedLayer?: Layer;
    suggestedNodeTypes?: string[];
}

/**
 * Complete guidance for a layer
 */
export interface LayerGuidance {
    name: string;
    purpose: string;
    description: string;
    recommendedNodeTypes: string[];
    recommendedEdgeTypes: string[];
    examples: string[];
    useCases: string[];
    warnings: string[];
}

/**
 * Feature annotation for cross-layer tracing
 */
export interface FeatureAnnotation {
    /**
     * Feature IDs this node supports (on all layers except workflow)
     */
    supportsFeatures?: string[];
    
    /**
     * Node IDs implementing this feature (on workflow layer only)
     */
    supportedBy?: string[];
}

/**
 * Response data when adding a node with validation
 */
export interface AddNodeResponse {
    success: boolean;
    message: string;
    nodeId: string;
    layer: Layer;
    warnings?: string[];
    recommendations?: {
        suggestedLayer?: Layer;
        suggestedNodeTypes?: string[];
    };
}

/**
 * Layer information included in getGraph response
 */
export interface LayerInfo {
    name: string;
    purpose: string;
    recommendedNodeTypes: string[];
    recommendedEdgeTypes: string[];
    examples: string[];
}

/**
 * Legacy layer name mapping
 */
export interface LegacyLayerMapping {
    oldName: string;
    newName: Layer;
    deprecated: boolean;
    deprecationMessage: string;
}

/**
 * Layer statistics
 */
export interface LayerStatistics {
    layer: Layer;
    nodeCount: number;
    edgeCount: number;
    agentAddedNodeCount: number;
    featureCount?: number; // Only for workflow layer
}

/**
 * Cross-layer tracing result
 */
export interface CrossLayerTrace {
    featureId: string;
    featureLabel: string;
    implementationNodes: Array<{
        nodeId: string;
        label: string;
        layer: Layer;
        type: string;
    }>;
}

/**
 * Layer validation result
 */
export interface LayerValidationResult {
    isValid: boolean;
    warnings: ValidationWarning[];
    errors?: string[];
}
