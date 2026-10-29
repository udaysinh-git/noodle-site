// Noodle site. Loaded deferred; the pages read and work without it.
;(() => {
  const root = document.documentElement
  const scriptUrl = document.currentScript ? document.currentScript.src : location.href
  const base = root.dataset.base || '/'
  const reduced = matchMedia('(prefers-reduced-motion: reduce)')

  const store = (k, v) => {
    try {
      if (v === undefined) return localStorage.getItem(k)
      if (v === null) localStorage.removeItem(k)
      else localStorage.setItem(k, v)
    } catch {}
    return null
  }

  // Theme: follows the system until you pick one. -------------------------------

  const systemLight = matchMedia('(prefers-color-scheme: light)')
  const theme = () => root.dataset.theme || (systemLight.matches ? 'light' : 'dark')

  const syncThemeButton = () => {
    const light = theme() === 'light'
    for (const b of document.querySelectorAll('[data-action="theme"]')) {
      b.setAttribute('aria-label', light ? 'Switch to the dark theme' : 'Switch to the light theme')
      b.title = light ? 'Dark theme' : 'Light theme'
    }
  }

  const toggleTheme = () => {
    const next = theme() === 'light' ? 'dark' : 'light'
    root.dataset.theme = next
    store('noodle-site-theme', next)
    syncThemeButton()
  }

  // Sections fade up once as they come into view. --------------------------------

  const setupFade = () => {
    const items = document.querySelectorAll('.fade')
    if (!items.length) return
    if (reduced.matches || !('IntersectionObserver' in window)) {
      items.forEach((el) => el.classList.add('in'))
      return
    }
    const io = new IntersectionObserver(
      (entries) => {
        for (const e of entries) {
          if (!e.isIntersecting) continue
          e.target.classList.add('in')
          io.unobserve(e.target)
        }
      },
      { rootMargin: '0px 0px -8% 0px' }
    )
    items.forEach((el) => io.observe(el))
  }

  // Command palette (Ctrl K). Keyboard first, no animation. ------------------------

  const go = (p) => base + p
  const ITEMS = [
    ['Home', 'Page', go('')],
    ['Features', 'Page', go('features/')],
    ['Skins', 'Page', go('skins/')],
    ['Compare with Chrome, Arc, Zen and Brave', 'Page', go('compare/')],
    ['Docs', 'Page', go('docs/')],
    ['Agents guide', 'Docs', go('docs/agents/')],
    ['Userscripts guide', 'Docs', go('docs/userscripts/')],
    ['Skins guide', 'Docs', go('docs/skins/')],
    ['FAQ', 'Page', go('faq/')],
    ['Privacy', 'Page', go('privacy/')],
    ['Download', 'Page', go('download/')],
    ['Split view', 'Feature', go('features/#split-view')],
    ['Canvas board', 'Feature', go('features/#canvas')],
    ['Media player', 'Feature', go('features/#player')],
    ['Reader view', 'Feature', go('features/#reader')],
    ['Agents and approvals', 'Feature', go('features/#agents')],
    ['Userscripts', 'Feature', go('features/#userscripts')],
    ['Source on GitHub', 'Link', 'https://github.com/udaysinh-git/noodle']
  ]

  let dialog, input, list, shown = [], sel = 0

  const render = () => {
    const q = input.value.trim().toLowerCase()
    shown = ITEMS.filter(([label, kind]) => `${label} ${kind}`.toLowerCase().includes(q))
    sel = 0
    list.innerHTML = shown.length
      ? shown.map(([label, kind], i) => `<li role="option" id="pal-${i}" data-i="${i}"><span>${label}</span><span class="kind">${kind}</span></li>`).join('')
      : '<li class="empty" role="presentation">Nothing matches that</li>'
    mark()
  }

  const mark = () => {
    for (const li of list.querySelectorAll('li[data-i]')) {
      const on = Number(li.dataset.i) === sel
      li.setAttribute('aria-selected', String(on))
      if (on) li.scrollIntoView({ block: 'nearest' })
    }
    if (shown.length) input.setAttribute('aria-activedescendant', `pal-${sel}`)
    else input.removeAttribute('aria-activedescendant')
  }

  const choose = (i) => {
    const item = shown[i]
    if (!item) return
    dialog.close()
    location.href = item[2]
  }

  const openPalette = () => {
    if (!dialog) {
      dialog = document.createElement('dialog')
      dialog.className = 'palette'
      dialog.setAttribute('aria-label', 'Go to a page')
      dialog.innerHTML = '<input type="text" role="combobox" aria-expanded="true" aria-controls="palette-list" aria-autocomplete="list" aria-label="Go to a page" placeholder="Go to a page" autocomplete="off" spellcheck="false"><ul id="palette-list" role="listbox" aria-label="Pages"></ul>'
      document.body.append(dialog)
      input = dialog.querySelector('input')
      list = dialog.querySelector('ul')
      input.addEventListener('input', render)
      input.addEventListener('keydown', (e) => {
        if ((e.key === 'ArrowDown' || e.key === 'ArrowUp') && shown.length) {
          e.preventDefault()
          sel = (sel + (e.key === 'ArrowDown' ? 1 : -1) + shown.length) % shown.length
          mark()
        } else if (e.key === 'Enter') {
          e.preventDefault()
          choose(sel)
        }
      })
      list.addEventListener('click', (e) => {
        const li = e.target.closest('li[data-i]')
        if (li) choose(Number(li.dataset.i))
      })
      dialog.addEventListener('click', (e) => {
        if (e.target === dialog) dialog.close()
      })
    }
    if (dialog.open) return
    input.value = ''
    render()
    dialog.showModal()
    input.focus()
  }

  addEventListener('keydown', (e) => {
    if ((e.ctrlKey || e.metaKey) && !e.altKey && e.key.toLowerCase() === 'k') {
      e.preventDefault()
      if (dialog && dialog.open) dialog.close()
      else openPalette()
    }
  })

  // Launch countdown in the footer. ------------------------------------------------

  const LAUNCH = Date.parse(root.dataset.launch || '')
  const pad = (n) => String(n).padStart(2, '0')

  // A calendar file made in the page, so nothing is asked of a server.
  const icsHref = () => {
    const stamp = (t) => new Date(t).toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '')
    const page = new URL(go('download/'), location.href).href
    const lines = [
      'BEGIN:VCALENDAR',
      'VERSION:2.0',
      'PRODID:-//Noodle//Launch//EN',
      'BEGIN:VEVENT',
      'UID:noodle-launch-0.1.0@noodle.udaysinh.me',
      `DTSTAMP:${stamp(Date.now())}`,
      `DTSTART:${stamp(LAUNCH)}`,
      `DTEND:${stamp(LAUNCH + 30 * 60 * 1000)}`,
      'SUMMARY:Noodle launches',
      `DESCRIPTION:Noodle 0.1.0 for Windows is out. Download it at ${page}`,
      `URL:${page}`,
      'END:VEVENT',
      'END:VCALENDAR'
    ]
    return 'data:text/calendar;charset=utf-8,' + encodeURIComponent(lines.join('\r\n') + '\r\n')
  }

  const goLive = () => {
    root.classList.add('launched')
    for (const a of document.querySelectorAll('[data-dl]')) {
      a.href = a.dataset.href
      a.removeAttribute('aria-disabled')
      const label = a.querySelector('[data-dl-label]')
      if (label) label.textContent = 'Download for Windows'
    }
    for (const el of document.querySelectorAll('[data-after-launch], [data-countdown] .cd-done')) el.hidden = false
  }

  const setupCountdown = () => {
    if (!Number.isFinite(LAUNCH)) return
    if (Date.now() >= LAUNCH) {
      goLive()
      return
    }
    const boxes = [...document.querySelectorAll('[data-countdown]')]
    const local = new Intl.DateTimeFormat(undefined, {
      weekday: 'long',
      day: 'numeric',
      month: 'long',
      hour: 'numeric',
      minute: '2-digit',
      timeZoneName: 'short'
    }).format(LAUNCH)
    for (const el of document.querySelectorAll('.cd-local')) el.textContent = `That's ${local} where you are.`
    for (const a of document.querySelectorAll('[data-ics]')) {
      a.href = icsHref()
      a.download = 'noodle-launch.ics'
      a.hidden = false
    }
    let lastMinute = -1
    const tick = () => {
      const left = LAUNCH - Date.now()
      if (left <= 0) {
        goLive()
        return
      }
      const total = Math.floor(left / 1000)
      const parts = { d: pad(Math.floor(total / 86400)), h: pad(Math.floor(total / 3600) % 24), m: pad(Math.floor(total / 60) % 60), s: pad(total % 60) }
      const minute = Math.floor(total / 60)
      for (const box of boxes) {
        for (const el of box.querySelectorAll('.cd-num')) {
          const v = parts[el.dataset.unit]
          if (el.textContent !== v) el.textContent = v
        }
        if (minute !== lastMinute) {
          const t = box.querySelector('[data-cd-text]')
          if (t) t.textContent = `${Number(parts.d)} days, ${Number(parts.h)} hours and ${Number(parts.m)} minutes to go.`
        }
      }
      lastMinute = minute
      setTimeout(tick, (left % 1000) + 15)
    }
    tick()
  }

  // The live CRT on the skins page (WebGPU, via vgpu). Only with WebGPU, motion
  // welcome, no data or battery saving, and after the first interaction. --------------

  const setupCrt = async () => {
    const canvas = document.querySelector('.fx-crt')
    if (!canvas || !('gpu' in navigator) || reduced.matches) return
    if (navigator.connection && navigator.connection.saveData) return
    try {
      if (navigator.getBattery) {
        const b = await navigator.getBattery()
        if (!b.charging && b.level < 0.3) return
      }
      if (!(await navigator.gpu.requestAdapter())) return
    } catch {
      return
    }
    await new Promise((resolve) => {
      const events = ['pointermove', 'pointerdown', 'scroll', 'keydown', 'touchstart']
      const once = () => {
        events.forEach((t) => removeEventListener(t, once))
        resolve()
      }
      events.forEach((t) => addEventListener(t, once, { passive: true }))
    })
    try {
      const mod = await import(new URL('fx.js', scriptUrl).href)
      await mod.crt(canvas, new URL(canvas.dataset.src, location.href).href)
    } catch (err) {
      console.info('[crt] off', err && err.message)
    }
  }

  // Wire up -------------------------------------------------------------------------

  syncThemeButton()
  document.addEventListener('click', (e) => {
    if (e.target.closest('[data-action="theme"]')) toggleTheme()
  })
  setupFade()
  setupCountdown()
  setupCrt()
})()
