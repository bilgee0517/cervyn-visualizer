/**
 * MCP Function IDs for AI Agent Graph Manipulation
 * 
 * These constants define the function identifiers that AI agents can use
 * to interact with the knowledge graph through MCP (Model Context Protocol) tools.
 */

// Core graph manipulation functions
export const ADD_NODE_FUNCTION_ID = 'addNode';
export const ADD_EDGE_FUNCTION_ID = 'addEdge';
export const REMOVE_NODE_FUNCTION_ID = 'removeNode';
export const REMOVE_EDGE_FUNCTION_ID = 'removeEdge';
export const GET_GRAPH_FUNCTION_ID = 'getGraph';
export const UPDATE_NODE_FUNCTION_ID = 'updateNode';

// Proposed changes functions (AI agent workflow)
export const PROPOSE_CHANGE_FUNCTION_ID = 'proposeChange';
export const APPLY_PROPOSED_CHANGES_FUNCTION_ID = 'applyProposedChanges';
export const LIST_PROPOSED_CHANGES_FUNCTION_ID = 'listProposedChanges';
export const CLEAR_PROPOSED_CHANGE_FUNCTION_ID = 'clearProposedChange';

// Layer management
export const SET_LAYER_FUNCTION_ID = 'setLayer';
export const GET_CURRENT_LAYER_FUNCTION_ID = 'getCurrentLayer';

// History functions
export const GET_NODE_HISTORY_FUNCTION_ID = 'getNodeHistory';
export const CLEAR_NODE_HISTORY_FUNCTION_ID = 'clearNodeHistory';

// Agent-only mode
export const SET_AGENT_ONLY_MODE_FUNCTION_ID = 'setAgentOnlyMode';
export const GET_AGENT_ONLY_MODE_FUNCTION_ID = 'getAgentOnlyMode';

/**
 * All function IDs grouped for easy export
 */
export const MCP_FUNCTION_IDS = {
    // Core operations
    ADD_NODE: ADD_NODE_FUNCTION_ID,
    ADD_EDGE: ADD_EDGE_FUNCTION_ID,
    REMOVE_NODE: REMOVE_NODE_FUNCTION_ID,
    REMOVE_EDGE: REMOVE_EDGE_FUNCTION_ID,
    GET_GRAPH: GET_GRAPH_FUNCTION_ID,
    UPDATE_NODE: UPDATE_NODE_FUNCTION_ID,
    
    // Proposed changes
    PROPOSE_CHANGE: PROPOSE_CHANGE_FUNCTION_ID,
    APPLY_PROPOSED_CHANGES: APPLY_PROPOSED_CHANGES_FUNCTION_ID,
    LIST_PROPOSED_CHANGES: LIST_PROPOSED_CHANGES_FUNCTION_ID,
    CLEAR_PROPOSED_CHANGE: CLEAR_PROPOSED_CHANGE_FUNCTION_ID,
    
    // Layer management
    SET_LAYER: SET_LAYER_FUNCTION_ID,
    GET_CURRENT_LAYER: GET_CURRENT_LAYER_FUNCTION_ID,
    
    // History
    GET_NODE_HISTORY: GET_NODE_HISTORY_FUNCTION_ID,
    CLEAR_NODE_HISTORY: CLEAR_NODE_HISTORY_FUNCTION_ID,
    
    // Agent mode
    SET_AGENT_ONLY_MODE: SET_AGENT_ONLY_MODE_FUNCTION_ID,
    GET_AGENT_ONLY_MODE: GET_AGENT_ONLY_MODE_FUNCTION_ID
} as const;


