/**
 * OpenAPI Auto-Generator
 * 
 * Recursively generates OpenAPI documentation from all API route files.
 * Run: node scripts/generate-openapi.js
 */

const fs = require("fs");
const path = require("path");

const API_DIR = path.join(__dirname, "../app/api");
const OUTPUT_FILE = path.join(__dirname, "../src/lib/auto-swagger.ts");

const DIR_TO_TAG = {
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
  "webhooks": "Webhooks",
  "metrics": "Metrics",
  "redmine": "Redmine",
  "session": "Session",
  "ops": "Ops",
  "api-docs": "API Docs",
};

function getRouteSummary(content) {
  const jsdocMatch = content.match(/\/\*\*\s*\n\s*\*\s*([^\n]+)/);
  if (jsdocMatch) return jsdocMatch[1].trim();
  const fnMatch = content.match(/export\s+async\s+function\s+(\w+)/);
  if (fnMatch) return fnMatch[1];
  return "";
}

function getRouteDescription(content) {
  const descMatch = content.match(/\/\*\*[\s\S]*?\*\s+([^\n*]+)/);
  if (descMatch) return descMatch[1].trim();
  return "";
}

function inferParameters(content) {
  const params = [];
  const urlParams = content.match(/\[\w+\]/g) || [];
  urlParams.forEach(param => {
    const name = param.replace(/[\[\]]/g, "");
    if (!params.find(p => p.name === name)) {
      params.push({ name, in: "path", required: true, schema: { type: "string" }, description: `URL: ${name}` });
    }
  });
  const queryMatches = content.match(/searchParams\.get\(['"]([^'"]+)['"]\)/g) || [];
  queryMatches.forEach(match => {
    const name = match.match(/['"]([^'"]+)['"]/)?.[1];
    if (name && !params.find(p => p.name === name)) {
      params.push({ name, in: "query", required: false, schema: { type: "string" }, description: name });
    }
  });
  return params;
}

function inferRequestBody(content) {
  if (content.includes("request.json()") || content.includes("await request.json()")) {
    return { required: false, content: { "application/json": { schema: { type: "object" } } } };
  }
  return undefined;
}

function inferResponses(content) {
  const responses = {};
  if (content.includes("Response.json") || content.includes("jsonError")) {
    responses["200"] = { description: "Success" };
    responses["401"] = { description: "Unauthorized" };
  }
  if (content.includes("400")) responses["400"] = { description: "Bad Request" };
  if (content.includes("404")) responses["404"] = { description: "Not Found" };
  if (content.includes("500") || content.includes("500,")) responses["500"] = { description: "Internal Server Error" };
  if (content.includes("429")) responses["429"] = { description: "Rate Limited" };
  if (Object.keys(responses).length === 0) responses["200"] = { description: "Success" };
  return responses;
}

function processRouteFile(filePath) {
  const content = fs.readFileSync(filePath, "utf-8");
  const methods = ["GET", "POST", "PUT", "PATCH", "DELETE"];
  const paths = {};
  
  // Determine route path from file path
  const relPath = path.relative(API_DIR, filePath);
  const parts = relPath.replace(/\\/g, "/").split("/");
  
  let routePath = "";
  if (parts.length === 2 && parts[1] === "route.ts") {
    // /api/folder/route.ts -> /folder
    routePath = "/" + parts[0];
  } else if (parts.length === 3 && parts[2] === "route.ts") {
    // /api/folder/subfolder/route.ts -> /folder/subfolder
    routePath = "/" + parts.slice(0, 2).join("/");
  } else if (parts.length >= 2) {
    // /api/folder/[id]/route.ts or /api/folder/route.ts -> construct path
    routePath = "/" + parts.slice(0, -1).join("/").replace(/\[/g, "{").replace(/\]/g, "}");
  }
  
  if (!routePath) return paths;
  
  methods.forEach(method => {
    const methodRegex = new RegExp(`export\\s+async\\s+function\\s+${method}\\s*\\(`);
    if (methodRegex.test(content)) {
      // Get tag from first directory
      const firstDir = parts[0];
      const tag = DIR_TO_TAG[firstDir] || firstDir.charAt(0).toUpperCase() + firstDir.slice(1);
      
      if (!paths[routePath]) paths[routePath] = {};
      
      paths[routePath][method.toLowerCase()] = {
        tags: [tag],
        summary: getRouteSummary(content),
        description: getRouteDescription(content),
        parameters: inferParameters(content),
        requestBody: inferRequestBody(content),
        responses: inferResponses(content),
      };
    }
  });
  
  return paths;
}

function walkDir(dir, basePath = "") {
  const paths = {};
  
  if (!fs.existsSync(dir)) return paths;
  
  const items = fs.readdirSync(dir);
  
  items.forEach(item => {
    const fullPath = path.join(dir, item);
    const stat = fs.statSync(fullPath);
    
    if (stat.isDirectory()) {
      // Recurse into subdirectories
      const subPaths = walkDir(fullPath, basePath);
      Object.assign(paths, subPaths);
    } else if (item === "route.ts" || (item.endsWith("]") && item.endsWith(".ts"))) {
      // Process route files
      const filePaths = processRouteFile(fullPath);
      Object.assign(paths, filePaths);
    }
  });
  
  return paths;
}

function generateOpenAPI() {
  const allPaths = walkDir(API_DIR);
  
  // Get unique tags
  const tags = new Set();
  Object.values(allPaths).forEach(methods => {
    Object.values(methods).forEach(m => {
      if (m.tags && m.tags[0]) tags.add(m.tags[0]);
    });
  });
  
  const openapiDoc = {
    openapi: "3.0.3",
    info: {
      title: "Converge API",
      description: "Converge API - Auto-generated from route files. Run 'node scripts/generate-openapi.js' to regenerate.",
      version: "1.0.0",
    },
    servers: [{ url: "/api", description: "Current server" }],
    tags: Array.from(tags).map(tag => ({ name: tag, description: `${tag} endpoints` })),
    paths: allPaths,
  };
  
  const output = `/**
 * Auto-generated OpenAPI Specification
 * 
 * This file is auto-generated by scripts/generate-openapi.js
 * Do not edit manually - run: node scripts/generate-openapi.js
 */

import swaggerJsdoc from "swagger-jsdoc";

export const autoOpenApiOptions = ${JSON.stringify(openapiDoc, null, 2)};

export default autoOpenApiOptions;
`;
  
  fs.writeFileSync(OUTPUT_FILE, output);
  console.log("✅ Generated " + Object.keys(allPaths).length + " endpoints -> " + OUTPUT_FILE);
}

generateOpenAPI();