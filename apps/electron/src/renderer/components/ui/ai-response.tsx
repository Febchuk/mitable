/**
 * Adapted from Vercel AI Elements (Apache License 2.0, Copyright 2023 Vercel, Inc.)
 * Source: https://github.com/vercel/ai-elements
 */

import { cn } from "@/lib/utils";
import type { ComponentProps, HTMLAttributes } from "react";
import { isValidElement, memo } from "react";
import ReactMarkdown, { type Options } from "react-markdown";
import rehypeKatex from "rehype-katex";
import remarkGfm from "remark-gfm";
import remarkMath from "remark-math";
import { CodeBlock } from "./code-block";
import "katex/dist/katex.min.css";

/**
 * Parses markdown text and removes incomplete tokens to prevent partial rendering
 * of links, images, bold, and italic formatting during streaming.
 */
function parseIncompleteMarkdown(text: string): string {
  if (!text || typeof text !== "string") {
    return text;
  }

  let result = text;

  // Handle incomplete links and images
  // Pattern: [...] or ![...] where the closing ] is missing
  const linkImagePattern = /(!?\[)([^\]]*?)$/;
  const linkMatch = result.match(linkImagePattern);
  if (linkMatch) {
    // If we have an unterminated [ or ![, remove it and everything after
    const startIndex = result.lastIndexOf(linkMatch[1]);
    result = result.substring(0, startIndex);
  }

  // Handle incomplete bold formatting (**)
  const boldPattern = /(\*\*)([^*]*?)$/;
  const boldMatch = result.match(boldPattern);
  if (boldMatch) {
    // Count the number of ** in the entire string
    const asteriskPairs = (result.match(/\*\*/g) || []).length;
    // If odd number of **, we have an incomplete bold - complete it
    if (asteriskPairs % 2 === 1) {
      result = `${result}**`;
    }
  }

  // Handle incomplete italic formatting (__)
  const italicPattern = /(__)([^_]*?)$/;
  const italicMatch = result.match(italicPattern);
  if (italicMatch) {
    // Count the number of __ in the entire string
    const underscorePairs = (result.match(/__/g) || []).length;
    // If odd number of __, we have an incomplete italic - complete it
    if (underscorePairs % 2 === 1) {
      result = `${result}__`;
    }
  }

  // Handle incomplete single asterisk italic (*)
  const singleAsteriskPattern = /(\*)([^*]*?)$/;
  const singleAsteriskMatch = result.match(singleAsteriskPattern);
  if (singleAsteriskMatch) {
    // Count single asterisks that aren't part of **
    const singleAsterisks = result.split("").reduce((acc, char, index) => {
      if (char === "*") {
        // Check if it's part of a ** pair
        const prevChar = result[index - 1];
        const nextChar = result[index + 1];
        if (prevChar !== "*" && nextChar !== "*") {
          return acc + 1;
        }
      }
      return acc;
    }, 0);

    // If odd number of single *, we have an incomplete italic - complete it
    if (singleAsterisks % 2 === 1) {
      result = `${result}*`;
    }
  }

  // Handle incomplete single underscore italic (_)
  const singleUnderscorePattern = /(_)([^_]*?)$/;
  const singleUnderscoreMatch = result.match(singleUnderscorePattern);
  if (singleUnderscoreMatch) {
    // Count single underscores that aren't part of __
    const singleUnderscores = result.split("").reduce((acc, char, index) => {
      if (char === "_") {
        // Check if it's part of a __ pair
        const prevChar = result[index - 1];
        const nextChar = result[index + 1];
        if (prevChar !== "_" && nextChar !== "_") {
          return acc + 1;
        }
      }
      return acc;
    }, 0);

    // If odd number of single _, we have an incomplete italic - complete it
    if (singleUnderscores % 2 === 1) {
      result = `${result}_`;
    }
  }

  // Handle incomplete inline code (`)
  // Don't auto-complete if we're inside a code block (```)
  const codeBlockCount = (result.match(/```/g) || []).length;
  const isInsideCodeBlock = codeBlockCount % 2 === 1;

  if (!isInsideCodeBlock) {
    const inlineCodePattern = /(`+)([^`]*?)$/;
    const inlineCodeMatch = result.match(inlineCodePattern);
    if (inlineCodeMatch) {
      const backticks = inlineCodeMatch[1];
      const allBackticks = result.match(new RegExp(backticks, "g")) || [];
      // If odd number of backtick groups, complete it
      if (allBackticks.length % 2 === 1) {
        result = `${result}${backticks}`;
      }
    }
  }

  return result;
}

export interface ResponseProps extends HTMLAttributes<HTMLDivElement> {
  children: string | React.ReactNode;
  options?: Options;
  allowedImagePrefixes?: string[];
  allowedLinkPrefixes?: string[];
  defaultOrigin?: string;
  parseIncompleteMarkdown?: boolean;
}

export const Response = memo(
  ({
    children,
    options,
    allowedImagePrefixes = ["*"],
    allowedLinkPrefixes = ["*"],
    defaultOrigin: _defaultOrigin,
    parseIncompleteMarkdown: shouldParseIncomplete = true,
    className,
    ...props
  }: ResponseProps) => {
    // If children is not a string, return as-is
    if (!children || typeof children !== "string") {
      return isValidElement(children) ? children : <div {...props}>{children}</div>;
    }

    // Parse incomplete markdown if enabled
    const content = shouldParseIncomplete ? parseIncompleteMarkdown(children) : children;

    return (
      <div className={cn("prose prose-invert max-w-none", className)} {...props}>
        <ReactMarkdown
          remarkPlugins={[remarkGfm, remarkMath, ...((options?.remarkPlugins as any[]) || [])]}
          rehypePlugins={[rehypeKatex, ...((options?.rehypePlugins as any[]) || [])]}
          components={{
            // Headings
            h1: ({ ...props }) => (
              <h1 className="text-xl font-bold text-text-primary mb-4 mt-6" {...props} />
            ),
            h2: ({ ...props }) => (
              <h2 className="text-lg font-bold text-text-primary mb-3 mt-5" {...props} />
            ),
            h3: ({ ...props }) => (
              <h3 className="text-base font-semibold text-text-primary mb-2 mt-4" {...props} />
            ),
            h4: ({ ...props }) => (
              <h4 className="text-sm font-semibold text-text-primary mb-2 mt-3" {...props} />
            ),
            h5: ({ ...props }) => (
              <h5 className="text-sm font-medium text-text-primary mb-1 mt-2" {...props} />
            ),
            h6: ({ ...props }) => (
              <h6 className="text-xs font-medium text-text-primary mb-1 mt-2" {...props} />
            ),

            // Paragraphs
            p: ({ ...props }) => (
              <p className="text-text-primary leading-relaxed mb-4" {...props} />
            ),

            // Lists
            ul: ({ ...props }) => <ul className="list-disc pl-6 mb-4 space-y-2" {...props} />,
            ol: ({ ...props }) => <ol className="list-decimal pl-6 mb-4 space-y-2" {...props} />,
            li: ({ ...props }) => <li className="text-text-primary" {...props} />,

            // Tables
            table: ({ ...props }) => (
              <div className="mb-4 w-full">
                <table
                  className="w-full divide-y divide-gray-700 border border-gray-700"
                  {...props}
                />
              </div>
            ),
            thead: ({ ...props }) => <thead className="bg-[#1A1A1A]" {...props} />,
            tbody: ({ ...props }) => (
              <tbody className="divide-y divide-gray-700 bg-[#0A0A0A]" {...props} />
            ),
            tr: ({ ...props }) => <tr {...props} />,
            th: ({ ...props }) => (
              <th
                className="px-4 py-2 text-left text-xs font-semibold text-text-primary uppercase tracking-wider break-words"
                {...props}
              />
            ),
            td: ({ ...props }) => <td className="px-4 py-2 text-sm text-text-primary break-words" {...props} />,

            // Code
            code: ({ className, ...props }: ComponentProps<"code">) => {
              const isInline = !className;
              return isInline ? (
                <code
                  className="bg-[#2A2A2A] text-primary px-1.5 py-0.5 rounded text-xs font-mono"
                  {...props}
                />
              ) : (
                <CodeBlock className={className} {...props} />
              );
            },
            pre: ({ ...props }) => <>{props.children}</>,

            // Links
            a: ({ href, ...props }) => {
              const isAllowed =
                allowedLinkPrefixes.includes("*") ||
                allowedLinkPrefixes.some((prefix) => href?.startsWith(prefix));

              return isAllowed ? (
                <a
                  href={href}
                  className="text-primary hover:text-primary-hover underline"
                  target="_blank"
                  rel="noopener noreferrer"
                  {...props}
                />
              ) : (
                <span className="text-text-secondary" {...props} />
              );
            },

            // Images
            img: ({ src, alt, ...props }) => {
              const isAllowed =
                allowedImagePrefixes.includes("*") ||
                allowedImagePrefixes.some((prefix) => src?.startsWith(prefix));

              return isAllowed ? (
                <img src={src} alt={alt} className="max-w-full h-auto rounded-lg mb-4" {...props} />
              ) : null;
            },

            // Blockquotes
            blockquote: ({ ...props }) => (
              <blockquote
                className="border-l-4 border-primary pl-4 italic text-text-secondary mb-4 py-2"
                {...props}
              />
            ),

            // Horizontal Rule
            hr: ({ ...props }) => <hr className="border-gray-700 my-6" {...props} />,

            // Strong/Bold
            strong: ({ ...props }) => (
              <strong className="font-semibold text-text-primary" {...props} />
            ),

            // Emphasis/Italic
            em: ({ ...props }) => <em className="italic" {...props} />,

            // Strikethrough
            del: ({ ...props }) => <del className="line-through text-text-tertiary" {...props} />,

            ...options?.components,
          }}
        >
          {content}
        </ReactMarkdown>
      </div>
    );
  }
);

Response.displayName = "Response";
