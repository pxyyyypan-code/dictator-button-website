/**
 * intro-tunnel.js —— u01 首页的连续不规则圆环隧道
 *
 * 以多组独立 SVG 圆环恢复上一版的纵深与丰富度，但使用 non-scaling-stroke
 * 防止描边随放大变粗；道具全部来自完整透明素材，不使用截图裁切件。
 */
'use strict';

const IntroTunnel = (function () {
  const SVG_NS = 'http://www.w3.org/2000/svg';

  const GADGET_TYPES = {
    timer:     { src: 'assets/images/gadgets/gadget-01.webp', size: 'clamp(62px, 6.1vw, 116px)' },
    machine:   { src: 'assets/images/gadgets/gadget-02.webp', size: 'clamp(72px, 7.4vw, 140px)' },
    phone:     { src: 'assets/images/gadgets/gadget-04.webp', size: 'clamp(68px, 6.8vw, 130px)' },
    door:      { src: 'assets/images/gadgets/gadget-05.webp', size: 'clamp(62px, 6.2vw, 118px)' },
    copter:    { src: 'assets/images/gadgets/gadget-09.webp', size: 'clamp(76px, 7.8vw, 148px)' },
    capsules:  { src: 'assets/images/gadgets/gadget-11.webp', size: 'clamp(60px, 6vw, 114px)' },
    bread:     { src: 'assets/images/gadgets/gadget-12.webp', size: 'clamp(68px, 7vw, 132px)' },
    lamp:      { src: 'assets/images/gadgets/gadget-16.webp', size: 'clamp(72px, 7.2vw, 138px)' },
    gun:       { src: 'assets/images/gadgets/gadget-17.webp', size: 'clamp(62px, 6.2vw, 118px)' },
    potion:    { src: 'assets/images/gadgets/gadget-18.webp', size: 'clamp(64px, 6.4vw, 122px)' },
    passport:  { src: 'assets/images/gadgets/gadget-19.webp', size: 'clamp(64px, 6.4vw, 122px)' },
    dumpling:  { src: 'assets/images/gadgets/gadget-20.webp', size: 'clamp(64px, 6.4vw, 122px)' }
  };

  /* 中段有轻微侧向偏移，形成弧线；终点都在视口安全区内。 */
  const GADGET_PATHS = [
    { type: 'gun',      midX: '-18vw', midY: '-10vh', endX: '-38vw', endY: '-27vh', from: '-12deg', to: '-29deg' },
    { type: 'timer',    midX: '-5vw',  midY: '-18vh', endX: '-15vw', endY: '-31vh', from: '7deg',   to: '20deg' },
    { type: 'copter',   midX: '8vw',   midY: '-18vh', endX: '17vw',  endY: '-30vh', from: '4deg',   to: '21deg' },
    { type: 'potion',   midX: '19vw',  midY: '-9vh',  endX: '38vw',  endY: '-25vh', from: '8deg',   to: '26deg' },
    { type: 'phone',    midX: '22vw',  midY: '-1vh',  endX: '39vw',  endY: '1vh',   from: '-2deg',  to: '15deg' },
    { type: 'capsules', midX: '18vw',  midY: '12vh',  endX: '36vw',  endY: '26vh',  from: '6deg',   to: '23deg' },
    { type: 'machine',  midX: '7vw',   midY: '19vh',  endX: '15vw',  endY: '31vh',  from: '-4deg',  to: '14deg' },
    { type: 'door',     midX: '-7vw',  midY: '18vh',  endX: '-15vw', endY: '30vh',  from: '-3deg',  to: '-18deg' },
    { type: 'bread',    midX: '-19vw', midY: '11vh',  endX: '-37vw', endY: '25vh',  from: '-6deg',  to: '-24deg' },
    { type: 'lamp',     midX: '-22vw', midY: '0vh',   endX: '-39vw', endY: '0vh',   from: '8deg',   to: '-17deg' },
    { type: 'passport', midX: '-17vw', midY: '-13vh', endX: '-31vw', endY: '-19vh', from: '-5deg',  to: '-20deg' },
    { type: 'dumpling', midX: '16vw',  midY: '13vh',  endX: '30vw',  endY: '19vh',  from: '5deg',   to: '21deg' }
  ];

  function configNumber(key, fallback) {
    const value = Number(CONFIG[key]);
    return Number.isFinite(value) && value > 0 ? value : fallback;
  }

  function round(value) {
    return Math.round(value * 100) / 100;
  }

  /* 由两组正弦扰动生成闭合平滑路径；每个环的轮廓都不同，不会像复制图片。 */
  function createRingPath(seed) {
    const pointCount = 20;
    const points = [];
    for (let index = 0; index < pointCount; index += 1) {
      const angle = -Math.PI / 2 + (Math.PI * 2 * index) / pointCount;
      const wave = Math.sin(angle * 3 + seed * 0.73) * 3.7
        + Math.sin(angle * 5 - seed * 0.41) * 2.1
        + Math.cos(angle * 2 + seed * 0.29) * 1.5;
      const radiusX = 40 + wave;
      const radiusY = 39 + wave * 0.62 + Math.sin(angle * 4 + seed * 0.37) * 1.8;
      points.push({
        x: round(50 + Math.cos(angle) * radiusX),
        y: round(50 + Math.sin(angle) * radiusY)
      });
    }

    function midpoint(a, b) {
      return { x: round((a.x + b.x) / 2), y: round((a.y + b.y) / 2) };
    }

    const start = midpoint(points[pointCount - 1], points[0]);
    let path = 'M ' + start.x + ' ' + start.y;
    for (let index = 0; index < pointCount; index += 1) {
      const point = points[index];
      const next = points[(index + 1) % pointCount];
      const end = midpoint(point, next);
      path += ' Q ' + point.x + ' ' + point.y + ' ' + end.x + ' ' + end.y;
    }
    return path + ' Z';
  }

  function createRings(layer) {
    const count = Math.min(24, Math.max(14, Math.round(configNumber('INTRO_TUNNEL_RING_COUNT', 18))));
    const cycle = configNumber('INTRO_TUNNEL_RING_CYCLE_MS', 7200);
    const step = cycle / count;

    layer.innerHTML = '';
    for (let index = 0; index < count; index += 1) {
      const svg = document.createElementNS(SVG_NS, 'svg');
      const path = document.createElementNS(SVG_NS, 'path');
      svg.classList.add('intro-tunnel__ring');
      svg.setAttribute('viewBox', '0 0 100 100');
      svg.setAttribute('preserveAspectRatio', 'xMidYMid meet');
      svg.setAttribute('aria-hidden', 'true');
      path.setAttribute('d', createRingPath(index + 1));
      path.setAttribute('fill', 'none');
      path.setAttribute('stroke', 'currentColor');
      path.setAttribute('stroke-width', String(6.5 + (index % 3) * 0.65));
      path.setAttribute('stroke-linecap', 'round');
      path.setAttribute('stroke-linejoin', 'round');
      path.setAttribute('vector-effect', 'non-scaling-stroke');
      svg.appendChild(path);

      svg.style.setProperty('--intro-delay', (-index * step) + 'ms');
      svg.style.setProperty('--ring-start-rotation', ((index % 7) * 2.4 - 7.2) + 'deg');
      svg.style.setProperty('--ring-end-rotation', ((index % 7) * 2.4 + 9.5) + 'deg');
      svg.style.setProperty('--ring-static-scale', String(0.55 + index * (7.6 / count)));
      svg.style.setProperty('--ring-alpha', String(0.82 + (index % 4) * 0.045));
      layer.appendChild(svg);
    }
  }

  function createGadgets(layer) {
    const count = Math.min(
      GADGET_PATHS.length,
      Math.max(8, Math.round(configNumber('INTRO_TUNNEL_GADGET_COUNT', 12)))
    );
    const baseCycle = configNumber('INTRO_TUNNEL_GADGET_CYCLE_MS', 13200);
    const step = baseCycle / count;

    layer.innerHTML = '';
    for (let index = 0; index < count; index += 1) {
      const path = GADGET_PATHS[index];
      const type = GADGET_TYPES[path.type];
      const duration = baseCycle * (0.91 + (index % 4) * 0.055);
      const image = document.createElement('img');
      image.className = 'intro-tunnel__gadget';
      image.src = type.src;
      image.alt = '';
      image.draggable = false;
      image.decoding = 'async';
      image.style.setProperty('--intro-delay', (-index * step - duration * 0.22) + 'ms');
      image.style.setProperty('--gadget-duration', duration + 'ms');
      image.style.setProperty('--gadget-size', type.size);
      image.style.setProperty('--gadget-mid-x', path.midX);
      image.style.setProperty('--gadget-mid-y', path.midY);
      image.style.setProperty('--gadget-near-x', path.endX.replace(/-?\d+(?:\.\d+)?/, function (number) {
        return String(Number(number) * 0.84);
      }));
      image.style.setProperty('--gadget-near-y', path.endY.replace(/-?\d+(?:\.\d+)?/, function (number) {
        return String(Number(number) * 0.84);
      }));
      image.style.setProperty('--gadget-end-x', path.endX);
      image.style.setProperty('--gadget-end-y', path.endY);
      image.style.setProperty('--gadget-start-rotation', path.from);
      image.style.setProperty('--gadget-end-rotation', path.to);
      image.style.setProperty('--gadget-static-x', path.midX);
      image.style.setProperty('--gadget-static-y', path.midY);
      layer.appendChild(image);
    }
  }

  function mount() {
    const scene = document.querySelector('[data-scene="u01"]');
    const tunnel = document.querySelector('[data-intro-tunnel]');
    const rings = document.querySelector('[data-intro-rings]');
    const gadgets = document.querySelector('[data-intro-gadgets]');
    if (!scene || !tunnel || !rings || !gadgets) return false;

    tunnel.style.setProperty(
      '--intro-ring-cycle',
      configNumber('INTRO_TUNNEL_RING_CYCLE_MS', 7200) + 'ms'
    );
    createRings(rings);
    createGadgets(gadgets);
    return true;
  }

  return { mount: mount };
})();

document.addEventListener('DOMContentLoaded', IntroTunnel.mount);
