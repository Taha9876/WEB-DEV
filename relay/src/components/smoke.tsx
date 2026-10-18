"use client";

import { useEffect, useRef } from "react";

/**
 * Cursor smoke: a stable-fluids simulation on the GPU (WebGL2).
 * Velocity is advected, vorticity confinement keeps wisps curling, a Jacobi pressure solve keeps it
 * incompressible, and coloured dye rides the flow. Blue smoke in dark mode, green in light.
 * Transparent canvas, behind content; skipped under reduced motion or without float render targets.
 */
const CFG = { SIM: 128, DYE: 512, DENSITY_DISSIPATION: 1.15, VELOCITY_DISSIPATION: 0.22, PRESSURE: 0.8, ITER: 20, CURL: 24, RADIUS: 0.18, FORCE: 5200 };

const VS = `#version 300 es
precision highp float;
in vec2 aPos; uniform vec2 texel;
out vec2 vUv, vL, vR, vT, vB;
void main(){ vUv=aPos*.5+.5; vL=vUv-vec2(texel.x,0.); vR=vUv+vec2(texel.x,0.); vT=vUv+vec2(0.,texel.y); vB=vUv-vec2(0.,texel.y); gl_Position=vec4(aPos,0.,1.); }`;
const H = `#version 300 es
precision highp float; precision highp sampler2D;
in vec2 vUv, vL, vR, vT, vB; out vec4 o;`;
const FS = {
  splat: `${H} uniform sampler2D uTarget; uniform float aspect; uniform vec3 color; uniform vec2 point; uniform float radius;
    void main(){ vec2 p=vUv-point; p.x*=aspect; vec3 s=exp(-dot(p,p)/radius)*color; o=vec4(texture(uTarget,vUv).xyz+s,1.); }`,
  advect: `${H} uniform sampler2D uVelocity, uSource; uniform vec2 simTexel; uniform float dt, dissipation;
    void main(){ vec2 c=vUv-dt*texture(uVelocity,vUv).xy*simTexel; o=texture(uSource,c)/(1.+dissipation*dt); }`,
  divergence: `${H} uniform sampler2D uVelocity;
    void main(){ float L=texture(uVelocity,vL).x, R=texture(uVelocity,vR).x, T=texture(uVelocity,vT).y, B=texture(uVelocity,vB).y;
      vec2 C=texture(uVelocity,vUv).xy; if(vL.x<0.)L=-C.x; if(vR.x>1.)R=-C.x; if(vT.y>1.)T=-C.y; if(vB.y<0.)B=-C.y;
      o=vec4(.5*(R-L+T-B),0.,0.,1.); }`,
  curl: `${H} uniform sampler2D uVelocity;
    void main(){ o=vec4(.5*(texture(uVelocity,vR).y-texture(uVelocity,vL).y-texture(uVelocity,vT).x+texture(uVelocity,vB).x),0.,0.,1.); }`,
  vorticity: `${H} uniform sampler2D uVelocity, uCurl; uniform float curl, dt;
    void main(){ float L=texture(uCurl,vL).x, R=texture(uCurl,vR).x, T=texture(uCurl,vT).x, B=texture(uCurl,vB).x, C=texture(uCurl,vUv).x;
      vec2 f=.5*vec2(abs(T)-abs(B),abs(R)-abs(L)); f/=length(f)+1e-4; f*=curl*C; f.y*=-1.;
      vec2 v=texture(uVelocity,vUv).xy+f*dt; o=vec4(clamp(v,-1000.,1000.),0.,1.); }`,
  pressure: `${H} uniform sampler2D uPressure, uDivergence;
    void main(){ float L=texture(uPressure,vL).x, R=texture(uPressure,vR).x, T=texture(uPressure,vT).x, B=texture(uPressure,vB).x;
      o=vec4((L+R+B+T-texture(uDivergence,vUv).x)*.25,0.,0.,1.); }`,
  gradient: `${H} uniform sampler2D uPressure, uVelocity;
    void main(){ float L=texture(uPressure,vL).x, R=texture(uPressure,vR).x, T=texture(uPressure,vT).x, B=texture(uPressure,vB).x;
      vec2 v=texture(uVelocity,vUv).xy-vec2(R-L,T-B); o=vec4(v,0.,1.); }`,
  clear: `${H} uniform sampler2D uTexture; uniform float value; void main(){ o=value*texture(uTexture,vUv); }`,
  // Premultiplied output: smoke tints whatever is behind it (white in light mode, the aurora in dark).
  display: `${H} uniform sampler2D uTexture; uniform float gain;
    void main(){ vec3 c=texture(uTexture,vUv).rgb*gain; float a=clamp(max(c.r,max(c.g,c.b))*1.15,0.,.92); c=min(c,vec3(a)); o=vec4(c,a); }`,
};

