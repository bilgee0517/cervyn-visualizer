"use strict";
/**
 * Test Script for MCP Server
 *
 * This script tests the MCP server by simulating tool calls.
 * Run with: npm run dev && node test-server.js
 */
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
const graph_state_manager_js_1 = require("./src/graph-state-manager.js");
const tools = __importStar(require("./src/tools/index.js"));
async function runTests() {
    console.log('=== Codebase Visualizer MCP Server Test Suite ===\n');
    const graphState = new graph_state_manager_js_1.GraphStateManager();
    try {
        // Test 1: Add Node
        console.log('Test 1: Add Node');
        const addNodeResult = await tools.addNode(graphState, {
            label: 'AuthService',
            type: 'module',
            layer: 'architecture',
            roleDescription: 'Handles user authentication',
            technology: 'Express'
        });
        console.log('✓ Result:', JSON.stringify(addNodeResult, null, 2));
        // Test 2: Add Another Node
        console.log('\nTest 2: Add Another Node');
        const addNode2Result = await tools.addNode(graphState, {
            label: 'UserController',
            type: 'module',
            layer: 'architecture',
            roleDescription: 'Manages user operations'
        });
        console.log('✓ Result:', JSON.stringify(addNode2Result, null, 2));
        // Test 3: Add Edge
        console.log('\nTest 3: Add Edge');
        const addEdgeResult = await tools.addEdge(graphState, {
            sourceId: addNode2Result.nodeId,
            targetId: addNodeResult.nodeId,
            edgeType: 'uses',
            label: 'authenticates via'
        });
        console.log('✓ Result:', JSON.stringify(addEdgeResult, null, 2));
        // Test 4: Get Graph
        console.log('\nTest 4: Get Graph');
        const getGraphResult = await tools.getGraph(graphState, {});
        console.log('✓ Result:', JSON.stringify(getGraphResult, null, 2));
        // Test 5: Propose Change
        console.log('\nTest 5: Propose Change');
        const proposeResult = await tools.proposeChange(graphState, {
            nodeId: addNodeResult.nodeId,
            changeName: 'Add JWT support',
            summary: 'Implement token-based authentication',
            intention: 'Security enhancement'
        });
        console.log('✓ Result:', JSON.stringify(proposeResult, null, 2));
        // Test 6: List Proposed Changes
        console.log('\nTest 6: List Proposed Changes');
        const listResult = await tools.listProposedChanges(graphState, {});
        console.log('✓ Result:', JSON.stringify(listResult, null, 2));
        // Test 7: Apply Proposed Changes
        console.log('\nTest 7: Apply Proposed Changes');
        const applyResult = await tools.applyProposedChanges(graphState, {});
        console.log('✓ Result:', JSON.stringify(applyResult, null, 2));
        // Test 8: Agent-Only Mode
        console.log('\nTest 8: Agent-Only Mode');
        const agentModeResult = await tools.setAgentOnlyMode(graphState, { enabled: true });
        console.log('✓ Result:', JSON.stringify(agentModeResult, null, 2));
        const graphWithFilterResult = await tools.getGraph(graphState, {});
        console.log('✓ Graph with agent-only mode:', JSON.stringify({
            nodeCount: graphWithFilterResult.nodeCount,
            agentOnlyMode: graphWithFilterResult.agentOnlyMode
        }, null, 2));
        // Test 9: Update Node
        console.log('\nTest 9: Update Node');
        const updateResult = await tools.updateNode(graphState, {
            nodeId: addNodeResult.nodeId,
            progressStatus: 'in-progress',
            technology: 'Express + Passport.js'
        });
        console.log('✓ Result:', JSON.stringify(updateResult, null, 2));
        // Test 10: Layer Management
        console.log('\nTest 10: Layer Management');
        const setLayerResult = await tools.setLayer(graphState, { layer: 'implementation' });
        console.log('✓ Result:', JSON.stringify(setLayerResult, null, 2));
        const getLayerResult = await tools.getCurrentLayer(graphState, {});
        console.log('✓ Current layer:', JSON.stringify(getLayerResult, null, 2));
        console.log('\n=== All Tests Passed! ✓ ===');
    }
    catch (error) {
        console.error('\n❌ Test Failed:', error);
        process.exit(1);
    }
}
runTests();
//# sourceMappingURL=test-server.js.map