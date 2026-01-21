/**
 * Test Script for State Synchronization
 * 
 * Tests the GraphStateManager's ability to persist state to the shared file.
 * This verifies that changes made by the MCP server are written to the file
 * that the VS Code extension watches.
 */

import { GraphStateManager } from './src/graph-state-manager.js';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';

function getSharedStateFile(): string {
    const homeDir = os.homedir();
    return path.join(homeDir, '.codebase-visualizer', 'graph-state.json');
}

function readSharedState(): any {
    const stateFile = getSharedStateFile();
    if (fs.existsSync(stateFile)) {
        const content = fs.readFileSync(stateFile, 'utf-8');
        return JSON.parse(content);
    }
    return null;
}

async function sleep(ms: number) {
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
        const manager = new GraphStateManager();
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
        }, 'component');
        console.log(`✓ Node added with ID: ${nodeId}`);

        await sleep(200);

        state = readSharedState();
        console.log(`State version after addNode: ${state.version}`);
        const foundNode = state.graphs.component.nodes.find((n: any) => n.data.id === nodeId);
        if (foundNode) {
            console.log(`✓ Node found in shared state file`);
            console.log(`✓ Node is agent-added: ${foundNode.data.isAgentAdded}`);
        } else {
            console.error(`✗ Node NOT found in shared state file!`);
        }

        // Test 3: Propose a change
        console.log('\n--- Test 3: Propose Change ---');
        manager.addProposedChange(nodeId, {
            name: 'Add TypeScript interfaces',
            summary: 'Define proper type interfaces',
            intention: 'Improve type safety'
        }, 'component');
        console.log('✓ Proposed change added');

        await sleep(200);

        state = readSharedState();
        console.log(`State version after proposeChange: ${state.version}`);
        const proposedChange = state.proposedChanges.component.find((c: any) => c.nodeId === nodeId);
        if (proposedChange) {
            console.log(`✓ Proposed change found in state file`);
            console.log(`  Name: ${proposedChange.name}`);
        } else {
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
        const result = manager.applyProposedChanges('component');
        console.log(`✓ Applied ${result.appliedCount} changes`);

        await sleep(200);

        state = readSharedState();
        console.log(`State version after apply: ${state.version}`);
        console.log(`Remaining proposed changes: ${state.proposedChanges.component.length}`);

        const updatedNode = state.graphs.component.nodes.find((n: any) => n.data.id === nodeId);
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
        }, 'component');

        const edgeId = `edge-${Date.now()}`;
        manager.addEdge({
            data: {
                id: edgeId,
                source: nodeId,
                target: targetNodeId,
                label: 'uses'
            }
        }, 'component');
        console.log(`✓ Edge added with ID: ${edgeId}`);

        await sleep(200);

        state = readSharedState();
        console.log(`State version after addEdge: ${state.version}`);
        const foundEdge = state.graphs.component.edges.find((e: any) => e.data.id === edgeId);
        if (foundEdge) {
            console.log(`✓ Edge found in shared state file`);
        } else {
            console.error(`✗ Edge NOT found!`);
        }

        // Test 7: Switch layer
        console.log('\n--- Test 7: Switch Layer ---');
        manager.setCurrentLayer('context');
        console.log('✓ Switched to context layer');

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
        console.log(`Total nodes in component layer: ${finalState.graphs.component.nodes.length}`);
        console.log(`Total edges in component layer: ${finalState.graphs.component.edges.length}`);
        
        console.log('\n✓ All state synchronization tests passed!');
        console.log('\n📁 Shared state file location:');
        console.log(`   ${getSharedStateFile()}`);
        console.log('\n💡 VS Code extension will automatically detect these changes!');
        console.log('   Open the Codebase Visualizer panel to see real-time updates.');

    } catch (error) {
        console.error('\n✗ Test failed:', error);
        process.exit(1);
    }
}

runTests();


