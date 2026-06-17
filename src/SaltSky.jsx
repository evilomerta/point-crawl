// The sky over the page. A transparent fullscreen-quad shader canvas that
// paints light shafts falling across the whole UI. Idle, it holds a quiet
// morning. When the DM turns the day (saltTurnTs), every client plays the same
// thirty second sweep, synced by the shared timestamp: sunrise, the arc, dusk,
// a blue night, the grey hour, morning again. The skies value (0 clear,
// 1 rain, 2 tempest) layers wind-leant rain sheets, a storm wash, and
// lightning, with thunder fired through the ambience engine.
// Rendered inside the app's zoom; the canvas is sized to the un-zoomed
// viewport via the 100/scale convention.

import { useEffect, useRef } from "react";
import * as THREE from "three";
import { thunderSoon } from "./ambience";

const FRAG = `
    varying vec2 vUv; uniform float uT; uniform float uPhase; uniform float uAsp; uniform float uStorm; uniform float uFlash;
    float hash(vec2 p){ return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
    float n1(float x){ float i = floor(x); float f = fract(x); f = f*f*(3.0-2.0*f); return mix(hash(vec2(i,1.0)), hash(vec2(i+1.0,1.0)), f); }
    void main(){
      float ph = uPhase;
      float angle = -0.62; float glow = 0.5 + sin(uT * 0.3) * 0.06;
      vec3 tint = vec3(1.0, 0.93, 0.78);
      float night = 0.0;
      if (ph >= 0.0) {
        if (ph < 0.42) {
          float k = ph / 0.42;
          angle = mix(-1.0, 1.0, k);
          glow = 0.35 + sin(k * 3.14159) * 0.7;
          tint = mix(vec3(1.0, 0.72, 0.5), vec3(1.0, 0.97, 0.85), sin(k * 3.14159));
          tint = mix(tint, vec3(1.0, 0.6, 0.38), smoothstep(0.8, 1.0, k));
        } else if (ph < 0.52) {
          float k = (ph - 0.42) / 0.1;
          angle = 1.0; glow = mix(0.35, 0.07, k);
          tint = vec3(1.0, 0.52, 0.34);
        } else if (ph < 0.82) {
          float k = (ph - 0.52) / 0.3;
          angle = mix(-0.5, 0.4, k); glow = 0.18 + sin(k * 3.14159) * 0.1;
          tint = vec3(0.6, 0.72, 1.0); night = 1.0;
        } else {
          float k = (ph - 0.82) / 0.18;
          angle = mix(-1.05, -0.62, k); glow = mix(0.07, 0.5, k);
          tint = mix(vec3(0.6, 0.72, 1.0), vec3(1.0, 0.85, 0.62), k);
        }
      }
      vec2 p = vec2((vUv.x - 0.5) * uAsp, vUv.y);
      float s = clamp(uStorm * 0.5, 0.0, 1.0);
      glow *= 1.0 - s * 0.72;
      tint = mix(tint, vec3(0.62, 0.7, 0.74), s * 0.7);
      float drop = 1.0 - vUv.y;
      float b = p.x + drop * angle * 0.9;
      float drift = uT * (0.05 + night * 0.02);
      float wide = pow(n1(b * 4.0 + drift), 3.0) * 0.7;
      float thin = pow(n1(b * 12.0 - drift * 1.7 + 40.0), 5.0) * 0.65;
      float fall = smoothstep(-0.1, 0.55, vUv.y);
      float spread = 1.0 - smoothstep(0.5, 1.35, abs(p.x + angle * 0.45));
      float beams = (wide + thin) * fall * spread;
      float skyglow = smoothstep(0.6, 1.08, vUv.y) * 0.3;
      vec3 col = tint * (beams * 0.9 + skyglow) * glow;
      float a = clamp(max(col.r, max(col.g, col.b)) * 1.15, 0.0, 0.82);
      // the rain, two sheets of streaks leaning with the wind
      if (uStorm > 0.01) {
        float wind = 0.18 + s * 0.24;
        float rx = p.x + (1.0 - vUv.y) * wind;
        float c1 = floor(rx * 110.0);
        float h1 = hash(vec2(c1, 3.0));
        float y1 = fract(vUv.y * (6.0 + h1 * 3.0) + uT * (2.0 + h1 * 1.2) + h1 * 9.0);
        float w1 = 1.0 - smoothstep(0.0, 0.1, abs(fract(rx * 110.0) - 0.5));
        float d1 = smoothstep(0.0, 0.05, y1) * smoothstep(0.3, 0.1, y1) * w1 * step(h1, 0.42 + s * 0.34);
        float rx2 = p.x + (1.0 - vUv.y) * wind * 1.45;
        float c2 = floor(rx2 * 58.0);
        float h2 = hash(vec2(c2, 11.0));
        float y2 = fract(vUv.y * (4.0 + h2 * 2.0) + uT * (3.1 + h2) + h2 * 7.0);
        float w2 = 1.0 - smoothstep(0.0, 0.15, abs(fract(rx2 * 58.0) - 0.5));
        float d2 = smoothstep(0.0, 0.05, y2) * smoothstep(0.38, 0.12, y2) * w2 * step(h2, 0.32 + s * 0.3);
        float rainA = (d1 * 0.5 + d2 * 0.32) * uStorm * 0.45;
        vec3 rainC = vec3(0.6, 0.71, 0.8);
        col = col * (1.0 - rainA) + rainC * rainA;
        a = max(a, rainA * 0.6);
        float wash = s * 0.2 + s * smoothstep(0.4, 1.0, vUv.y) * 0.1;
        col *= 1.0 - wash * 0.5;
        a = max(a, wash);
      }
      col += vec3(0.85, 0.9, 1.0) * uFlash;
      a = max(a, uFlash * 0.8);
      gl_FragColor = vec4(col, a);
    }`;

