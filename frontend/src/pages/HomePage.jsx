import React, { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import * as THREE from 'three';
import {
  ArrowRight,
  AlertTriangle,
  BarChart3,
  BrainCircuit,
  CheckCircle2,
  FileSearch,
  Gem,
  History,
  Home,
  LayoutDashboard,
  Link2,
  Plus,
  Radio,
  Search,
  ShieldAlert,
  ShieldCheck,
  XCircle
} from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { apiUrl } from '../utils/api';
import { FEATURE_FLAGS } from '../utils/featureFlags';
import GlobalSearchModal from '../components/GlobalSearchModal';
import './HomePage.css';

const createDotTexture = () => {
  const sprite = document.createElement('canvas');
  sprite.width = 64;
  sprite.height = 64;
  const context = sprite.getContext('2d');
  const gradient = context.createRadialGradient(32, 32, 0, 32, 32, 32);
  gradient.addColorStop(0, 'rgba(255,255,255,1)');
  gradient.addColorStop(0.4, 'rgba(255,255,255,.6)');
  gradient.addColorStop(1, 'rgba(255,255,255,0)');
  context.fillStyle = gradient;
  context.fillRect(0, 0, 64, 64);
  return new THREE.CanvasTexture(sprite);
};

function VerificationGlobe() {
  const canvasRef = useRef(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !window.WebGLRenderingContext) return undefined;

    let renderer;
    try {
      renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true, powerPreference: 'high-performance' });
    } catch (_) {
      return undefined;
    }

    const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.setSize(window.innerWidth, window.innerHeight);

    const scene = new THREE.Scene();
    scene.fog = new THREE.FogExp2(0x050810, 0.0018);
    const camera = new THREE.PerspectiveCamera(60, window.innerWidth / window.innerHeight, 0.1, 2000);
    camera.position.set(0, 0, 320);

    const mouse = { x: 0, y: 0, targetX: 0, targetY: 0 };
    let pageScroll = window.scrollY;
    const group = new THREE.Group();
    scene.add(group);

    const radius = 120;
    const pointCount = reducedMotion ? 700 : 1400;
    const positions = new Float32Array(pointCount * 3);
    const colors = new Float32Array(pointCount * 3);
    const indigo = new THREE.Color(0x6366f1);
    const cyan = new THREE.Color(0x22d3ee);
    const violet = new THREE.Color(0x8b5cf6);
    const goldenAngle = Math.PI * (3 - Math.sqrt(5));

    for (let index = 0; index < pointCount; index += 1) {
      const y = 1 - (index / Math.max(1, pointCount - 1)) * 2;
      const radial = Math.sqrt(1 - y * y);
      const angle = goldenAngle * index;
      positions[index * 3] = Math.cos(angle) * radial * radius;
      positions[index * 3 + 1] = y * radius;
      positions[index * 3 + 2] = Math.sin(angle) * radial * radius;
      const color = Math.random() < 0.12 ? cyan : (Math.random() < 0.5 ? indigo : violet);
      colors[index * 3] = color.r;
      colors[index * 3 + 1] = color.g;
      colors[index * 3 + 2] = color.b;
    }

    const dotTexture = createDotTexture();
    const globeGeometry = new THREE.BufferGeometry();
    globeGeometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    globeGeometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));
    const globeMaterial = new THREE.PointsMaterial({
      size: 2.4,
      map: dotTexture,
      vertexColors: true,
      transparent: true,
      opacity: 0.9,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      sizeAttenuation: true
    });
    const globe = new THREE.Points(globeGeometry, globeMaterial);
    group.add(globe);

    const wireGeometry = new THREE.IcosahedronGeometry(radius * 0.62, 1);
    const wireMaterial = new THREE.MeshBasicMaterial({ color: 0x6366f1, wireframe: true, transparent: true, opacity: 0.1 });
    const wire = new THREE.Mesh(wireGeometry, wireMaterial);
    group.add(wire);

    const rings = [];
    const createRing = (ringRadius, tilt, color, opacity) => {
      const points = [];
      for (let index = 0; index <= 128; index += 1) {
        const angle = (index / 128) * Math.PI * 2;
        points.push(new THREE.Vector3(Math.cos(angle) * ringRadius, 0, Math.sin(angle) * ringRadius));
      }
      const geometry = new THREE.BufferGeometry().setFromPoints(points);
      const material = new THREE.LineBasicMaterial({ color, transparent: true, opacity });
      const line = new THREE.Line(geometry, material);
      line.rotation.x = tilt.x;
      line.rotation.z = tilt.z;
      group.add(line);
      rings.push(line);
    };
    createRing(radius * 1.35, { x: Math.PI / 2.15, z: 0.2 }, 0x8b5cf6, 0.35);
    createRing(radius * 1.6, { x: Math.PI / 2.6, z: -0.35 }, 0x22d3ee, 0.22);
    createRing(radius * 1.9, { x: Math.PI / 1.8, z: 0.55 }, 0x6366f1, 0.14);

    const satellites = [];
    const satelliteColors = [0x34d399, 0xfbbf24, 0xfb7185, 0x22d3ee, 0xa5b4fc, 0x8b5cf6];
    for (let index = 0; index < 26; index += 1) {
      const geometry = new THREE.SphereGeometry(1.4 + Math.random() * 1.6, 10, 10);
      const material = new THREE.MeshBasicMaterial({ color: satelliteColors[index % satelliteColors.length], transparent: true, opacity: 0.95 });
      const mesh = new THREE.Mesh(geometry, material);
      group.add(mesh);
      satellites.push({
        mesh,
        orbit: {
          radius: radius * (1.3 + Math.random() * 0.75),
          speed: (0.15 + Math.random() * 0.35) * (Math.random() < 0.5 ? 1 : -1),
          phase: Math.random() * Math.PI * 2,
          tiltX: Math.random() * Math.PI,
          tiltZ: Math.random() * Math.PI
        }
      });
    }

    const starCount = reducedMotion ? 350 : 900;
    const starPositions = new Float32Array(starCount * 3);
    for (let index = 0; index < starCount; index += 1) {
      starPositions[index * 3] = (Math.random() - 0.5) * 1400;
      starPositions[index * 3 + 1] = (Math.random() - 0.5) * 900;
      starPositions[index * 3 + 2] = (Math.random() - 0.5) * 700 - 200;
    }
    const starGeometry = new THREE.BufferGeometry();
    starGeometry.setAttribute('position', new THREE.BufferAttribute(starPositions, 3));
    const starMaterial = new THREE.PointsMaterial({
      size: 1.1,
      map: dotTexture,
      color: 0x9aa4c7,
      transparent: true,
      opacity: 0.55,
      depthWrite: false,
      blending: THREE.AdditiveBlending
    });
    const stars = new THREE.Points(starGeometry, starMaterial);
    scene.add(stars);

    const linkPositions = new Float32Array(40 * 2 * 3);
    const linkGeometry = new THREE.BufferGeometry();
    linkGeometry.setAttribute('position', new THREE.BufferAttribute(linkPositions, 3));
    const linkMaterial = new THREE.LineBasicMaterial({ color: 0x6366f1, transparent: true, opacity: 0.28, blending: THREE.AdditiveBlending });
    const links = new THREE.LineSegments(linkGeometry, linkMaterial);
    group.add(links);

    const handlePointer = event => {
      mouse.targetX = (event.clientX / window.innerWidth - 0.5) * 2;
      mouse.targetY = (event.clientY / window.innerHeight - 0.5) * 2;
    };
    const handleScroll = () => { pageScroll = window.scrollY; };
    const handleResize = () => {
      camera.aspect = window.innerWidth / window.innerHeight;
      camera.updateProjectionMatrix();
      renderer.setSize(window.innerWidth, window.innerHeight);
    };
    window.addEventListener('pointermove', handlePointer, { passive: true });
    window.addEventListener('scroll', handleScroll, { passive: true });
    window.addEventListener('resize', handleResize);

    const clock = new THREE.Clock();
    let animationFrame = 0;
    let disposed = false;
    const renderFrame = () => {
      if (disposed) return;
      const elapsed = clock.getElapsedTime();
      mouse.x += (mouse.targetX - mouse.x) * 0.05;
      mouse.y += (mouse.targetY - mouse.y) * 0.05;
      group.rotation.y = elapsed * 0.12 + mouse.x * 0.55;
      group.rotation.x = mouse.y * 0.32 + Math.sin(elapsed * 0.1) * 0.05;
      wire.rotation.y = -elapsed * 0.25;
      wire.rotation.z = elapsed * 0.1;
      rings[0].rotation.y = elapsed * 0.18;
      rings[1].rotation.y = -elapsed * 0.12;
      rings[2].rotation.y = elapsed * 0.07;
      globe.scale.setScalar(1 + Math.sin(elapsed * 0.8) * 0.012 + Math.abs(mouse.x) * 0.04);

      satellites.forEach(({ mesh, orbit }) => {
        const angle = orbit.phase + elapsed * orbit.speed;
        mesh.position.set(Math.cos(angle) * orbit.radius, 0, Math.sin(angle) * orbit.radius);
        mesh.position.applyEuler(new THREE.Euler(orbit.tiltX, 0, orbit.tiltZ));
      });

      let linkIndex = 0;
      for (let left = 0; left < satellites.length && linkIndex < 40; left += 1) {
        for (let right = left + 1; right < satellites.length && linkIndex < 40; right += 1) {
          if (satellites[left].mesh.position.distanceTo(satellites[right].mesh.position) < 55) {
            const offset = linkIndex * 6;
            linkPositions[offset] = satellites[left].mesh.position.x;
            linkPositions[offset + 1] = satellites[left].mesh.position.y;
            linkPositions[offset + 2] = satellites[left].mesh.position.z;
            linkPositions[offset + 3] = satellites[right].mesh.position.x;
            linkPositions[offset + 4] = satellites[right].mesh.position.y;
            linkPositions[offset + 5] = satellites[right].mesh.position.z;
            linkIndex += 1;
          }
        }
      }
      linkPositions.fill(0, linkIndex * 6);
      linkGeometry.attributes.position.needsUpdate = true;
      links.visible = linkIndex > 0;

      stars.rotation.y = elapsed * 0.01 + mouse.x * 0.05;
      camera.position.x += (mouse.x * 26 - camera.position.x) * 0.04;
      camera.position.y += (-mouse.y * 18 - camera.position.y) * 0.04;
      camera.position.z = 320 + pageScroll * 0.12;
      camera.lookAt(0, 0, 0);
      renderer.render(scene, camera);
      if (!reducedMotion) animationFrame = window.requestAnimationFrame(renderFrame);
    };
    renderFrame();

    return () => {
      disposed = true;
      window.cancelAnimationFrame(animationFrame);
      window.removeEventListener('pointermove', handlePointer);
      window.removeEventListener('scroll', handleScroll);
      window.removeEventListener('resize', handleResize);
      scene.traverse(object => {
        object.geometry?.dispose?.();
        if (Array.isArray(object.material)) object.material.forEach(material => material.dispose());
        else object.material?.dispose?.();
      });
      dotTexture.dispose();
      renderer.dispose();
    };
  }, []);

  return <canvas ref={canvasRef} className="home3d-scene" aria-hidden="true" />;
}

