# LLM Key Manager - Makefile
# Common development commands

.PHONY: install build clean lint test example ui-demo help upgrade-lib

# Default target
help:
	@echo "LLM Key Manager - Development Commands"
	@echo ""
	@echo "Usage: make [target]"
	@echo ""
	@echo "Targets:"
	@echo "  install     - Install dependencies"
	@echo "  build       - Build the library for production"
	@echo "  clean       - Remove build artifacts and node_modules"
	@echo "  lint        - Run TypeScript type checking"
	@echo "  format      - Format code with Prettier"
	@echo "  test        - Run tests (Vitest)"
	@echo "  example     - Run the basic usage example"
	@echo "  ui-demo     - Launch the UI testing dashboard"
	@echo "  upgrade-lib - Upgrade all dependencies to latest and run tests"
	@echo ""

# Install dependencies
install:
	pnpm install

# Build for production
build:
	pnpm run build:lib

# Run TypeScript type checking
lint:
	pnpm exec tsc --noEmit

# Format code (requires prettier)
format:
	@if command -v prettier >/dev/null 2>&1; then \
		pnpm exec prettier --write "src/**/*.{ts,tsx,css}"; \
	else \
		echo "Prettier not installed. Run: pnpm add -D prettier"; \
	fi

# Run tests
test:
	pnpm test

# Run example
example:
	pnpm run example

# UI Demo
ui-demo:
	cd examples/ui-demo && pnpm install && CHOKIDAR_USEPOLLING=true pnpm run dev

# Clean build artifacts
clean:
	rm -rf dist node_modules .tsbuildinfo examples/ui-demo/node_modules examples/ui-demo/dist

# Full rebuild
rebuild: clean install build

# Development setup
setup: install
	@echo ""
	@echo "✅ Setup complete! Run 'make build' or 'make test'."
	@echo ""

# Upgrade dependencies and run tests
upgrade-lib:
	pnpm update --latest
	pnpm test