type FBO = { tex: WebGLTexture; fbo: WebGLFramebuffer; w: number; h: number; attach: (i: number) => number };
type DFBO = { read: FBO; write: FBO; swap: () => void; w: number; h: number };

export function Smoke({ className = "pointer-events-none fixed inset-0 -z-[5]" }: { className?: string }) {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    if (matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const canvas = ref.current!;
    const gl = canvas.getContext("webgl2", { alpha: true, premultipliedAlpha: true, antialias: false, depth: false, stencil: false });
    if (!gl || !gl.getExtension("EXT_color_buffer_float")) return; // graceful: aurora still runs
    gl.getExtension("OES_texture_float_linear");

    const compile = (fs: string) => {
      const p = gl.createProgram()!;
      for (const [t, src] of [[gl.VERTEX_SHADER, VS], [gl.FRAGMENT_SHADER, fs]] as const) {
        const s = gl.createShader(t)!; gl.shaderSource(s, src); gl.compileShader(s); gl.attachShader(p, s);
      }
      gl.bindAttribLocation(p, 0, "aPos"); gl.linkProgram(p);
      const u: Record<string, WebGLUniformLocation | null> = {};
      const n = gl.getProgramParameter(p, gl.ACTIVE_UNIFORMS);
      for (let i = 0; i < n; i++) { const name = gl.getActiveUniform(p, i)!.name; u[name] = gl.getUniformLocation(p, name); }
      return { p, u };
    };
    const P = Object.fromEntries(Object.entries(FS).map(([k, v]) => [k, compile(v)])) as Record<keyof typeof FS, ReturnType<typeof compile>>;

    gl.bindBuffer(gl.ARRAY_BUFFER, gl.createBuffer());
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, -1, 1, 1, 1, 1, -1]), gl.STATIC_DRAW);
    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, gl.createBuffer());
    gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, new Uint16Array([0, 1, 2, 0, 2, 3]), gl.STATIC_DRAW);
    gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0); gl.enableVertexAttribArray(0);

    const fbo = (w: number, h: number, internal: number, format: number, filter: number): FBO => {
      gl.activeTexture(gl.TEXTURE0);
      const tex = gl.createTexture()!; gl.bindTexture(gl.TEXTURE_2D, tex);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, filter); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, filter);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
      gl.texImage2D(gl.TEXTURE_2D, 0, internal, w, h, 0, format, gl.HALF_FLOAT, null);
      const f = gl.createFramebuffer()!; gl.bindFramebuffer(gl.FRAMEBUFFER, f);
      gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, tex, 0);
      gl.viewport(0, 0, w, h); gl.clear(gl.COLOR_BUFFER_BIT);
      return { tex, fbo: f, w, h, attach: (i) => { gl.activeTexture(gl.TEXTURE0 + i); gl.bindTexture(gl.TEXTURE_2D, tex); return i; } };
    };
    const dfbo = (w: number, h: number, internal: number, format: number, filter: number): DFBO => {
      const d = { read: fbo(w, h, internal, format, filter), write: fbo(w, h, internal, format, filter), w, h,
        swap() { const t = d.read; d.read = d.write; d.write = t; } };
      return d;
    };
    const res = (r: number) => {
      let a = gl.drawingBufferWidth / gl.drawingBufferHeight; if (a < 1) a = 1 / a;
      const min = Math.round(r), max = Math.round(r * a);
      return gl.drawingBufferWidth > gl.drawingBufferHeight ? { w: max, h: min } : { w: min, h: max };
    };

    let vel: DFBO, dye: DFBO, prs: DFBO, div: FBO, crl: FBO;
    const init = () => {
      canvas.width = Math.round(innerWidth * 0.75); canvas.height = Math.round(innerHeight * 0.75);
      const s = res(CFG.SIM), d = res(CFG.DYE);
      vel = dfbo(s.w, s.h, gl.RG16F, gl.RG, gl.LINEAR);
      dye = dfbo(d.w, d.h, gl.RGBA16F, gl.RGBA, gl.LINEAR);
      prs = dfbo(s.w, s.h, gl.R16F, gl.RED, gl.NEAREST);
      div = fbo(s.w, s.h, gl.R16F, gl.RED, gl.NEAREST);
      crl = fbo(s.w, s.h, gl.R16F, gl.RED, gl.NEAREST);
    };
    init();
    addEventListener("resize", init);

    const blit = (target: FBO | null, w: number, h: number) => {
      gl.bindFramebuffer(gl.FRAMEBUFFER, target ? target.fbo : null); gl.viewport(0, 0, w, h);
      gl.drawElements(gl.TRIANGLES, 6, gl.UNSIGNED_SHORT, 0);
    };
    const use = (p: ReturnType<typeof compile>, texel: [number, number]) => { gl.useProgram(p.p); gl.uniform2f(p.u.texel, texel[0], texel[1]); return p.u; };

    const splat = (x: number, y: number, dx: number, dy: number, color: [number, number, number]) => {
      const aspect = canvas.width / canvas.height;
      let u = use(P.splat, [1 / vel.w, 1 / vel.h]);
      gl.uniform1i(u.uTarget, vel.read.attach(0)); gl.uniform1f(u.aspect, aspect);
      gl.uniform2f(u.point, x, y); gl.uniform3f(u.color, dx, dy, 0); gl.uniform1f(u.radius, (CFG.RADIUS / 100) * (aspect > 1 ? aspect : 1));
      blit(vel.write, vel.w, vel.h); vel.swap();
      u = use(P.splat, [1 / dye.w, 1 / dye.h]);
      gl.uniform1i(u.uTarget, dye.read.attach(0)); gl.uniform1f(u.aspect, aspect);
      gl.uniform2f(u.point, x, y); gl.uniform3f(u.color, ...color); gl.uniform1f(u.radius, (CFG.RADIUS / 100) * (aspect > 1 ? aspect : 1));
      blit(dye.write, dye.w, dye.h); dye.swap();
    };

    const hsv = (h: number, s: number, v: number): [number, number, number] => {
      const f = (n: number) => { const k = (n + h * 6) % 6; return v - v * s * Math.max(0, Math.min(k, 4 - k, 1)); };
      return [f(5), f(3), f(1)];
    };
    const smokeColor = (): [number, number, number] => {
      const dark = document.documentElement.classList.contains("dark");
      // dark: electric-to-cyan blues; light: mint-to-emerald greens
      const c = dark ? hsv((205 + Math.random() * 25) / 360, 0.85, 1) : hsv((145 + Math.random() * 25) / 360, 0.8, 0.85);
      const k = dark ? 0.15 : 0.12;
      return [c[0] * k, c[1] * k, c[2] * k];
    };

    const step = (dt: number) => {
      const t: [number, number] = [1 / vel.w, 1 / vel.h];
      let u = use(P.curl, t); gl.uniform1i(u.uVelocity, vel.read.attach(0)); blit(crl, vel.w, vel.h);
      u = use(P.vorticity, t); gl.uniform1i(u.uVelocity, vel.read.attach(0)); gl.uniform1i(u.uCurl, crl.attach(1));
      gl.uniform1f(u.curl, CFG.CURL); gl.uniform1f(u.dt, dt); blit(vel.write, vel.w, vel.h); vel.swap();
      u = use(P.divergence, t); gl.uniform1i(u.uVelocity, vel.read.attach(0)); blit(div, vel.w, vel.h);
      u = use(P.clear, t); gl.uniform1i(u.uTexture, prs.read.attach(0)); gl.uniform1f(u.value, CFG.PRESSURE); blit(prs.write, vel.w, vel.h); prs.swap();
      u = use(P.pressure, t); gl.uniform1i(u.uDivergence, div.attach(0));
      for (let i = 0; i < CFG.ITER; i++) { gl.uniform1i(u.uPressure, prs.read.attach(1)); blit(prs.write, vel.w, vel.h); prs.swap(); }
      u = use(P.gradient, t); gl.uniform1i(u.uPressure, prs.read.attach(0)); gl.uniform1i(u.uVelocity, vel.read.attach(1)); blit(vel.write, vel.w, vel.h); vel.swap();
      u = use(P.advect, t); gl.uniform2f(u.simTexel, t[0], t[1]);
      gl.uniform1i(u.uVelocity, vel.read.attach(0)); gl.uniform1i(u.uSource, vel.read.attach(0)); gl.uniform1f(u.dt, dt); gl.uniform1f(u.dissipation, CFG.VELOCITY_DISSIPATION);
      blit(vel.write, vel.w, vel.h); vel.swap();
      u = use(P.advect, [1 / dye.w, 1 / dye.h]); gl.uniform2f(u.simTexel, t[0], t[1]);
      gl.uniform1i(u.uVelocity, vel.read.attach(0)); gl.uniform1i(u.uSource, dye.read.attach(1)); gl.uniform1f(u.dt, dt); gl.uniform1f(u.dissipation, CFG.DENSITY_DISSIPATION);
      blit(dye.write, dye.w, dye.h); dye.swap();
    };

    const ptr = { x: 0, y: 0, px: 0, py: 0, moved: false, init: false, color: smokeColor() };
    const onMove = (e: PointerEvent) => {
      const x = e.clientX / innerWidth, y = 1 - e.clientY / innerHeight;
      if (!ptr.init) { ptr.px = x; ptr.py = y; ptr.init = true; }
      ptr.x = x; ptr.y = y; ptr.moved = true;
    };
    addEventListener("pointermove", onMove, { passive: true });
    const recolor = setInterval(() => { ptr.color = smokeColor(); }, 900);
    // A soft opening puff so the effect is discoverable before anyone moves the mouse.
    for (let i = 0; i < 3; i++) splat(0.3 + Math.random() * 0.4, 0.3 + Math.random() * 0.4, (Math.random() - 0.5) * 380, (Math.random() - 0.5) * 380, smokeColor());

    let last = performance.now(), raf = 0;
    const frame = () => {
      raf = requestAnimationFrame(frame);
      if (document.hidden) { last = performance.now(); return; }
      const now = performance.now(); const dt = Math.min((now - last) / 1000, 0.0166); last = now;
      if (ptr.moved) {
        const aspect = canvas.width / canvas.height;
        const dx = (ptr.x - ptr.px) * CFG.FORCE * (aspect < 1 ? aspect : 1), dy = (ptr.y - ptr.py) * CFG.FORCE / (aspect > 1 ? aspect : 1);
        splat(ptr.x, ptr.y, dx, dy, ptr.color);
        ptr.px = ptr.x; ptr.py = ptr.y; ptr.moved = false;
      }
      step(dt);
      gl.disable(gl.BLEND);
      const u = use(P.display, [1 / canvas.width, 1 / canvas.height]);
      gl.uniform1i(u.uTexture, dye.read.attach(0));
      gl.uniform1f(u.gain, document.documentElement.classList.contains("dark") ? 1.6 : 1.25);
      blit(null, canvas.width, canvas.height);
    };
    frame();
    return () => { cancelAnimationFrame(raf); clearInterval(recolor); removeEventListener("pointermove", onMove); removeEventListener("resize", init); gl.getExtension("WEBGL_lose_context")?.loseContext(); };
  }, []);
  return <canvas ref={ref} aria-hidden className={className} style={{ width: "100vw", height: "100vh" }} />;
}
