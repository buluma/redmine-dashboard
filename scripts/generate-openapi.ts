/**
 * OpenAPI Auto-Generator
 * 
 * Automatically generates OpenAPI documentation from API route files.
 * Run: npx tsx scripts/generate-openapi.ts
 */

import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const API_DIR = path.join(__dirname, "../app/api");
const OUTPUT_FILE = path.join(__dirname, "../src/lib/auto-swagger.ts");

interface OpenAPIPath {
  [method: string]: {
    tags?: string[];
    summary?: string;
    description?: string;
    parameters?: OpenAPIParameter[];
    requestBody?: OpenAPIRequestBody;
    responses?: OpenAPIResponses;
  };
}

interface OpenAPIParameter {
  name: string;
  in: "query" | "path" | "header";
  required?: boolean;
  schema?: { type: string };
  description?: string;
}

interface OpenAPIRequestBody {
  required?: boolean;
  content?: {
    [contentType: string]: {
      schema?: object;
    };
  };
}

interface OpenAPIResponses {
  [statusCode: string]: {
    description: string;
    content?: {
      [contentType: string]: {
        schema?: object;
      };
    };
  };
}

// Tag mapping based on directory
const DIR_TO_TAG: Record<string, string> = {
  "issues": "Issues",
  "time-entries": "Time Entries",
  "sync": "Sync",
  "reports": "Reports",
  "internal": "Internal",
  "slack": "Slack",
  "ai": "AI",
  "mobile": "Mobile",
  "heimdall": "Heimdall",
  "admin": "Admin",
  "saved-views": "Saved Views",
  "search": "Search",
  "logs": "Logs",
  "notifications": "Notifications",
  "external": "External",
  "chat": "Chat",
};

function getRouteSummary(filePath: string): string {
  const content = fs.readFileSync(filePath, "utf-8");
  
  // Try to extract JSDoc summary
  const jsdocMatch = content.match(/\/\*\*\s*\n\s*\*\s*([^\n]+)/);
  if (jsdocMatch) {
    return jsdocMatch[1].trim();
  }
  
  // Try to extract from function name
  const fnMatch = content.match(/export\s+async\s+function\s+(\w+)/);
  if (fnMatch) {
    const method = fnMatch[1].toUpperCase();
    const dir = path.basename(path.dirname(filePath));
    return `${method} ${dir}`;
  }
  
  return "";
}

function getRouteDescription(filePath: string): string {
  const content = fs.readFileSync(filePath, "utf-8");
  
  // Try to extract JSDoc description
  const descMatch = content.match(/\/\*\*[\s\S]*?\*\s+([^\n*]+)/);
  if (descMatch) {
    return descMatch[1].trim();
  }
  
  return "";
}

function inferParameters(filePath: string): OpenAPIParameter[] {
  const content = fs.readFileSync(filePath, "utf-8");
  const params: OpenAPIParameter[] = [];
  
  // Look for URL params in route like [id] or [slug]
  const urlParams = content.match(/\[\w+\]/g) || [];
  urlParams.forEach(param => {
    const name = param.replace(/[\[\]]/g, "");
    if (!params.find(p => p.name === name)) {
      params.push({
        name,
        in: "path",
        required: true,
        schema: { type: "string" },
        description: `URL parameter: ${name}`,
      });
    }
  });
  
  // Look for query params in URL searchParams
  const queryMatches = content.match(/searchParams\.get\(['"]([^'"]+)['"]\)/g) || [];
  queryMatches.forEach(match => {
    const name = match.match(/['"]([^'"]+)['"]/)?.[1];
    if (name && !params.find(p => p.name === name)) {
      params.push({
        name,
        in: "query",
        required: false,
        schema: { type: "string" },
        description: `Query parameter: ${name}`,
      });
    }
  });
  
  return params;
}

function inferRequestBody(filePath: string): OpenAPIRequestBody | undefined {
  const content = fs.readFileSync(filePath, "utf-8");
  
  // Check if request.json() is called
  if (content.includes("request.json()") || content.includes("await request.json()")) {
    return {
      required: false,
      content: {
        "application/json": {
          schema: { type: "object" },
        },
      },
    };
  }
  
  return undefined;
}

function inferResponses(filePath: string): OpenAPIResponses {
  const content = fs.readFileSync(filePath, "utf-8");
  const responses: OpenAPIResponses = {};
  
  // Check for common response patterns
  if (content.includes("Response.json") || content.includes("jsonError")) {
    responses["200"] = { description: "Success" };
    responses["401"] = { description: "Unauthorized" };
  }
  
  if (content.includes("jsonError") && content.includes("400")) {
    responses["400"] = { description: "Bad Request" };
  }
  
  if (content.includes("jsonError") && content.includes("404")) {
    responses["404"] = { description: "Not Found" };
  }
  
  if (content.includes("jsonError") && content.includes("500")) {
    responses["500"] = { description: "Internal Server Error" };
  }
  
  // If no responses found, add default
  if (Object.keys(responses).length === 0) {
    responses["200"] = { description: "Success" };
  }
  
  return responses;
}

