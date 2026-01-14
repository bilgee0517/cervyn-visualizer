/**
 * Test Script for MCP Server
 * 
 * This script tests the MCP server by simulating tool calls.
 * Run with: npm run dev && node test-server.js
 */

import { GraphStateManager } from './src/graph-state-manager.js';
import * as tools from './src/tools/index.js';

async function runTests() {
    console.log('=== Codebase Visualizer MCP Server Test Suite ===\n');
    
    const graphState = new GraphStateManager();
    
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
        
    } catch (error) {
        console.error('\n❌ Test Failed:', error);
        process.exit(1);
    }
}

runTests();


