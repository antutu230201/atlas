'use client';

import type * as THREE from 'three';
import { onListeningPulse, readStoredPulse } from './listening-pulse';
import { useEffect, useRef, useState } from 'react';

/**
 * 听歌统计 3D 舞台（three.js，动态导入）：
 * 旋转黑胶（中心标签 = Top1 歌曲）+ 数据声浪柱（日/周/月/年分桶）+ 音符粒子。
 * 交互：拖拽旋转视角（带阻尼）、悬停声浪柱显示数值；
 * 性能：DPR≤1.5、页面隐藏暂停渲染、prefers-reduced-motion 输出静帧、卸载全量 dispose。
 */

export interface StageBucket {
  label: string;
  seconds: number;
}

interface StageColors {
  accent: string;
  accentAlt: string;
  surface: string;
}

function readStageColors(): StageColors {
  const css = getComputedStyle(document.documentElement);
  const v = (name: string, fallback: string) => css.getPropertyValue(name).trim() || fallback;
  return {
    accent: v('--screen-accent', '#aa9bff'),
    accentAlt: v('--screen-cyan', '#72e2e7'),
    surface: v('--screen-panel-solid', '#12121c'),
  };
}

function makeNoteTexture(accent: string): HTMLCanvasElement {
  const canvas = document.createElement('canvas');
  canvas.width = 96;
  canvas.height = 96;
  const ctx = canvas.getContext('2d')!;
  ctx.clearRect(0, 0, 96, 96);
  ctx.fillStyle = accent;
  ctx.font = 'bold 64px "Segoe UI Symbol", "Noto Music", sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.globalAlpha = 0.95;
  ctx.fillText(Math.random() > 0.5 ? '♪' : '♫', 48, 52);
  return canvas;
}

