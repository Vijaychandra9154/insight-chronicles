import { useRouter } from 'next/router'
import { useState } from 'react'
import useSWR from 'swr'
import axios from 'axios'
import { forumLabel } from '../../lib/forums'

const fetcher = (url) => axios.get(url).then((r) => r.data)

const LANGUAGES = [
  { code: 'en', label: 'English' },
  { code: 'hi-IN', label: 'हिंदी' },
  { code: 'te-IN', label: 'తెలుగు' },
]

const VERIFY_PATTERN = /(\[VERIFY:[^\]]*\])/g

function renderWithHighlights(text) {
  return text.split(VERIFY_PATTERN).map((part, i) =>
    VERIFY_PATTERN.test(part) ? (
      <mark key={i} className="verify-highlight">{part}</mark>
    ) : (
      <span key={i}>{part}</span>
    )
  )
}

function formatDate(value) {
  if (!value) return 'Unknown date'
  return new Date(value).toLocaleDateString('en-IN', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  })
}

export default function CasePage() {
  const router = useRouter()
  const { id } = router.query

  const { data: caseData, error: caseError } = useSWR(id ? `/api/cases/${id}` : null, fetcher)
  const { data: documents, mutate: mutateDocuments } = useSWR(
    id ? `/api/cases/${id}/documents` : null,
    fetcher
  )
  const { data: drafts, mutate: mutateDrafts } = useSWR(
    id ? `/api/cases/${id}/drafts` : null,
    fetcher
  )

  const [uploading, setUploading] = useState(false)
  const [uploadError, setUploadError] = useState(null)

  const [instruction, setInstruction] = useState('')
  const [generating, setGenerating] = useState(false)
  const [draftError, setDraftError] = useState(null)
  const [draft, setDraft] = useState(null)
  const [draftId, setDraftId] = useState(null)

  const [activeLang, setActiveLang] = useState('en')
  const [translations, setTranslations] = useState({})
  const [translating, setTranslating] = useState(false)
  const [translateError, setTranslateError] = useState(null)

  const [copied, setCopied] = useState(false)

  async function handleUpload(e) {
    const file = e.target.files?.[0]
    if (!file) return
    setUploadError(null)
    setUploading(true)
    try {
      const formData = new FormData()
      formData.append('file', file)
      await axios.post(`/api/cases/${id}/upload`, formData)
      await mutateDocuments()
    } catch (err) {
      setUploadError('Upload failed. Please try again.')
    } finally {
      setUploading(false)
      e.target.value = ''
    }
  }

  async function handleGenerate(e) {
    e.preventDefault()
    if (generating || !instruction.trim()) return
    setDraftError(null)
    setGenerating(true)
    try {
      const res = await axios.post('/api/ai/draft', {
        case_id: Number(id),
        prompt_context: instruction,
        instruction,
      })
      setDraft(res.data.draft)
      setDraftId(res.data.draft_id)
      setTranslations({})
      setActiveLang('en')
      mutateDrafts()
    } catch (err) {
      setDraftError('Could not generate draft. Please try again.')
    } finally {
      setGenerating(false)
    }
  }

  function handleLoadDraft(d) {
    setDraft(d.content)
    setDraftId(d.id)
    setTranslations({})
    setActiveLang('en')
    setTranslateError(null)
  }

  async function handleLangSwitch(code) {
    if (code === 'en' || translations[code]) {
      setActiveLang(code)
      return
    }
    setTranslateError(null)
    setTranslating(true)
    try {
      const res = await axios.post('/api/ai/translate', {
        text: draft,
        target_lang: code,
      })
      setTranslations((prev) => ({ ...prev, [code]: res.data.translated_text }))
      setActiveLang(code)
    } catch (err) {
      setTranslateError('Translation failed. Please try again.')
    } finally {
      setTranslating(false)
    }
  }

  function handleCopy() {
    const text = activeLang === 'en' ? draft : translations[activeLang]
    if (!text) return
    navigator.clipboard.writeText(text)
    setCopied(true)
    setTimeout(() => setCopied(false), 1500)
  }

  if (caseError) return <p className="state-message error">Case not found.</p>
  if (!caseData) return <p className="state-message">Loading case...</p>

  const displayedText = activeLang === 'en' ? draft : translations[activeLang]

  return (
    <div>
      <div className="case-header">
        <span className="forum-badge">{forumLabel(caseData.forum)}</span>
        <h1>{caseData.title}</h1>
        <p className="case-header-meta">
          Case No: {caseData.case_number || 'Not assigned'} · Created: {formatDate(caseData.created_at)}
        </p>
      </div>

      <div className="section">
        <h2 className="section-title">Documents</h2>
        {documents && documents.length > 0 ? (
          <ul className="doc-list">
            {documents.map((doc) => (
              <li key={doc.id} className="doc-item">
                <span className="doc-item-name">{doc.filename}</span>
                <span className="doc-item-date">{formatDate(doc.uploaded_at)}</span>
              </li>
            ))}
          </ul>
        ) : (
          <p className="state-message">No documents uploaded yet.</p>
        )}

        <div className="upload-area">
          <label htmlFor="doc-upload">
            {uploading ? 'Uploading...' : 'Click to upload a document'}
          </label>
          <input id="doc-upload" type="file" onChange={handleUpload} disabled={uploading} />
        </div>
        {uploadError && <p className="form-error">{uploadError}</p>}
      </div>

      <div className="section">
        <h2 className="section-title">Generate Draft</h2>
        <form onSubmit={handleGenerate}>
          <div className="form-group">
            <label htmlFor="instruction">Instructions</label>
            <textarea
              id="instruction"
              value={instruction}
              onChange={(e) => setInstruction(e.target.value)}
              placeholder="Describe what the draft should cover..."
              required
            />
          </div>
          <button type="submit" className="btn" disabled={generating}>
            {generating ? 'Generating...' : 'Generate Draft'}
          </button>
        </form>
        {draftError && <p className="form-error">{draftError}</p>}
      </div>

      {drafts && drafts.length > 0 && (
        <div className="section">
          <h2 className="section-title">Drafts</h2>
          <ul className="doc-list">
            {drafts.map((d) => (
              <li key={d.id} className="doc-item">
                <button
                  type="button"
                  className="draft-list-item"
                  onClick={() => handleLoadDraft(d)}
                >
                  <span className="doc-item-name">{(d.instruction || '').split('\n')[0]}</span>
                  <span className="doc-item-date">{formatDate(d.created_at)}</span>
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}

      {draft && (
        <div className="section">
          <div className="draft-toolbar">
            <div className="lang-toggle">
              {LANGUAGES.map((lang) => (
                <button
                  key={lang.code}
                  type="button"
                  className={`lang-toggle-btn${activeLang === lang.code ? ' active' : ''}`}
                  onClick={() => handleLangSwitch(lang.code)}
                  disabled={translating}
                >
                  {lang.label}
                </button>
              ))}
            </div>
            <div className="draft-toolbar-actions">
              <button type="button" className="btn btn-secondary" onClick={handleCopy}>
                {copied ? 'Copied' : 'Copy'}
              </button>
              {activeLang === 'en' && draftId && (
                <a
                  href={`/api/drafts/${draftId}/download`}
                  className="btn btn-secondary"
                  download
                >
                  Download
                </a>
              )}
            </div>
          </div>

          {translateError && <p className="form-error">{translateError}</p>}

          {translating ? (
            <p className="state-message">Translating...</p>
          ) : (
            <div className="draft-view">{renderWithHighlights(displayedText || '')}</div>
          )}
        </div>
      )}
    </div>
  )
}
