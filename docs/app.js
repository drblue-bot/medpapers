// ── 設定 ──────────────────────────────────────────────
const PAPERS_URL = 'https://raw.githubusercontent.com/drblue-bot/medpapers/main/papers.json'

// ── State ─────────────────────────────────────────────
let allPapers = []
let filteredPapers = []
let activeTags = new Set()
let searchQuery = ''

// ── DOM ───────────────────────────────────────────────
const appEl         = document.getElementById('app')
const syncBtn       = document.getElementById('sync-btn')
const searchInput   = document.getElementById('search-input')
const tagsScroll    = document.getElementById('tags-scroll')
const statusBar     = document.getElementById('status-bar')
const paperList     = document.getElementById('paper-list')
const detailView    = document.getElementById('detail-view')
const detailContent = document.getElementById('detail-content')
const backBtn       = document.getElementById('back-btn')
const toast         = document.getElementById('toast')

// ── Service Worker ────────────────────────────────────
if ('serviceWorker' in navigator) {
  navigator.serviceWorker.register('./sw.js').catch(() => {})
}

// ── Toast ─────────────────────────────────────────────
let toastTimer
function showToast(msg) {
  toast.textContent = msg
  toast.classList.add('show')
  clearTimeout(toastTimer)
  toastTimer = setTimeout(() => toast.classList.remove('show'), 2500)
}

// ── Fetch papers.json ─────────────────────────────────
async function fetchPapers() {
  const res = await fetch(PAPERS_URL + '?t=' + Date.now())
  if (!res.ok) throw new Error(`HTTP ${res.status}`)
  return res.json()
}

// ── Boot ──────────────────────────────────────────────
async function boot() {
  // キャッシュがあれば先に表示
  const cached = localStorage.getItem('mp_papers')
  const cachedAt = localStorage.getItem('mp_exported_at')
  if (cached) {
    try {
      allPapers = JSON.parse(cached)
      renderTags()
      applyFilters()
      if (cachedAt) {
        statusBar.textContent = `${allPapers.length}件 · キャッシュ: ${fmtDate(cachedAt)}`
      }
    } catch {}
  }

  // バックグラウンドで最新を取得
  try {
    const data = await fetchPapers()
    allPapers = data.papers || []
    localStorage.setItem('mp_papers', JSON.stringify(allPapers))
    localStorage.setItem('mp_exported_at', data.exported_at)
    renderTags()
    applyFilters()
    statusBar.textContent = `${allPapers.length}件 · 更新: ${fmtDate(data.exported_at)}`
  } catch {
    if (!cached) {
      statusBar.textContent = 'オフライン · データなし'
    } else {
      statusBar.textContent = `${allPapers.length}件 · オフライン（キャッシュ表示中）`
    }
  }
}

function fmtDate(iso) {
  return new Date(iso).toLocaleString('ja-JP', {
    month: 'numeric', day: 'numeric',
    hour: '2-digit', minute: '2-digit'
  })
}

// ── 手動同期 ──────────────────────────────────────────
syncBtn.addEventListener('click', async () => {
  syncBtn.textContent = '⏳'
  syncBtn.disabled = true
  try {
    const data = await fetchPapers()
    allPapers = data.papers || []
    localStorage.setItem('mp_papers', JSON.stringify(allPapers))
    localStorage.setItem('mp_exported_at', data.exported_at)
    renderTags()
    applyFilters()
    statusBar.textContent = `${allPapers.length}件 · 更新: ${fmtDate(data.exported_at)}`
    showToast('✅ 同期完了')
  } catch {
    showToast('❌ 同期失敗（オフライン？）')
  } finally {
    syncBtn.textContent = '🔄'
    syncBtn.disabled = false
  }
})

// ── Search & Filter ───────────────────────────────────
searchInput.addEventListener('input', e => {
  searchQuery = e.target.value.trim().toLowerCase()
  applyFilters()
})

function applyFilters() {
  let papers = allPapers

  if (activeTags.size > 0) {
    papers = papers.filter(p =>
      [...activeTags].every(t => (p.tags || []).includes(t))
    )
  }

  if (searchQuery) {
    papers = papers.filter(p =>
      [p.title, p.authors, p.abstract_en, p.abstract_ja, p.journal]
        .filter(Boolean)
        .some(s => s.toLowerCase().includes(searchQuery))
    )
  }

  filteredPapers = papers
  renderList()
}

// ── Tags ──────────────────────────────────────────────
function renderTags() {
  const tagCounts = {}
  allPapers.forEach(p => (p.tags || []).forEach(t => {
    tagCounts[t] = (tagCounts[t] || 0) + 1
  }))
  const sorted = Object.entries(tagCounts).sort((a, b) => b[1] - a[1])

  tagsScroll.innerHTML = ''
  sorted.forEach(([tag]) => {
    const chip = document.createElement('button')
    chip.className = 'tag-chip' + (activeTags.has(tag) ? ' active' : '')
    chip.textContent = tag
    chip.addEventListener('click', () => {
      if (activeTags.has(tag)) activeTags.delete(tag)
      else activeTags.add(tag)
      renderTags()
      applyFilters()
    })
    tagsScroll.appendChild(chip)
  })
}

