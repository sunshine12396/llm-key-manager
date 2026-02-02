# LLM Key Manager - Makefile
# Common development commands

.PHONY: install dev build clean lint test preview help

# Default target
help:
	@echo "LLM Key Manager - Development Commands"
	@echo ""
	@echo "Usage: make [target]"
	@echo ""
	@echo "Targets:"
	@echo "  install   - Install dependencies"
	@echo "  dev       - Start development server"
	@echo "  build     - Build for production"
	@echo "  preview   - Preview production build"
	@echo "  clean     - Remove build artifacts and node_modules"
	@echo "  lint      - Run TypeScript type checking"
	@echo "  format    - Format code with Prettier (if installed)"
	@echo "  test      - Run tests (when available)"
	@echo ""

# Install dependencies
install:
	pnpm install

# Start development server
dev:
	pnpm run dev

# Build for production
build:
	pnpm run build

# Preview production build
preview:
	pnpm run preview

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

# Run tests (placeholder)
test:
	@echo "No tests configured yet. Add tests in src/__tests__/"

# Clean build artifacts
clean:
	rm -rf dist node_modules .tsbuildinfo

# Full rebuild
rebuild: clean install build

# Development setup (first time)
setup: install
	@echo ""
	@echo "✅ Setup complete! Run 'make dev' to start developing."
	@echo ""
