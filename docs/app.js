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
    const isPECO = pico.framework === 'PECO'
    const hasPico = pico.P || pico.I || pico.C || pico.O
    const nntVal = paper.nnt ?? (pico.significant !== false ? pico.NNT : null)

    const hasSections = Array.isArray(paper.abstract_sections) && paper.abstract_sections.length > 0
    const hasJa = hasSections || !!paper.abstract_ja
    const hasEn = !!paper.abstract_en
    const hasAbstract = hasJa || hasEn

    // PICO rows
    const picoRows = [
      { key: 'P', label: 'P', title: 'Patient（患者・対象）', value: pico.P },
      { key: 'I', label: isPECO ? 'E' : 'I', title: isPECO ? 'Exposure（曝露）' : 'Intervention（介入）', value: isPECO ? (pico.E || pico.I) : pico.I },
      { key: 'C', label: 'C', title: 'Comparison（対照）', value: pico.C },
      { key: 'O', label: 'O', title: 'Outcome（アウトカム）', value: pico.O },
    ]

    // Abstract content by lang
    function abstractHtml(lang) {
      if (lang === 'ja') {
        if (hasSections) {
          return paper.abstract_sections.map(s =>
            `<div class="abstract-section-item">
              <div class="abstract-section-label">${esc(s.label)}</div>
              <div class="abstract-section-body">${escNl(s.content)}</div>
            </div>`
          ).join('')
        }
        return escNl(paper.abstract_ja || '（日本語訳なし）')
      } else {
        if (hasSections && paper.abstract_sections.some(s => s.content_en)) {
          return paper.abstract_sections.map(s =>
            `<div class="abstract-section-item">
              <div class="abstract-section-label">${esc(s.label_en || s.label)}</div>
              <div class="abstract-section-body">${escNl(s.content_en || s.content)}</div>
            </div>`
          ).join('')
        }
        return escNl(paper.abstract_en || '（アブストラクトなし）')
      }
    }

    detailContent.innerHTML = `
      <div class="detail-title">${esc(paper.title || '無題')}</div>
      <div class="detail-meta">${esc([paper.journal, paper.year].filter(Boolean).join(' · '))}<br>${esc(paper.authors || '')}</div>
      <div class="detail-tags">${(paper.tags || []).map(t => `<span class="paper-tag">${esc(t)}</span>`).join('')}</div>

      ${hasPico ? `
      <div class="section">
        <div class="section-title">🎯 ${esc(pico.framework || 'PICO')} フレームワーク</div>
        <div class="pico-box">
          ${picoRows.map(row => row.value ? `
          <div class="pico-row">
            <div class="pico-key">${row.label}</div>
            <div class="pico-content">
              <div class="pico-title">${row.title}</div>
              <div class="pico-value">${escNl(row.value)}</div>
            </div>
          </div>` : '').join('')}
          ${nntVal != null ? `
          <div class="pico-nnt">
            <span class="pico-nnt-label">NNT</span>
            <span class="pico-nnt-value">${esc(String(nntVal))}</span>
            <span class="pico-nnt-desc">Number Needed to Treat（治療必要数）</span>
          </div>` : ''}
        </div>
      </div>` : paper.key_results ? `
      <div class="section">
        <div class="section-title">🔑 主要結果</div>
        <div class="section-body">${escNl(paper.key_results)}</div>
      </div>` : ''}

      ${hasAbstract ? `
      <div class="section">
        <div class="section-title">アブストラクト</div>
        <div class="abstract-toggle">
          ${hasJa ? `<button class="abstract-tab ${abstractLang==='ja'?'active':''}" data-lang="ja">日本語</button>` : ''}
          ${hasEn ? `<button class="abstract-tab ${abstractLang==='en'?'active':''}" data-lang="en">English</button>` : ''}
        </div>
        <div class="abstract-body">${abstractHtml(abstractLang)}</div>
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