export default function SaltSky({ skies = 0, turnTs = 0, scale = 1, paused = false }) {
  const cvRef = useRef(null);
  const skiesRef = useRef(skies);
  const turnRef = useRef(turnTs);
  const pausedRef = useRef(paused);
  const startRef = useRef(null);
  skiesRef.current = skies;
  turnRef.current = turnTs;
  pausedRef.current = paused;

  useEffect(() => {
    const cv = cvRef.current;
    if (!cv) return;
    let renderer;
    try {
      renderer = new THREE.WebGLRenderer({ canvas: cv, alpha: true, antialias: false, powerPreference: "low-power" });
    } catch {
      return; // no WebGL: the dash simply has no sky
    }
    renderer.setPixelRatio(1);
    renderer.setClearColor(0x000000, 0);
    const scene = new THREE.Scene();
    const cam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
    const U = { uT: { value: 0 }, uPhase: { value: -1 }, uAsp: { value: 1 }, uStorm: { value: 0 }, uFlash: { value: 0 } };
    const quad = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), new THREE.ShaderMaterial({
      uniforms: U, transparent: true, depthWrite: false, depthTest: false,
      vertexShader: "varying vec2 vUv; void main(){ vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }",
      fragmentShader: FRAG,
    }));
    scene.add(quad);
    const size = () => {
      renderer.setSize(Math.max(2, Math.floor(window.innerWidth / 2)), Math.max(2, Math.floor(window.innerHeight / 2)), false);
      U.uAsp.value = window.innerWidth / window.innerHeight;
    };
    size();
    window.addEventListener("resize", size);

    let storm = skiesRef.current, boltT = 4, flashV = 0, raf = 0, running = false;
    const clock = new THREE.Clock();
    const frame = () => {
      // Stop the pump entirely while overlays are open or the tab is hidden.
      // A loop that keeps scheduling frames (even one that skips the draw) holds
      // Chrome in continuous-composite mode, which makes it re-rasterize the
      // overlays' full-screen backdrop blur every single frame over the zoomed
      // dash. Returning WITHOUT rescheduling lets the page go idle, so Chrome
      // caches the blur and drops to low-power compositing.
      if (pausedRef.current || document.hidden) { running = false; return; }
      const dt = Math.min(clock.getDelta(), 0.05);
      const t = clock.elapsedTime;
      U.uT.value = t;
      storm += (skiesRef.current - storm) * Math.min(dt * 0.8, 1);
      U.uStorm.value = storm;
      const turn = turnRef.current || 0;
      const age = Date.now() - turn;
      U.uPhase.value = turn > 0 && age >= 0 && age < 30000 ? age / 30000 : -1;
      if (storm > 1.55) {
        boltT -= dt;
        if (boltT <= 0) { flashV = 1; boltT = 4 + Math.random() * 6; thunderSoon(); }
      } else {
        boltT = Math.max(boltT, 1.2);
      }
      flashV = Math.max(0, flashV - dt * 3.2);
      U.uFlash.value = flashV * (0.35 + Math.abs(Math.sin(t * 57)) * 0.65) * 0.45;
      renderer.render(scene, cam);
      raf = requestAnimationFrame(frame);
    };
    const start = () => {
      if (running || pausedRef.current || document.hidden) return;
      running = true;
      clock.getDelta(); // discard the idle gap so storm/lightning don't lurch on resume
      raf = requestAnimationFrame(frame);
    };
    startRef.current = start;
    const onVis = () => { if (!document.hidden) start(); };
    document.addEventListener("visibilitychange", onVis);
    start();
    return () => {
      cancelAnimationFrame(raf);
      running = false;
      startRef.current = null;
      document.removeEventListener("visibilitychange", onVis);
      window.removeEventListener("resize", size);
      quad.geometry.dispose();
      quad.material.dispose();
      renderer.dispose();
    };
  }, []);

  // The loop self-stops when an overlay opens (paused -> true); restart it when
  // the overlay closes. Keeping the context alive avoids context-recreation
  // hitches and the black-screen risk of rebuilding GL on the same canvas.
  useEffect(() => { if (!paused) startRef.current?.(); }, [paused]);

  return (
    <canvas ref={cvRef} style={{
      position: "fixed", top: 0, left: 0,
      width: `${100 / scale}vw`, height: `${100 / scale}vh`,
      pointerEvents: "none", zIndex: 40,
      display: paused ? "none" : "block",
    }} />
  );
}
