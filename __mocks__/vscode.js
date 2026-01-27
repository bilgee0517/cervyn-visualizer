/**
 * Mock VS Code API for testing
 * This file is automatically used by Jest when vscode module is mocked
 */

const EventEmitter = jest.fn().mockImplementation(() => ({
  event: jest.fn(),
  fire: jest.fn(),
  dispose: jest.fn()
}));

const Uri = {
  file: jest.fn((path) => ({ fsPath: path, path })),
  parse: jest.fn((path) => ({ fsPath: path, path }))
};

const workspace = {
  workspaceFolders: undefined,
  getConfiguration: jest.fn(() => ({
    get: jest.fn(),
    update: jest.fn(),
    has: jest.fn(() => false)
  })),
  onDidChangeConfiguration: jest.fn(),
  fs: {
    readFile: jest.fn(),
    writeFile: jest.fn(),
    stat: jest.fn()
  }
};

const window = {
  showInformationMessage: jest.fn(),
  showErrorMessage: jest.fn(),
  showWarningMessage: jest.fn(),
  createOutputChannel: jest.fn(() => ({
    appendLine: jest.fn(),
    append: jest.fn(),
    clear: jest.fn(),
    show: jest.fn(),
    dispose: jest.fn()
  })),
  createWebviewPanel: jest.fn(),
  showTextDocument: jest.fn(),
  activeTextEditor: undefined
};

const commands = {
  registerCommand: jest.fn(),
  executeCommand: jest.fn()
};

const ExtensionContext = jest.fn().mockImplementation(() => ({
  subscriptions: [],
  extensionPath: '/test/extension/path',
  globalState: {
    get: jest.fn(),
    update: jest.fn()
  },
  workspaceState: {
    get: jest.fn(),
    update: jest.fn()
  }
}));

module.exports = {
  EventEmitter,
  Uri,
  workspace,
  window,
  commands,
  ExtensionContext,
  ViewColumn: {
    One: 1,
    Two: 2,
    Three: 3
  },
  StatusBarAlignment: {
    Left: 1,
    Right: 2
  }
};
