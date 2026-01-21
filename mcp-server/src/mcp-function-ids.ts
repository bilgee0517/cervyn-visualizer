/**
 * MCP Function IDs for AI Agent Graph Manipulation
 * (Duplicated from main extension for MCP server use)
 */

export const MCP_FUNCTION_IDS = {
    // Original tools
    GET_GRAPH: 'getGraph',
    ADD_NODE: 'addNode',
    DELETE_NODE: 'deleteNode',
    ADD_EDGE: 'addEdge',
    DELETE_EDGE: 'deleteEdge',
    UPDATE_NODE: 'updateNode',
    UPDATE_EDGE: 'updateEdge',
    DESCRIBE_LAYER: 'describeLayer',
    
    // Batch operations
    BATCH_NODES: 'batchNodes',
    BATCH_EDGES: 'batchEdges',
    
    // Query/filtering
    QUERY_NODES: 'queryNodes',
    QUERY_EDGES: 'queryEdges',
    
    // Traversal
    TRAVERSE_GRAPH: 'traverseGraph',
    
    // Compound nodes (NEW)
    CREATE_COMPOUND_NODE: 'createCompoundNode',
    ADD_CHILD_NODES: 'addChildNodes',
    REMOVE_CHILD_NODES: 'removeChildNodes',
    MOVE_NODES: 'moveNodes',
    GET_COMPOUND_HIERARCHY: 'getCompoundHierarchy',
    TOGGLE_COMPOUND_COLLAPSE: 'toggleCompoundCollapse',
    CONVERT_TO_COMPOUND: 'convertToCompound'
} as const;