function CustomCursor({ rootRef }) {
  const dotRef = useRef(null);
  const ringRef = useRef(null);

  useEffect(() => {
    if (!window.matchMedia('(hover: hover) and (pointer: fine)').matches) return undefined;
    const root = rootRef.current;
    const dot = dotRef.current;
    const ring = ringRef.current;
    if (!root || !dot || !ring) return undefined;
    let x = window.innerWidth / 2;
    let y = window.innerHeight / 2;
    let ringX = x;
    let ringY = y;
    let frame = 0;
    const handleMove = event => {
      x = event.clientX;
      y = event.clientY;
      dot.style.left = `${x}px`;
      dot.style.top = `${y}px`;
    };
    const handleOver = event => {
      if (event.target.closest('a, button, [data-interactive]')) ring.classList.add('is-hovering');
    };
    const handleOut = event => {
      if (event.target.closest('a, button, [data-interactive]')) ring.classList.remove('is-hovering');
    };
    const follow = () => {
      ringX += (x - ringX) * 0.16;
      ringY += (y - ringY) * 0.16;
      ring.style.left = `${ringX}px`;
      ring.style.top = `${ringY}px`;
      frame = window.requestAnimationFrame(follow);
    };
    window.addEventListener('pointermove', handleMove, { passive: true });
    root.addEventListener('pointerover', handleOver);
    root.addEventListener('pointerout', handleOut);
    follow();
    return () => {
      window.cancelAnimationFrame(frame);
      window.removeEventListener('pointermove', handleMove);
      root.removeEventListener('pointerover', handleOver);
      root.removeEventListener('pointerout', handleOut);
    };
  }, [rootRef]);

  return (
    <>
      <span ref={ringRef} className="home3d-cursor-ring" aria-hidden="true" />
      <span ref={dotRef} className="home3d-cursor-dot" aria-hidden="true" />
    </>
  );
}

