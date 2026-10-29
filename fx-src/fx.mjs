// WebGPU effects for the Noodle site, built on vgpu (MIT, vercel-labs/vgpu).
// Bundled into assets/fx.js by build.mjs; site.js imports it on the skins page only,
// when WebGPU is there, motion is welcome and the device isn't saving power.
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
    u: { res: [1, 1], time: 0, power: 1, dpr: 1, curvature: 0.55, scan: 0.55, glow: 0.7 }
  })
  const unfit = fitSurface(canvas, surf, 2, (w, h, dpr) => fx.set({ u: { res: [w, h], dpr } }))

  // The picture is still, so it is drawn a few times a second at most.
  const loop = runLoop(canvas, 4, () => {
    frame(gpu, (f) => f.pass(surf, fx))
    canvas.dataset.live = ''
  })

  return {
    stop() {
      loop.stop()
      unfit()
      surf.dispose()
      tex.destroy()
    }
  }
}
