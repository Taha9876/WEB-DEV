"use client";

import { useEffect, useRef } from "react";

const TRAIL = 24;

const VERT = `attribute vec2 a;void main(){gl_Position=vec4(a,0.,1.);}`;
const FRAG = `
precision highp float;
uniform vec2 uRes; uniform float uTime; uniform float uDark; uniform float uIntensity;
uniform vec3 uTrail[${TRAIL}];
uniform vec3 uA; uniform vec3 uB; uniform vec3 uG; uniform vec3 uBg;
float hash(vec2 p){return fract(sin(dot(p,vec2(127.1,311.7)))*43758.5453);}
float noise(vec2 p){vec2 i=floor(p),f=fract(p);vec2 u=f*f*(3.-2.*f);
  return mix(mix(hash(i),hash(i+vec2(1,0)),u.x),mix(hash(i+vec2(0,1)),hash(i+vec2(1,1)),u.x),u.y);}
float fbm(vec2 p){float v=0.,a=.5;for(int i=0;i<4;i++){v+=a*noise(p);p=p*2.03+17.1;a*=.5;}return v;}
void main(){
  vec2 uv=gl_FragCoord.xy/uRes; float asp=uRes.x/uRes.y; vec2 p=vec2(uv.x*asp,uv.y);
  float t=uTime*.045;
  vec2 w=vec2(fbm(p*1.15+vec2(t,-t)),fbm(p*1.15+vec2(-t*.8,t*1.2)+4.2));
  vec2 q=p+(w-.5)*.6;
  // Silk bands: soft distance to slowly drifting diagonals.
  float s1=exp(-pow((q.x*.72-q.y+.18+.12*sin(t*6.+q.y*2.))*4.2,2.));
  float s2=exp(-pow((q.x*.5+q.y*.95-1.3+.1*cos(t*5.+q.x*1.5))*3.4,2.));
  float s3=exp(-pow((q.x*.32-q.y*1.15+.95)*5.5,2.));
  // Cursor light: each trail point blooms wider as it ages, so light spreads behind the pointer.
  float f=0.;
  for(int i=0;i<${TRAIL};i++){vec3 tr=uTrail[i];if(tr.z<=.001)continue;
    float age=1.-tr.z;float r=.05+age*.34;vec2 c=vec2(tr.x*asp,tr.y);float d=distance(p,c);
    f+=tr.z*tr.z*exp(-(d*d)/(r*r));}
  f=clamp(f,0.,1.3);
  float g=smoothstep(0.,.85,f);
  vec3 bandA=mix(uA,uG,g), bandB=mix(uB,uG,g*.85);
  vec3 col;
  if(uDark>.5){
    col=uBg;
    col+=bandA*s1*.62+bandB*s2*.3+mix(uB,uG,g)*s3*.32;
    col+=uG*f*.5;
    col*=1.-.55*length(uv-.5);
  }else{
    col=uBg;
    col=mix(col,bandA,clamp(s1*.72,0.,1.));
    col=mix(col,bandB,clamp(s2*.6,0.,1.));
    col=mix(col,mix(uB,uG,g),s3*.25);
    col=mix(col,uG,clamp(f*.55,0.,.8));
  }
  col=mix(uBg,col,uIntensity);
  col+=(hash(gl_FragCoord.xy+fract(uTime))-.5)*.022;
  gl_FragColor=vec4(col,1.);
}`;

const PALETTE = {
  light: { a: [0.0, 0.84, 1.0], b: [0.47, 0.96, 0.82], g: [0.36, 0.95, 0.62], bg: [0.985, 0.995, 0.995] },
  dark: { a: [0.04, 0.28, 1.0], b: [0.0, 0.5, 0.95], g: [0.25, 0.62, 1.0], bg: [0.008, 0.011, 0.024] },
};

/**
 * Full-screen cursor-reactive light. Fixed behind content; `intensity` < 1 for app screens
 * so data stays the focus. Half-resolution render, paused when hidden, static under reduced motion.
 */
