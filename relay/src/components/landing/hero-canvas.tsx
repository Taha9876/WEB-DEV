"use client";

import { Canvas, useFrame, useThree } from "@react-three/fiber";
import { useEffect, useMemo, useRef, useState } from "react";
import * as THREE from "three";

/* Ashima 3D simplex noise (MIT) */
const NOISE = /* glsl */ `
vec3 mod289(vec3 x){return x-floor(x*(1./289.))*289.;}
vec4 mod289(vec4 x){return x-floor(x*(1./289.))*289.;}
vec4 permute(vec4 x){return mod289(((x*34.)+1.)*x);}
vec4 taylorInvSqrt(vec4 r){return 1.79284291400159-.85373472095314*r;}
float snoise(vec3 v){
  const vec2 C=vec2(1./6.,1./3.);const vec4 D=vec4(0.,.5,1.,2.);
  vec3 i=floor(v+dot(v,C.yyy));vec3 x0=v-i+dot(i,C.xxx);
  vec3 g=step(x0.yzx,x0.xyz);vec3 l=1.-g;vec3 i1=min(g.xyz,l.zxy);vec3 i2=max(g.xyz,l.zxy);
  vec3 x1=x0-i1+C.xxx;vec3 x2=x0-i2+C.yyy;vec3 x3=x0-D.yyy;i=mod289(i);
  vec4 p=permute(permute(permute(i.z+vec4(0.,i1.z,i2.z,1.))+i.y+vec4(0.,i1.y,i2.y,1.))+i.x+vec4(0.,i1.x,i2.x,1.));
  float n_=.142857142857;vec3 ns=n_*D.wyz-D.xzx;vec4 j=p-49.*floor(p*ns.z*ns.z);
  vec4 x_=floor(j*ns.z);vec4 y_=floor(j-7.*x_);vec4 x=x_*ns.x+ns.yyyy;vec4 y=y_*ns.x+ns.yyyy;vec4 h=1.-abs(x)-abs(y);
  vec4 b0=vec4(x.xy,y.xy);vec4 b1=vec4(x.zw,y.zw);vec4 s0=floor(b0)*2.+1.;vec4 s1=floor(b1)*2.+1.;vec4 sh=-step(h,vec4(0.));
  vec4 a0=b0.xzyw+s0.xzyw*sh.xxyy;vec4 a1=b1.xzyw+s1.xzyw*sh.zzww;
  vec3 p0=vec3(a0.xy,h.x);vec3 p1=vec3(a0.zw,h.y);vec3 p2=vec3(a1.xy,h.z);vec3 p3=vec3(a1.zw,h.w);
  vec4 norm=taylorInvSqrt(vec4(dot(p0,p0),dot(p1,p1),dot(p2,p2),dot(p3,p3)));p0*=norm.x;p1*=norm.y;p2*=norm.z;p3*=norm.w;
  vec4 m=max(.6-vec4(dot(x0,x0),dot(x1,x1),dot(x2,x2),dot(x3,x3)),0.);m=m*m;
  return 42.*dot(m*m,vec4(dot(p0,x0),dot(p1,x1),dot(p2,x2),dot(p3,x3)));
}`;

const SIGNAL = new THREE.Color("#d4ff3f");
const EMBER = new THREE.Color("#ff8a3d");

function Core({ pointer }: { pointer: React.RefObject<THREE.Vector2> }) {
  const mesh = useRef<THREE.Mesh>(null);
  const uniforms = useMemo(() => ({
    uTime: { value: 0 }, uSignal: { value: SIGNAL }, uEmber: { value: EMBER }, uHover: { value: 0 },
  }), []);

  useFrame((state, dt) => {
    uniforms.uTime.value += dt;
    const m = mesh.current;
    if (!m) return;
    const p = pointer.current!;
    m.rotation.y = THREE.MathUtils.lerp(m.rotation.y, p.x * 0.6 + state.clock.elapsedTime * 0.08, 0.04);
    m.rotation.x = THREE.MathUtils.lerp(m.rotation.x, -p.y * 0.4, 0.04);
    uniforms.uHover.value = THREE.MathUtils.lerp(uniforms.uHover.value, Math.min(1, p.length()), 0.05);
  });

  return (
    <mesh ref={mesh}>
      <icosahedronGeometry args={[1.05, 96]} />
      <shaderMaterial
        uniforms={uniforms}
        vertexShader={/* glsl */ `
          ${NOISE}
          uniform float uTime; uniform float uHover;
          varying vec3 vN; varying vec3 vV; varying float vD;
          void main(){
            float n = snoise(position * 1.3 + vec3(uTime * .22));
            float n2 = snoise(position * 3.1 - vec3(uTime * .35)) * .35;
            float d = (n + n2) * (.11 + uHover * .05);
            vec3 p = position + normal * d;
            vD = d;
            vec4 mv = modelViewMatrix * vec4(p, 1.);
            vN = normalize(normalMatrix * normal); vV = normalize(-mv.xyz);
            gl_Position = projectionMatrix * mv;
          }`}
        fragmentShader={/* glsl */ `
          uniform float uTime; uniform vec3 uSignal; uniform vec3 uEmber;
          varying vec3 vN; varying vec3 vV; varying float vD;
          void main(){
            float f = pow(1. - max(dot(vN, vV), 0.), 3.4);
            float lines = smoothstep(.04, 0., abs(fract(vD * 22. + uTime * .08) - .5) - .46) * .5;
            vec3 base = vec3(.028, .03, .04) + vec3(.02, .025, .035) * (vN.y * .5 + .5);
            vec3 rim = mix(uSignal, uEmber, smoothstep(.0, .2, vD) * .55);
            vec3 col = base + rim * f * 1.1 + rim * lines * (.08 + f * .4);
            gl_FragColor = vec4(col, 1.);
          }`}
      />
    </mesh>
  );
}

