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

/** 声浪柱最高高度（世界单位）：再高就会被卡片顶边裁掉，旧值 3.2 在 400px 卡里顶穿 */
const BAR_MAX_HEIGHT = 2.45;

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

/** 黑胶盘面贴图：底色 + 沟槽环纹 + 高光弧 + 中央曲目标签（1024²，一次画全张盘面） */
function makeVinylFaceTexture(title: string, artist: string, accent: string): HTMLCanvasElement {
  const size = 1024;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d')!;
  const c = size / 2;

  // 底：径向近黑，边缘略亮（环境反射下有"深度"）
  const base = ctx.createRadialGradient(c, c, size * 0.18, c, c, c);
  base.addColorStop(0, '#191926');
  base.addColorStop(0.72, '#0e0e16');
  base.addColorStop(1, '#08080d');
  ctx.fillStyle = base;
  ctx.fillRect(0, 0, size, size);

  // 沟槽：细密同心圆（透明度/线宽抖动，模拟黑胶纹理）
  for (let i = 0; i < 42; i += 1) {
    const radius = size * 0.235 + (i / 42) * size * 0.265;
    ctx.beginPath();
    ctx.arc(c, c, radius + (Math.random() - 0.5) * 1.5, 0, Math.PI * 2);
    ctx.strokeStyle = `rgba(255,255,255,${0.025 + Math.random() * 0.05})`;
    ctx.lineWidth = 1 + Math.random() * 1.4;
    ctx.stroke();
  }

  // 高光弧：两道斜向"反光"，转起来会流动
  for (const [start, alpha] of [
    [-2.4, 0.1],
    [0.7, 0.07],
  ] as const) {
    ctx.beginPath();
    ctx.arc(c, c, size * 0.38, start, start + 1.1);
    ctx.strokeStyle = `rgba(255,255,255,${alpha})`;
    ctx.lineWidth = size * 0.055;
    ctx.stroke();
  }

  // 中央标签区
  const labelRadius = size * 0.19;
  ctx.fillStyle = '#14141f';
  ctx.beginPath();
  ctx.arc(c, c, labelRadius, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = accent;
  ctx.lineWidth = 7;
  ctx.beginPath();
  ctx.arc(c, c, labelRadius - 6, 0, Math.PI * 2);
  ctx.stroke();
  ctx.fillStyle = accent;
  ctx.beginPath();
  ctx.arc(c, c, 14, 0, Math.PI * 2);
  ctx.fill();
  ctx.textAlign = 'center';
  const titleText = title.length > 8 ? `${title.slice(0, 7)}…` : title || '♪';
  ctx.fillStyle = '#f5f5fa';
  ctx.font = 'bold 44px "Microsoft YaHei", sans-serif';
  ctx.fillText(titleText, c, c - 22);
  const artistText = artist.length > 12 ? `${artist.slice(0, 11)}…` : artist || ' ';
  ctx.fillStyle = '#9a9ab4';
  ctx.font = '24px "Microsoft YaHei", sans-serif';
  ctx.fillText(artistText, c, c + 26);
  ctx.font = '20px "Consolas", monospace';
  ctx.fillStyle = '#6d6d8a';
  ctx.fillText('ATLAS', c, c + labelRadius * 0.62);

  // 盘缘细环
  ctx.strokeStyle = accent;
  ctx.globalAlpha = 0.8;
  ctx.lineWidth = 5;
  ctx.beginPath();
  ctx.arc(c, c, c - 8, 0, Math.PI * 2);
  ctx.stroke();
  ctx.globalAlpha = 1;
  return canvas;
}

/** 柔和接触阴影贴图（径向渐变） */
function makeShadowTexture(): HTMLCanvasElement {
  const canvas = document.createElement('canvas');
  canvas.width = 256;
  canvas.height = 256;
  const ctx = canvas.getContext('2d')!;
  const gradient = ctx.createRadialGradient(128, 128, 10, 128, 128, 128);
  gradient.addColorStop(0, 'rgba(10, 10, 18, 0.5)');
  gradient.addColorStop(1, 'rgba(10, 10, 18, 0)');
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, 256, 256);
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
  empty = false,
}: {
  buckets: StageBucket[];
  totalSeconds: number;
  topTitle?: string;
  topArtist?: string;
  className?: string;
  /** 选中窗口内没有任何播放记录时，舞台给一句引导而不是空转的网格 */
  empty?: boolean;
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

      // 关掉 MSAA：画布本身按 1.5 倍 DPR 渲染，边缘已够干净，省下的填充率对集显更友好
      const renderer = new THREElib.WebGLRenderer({ antialias: false, alpha: true });
      renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.5));
      renderer.setSize(mount.clientWidth, mount.clientHeight);
      // ACES 色调映射：高光更柔、材质更有"摄影感"
      renderer.toneMapping = THREElib.ACESFilmicToneMapping;
      renderer.toneMappingExposure = 1.12;
      mount.appendChild(renderer.domElement);

      const scene = new THREElib.Scene();

      // 环境反射：RoomEnvironment + PMREM，让金属/清漆材质有真实高光（黑胶质感的关键）
      let envTexture: THREE.Texture | null = null;
      try {
        const { RoomEnvironment } = await import('three/addons/environments/RoomEnvironment.js');
        const pmrem = new THREElib.PMREMGenerator(renderer);
        envTexture = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
        scene.environment = envTexture;
        pmrem.dispose();
      } catch {
        // 环境贴图加载失败时退回纯灯光，材质仍可用
      }

      const camera = new THREElib.PerspectiveCamera(
        40,
        mount.clientWidth / mount.clientHeight,
        0.1,
        100,
      );
      // 视口越窄离得越远：手机竖屏下不把黑胶和声浪柱挤出画面
      const fitCamera = (aspect: number) => {
        const distance = 7.6 * Math.max(1, 1.95 / aspect);
        camera.position.set(0, 3.1 * (distance / 7.6), distance);
        camera.lookAt(0, 0.7, 0);
      };
      fitCamera(mount.clientWidth / mount.clientHeight);

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
      const floor = new THREElib.PolarGridHelper(6.4, 8, 5, 64, 0x8888aa, 0x555577);
      (floor.material as THREE.LineBasicMaterial).transparent = true;
      (floor.material as THREE.LineBasicMaterial).opacity = 0.14;
      floor.position.y = 0;
      stage.add(floor);

      /* ---- 黑胶唱片（左侧，持续旋转；物理材质 + 盘面贴图 + 接触阴影） ---- */
      const vinyl = new THREElib.Group();
      vinyl.position.set(-3.05, 1.16, 0);
      vinyl.rotation.y = 0.42;
      stage.add(vinyl);

      // 盘面贴图（沟槽/高光/标签一体）
      const faceTexture = new THREElib.CanvasTexture(
        makeVinylFaceTexture(topRef.current.title, topRef.current.artist, colors.accent),
      );
      faceTexture.anisotropy = 8;
      const drawFace = () => {
        const { title, artist } = topRef.current;
        faceTexture.image = makeVinylFaceTexture(title, artist, colors.accent);
        faceTexture.needsUpdate = true;
      };

      // 盘体：侧壁清漆金属 + 上下贴图盘面；环境反射让沟槽"活"起来
      const sideMaterial = new THREElib.MeshPhysicalMaterial({
        color: 0x0b0b12,
        metalness: 0.9,
        roughness: 0.28,
        clearcoat: 0.8,
        clearcoatRoughness: 0.12,
      });
      const faceMaterial = new THREElib.MeshStandardMaterial({
        map: faceTexture,
        roughness: 0.38,
        metalness: 0.42,
      });
      const disc = new THREElib.Mesh(new THREElib.CylinderGeometry(1.38, 1.38, 0.075, 96), [
        sideMaterial,
        faceMaterial,
        faceMaterial,
      ]);
      disc.rotation.x = Math.PI / 2;
      vinyl.add(disc);

      // 盘缘细环（主题色点睛）
      const edgeRing = new THREElib.Mesh(
        new THREElib.TorusGeometry(1.39, 0.016, 12, 96),
        new THREElib.MeshPhysicalMaterial({
          color: new THREElib.Color(colors.accent),
          emissive: new THREElib.Color(colors.accent),
          emissiveIntensity: 0.45,
          metalness: 0.6,
          roughness: 0.25,
        }),
      );
      vinyl.add(edgeRing);

      // 接触阴影：把唱片"钉"在地面上
      const shadowTexture = new THREElib.CanvasTexture(makeShadowTexture());
      const contactShadow = new THREElib.Mesh(
        new THREElib.PlaneGeometry(3.8, 3.8),
        new THREElib.MeshBasicMaterial({
          map: shadowTexture,
          transparent: true,
          opacity: 0.45,
          depthWrite: false,
        }),
      );
      contactShadow.rotation.x = -Math.PI / 2;
      contactShadow.position.set(-3.05, 0.01, 0.1);
      stage.add(contactShadow);
      const drawLabel = drawFace;

      /* ---- 声浪柱（数据分桶） ---- */
      const barsGroup = new THREElib.Group();
      barsGroup.position.set(1.3, 0, 0);
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
        const slot = Math.min(0.62, 5.8 / count);
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
          const target = Math.max(0.12, (bucket.seconds / maxSeconds) * BAR_MAX_HEIGHT);
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
        raf = requestAnimationFrame(frame);
        // 空闲（未播放、未拖拽、旋转已停）时降到 40fps：持续 60fps 渲染 3D 在集显上
        // 会让整台机器发热变卡，而静止画面看不出差别；交互/播放时恢复满帧。
        const idle = !pulse && !dragging && Math.abs(yawVelocity) < 0.001;
        const minGap = idle ? 1000 / 40 : 0;
        if (now - last < minGap) return;
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
          bar.target = Math.max(0.12, (bar.seconds / maxSeconds) * BAR_MAX_HEIGHT) * (1 + beat);
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
        fitCamera(camera.aspect);
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
          barGeometryCache.forEach((geometry) => geometry.dispose());
          faceTexture.dispose();
          shadowTexture.dispose();
          sideMaterial.dispose();
          faceMaterial.dispose();
          scene.environment = null;
          envTexture?.dispose();
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
      {ready && empty ? (
        <div className="pointer-events-none absolute inset-0 z-10 flex flex-col items-center justify-center gap-1.5 text-center">
          <p className="text-sm font-medium text-text">这个窗口还没有播放记录</p>
          <p className="text-[11px] text-muted">去大屏放一首歌，声浪会在这里长出来</p>
        </div>
      ) : null}
      {ready ? (
        <p className="pointer-events-none absolute bottom-3 left-1/2 z-10 -translate-x-1/2 rounded-full border border-border/70 bg-surface/70 px-3 py-1 text-[10px] tracking-wider text-muted backdrop-blur-sm">
          拖拽旋转视角 · 悬停声浪柱查看时长
        </p>
      ) : null}
    </div>
  );
}