export function Aurora({ intensity = 1, cursor = false, className = "pointer-events-none fixed inset-0 -z-10" }: { intensity?: number; cursor?: boolean; className?: string }) {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const canvas = ref.current!;
    const gl = canvas.getContext("webgl", { antialias: false, alpha: false, powerPreference: "low-power", preserveDrawingBuffer: false });
    if (!gl) return;
    const sh = (type: number, src: string) => { const s = gl.createShader(type)!; gl.shaderSource(s, src); gl.compileShader(s); return s; };
    const prog = gl.createProgram()!;
    gl.attachShader(prog, sh(gl.VERTEX_SHADER, VERT)); gl.attachShader(prog, sh(gl.FRAGMENT_SHADER, FRAG));
    gl.linkProgram(prog);
    if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) { console.warn(gl.getProgramInfoLog(prog)); return; }
    gl.useProgram(prog);
    const buf = gl.createBuffer(); gl.bindBuffer(gl.ARRAY_BUFFER, buf);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
    const loc = gl.getAttribLocation(prog, "a"); gl.enableVertexAttribArray(loc); gl.vertexAttribPointer(loc, 2, gl.FLOAT, false, 0, 0);
    const U = (n: string) => gl.getUniformLocation(prog, n);
    const u = { res: U("uRes"), time: U("uTime"), dark: U("uDark"), int: U("uIntensity"), trail: U("uTrail"), a: U("uA"), b: U("uB"), g: U("uG"), bg: U("uBg") };

    const still = matchMedia("(prefers-reduced-motion: reduce)").matches;
    const SCALE = 0.5;
    const resize = () => {
      const r = canvas.getBoundingClientRect();
      canvas.width = Math.max(1, Math.round(r.width * SCALE)); canvas.height = Math.max(1, Math.round(r.height * SCALE));
      gl.viewport(0, 0, canvas.width, canvas.height);
    };
    resize(); addEventListener("resize", resize);

    const pts: { x: number; y: number; t: number }[] = [];
    let last = { x: -1, y: -1, t: 0 };
    const onMove = (e: PointerEvent) => {
      const r = canvas.getBoundingClientRect();
      const x = (e.clientX - r.left) / r.width, y = 1 - (e.clientY - r.top) / r.height, now = performance.now();
      if (Math.hypot((x - last.x) * r.width, (y - last.y) * r.height) < 14 && now - last.t < 60) return;
      last = { x, y, t: now }; pts.push(last); if (pts.length > TRAIL) pts.shift();
    };
    if (!still && cursor) addEventListener("pointermove", onMove, { passive: true });

    const trail = new Float32Array(TRAIL * 3);
    const t0 = performance.now();
    let raf = 0;
    const frame = () => {
      raf = requestAnimationFrame(frame);
      if (document.hidden) return;
      const now = performance.now();
      const dark = document.documentElement.classList.contains("dark");
      const pal = dark ? PALETTE.dark : PALETTE.light;
      trail.fill(0);
      pts.forEach((p, i) => { const life = Math.max(0, 1 - (now - p.t) / 1600); trail.set([p.x, p.y, life], i * 3); });
      gl.uniform2f(u.res, canvas.width, canvas.height);
      gl.uniform1f(u.time, still ? 40 : (now - t0) / 1000);
      gl.uniform1f(u.dark, dark ? 1 : 0); gl.uniform1f(u.int, intensity);
      gl.uniform3fv(u.trail, trail);
      gl.uniform3fv(u.a, pal.a); gl.uniform3fv(u.b, pal.b); gl.uniform3fv(u.g, pal.g); gl.uniform3fv(u.bg, pal.bg);
      gl.drawArrays(gl.TRIANGLES, 0, 3);
      if (still) cancelAnimationFrame(raf);
    };
    frame();
    // Re-draw once on theme change even when reduced motion stopped the loop.
    const mo = new MutationObserver(() => { if (still) frame(); });
    mo.observe(document.documentElement, { attributes: true, attributeFilter: ["class"] });
    return () => { cancelAnimationFrame(raf); removeEventListener("resize", resize); removeEventListener("pointermove", onMove); mo.disconnect(); gl.getExtension("WEBGL_lose_context")?.loseContext(); };
  }, [intensity, cursor]);
  const fixed = className.includes("fixed");
  return <canvas ref={ref} aria-hidden className={className} style={fixed ? { width: "100vw", height: "100vh" } : { width: "100%", height: "100%" }} />;
}
