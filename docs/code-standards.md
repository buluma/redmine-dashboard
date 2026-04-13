# Code Standards

This document outlines the coding standards and conventions used in the Converge project. Adhering to these standards ensures consistency and maintainability across the codebase.

## General Principles

- **Framework:** The project is built using [Next.js](https://nextjs.org/) with the App Router.
- **Language:** [TypeScript](https://www.typescriptlang.org/) is the primary language.
- **Formatting:** Code formatting is enforced by Prettier, which should be run automatically by your editor.
- **Linting:** [ESLint](https://eslint.org/) is used for code quality, configured with the recommended rules from `eslint-config-next`.

## TypeScript

The `tsconfig.json` is configured with `strict: true` enabled. This enforces a high level of type safety.

- **Type Safety:** Write strongly typed code. Avoid using `any` unless absolutely necessary.
- **Module Resolution:** The project uses `moduleResolution: "bundler"`.
- **ES Modules:** Use ES module syntax (`import`/`export`).
- **Path Aliases:** The project uses the `@/*` path alias to refer to the root of the project. For example, instead of `import { db } from '../../lib/db'`, use `import { db } from '@/src/lib/db'`.

## React

- **Functional Components:** Use functional components with hooks.
- **JSX:** The project uses the `react-jsx` transform. You do not need to import React to use JSX.
- **Hooks:** Follow the rules of hooks.

## Naming Conventions

- **Files:** Use kebab-case for file names (e.g., `github-links-route.ts`).
- **Components:** Use PascalCase for React component names (e.g., `IssueDetail`).
- **Variables and Functions:** Use camelCase for variables and functions (e.g., `getIssues`).
- **Types and Interfaces:** Use PascalCase for type and interface names (e.g., `RedmineIssue`).

## API Routes

- **Request/Response:** Use `NextRequest` and `NextResponse` from `next/server`.
- **Validation:** Use Zod for validating request bodies and parameters. Schemas are defined in `src/lib/schemas.ts`.
- **Error Handling:** API routes should handle errors gracefully and return appropriate HTTP status codes.

## Prisma

- **Client:** The Prisma client is initialized in `src/lib/db.ts`.
- **Schema:** The database schema is defined in `prisma/schema.prisma`.
- **Migrations:** After changing the schema, generate a new migration: `npx prisma migrate dev`.
- **Client Generation:** If the client is out of date, regenerate it with `npm run prisma:generate`.
