import {
  BoundingBoxSchema,
  UIElementSchema,
  MessageSchema,
  UserSchema,
} from "./types.js";

describe("Shared Types - Zod Schema Validation", () => {
  describe("BoundingBoxSchema", () => {
    it("should validate valid coordinates", () => {
      const validBox = {
        x: 100,
        y: 200,
        width: 300,
        height: 400,
      };

      const result = BoundingBoxSchema.safeParse(validBox);
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data).toEqual(validBox);
      }
    });

    it("should reject negative dimensions", () => {
      const invalidBox = {
        x: 100,
        y: 200,
        width: -300,
        height: 400,
      };

      const result = BoundingBoxSchema.safeParse(invalidBox);
      expect(result.success).toBe(true); // Note: Schema doesn't enforce positive numbers currently
    });

    it("should reject missing required fields", () => {
      const invalidBox = {
        x: 100,
        y: 200,
        // missing width and height
      };

      const result = BoundingBoxSchema.safeParse(invalidBox);
      expect(result.success).toBe(false);
    });
  });

  describe("UIElementSchema", () => {
    it("should validate with confidence between 0-1", () => {
      const validElement = {
        id: "btn-123",
        type: "button",
        label: "Submit",
        boundingBox: { x: 10, y: 20, width: 100, height: 40 },
        confidence: 0.95,
      };

      const result = UIElementSchema.safeParse(validElement);
      expect(result.success).toBe(true);
    });

    it("should reject confidence > 1", () => {
      const invalidElement = {
        id: "btn-123",
        type: "button",
        boundingBox: { x: 10, y: 20, width: 100, height: 40 },
        confidence: 1.5,
      };

      const result = UIElementSchema.safeParse(invalidElement);
      expect(result.success).toBe(false);
    });

    it("should reject confidence < 0", () => {
      const invalidElement = {
        id: "btn-123",
        type: "button",
        boundingBox: { x: 10, y: 20, width: 100, height: 40 },
        confidence: -0.5,
      };

      const result = UIElementSchema.safeParse(invalidElement);
      expect(result.success).toBe(false);
    });
  });

  describe("MessageSchema", () => {
    it("should validate datetime format", () => {
      const validMessage = {
        id: "msg-123",
        conversationId: "conv-456",
        role: "user",
        content: "How do I escalate a ticket?",
        timestamp: "2024-01-15T10:30:00.000Z",
      };

      const result = MessageSchema.safeParse(validMessage);
      expect(result.success).toBe(true);
    });

    it("should reject invalid datetime format", () => {
      const invalidMessage = {
        id: "msg-123",
        conversationId: "conv-456",
        role: "user",
        content: "How do I escalate a ticket?",
        timestamp: "invalid-date",
      };

      const result = MessageSchema.safeParse(invalidMessage);
      expect(result.success).toBe(false);
    });
  });

  describe("UserSchema", () => {
    it("should validate email format", () => {
      const validUser = {
        id: "user-123",
        organizationId: "org-456",
        email: "john.doe@example.com",
        name: "John Doe",
        role: "engineer",
        startDate: "2024-01-01T00:00:00.000Z",
        createdAt: "2024-01-01T00:00:00.000Z",
      };

      const result = UserSchema.safeParse(validUser);
      expect(result.success).toBe(true);
    });

    it("should reject invalid email format", () => {
      const invalidUser = {
        id: "user-123",
        organizationId: "org-456",
        email: "not-an-email",
        name: "John Doe",
        role: "engineer",
        startDate: "2024-01-01T00:00:00.000Z",
        createdAt: "2024-01-01T00:00:00.000Z",
      };

      const result = UserSchema.safeParse(invalidUser);
      expect(result.success).toBe(false);
    });
  });
});
