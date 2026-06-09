// ── 設定 ──────────────────────────────────────────────
const PAPERS_URL = 'https://raw.githubusercontent.com/drblue-bot/medpapers/main/papers.json'

// ── State ─────────────────────────────────────────────
let allPapers = []
let filteredPapers = []
let activeTags = new Set()
let searchQuery = ''
let sortMode = localStorage.getItem('mp_sort') || 'added'
let currentDetailPaper = null

// ── DOM ───────────────────────────────────────────────
const appEl         = document.getElementById('app')
const syncBtn       = document.getElementById('sync-btn')
const searchInput   = document.getElementById('search-input')
const tagsScroll    = document.getElementById('tags-scroll')
const statusBar     = document.getElementById('status-bar')
const sortSelect    = document.getElementById('sort-select')
const paperList     = document.getElementById('paper-list')
const detailView    = document.getElementById('detail-view')
const detailContent = document.getElementById('detail-content')
const backBtn       = document.getElementById('back-btn')
const shareBtn      = document.getElementById('detail-share-btn')
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

// ── Search & Filter & Sort ────────────────────────────
searchInput.addEventListener('input', e => {
  searchQuery = e.target.value.trim().toLowerCase()
  applyFilters()
})

if (sortSelect) {
  sortSelect.value = sortMode
  sortSelect.addEventListener('change', e => {
    sortMode = e.target.value
    localStorage.setItem('mp_sort', sortMode)
    applyFilters()
  })
}

function sortPapers(papers) {
  const arr = [...papers]
  switch (sortMode) {
    case 'updated':
      return arr.sort((a, b) =>
        String(b.updated_at || '').localeCompare(String(a.updated_at || '')) ||
        (b.id || 0) - (a.id || 0))
    case 'year':
      return arr.sort((a, b) => (b.year || 0) - (a.year || 0) || (b.id || 0) - (a.id || 0))
    case 'title':
      return arr.sort((a, b) =>
        String(a.title_ja || a.title || '').localeCompare(String(b.title_ja || b.title || ''), 'ja'))
    case 'added':
    default:
      return arr.sort((a, b) => (b.id || 0) - (a.id || 0))
  }
}

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

  filteredPapers = sortPapers(papers)
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
      <div class="paper-title">${esc(paper.title_ja || paper.title || '無題')}</div>
      ${paper.title_ja ? `<div class="paper-title-en">${esc(paper.title)}</div>` : ''}
      <div class="paper-meta">${esc([paper.journal, paper.year, paper.authors?.split(',')[0]].filter(Boolean).join(' · '))}</div>
      <div class="paper-tags">${(paper.tags || []).map(t => `<span class="paper-tag">${esc(t)}</span>`).join('')}</div>`
    card.addEventListener('click', () => showDetail(paper))
    paperList.appendChild(card)
  })
}

// ── Detail View ───────────────────────────────────────
function showDetail(paper) {
  currentDetailPaper = paper
  appEl.style.display = 'none'
  detailView.style.display = 'flex'
  detailView.style.flexDirection = 'column'

  const hasSectionsCheck = Array.isArray(paper.abstract_sections) && paper.abstract_sections.length > 0
  let abstractLang = (hasSectionsCheck || paper.abstract_ja) ? 'ja' : 'en'

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
      { key: 'P', label: 'P', title: 'Patient（患者・対象）', value: jaOnly(pico.P) },
      { key: 'I', label: isPECO ? 'E' : 'I', title: isPECO ? 'Exposure（曝露）' : 'Intervention（介入）', value: jaOnly(isPECO ? (pico.E || pico.I) : pico.I) },
      { key: 'C', label: 'C', title: 'Comparison（対照）', value: jaOnly(pico.C) },
      { key: 'O', label: 'O', title: 'Outcome（アウトカム）', value: jaOnly(pico.O) },
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
      <div class="detail-title">${esc(paper.title_ja || paper.title || '無題')}</div>
      ${paper.title_ja ? `<div class="detail-title-en">${esc(paper.title)}</div>` : ''}
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

      ${paper.memo ? `
      <div class="section">
        <div class="section-title">📝 メモ</div>
        <div class="memo-body">${memoHtml(paper.memo)}</div>
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

// ── 共有 ──────────────────────────────────────────────
function buildShareText(paper) {
  const lines = []
  lines.push(`【${paper.title_ja || paper.title || '無題'}】`)
  if (paper.title_ja && paper.title) lines.push(paper.title)
  const meta = [paper.journal, paper.year, paper.authors].filter(Boolean).join(' · ')
  if (meta) lines.push(meta)
  if (paper.tags?.length) lines.push(paper.tags.join(' / '))

  const pico = paper.pico || {}
  const isPECO = pico.framework === 'PECO'
  const picoRows = [
    ['P', jaOnly(pico.P)],
    [isPECO ? 'E' : 'I', jaOnly(isPECO ? (pico.E || pico.I) : pico.I)],
    ['C', jaOnly(pico.C)],
    ['O', jaOnly(pico.O)],
  ].filter(([, v]) => v)
  if (picoRows.length) {
    lines.push('')
    lines.push(`[${pico.framework || 'PICO'}]`)
    picoRows.forEach(([k, v]) => lines.push(`${k}: ${v}`))
    const nntVal = paper.nnt ?? (pico.significant !== false ? pico.NNT : null)
    if (nntVal != null) lines.push(`NNT: ${nntVal}`)
  }

  const summary = paper.key_results || paper.abstract_ja
  if (summary) { lines.push(''); lines.push('要点:'); lines.push(summary) }

  if (paper.pmid) { lines.push(''); lines.push(`PubMed: https://pubmed.ncbi.nlm.nih.gov/${paper.pmid}/`) }
  return lines.join('\n')
}

if (shareBtn) {
  shareBtn.addEventListener('click', async () => {
    const paper = currentDetailPaper
    if (!paper) return
    const text = buildShareText(paper)
    const title = paper.title_ja || paper.title || 'MedPapers'
    // ネイティブ共有シート（iOS Safari等）
    if (navigator.share) {
      try {
        await navigator.share({ title, text })
        return
      } catch (e) {
        if (e && e.name === 'AbortError') return // ユーザーがキャンセル
      }
    }
    // フォールバック: クリップボードへコピー
    try {
      await navigator.clipboard.writeText(text)
      showToast('📋 コピーしました')
    } catch {
      showToast('共有に対応していません')
    }
  })
}

// ── Utils ─────────────────────────────────────────────
function esc(str) {
  return String(str ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

// 改行をbrタグに変換
function escNl(str) {
  return esc(str).replace(/\n/g, '<br>')
}

// メモ表示：リッチHTML（<を含む）はそのまま、旧プレーンは改行をbr化
function memoHtml(memo) {
  if (!memo) return ''
  return /<[a-z][\s\S]*>/i.test(memo) ? memo : escNl(memo)
}

// PICO値から末尾の英語括弧を除去: "日本語テキスト (English text)" → "日本語テキスト"
function jaOnly(str) {
  if (!str) return str
  // 最後の " (..." を除去（ネストした括弧も考慮）
  return str.replace(/\s*\([A-Za-z][^)]*(\([^)]*\)[^)]*)*\)\s*$/, '').trim()
}

// ── Start ─────────────────────────────────────────────
boot()
