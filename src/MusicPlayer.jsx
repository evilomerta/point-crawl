import React, { useEffect, useRef, useState } from "react";
import { PALETTE, parseYouTubeId } from "./data";

// Load the YouTube IFrame API once.
let ytPromise = null;
function loadYT() {
  if (window.YT && window.YT.Player) return Promise.resolve(window.YT);
  if (ytPromise) return ytPromise;
  ytPromise = new Promise((resolve) => {
    const tag = document.createElement("script");
    tag.src = "https://www.youtube.com/iframe_api";
    document.body.appendChild(tag);
    const prev = window.onYouTubeIframeAPIReady;
    window.onYouTubeIframeAPIReady = () => { if (prev) prev(); resolve(window.YT); };
  });
  return ytPromise;
}

const VOL_KEY = "dw_music_vol";

export default function MusicPlayer({ music, isDM, open, onClose, onSubmit, onPlayPause, onStop, onJoinedChange, listeners = [] }) {
  const [joined, setJoined] = useState(false);
  useEffect(() => { if (onJoinedChange) onJoinedChange(joined); }, [joined]); // eslint-disable-line
  const [url, setUrl] = useState("");
  const [err, setErr] = useState("");
  const [vol, setVol] = useState(() => Number(localStorage.getItem(VOL_KEY) || 50));

  const containerRef = useRef(null);
  const playerRef = useRef(null);
  const readyRef = useRef(false);
  const lastVidRef = useRef(null);
  const musicRef = useRef(music);
  useEffect(() => { musicRef.current = music; }, [music]);

  const applyState = () => {
    const p = playerRef.current;
    const m = musicRef.current;
    if (!p || !readyRef.current) return;
    if (!m || !m.videoId) { try { p.stopVideo(); } catch (e) {} lastVidRef.current = null; return; }
    const elapsed = m.playing && m.startedAt ? Math.max(0, (Date.now() - m.startedAt) / 1000) : (m.offset || 0);
    if (lastVidRef.current !== m.videoId) {
      lastVidRef.current = m.videoId;
      if (m.playing) p.loadVideoById({ videoId: m.videoId, startSeconds: elapsed });
      else p.cueVideoById({ videoId: m.videoId });
    } else if (m.playing) {
      try { p.seekTo(elapsed, true); p.playVideo(); } catch (e) {}
    } else {
      try { p.pauseVideo(); } catch (e) {}
    }
  };

  // create the player once the user has opted in
  useEffect(() => {
    if (!joined) return;
    let cancelled = false;
    loadYT().then((YT) => {
      if (cancelled || playerRef.current || !containerRef.current) return;
      playerRef.current = new YT.Player(containerRef.current, {
        height: "180", width: "320",
        playerVars: { autoplay: 0, controls: 0, disablekb: 1, modestbranding: 1, playsinline: 1, rel: 0 },
        events: {
          onReady: () => { readyRef.current = true; try { playerRef.current.setVolume(vol); } catch (e) {} applyState(); },
        },
      });
    });
    return () => { cancelled = true; };
  }, [joined]); // eslint-disable-line

  // re-sync whenever the shared music state changes
  useEffect(() => { if (joined) applyState(); }, [music?.videoId, music?.playing, music?.startedAt, joined]); // eslint-disable-line

  // volume
  useEffect(() => {
    localStorage.setItem(VOL_KEY, String(vol));
    if (playerRef.current && readyRef.current) { try { playerRef.current.setVolume(vol); } catch (e) {} }
  }, [vol]);

  const leave = () => {
    try { playerRef.current && playerRef.current.stopVideo(); } catch (e) {}
    setJoined(false); readyRef.current = false; lastVidRef.current = null; playerRef.current = null;
  };

  const submit = () => {
    const id = parseYouTubeId(url);
    if (!id) { setErr("That doesn't look like a YouTube link."); return; }
    setErr(""); setUrl("");
    setJoined(true); // submitting counts as a gesture, so the DM hears it too
    onSubmit(id, url.trim());
  };

  const playing = !!music?.playing;

  return (
    <>
      {/* off-screen audio player (always mounted once joined) */}
      <div aria-hidden style={{ position: "absolute", left: -9999, top: 0, width: 320, height: 180, overflow: "hidden", pointerEvents: "none" }}>
        <div ref={containerRef} />
      </div>

      {open && (
        <div onClick={onClose} style={{
          position: "fixed", inset: 0, zIndex: 60, background: "rgba(4,8,10,0.7)",
          display: "flex", alignItems: "center", justifyContent: "center", fontFamily: "'EB Garamond', Georgia, serif",
        }}>
          <div onClick={(e) => e.stopPropagation()} style={{
            width: "min(440px, 92vw)", background: `linear-gradient(160deg, ${PALETTE.deep}, ${PALETTE.ink})`,
            border: `2px solid ${PALETTE.gold}66`, borderRadius: 12, boxShadow: "0 30px 80px rgba(0,0,0,0.7)",
            padding: 22, color: PALETTE.parch,
          }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 14 }}>
              <div className="disp" style={{ fontSize: 22, color: PALETTE.goldBright, letterSpacing: "0.12em" }}>BARD</div>
              <button onClick={onClose} className="disp" style={ghost}>CLOSE ✕</button>
            </div>

            {/* now playing */}
            <div style={{ fontSize: 14, color: PALETTE.parchDim, marginBottom: 14 }}>
              {music?.videoId
                ? <>Now {playing ? "playing" : "paused"}: <span style={{ color: PALETTE.bone }}>{music.url || music.videoId}</span></>
                : "Nothing is playing."}
            </div>

            {/* who hears the bard */}
            <div style={{ marginBottom: 14 }}>
              <div className="disp" style={{ fontSize: 12, color: PALETTE.gold, letterSpacing: "0.16em", marginBottom: 6 }}>AT THE BARD</div>
              <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
                {listeners.map((p) => (
                  <span key={p.key} style={{ fontSize: 13, border: `1px solid ${PALETTE.gold}${p.on ? "88" : "33"}`, borderRadius: 12, padding: "2px 10px", color: p.on ? PALETTE.goldBright : PALETTE.parchDim }}>
                    <span style={{ color: p.on ? PALETTE.ok : PALETTE.parchDim, marginRight: 4 }}>{p.on ? "●" : "○"}</span>
                    {p.role === "dm" ? "★ " : ""}{p.name}
                  </span>
                ))}
                {listeners.length === 0 && <span style={{ fontSize: 13, color: PALETTE.parchDim, fontStyle: "italic" }}>No one at the table.</span>}
              </div>
            </div>

            {/* join / leave */}
            {!joined ? (
              <button onClick={() => setJoined(true)} className="disp" style={gold}>JOIN MUSIC</button>
            ) : (
              <>
                <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 14 }}>
                  <span style={{ fontSize: 13, color: PALETTE.parchDim }}>Volume</span>
                  <input type="range" min={0} max={100} value={vol} onChange={(e) => setVol(Number(e.target.value))} style={{ flex: 1 }} />
                  <button onClick={leave} style={ghost}>leave</button>
                </div>

                {isDM && (
                  <div style={{ borderTop: `1px solid ${PALETTE.gold}33`, paddingTop: 14 }}>
                    <div className="disp" style={{ fontSize: 12, color: PALETTE.gold, letterSpacing: "0.16em", marginBottom: 6 }}>DM CONTROLS</div>
                    <input
                      value={url} onChange={(e) => setUrl(e.target.value)}
                      onKeyDown={(e) => e.key === "Enter" && submit()}
                      placeholder="Paste a YouTube link…"
                      style={{
                        width: "100%", boxSizing: "border-box", padding: "9px 10px", borderRadius: 5,
                        background: "rgba(0,0,0,0.35)", border: `1px solid ${PALETTE.gold}44`,
                        color: PALETTE.bone, fontSize: 14, fontFamily: "inherit", outline: "none", marginBottom: 8,
                      }}
                    />
                    {err && <div style={{ color: PALETTE.bad, fontSize: 13, marginBottom: 8 }}>{err}</div>}
                    <div style={{ display: "flex", gap: 8 }}>
                      <button onClick={submit} className="disp" style={{ ...gold, flex: 1, marginTop: 0 }}>PLAY LINK</button>
                      {music?.videoId && <button onClick={onPlayPause} className="disp" style={ghost}>{playing ? "PAUSE" : "RESUME"}</button>}
                      {music?.videoId && <button onClick={onStop} className="disp" style={ghost}>STOP</button>}
                    </div>
                  </div>
                )}
                {!isDM && (
                  <div style={{ fontSize: 13, color: PALETTE.parchDim, fontStyle: "italic" }}>
                    The Dungeon Master controls what plays.
                  </div>
                )}
              </>
            )}
          </div>
        </div>
      )}
    </>
  );
}

const gold = { width: "100%", marginTop: 0, padding: "11px", background: `linear-gradient(${PALETTE.gold}, ${PALETTE.parchDim})`, color: PALETTE.ink, border: "none", borderRadius: 6, cursor: "pointer", fontSize: 14, letterSpacing: "0.1em" };
const ghost = { background: "transparent", color: PALETTE.parchDim, border: `1px solid ${PALETTE.gold}44`, borderRadius: 6, padding: "8px 12px", cursor: "pointer", fontSize: 13, letterSpacing: "0.08em" };
