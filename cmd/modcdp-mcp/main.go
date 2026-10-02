package main

import (
	"context"
	"fmt"
	"os"
	"os/signal"
	"syscall"

	"github.com/dawgctor/modcdp-mcp/internal/broker"
	"github.com/dawgctor/modcdp-mcp/internal/mcp"
)

const version = "0.2.0"

func main() {
	if len(os.Args) > 1 {
		switch os.Args[1] {
		case "--version", "-v", "version":
			fmt.Println("modcdp-mcp " + version)
			return
		case "broker":
			// Sub-command: run broker only (used for auto-spawn)
			runBrokerOnly()
			return
		}
	}

	// Default: run as MCP server (stdio) with embedded broker
	runMCPServer()
}

func runBrokerOnly() {
	cfg := broker.Config{
		MainPort:   broker.DefaultMainPort,
		DevPort:    broker.DefaultDevPort,
		SocketPath: broker.BrokerSockPath,
	}
	ctx, stop := signal.NotifyContext(context.Background(), syscall.SIGTERM, syscall.SIGINT)
	defer stop()

	b := broker.New(cfg)
	if err := b.Start(ctx); err != nil {
		fmt.Fprintf(os.Stderr, "modcdp-mcp broker: %v\n", err)
		os.Exit(1)
	}
	defer b.Stop()
	<-ctx.Done()
}

func runMCPServer() {
	cfg := broker.Config{
		MainPort:   broker.DefaultMainPort,
		DevPort:    broker.DefaultDevPort,
		SocketPath: broker.BrokerSockPath,
	}

	ctx, stop := signal.NotifyContext(context.Background(), syscall.SIGTERM, syscall.SIGINT)
	defer stop()

	b := broker.New(cfg)
	if err := b.Start(ctx); err != nil {
		// Broker already running is OK — we'll use the existing socket
		fmt.Fprintf(os.Stderr, "modcdp-mcp: broker note: %v\n", err)
	} else {
		defer b.Stop()
	}

	// Run MCP server over stdio; blocks until stdin closes
	if err := mcp.RunMcpServer(os.Stdin, os.Stdout, broker.BrokerSockPath); err != nil {
		fmt.Fprintf(os.Stderr, "modcdp-mcp: serve error: %v\n", err)
		os.Exit(1)
	}
}