function TiltCard({ className = '', children, ...props }) {
  const handleMove = event => {
    if (!window.matchMedia('(hover: hover)').matches) return;
    const card = event.currentTarget;
    const bounds = card.getBoundingClientRect();
    const x = (event.clientX - bounds.left) / bounds.width;
    const y = (event.clientY - bounds.top) / bounds.height;
    card.style.transform = `rotateY(${(x - 0.5) * 16}deg) rotateX(${(0.5 - y) * 14}deg) translateZ(6px)`;
    card.style.setProperty('--pointer-x', `${x * 100}%`);
    card.style.setProperty('--pointer-y', `${y * 100}%`);
  };
  const handleLeave = event => { event.currentTarget.style.transform = 'rotateY(0) rotateX(0) translateZ(0)'; };
  return <div {...props} className={`home3d-tilt ${className}`} data-interactive onPointerMove={handleMove} onPointerLeave={handleLeave}>{children}</div>;
}

function MagneticLink({ to, className = '', children }) {
  const handleMove = event => {
    if (!window.matchMedia('(hover: hover)').matches) return;
    const bounds = event.currentTarget.getBoundingClientRect();
    const x = event.clientX - (bounds.left + bounds.width / 2);
    const y = event.clientY - (bounds.top + bounds.height / 2);
    event.currentTarget.style.transform = `translate(${x * 0.2}px, ${y * 0.28}px) scale(1.04)`;
  };
  const reset = event => { event.currentTarget.style.transform = 'translate(0, 0) scale(1)'; };
  return <Link to={to} className={`home3d-btn ${className}`} onPointerMove={handleMove} onPointerLeave={reset}>{children}</Link>;
}

