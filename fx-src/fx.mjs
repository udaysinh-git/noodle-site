// WebGPU effects for the Noodle site, built on vgpu (MIT, vercel-labs/vgpu).
// Bundled into assets/fx.js by build.mjs; site.js imports it only when WebGPU is
// there, motion is welcome and the device isn't saving power.
import { initFromDevice, effect, surface, frame, sampler, texture } from 'vgpu'
import PREPARED from './prepared.json'

let gpuPromise = null

// One device per page, low power, shared by every effect on it.
const getGpu = () => {
  gpuPromise ??= (async () => {
    const adapter = await navigator.gpu.requestAdapter({ powerPreference: 'low-power' })
    if (!adapter) throw new Error('No WebGPU adapter')
    const device = await adapter.requestDevice()
    const gpu = await initFromDevice(device)
    return gpu
  })()
  return gpuPromise
}

// Draws at most `fps` times a second, and only while `el` is on screen and the tab
// is visible. Returns a stop function.
const runLoop = (el, fps, draw) => {
  let raf = 0
  let last = 0
  let onScreen = false
  let stopped = false
  const minGap = 1000 / fps - 2
  const step = (now) => {
    raf = requestAnimationFrame(step)
    if (now - last < minGap) return
    last = now
    try {
      draw(now)
    } catch (err) {
      stop()
      console.warn('[fx]', err)
    }
  }
  const sync = () => {
    const want = !stopped && onScreen && !document.hidden
    if (want && !raf) raf = requestAnimationFrame(step)
    else if (!want && raf) {
      cancelAnimationFrame(raf)
      raf = 0
    }
  }
  const io = new IntersectionObserver((entries) => {
    onScreen = entries[entries.length - 1].isIntersecting
    sync()
  })
  io.observe(el)
  document.addEventListener('visibilitychange', sync)
  const stop = () => {
    stopped = true
    io.disconnect()
    document.removeEventListener('visibilitychange', sync)
    sync()
  }
  return { stop }
}

// Keeps a surface the size of its canvas in device pixels, capped by maxDpr.
const fitSurface = (canvas, surf, maxDpr, onSize) => {
  const ro = new ResizeObserver(() => {
    const dpr = Math.min(devicePixelRatio || 1, maxDpr)
    const w = Math.max(1, Math.round(canvas.clientWidth * dpr))
    const h = Math.max(1, Math.round(canvas.clientHeight * dpr))
    surf.resize([w, h])
    onSize(w, h, dpr)
  })
  ro.observe(canvas)
  return () => ro.disconnect()
}

const parseColor = (css) => {
  const probe = document.createElement('span')
  probe.style.color = css
  document.body.append(probe)
  const rgb = getComputedStyle(probe).color.match(/[\d.]+/g).map(Number)
  probe.remove()
  return [rgb[0] / 255, rgb[1] / 255, rgb[2] / 255, 1]
}

// Hero strands -----------------------------------------------------------------

