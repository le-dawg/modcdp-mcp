package mcp

import (
	"encoding/json"
	"fmt"
	"strconv"
)

type ToolDefinition struct {
	Name        string                 `json:"name"`
	Description string                 `json:"description"`
	InputSchema map[string]interface{} `json:"inputSchema"`
}

type ToolCommand struct {
	Browser            string                 `json:"browser"`
	Method             string                 `json:"method"`
	Params             map[string]interface{} `json:"params"`
	FallbackExpression string                 `json:"fallbackExpression,omitempty"`
}

var Tools = []ToolDefinition{
	{
		Name: "get_active_tab",
		Description: "Get the user's currently focused browser tab in the active Chrome window. Returns tab ID, title, URL, window ID, and active status.",
		InputSchema: map[string]interface{}{
			"type": "object",
			"properties": map[string]interface{}{
				"browser": map[string]interface{}{
					"type":        "string",
					"enum":        []string{"main", "dev", "any"},
					"default":     "any",
					"description": "Target Main Chrome, Chrome Dev, or whichever is currently active.",
				},
			},
		},
	},
	{
		Name: "find_tabs_by_title",
		Description: "Search open browser tabs across all windows matching a title regex or substring (e.g. 'Kleinanzeigen', 'GitHub PR', 'Linear').",
		InputSchema: map[string]interface{}{
			"type": "object",
			"properties": map[string]interface{}{
				"title_pattern": map[string]interface{}{
					"type":        "string",
					"description": "Regex or substring to match tab title.",
				},
				"url_pattern": map[string]interface{}{
					"type":        "string",
					"description": "Optional substring to filter URL.",
				},
				"browser": map[string]interface{}{
					"type":    "string",
					"enum":    []string{"main", "dev", "any"},
					"default": "any",
				},
			},
			"required": []string{"title_pattern"},
		},
	},
	{
		Name: "focus_tab",
		Description: "Bring a specific browser tab and its parent window to the visual foreground.",
		InputSchema: map[string]interface{}{
			"type": "object",
			"properties": map[string]interface{}{
				"tab_id": map[string]interface{}{
					"type":        "number",
					"description": "The Chrome tab ID to bring to front.",
				},
				"browser": map[string]interface{}{
					"type":    "string",
					"enum":    []string{"main", "dev", "any"},
					"default": "any",
				},
			},
			"required": []string{"tab_id"},
		},
	},
	{
		Name: "modcdp_eval",
		Description: "Evaluate a JavaScript expression in the extension service worker context with full access to chrome.* APIs (chrome.tabs, chrome.windows, chrome.cookies, chrome.storage).",
		InputSchema: map[string]interface{}{
			"type": "object",
			"properties": map[string]interface{}{
				"expression": map[string]interface{}{
					"type":        "string",
					"description": "JavaScript expression to evaluate with chrome.* in scope.",
				},
				"browser": map[string]interface{}{
					"type":    "string",
					"enum":    []string{"main", "dev", "any"},
					"default": "any",
				},
			},
			"required": []string{"expression"},
		},
	},
	{
		Name: "eval_in_tab",
		Description: "Evaluate JavaScript directly in the DOM execution context of a specific tab.",
		InputSchema: map[string]interface{}{
			"type": "object",
			"properties": map[string]interface{}{
				"tab_id": map[string]interface{}{
					"type":        "number",
					"description": "The Chrome tab ID.",
				},
				"expression": map[string]interface{}{
					"type":        "string",
					"description": "JavaScript code to run in page DOM.",
				},
				"browser": map[string]interface{}{
					"type":    "string",
					"enum":    []string{"main", "dev", "any"},
					"default": "any",
				},
			},
			"required": []string{"tab_id", "expression"},
		},
	},
	{
		Name: "capture_active_tab_screenshot",
		Description: "Capture a screenshot of a specific tab or the active visual tab without destroying tab context.",
		InputSchema: map[string]interface{}{
			"type": "object",
			"properties": map[string]interface{}{
				"tab_id": map[string]interface{}{
					"type":        "number",
					"description": "Optional tab ID. If omitted, captures currently active tab. If specified, briefly brings tab to front to capture.",
				},
				"format": map[string]interface{}{
					"type":    "string",
					"enum":    []string{"png", "jpeg"},
					"default": "png",
				},
				"browser": map[string]interface{}{
					"type":    "string",
					"enum":    []string{"main", "dev", "any"},
					"default": "any",
				},
			},
		},
	},
}

