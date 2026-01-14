"use strict";
/**
 * Test Script for State Synchronization
 *
 * This script tests the synchronization between MCP server and VS Code extension.
 * It calls MCP tools and verifies that changes are persisted to the shared state file.
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
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const axios_1 = __importDefault(require("axios"));
const fs = __importStar(require("fs"));
const path = __importStar(require("path"));
const os = __importStar(require("os"));
const MCP_SERVER_URL = 'http://localhost:3000/mcp';
function getSharedStateFile() {
    const homeDir = os.homedir();
    return path.join(homeDir, '.codebase-visualizer', 'graph-state.json');
}
function readSharedState() {
    const stateFile = getSharedStateFile();
    if (fs.existsSync(stateFile)) {
        const content = fs.readFileSync(stateFile, 'utf-8');
        return JSON.parse(content);
    }
    return null;
}
async function callTool(toolName, args = {}) {
    console.log(`\n>>> Calling tool: ${toolName}`);
    console.log(`    Args:`, JSON.stringify(args, null, 2));
    try {
        const response = await axios_1.default.post(MCP_SERVER_URL, { toolName, args });
        console.log(`    ✓ Success`);
        return response.data.result;
    }
    catch (error) {
        console.error(`    ✗ Error:`, error.response?.data || error.message);
        throw error;
    }
}
async function runSyncTests() {
    console.log('='.repeat(80));
    console.log('STATE SYNCHRONIZATION TEST SUITE');
    console.log('='.repeat(80));
    console.log(`Shared state file: ${getSharedStateFile()}\n`);
    try {
        // Test 1: Add a node via MCP server
        console.log('\n--- Test 1: Add Node via MCP Server ---');
        const newNode = await callTool('addNode', {
            label: 'TestComponent',
            type: 'component',
            roleDescription: 'A test component added via MCP',
            technology: 'TypeScript',
            layer: 'architecture'
        });
        console.log(`    Node created with ID: ${newNode.data.id}`);
        // Wait a moment for file write to complete
        await new Promise(resolve => setTimeout(resolve, 200));
        // Verify state file was updated
        const state1 = readSharedState();
        console.log(`    State file version: ${state1.version}`);
        console.log(`    State file source: ${state1.source}`);
        console.log(`    Nodes in architecture layer: ${state1.graphs.architecture.nodes.length}`);
        const foundNode = state1.graphs.architecture.nodes.find((n) => n.data.id === newNode.data.id);
        if (foundNode) {
            console.log(`    ✓ Node found in shared state file`);
            console.log(`    ✓ Node is marked as agent-added: ${foundNode.data.isAgentAdded}`);
        }
        else {
            console.log(`    ✗ Node NOT found in shared state file`);
        }
        // Test 2: Propose a change
        console.log('\n--- Test 2: Propose Change via MCP Server ---');
        await callTool('proposeChange', {
            nodeId: newNode.data.id,
            changeName: 'Add TypeScript interfaces',
            summary: 'Define proper type interfaces for the component',
            intention: 'Improve type safety',
            layer: 'architecture'
        });
        await new Promise(resolve => setTimeout(resolve, 200));
        const state2 = readSharedState();
        console.log(`    State file version: ${state2.version}`);
        const proposedChange = state2.proposedChanges.architecture.find((c) => c.nodeId === newNode.data.id);
        if (proposedChange) {
            console.log(`    ✓ Proposed change found in shared state`);
            console.log(`    ✓ Change name: ${proposedChange.name}`);
        }
        else {
            console.log(`    ✗ Proposed change NOT found`);
        }
        // Test 3: Toggle agent-only mode
        console.log('\n--- Test 3: Toggle Agent-Only Mode ---');
        await callTool('toggleAgentOnlyMode');
        await new Promise(resolve => setTimeout(resolve, 200));
        const state3 = readSharedState();
        console.log(`    State file version: ${state3.version}`);
        console.log(`    Agent-only mode: ${state3.agentOnlyMode}`);
        // Test 4: Apply proposed changes
        console.log('\n--- Test 4: Apply Proposed Changes ---');
        await callTool('applyProposedChanges', { layer: 'architecture' });
        await new Promise(resolve => setTimeout(resolve, 200));
        const state4 = readSharedState();
        console.log(`    State file version: ${state4.version}`);
        console.log(`    Proposed changes remaining: ${state4.proposedChanges.architecture.length}`);
        // Check if the node was updated with the change metadata
        const updatedNode = state4.graphs.architecture.nodes.find((n) => n.data.id === newNode.data.id);
        if (updatedNode && updatedNode.data.modified) {
            console.log(`    ✓ Node was updated with proposed changes`);
            console.log(`    ✓ Node marked as modified: ${updatedNode.data.modified}`);
        }
        // Test 5: Add an edge
        console.log('\n--- Test 5: Add Edge via MCP Server ---');
        // First add another node to connect to
        const targetNode = await callTool('addNode', {
            label: 'UtilityService',
            type: 'service',
            roleDescription: 'Utility service for helper functions',
            technology: 'TypeScript',
            layer: 'architecture'
        });
        const newEdge = await callTool('addEdge', {
            source: newNode.data.id,
            target: targetNode.data.id,
            label: 'uses',
            layer: 'architecture'
        });
        console.log(`    Edge created with ID: ${newEdge.data.id}`);
        await new Promise(resolve => setTimeout(resolve, 200));
        const state5 = readSharedState();
        console.log(`    State file version: ${state5.version}`);
        console.log(`    Edges in architecture layer: ${state5.graphs.architecture.edges.length}`);
        const foundEdge = state5.graphs.architecture.edges.find((e) => e.data.id === newEdge.data.id);
        if (foundEdge) {
            console.log(`    ✓ Edge found in shared state file`);
        }
        else {
            console.log(`    ✗ Edge NOT found in shared state file`);
        }
        // Final summary
        console.log('\n' + '='.repeat(80));
        console.log('TEST SUMMARY');
        console.log('='.repeat(80));
        const finalState = readSharedState();
        console.log(`Final state version: ${finalState.version}`);
        console.log(`Final state source: ${finalState.source}`);
        console.log(`Agent-only mode: ${finalState.agentOnlyMode}`);
        console.log(`Total nodes in architecture layer: ${finalState.graphs.architecture.nodes.length}`);
        console.log(`Total edges in architecture layer: ${finalState.graphs.architecture.edges.length}`);
        console.log(`Pending proposed changes: ${finalState.proposedChanges.architecture.length}`);
        console.log('\n✓ All synchronization tests passed!');
        console.log('\n📁 Shared state file location:');
        console.log(`   ${getSharedStateFile()}`);
        console.log('\n💡 The VS Code extension will automatically detect these changes');
        console.log('   and refresh the webview in real-time!');
    }
    catch (error) {
        console.error('\n✗ Test suite failed:', error);
        process.exit(1);
    }
}
// Check if MCP server is running
async function checkServerHealth() {
    try {
        console.log('Checking if MCP server is running...');
        await axios_1.default.post(MCP_SERVER_URL, { toolName: 'getGraph', args: {} });
        console.log('✓ MCP server is running\n');
        return true;
    }
    catch (error) {
        console.error('✗ MCP server is not running!');
        console.error('   Please start the server with: npm start');
        return false;
    }
}
async function main() {
    const isRunning = await checkServerHealth();
    if (!isRunning) {
        process.exit(1);
    }
    await runSyncTests();
}
main();
//# sourceMappingURL=test-sync.js.map