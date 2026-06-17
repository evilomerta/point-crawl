import React from "react";
import { PALETTE, FACTIONS, NODES, ROUTES, MAP_W, MAP_H } from "./data";

// Map rep value to the node ring: green when in good standing, red when hostile,
// dim/neutral at zero. Width and opacity grow with the magnitude of the standing.
function repTone(rep) {
  if (rep >= 2) return { ring: PALETTE.ok, w: 3.4, op: 0.95 };
  if (rep >= 1) return { ring: PALETTE.ok, w: 2.6, op: 0.75 };
  if (rep <= -2) return { ring: PALETTE.bad, w: 3.4, op: 0.95 };
  if (rep <= -1) return { ring: PALETTE.bad, w: 2.6, op: 0.7 };
  return { ring: PALETTE.bone, w: 1.6, op: 0.4 };
}

export default function MapView({
  current, routeByDest, tally = {}, selectedRouteId, myVoteRouteId, onPickDest, rep = {},
  boonNodes = [], cluePins = {},
}) {
  return (
    <div
      style={{
        position: "relative", borderRadius: 10, overflow: "hidden",
        border: `2px solid ${PALETTE.gold}55`,
        boxShadow: "0 10px 40px rgba(0,0,0,0.55)",
        aspectRatio: `${MAP_W} / ${MAP_H}`,
        backgroundImage: "url('/map.png')",
        backgroundSize: "100% 100%",
        backgroundPosition: "center",
      }}
    >
      <svg viewBox={`0 0 ${MAP_W} ${MAP_H}`} style={{ width: "100%", display: "block" }}>
        <defs>
          <marker id="onwardArrow" viewBox="0 0 10 8" refX="9" refY="4"
            markerWidth="9" markerHeight="7" orient="auto-start-reverse">
            <path d="M0,0 L10,4 L0,8 L2.5,4 Z" fill={PALETTE.bone} opacity="0.8" />
          </marker>
        </defs>
        {/* onward roads: from the picked destination, faint arrows show where
            the journey can branch next, so far harbors feel reachable */}
        {(() => {
          const selRoute = selectedRouteId ? ROUTES.find((r) => r.id === selectedRouteId) : null;
          if (!selRoute) return null;
          const dest = selRoute.from === current ? selRoute.to : selRoute.from;
          return ROUTES.filter((r) => r.id !== selectedRouteId && (r.from === dest || r.to === dest)).map((r) => {
            const farId = r.from === dest ? r.to : r.from;
            const a = NODES[dest], b = NODES[farId];
            const dx = b.x - a.x, dy = b.y - a.y, len = Math.hypot(dx, dy) || 1;
            const ux = dx / len, uy = dy / len;
            const x1 = a.x + ux * 22, y1 = a.y + uy * 22;
            const x2 = b.x - ux * 28, y2 = b.y - uy * 28;
            return (
              <line key={`onward-${r.id}`} x1={x1} y1={y1} x2={x2} y2={y2}
                stroke={PALETTE.bone} strokeWidth="2" strokeDasharray="2 9"
                strokeLinecap="round" opacity="0.5" markerEnd="url(#onwardArrow)"
                style={{ pointerEvents: "none" }} />
            );
          });
        })()}
        {/* routes */}
        {ROUTES.map((r) => {
          const a = NODES[r.from], b = NODES[r.to];
          const live = r.from === current || r.to === current;
          const sel = r.id === selectedRouteId;
          const c = FACTIONS[r.faction].color;
          if (!live && !sel) return null; // only draw routes from current node, keeps art clean
          return (
            <line
              key={r.id} x1={a.x} y1={a.y} x2={b.x} y2={b.y}
              stroke={sel ? PALETTE.goldBright : c}
              strokeWidth={sel ? 5 : 3.5}
              strokeDasharray="4 12" strokeLinecap="round"
              opacity={0.95}
              className={sel ? "" : "pulse"}
              style={{ filter: "drop-shadow(0 1px 2px rgba(0,0,0,0.8))" }}
            />
          );
        })}

        {/* nodes */}
        {Object.entries(NODES).map(([id, n]) => {
          const isCur = id === current;
          const routeId = routeByDest[id];
          const live = !!routeId && !isCur;
          const c = FACTIONS[n.faction].color;
          const votes = routeId ? tally[routeId] || 0 : 0;
          const mine = routeId && routeId === myVoteRouteId;
          const tone = repTone(rep[n.faction] || 0);
          const labelW = n.name.length * 9.5 + 18;
          const boon = boonNodes.includes(id);
          const clues = cluePins[id] || 0;

          return (
            <g
              key={id}
              style={{ cursor: live ? "pointer" : "default" }}
              onClick={() => live && onPickDest && onPickDest(id, routeId)}
            >
              {/* boon tide: a slow double swirl marks where boons can be earned */}
              {boon && (
                <g style={{ pointerEvents: "none" }}>
                  <circle cx={n.x} cy={n.y} r={33} fill="none"
                    stroke="#cfdde9" strokeWidth="2.6" opacity="0.9"
                    strokeDasharray="14 22" strokeLinecap="round" className="swirl" />
                  <circle cx={n.x} cy={n.y} r={40} fill="none"
                    stroke="#8fa6b8" strokeWidth="1.8" opacity="0.65"
                    strokeDasharray="6 26" strokeLinecap="round" className="swirl-rev" />
                  <circle cx={n.x} cy={n.y} r={33} fill="none"
                    stroke="#cfdde9" strokeWidth="8" opacity="0.14" className="pulse" />
                  <g style={{ filter: "drop-shadow(0 2px 3px rgba(0,0,0,0.9))" }}>
                    <rect x={n.x - 52} y={n.y + 44} width={104} height={17} rx={4}
                      fill="rgba(8,14,16,0.85)" stroke="#8fa6b866" strokeWidth="1" />
                    <text x={n.x} y={n.y + 56.5} textAnchor="middle" className="disp pulse"
                      fill="#cfdde9" fontSize="10.5" letterSpacing="0.12em">✦ BOON TIDE</text>
                  </g>
                </g>
              )}
              {/* reputation ring */}
              <circle cx={n.x} cy={n.y} r={17} fill="none"
                stroke={tone.ring} strokeWidth={tone.w} opacity={tone.op} />

              {isCur && (
                <circle cx={n.x} cy={n.y} r={24} fill="none"
                  stroke={PALETTE.goldBright} strokeWidth="2.4" opacity="0.85" className="pulse" />
              )}
              {mine && (
                <circle cx={n.x} cy={n.y} r={28} fill="none"
                  stroke={PALETTE.bone} strokeWidth="2.5" opacity="0.9" />
              )}

              <circle cx={n.x} cy={n.y} r={11}
                fill={isCur ? PALETTE.goldBright : live ? c : PALETTE.deep}
                stroke={PALETTE.ink} strokeWidth="2"
                style={{ filter: "drop-shadow(0 2px 3px rgba(0,0,0,0.9))" }} />

              {/* label with dark pill for legibility over art */}
              <g style={{ filter: "drop-shadow(0 2px 3px rgba(0,0,0,0.9))" }}>
                <rect x={n.x - labelW / 2} y={n.y - 42} width={labelW} height={22} rx={5}
                  fill="rgba(8,14,16,0.82)" stroke={`${PALETTE.gold}66`} strokeWidth="1" />
                <text x={n.x} y={n.y - 26} textAnchor="middle" className="disp"
                  fill={isCur ? PALETTE.goldBright : PALETTE.bone} fontSize="14">{n.name}</text>
              </g>

              {/* rumor pins: confirmed clues waiting at this place */}
              {clues > 0 && (
                <g style={{ filter: "drop-shadow(0 1px 2px rgba(0,0,0,0.9))" }}>
                  <title>{`${clues} confirmed rumor${clues > 1 ? "s" : ""} from Between Tides waiting at this place`}</title>
                  <circle cx={n.x - 19} cy={n.y - 13} r={10} fill="rgba(8,14,16,0.9)"
                    stroke={PALETTE.bone} strokeWidth="1.4" />
                  <text x={n.x - 19} y={n.y - 9} textAnchor="middle"
                    fill={PALETTE.bone} fontSize="11" className="disp">{clues > 1 ? clues : "⚑"}</text>
                </g>
              )}
              {votes > 0 && (
                <g style={{ filter: "drop-shadow(0 1px 2px rgba(0,0,0,0.9))" }}>
                  <circle cx={n.x + 19} cy={n.y - 13} r={11} fill={PALETTE.ink}
                    stroke={PALETTE.goldBright} strokeWidth="1.5" />
                  <text x={n.x + 19} y={n.y - 8} textAnchor="middle"
                    fill={PALETTE.goldBright} fontSize="13" className="disp">{votes}</text>
                </g>
              )}
            </g>
          );
        })}
      </svg>
    </div>
  );
}