func parseNumber(v interface{}) (int64, error) {
	switch val := v.(type) {
	case float64:
		return int64(val), nil
	case float32:
		return int64(val), nil
	case int64:
		return val, nil
	case int:
		return int64(val), nil
	case int32:
		return int64(val), nil
	case json.Number:
		return val.Int64()
	case string:
		n, err := strconv.ParseInt(val, 10, 64)
		if err != nil {
			f, ferr := strconv.ParseFloat(val, 64)
			if ferr != nil {
				return 0, fmt.Errorf("invalid number: %v", v)
			}
			return int64(f), nil
		}
		return n, nil
	default:
		return 0, fmt.Errorf("invalid number type: %T", v)
	}
}

func BuildCommandForTool(name string, args map[string]interface{}) (*ToolCommand, error) {
	if args == nil {
		args = make(map[string]interface{})
	}
	browser := "any"
	if b, ok := args["browser"].(string); ok && b != "" {
		browser = b
	}

	switch name {
	case "get_active_tab":
		return &ToolCommand{
			Browser: browser,
			Method:  "Mod.getActiveTab",
			Params:  map[string]interface{}{},
			FallbackExpression: `(async () => {
          const [tab] = (await chrome.tabs.query({ active: true, lastFocusedWindow: true })) || [];
          if (tab) return { id: tab.id, title: tab.title, url: tab.url, windowId: tab.windowId, active: true };
          const [fallback] = (await chrome.tabs.query({ active: true })) || [];
          if (fallback) return { id: fallback.id, title: fallback.title, url: fallback.url, windowId: fallback.windowId, active: true };
          return null;
        })()`,
		}, nil

	case "find_tabs_by_title":
		titlePatternRaw, ok := args["title_pattern"]
		if !ok || titlePatternRaw == nil {
			return nil, fmt.Errorf("missing required parameter: title_pattern")
		}
		titlePattern, ok := titlePatternRaw.(string)
		if !ok || titlePattern == "" {
			return nil, fmt.Errorf("missing required parameter: title_pattern")
		}
		urlPattern, _ := args["url_pattern"].(string)

		jsonTitle, _ := json.Marshal(titlePattern)
		jsonURL, _ := json.Marshal(urlPattern)

		expr := fmt.Sprintf(`(async () => {
            const tabs = await chrome.tabs.query({});
            const regex = new RegExp(%s, "i");
            const urlFilter = %s;
            return tabs
              .filter(t => regex.test(t.title || "") && (!urlFilter || (t.url || "").includes(urlFilter)))
              .map(t => ({ id: t.id, title: t.title, url: t.url, windowId: t.windowId, active: t.active }));
          })()`, string(jsonTitle), string(jsonURL))

		return &ToolCommand{
			Browser: browser,
			Method:  "Mod.evaluate",
			Params: map[string]interface{}{
				"expression": expr,
			},
		}, nil

	case "focus_tab":
		tabIDRaw, ok := args["tab_id"]
		if !ok || tabIDRaw == nil {
			return nil, fmt.Errorf("missing required parameter: tab_id")
		}
		tabID, err := parseNumber(tabIDRaw)
		if err != nil {
			return nil, fmt.Errorf("invalid tab_id: %w", err)
		}

		expr := fmt.Sprintf(`(async () => {
            const tab = await chrome.tabs.get(%d);
            await chrome.windows.update(tab.windowId, { focused: true });
            await chrome.tabs.update(%d, { active: true });
            return { focused: true, tab_id: %d, title: tab.title, url: tab.url };
          })()`, tabID, tabID, tabID)

		return &ToolCommand{
			Browser: browser,
			Method:  "Mod.evaluate",
			Params: map[string]interface{}{
				"expression": expr,
			},
		}, nil

	case "modcdp_eval":
		expressionRaw, ok := args["expression"]
		if !ok || expressionRaw == nil {
			return nil, fmt.Errorf("missing required parameter: expression")
		}
		expression, ok := expressionRaw.(string)
		if !ok || expression == "" {
			return nil, fmt.Errorf("missing required parameter: expression")
		}

		return &ToolCommand{
			Browser: browser,
			Method:  "Mod.evaluate",
			Params: map[string]interface{}{
				"expression": expression,
			},
		}, nil

	case "eval_in_tab":
		tabIDRaw, ok := args["tab_id"]
		if !ok || tabIDRaw == nil {
			return nil, fmt.Errorf("missing required parameter: tab_id")
		}
		tabID, err := parseNumber(tabIDRaw)
		if err != nil {
			return nil, fmt.Errorf("invalid tab_id: %w", err)
		}

		expressionRaw, ok := args["expression"]
		if !ok || expressionRaw == nil {
			return nil, fmt.Errorf("missing required parameter: expression")
		}
		expression, ok := expressionRaw.(string)
		if !ok || expression == "" {
			return nil, fmt.Errorf("missing required parameter: expression")
		}
		jsonExpr, _ := json.Marshal(expression)

		expr := fmt.Sprintf(`(async () => {
            const results = await chrome.scripting.executeScript({
              target: { tabId: %d },
              func: (code) => eval(code),
              args: [%s]
            });
            return results?.[0]?.result;
          })()`, tabID, string(jsonExpr))

		return &ToolCommand{
			Browser: browser,
			Method:  "Mod.evaluate",
			Params: map[string]interface{}{
				"expression": expr,
			},
		}, nil

	case "capture_active_tab_screenshot":
		format := "png"
		if f, ok := args["format"].(string); ok && f != "" {
			if f != "png" && f != "jpeg" {
				return nil, fmt.Errorf("invalid format '%s': must be 'png' or 'jpeg'", f)
			}
			format = f
		}
		jsonFormat, _ := json.Marshal(format)

		tabIDRaw, hasTabID := args["tab_id"]
		var tabID int64
		if hasTabID && tabIDRaw != nil {
			var err error
			tabID, err = parseNumber(tabIDRaw)
			if err != nil {
				return nil, fmt.Errorf("invalid tab_id: %w", err)
			}
		}

		if tabID <= 0 {
			expr := fmt.Sprintf(`(async () => {
              const dataUrl = await chrome.tabs.captureVisibleTab(null, { format: %s });
              return { format: %s, dataUrl };
            })()`, string(jsonFormat), string(jsonFormat))

			return &ToolCommand{
				Browser: browser,
				Method:  "Mod.evaluate",
				Params: map[string]interface{}{
					"expression": expr,
				},
			}, nil
		}

		expr := fmt.Sprintf(`(async () => {
            const [prevActive] = (await chrome.tabs.query({ active: true, lastFocusedWindow: true })) || [];
            await chrome.tabs.update(%d, { active: true });
            const dataUrl = await chrome.tabs.captureVisibleTab(null, { format: %s });
            if (prevActive && prevActive.id !== %d) {
              await chrome.tabs.update(prevActive.id, { active: true });
            }
            return { format: %s, dataUrl, note: "Tab was temporarily focused to capture visual buffer." };
          })()`, tabID, string(jsonFormat), tabID, string(jsonFormat))

		return &ToolCommand{
			Browser: browser,
			Method:  "Mod.evaluate",
			Params: map[string]interface{}{
				"expression": expr,
			},
		}, nil

	default:
		return nil, fmt.Errorf("Unsupported tool: %s", name)
	}
}