// ── Paper List ────────────────────────────────────────
function renderList() {
  if (filteredPapers.length === 0) {
    paperList.innerHTML = `
      <div class="empty-state">
        <div class="empty-state-icon">🔍</div>
        <div class="empty-state-title">${allPapers.length === 0 ? 'まだ論文がありません' : '該当する論文なし'}</div>
        <div>${allPapers.length === 0 ? 'MacのMedPapersでPDFを追加してください' : '検索条件を変更してみてください'}</div>
      </div>`
    return
  }

  paperList.innerHTML = ''
  filteredPapers.forEach(paper => {
    const card = document.createElement('div')
    card.className = 'paper-card'
    card.innerHTML = `
      <div class="paper-title">${esc(paper.title || '無題')}</div>
      <div class="paper-meta">${esc([paper.journal, paper.year, paper.authors?.split(',')[0]].filter(Boolean).join(' · '))}</div>
      <div class="paper-tags">${(paper.tags || []).map(t => `<span class="paper-tag">${esc(t)}</span>`).join('')}</div>`
    card.addEventListener('click', () => showDetail(paper))
    paperList.appendChild(card)
  })
}

// ── Detail View ───────────────────────────────────────
function showDetail(paper) {
  appEl.style.display = 'none'
  detailView.style.display = 'flex'
  detailView.style.flexDirection = 'column'

  let abstractLang = paper.abstract_ja ? 'ja' : 'en'

  function renderDetail() {
    const pico = paper.pico || {}
    const hasJa = !!paper.abstract_ja
    const hasEn = !!paper.abstract_en
    const abstract = abstractLang === 'ja'
      ? (paper.abstract_ja || paper.abstract_en || '')
      : (paper.abstract_en || paper.abstract_ja || '')

    detailContent.innerHTML = `
      <div class="detail-title">${esc(paper.title || '無題')}</div>
      <div class="detail-meta">${esc([paper.journal, paper.year].filter(Boolean).join(' · '))}<br>${esc(paper.authors || '')}</div>
      <div class="detail-tags">${(paper.tags || []).map(t => `<span class="paper-tag">${esc(t)}</span>`).join('')}</div>

      ${(pico.P || pico.I || pico.C || pico.O) ? `
      <div class="section">
        <div class="section-title">PICO</div>
        <div class="pico-grid">
          ${pico.P ? `<div class="pico-item"><div class="pico-label">P — Patient</div><div class="pico-value">${esc(pico.P)}</div></div>` : ''}
          ${pico.I ? `<div class="pico-item"><div class="pico-label">I — Intervention</div><div class="pico-value">${esc(pico.I)}</div></div>` : ''}
          ${pico.C ? `<div class="pico-item"><div class="pico-label">C — Comparison</div><div class="pico-value">${esc(pico.C)}</div></div>` : ''}
          ${pico.O ? `<div class="pico-item"><div class="pico-label">O — Outcome</div><div class="pico-value">${esc(pico.O)}</div></div>` : ''}
        </div>
      </div>` : ''}

      ${paper.key_results ? `
      <div class="section">
        <div class="section-title">主要結果</div>
        <div class="section-body">${escNl(paper.key_results)}</div>
      </div>` : ''}

      ${paper.nnt ? `
      <div class="section">
        <div class="section-title">NNT</div>
        <div class="section-body" style="font-size:22px;font-weight:700;color:var(--blue)">${esc(String(paper.nnt))}</div>
      </div>` : ''}

      ${(hasJa || hasEn) ? `
      <div class="section">
        <div class="section-title">アブストラクト</div>
        ${(hasJa && hasEn) ? `
        <div class="abstract-toggle">
          <button class="abstract-tab ${abstractLang==='ja'?'active':''}" data-lang="ja">日本語</button>
          <button class="abstract-tab ${abstractLang==='en'?'active':''}" data-lang="en">English</button>
        </div>` : ''}
        <div class="section-body">${escNl(abstract)}</div>
      </div>` : ''}
    `

    detailContent.querySelectorAll('.abstract-tab').forEach(btn => {
      btn.addEventListener('click', () => {
        abstractLang = btn.dataset.lang
        renderDetail()
      })
    })
  }

  renderDetail()
}

backBtn.addEventListener('click', () => {
  detailView.style.display = 'none'
  appEl.style.display = 'flex'
})

// ── Utils ─────────────────────────────────────────────
function esc(str) {
  return String(str ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

// 改行をbrタグに変換（アブスト・key_results用）
function escNl(str) {
  return esc(str).replace(/\n/g, '<br>')
}

// ── Start ─────────────────────────────────────────────
boot()
