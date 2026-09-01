import React, { useEffect, useRef } from 'react';
import { useLocation } from 'react-router-dom';
import './AppExperience.css';

function GlobalCursor() {
  const dotRef = useRef(null);
  const ringRef = useRef(null);

  useEffect(() => {
    const supportsPointer = window.matchMedia('(hover: hover) and (pointer: fine)').matches;
    if (!supportsPointer) return undefined;
    const dot = dotRef.current;
    const ring = ringRef.current;
    if (!dot || !ring) return undefined;

    let pointerX = window.innerWidth / 2;
    let pointerY = window.innerHeight / 2;
    let ringX = pointerX;
    let ringY = pointerY;
    let animationFrame = 0;

    const handleMove = event => {
      pointerX = event.clientX;
      pointerY = event.clientY;
      dot.style.left = `${pointerX}px`;
      dot.style.top = `${pointerY}px`;
    };
    const handleOver = event => {
      const interactive = event.target.closest('a, button, input, textarea, select, [role="button"], [data-interactive]');
      ring.classList.toggle('is-interactive', Boolean(interactive));
      ring.classList.toggle('is-text', Boolean(event.target.closest('input, textarea, [contenteditable="true"]')));
    };
    const handleOut = event => {
      if (!event.relatedTarget) {
        ring.classList.remove('is-interactive', 'is-text');
      }
    };
    const follow = () => {
      ringX += (pointerX - ringX) * 0.16;
      ringY += (pointerY - ringY) * 0.16;
      ring.style.left = `${ringX}px`;
      ring.style.top = `${ringY}px`;
      animationFrame = window.requestAnimationFrame(follow);
    };

    window.addEventListener('pointermove', handleMove, { passive: true });
    document.addEventListener('pointerover', handleOver);
    document.addEventListener('pointerout', handleOut);
    follow();

    return () => {
      window.cancelAnimationFrame(animationFrame);
      window.removeEventListener('pointermove', handleMove);
      document.removeEventListener('pointerover', handleOver);
      document.removeEventListener('pointerout', handleOut);
    };
  }, []);

  return (
    <>
      <span ref={ringRef} className="etrai-global-cursor-ring" aria-hidden="true" />
      <span ref={dotRef} className="etrai-global-cursor-dot" aria-hidden="true" />
    </>
  );
}