function CountUp({ value }) {
  const ref = useRef(null);
  const [display, setDisplay] = useState(0);

  useEffect(() => {
    const node = ref.current;
    if (!node) return undefined;
    let animationFrame = 0;
    const observer = new IntersectionObserver(entries => {
      if (!entries[0]?.isIntersecting) return;
      const start = performance.now();
      const target = Math.max(0, Number(value || 0));
      const tick = now => {
        const progress = Math.min((now - start) / 1000, 1);
        setDisplay(Math.round(target * (1 - ((1 - progress) ** 3))));
        if (progress < 1) animationFrame = window.requestAnimationFrame(tick);
      };
      animationFrame = window.requestAnimationFrame(tick);
      observer.disconnect();
    }, { threshold: 0.4 });
    observer.observe(node);
    return () => {
      observer.disconnect();
      window.cancelAnimationFrame(animationFrame);
    };
  }, [value]);

  return <span ref={ref}>{display}</span>;
}

const pipelineSteps = [
  { step: '01', title: 'Ingest Agent', description: 'Paste text, a URL, or upload media. The agent extracts atomic claims and identifies the content type.', icon: Link2, tone: 'indigo' },
  { step: '02', title: 'Evidence Search', description: 'Each claim becomes targeted queries and is cross-referenced against relevant, attributable web sources.', icon: Search, tone: 'green' },
  { step: '03', title: 'Gemini Verifier', description: 'Verification agents weigh the evidence, detect manipulation tactics, and expose contradictions or missing context.', icon: BrainCircuit, tone: 'amber' },
  { step: '04', title: 'Trust Report', description: 'Receive a reproducible audit with verdicts, source citations, forensic findings, and an explainable trust score.', icon: BarChart3, tone: 'red' }
];

