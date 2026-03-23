# Code Review Rules — AI Battle Arena

## TypeScript
- Use `const`/`let`, never `var`
- Prefer explicit return types on public functions
- No `any` — use `unknown` or proper types
- Use `strict` mode in tsconfig

## React
- Functional components only
- Prefer named exports
- Use `useCallback`/`useMemo` for stable references in dependency arrays
- Avoid inline objects in JSX props when possible
- Use `useRef` for values that shouldn't trigger re-renders

## Backend (Hono)
- Validate input with Zod schemas
- Use admin auth middleware for protected endpoints
- Return typed JSON responses

## Styling (Tailwind)
- Maintain cyberpunk/terminal aesthetic: `font-mono`, `uppercase`, `tracking-widest`
- Use project color tokens: `text-gold`, `text-alpha`, `text-beta`, `text-green`
- Border style: `border border-borderBright`

## General
- No hardcoded secrets
- No console.log in production code
- Prefer early returns over deep nesting
