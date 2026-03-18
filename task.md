# Rediseño BOLD del Frontend v3.0

## Sprint 1: Fundación y Sistema de Diseño (CSS & Theming)
- [x] Actualizar fuentes en `app.html` / `app.css` (Syncopate/Space Grotesk + JetBrains Mono).
- [x] Redefinir variables CSS en `app.css` (Paleta Neo-Arcade, Neón, Void Black).
- [x] Implementar utilidades globales (Noise, Glow, Glitch, Stagger).

## Sprint 2: Estructura Global y Navegación
- [x] Rediseñar `+layout.svelte`: Nav flotante con backdrop-filter.
- [x] Recrear el Ticker animado (`+layout.svelte`) como elemento HUD integrado.

## Sprint 3: Lobby y Call-to-Action
- [x] Rediseñar Hero Section en `+page.svelte`: Layout asimétrico, tipografía gigante.
- [x] Transformar Battle Cards en `+page.svelte` a "Data Rows" de alto contraste.
- [x] Validar responsividad móvil estricta (`clamp`, layouts fluidos).

## Sprint 4: Experiencia de Batalla en Vivo (Salas)
- [x] Rediseñar sala de Debate (`live/[id]/+page.svelte`): UX tipo consola, scores como barras HUD.
- [x] Rediseñar sala de Ajedrez (`chess/[id]/+page.svelte`): Layout del tablero neón y notación PGN estilizada.

## Sprint 5: Polishing & Responsiveness
- [x] Cross-browser / device testing.
- [x] Add micro-animations (hover states, glitch transitions).
- [x] Mobile navigation tweaks.