export default function HomePage() {
  const rootRef = useRef(null);
  const { user } = useAuth();
  const [telemetry, setTelemetry] = useState(null);
  const [isSearchOpen, setIsSearchOpen] = useState(false);

  // Platform detection for shortcut key
  const isMac = typeof window !== 'undefined' && /(Mac|iPhone|iPod|iPad)/i.test(navigator?.userAgent || '');
  const shortcutKey = isMac ? '⌘K' : 'Ctrl+K';

  // Global shortcut listener (Ctrl+K / Cmd+K)
  useEffect(() => {
    const handleKeyDown = (e) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        setIsSearchOpen(true);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  useEffect(() => {
    const root = rootRef.current;
    if (!root) return undefined;
    const nodes = Array.from(root.querySelectorAll('[data-reveal]'));
    const observer = new IntersectionObserver(entries => {
      entries.forEach(entry => {
        if (entry.isIntersecting) {
          entry.target.classList.add('is-visible');
          observer.unobserve(entry.target);
        }
      });
    }, { threshold: 0.14 });
    nodes.forEach(node => observer.observe(node));
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    if (!user) return undefined;
    const controller = new AbortController();
    const token = localStorage.getItem('etrai_token');
    fetch(apiUrl('/api/v1/dashboard'), {
      signal: controller.signal,
      credentials: 'include',
      headers: token ? { Authorization: `Bearer ${token}` } : {}
    }).then(response => response.ok ? response.json() : null)
      .then(data => { if (data) setTelemetry(data); })
      .catch(error => { if (error.name !== 'AbortError') setTelemetry(null); });
    return () => controller.abort();
  }, [user]);

  const verdicts = telemetry?.verdictMix || {};
  const metrics = [
    { label: 'Total Analyses', value: verdicts.total || 0, description: 'Reports in the last 30 days', icon: FileSearch, tone: 'indigo' },
    { label: 'Claims Verified', value: verdicts.verified?.count || 0, description: 'Supported by attributable evidence', icon: CheckCircle2, tone: 'green' },
    { label: 'Suspicious Claims', value: verdicts.suspicious?.count || 0, description: 'Missing or conflicting evidence', icon: AlertTriangle, tone: 'amber' },
    { label: 'False Claims', value: verdicts.false?.count || 0, description: 'Contradicted by trusted sources', icon: XCircle, tone: 'red' }
  ];

  return (
    <div ref={rootRef} className="etrai-home3d">
      <VerificationGlobe />
      <div className="home3d-glow home3d-glow-a" aria-hidden="true" />
      <div className="home3d-glow home3d-glow-b" aria-hidden="true" />
      <CustomCursor rootRef={rootRef} />

      <div className="home3d-content">
        <nav className="home3d-nav" aria-label="Primary navigation">
          <div className="home3d-nav-inner">
            <Link className="home3d-brand" to="/" aria-label="ETRAI home">
              <span className="home3d-brand-logo"><ShieldCheck aria-hidden="true" /></span>
              <span>
                <span className="home3d-brand-name">ETRAI</span>
                <span className="home3d-brand-sub">AI VERIFICATION</span>
              </span>
            </Link>
            
            <div className="home3d-nav-links">
              <Link to="/" className="home3d-nav-item active"><Home size={15} /> <span>Home</span></Link>
              <Link to="/dashboard" className="home3d-nav-item"><LayoutDashboard size={15} /> <span>Dashboard</span></Link>
              <Link to="/news" className="home3d-nav-item"><Radio size={15} /> <span>Latest News</span></Link>
              {FEATURE_FLAGS.SHOW_FAKE_NEWS_SECTION && (
                <Link to="/fake-news" className="home3d-nav-item"><ShieldAlert size={15} /> <span>Fake News</span></Link>
              )}
              <Link to="/history" className="home3d-nav-item"><History size={15} /> <span>History</span></Link>

              {/* Quick Search Button */}
              <button
                type="button"
                onClick={() => setIsSearchOpen(true)}
                className="home3d-nav-search"
                title={`Search (${shortcutKey})`}
                aria-label="Search command palette"
              >
                <Search size={14} />
                <span className="home3d-nav-search-label">Search...</span>
                <kbd className="home3d-nav-kbd">{shortcutKey}</kbd>
              </button>

              {/* Upgrade Plan Button */}
              <Link to="/billing" className="home3d-nav-upgrade" title="Upgrade Plan & Quota">
                <Gem size={14} className="home3d-gem-icon" />
                <span>Upgrade</span>
              </Link>

              {/* Start New Analysis CTA */}
              <Link className="home3d-nav-cta" to="/analysis">
                <Plus size={15} />
                <span>New Analysis</span>
              </Link>
            </div>
          </div>
        </nav>

        <GlobalSearchModal isOpen={isSearchOpen} onClose={() => setIsSearchOpen(false)} />

        <header className="home3d-hero" id="top">
          <div className="home3d-pill"><span className="home3d-status-dot" />AI MULTI-AGENT PIPELINE ACTIVE</div>
          <h1>
            <span className="home3d-title-line"><span>Fact-Checking &amp;</span></span>
            <span className="home3d-title-line"><span className="home3d-gradient-text">Content Verification</span></span>
          </h1>
          <p>Verify claims, detect manipulation tactics, and audit reports with live evidence search, Google Gemini verification agents, and media forensics.</p>
          <div className="home3d-hero-actions">
            <MagneticLink to="/analysis" className="home3d-btn-primary"><Plus size={19} />Start New Analysis<ArrowRight size={18} /></MagneticLink>
            <a className="home3d-btn home3d-btn-ghost" href="#pipeline">How it works</a>
          </div>
          <a className="home3d-scroll-hint" href="#overview"><span className="home3d-scroll-wheel" />Scroll</a>
        </header>

        <section className="home3d-section" id="overview">
          <div className="home3d-container">
            <div className="home3d-section-heading" data-reveal>
              <span className="home3d-kicker">Live Dashboard</span>
              <h2>Verification at a glance</h2>
              <p>{user ? 'Your latest account activity, calculated from real verification reports.' : 'Sign in to populate these cards from your real verification history.'}</p>
            </div>
            <div className="home3d-stats-grid">
              {metrics.map(metric => {
                const Icon = metric.icon;
                return (
                  <TiltCard key={metric.label} className="home3d-stat-card" data-reveal>
                    <span className={`home3d-icon home3d-icon-${metric.tone}`}><Icon size={23} /></span>
                    <h3>{metric.label}</h3>
                    <div className={`home3d-stat-number home3d-tone-${metric.tone}`}><CountUp value={metric.value} /></div>
                    <p>{metric.description}</p>
                  </TiltCard>
                );
              })}
            </div>
          </div>
        </section>

        <section className="home3d-section" id="pipeline">
          <div className="home3d-container">
            <div className="home3d-section-heading" data-reveal>
              <span className="home3d-kicker">Multi-Agent Pipeline</span>
              <h2>How ETRAI verifies content</h2>
              <p>A chain of specialized agents that ingest, search, cross-examine, and score every checkable claim.</p>
            </div>
            <div className="home3d-pipeline-grid">
              {pipelineSteps.map(item => {
                const Icon = item.icon;
                return (
                  <TiltCard key={item.step} className="home3d-pipeline-card" data-reveal>
                    <span className="home3d-step">{item.step}</span>
                    <span className={`home3d-icon home3d-icon-${item.tone}`}><Icon size={25} /></span>
                    <h3>{item.title}</h3>
                    <p>{item.description}</p>
                  </TiltCard>
                );
              })}
            </div>
          </div>
        </section>

        <div className="home3d-container" id="cta">
          <TiltCard className="home3d-cta" data-reveal>
            <h2>Stop misinformation before it spreads</h2>
            <p>Paste a claim, upload a file, or submit a link. ETRAI turns it into a transparent evidence report.</p>
            <MagneticLink to="/analysis" className="home3d-btn-primary"><Plus size={19} />Start New Analysis<ArrowRight size={18} /></MagneticLink>
          </TiltCard>
        </div>

        <footer className="home3d-footer">ETRAI — AI Verification · Fact-Checking &amp; Content Verification Platform</footer>
      </div>
    </div>
  );
}