/** Leads in orbit — each point is a lead travelling the relay. */
function Orbits({ count = 2200 }) {
  const ref = useRef<THREE.Points>(null);
  const { geo, uniforms } = useMemo(() => {
    const pos = new Float32Array(count * 3), seed = new Float32Array(count);
    for (let i = 0; i < count; i++) {
      const ring = i % 3;
      const r = 1.9 + ring * 0.42 + (Math.random() - 0.5) * 0.18;
      const a = Math.random() * Math.PI * 2;
      pos.set([Math.cos(a) * r, (Math.random() - 0.5) * 0.08, Math.sin(a) * r], i * 3);
      seed[i] = Math.random();
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute("position", new THREE.BufferAttribute(pos, 3));
    g.setAttribute("aSeed", new THREE.BufferAttribute(seed, 1));
    return { geo: g, uniforms: { uTime: { value: 0 }, uSignal: { value: SIGNAL }, uPx: { value: 1 } } };
  }, [count]);
  const dpr = useThree((s) => s.viewport.dpr);
  uniforms.uPx.value = dpr;

  useFrame((_, dt) => {
    uniforms.uTime.value += dt;
    if (ref.current) ref.current.rotation.y -= dt * 0.05;
  });

  return (
    <points ref={ref} geometry={geo} rotation={[0.42, 0, -0.18]}>
      <shaderMaterial
        transparent depthWrite={false} blending={THREE.AdditiveBlending} uniforms={uniforms}
        vertexShader={/* glsl */ `
          uniform float uTime; uniform float uPx; attribute float aSeed; varying float vA; varying float vHot;
          void main(){
            float a = uTime * (.12 + aSeed * .25) + aSeed * 6.2831;
            float c = cos(a), s = sin(a);
            vec3 p = vec3(position.x * c - position.z * s, position.y, position.x * s + position.z * c);
            vec4 mv = modelViewMatrix * vec4(p, 1.);
            vHot = step(.985, aSeed);
            vA = .35 + .65 * sin(uTime * 2. + aSeed * 40.) * .5 + .5 * vHot;
            gl_PointSize = (vHot > .5 ? 8. : 3.) * uPx * (4.5 / -mv.z);
            gl_Position = projectionMatrix * mv;
          }`}
        fragmentShader={/* glsl */ `
          uniform vec3 uSignal; varying float vA; varying float vHot;
          void main(){
            float d = length(gl_PointCoord - .5);
            float a = smoothstep(.5, 0., d);
            vec3 col = mix(vec3(.85, .88, .95), uSignal, vHot * .9 + .1);
            gl_FragColor = vec4(col, a * vA * (vHot > .5 ? 1. : .7));
          }`}
      />
    </points>
  );
}

export default function HeroCanvas() {
  const pointer = useRef(new THREE.Vector2());
  const wrap = useRef<HTMLDivElement>(null);
  const [visible, setVisible] = useState(true);
  const [still, setStill] = useState(false);

  useEffect(() => {
    setStill(window.matchMedia("(prefers-reduced-motion: reduce)").matches);
    const onMove = (e: PointerEvent) => pointer.current.set((e.clientX / innerWidth) * 2 - 1, (e.clientY / innerHeight) * 2 - 1);
    addEventListener("pointermove", onMove, { passive: true });
    const io = new IntersectionObserver(([en]) => setVisible(en.isIntersecting));
    if (wrap.current) io.observe(wrap.current);
    return () => { removeEventListener("pointermove", onMove); io.disconnect(); };
  }, []);

  return (
    <div ref={wrap} className="absolute inset-0" aria-hidden>
      <Canvas
        dpr={[1, 1.75]} camera={{ position: [0, 0, 7], fov: 38 }}
        gl={{ antialias: true, alpha: true, powerPreference: "high-performance" }}
        frameloop={visible && !still ? "always" : "demand"}
      >
        <group position={[-0.35, 0.55, 0]}>
          <Core pointer={pointer} />
          <Orbits />
        </group>
      </Canvas>
    </div>
  );
}
