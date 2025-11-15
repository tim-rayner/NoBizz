#!/bin/bash

# Add Deno to PATH if installed in default location
if [ -d "$HOME/.deno/bin" ]; then
  export DENO_INSTALL="$HOME/.deno"
  export PATH="$DENO_INSTALL/bin:$PATH"
fi

# Check if Deno is installed
if ! command -v deno &> /dev/null; then
  echo "Error: Deno is not installed."
  echo ""
  echo "Install it using one of these methods:"
  echo "  macOS/Linux: curl -fsSL https://deno.land/x/install/install.sh | sh"
  echo "  macOS (Homebrew): brew install deno"
  echo "  Windows (PowerShell): iwr https://deno.land/x/install/install.ps1 -useb | iex"
  echo ""
  echo "After installation, add Deno to your PATH (or restart your terminal):"
  echo "  export DENO_INSTALL=\"\$HOME/.deno\""
  echo "  export PATH=\"\$DENO_INSTALL/bin:\$PATH\""
  exit 1
fi

# Run tests
deno test index.test.ts

