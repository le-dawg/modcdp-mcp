package main

import (
	"fmt"
	"os"
)

func main() {
	if len(os.Args) > 1 && os.Args[1] == "--version" {
		fmt.Println("modcdp-mcp 0.2.0")
		return
	}
	fmt.Fprintln(os.Stderr, "modcdp-mcp: use --version or run as MCP server")
	os.Exit(1)
}
