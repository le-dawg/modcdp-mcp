# Contributing to ModCDP-MCP

Thank you for your interest in contributing to `modcdp-mcp`! We welcome bug reports, documentation improvements, and feature contributions.

## Development Setup

### Prerequisites
- **Go**: `1.23+`
- **Node.js**: `v20+` or `v22+`
- **Google Chrome** / **Google Chrome Dev**

### Clone & Build
```bash
git clone https://github.com/le-dawg/modcdp-mcp.git
cd modcdp-mcp

# Install dependencies
npm install

# Build binary
go build -o bin/modcdp-mcp ./cmd/modcdp-mcp/

# Build extensions
node scripts/build-extensions.mjs
```

### Running Tests
```bash
# Run all Go tests
go test ./... -v

# Run full Node test suite
npm test
```

## Pull Request Guidelines
1. Ensure all 28 unit and integration tests pass before submitting.
2. Maintain zero modal fatigue and clean MV3 extension practices.
3. Follow idiomatic Go and modern ES Module TypeScript conventions.