function AmbientVerificationNetwork() {
  const canvasRef = useRef(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !window.WebGLRenderingContext) return undefined;
    let disposed = false;
    let animationFrame = 0;
    let renderer = null;
    let cleanupScene = () => {};

    const pointer = { x: 0, y: 0, targetX: 0, targetY: 0 };
    const handlePointer = event => {
      pointer.targetX = (event.clientX / window.innerWidth - 0.5) * 2;
      pointer.targetY = (event.clientY / window.innerHeight - 0.5) * 2;
    };

    window.addEventListener('pointermove', handlePointer, { passive: true });

    import('three').then(THREE => {
      if (disposed) return;
      try {
        renderer = new THREE.WebGLRenderer({ canvas, alpha: true, antialias: true, powerPreference: 'low-power' });
      } catch (_) {
        return;
      }

      const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
      renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.5));
      renderer.setSize(window.innerWidth, window.innerHeight);
      renderer.setClearColor(0x000000, 0);

      const scene = new THREE.Scene();
      const camera = new THREE.PerspectiveCamera(58, window.innerWidth / window.innerHeight, 0.1, 1200);
      camera.position.z = 340;
      const group = new THREE.Group();
      scene.add(group);

      const pointCount = reducedMotion ? 220 : 520;
      const positions = new Float32Array(pointCount * 3);
      const colors = new Float32Array(pointCount * 3);
      const palette = [new THREE.Color(0x0B5CD5), new THREE.Color(0xD97757), new THREE.Color(0x0E2E63), new THREE.Color(0xE88F6B)];
      const radius = 112;
      const goldenAngle = Math.PI * (3 - Math.sqrt(5));
      for (let index = 0; index < pointCount; index += 1) {
        const y = 1 - (index / Math.max(1, pointCount - 1)) * 2;
        const radial = Math.sqrt(1 - y * y);
        const angle = goldenAngle * index;
        positions[index * 3] = Math.cos(angle) * radial * radius;
        positions[index * 3 + 1] = y * radius;
        positions[index * 3 + 2] = Math.sin(angle) * radial * radius;
        const color = palette[index % palette.length];
        colors[index * 3] = color.r;
        colors[index * 3 + 1] = color.g;
        colors[index * 3 + 2] = color.b;
      }

      const pointsGeometry = new THREE.BufferGeometry();
      pointsGeometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
      pointsGeometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));
      const pointsMaterial = new THREE.PointsMaterial({
        size: 2.05,
        vertexColors: true,
        transparent: true,
        opacity: 0.9,
        depthWrite: false,
        blending: THREE.AdditiveBlending
      });
      group.add(new THREE.Points(pointsGeometry, pointsMaterial));

      const shellGeometry = new THREE.IcosahedronGeometry(radius * 0.93, 2);
      const shellMaterial = new THREE.MeshBasicMaterial({ color: 0x0B5CD5, wireframe: true, transparent: true, opacity: 0.16 });
      const shell = new THREE.Mesh(shellGeometry, shellMaterial);
      group.add(shell);

      const ringObjects = [
        { scale: 1.28, color: 0xD97757, opacity: 0.3, x: 1.28, z: 0.2 },
        { scale: 1.55, color: 0x0B5CD5, opacity: 0.22, x: 1.05, z: -0.45 }
      ].map(config => {
        const curve = new THREE.EllipseCurve(0, 0, radius * config.scale, radius * config.scale, 0, Math.PI * 2);
        const geometry = new THREE.BufferGeometry().setFromPoints(curve.getPoints(96));
        const material = new THREE.LineBasicMaterial({ color: config.color, transparent: true, opacity: config.opacity });
        const line = new THREE.LineLoop(geometry, material);
        line.rotation.x = config.x;
        line.rotation.z = config.z;
        group.add(line);
        return line;
      });

      const nodeColors = [0x34d399, 0xfbbf24, 0xfb7185, 0x22d3ee];
      const nodes = [];
      for (let index = 0; index < 12; index += 1) {
        const geometry = new THREE.SphereGeometry(2.15, 10, 10);
        const material = new THREE.MeshBasicMaterial({ color: nodeColors[index % nodeColors.length], transparent: true, opacity: 1 });
        const mesh = new THREE.Mesh(geometry, material);
        const angle = (index / 12) * Math.PI * 2;
        mesh.position.set(Math.cos(angle) * radius * 1.35, Math.sin(angle * 1.7) * 72, Math.sin(angle) * radius * 0.85);
        group.add(mesh);
        nodes.push(mesh);
      }

      const linePositions = new Float32Array(nodes.length * 6);
      nodes.forEach((node, index) => {
        const next = nodes[(index + 3) % nodes.length];
        const offset = index * 6;
        linePositions[offset] = node.position.x;
        linePositions[offset + 1] = node.position.y;
        linePositions[offset + 2] = node.position.z;
        linePositions[offset + 3] = next.position.x;
        linePositions[offset + 4] = next.position.y;
        linePositions[offset + 5] = next.position.z;
      });
      const networkGeometry = new THREE.BufferGeometry();
      networkGeometry.setAttribute('position', new THREE.BufferAttribute(linePositions, 3));
      const networkMaterial = new THREE.LineBasicMaterial({ color: 0x818cf8, transparent: true, opacity: 0.2 });
      group.add(new THREE.LineSegments(networkGeometry, networkMaterial));

      const placeScene = () => {
        camera.aspect = window.innerWidth / window.innerHeight;
        camera.updateProjectionMatrix();
        renderer.setSize(window.innerWidth, window.innerHeight);
        group.position.x = window.innerWidth < 800 ? 0 : 135;
        group.position.y = window.innerWidth < 800 ? 150 : 72;
      };
      placeScene();
      window.addEventListener('resize', placeScene);

      const clock = new THREE.Clock();
      const render = () => {
        if (disposed || !renderer) return;
        const elapsed = clock.getElapsedTime();
        pointer.x += (pointer.targetX - pointer.x) * 0.04;
        pointer.y += (pointer.targetY - pointer.y) * 0.04;
        group.rotation.y = elapsed * 0.055 + pointer.x * 0.18;
        group.rotation.x = pointer.y * 0.11;
        shell.rotation.y = -elapsed * 0.085;
        ringObjects[0].rotation.z = 0.2 + elapsed * 0.035;
        ringObjects[1].rotation.z = -0.45 - elapsed * 0.025;
        camera.position.x += (pointer.x * 8 - camera.position.x) * 0.025;
        camera.position.y += (-pointer.y * 6 - camera.position.y) * 0.025;
        camera.lookAt(0, 0, 0);
        renderer.render(scene, camera);
        if (!reducedMotion) animationFrame = window.requestAnimationFrame(render);
      };
      render();

      cleanupScene = () => {
        window.removeEventListener('resize', placeScene);
        scene.traverse(object => {
          object.geometry?.dispose?.();
          if (Array.isArray(object.material)) object.material.forEach(material => material.dispose());
          else object.material?.dispose?.();
        });
        renderer?.dispose();
      };
    }).catch(() => {});

    return () => {
      disposed = true;
      window.cancelAnimationFrame(animationFrame);
      window.removeEventListener('pointermove', handlePointer);
      cleanupScene();
    };
  }, []);

  return <canvas ref={canvasRef} className="etrai-global-scene" aria-hidden="true" />;
}

export default function AppExperience() {
  const location = useLocation();
  if (location.pathname === '/') return null;
  return (
    <>
      <div className="etrai-global-experience" aria-hidden="true">
        <AmbientVerificationNetwork />
        <span className="etrai-global-glow etrai-global-glow-a" />
        <span className="etrai-global-glow etrai-global-glow-b" />
      </div>
      <GlobalCursor />
    </>
  );
}
