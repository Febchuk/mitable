import { render, screen, fireEvent } from "@testing-library/react";
import AgentPill from "./AgentPill";

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
