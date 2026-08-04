// The layer injected into the page: caption bar + spotlight (frame + dimmed background + bubble).
//
// ⚠ WHY INTO THE PAGE, rather than onto the video afterwards: this way the caption moves WITH
// the picture, so the timing after pace control (`speedUp`) does not have to be recomputed —
// and that is exactly the point where captioning usually drifts, in a way nobody notices when
// watching the finished video.
//
// ⚠ `playwright-recast`'s `highlight()`/`markClick()` helpers could do the same, BUT only
// inside the Playwright test runner: they write `test.step` annotations and, without `_step`,
// SILENTLY do nothing. Call them outside the runner and you get a green run with zero effect.

/**
 * @param {{ mobile: boolean, leftOffset: number, rightOffset: number }} opts
 *   The bar is aligned to the CROPPED region, not to the viewport — otherwise the start and
 *   end of the caption disappear along with the crop (measured). The caller can compute this,
 *   the scenario author cannot: they write the text, not the geometry.
 */
export function overlayScript({ mobile = false, leftOffset = 0, rightOffset = 0 } = {}) {
  const m = (mobileValue, desktopValue) => (mobile ? mobileValue : desktopValue)
  return `
(() => {
  const setupCaption = () => {
    if (document.getElementById('__demo_caption')) return
    const s = document.createElement('style')
    s.textContent = \`
      #__demo_caption{position:fixed;left:${leftOffset}px;right:${rightOffset}px;bottom:0;z-index:2147483645;
        pointer-events:none;padding:${m(10, 14)}px ${m(14, 22)}px;
        font:500 ${m(13, 17)}px/1.4 system-ui,-apple-system,sans-serif;
        color:#fff;background:linear-gradient(to top,rgba(9,9,11,.94) 60%,rgba(9,9,11,0));
        opacity:0;transition:opacity .3s ease;text-shadow:0 1px 2px rgba(0,0,0,.6)}
      #__demo_caption.on{opacity:1}
      #__demo_caption b{display:block;font-weight:700;font-size:${m(14, 18)}px;margin-bottom:2px}
    \`
    document.head.appendChild(s)
    const d = document.createElement('div')
    d.id = '__demo_caption'
    document.body.appendChild(d)
  }
  if (document.body) setupCaption(); else document.addEventListener('DOMContentLoaded', setupCaption)

  window.__demoCaption = (title, text) => {
    setupCaption()
    const d = document.getElementById('__demo_caption')
    if (!d) return
    d.innerHTML = title ? '<b>' + title + '</b>' + (text || '') : (text || '')
    d.classList.toggle('on', !!(title || text))
  }

  // Spotlight: a frame around the area + a dimmed background + a short text beside it.
  // The dimming is the established "spotlight" idiom: one huge box-shadow AROUND the element.
  window.__demoSpotlight = (box, text) => {
    setupSpotlight()
    const frame = document.getElementById('__demo_frame')
    const bubble = document.getElementById('__demo_bubble')
    if (!frame || !bubble) return
    if (!box) { frame.classList.remove('on'); bubble.classList.remove('on'); return }
    frame.style.transform = 'translate(' + (box.x - 4) + 'px,' + (box.y - 4) + 'px)'
    frame.style.width = (box.w + 8) + 'px'
    frame.style.height = (box.h + 8) + 'px'
    frame.classList.add('on')
    if (!text) { bubble.classList.remove('on'); return }
    bubble.textContent = text
    bubble.classList.add('on')
    // Show it first so it has a measurable size, then position it.
    const bb = bubble.getBoundingClientRect()
    const below = box.y + box.h + 14
    const above = box.y - bb.height - 14
    // Put it below if it fits there, otherwise above — so it never runs off the picture.
    const y = below + bb.height < window.innerHeight - 90 ? below : Math.max(8, above)
    const x = Math.min(Math.max(8, box.x + box.w / 2 - bb.width / 2), window.innerWidth - bb.width - 8)
    bubble.style.transform = 'translate(' + Math.round(x) + 'px,' + Math.round(y) + 'px)'
  }

  // ACTION marker: what we are doing to the UI, not just where.
  //
  // NO BACKTICK IN THIS BLOCK — not in code, not in COMMENTS. The whole IIFE is the inside of
  // a template literal, so a single backtick closes the string and the error surfaces at a
  // COMPLETELY DIFFERENT point in the file ("Unexpected identifier"). Hit twice.
  //
  // The clickEffect ripple comes from the trace, so it only shows REAL mouse clicks. Typing,
  // key presses and scrolling leave NO TRACE on the recording: the field value simply appears,
  // as if it had happened by itself. The viewer sees the PLACE, not the ACTION.
  //
  // The ring is deliberately a DIFFERENT colour (rose) from the spotlight (teal): the two say
  // two different things - "look here" vs "this is what I am doing". One colour would merge them.
  window.__demoAction = (box, kind, text, withRing) => {
    setupAction()
    const ring = document.getElementById('__demo_ring')
    const chip = document.getElementById('__demo_action')
    if (!ring || !chip) return
    if (!box) { ring.classList.remove('on'); chip.classList.remove('on'); return }
    if (withRing !== false) {
      const size = Math.max(34, Math.min(box.w, box.h) + 16)
      ring.style.width = size + 'px'; ring.style.height = size + 'px'
      ring.style.transform = 'translate(' + Math.round(box.x + box.w / 2 - size / 2) + 'px,' +
        Math.round(box.y + box.h / 2 - size / 2) + 'px)'
      ring.classList.remove('on'); void ring.offsetWidth; ring.classList.add('on')
    } else {
      ring.classList.remove('on')
    }
    if (!text && !kind) { chip.classList.remove('on'); return }
    chip.innerHTML = (kind ? '<i>' + kind + '</i>' : '') + (text || '')
    chip.classList.add('on')
    const bb = chip.getBoundingClientRect()
    // The label goes ABOVE the box if it fits: the typed value appears inside the field
    // itself, so placing the label below would cover its own result.
    const above = box.y - bb.height - 12
    const y = above > 8 ? above : Math.min(box.y + box.h + 12, window.innerHeight - bb.height - 90)
    const x = Math.min(Math.max(8, box.x + box.w / 2 - bb.width / 2), window.innerWidth - bb.width - 8)
    chip.style.transform = 'translate(' + Math.round(x) + 'px,' + Math.round(y) + 'px)'
  }

  function setupAction() {
    if (document.getElementById('__demo_ring')) return
    const s = document.createElement('style')
    s.textContent = \`
      @keyframes __demo_pulse{0%{transform:scale(.55);opacity:0}
        35%{opacity:1}100%{transform:scale(1.9);opacity:0}}
      #__demo_ring{position:fixed;left:0;top:0;z-index:2147483646;pointer-events:none;
        border-radius:50%;border:3px solid #e11d48;box-shadow:0 0 0 3px rgba(225,29,72,.22);
        opacity:0}
      #__demo_ring.on{opacity:1}
      #__demo_ring.on::after{content:'';position:absolute;inset:-3px;border-radius:50%;
        border:3px solid #e11d48;animation:__demo_pulse 1.1s ease-out infinite}
      #__demo_action{position:fixed;left:0;top:0;z-index:2147483646;pointer-events:none;
        max-width:${m(280, 420)}px;padding:${m(6, 8)}px ${m(10, 13)}px;border-radius:8px;
        background:#e11d48;color:#fff;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;
        font:600 ${m(12, 15)}px/1.3 ui-monospace,SFMono-Regular,Menlo,monospace;
        box-shadow:0 4px 14px rgba(0,0,0,.35);
        opacity:0;transition:opacity .2s ease,transform .3s cubic-bezier(.22,.61,.36,1)}
      #__demo_action.on{opacity:1}
      #__demo_action i{font-style:normal;margin-right:6px;opacity:.9}
    \`
    document.head.appendChild(s)
    const ring = document.createElement('div'); ring.id = '__demo_ring'
    const chip = document.createElement('div'); chip.id = '__demo_action'
    document.body.append(ring, chip)
  }

  function setupSpotlight() {
    if (document.getElementById('__demo_frame')) return
    const s = document.createElement('style')
    s.textContent = \`
      #__demo_frame{position:fixed;left:0;top:0;z-index:2147483644;pointer-events:none;
        border:3px solid #0d9488;border-radius:9px;box-shadow:0 0 0 9999px rgba(9,9,11,.46);
        opacity:0;transition:opacity .28s ease,transform .35s cubic-bezier(.22,.61,.36,1)}
      #__demo_frame.on{opacity:1}
      #__demo_bubble{position:fixed;left:0;top:0;z-index:2147483646;pointer-events:none;
        max-width:${m(300, 420)}px;padding:${m(7, 9)}px ${m(11, 14)}px;border-radius:9px;
        background:#0d9488;color:#fff;
        font:600 ${m(12, 15)}px/1.35 system-ui,-apple-system,sans-serif;
        box-shadow:0 4px 14px rgba(0,0,0,.35);
        opacity:0;transition:opacity .28s ease,transform .35s cubic-bezier(.22,.61,.36,1)}
      #__demo_bubble.on{opacity:1}
    \`
    document.head.appendChild(s)
    const frame = document.createElement('div'); frame.id = '__demo_frame'
    const bubble = document.createElement('div'); bubble.id = '__demo_bubble'
    document.body.append(frame, bubble)
  }
})()
`
}

export const escapeHtml = (s) =>
  String(s ?? "").replace(/[&<>]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;" })[c])
