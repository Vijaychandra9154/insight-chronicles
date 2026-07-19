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

const COURT_TRACKED_FORUMS = ['district_court', 'consumer_forum']
const MANUAL_STATUS_OPTIONS = ['Filed', 'Under Inquiry', 'Notice Issued', 'Disposed']

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

  const { data: caseData, error: caseError, mutate: mutateCase } = useSWR(id ? `/api/cases/${id}` : null, fetcher)
  const { data: documents, mutate: mutateDocuments } = useSWR(
    id ? `/api/cases/${id}/documents` : null,
    fetcher
  )
  const { data: drafts, mutate: mutateDrafts } = useSWR(
    id ? `/api/cases/${id}/drafts` : null,
    fetcher
  )
  const { data: courtStatus, mutate: mutateCourtStatus } = useSWR(
    id && caseData?.cnr_number ? `/api/cases/${id}/court-status` : null,
    fetcher
  )

  const [cnrInput, setCnrInput] = useState('')
  const [linkingCnr, setLinkingCnr] = useState(false)
  const [linkError, setLinkError] = useState(null)
  const [refreshingStatus, setRefreshingStatus] = useState(false)
  const [statusError, setStatusError] = useState(null)
  const [manualStatusError, setManualStatusError] = useState(null)

  const [uploading, setUploading] = useState(false)
  const [uploadError, setUploadError] = useState(null)

  const [instruction, setInstruction] = useState('')
  const [generating, setGenerating] = useState(false)
  const [draftError, setDraftError] = useState(null)
  const [draft, setDraft] = useState(null)
  const [draftId, setDraftId] = useState(null)

  const [filedDateInput, setFiledDateInput] = useState('')
  const [settingFiled, setSettingFiled] = useState(false)
  const [filedError, setFiledError] = useState(null)
  const [manualDeadlineInput, setManualDeadlineInput] = useState('')
  const [settingDeadline, setSettingDeadline] = useState(false)
  const [deadlineError, setDeadlineError] = useState(null)
  const [escalating, setEscalating] = useState(false)
  const [escalateError, setEscalateError] = useState(null)

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

  async function handleLinkCnr(e) {
    e.preventDefault()
    if (linkingCnr || !cnrInput.trim()) return
    setLinkError(null)
    setLinkingCnr(true)
    try {
      const res = await axios.post(`/api/cases/${id}/link-cnr`, {
        cnr_number: cnrInput.trim().toUpperCase(),
      })
      setCnrInput('')
      await mutateCase()
      mutateCourtStatus(res.data, false)
    } catch (err) {
      setLinkError(err.response?.data?.detail || 'Could not link CNR. Please check the number and try again.')
    } finally {
      setLinkingCnr(false)
    }
  }

  async function handleRefreshStatus() {
    setStatusError(null)
    setRefreshingStatus(true)
    try {
      const res = await axios.get(`/api/cases/${id}/court-status`, { params: { refresh: true } })
      mutateCourtStatus(res.data, false)
    } catch (err) {
      setStatusError(err.response?.data?.detail || 'Could not refresh court status. Please try again.')
    } finally {
      setRefreshingStatus(false)
    }
  }

  async function handleManualStatusChange(e) {
    const value = e.target.value
    setManualStatusError(null)
    try {
      await axios.post(`/api/cases/${id}/status`, { manual_status: value })
      mutateCase((prev) => (prev ? { ...prev, manual_status: value } : prev), false)
    } catch (err) {
      setManualStatusError('Could not save status. Please try again.')
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

  async function handleSetFiled(e) {
    e.preventDefault()
    if (settingFiled || !filedDateInput) return
    setFiledError(null)
    setSettingFiled(true)
    try {
      const res = await axios.post(`/api/cases/${id}/filed`, { filed_date: filedDateInput })
      mutateCase(res.data, false)
    } catch (err) {
      setFiledError('Could not save the filing date. Please try again.')
    } finally {
      setSettingFiled(false)
    }
  }

  async function handleSetDeadline(e) {
    e.preventDefault()
    if (settingDeadline || !manualDeadlineInput) return
    setDeadlineError(null)
    setSettingDeadline(true)
    try {
      const res = await axios.post(`/api/cases/${id}/escalation-deadline`, {
        escalation_deadline: manualDeadlineInput,
      })
      mutateCase(res.data, false)
    } catch (err) {
      setDeadlineError('Could not save the reminder date. Please try again.')
    } finally {
      setSettingDeadline(false)
    }
  }

  async function handleEscalate() {
    if (escalating) return
    setEscalateError(null)
    setEscalating(true)
    try {
      const res = await axios.post('/api/ai/escalate', { case_id: Number(id) })
      setDraft(res.data.draft)
      setDraftId(res.data.draft_id)
      setTranslations({})
      setActiveLang('en')
      mutateDrafts()
    } catch (err) {
      setEscalateError('Could not generate an escalation draft. Please try again.')
    } finally {
      setEscalating(false)
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
  if (!caseData) return <p className="state-message"><span className="spinner" /> Loading case...</p>

  const displayedText = activeLang === 'en' ? draft : translations[activeLang]
  const isCourtTracked = COURT_TRACKED_FORUMS.includes(caseData.forum)
  const stageText = courtStatus?.stage || courtStatus?.case_status || ''
  const isDisposed = /disposed/i.test(stageText)

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
        <h2 className="section-title">Court Status</h2>
        {isCourtTracked ? (
          caseData.cnr_number ? (
            <div>
              <div className="court-status-toolbar">
                <span className="doc-item-date">
                  {courtStatus?.fetched_at
                    ? `Checked: ${formatDate(courtStatus.fetched_at)}`
                    : 'Not yet checked'}
                </span>
                <button
                  type="button"
                  className="btn btn-secondary"
                  onClick={handleRefreshStatus}
                  disabled={refreshingStatus}
                >
                  {refreshingStatus && <span className="spinner" />}
                  {refreshingStatus ? 'Refreshing...' : 'Refresh'}
                </button>
              </div>
              {statusError && <p className="form-error">{statusError}</p>}
              {courtStatus && courtStatus.fetched ? (
                <div className="court-status-grid">
                  <div className={`court-status-primary${isDisposed ? ' is-disposed' : ''}`}>
                    <div className="court-status-label">Stage</div>
                    <div className="court-status-value">
                      {courtStatus.stage || courtStatus.case_status || 'Unknown'}
                    </div>
                  </div>
                  <div className="court-status-primary">
                    <div className="court-status-label">Next Hearing</div>
                    <div className="court-status-value">
                      {courtStatus.next_hearing_date || 'Not scheduled'}
                    </div>
                  </div>
                  <div className="court-status-secondary">
                    <span>Last order: {courtStatus.last_order_date || 'None'}</span>
                    <span>Judge: {courtStatus.judges?.join(', ') || 'Unknown'}</span>
                    <span>Parties: {courtStatus.case_title || 'Unknown'}</span>
                  </div>
                </div>
              ) : (
                <p className="state-message">No status fetched yet.</p>
              )}
              <p className="case-header-meta">CNR: {caseData.cnr_number}</p>
            </div>
          ) : (
            <form className="cnr-link-form" onSubmit={handleLinkCnr}>
              <div className="form-group">
                <label htmlFor="cnr">CNR Number</label>
                <input
                  id="cnr"
                  type="text"
                  value={cnrInput}
                  onChange={(e) => setCnrInput(e.target.value)}
                  placeholder="e.g. DLND020047882015"
                  required
                />
              </div>
              <button type="submit" className="btn" disabled={linkingCnr}>
                {linkingCnr && <span className="spinner" />}
                {linkingCnr ? 'Linking...' : 'Link CNR'}
              </button>
              {linkError && <p className="form-error">{linkError}</p>}
            </form>
          )
        ) : (
          <div className="form-group">
            <label htmlFor="manual-status">Status</label>
            <select
              id="manual-status"
              value={caseData.manual_status || ''}
              onChange={handleManualStatusChange}
            >
              <option value="" disabled>Select status</option>
              {MANUAL_STATUS_OPTIONS.map((opt) => (
                <option key={opt} value={opt}>{opt}</option>
              ))}
            </select>
            {manualStatusError && <p className="form-error">{manualStatusError}</p>}
          </div>
        )}
      </div>

      <div className="section">
        <h2 className="section-title">Response Deadline</h2>
        {!caseData.filed_date ? (
          <form className="cnr-link-form" onSubmit={handleSetFiled}>
            <div className="form-group">
              <label htmlFor="filed-date">Date Filed</label>
              <input
                id="filed-date"
                type="date"
                value={filedDateInput}
                onChange={(e) => setFiledDateInput(e.target.value)}
                required
              />
            </div>
            <button type="submit" className="btn" disabled={settingFiled}>
              {settingFiled && <span className="spinner" />}
              {settingFiled ? 'Saving...' : 'Mark as Filed'}
            </button>
            {filedError && <p className="form-error">{filedError}</p>}
          </form>
        ) : (
          <div>
            <div className="court-status-grid">
              <div className={`court-status-primary${caseData.is_overdue ? ' is-overdue' : ''}`}>
                <div className="court-status-label">
                  {caseData.escalation_deadline ? 'Response Due' : 'Reminder'}
                </div>
                <div className="court-status-value">
                  {caseData.escalation_deadline
                    ? formatDate(caseData.escalation_deadline)
                    : 'No fixed statutory deadline'}
                </div>
              </div>
              <div className="court-status-primary">
                <div className="court-status-label">Filed On</div>
                <div className="court-status-value">{formatDate(caseData.filed_date)}</div>
              </div>
            </div>

            {caseData.escalation_deadline_basis && (
              <p className="case-header-meta">{caseData.escalation_deadline_basis}</p>
            )}

            {caseData.is_overdue ? (
              <p className="state-message error">
                Overdue by {Math.abs(caseData.days_remaining)} day
                {Math.abs(caseData.days_remaining) === 1 ? '' : 's'}.
              </p>
            ) : caseData.days_remaining != null ? (
              <p className="state-message">
                {caseData.days_remaining} day{caseData.days_remaining === 1 ? '' : 's'} remaining.
              </p>
            ) : null}

            {!caseData.escalation_deadline && (
              <form className="cnr-link-form" onSubmit={handleSetDeadline}>
                <div className="form-group">
                  <label htmlFor="manual-deadline">Set a follow-up reminder</label>
                  <input
                    id="manual-deadline"
                    type="date"
                    value={manualDeadlineInput}
                    onChange={(e) => setManualDeadlineInput(e.target.value)}
                    required
                  />
                </div>
                <button type="submit" className="btn btn-secondary" disabled={settingDeadline}>
                  {settingDeadline && <span className="spinner" />}
                  {settingDeadline ? 'Saving...' : 'Set Reminder'}
                </button>
                {deadlineError && <p className="form-error">{deadlineError}</p>}
              </form>
            )}

            <button
              type="button"
              className="btn btn-secondary"
              onClick={handleEscalate}
              disabled={escalating}
            >
              {escalating && <span className="spinner" />}
              {escalating ? 'Generating...' : 'Generate Escalation Draft'}
            </button>
            {escalateError && <p className="form-error">{escalateError}</p>}
          </div>
        )}
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
            {uploading && <span className="spinner" />} {uploading ? 'Uploading...' : 'Click to upload a document'}
          </label>
          <input id="doc-upload" type="file" onChange={handleUpload} disabled={uploading} />
        </div>
        {uploadError && <p className="form-error">{uploadError}</p>}
      </div>

      <div className="section">
        <h2 className="section-title">Generate Draft</h2>
        <form onSubmit={handleGenerate}>
          <div className="form-group">
            <label htmlFor="instruction">Case Facts & Instructions</label>
            <textarea
              id="instruction"
              value={instruction}
              onChange={(e) => setInstruction(e.target.value)}
              placeholder="Describe what happened: who, what, when, where. The draft will be built from these facts."
              required
            />
          </div>
          <button type="submit" className="btn" disabled={generating}>
            {generating && <span className="spinner" />}
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
                  <span className="doc-item-name">
                    {(d.instruction || '').split('\n')[0]}
                    {d.kind === 'escalation' && <span className="escalation-badge">Follow-up</span>}
                  </span>
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
            <p className="state-message"><span className="spinner" /> Translating...</p>
          ) : (
            <div className="draft-view">{renderWithHighlights(displayedText || '')}</div>
          )}
        </div>
      )}
    </div>
  )
}
