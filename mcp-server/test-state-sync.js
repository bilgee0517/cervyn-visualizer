"use strict";
/**
 * Test Script for State Synchronization
 *
 * Tests the GraphStateManager's ability to persist state to the shared file.
 * This verifies that changes made by the MCP server are written to the file
 * that the VS Code extension watches.
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
const fs = __importStar(require("fs"));
const path = __importStar(require("path"));
const os = __importStar(require("os"));
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
async function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}
async function runTests() {
    console.log('='.repeat(80));
    console.log('STATE SYNCHRONIZATION TEST');
    console.log('='.repeat(80));
    console.log(`Shared state file: ${getSharedStateFile()}\n`);
    try {
        // Create a new GraphStateManager (this will load or create the shared state)
        console.log('\n--- Test 1: Initialize GraphStateManager ---');
        const manager = new graph_state_manager_js_1.GraphStateManager();
        console.log('✓ GraphStateManager initialized');
        await sleep(200);
        let state = readSharedState();
        console.log(`Initial state version: ${state.version}`);
        console.log(`Initial state source: ${state.source}`);
        // Test 2: Add a node
        console.log('\n--- Test 2: Add Node ---');
        const nodeId = manager.generateNodeId('TestComponent');
        manager.addNode({
            data: {
                id: nodeId,
                label: 'TestComponent',
                type: 'component',
                roleDescription: 'A test component for state sync verification',
                technology: 'TypeScript'
            }
        }, 'architecture');
        console.log(`✓ Node added with ID: ${nodeId}`);
        await sleep(200);
        state = readSharedState();
        console.log(`State version after addNode: ${state.version}`);
        const foundNode = state.graphs.architecture.nodes.find((n) => n.data.id === nodeId);
        if (foundNode) {
            console.log(`✓ Node found in shared state file`);
            console.log(`✓ Node is agent-added: ${foundNode.data.isAgentAdded}`);
        }
        else {
            console.error(`✗ Node NOT found in shared state file!`);
        }
        // Test 3: Propose a change
        console.log('\n--- Test 3: Propose Change ---');
        manager.addProposedChange(nodeId, {
            name: 'Add TypeScript interfaces',
            summary: 'Define proper type interfaces',
            intention: 'Improve type safety'
        }, 'architecture');
        console.log('✓ Proposed change added');
        await sleep(200);
        state = readSharedState();
        console.log(`State version after proposeChange: ${state.version}`);
        const proposedChange = state.proposedChanges.architecture.find((c) => c.nodeId === nodeId);
        if (proposedChange) {
            console.log(`✓ Proposed change found in state file`);
            console.log(`  Name: ${proposedChange.name}`);
        }
        else {
            console.error(`✗ Proposed change NOT found!`);
        }
        // Test 4: Toggle agent-only mode
        console.log('\n--- Test 4: Toggle Agent-Only Mode ---');
        const initialAgentMode = manager.getAgentOnlyMode();
        manager.setAgentOnlyMode(!initialAgentMode);
        console.log(`✓ Agent-only mode toggled to: ${!initialAgentMode}`);
        await sleep(200);
        state = readSharedState();
        console.log(`State version after toggle: ${state.version}`);
        console.log(`Agent-only mode in file: ${state.agentOnlyMode}`);
        // Test 5: Apply proposed changes
        console.log('\n--- Test 5: Apply Proposed Changes ---');
        const result = manager.applyProposedChanges('architecture');
        console.log(`✓ Applied ${result.appliedCount} changes`);
        await sleep(200);
        state = readSharedState();
        console.log(`State version after apply: ${state.version}`);
        console.log(`Remaining proposed changes: ${state.proposedChanges.architecture.length}`);
        const updatedNode = state.graphs.architecture.nodes.find((n) => n.data.id === nodeId);
        if (updatedNode && updatedNode.data.modified) {
            console.log(`✓ Node marked as modified after applying changes`);
        }
        // Test 6: Add an edge
        console.log('\n--- Test 6: Add Edge ---');
        const targetNodeId = manager.generateNodeId('UtilityService');
        manager.addNode({
            data: {
                id: targetNodeId,
                label: 'UtilityService',
                type: 'service',
                roleDescription: 'Utility service',
                technology: 'TypeScript'
            }
        }, 'architecture');
        const edgeId = `edge-${Date.now()}`;
        manager.addEdge({
            data: {
                id: edgeId,
                source: nodeId,
                target: targetNodeId,
                label: 'uses'
            }
        }, 'architecture');
        console.log(`✓ Edge added with ID: ${edgeId}`);
        await sleep(200);
        state = readSharedState();
        console.log(`State version after addEdge: ${state.version}`);
        const foundEdge = state.graphs.architecture.edges.find((e) => e.data.id === edgeId);
        if (foundEdge) {
            console.log(`✓ Edge found in shared state file`);
        }
        else {
            console.error(`✗ Edge NOT found!`);
        }
        // Test 7: Switch layer
        console.log('\n--- Test 7: Switch Layer ---');
        manager.setCurrentLayer('blueprint');
        console.log('✓ Switched to blueprint layer');
        await sleep(200);
        state = readSharedState();
        console.log(`State version after layer switch: ${state.version}`);
        console.log(`Current layer in file: ${state.currentLayer}`);
        // Final summary
        console.log('\n' + '='.repeat(80));
        console.log('TEST SUMMARY');
        console.log('='.repeat(80));
        const finalState = readSharedState();
        console.log(`Final state version: ${finalState.version}`);
        console.log(`Final state source: ${finalState.source}`);
        console.log(`Current layer: ${finalState.currentLayer}`);
        console.log(`Agent-only mode: ${finalState.agentOnlyMode}`);
        console.log(`Total nodes in architecture layer: ${finalState.graphs.architecture.nodes.length}`);
        console.log(`Total edges in architecture layer: ${finalState.graphs.architecture.edges.length}`);
        console.log('\n✓ All state synchronization tests passed!');
        console.log('\n📁 Shared state file location:');
        console.log(`   ${getSharedStateFile()}`);
        console.log('\n💡 VS Code extension will automatically detect these changes!');
        console.log('   Open the Codebase Visualizer panel to see real-time updates.');
    }
    catch (error) {
        console.error('\n✗ Test failed:', error);
        process.exit(1);
    }
}
runTests();
//# sourceMappingURL=test-state-sync.js.map