function makeLabelTexture(title: string, artist: string, accent: string): HTMLCanvasElement {
  const canvas = document.createElement('canvas');
  canvas.width = 256;
  canvas.height = 256;
  const ctx = canvas.getContext('2d')!;
  ctx.fillStyle = '#14141f';
  ctx.beginPath();
  ctx.arc(128, 128, 128, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = accent;
  ctx.lineWidth = 6;
  ctx.beginPath();
  ctx.arc(128, 128, 116, 0, Math.PI * 2);
  ctx.stroke();
  ctx.fillStyle = accent;
  ctx.beginPath();
  ctx.arc(128, 128, 10, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = '#f5f5fa';
  ctx.textAlign = 'center';
  const titleText = title.length > 10 ? `${title.slice(0, 9)}…` : title;
  ctx.font = 'bold 22px "Microsoft YaHei", sans-serif';
  ctx.fillText(titleText, 128, 96);
  ctx.fillStyle = '#9a9ab4';
  const artistText = artist.length > 12 ? `${artist.slice(0, 11)}…` : artist;
  ctx.font = '14px "Microsoft YaHei", sans-serif';
  ctx.fillText(artistText, 128, 124);
  ctx.font = '11px "Consolas", monospace';
  ctx.fillText('ATLAS · LISTENING', 128, 168);
  return canvas;
}

interface SceneHandle {
  setBuckets: (buckets: StageBucket[]) => void;
  setTopTrack: (title: string, artist: string) => void;
  setTotalSeconds: (seconds: number) => void;
  applyColors: (colors: StageColors) => void;
  dispose: () => void;
}

export function ListeningStage({
  buckets,
  totalSeconds,
  topTitle,
  topArtist,
  className,
}: {
  buckets: StageBucket[];
  totalSeconds: number;
  topTitle?: string;
  topArtist?: string;
  className?: string;
}) {
  const mountRef = useRef<HTMLDivElement>(null);
  const sceneRef = useRef<SceneHandle | null>(null);
  const bucketsRef = useRef(buckets);
  const totalRef = useRef(totalSeconds);
  const topRef = useRef({ title: topTitle ?? '', artist: topArtist ?? '' });
  const [ready, setReady] = useState(false);
  const [hover, setHover] = useState<{
    label: string;
    seconds: number;
    x: number;
    y: number;
  } | null>(null);

  bucketsRef.current = buckets;
  totalRef.current = totalSeconds;
  topRef.current = { title: topTitle ?? '', artist: topArtist ?? '' };

  // 场景只建一次；数据变化经 handle 增量更新
  useEffect(() => {
    let disposed = false;
    let handle: SceneHandle | null = null;

    void (async () => {
      const THREElib = await import('three');
      if (disposed || !mountRef.current) return;
      const mount = mountRef.current;
      const colors = readStageColors();

      const renderer = new THREElib.WebGLRenderer({ antialias: true, alpha: true });
      renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.5));
      renderer.setSize(mount.clientWidth, mount.clientHeight);
      mount.appendChild(renderer.domElement);

      const scene = new THREElib.Scene();
      const camera = new THREElib.PerspectiveCamera(
        40,
        mount.clientWidth / mount.clientHeight,
        0.1,
        100,
      );
      camera.position.set(0, 3.1, 7.6);
      camera.lookAt(0, 0.7, 0);

      const stage = new THREElib.Group();
      scene.add(stage);

      // 灯光：环境 + 主方向光 + 两盏主题色点光
      scene.add(new THREElib.AmbientLight(0xffffff, 0.55));
      const keyLight = new THREElib.DirectionalLight(0xffffff, 1.15);
      keyLight.position.set(3, 6, 4);
      scene.add(keyLight);
      const accentLight = new THREElib.PointLight(colors.accent, 60, 30);
      accentLight.position.set(0, 3.4, 1.6);
      scene.add(accentLight);
      const altLight = new THREElib.PointLight(colors.accentAlt, 26, 24);
      altLight.position.set(-4.2, 2.2, 2);
      scene.add(altLight);

      // 地面：极坐标网格舞台（比实心圆盘更"舞台"，避免远看像灰色小山）
      const floor = new THREElib.PolarGridHelper(7.2, 8, 5, 64, 0x8888aa, 0x555577);
      (floor.material as THREE.LineBasicMaterial).transparent = true;
      (floor.material as THREE.LineBasicMaterial).opacity = 0.16;
      floor.position.y = 0;
      stage.add(floor);

      /* ---- 黑胶唱片（左侧，持续旋转） ---- */
      const vinyl = new THREElib.Group();
      vinyl.position.set(-2.9, 1.05, 0);
      vinyl.rotation.y = 0.42;
      stage.add(vinyl);
      const disc = new THREElib.Mesh(
        new THREElib.CylinderGeometry(1.5, 1.5, 0.09, 96),
        new THREElib.MeshStandardMaterial({ color: 0x101018, roughness: 0.32, metalness: 0.55 }),
      );
      disc.rotation.x = Math.PI / 2;
      vinyl.add(disc);
      const grooveMaterial = new THREElib.MeshStandardMaterial({
        color: 0x2a2a3a,
        roughness: 0.5,
        metalness: 0.3,
      });
      const grooves: THREE.Mesh[] = [];
      for (let i = 0; i < 5; i += 1) {
        const groove = new THREElib.Mesh(
          new THREElib.TorusGeometry(0.86 + i * 0.13, 0.006, 8, 96),
          grooveMaterial,
        );
        vinyl.add(groove);
        grooves.push(groove);
      }
      const edgeRing = new THREElib.Mesh(
        new THREElib.TorusGeometry(1.5, 0.022, 10, 96),
        new THREElib.MeshStandardMaterial({
          color: new THREElib.Color(colors.accent),
          emissive: new THREElib.Color(colors.accent),
          emissiveIntensity: 0.55,
          roughness: 0.3,
        }),
      );
      vinyl.add(edgeRing);
      const labelTexture = new THREElib.CanvasTexture(makeLabelTexture('', '', colors.accent));
      const labelMesh = new THREElib.Mesh(
        new THREElib.CircleGeometry(0.62, 64),
        new THREElib.MeshBasicMaterial({ map: labelTexture, transparent: true }),
      );
      labelMesh.position.z = 0.052;
      vinyl.add(labelMesh);
      const drawLabel = () => {
        const { title, artist } = topRef.current;
        labelTexture.image = makeLabelTexture(title, artist, colors.accent);
        labelTexture.needsUpdate = true;
      };
      drawLabel();

      /* ---- 声浪柱（数据分桶） ---- */
      const barsGroup = new THREElib.Group();
      barsGroup.position.set(1.15, 0, 0);
      stage.add(barsGroup);
      interface BarItem {
        mesh: THREE.Mesh;
        material: THREE.MeshStandardMaterial;
        label: string;
        seconds: number;
        current: number;
        target: number;
      }
      let bars: BarItem[] = [];
      const barGeometryCache = new Map<number, THREE.BoxGeometry>();

      const rebuildBars = (list: StageBucket[]) => {
        for (const bar of bars) {
          barsGroup.remove(bar.mesh);
          bar.material.dispose();
        }
        bars = [];
        if (list.length === 0) return;
        const count = list.length;
        const slot = Math.min(0.5, 5.6 / count);
        const width = slot * 0.72;
        let geometry = barGeometryCache.get(count);
        if (!geometry) {
          geometry = new THREElib.BoxGeometry(width, 1, width);
          barGeometryCache.set(count, geometry);
        }
        const startX = -((count - 1) * slot) / 2;
        list.forEach((bucket, index) => {
          const material = new THREElib.MeshStandardMaterial({
            color: new THREElib.Color(colors.accent),
            emissive: new THREElib.Color(colors.accent),
            emissiveIntensity: 0.3,
            roughness: 0.35,
            metalness: 0.25,
            transparent: true,
            opacity: 0.92,
          });
          const mesh = new THREElib.Mesh(geometry!, material);
          mesh.position.x = startX + index * slot;
          const maxSeconds = Math.max(...list.map((item) => item.seconds), 60);
          const target = Math.max(0.12, (bucket.seconds / maxSeconds) * 3.2);
          mesh.scale.y = 0.02;
          mesh.position.y = 0;
          barsGroup.add(mesh);
          bars.push({
            mesh,
            material,
            label: bucket.label,
            seconds: bucket.seconds,
            current: 0.02,
            target,
          });
        });
      };
      rebuildBars(bucketsRef.current);

      /* ---- 音符粒子（数量随总时长） ---- */
      interface NoteItem {
        sprite: THREE.Sprite;
        material: THREE.SpriteMaterial;
        speed: number;
        phase: number;
        sway: number;
      }
      let notes: NoteItem[] = [];
      const rebuildNotes = (seconds: number) => {
        for (const note of notes) {
          stage.remove(note.sprite);
          note.material.map?.dispose();
          note.material.dispose();
        }
        notes = [];
        const count = Math.round(Math.min(110, 26 + seconds / 45));
        for (let i = 0; i < count; i += 1) {
          const texture = new THREElib.CanvasTexture(
            makeNoteTexture(i % 3 === 0 ? colors.accentAlt : colors.accent),
          );
          const material = new THREElib.SpriteMaterial({
            map: texture,
            transparent: true,
            opacity: 0.35 + Math.random() * 0.45,
            depthWrite: false,
          });
          const sprite = new THREElib.Sprite(material);
          const scale = 0.16 + Math.random() * 0.22;
          sprite.scale.setScalar(scale);
          sprite.position.set(
            -4.4 + Math.random() * 8.8,
            Math.random() * 3.8,
            -2.2 + Math.random() * 3.4,
          );
          stage.add(sprite);
          notes.push({
            sprite,
            material,
            speed: 0.12 + Math.random() * 0.3,
            phase: Math.random() * Math.PI * 2,
            sway: 0.2 + Math.random() * 0.5,
          });
        }
      };
      rebuildNotes(totalRef.current);

      const applyColors = (next: StageColors) => {
        colors.accent = next.accent;
        colors.accentAlt = next.accentAlt;
        colors.surface = next.surface;
        accentLight.color.set(next.accent);
        altLight.color.set(next.accentAlt);
        edgeRing.material.color.set(next.accent);
        edgeRing.material.emissive.set(next.accent);
        for (const bar of bars) {
          bar.material.color.set(next.accent);
          bar.material.emissive.set(next.accent);
        }
        for (const note of notes) {
          note.material.map?.dispose();
          note.material.map = new THREElib.CanvasTexture(
            makeNoteTexture(
              note.material.opacity && Math.random() > 0.7 ? next.accentAlt : next.accent,
            ),
          );
        }
        drawLabel();
      };

      /* ---- 交互：拖拽旋转 + 声浪柱悬停 ---- */
      let yaw = 0;
      let yawVelocity = 0;
      let dragging = false;
      let lastX = 0;
      let idleSince = performance.now();
      const raycaster = new THREElib.Raycaster();
      const pointer = new THREElib.Vector2();

      const onPointerDown = (event: PointerEvent) => {
        dragging = true;
        lastX = event.clientX;
        (event.target as Element).setPointerCapture?.(event.pointerId);
      };
      const onPointerMove = (event: PointerEvent) => {
        const rect = mount.getBoundingClientRect();
        pointer.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
        pointer.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;
        if (dragging) {
          yawVelocity = (event.clientX - lastX) * 0.006;
          yaw += yawVelocity;
          lastX = event.clientX;
          idleSince = performance.now();
          setHover(null);
          return;
        }
        raycaster.setFromCamera(pointer, camera);
        const hits = raycaster.intersectObjects(bars.map((bar) => bar.mesh));
        const hit = hits[0];
        if (hit) {
          const bar = bars.find((item) => item.mesh === hit.object);
          if (bar) {
            setHover({
              label: bar.label,
              seconds: bar.seconds,
              x: event.clientX - rect.left,
              y: event.clientY - rect.top,
            });
          }
        } else {
          setHover(null);
        }
      };
      const onPointerUp = () => {
        dragging = false;
      };
      const onPointerLeave = () => {
        dragging = false;
        setHover(null);
      };
      mount.addEventListener('pointerdown', onPointerDown);
      mount.addEventListener('pointermove', onPointerMove);
      mount.addEventListener('pointerup', onPointerUp);
      mount.addEventListener('pointerleave', onPointerLeave);

      /* ---- 渲染循环 ---- */
      let pulse = readStoredPulse();
      const removePulseListener = onListeningPulse((playing) => {
        pulse = playing;
      });
      const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
      let raf = 0;
      let last = performance.now();
      let running = false;

      const frame = (now: number) => {
        const dt = Math.min(0.05, (now - last) / 1000);
        last = now;
        vinyl.rotation.z += dt * (0.85 + (pulse ? 1.7 : 0));
        // 无操作时缓慢自转
        if (!dragging && now - idleSince > 2500) yaw += dt * 0.05;
        yawVelocity *= 0.92;
        if (!dragging) yaw += yawVelocity;
        stage.rotation.y = yaw;
        // 声浪柱弹性趋近目标高度
        const maxSeconds = Math.max(...bars.map((bar) => bar.seconds), 60);
        const beat = pulse ? Math.sin(now / 260) * 0.1 : 0;
        for (const bar of bars) {
          bar.target = Math.max(0.12, (bar.seconds / maxSeconds) * 3.2) * (1 + beat);
          bar.current += (bar.target - bar.current) * Math.min(1, dt * 6);
          bar.mesh.scale.y = Math.max(0.02, bar.current);
          bar.mesh.position.y = bar.mesh.scale.y / 2;
          const intensity = 0.22 + (bar.seconds / maxSeconds) * 0.6;
          bar.material.emissiveIntensity = intensity;
        }
        // 音符上浮 + 摆动
        const speedBoost = pulse ? 1.9 : 1;
        for (const note of notes) {
          note.sprite.position.y += note.speed * speedBoost * dt;
          note.sprite.position.x += Math.sin(now / 900 + note.phase) * note.sway * dt;
          if (note.sprite.position.y > 4.2) {
            note.sprite.position.y = 0;
            note.sprite.position.x = -4.4 + Math.random() * 8.8;
          }
        }
        renderer.render(scene, camera);
        raf = requestAnimationFrame(frame);
      };
      const start = () => {
        if (running || reducedMotion) return;
        running = true;
        last = performance.now();
        raf = requestAnimationFrame(frame);
      };
      const stop = () => {
        running = false;
        cancelAnimationFrame(raf);
      };
      const onVisibility = () => (document.hidden ? stop() : start());
      document.addEventListener('visibilitychange', onVisibility);

      const resizeObserver = new ResizeObserver(() => {
        const width = mount.clientWidth;
        const height = mount.clientHeight;
        if (width === 0 || height === 0) return;
        renderer.setSize(width, height);
        camera.aspect = width / height;
        camera.updateProjectionMatrix();
        if (reducedMotion) renderer.render(scene, camera);
      });
      resizeObserver.observe(mount);

      // 主题联动：data-theme/class 变化时重读令牌换色
      const themeObserver = new MutationObserver(() => applyColors(readStageColors()));
      themeObserver.observe(document.documentElement, {
        attributes: true,
        attributeFilter: ['class', 'data-theme'],
      });

      renderer.render(scene, camera);
      setReady(true);
      if (!reducedMotion) start();
      else renderer.render(scene, camera);

      handle = {
        setBuckets: rebuildBars,
        setTopTrack: () => drawLabel(),
        setTotalSeconds: rebuildNotes,
        applyColors,
        dispose: () => {
          stop();
          removePulseListener();
          document.removeEventListener('visibilitychange', onVisibility);
          themeObserver.disconnect();
          resizeObserver.disconnect();
          mount.removeEventListener('pointerdown', onPointerDown);
          mount.removeEventListener('pointermove', onPointerMove);
          mount.removeEventListener('pointerup', onPointerUp);
          mount.removeEventListener('pointerleave', onPointerLeave);
          for (const bar of bars) bar.material.dispose();
          for (const note of notes) {
            note.material.map?.dispose();
            note.material.dispose();
          }
          grooveMaterial.dispose();
          barGeometryCache.forEach((geometry) => geometry.dispose());
          labelTexture.dispose();
          scene.traverse((object) => {
            const mesh = object as THREE.Mesh;
            if (mesh.geometry) mesh.geometry.dispose();
          });
          renderer.dispose();
          renderer.domElement.remove();
        },
      };
      sceneRef.current = handle;
    })();

    return () => {
      disposed = true;
      handle?.dispose();
      sceneRef.current = null;
    };
  }, []);

  // 数据增量更新（不经重建）
  useEffect(() => {
    sceneRef.current?.setBuckets(buckets);
  }, [buckets]);
  useEffect(() => {
    sceneRef.current?.setTopTrack(topTitle ?? '', topArtist ?? '');
  }, [topTitle, topArtist]);
  useEffect(() => {
    sceneRef.current?.setTotalSeconds(totalSeconds);
  }, [totalSeconds]);

  return (
    <div className={className} data-testid="listening-stage">
      <div ref={mountRef} className="absolute inset-0 touch-none" />
      {!ready ? (
        <div className="absolute inset-0 flex items-center justify-center text-xs text-muted">
          正在搭建 3D 舞台…
        </div>
      ) : null}
      {hover ? (
        <div
          className="pointer-events-none absolute z-20 -translate-x-1/2 -translate-y-full rounded-sm border border-border bg-[var(--screen-panel-solid)] px-2.5 py-1.5 text-[11px] shadow-soft"
          style={{ left: hover.x, top: hover.y - 10 }}
        >
          <span className="font-mono text-muted">{hover.label}</span>
          <span className="ml-2 font-semibold tabular-nums">
            {hover.seconds < 60
              ? `${hover.seconds} 秒`
              : `${Math.floor(hover.seconds / 3600) > 0 ? `${Math.floor(hover.seconds / 3600)} 小时 ` : ''}${Math.round((hover.seconds % 3600) / 60)} 分钟`}
          </span>
        </div>
      ) : null}
      {ready ? (
        <p className="pointer-events-none absolute bottom-2.5 left-1/2 -translate-x-1/2 text-[10px] tracking-wider text-muted/60">
          拖拽旋转视角 · 悬停声浪柱查看时长
        </p>
      ) : null}
    </div>
  );
}
