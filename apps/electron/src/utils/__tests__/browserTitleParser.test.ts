/**
 * Unit tests for Browser Title Parser
 *
 * Tests parsing of browser window titles to extract tab titles
 * for cleaner display in the watch list.
 */

import {
  isBrowserApp,
  parseBrowserTitle,
  formatWindowDisplayName,
  isSystemApp,
} from "../browserTitleParser";

describe("browserTitleParser", () => {
  describe("isBrowserApp", () => {
    it("should identify Google Chrome", () => {
      expect(isBrowserApp("Google Chrome")).toBe(true);
    });

    it("should identify Chrome (short name)", () => {
      expect(isBrowserApp("chrome")).toBe(true);
    });

    it("should identify Mozilla Firefox", () => {
      expect(isBrowserApp("Mozilla Firefox")).toBe(true);
      expect(isBrowserApp("Firefox")).toBe(true);
    });

    it("should identify Safari", () => {
      expect(isBrowserApp("Safari")).toBe(true);
    });

    it("should identify Microsoft Edge", () => {
      expect(isBrowserApp("Microsoft Edge")).toBe(true);
      expect(isBrowserApp("msedge")).toBe(true);
    });

    it("should identify Brave Browser", () => {
      expect(isBrowserApp("Brave Browser")).toBe(true);
      expect(isBrowserApp("Brave")).toBe(true);
    });

    it("should identify Arc", () => {
      expect(isBrowserApp("Arc")).toBe(true);
    });

    it("should identify Opera", () => {
      expect(isBrowserApp("Opera")).toBe(true);
    });

    it("should identify Vivaldi", () => {
      expect(isBrowserApp("Vivaldi")).toBe(true);
    });

    it("should not identify non-browser apps", () => {
      expect(isBrowserApp("Visual Studio Code")).toBe(false);
      expect(isBrowserApp("Slack")).toBe(false);
      expect(isBrowserApp("Finder")).toBe(false);
      expect(isBrowserApp("Terminal")).toBe(false);
      expect(isBrowserApp("Notion")).toBe(false);
    });

    it("should be case insensitive", () => {
      expect(isBrowserApp("GOOGLE CHROME")).toBe(true);
      expect(isBrowserApp("google chrome")).toBe(true);
      expect(isBrowserApp("GoOgLe ChRoMe")).toBe(true);
    });
  });

  describe("parseBrowserTitle", () => {
    describe("Chrome", () => {
      it("should extract tab title from Chrome window title", () => {
        const result = parseBrowserTitle("Gmail - Inbox - Google Chrome", "Google Chrome");
        expect(result.tabTitle).toBe("Gmail - Inbox");
        expect(result.browserDisplayName).toBe("Chrome");
        expect(result.formattedDisplay).toBe("Chrome \u2022 Gmail - Inbox");
        expect(result.isBrowser).toBe(true);
      });

      it("should handle simple page titles", () => {
        const result = parseBrowserTitle("Google - Google Chrome", "Google Chrome");
        expect(result.tabTitle).toBe("Google");
        expect(result.formattedDisplay).toBe("Chrome \u2022 Google");
      });

      it("should handle long URLs in title", () => {
        const result = parseBrowserTitle(
          "http://localhost:3000/dashboard/settings - Google Chrome",
          "Google Chrome"
        );
        expect(result.tabTitle).toBe("http://localhost:3000/dashboard/settings");
      });
    });

    describe("Firefox", () => {
      it("should extract tab title with em dash separator", () => {
        const result = parseBrowserTitle("Gmail - Inbox — Mozilla Firefox", "Mozilla Firefox");
        expect(result.tabTitle).toBe("Gmail - Inbox");
        expect(result.browserDisplayName).toBe("Firefox");
        expect(result.formattedDisplay).toBe("Firefox \u2022 Gmail - Inbox");
        expect(result.isBrowser).toBe(true);
      });

      // Note: Firefox uses em dash (—) not regular dash (-) in its window titles
      // The regular dash case is intentionally not supported as it's not the actual Firefox format
    });

    describe("Safari", () => {
      it("should handle Safari (no suffix in title)", () => {
        const result = parseBrowserTitle("Gmail - Inbox", "Safari");
        expect(result.tabTitle).toBe("Gmail - Inbox");
        expect(result.browserDisplayName).toBe("Safari");
        expect(result.formattedDisplay).toBe("Safari \u2022 Gmail - Inbox");
        expect(result.isBrowser).toBe(true);
      });
    });

    describe("Edge", () => {
      it("should extract tab title from Edge window title", () => {
        const result = parseBrowserTitle("Gmail - Inbox - Microsoft Edge", "Microsoft Edge");
        expect(result.tabTitle).toBe("Gmail - Inbox");
        expect(result.browserDisplayName).toBe("Edge");
        expect(result.formattedDisplay).toBe("Edge \u2022 Gmail - Inbox");
      });
    });

    describe("Brave", () => {
      it("should extract tab title from Brave window title", () => {
        const result = parseBrowserTitle("Gmail - Inbox - Brave", "Brave Browser");
        expect(result.tabTitle).toBe("Gmail - Inbox");
        expect(result.browserDisplayName).toBe("Brave");
        expect(result.formattedDisplay).toBe("Brave \u2022 Gmail - Inbox");
      });
    });

    describe("Arc", () => {
      it("should handle Arc (no suffix in title)", () => {
        const result = parseBrowserTitle("Gmail - Inbox", "Arc");
        expect(result.tabTitle).toBe("Gmail - Inbox");
        expect(result.browserDisplayName).toBe("Arc");
        expect(result.formattedDisplay).toBe("Arc \u2022 Gmail - Inbox");
      });
    });

    describe("title truncation", () => {
      it("should truncate very long tab titles", () => {
        const longTitle =
          "This is a very long page title that should be truncated because it exceeds the maximum allowed length - Google Chrome";
        const result = parseBrowserTitle(longTitle, "Google Chrome");
        expect(result.formattedDisplay.length).toBeLessThan(60);
        expect(result.formattedDisplay).toContain("...");
      });

      it("should not truncate short titles", () => {
        const result = parseBrowserTitle("Gmail - Google Chrome", "Google Chrome");
        expect(result.formattedDisplay).toBe("Chrome \u2022 Gmail");
        expect(result.formattedDisplay).not.toContain("...");
      });
    });

    describe("edge cases", () => {
      it("should handle empty window title", () => {
        const result = parseBrowserTitle("", "Google Chrome");
        expect(result.formattedDisplay).toBe("Chrome \u2022 New Tab");
      });

      it("should handle title that is just the browser name", () => {
        const result = parseBrowserTitle("Google Chrome", "Google Chrome");
        expect(result.tabTitle).toBe("Google Chrome");
      });
    });

    describe("non-browser apps", () => {
      it("should return original title for non-browser apps", () => {
        const result = parseBrowserTitle("Project - Visual Studio Code", "Visual Studio Code");
        expect(result.isBrowser).toBe(false);
        expect(result.formattedDisplay).toBe("Visual Studio Code");
        expect(result.browserDisplayName).toBe("Visual Studio Code");
      });

      it("should not modify Slack window title", () => {
        const result = parseBrowserTitle("Mitable - Slack", "Slack");
        expect(result.isBrowser).toBe(false);
        expect(result.formattedDisplay).toBe("Slack");
      });
    });
  });

  describe("formatWindowDisplayName", () => {
    it("should format browser window display name", () => {
      const displayName = formatWindowDisplayName("GitHub - Google Chrome", "Google Chrome");
      expect(displayName).toBe("Chrome \u2022 GitHub");
    });

    it("should return app name for non-browsers", () => {
      const displayName = formatWindowDisplayName("Document.txt - TextEdit", "TextEdit");
      expect(displayName).toBe("TextEdit");
    });
  });

  describe("isSystemApp", () => {
    it("should identify Finder as system app", () => {
      expect(isSystemApp("Finder")).toBe(true);
    });

    it("should identify Notification Center as system app", () => {
      expect(isSystemApp("Notification Center")).toBe(true);
    });

    it("should identify System Preferences as system app", () => {
      expect(isSystemApp("System Preferences")).toBe(true);
      expect(isSystemApp("System Settings")).toBe(true);
    });

    it("should identify Control Center as system app", () => {
      expect(isSystemApp("Control Center")).toBe(true);
    });

    it("should identify Spotlight as system app", () => {
      expect(isSystemApp("Spotlight")).toBe(true);
    });

    it("should identify Launchpad as system app", () => {
      expect(isSystemApp("Launchpad")).toBe(true);
    });

    it("should identify Mission Control as system app", () => {
      expect(isSystemApp("Mission Control")).toBe(true);
    });

    it("should identify Dock as system app", () => {
      expect(isSystemApp("Dock")).toBe(true);
    });

    it("should identify loginwindow as system app", () => {
      expect(isSystemApp("loginwindow")).toBe(true);
    });

    it("should NOT identify regular apps as system apps", () => {
      expect(isSystemApp("Google Chrome")).toBe(false);
      expect(isSystemApp("Visual Studio Code")).toBe(false);
      expect(isSystemApp("Slack")).toBe(false);
      expect(isSystemApp("Terminal")).toBe(false);
      expect(isSystemApp("Notes")).toBe(false);
      expect(isSystemApp("Safari")).toBe(false);
    });

    it("should be case insensitive", () => {
      expect(isSystemApp("FINDER")).toBe(true);
      expect(isSystemApp("finder")).toBe(true);
      expect(isSystemApp("Finder")).toBe(true);
    });
  });
});
