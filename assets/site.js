// Noodle site. Loaded in <head> so the page transition hooks are in place before the
// first frame. Everything here is extra: the pages read and work without it.
;(() => {
  const root = document.documentElement
  const scriptUrl = document.currentScript ? document.currentScript.src : location.href
  const base = root.dataset.base || ''
  const reduced = matchMedia('(prefers-reduced-motion: reduce)')
  const canTransition = typeof document.startViewTransition === 'function'
  const ORDER = ['index', 'features', 'skins', 'developers', 'privacy', 'download']
  const store = {
    get: (k) => {
      try {
        return localStorage.getItem(k)
      } catch {
        return null
      }
    },
    set: (k, v) => {
      try {
        if (v === null) localStorage.removeItem(k)
        else localStorage.setItem(k, v)
      } catch {}
    }
  }

  // Cross-document transitions ------------------------------------------------

  const pageOf = (url) => {
    try {
      const name = new URL(url).pathname.split('/').pop().replace(/\.html$/, '')
      return name === '' ? 'index' : name
    } catch {
      return 'index'
    }
  }

  const inView = (el) => {
    const r = el.getBoundingClientRect()
    return r.bottom > 0 && r.top < innerHeight && r.width > 0
  }

  // A shared picture that is scrolled out of view would fly in from off screen, so
  // it sits the transition out and the page crossfades instead.
  const dropHiddenNames = () => {
    for (const el of document.querySelectorAll('.page-shot')) {
      el.style.viewTransitionName = inView(el) ? '' : 'none'
    }
  }

  addEventListener('pageswap', (e) => {
    if (e.viewTransition) dropHiddenNames()
  })

  addEventListener('pagereveal', (e) => {
    if (!e.viewTransition) return
    if (reduced.matches) {
      e.viewTransition.skipTransition()
      return
    }
    dropHiddenNames()
    const act = window.navigation && navigation.activation
    if (act && act.from && act.entry) {
      const from = ORDER.indexOf(pageOf(act.from.url))
      const to = ORDER.indexOf(pageOf(act.entry.url))
      const back = act.navigationType === 'traverse' ? to < from : from > to && to !== -1
      e.viewTransition.types?.add(back ? 'back' : 'forward')
    }
  })

  // Same-document transitions --------------------------------------------------

  // Runs update() inside a view transition when the browser has them and motion is
  // welcome. kind lands on <html data-vt> so CSS can pick the animation.
  const transition = (kind, update) => {
    if (!canTransition || reduced.matches) {
      update()
      return null
    }
    root.dataset.vt = kind
    const t = document.startViewTransition(update)
    t.finished.finally(() => {
      if (root.dataset.vt === kind) delete root.dataset.vt
    })
    return t
  }

  // Where a click happened, or the middle of the control when it came from the keyboard.
  const originOf = (e) => {
    if (e && e.detail > 0 && e.clientX + e.clientY > 0) return [e.clientX, e.clientY]
    const el = e && e.currentTarget
    if (el && el.getBoundingClientRect) {
      const r = el.getBoundingClientRect()
      return [r.left + r.width / 2, r.top + r.height / 2]
    }
    return [innerWidth / 2, innerHeight / 2]
  }

  const circleReveal = (e, update) => {
    const [x, y] = originOf(e)
    const t = transition('reveal', update)
    if (!t) return
    const r = Math.hypot(Math.max(x, innerWidth - x), Math.max(y, innerHeight - y))
    t.ready.then(() => {
      root.animate(
        { clipPath: [`circle(0px at ${x}px ${y}px)`, `circle(${r}px at ${x}px ${y}px)`] },
        { duration: 620, easing: 'cubic-bezier(0.22, 1, 0.36, 1)', pseudoElement: '::view-transition-new(root)' }
      )
    })
  }

  // Classic 98 draws itself in from the top in steps, like an old screen repainting.
  const wipeReveal = (update) => {
    const t = transition('reveal', update)
    if (!t) return
    t.ready.then(() => {
      root.animate(
        { clipPath: ['inset(0 0 100% 0)', 'inset(0 0 0 0)'] },
        { duration: 640, easing: 'steps(12, end)', pseudoElement: '::view-transition-new(root)' }
      )
    })
  }

  // Theme and skin -------------------------------------------------------------

  const systemLight = matchMedia('(prefers-color-scheme: light)')
  const currentTheme = () => root.dataset.theme || (systemLight.matches ? 'light' : 'dark')

  const setTheme = (e) => {
    const next = currentTheme() === 'light' ? 'dark' : 'light'
    circleReveal(e, () => {
      root.dataset.theme = next
      store.set('noodle-site-theme', next)
      syncControls()
    })
  }

  // Site skins ------------------------------------------------------------------

  const SKINS = ['noodle', '98', 'phosphor', 'paper']
  const currentSkin = () => root.dataset.skin || 'noodle'

  // Each skin arrives its own way: 98 repaints top down, Phosphor switches on like a
  // tube, Paper fades, and Noodle spreads out from where you clicked.
  const setSkin = (skin, e) => {
    if (!SKINS.includes(skin) || skin === currentSkin()) return
    const apply = () => {
      if (skin === 'noodle') delete root.dataset.skin
      else root.dataset.skin = skin
      store.set('noodle-site-skin', skin === 'noodle' ? null : skin)
      syncControls()
    }
    if (skin === '98') wipeReveal(apply)
    else if (skin === 'phosphor' || skin === 'paper') transition(skin, apply)
    else circleReveal(e, apply)
  }

  // The board ---------------------------------------------------------------------

  let lightbox = null
  let lastCard = null

  const buildLightbox = () => {
    lightbox = document.createElement('div')
    lightbox.className = 'lightbox'
    lightbox.hidden = true
    lightbox.setAttribute('role', 'dialog')
    lightbox.setAttribute('aria-modal', 'true')
    lightbox.setAttribute('aria-labelledby', 'lb-title')
    lightbox.innerHTML = `<div class="lightbox-panel">
<img alt="" width="1600" height="1002">
<div class="lightbox-body"><div><h2 id="lb-title"></h2><p></p></div>
<div class="lightbox-actions"><a class="btn btn-ghost" data-lb-more>Read more</a><button class="btn btn-primary" type="button" data-lb-close>Close</button></div></div>
</div>`
    document.body.append(lightbox)
    lightbox.addEventListener('click', (e) => {
      if (e.target === lightbox || e.target.closest('[data-lb-close]')) closeLightbox()
    })
    lightbox.addEventListener('keydown', (e) => {
      if (e.key === 'Tab') {
        const items = [...lightbox.querySelectorAll('a[href], button')]
        const i = items.indexOf(document.activeElement)
        e.preventDefault()
        items[(i + (e.shiftKey ? -1 : 1) + items.length) % items.length].focus()
      }
    })
  }

  const decoded = (img) => Promise.race([img.decode().catch(() => {}), new Promise((r) => setTimeout(r, 500))])

  const openLightbox = async (card) => {
    if (!lightbox) buildLightbox()
    lastCard = card
    const thumb = card.querySelector('img')
    const big = lightbox.querySelector('img')
    const full = new Image()
    full.src = card.dataset.full
    await decoded(full)
    thumb.style.viewTransitionName = 'lightbox-shot'
    const t = transition('board', async () => {
      thumb.style.viewTransitionName = ''
      big.src = full.src
      big.alt = card.dataset.alt || ''
      big.style.viewTransitionName = 'lightbox-shot'
      lightbox.querySelector('h2').textContent = card.dataset.title
      lightbox.querySelector('p').textContent = card.dataset.text
      lightbox.querySelector('[data-lb-more]').href = card.getAttribute('href')
      lightbox.hidden = false
      root.style.overflow = 'hidden'
      await decoded(big)
    })
    if (t) {
      t.finished.finally(() => (big.style.viewTransitionName = ''))
      await t.updateCallbackDone.catch(() => {})
    } else thumb.style.viewTransitionName = ''
    lightbox.querySelector('[data-lb-close]').focus()
  }

  const closeLightbox = () => {
    if (!lightbox || lightbox.hidden) return
    const big = lightbox.querySelector('img')
    const thumb = lastCard && lastCard.querySelector('img')
    big.style.viewTransitionName = 'lightbox-shot'
    const t = transition('board', () => {
      big.style.viewTransitionName = ''
      if (thumb) thumb.style.viewTransitionName = 'lightbox-shot'
      lightbox.hidden = true
      root.style.overflow = ''
    })
    const done = () => {
      big.style.viewTransitionName = ''
      if (thumb) thumb.style.viewTransitionName = ''
    }
    if (t) t.finished.finally(done)
    else done()
    if (lastCard) lastCard.focus({ preventScroll: true })
  }

  const setupBoard = (board) => {
    const small = matchMedia('(max-width: 700px)')
    let drag = null
    let z = 30

    board.addEventListener('pointerdown', (e) => {
      const card = e.target.closest('.card')
      if (!card || e.button !== 0 || small.matches || 'tidy' in board.dataset) return
      const [tx = 0, ty = 0] = (card.style.translate || '').split(' ').map((v) => parseFloat(v) || 0)
      drag = { card, sx: e.clientX, sy: e.clientY, tx, ty, moved: false, id: e.pointerId }
    })

    board.addEventListener('pointermove', (e) => {
      if (!drag || e.pointerId !== drag.id) return
      const dx = e.clientX - drag.sx
      const dy = e.clientY - drag.sy
      if (!drag.moved) {
        if (Math.hypot(dx, dy) < 5) return
        drag.moved = true
        drag.card.setPointerCapture(e.pointerId)
        drag.card.classList.add('dragging')
        drag.card.style.transition = ''
        drag.card.style.zIndex = String(++z)
      }
      drag.card.style.translate = `${drag.tx + dx}px ${drag.ty + dy}px`
    })

    // A card dropped past the edge springs back inside the board.
    const settle = (card) => {
      const b = board.getBoundingClientRect()
      const r = card.getBoundingClientRect()
      let [tx = 0, ty = 0] = card.style.translate.split(' ').map((v) => parseFloat(v) || 0)
      const pad = 8
      if (r.left < b.left + pad) tx += b.left + pad - r.left
      if (r.right > b.right - pad) tx -= r.right - (b.right - pad)
      if (r.top < b.top + pad) ty += b.top + pad - r.top
      if (r.bottom > b.bottom - pad) ty -= r.bottom - (b.bottom - pad)
      if (reduced.matches) card.style.transition = 'none'
      else card.style.transition = 'translate 520ms cubic-bezier(0.34, 1.4, 0.64, 1), rotate 420ms cubic-bezier(0.34, 1.4, 0.64, 1), scale 320ms cubic-bezier(0.34, 1.4, 0.64, 1)'
      card.style.translate = `${tx}px ${ty}px`
    }

    const end = (e) => {
      if (!drag || e.pointerId !== drag.id) return
      if (drag.moved) {
        drag.card.classList.remove('dragging')
        drag.card.dataset.dragged = ''
        settle(drag.card)
      }
      drag = null
    }
    board.addEventListener('pointerup', end)
    board.addEventListener('pointercancel', end)

    board.addEventListener('click', (e) => {
      const card = e.target.closest('.shot-card')
      if (!card) return
      e.preventDefault()
      if ('dragged' in card.dataset) {
        delete card.dataset.dragged
        return
      }
      openLightbox(card)
    })

    const tidyBtn = document.querySelector('[data-action="tidy"]')
    if (tidyBtn) {
      tidyBtn.addEventListener('click', () => {
        const cards = [...board.querySelectorAll('.card')]
        const tidy = !('tidy' in board.dataset)
        cards.forEach((c, i) => {
          c.style.viewTransitionName = `board-card-${i}`
          c.style.viewTransitionClass = 'board-card'
        })
        const t = transition('board', () => {
          if (tidy) board.dataset.tidy = ''
          else delete board.dataset.tidy
          for (const c of cards) {
            c.style.translate = ''
            c.style.transition = ''
          }
          tidyBtn.textContent = tidy ? 'Scatter' : 'Tidy up'
        })
        const done = () => cards.forEach((c) => (c.style.viewTransitionName = ''))
        if (t) t.finished.finally(done)
        else done()
      })
    }
  }

  const syncControls = () => {
    const skin = currentSkin()
    for (const b of document.querySelectorAll('[data-action="skin"]')) {
      b.setAttribute('aria-pressed', String(b.dataset.skin === skin))
    }
    const light = currentTheme() === 'light'
    for (const b of document.querySelectorAll('[data-action="theme"]')) {
      b.setAttribute('aria-label', light ? 'Switch to the dark theme' : 'Switch to the light theme')
      b.title = light ? 'Dark theme' : 'Light theme'
    }
  }

  // Galleries ------------------------------------------------------------------

  // Radio buttons pick the picture, so it works without this. Here the change is
  // undone for a moment and redone inside a view transition, once the new picture
  // has decoded, so the old frame and the new one both exist to animate between.
  const setupSwitch = (box) => {
    const kind = box.dataset.switch || 'stage'
    let lastPointer = 0
    box.addEventListener('pointerdown', () => (lastPointer = Date.now()))

    const panelFor = (input) => box.querySelector(`.panel[data-for="${input.value}"]`)
    const warm = (input) => {
      const img = panelFor(input)?.querySelector('img')
      if (img && img.loading === 'lazy') img.loading = 'eager'
      return img
    }

    box.addEventListener('pointerover', (e) => {
      const input = e.target.closest('label')?.querySelector('input')
      if (input) warm(input)
    })
    box.addEventListener('focusin', (e) => {
      if (e.target.matches('input')) warm(e.target)
    })

    let current = box.querySelector('input:checked')
    box.addEventListener('change', (e) => {
      const next = e.target
      if (!next.matches('input[type="radio"]')) return
      const prev = current
      current = next
      const fromPointer = Date.now() - lastPointer < 800
      if (!prev || !fromPointer || !canTransition || reduced.matches) return
      const img = warm(next)
      prev.checked = true
      // With the live CRT running, the shader plays its own power-on instead.
      if (kind === 'skin' && next.value === 'crt' && root.classList.contains('fx-crt-on')) {
        next.checked = true
        return
      }
      const vtKind = kind === 'skin' && next.value === 'crt' ? 'crt' : kind
      transition(vtKind, async () => {
        next.checked = true
        if (img) {
          await Promise.race([img.decode().catch(() => {}), new Promise((r) => setTimeout(r, 400))])
        }
      })
    })
  }

  // Command palette ----------------------------------------------------------

  const ICONS = {
    page: '<path d="M14 3H6a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V9z"/><path d="M14 3v6h6"/>',
    feature: '<rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/><rect x="14" y="14" width="7" height="7" rx="1"/>',
    action: '<path d="m13 2-9 12h8l-1 8 9-12h-8z"/>',
    link: '<path d="M15 3h6v6"/><path d="M10 14 21 3"/><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/>'
  }

  const href = (p) => base + p
  const ITEMS = [
    { label: 'Home', kind: 'Page', icon: 'page', go: href('./') },
    { label: 'Features', kind: 'Page', icon: 'page', go: href('features.html') },
    { label: 'Skins', kind: 'Page', icon: 'page', go: href('skins.html') },
    { label: 'For developers', kind: 'Page', icon: 'page', go: href('developers.html'), words: 'agents mcp scripts' },
    { label: 'Privacy', kind: 'Page', icon: 'page', go: href('privacy.html'), words: 'data encryption ads' },
    { label: 'Download', kind: 'Page', icon: 'page', go: href('download.html'), words: 'install windows' },
    { label: 'Spaces and the sidebar', kind: 'Feature', icon: 'feature', go: href('features.html#spaces') },
    { label: 'Split view', kind: 'Feature', icon: 'feature', go: href('features.html#split-view') },
    { label: 'Command palette', kind: 'Feature', icon: 'feature', go: href('features.html#palette') },
    { label: 'Canvas board', kind: 'Feature', icon: 'feature', go: href('features.html#canvas') },
    { label: 'Downloads', kind: 'Feature', icon: 'feature', go: href('features.html#downloads') },
    { label: 'Video downloader', kind: 'Feature', icon: 'feature', go: href('features.html#video') },
    { label: 'Media player', kind: 'Feature', icon: 'feature', go: href('features.html#player') },
    { label: 'Older video formats', kind: 'Feature', icon: 'feature', go: href('features.html#older-formats'), words: 'avi mpeg xvid wmv flv' },
    { label: 'Image viewer and editor', kind: 'Feature', icon: 'feature', go: href('features.html#images') },
    { label: 'Reader view', kind: 'Feature', icon: 'feature', go: href('features.html#reader') },
    { label: 'Modes', kind: 'Feature', icon: 'feature', go: href('features.html#modes'), words: 'battery performance elegance' },
    { label: 'Agents and approvals', kind: 'Feature', icon: 'feature', go: href('features.html#agents'), words: 'mcp ai' },
    { label: 'Userscripts', kind: 'Feature', icon: 'feature', go: href('features.html#userscripts'), words: 'tampermonkey violentmonkey' },
    { label: 'Switch theme', kind: 'Action', icon: 'action', run: (e) => setTheme(e), words: 'dark light' },
    { label: 'Skin: Noodle', kind: 'Action', icon: 'action', run: (e) => setSkin('noodle', e), words: 'default' },
    { label: 'Skin: Classic 98', kind: 'Action', icon: 'action', run: (e) => setSkin('98', e), words: 'windows retro' },
    { label: 'Skin: Phosphor', kind: 'Action', icon: 'action', run: (e) => setSkin('phosphor', e), words: 'green crt terminal' },
    { label: 'Skin: Paper', kind: 'Action', icon: 'action', run: (e) => setSkin('paper', e), words: 'grey e-ink calm' },
    { label: 'Source on GitHub', kind: 'Link', icon: 'link', go: 'https://github.com/udaysinh-git/noodle' }
  ]

  let dialog, input, list, shown = [], sel = 0

  const buildPalette = () => {
    dialog = document.createElement('dialog')
    dialog.className = 'palette'
    dialog.setAttribute('aria-label', 'Go to')
    dialog.innerHTML = `<div class="palette-field">
<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5"/></svg>
<input type="text" role="combobox" aria-expanded="true" aria-controls="palette-list" aria-autocomplete="list" placeholder="Go to a page, feature or action" autocomplete="off" spellcheck="false">
</div>
<ul id="palette-list" role="listbox" aria-label="Results"></ul>
<div class="palette-foot" aria-hidden="true"><span><kbd>&uarr;</kbd> <kbd>&darr;</kbd> to move</span><span><kbd>Enter</kbd> to open</span><span><kbd>Esc</kbd> to close</span></div>`
    document.body.append(dialog)
    input = dialog.querySelector('input')
    list = dialog.querySelector('ul')
    input.addEventListener('input', render)
    input.addEventListener('keydown', (e) => {
      if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
        e.preventDefault()
        if (!shown.length) return
        sel = (sel + (e.key === 'ArrowDown' ? 1 : -1) + shown.length) % shown.length
        mark()
      } else if (e.key === 'Enter') {
        e.preventDefault()
        if (shown[sel]) choose(shown[sel], e)
      }
    })
    list.addEventListener('pointermove', (e) => {
      const li = e.target.closest('li[data-i]')
      if (li && Number(li.dataset.i) !== sel) {
        sel = Number(li.dataset.i)
        mark()
      }
    })
    list.addEventListener('click', (e) => {
      const li = e.target.closest('li[data-i]')
      if (li) choose(shown[Number(li.dataset.i)], e)
    })
    dialog.addEventListener('click', (e) => {
      if (e.target === dialog) dialog.close()
    })
  }

  const score = (item, q) => {
    const hay = `${item.label} ${item.kind} ${item.words || ''}`.toLowerCase()
    if (!q) return 1
    if (item.label.toLowerCase().startsWith(q)) return 3
    if (hay.includes(q)) return 2
    let i = 0
    for (const ch of hay) if (ch === q[i]) i++
    return i === q.length ? 1 : 0
  }

  function render() {
    const q = input.value.trim().toLowerCase()
    shown = ITEMS.map((it) => [it, score(it, q)])
      .filter(([, s]) => s > 0)
      .sort((a, b) => b[1] - a[1])
      .map(([it]) => it)
    sel = 0
    list.innerHTML = shown.length
      ? shown
          .map(
            (it, i) =>
              `<li role="option" id="pal-${i}" data-i="${i}"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${ICONS[it.icon]}</svg><span>${it.label}</span><span class="kind">${it.kind}</span></li>`
          )
          .join('')
      : '<li class="empty" role="presentation">Nothing matches that</li>'
    mark()
  }

  function mark() {
    for (const li of list.querySelectorAll('li[data-i]')) {
      const on = Number(li.dataset.i) === sel
      li.setAttribute('aria-selected', String(on))
      if (on) li.scrollIntoView({ block: 'nearest' })
    }
    if (shown.length) input.setAttribute('aria-activedescendant', `pal-${sel}`)
    else input.removeAttribute('aria-activedescendant')
  }

  function choose(item, e) {
    dialog.close()
    if (item.run) item.run(e)
    else if (/^https?:/.test(item.go)) location.href = item.go
    else location.href = new URL(item.go, location.href).href
  }

  const openPalette = () => {
    if (!dialog) buildPalette()
    if (dialog.open) return
    input.value = ''
    render()
    dialog.showModal()
    input.focus()
  }

  addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && lightbox && !lightbox.hidden) {
      closeLightbox()
      return
    }
    if ((e.ctrlKey || e.metaKey) && !e.altKey && e.key.toLowerCase() === 'k') {
      e.preventDefault()
      if (dialog && dialog.open) dialog.close()
      else openPalette()
    }
  })

  // Launch countdown -----------------------------------------------------------

  const LAUNCH = Date.parse(root.dataset.launch || '')
  let heroFx = null

  const pad = (n) => String(n).padStart(2, '0')

  // Each digit sits in its own cell; a changed digit slides in over the old one.
  const setDigits = (el, text, animate) => {
    if (!el.firstElementChild || !el.firstElementChild.classList.contains('cd-d')) el.textContent = ''
    while (el.children.length < text.length) {
      const cell = document.createElement('span')
      cell.className = 'cd-d'
      el.append(cell)
    }
    while (el.children.length > text.length) el.lastElementChild.remove()
    ;[...text].forEach((ch, i) => {
      const cell = el.children[i]
      const cur = [...cell.children].filter((c) => !c.classList.contains('out')).pop()
      if (cur && cur.textContent === ch) return
      const span = document.createElement('span')
      span.textContent = ch
      if (cur && animate) {
        cur.className = 'out'
        cur.addEventListener('animationend', () => cur.remove(), { once: true })
        span.className = 'in'
      } else if (cur) cur.remove()
      cell.append(span)
    })
  }

  // A calendar file made in the page, so nothing is asked of a server.
  const icsHref = () => {
    const stamp = (t) => new Date(t).toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '')
    const page = new URL(base + 'download.html', location.href).href
    const lines = [
      'BEGIN:VCALENDAR',
      'VERSION:2.0',
      'PRODID:-//Noodle//Launch//EN',
      'CALSCALE:GREGORIAN',
      'BEGIN:VEVENT',
      'UID:noodle-launch-0.1.0@udaysinh-git.github.io',
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
    for (const box of boxes) {
      const el = box.querySelector('.cd-local')
      if (el) el.textContent = `That's ${local} where you are.`
    }
    for (const a of document.querySelectorAll('[data-ics]')) {
      a.href = icsHref()
      a.download = 'noodle-launch.ics'
      a.hidden = false
    }

    let first = true
    let lastMinute = -1
    const tick = () => {
      const left = LAUNCH - Date.now()
      if (left <= 0) {
        transition('launch', goLive)
        return
      }
      const total = Math.floor(left / 1000)
      const parts = {
        d: pad(Math.floor(total / 86400)),
        h: pad(Math.floor(total / 3600) % 24),
        m: pad(Math.floor(total / 60) % 60),
        s: pad(total % 60)
      }
      const animate = !first && !reduced.matches
      const minute = Math.floor(total / 60)
      for (const box of boxes) {
        for (const el of box.querySelectorAll('.cd-num')) setDigits(el, parts[el.dataset.unit], animate)
        if (minute !== lastMinute) {
          const t = box.querySelector('[data-cd-text]')
          if (t) t.textContent = `${Number(parts.d)} days, ${Number(parts.h)} hours and ${Number(parts.m)} minutes to go.`
        }
      }
      lastMinute = minute
      if (!first && heroFx) heroFx.pulse()
      first = false
      setTimeout(tick, (left % 1000) + 15)
    }
    tick()
  }

  // WebGPU effects ---------------------------------------------------------------

  // Only on devices with WebGPU, when motion is welcome and nothing asks to save
  // power or data. The module is fetched once the page has settled.
  const fxAllowed = async () => {
    if (!('gpu' in navigator) || reduced.matches) return false
    if (navigator.connection && navigator.connection.saveData) return false
    try {
      if (navigator.getBattery) {
        const b = await navigator.getBattery()
        if (!b.charging && b.level < 0.3) return false
      }
    } catch {}
    return true
  }

  const setupFx = async () => {
    const hero = document.querySelector('.hero-fx')
    const crtCanvas = document.querySelector('.fx-crt')
    if (!hero && !crtCanvas) return
    if (!(await fxAllowed())) return
    // No adapter (blocklisted GPU, headless, remote desktop): keep the still fallback
    // and skip downloading the effects at all.
    try {
      if (!(await navigator.gpu.requestAdapter())) return
    } catch {
      return
    }
    const idle = window.requestIdleCallback || ((cb) => setTimeout(cb, 300))
    idle(
      async () => {
        let mod
        try {
          mod = await import(new URL('fx.js', scriptUrl).href)
        } catch (err) {
          console.warn('[fx] not loaded', err)
          return
        }
        if (hero) {
          try {
            heroFx = await mod.strands(hero)
            root.classList.add('fx-hero')
          } catch (err) {
            console.warn('[fx] strands off', err)
          }
        }
        if (crtCanvas) {
          try {
            await mod.crt(crtCanvas, new URL(crtCanvas.dataset.src, location.href).href)
            root.classList.add('fx-crt-on')
          } catch (err) {
            console.warn('[fx] crt off', err)
          }
        }
      },
      { timeout: 1500 }
    )
  }

  // Wire up ----------------------------------------------------------------------

  const ready = () => {
    syncControls()
    document.addEventListener('click', (e) => {
      const b = e.target.closest('[data-action]')
      if (!b) return
      const action = b.dataset.action
      if (action === 'theme') setTheme({ detail: e.detail, clientX: e.clientX, clientY: e.clientY, currentTarget: b })
      else if (action === 'skin') setSkin(b.dataset.skin, { detail: e.detail, clientX: e.clientX, clientY: e.clientY, currentTarget: b })
      else if (action === 'palette') openPalette()
    })
    for (const box of document.querySelectorAll('[data-switch]')) setupSwitch(box)
    for (const board of document.querySelectorAll('[data-board]')) setupBoard(board)
    setupCountdown()
    setupFx()
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', ready)
  else ready()
})()