function processDirectory(dir: string): OpenAPIPath {
  const paths: OpenAPIPath = {};
  
  // Skip certain directories
  if (["__tests__", "health"].includes(dir)) return paths;
  
  const dirPath = path.join(API_DIR, dir);
  if (!fs.existsSync(dirPath)) return paths;
  
  const files = fs.readdirSync(dirPath);
  
  files.forEach(file => {
    if (!file.endsWith(".ts") || file === "route.ts" && !dir.includes("[")) {
      // Skip non-TS files and single route.ts files (handled separately)
      return;
    }
    
    const filePath = path.join(dirPath, file);
    
    // Handle route.ts in directory (index route)
    if (file === "route.ts") {
      const indexPath = "/" + dir;
      const content = fs.readFileSync(filePath, "utf-8");
      const methods = ["GET", "POST", "PUT", "PATCH", "DELETE"];
      
      methods.forEach(method => {
        const methodRegex = new RegExp(`export\\s+async\\s+function\\s+${method}\\s*\\(`);
        if (methodRegex.test(content)) {
          const tag = DIR_TO_TAG[dir] || dir.charAt(0).toUpperCase() + dir.slice(1);
          paths[indexPath] = {
            ...paths[indexPath],
            [method.toLowerCase()]: {
              tags: [tag],
              summary: getRouteSummary(filePath),
              description: getRouteDescription(filePath),
              parameters: inferParameters(filePath),
              requestBody: inferRequestBody(filePath),
              responses: inferResponses(filePath),
            },
          };
        }
      });
    } else {
      // Handle dynamic routes like [id]/route.ts
      const routePath = "/" + dir + "/" + file.replace(".ts", "").replace(/\[/g, "{").replace(/\]/g, "}");
      const content = fs.readFileSync(filePath, "utf-8");
      const methods = ["GET", "POST", "PUT", "PATCH", "DELETE"];
      
      methods.forEach(method => {
        const methodRegex = new RegExp(`export\\s+async\\s+function\\s+${method}\\s*\\(`);
        if (methodRegex.test(content)) {
          const tag = DIR_TO_TAG[dir] || dir.charAt(0).toUpperCase() + dir.slice(1);
          paths[routePath] = {
            ...paths[routePath],
            [method.toLowerCase()]: {
              tags: [tag],
              summary: getRouteSummary(filePath),
              description: getRouteDescription(filePath),
              parameters: inferParameters(filePath),
              requestBody: inferRequestBody(filePath),
              responses: inferResponses(filePath),
            },
          };
        }
      });
    }
  });
  
  return paths;
}

function generateOpenAPI(): void {
  const dirs = fs.readdirSync(API_DIR).filter(d => 
    fs.statSync(path.join(API_DIR, d)).isDirectory()
  );
  
  let allPaths: OpenAPIPath = {};
  
  dirs.forEach(dir => {
    const paths = processDirectory(dir);
    allPaths = { ...allPaths, ...paths };
  });
  
  const openapiDoc = {
    openapi: "3.0.3",
    info: {
      title: "Converge API",
      description: "Converge API - Unified operations dashboard API. Auto-generated from route files.",
      version: "1.0.0",
    },
    servers: [
      {
        url: "/api",
        description: "Current server",
      },
    ],
    tags: Object.values(DIR_TO_TAG).map(tag => ({ name: tag, description: `${tag} endpoints` })),
    paths: allPaths,
  };
  
  // Write to file
  const output = `/**
 * Auto-generated OpenAPI Specification
 * 
 * This file is auto-generated by scripts/generate-openapi.ts
 * Do not edit manually - run the generator instead
 * 
 * To regenerate: npx tsx scripts/generate-openapi.ts
 */

import swaggerJsdoc from "swagger-jsdoc";

export const autoOpenApiOptions: swaggerJsdoc.Options = ${JSON.stringify(openapiDoc, null, 2)};

export default autoOpenApiOptions;
`;
  
  fs.writeFileSync(OUTPUT_FILE, output);
  console.log(`✅ Generated OpenAPI spec with ${Object.keys(allPaths).length} endpoints`);
  console.log(`   Output: ${OUTPUT_FILE}`);
}

// Run if called directly
if (process.argv[1] === import.meta.url) {
  generateOpenAPI();
}

export { generateOpenAPI };