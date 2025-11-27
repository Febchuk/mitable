import { render } from "@testing-library/react";
import { screen, fireEvent } from "@testing-library/dom";
import AgentPill from "./AgentPill";

// Mock window.agentAPI for Electron preload bridge
beforeAll(() => {
  Object.defineProperty(window, "agentAPI", {
    value: {
      toggle: jest.fn(),
      showConsole: jest.fn(),
      setIgnoreMouseEvents: jest.fn(),
      resizeWindow: jest.fn(),
      showConversation: jest.fn(),
      hideConversation: jest.fn(),
      toggleConversation: jest.fn(),
      sendMessageToConversation: jest.fn(),
      captureScreenshot: jest.fn(),
      getAuthToken: jest.fn(),
      onAuthTokenUpdated: jest.fn(),
      showNudge: jest.fn(),
      startGuide: jest.fn(),
      onGuideNextStep: jest.fn(),
      toggleWatchMode: jest.fn(),
      unselectWindow: jest.fn(),
      getSelectedWindows: jest.fn().mockResolvedValue([]),
      onWatchWindowsUpdated: jest.fn(),
      offWatchWindowsUpdated: jest.fn(),
      openConversationInConsole: jest.fn(),
    },
    writable: true,
  });
});

describe("AgentPill Component", () => {
  const mockOnSubmit = jest.fn();

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("should render input field in text mode", () => {
    render(<AgentPill onSubmit={mockOnSubmit} />);

    const input = screen.getByPlaceholderText("Ask me anything");
    expect(input).toBeInTheDocument();
  });

  it("should call onSubmit when form is submitted", () => {
    render(<AgentPill onSubmit={mockOnSubmit} />);

    const input = screen.getByPlaceholderText("Ask me anything");
    const submitButton = screen.getByLabelText("Send message");

    fireEvent.change(input, { target: { value: "Test message" } });
    fireEvent.click(submitButton);

    expect(mockOnSubmit).toHaveBeenCalledWith("Test message");
  });

  it("should clear input after submission", () => {
    render(<AgentPill onSubmit={mockOnSubmit} />);

    const input = screen.getByPlaceholderText("Ask me anything") as HTMLInputElement;
    const submitButton = screen.getByLabelText("Send message");

    fireEvent.change(input, { target: { value: "Test message" } });
    fireEvent.click(submitButton);

    expect(input.value).toBe("");
  });

  it("should disable submit button when input is empty", () => {
    render(<AgentPill onSubmit={mockOnSubmit} />);

    const submitButton = screen.getByLabelText("Send message");
    expect(submitButton).toBeDisabled();
  });

  it("should enable submit button when input has text", () => {
    render(<AgentPill onSubmit={mockOnSubmit} />);

    const input = screen.getByPlaceholderText("Ask me anything");
    const submitButton = screen.getByLabelText("Send message");

    fireEvent.change(input, { target: { value: "Test" } });
    expect(submitButton).not.toBeDisabled();
  });
});
