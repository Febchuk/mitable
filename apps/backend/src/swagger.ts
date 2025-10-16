import swaggerJsdoc from "swagger-jsdoc";

const swaggerDefinition = {
  openapi: "3.0.0",
  info: {
    title: "Mitable API",
    version: "1.0.0",
    description: "AI-powered onboarding assistant API - provides contextual help, roadmap management, expert nudges, and conversation history for employee onboarding.",
    contact: {
      name: "Mitable Team",
      url: "https://mitable.app",
    },
  },
  servers: [
    {
      url: "http://localhost:3000/api",
      description: "Development server",
    },
    {
      url: "https://api.mitable.app/api",
      description: "Production server",
    },
  ],
  components: {
    securitySchemes: {
      BearerAuth: {
        type: "http",
        scheme: "bearer",
        bearerFormat: "JWT",
        description: "JWT access token from Supabase Auth. Include as: Authorization: Bearer <token>",
      },
    },
    schemas: {
      // Common schemas
      Error: {
        type: "object",
        properties: {
          success: {
            type: "boolean",
            example: false,
          },
          error: {
            type: "object",
            properties: {
              code: {
                type: "string",
                example: "VALIDATION_ERROR",
              },
              message: {
                type: "string",
                example: "Invalid request body",
              },
              details: {
                type: "array",
                items: {
                  type: "object",
                  properties: {
                    field: { type: "string" },
                    message: { type: "string" },
                  },
                },
              },
            },
          },
        },
      },
      User: {
        type: "object",
        properties: {
          id: {
            type: "string",
            format: "uuid",
            description: "User ID",
          },
          email: {
            type: "string",
            format: "email",
            description: "User email address",
          },
          firstName: {
            type: "string",
            nullable: true,
            description: "First name",
          },
          lastName: {
            type: "string",
            nullable: true,
            description: "Last name",
          },
          role: {
            type: "string",
            enum: ["admin", "employee"],
            description: "User role in organization",
          },
          organizationId: {
            type: "string",
            format: "uuid",
            description: "Organization ID",
          },
          status: {
            type: "string",
            enum: ["active", "inactive"],
            description: "User account status",
          },
          avatarUrl: {
            type: "string",
            nullable: true,
            description: "Profile avatar URL",
          },
          startDate: {
            type: "string",
            format: "date-time",
            nullable: true,
            description: "Employee start date",
          },
          currentWeek: {
            type: "integer",
            nullable: true,
            description: "Current week in onboarding roadmap",
          },
          createdAt: {
            type: "string",
            format: "date-time",
            description: "Account creation timestamp",
          },
          updatedAt: {
            type: "string",
            format: "date-time",
            description: "Last update timestamp",
          },
        },
      },
      Session: {
        type: "object",
        properties: {
          access_token: {
            type: "string",
            description: "JWT access token",
          },
          refresh_token: {
            type: "string",
            description: "JWT refresh token",
          },
          expires_in: {
            type: "integer",
            description: "Token expiration time in seconds",
          },
          token_type: {
            type: "string",
            example: "bearer",
          },
        },
      },
      Conversation: {
        type: "object",
        properties: {
          id: {
            type: "string",
            format: "uuid",
          },
          userId: {
            type: "string",
            format: "uuid",
          },
          title: {
            type: "string",
            description: "Conversation title",
          },
          contextType: {
            type: "string",
            enum: ["help_request", "general", "expert"],
            description: "Type of conversation context",
          },
          status: {
            type: "string",
            enum: ["active", "resolved", "archived"],
            description: "Conversation status",
          },
          lastMessageAt: {
            type: "string",
            format: "date-time",
            nullable: true,
          },
          createdAt: {
            type: "string",
            format: "date-time",
          },
        },
      },
      Message: {
        type: "object",
        properties: {
          id: {
            type: "string",
            format: "uuid",
          },
          conversationId: {
            type: "string",
            format: "uuid",
          },
          role: {
            type: "string",
            enum: ["user", "assistant", "system"],
          },
          content: {
            type: "string",
            description: "Message content",
          },
          messageType: {
            type: "string",
            enum: ["text", "screenshot", "visual_guidance"],
          },
          timestamp: {
            type: "string",
            format: "date-time",
          },
          sources: {
            type: "array",
            items: {
              type: "object",
              properties: {
                title: { type: "string" },
                url: { type: "string" },
                relevanceScore: { type: "number" },
              },
            },
          },
        },
      },
      RoadmapTask: {
        type: "object",
        properties: {
          id: {
            type: "string",
            format: "uuid",
          },
          title: {
            type: "string",
          },
          description: {
            type: "string",
            nullable: true,
          },
          timeEstimate: {
            type: "string",
            nullable: true,
            description: "Estimated time to complete (e.g., '2 hours')",
          },
          completed: {
            type: "boolean",
          },
          completedAt: {
            type: "string",
            format: "date-time",
            nullable: true,
          },
          week: {
            type: "integer",
            description: "Week number in roadmap",
          },
          orderIndex: {
            type: "integer",
            description: "Sort order within week",
          },
        },
      },
      Nudge: {
        type: "object",
        properties: {
          id: {
            type: "string",
            format: "uuid",
          },
          userId: {
            type: "string",
            format: "uuid",
          },
          expertId: {
            type: "string",
            format: "uuid",
          },
          expertName: {
            type: "string",
          },
          expertRole: {
            type: "string",
          },
          expertAvatar: {
            type: "string",
            nullable: true,
          },
          description: {
            type: "string",
          },
          context: {
            type: "string",
            nullable: true,
          },
          matchScore: {
            type: "string",
            description: "Match confidence score (0-1)",
          },
          matchReasons: {
            type: "array",
            items: { type: "string" },
          },
          status: {
            type: "string",
            enum: ["waiting", "accepted", "declined", "resolved"],
          },
          deliveryChannel: {
            type: "string",
            enum: ["in_app", "slack", "email"],
          },
          timestamp: {
            type: "string",
            format: "date-time",
          },
          acceptedAt: {
            type: "string",
            format: "date-time",
            nullable: true,
          },
          resolvedAt: {
            type: "string",
            format: "date-time",
            nullable: true,
          },
          online: {
            type: "boolean",
          },
        },
      },
      Template: {
        type: "object",
        properties: {
          id: {
            type: "string",
            format: "uuid",
          },
          organizationId: {
            type: "string",
            format: "uuid",
          },
          title: {
            type: "string",
          },
          description: {
            type: "string",
            nullable: true,
          },
          icon: {
            type: "string",
            nullable: true,
            description: "Emoji icon for template",
          },
          roleTags: {
            type: "array",
            items: { type: "string" },
            description: "Role tags (e.g., 'Software Engineer', 'Designer')",
          },
          totalWeeks: {
            type: "integer",
            description: "Duration of onboarding in weeks",
          },
          usedCount: {
            type: "integer",
            description: "Number of times template has been assigned",
          },
          createdAt: {
            type: "string",
            format: "date-time",
          },
          updatedAt: {
            type: "string",
            format: "date-time",
          },
        },
      },
    },
    responses: {
      BadRequest: {
        description: "Bad Request - Invalid input",
        content: {
          "application/json": {
            schema: {
              $ref: "#/components/schemas/Error",
            },
            example: {
              success: false,
              error: {
                code: "VALIDATION_ERROR",
                message: "Invalid request body",
                details: [
                  {
                    field: "email",
                    message: "Email is required",
                  },
                ],
              },
            },
          },
        },
      },
      Unauthorized: {
        description: "Unauthorized - Authentication required",
        content: {
          "application/json": {
            schema: {
              $ref: "#/components/schemas/Error",
            },
            example: {
              success: false,
              error: {
                code: "UNAUTHORIZED",
                message: "Authentication required",
              },
            },
          },
        },
      },
      Forbidden: {
        description: "Forbidden - Insufficient permissions",
        content: {
          "application/json": {
            schema: {
              $ref: "#/components/schemas/Error",
            },
            example: {
              success: false,
              error: {
                code: "FORBIDDEN",
                message: "Admin role required for this action",
              },
            },
          },
        },
      },
      NotFound: {
        description: "Not Found - Resource does not exist",
        content: {
          "application/json": {
            schema: {
              $ref: "#/components/schemas/Error",
            },
            example: {
              success: false,
              error: {
                code: "NOT_FOUND",
                message: "Resource not found",
                resourceType: "conversation",
                resourceId: "uuid",
              },
            },
          },
        },
      },
      InternalError: {
        description: "Internal Server Error",
        content: {
          "application/json": {
            schema: {
              $ref: "#/components/schemas/Error",
            },
            example: {
              success: false,
              error: {
                code: "INTERNAL_ERROR",
                message: "An unexpected error occurred",
                requestId: "req_abc123",
              },
            },
          },
        },
      },
    },
  },
  security: [
    {
      BearerAuth: [],
    },
  ],
};

const options: swaggerJsdoc.Options = {
  definition: swaggerDefinition,
  // Look for JSDoc comments in route files
  apis: [
    "./src/routes/**/*.ts",
    "./src/routes.ts",
    "./src/app.ts",
  ],
};

export const swaggerSpec = swaggerJsdoc(options);
