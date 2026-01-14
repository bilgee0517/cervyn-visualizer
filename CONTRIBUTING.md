# Contributing to Cervyn Visualizer

Thank you for your interest in contributing! 🎉

This document provides guidelines and instructions for contributing to Cervyn Visualizer.

## Getting Started

1. Fork the repository
2. Clone your fork: `git clone https://github.com/bilgee0517/cervyn-visualizer.git`
3. Create a branch: `git checkout -b feature/your-feature-name`
4. Make your changes
5. Test your changes (press F5 in VS Code)
6. Commit: `git commit -am 'Add some feature'`
7. Push: `git push origin feature/your-feature-name`
8. Create a Pull Request

## Development Guidelines

### Code Style
- Use TypeScript 
- Follow existing code formatting (use Prettier if configured)
- Add JSDoc comments for public APIs and complex logic
- Use meaningful variable and function names
- Follow the existing architecture patterns (see [Webview Architecture](src/webview/ARCHITECTURE.md))

### Project Structure
- Extension code: `src/extension.ts` and `src/services/`
- Webview code: `src/webview/`
- Configuration: `src/config/`
- MCP Server: `mcp-server/`
- Tests: `src/__tests__/` and `src/**/__tests__/`

### Testing
- Test your changes manually in VS Code (press F5 to launch extension development host)
- Run automated tests: `npm test`
- Ensure the extension works with different project types
- Verify fCoSE layout renders correctly without node overlaps
- Verify performance with large codebases (500+ nodes)
- See [TESTING.md](TESTING.md) for detailed testing guidelines

### Commit Messages
Follow [Conventional Commits](https://www.conventionalcommits.org/) format:
- `feat: add Python support` - New features
- `fix: resolve fCoSE layout issue with large graphs` - Bug fixes
- `docs: update README with new features` - Documentation changes
- `refactor: reorganize webview modules` - Code refactoring
- `test: add tests for StateManager` - Test additions
- `perf: optimize graph rendering performance` - Performance improvements
- `chore: update dependencies` - Maintenance tasks

## Areas to Contribute

### High Priority
- Additional language support (Python, Java, Go)
- Export to different formats 
- Performance improvements for very large codebases (10,000+ nodes)
- AST-based analysis for accurate symbol extraction

### Medium Priority
- Custom node styling options
- Keyboard shortcuts for common actions
- Git integration (file history, code evolution)
- Circular dependency detection

### Future Features
- Real-time collaboration
- Team ownership visualization
- Plugin system for custom visualizations
- Self-hosted server option

### Documentation
- Improve inline code documentation
- Add more examples to README
- Create video tutorials
- Write architecture deep-dives

## Pull Request Process

1. **Update Documentation**: If you're adding features, update relevant documentation
2. **Add Tests**: Add tests for new functionality when possible
3. **Update CHANGELOG**: Document your changes (if CHANGELOG exists)
4. **Ensure Tests Pass**: Run `npm test` before submitting
5. **Request Review**: Tag maintainers or request review in PR description

### PR Checklist
- [ ] Code follows project style guidelines
- [ ] Tests pass locally
- [ ] Documentation updated (if needed)
- [ ] No console errors or warnings
- [ ] Tested in VS Code extension development host

## Code Review Guidelines

- Be respectful and constructive
- Focus on code quality and maintainability
- Ask questions if something is unclear
- Suggest improvements rather than just pointing out issues

## Questions?

- 🐛 [Report a Bug](https://github.com/bilgee0517/cervyn-visualizer/issues/new)
- 💡 [Request a Feature](https://github.com/bilgee0517/cervyn-visualizer/issues/new)
- 💬 [Start a Discussion](https://github.com/bilgee0517/cervyn-visualizer/discussions)

Thank you for contributing to Cervyn Visualizer! 🎉

