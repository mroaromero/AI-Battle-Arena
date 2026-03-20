// HTTP client — calls the backend REST API (/api/* endpoints)

import type {
  ApiResult, Battle, BattleContext, ChessContext,
  ContenderSide,
} from "./types.js";

const BACKEND_URL = (process.env.BACKEND_URL ?? "http://localhost:3000").replace(/\/$/, "");

async function call<T>(
  method: "GET" | "POST",
  path: string,
  body?: Record<string, unknown>,
): Promise<ApiResult<T>> {
  try {
    const res = await fetch(`${BACKEND_URL}${path}`, {
      method,
      headers: { "Content-Type": "application/json" },
      body: body ? JSON.stringify(body) : undefined,
    });
    const json = await res.json() as ApiResult<T>;
    return json;
  } catch (e) {
    return { ok: false, error: `Error de conexión con el backend: ${String(e)}` };
  }
}

// ─── Debate battles ───────────────────────────────────────────────────────────

export function createBattle(params: {
  topic: string;
  alpha_stance: string;
  beta_stance: string;
  my_name: string;
  my_device: string;
  max_rounds: number;
}) {
  return call<{
    battle_id: string;
    join_url: string;
    my_side: "alpha";
    share_message: string;
    instructions: string;
  }>("POST", "/api/battles", params);
}

export function listBattles() {
  return call<{
    count: number;
    battles: {
      id: string; topic: string; game_mode: string; status: string;
      round: string; alpha: string; beta: string; spectators: number;
    }[];
  }>("GET", "/api/battles");
}

export function getBattle(id: string) {
  return call<Battle>("GET", `/api/battles/${id}`);
}

export function getBattleContext(id: string, my_side: ContenderSide) {
  return call<BattleContext>("POST", `/api/battles/${id}/context`, { my_side });
}

export function joinBattle(id: string, params: { my_name: string; my_device: string }) {
  return call<BattleContext & { welcome: string }>("POST", `/api/battles/${id}/beta`, params);
}

export function submitArgument(id: string, params: { my_side: ContenderSide; argument: string }) {
  return call<Record<string, unknown>>("POST", `/api/battles/${id}/argument`, params);
}

export function spectateBattle(id: string) {
  return call<Record<string, unknown>>("POST", `/api/battles/${id}/spectate`, {});
}

// ─── Chess battles ────────────────────────────────────────────────────────────

export function createChessMatch(params: { my_name: string; my_device: string }) {
  return call<{
    battle_id: string;
    my_color: "white";
    join_url: string;
    share_message: string;
    instructions: string;
  }>("POST", "/api/chess", params);
}

export function joinChessMatch(id: string, params: { my_name: string; my_device: string }) {
  return call<ChessContext & { welcome: string }>("POST", `/api/chess/${id}/beta`, params);
}

export function makeChessMove(id: string, params: { my_side: ContenderSide; move: string }) {
  return call<Record<string, unknown>>("POST", `/api/chess/${id}/move`, params);
}

export function getChessBoard(id: string, my_side: ContenderSide) {
  return call<ChessContext>("GET", `/api/chess/${id}?side=${my_side}`);
}
