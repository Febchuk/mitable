import { z } from "zod";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { eq, and, desc, or, ilike, sql } from "drizzle-orm";
import { db } from "../../db/client.js";
import * as schema from "../../db/schema/index.js";

export function registerDocumentTools(server: McpServer, organizationId: string) {
  // ─── search_documents ───────────────────────────────────────────────
  server.registerTool(
    "search_documents",
    {
      description:
        "Search the organization's knowledge base documents by keyword, type, or status.",
      inputSchema: {
        search: z.string().optional().describe("Search term for title and description"),
        docType: z.string().optional().describe("Filter by document type"),
        status: z.string().optional().describe("Filter by status: draft, published, archived"),
        page: z.number().int().min(1).default(1),
        limit: z.number().int().min(1).max(50).default(20),
      },
    },
    async ({ search, docType, status, page, limit }) => {
      const conditions: any[] = [eq(schema.documents.organizationId, organizationId)];
      if (docType) conditions.push(eq(schema.documents.docType, docType));
      if (status) conditions.push(eq(schema.documents.status, status));
      if (search) {
        conditions.push(
          or(
            ilike(schema.documents.title, `%${search}%`),
            ilike(schema.documents.description, `%${search}%`)
          )
        );
      }

      const offset = (page - 1) * limit;

      const [countResult, docs] = await Promise.all([
        db
          .select({ count: sql<number>`count(*)::int` })
          .from(schema.documents)
          .where(and(...conditions)),
        db
          .select({
            id: schema.documents.id,
            title: schema.documents.title,
            docType: schema.documents.docType,
            status: schema.documents.status,
            description: schema.documents.description,
            tags: schema.documents.tags,
            createdBy: schema.documents.createdBy,
            createdAt: schema.documents.createdAt,
            updatedAt: schema.documents.updatedAt,
          })
          .from(schema.documents)
          .where(and(...conditions))
          .orderBy(desc(schema.documents.updatedAt))
          .limit(limit)
          .offset(offset),
      ]);

      const total = countResult[0]?.count ?? 0;

      return {
        content: [
          {
            type: "text" as const,
            text: JSON.stringify({
              documents: docs,
              pagination: { page, limit, total, pages: Math.ceil(total / limit) },
            }),
          },
        ],
      };
    }
  );

  // ─── get_document ───────────────────────────────────────────────────
  server.registerTool(
    "get_document",
    {
      description: "Get full document content by ID.",
      inputSchema: {
        documentId: z.string().uuid().describe("The document ID"),
      },
    },
    async ({ documentId }) => {
      const [doc] = await db
        .select({
          id: schema.documents.id,
          title: schema.documents.title,
          content: schema.documents.content,
          docType: schema.documents.docType,
          status: schema.documents.status,
          description: schema.documents.description,
          tags: schema.documents.tags,
          createdBy: schema.documents.createdBy,
          createdAt: schema.documents.createdAt,
          updatedAt: schema.documents.updatedAt,
        })
        .from(schema.documents)
        .where(
          and(
            eq(schema.documents.id, documentId),
            eq(schema.documents.organizationId, organizationId)
          )
        )
        .limit(1);

      if (!doc) {
        return {
          content: [
            { type: "text" as const, text: JSON.stringify({ error: "Document not found" }) },
          ],
        };
      }

      return { content: [{ type: "text" as const, text: JSON.stringify({ document: doc }) }] };
    }
  );

  // ─── create_document ────────────────────────────────────────────────
  server.registerTool(
    "create_document",
    {
      description: "Create a new knowledge base document.",
      inputSchema: {
        title: z.string().describe("Document title"),
        content: z.string().describe("Document content (markdown)"),
        docType: z.string().optional().describe("Document type (e.g., 'update', 'note', 'report')"),
        description: z.string().optional().describe("Short description"),
      },
    },
    async ({ title, content, docType, description }) => {
      // Use first org admin as creator since MCP is org-scoped (no specific user)
      const [admin] = await db
        .select({ id: schema.users.id })
        .from(schema.users)
        .where(and(eq(schema.users.organizationId, organizationId), eq(schema.users.role, "admin")))
        .limit(1);

      if (!admin) {
        return {
          content: [
            {
              type: "text" as const,
              text: JSON.stringify({ error: "No admin user found in organization" }),
            },
          ],
        };
      }

      const [doc] = await db
        .insert(schema.documents)
        .values({
          organizationId,
          createdBy: admin.id,
          title,
          content,
          docType: docType ?? "note",
          status: "draft",
          description,
        })
        .returning({
          id: schema.documents.id,
          title: schema.documents.title,
          docType: schema.documents.docType,
          status: schema.documents.status,
          createdAt: schema.documents.createdAt,
        });

      return { content: [{ type: "text" as const, text: JSON.stringify({ document: doc }) }] };
    }
  );
}