export async function strands(canvas) {
  const gpu = await getGpu()
  const surf = surface(gpu, canvas, { autoResize: false, alphaMode: 'premultiplied', clearColor: [0, 0, 0, 0] })
  const fx = effect(gpu, PREPARED.strands, { label: 'strands' })
  const root = document.documentElement

  const colors = () => {
    const cs = getComputedStyle(root)
    const light = cs.colorScheme.includes('light') && root.dataset.skin !== '98'
    const phosphor = root.dataset.skin === 'phosphor'
    fx.set({
      p: {
        c1: parseColor(cs.getPropertyValue('--accent')),
        c2: parseColor(phosphor ? '#1fa847' : light ? '#d9468f' : '#f472b6'),
        strength: light ? 0.5 : 0.7
      }
    })
  }

  let res = [1, 1]
  fx.set({ p: { res, ptr: [0.7, 0.5], time: 0, pulse: 0, hover: 0, strength: 0.9, c1: [0.77, 0.71, 0.99, 1], c2: [0.96, 0.45, 0.71, 1] } })
  colors()
  new MutationObserver(colors).observe(root, { attributes: true, attributeFilter: ['data-theme', 'data-skin'] })
  matchMedia('(prefers-color-scheme: light)').addEventListener('change', colors)

  const unfit = fitSurface(canvas, surf, 1, (w, h) => {
    res = [w, h]
    fx.set({ p: { res } })
  })

  // The pointer is followed with a little lag, which reads as weight.
  const target = { x: 0.72, y: 0.45, hover: 0 }
  const cur = { x: 0.72, y: 0.45, hover: 0 }
  const onMove = (e) => {
    const r = canvas.getBoundingClientRect()
    target.x = (e.clientX - r.left) / r.width
    target.y = (e.clientY - r.top) / r.height
    target.hover = target.y > -0.1 && target.y < 1.1 ? 1 : 0
  }
  const onLeave = () => (target.hover = 0)
  addEventListener('pointermove', onMove, { passive: true })
  document.addEventListener('pointerleave', onLeave)

  let pulse = 0
  const start = performance.now()
  let prev = start
  const loop = runLoop(canvas, 30, (now) => {
    const dt = Math.min(0.1, (now - prev) / 1000)
    prev = now
    const k = 1 - Math.exp(-dt * 5)
    cur.x += (target.x - cur.x) * k
    cur.y += (target.y - cur.y) * k
    cur.hover += (target.hover - cur.hover) * (1 - Math.exp(-dt * 3))
    pulse *= Math.exp(-dt * 4)
    fx.set({ p: { time: (now - start) / 1000, ptr: [cur.x, cur.y], hover: cur.hover, pulse } })
    frame(gpu, (f) => f.pass(surf, fx))
    canvas.dataset.live = ''
  })

  return {
    pulse: () => (pulse = 1),
    stop() {
      loop.stop()
      unfit()
      removeEventListener('pointermove', onMove)
      surf.dispose()
    }
  }
}

// CRT ----------------------------------------------------------------------------

export async function crt(canvas, src) {
  const gpu = await getGpu()
  const img = new Image()
  img.src = src
  await img.decode()
  const bitmap = await createImageBitmap(img)
  const tex = texture(gpu, {
    kind: '2d',
    size: [bitmap.width, bitmap.height],
    format: 'rgba8unorm',
    usage: ['texture_binding', 'copy_dst', 'render_attachment']
  })
  gpu.gpu.queue.copyExternalImageToTexture({ source: bitmap }, { texture: tex.gpu }, [bitmap.width, bitmap.height])
  bitmap.close()

  const surf = surface(gpu, canvas, { autoResize: false })
  const fx = effect(gpu, PREPARED.crt, { label: 'crt' })
  fx.set({
    tex,
    samp: sampler(gpu, { minFilter: 'linear', magFilter: 'linear' }),
    u: { res: [1, 1], time: 0, power: 0, dpr: 1, curvature: 0.55, scan: 0.55, glow: 0.7 }
  })
  const unfit = fitSurface(canvas, surf, 2, (w, h, dpr) => fx.set({ u: { res: [w, h], dpr } }))

  // Every time the picture comes into view it switches on again, like a real set.
  let onAt = 0
  const io = new IntersectionObserver((entries) => {
    if (entries[entries.length - 1].isIntersecting) onAt = performance.now()
  })
  io.observe(canvas)

  const start = performance.now()
  const loop = runLoop(canvas, 30, (now) => {
    const power = Math.min(1, (now - onAt) / 900)
    fx.set({ u: { time: (now - start) / 1000, power } })
    frame(gpu, (f) => f.pass(surf, fx))
    canvas.dataset.live = ''
  })

  return {
    stop() {
      loop.stop()
      io.disconnect()
      unfit()
      surf.dispose()
      tex.destroy()
    }
  }
}
