'use client'

import React, { useState, useRef, useCallback } from 'react'
import { callAIAgent, uploadFiles } from '@/lib/aiAgent'
import parseLLMJson from '@/lib/jsonParser'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Skeleton } from '@/components/ui/skeleton'
import { Separator } from '@/components/ui/separator'
import { Switch } from '@/components/ui/switch'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { FiUploadCloud, FiDownload, FiFilter, FiUsers, FiBarChart2, FiAlertTriangle, FiCheckCircle, FiRefreshCw, FiSearch, FiX } from 'react-icons/fi'

// === Constants ===
const MANAGER_AGENT_ID = '69a027495f1c147fcddc9b20'
const COMPANY_RESEARCH_AGENT_ID = '69a0273046d462ee9ae703f1'
const PERSON_RESEARCH_AGENT_ID = '69a027309c293c5b871a4ba1'

const ACCEPTED_EXTENSIONS = ['.csv', '.xlsx', '.xls']

// === TypeScript Interfaces ===
interface EnrichedRecord {
  name: string
  company: string
  revenue: string
  sector: string
  decision_maker: string
  job_title: string
  confidence: string
}

interface EnrichmentSummary {
  total_records: number
  decision_makers_found: number
  low_confidence_count: number
  high_confidence_rate: string
}

interface ParsedRow {
  name: string
  company: string
  [key: string]: string
}

interface ArtifactFile {
  file_url: string
  name: string
  format_type: string
}

type FilterMode = 'all' | 'low_confidence' | 'decision_makers'
type SortField = 'name' | 'company' | 'revenue' | 'sector' | 'confidence' | 'job_title' | 'decision_maker'
type SortDir = 'asc' | 'desc'

// === Sample Data ===
const SAMPLE_PREVIEW_ROWS: ParsedRow[] = [
  { name: 'Sarah Chen', company: 'TechFlow Inc' },
  { name: 'Marcus Johnson', company: 'DataVault Systems' },
  { name: 'Elena Rodriguez', company: 'CloudBridge Solutions' },
  { name: 'James Park', company: 'NexGen Analytics' },
  { name: 'Priya Sharma', company: 'InnoWave Corp' },
]

const SAMPLE_ENRICHED: EnrichedRecord[] = [
  { name: 'Sarah Chen', company: 'TechFlow Inc', revenue: '$45M', sector: 'Enterprise SaaS', decision_maker: 'Yes', job_title: 'VP of Engineering', confidence: 'High' },
  { name: 'Marcus Johnson', company: 'DataVault Systems', revenue: '$120M', sector: 'Data Infrastructure', decision_maker: 'Yes', job_title: 'CTO', confidence: 'High' },
  { name: 'Elena Rodriguez', company: 'CloudBridge Solutions', revenue: '$28M', sector: 'Cloud Computing', decision_maker: 'No', job_title: 'Senior Developer', confidence: 'Low' },
  { name: 'James Park', company: 'NexGen Analytics', revenue: '$75M', sector: 'Business Intelligence', decision_maker: 'Yes', job_title: 'Director of Product', confidence: 'High' },
  { name: 'Priya Sharma', company: 'InnoWave Corp', revenue: '$15M', sector: 'IoT Solutions', decision_maker: 'No', job_title: 'Data Analyst', confidence: 'Low' },
]

const SAMPLE_SUMMARY: EnrichmentSummary = {
  total_records: 5,
  decision_makers_found: 3,
  low_confidence_count: 2,
  high_confidence_rate: '60%',
}

// === CSV Parser ===
function parseCSV(text: string): ParsedRow[] {
  const lines = text.split(/\r?\n/).filter((l) => l.trim().length > 0)
  if (lines.length < 2) return []
  const headerLine = lines[0]
  const headers = headerLine.split(',').map((h) => h.trim().replace(/^["']|["']$/g, ''))
  const nameIdx = headers.findIndex((h) => /^(name|full.?name|contact.?name|person)$/i.test(h))
  const companyIdx = headers.findIndex((h) => /^(company|organization|org|company.?name|employer)$/i.test(h))
  const rows: ParsedRow[] = []
  for (let i = 1; i < lines.length; i++) {
    const values = parseCSVLine(lines[i])
    if (values.length === 0) continue
    const row: ParsedRow = {
      name: nameIdx >= 0 && nameIdx < values.length ? values[nameIdx].trim() : values[0]?.trim() ?? '',
      company: companyIdx >= 0 && companyIdx < values.length ? values[companyIdx].trim() : values[1]?.trim() ?? '',
    }
    headers.forEach((h, idx) => {
      if (idx < values.length) {
        row[h] = values[idx].trim()
      }
    })
    if (row.name || row.company) rows.push(row)
  }
  return rows
}

function parseCSVLine(line: string): string[] {
  const result: string[] = []
  let current = ''
  let inQuotes = false
  for (let i = 0; i < line.length; i++) {
    const ch = line[i]
    if (inQuotes) {
      if (ch === '"' && line[i + 1] === '"') {
        current += '"'
        i++
      } else if (ch === '"') {
        inQuotes = false
      } else {
        current += ch
      }
    } else {
      if (ch === '"') {
        inQuotes = true
      } else if (ch === ',') {
        result.push(current)
        current = ''
      } else {
        current += ch
      }
    }
  }
  result.push(current)
  return result
}

// === Markdown Renderer ===
function renderMarkdown(text: string) {
  if (!text) return null
  return (
    <div className="space-y-2">
      {text.split('\n').map((line, i) => {
        if (line.startsWith('### ')) return <h4 key={i} className="font-semibold text-sm mt-3 mb-1">{line.slice(4)}</h4>
        if (line.startsWith('## ')) return <h3 key={i} className="font-semibold text-base mt-3 mb-1">{line.slice(3)}</h3>
        if (line.startsWith('# ')) return <h2 key={i} className="font-bold text-lg mt-4 mb-2">{line.slice(2)}</h2>
        if (line.startsWith('- ') || line.startsWith('* ')) return <li key={i} className="ml-4 list-disc text-sm">{formatInline(line.slice(2))}</li>
        if (/^\d+\.\s/.test(line)) return <li key={i} className="ml-4 list-decimal text-sm">{formatInline(line.replace(/^\d+\.\s/, ''))}</li>
        if (!line.trim()) return <div key={i} className="h-1" />
        return <p key={i} className="text-sm">{formatInline(line)}</p>
      })}
    </div>
  )
}

function formatInline(text: string) {
  const parts = text.split(/\*\*(.*?)\*\*/g)
  if (parts.length === 1) return text
  return parts.map((part, i) =>
    i % 2 === 1 ? <strong key={i} className="font-semibold">{part}</strong> : part
  )
}

// === ErrorBoundary ===
class ErrorBoundary extends React.Component<
  { children: React.ReactNode },
  { hasError: boolean; error: string }
> {
  constructor(props: { children: React.ReactNode }) {
    super(props)
    this.state = { hasError: false, error: '' }
  }
  static getDerivedStateFromError(error: Error) {
    return { hasError: true, error: error.message }
  }
  render() {
    if (this.state.hasError) {
      return (
        <div className="min-h-screen flex items-center justify-center bg-background text-foreground">
          <div className="text-center p-8 max-w-md">
            <h2 className="text-xl font-semibold mb-2">Something went wrong</h2>
            <p className="text-muted-foreground mb-4 text-sm">{this.state.error}</p>
            <button onClick={() => this.setState({ hasError: false, error: '' })} className="px-4 py-2 bg-primary text-primary-foreground rounded-sm text-sm">
              Try again
            </button>
          </div>
        </div>
      )
    }
    return this.props.children
  }
}

// === Sub-Components ===

function SummaryCard({ icon, label, value, accent }: { icon: React.ReactNode; label: string; value: string | number; accent?: boolean }) {
  return (
    <Card className="border border-border">
      <CardContent className="p-3">
        <div className="flex items-center gap-2">
          <div className={accent ? 'text-accent' : 'text-primary'}>{icon}</div>
          <div className="min-w-0">
            <p className="text-xs text-muted-foreground leading-tight truncate">{label}</p>
            <p className="text-lg font-semibold leading-tight">{value}</p>
          </div>
        </div>
      </CardContent>
    </Card>
  )
}

function ConfidenceBadge({ value }: { value: string }) {
  const isHigh = /high/i.test(value ?? '')
  return (
    <Badge variant={isHigh ? 'default' : 'secondary'} className={isHigh ? 'bg-accent text-accent-foreground text-xs' : 'bg-orange-100 text-orange-700 border-orange-200 text-xs'}>
      {isHigh ? <FiCheckCircle className="mr-1 h-3 w-3 inline" /> : <FiAlertTriangle className="mr-1 h-3 w-3 inline" />}
      {value ?? 'Unknown'}
    </Badge>
  )
}

function DecisionMakerBadge({ value }: { value: string }) {
  const isYes = /yes/i.test(value ?? '')
  return (
    <Badge variant={isYes ? 'default' : 'outline'} className={isYes ? 'bg-primary text-primary-foreground text-xs' : 'text-muted-foreground text-xs'}>
      {value ?? 'N/A'}
    </Badge>
  )
}

function SkeletonTable() {
  return (
    <div className="space-y-2 p-4">
      {Array.from({ length: 6 }).map((_, i) => (
        <div key={i} className="flex gap-3">
          <Skeleton className="h-5 w-1/6" />
          <Skeleton className="h-5 w-1/6" />
          <Skeleton className="h-5 w-1/8" />
          <Skeleton className="h-5 w-1/8" />
          <Skeleton className="h-5 w-1/8" />
          <Skeleton className="h-5 w-1/6" />
          <Skeleton className="h-5 w-1/8" />
        </div>
      ))}
    </div>
  )
}

function AgentStatusPanel({ activeAgentId, loading }: { activeAgentId: string | null; loading: boolean }) {
  const agents = [
    { id: MANAGER_AGENT_ID, name: 'Enrichment Coordinator', purpose: 'Orchestrates data enrichment workflow' },
    { id: COMPANY_RESEARCH_AGENT_ID, name: 'Company Research Agent', purpose: 'Researches company data and financials' },
    { id: PERSON_RESEARCH_AGENT_ID, name: 'Person Research Agent', purpose: 'Identifies decision makers and roles' },
  ]
  return (
    <Card className="border border-border mt-4">
      <CardHeader className="p-3 pb-2">
        <CardTitle className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Agent Status</CardTitle>
      </CardHeader>
      <CardContent className="p-3 pt-0">
        <div className="space-y-1.5">
          {agents.map((agent) => {
            const isActive = loading && activeAgentId === agent.id
            const isManager = agent.id === MANAGER_AGENT_ID
            return (
              <div key={agent.id} className="flex items-center gap-2 text-xs">
                <div className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${isActive ? 'bg-accent animate-pulse' : 'bg-muted-foreground/30'}`} />
                <span className={`font-medium ${isActive ? 'text-foreground' : 'text-muted-foreground'}`}>{agent.name}</span>
                {!isManager && <span className="text-muted-foreground/60">(sub-agent)</span>}
                <span className="text-muted-foreground/50 ml-auto truncate max-w-[180px]">{agent.purpose}</span>
              </div>
            )
          })}
        </div>
      </CardContent>
    </Card>
  )
}

// === Main Page ===
export default function Page() {
  // View state
  const [view, setView] = useState<'upload' | 'results'>('upload')
  const [sampleMode, setSampleMode] = useState(false)

  // Upload state
  const [selectedFile, setSelectedFile] = useState<File | null>(null)
  const [previewRows, setPreviewRows] = useState<ParsedRow[]>([])
  const [totalRowCount, setTotalRowCount] = useState(0)
  const [fileError, setFileError] = useState<string | null>(null)
  const [isDragging, setIsDragging] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)

  // Enrichment state
  const [loading, setLoading] = useState(false)
  const [loadingMessage, setLoadingMessage] = useState('')
  const [activeAgentId, setActiveAgentId] = useState<string | null>(null)
  const [enrichedData, setEnrichedData] = useState<EnrichedRecord[]>([])
  const [summary, setSummary] = useState<EnrichmentSummary | null>(null)
  const [artifactFiles, setArtifactFiles] = useState<ArtifactFile[]>([])
  const [statusMessage, setStatusMessage] = useState<string | null>(null)
  const [errorMessage, setErrorMessage] = useState<string | null>(null)
  const [rawResponseText, setRawResponseText] = useState<string | null>(null)

  // Filter/Sort state
  const [filterMode, setFilterMode] = useState<FilterMode>('all')
  const [sortField, setSortField] = useState<SortField>('name')
  const [sortDir, setSortDir] = useState<SortDir>('asc')

  // === File Handling ===
  const validateFile = useCallback((file: File): boolean => {
    const name = file.name.toLowerCase()
    const validExt = ACCEPTED_EXTENSIONS.some((ext) => name.endsWith(ext))
    if (!validExt) {
      setFileError('Invalid file format. Please upload a .csv, .xlsx, or .xls file.')
      return false
    }
    if (file.size > 10 * 1024 * 1024) {
      setFileError('File too large. Maximum size is 10MB.')
      return false
    }
    setFileError(null)
    return true
  }, [])

  const processFile = useCallback((file: File) => {
    if (!validateFile(file)) return
    setSelectedFile(file)
    setFileError(null)

    const name = file.name.toLowerCase()
    if (name.endsWith('.csv')) {
      const reader = new FileReader()
      reader.onload = (e) => {
        const text = e.target?.result as string
        if (!text) {
          setFileError('Could not read file contents.')
          return
        }
        const rows = parseCSV(text)
        if (rows.length === 0) {
          setFileError('No data rows found. Make sure your CSV has Name and Company columns.')
          return
        }
        setTotalRowCount(rows.length)
        setPreviewRows(rows.slice(0, 10))
      }
      reader.onerror = () => setFileError('Error reading file.')
      reader.readAsText(file)
    } else {
      // For .xlsx/.xls, we cannot parse client-side without xlsx library
      // Show a message and let the user proceed (file will be uploaded to agent)
      setPreviewRows([])
      setTotalRowCount(-1) // -1 indicates unknown (Excel file)
    }
  }, [validateFile])

  const handleFileSelect = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (file) processFile(file)
  }, [processFile])

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    setIsDragging(false)
    const file = e.dataTransfer.files[0]
    if (file) processFile(file)
  }, [processFile])

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    setIsDragging(true)
  }, [])

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    setIsDragging(false)
  }, [])

  const clearFile = useCallback(() => {
    setSelectedFile(null)
    setPreviewRows([])
    setTotalRowCount(0)
    setFileError(null)
    if (fileInputRef.current) fileInputRef.current.value = ''
  }, [])

  // === Deep extraction helper ===
  const deepExtractEnrichedData = useCallback((obj: any, depth: number = 0): { enriched: EnrichedRecord[]; summary: any; artifacts: ArtifactFile[] } => {
    if (!obj || depth > 10) return { enriched: [], summary: null, artifacts: [] }

    // If it's a string, try to parse it
    if (typeof obj === 'string') {
      try {
        const parsed = parseLLMJson(obj)
        if (parsed && typeof parsed === 'object') {
          return deepExtractEnrichedData(parsed, depth + 1)
        }
      } catch { /* ignore */ }
      return { enriched: [], summary: null, artifacts: [] }
    }

    if (typeof obj !== 'object') return { enriched: [], summary: null, artifacts: [] }

    // Direct match: enriched_data at this level
    if (Array.isArray(obj.enriched_data) && obj.enriched_data.length > 0) {
      return {
        enriched: obj.enriched_data,
        summary: obj.summary ?? null,
        artifacts: Array.isArray(obj.artifact_files) ? obj.artifact_files : [],
      }
    }

    // Check if this is an array of enrichment-like records directly
    if (Array.isArray(obj) && obj.length > 0 && obj[0] && typeof obj[0] === 'object' && ('name' in obj[0] || 'company' in obj[0]) && ('revenue' in obj[0] || 'sector' in obj[0] || 'decision_maker' in obj[0])) {
      return { enriched: obj, summary: null, artifacts: [] }
    }

    // Try known wrapper keys
    const wrapperKeys = ['result', 'response', 'data', 'output', 'content', 'message', 'text']
    for (const key of wrapperKeys) {
      if (obj[key] != null) {
        const inner = deepExtractEnrichedData(obj[key], depth + 1)
        if (inner.enriched.length > 0) return inner
      }
    }

    // Check all object keys for enriched_data
    for (const key of Object.keys(obj)) {
      if (key === 'enriched_data' && Array.isArray(obj[key])) {
        return { enriched: obj[key], summary: obj.summary ?? null, artifacts: [] }
      }
    }

    // Last resort: scan all values
    for (const key of Object.keys(obj)) {
      if (typeof obj[key] === 'object' && obj[key] !== null) {
        const inner = deepExtractEnrichedData(obj[key], depth + 1)
        if (inner.enriched.length > 0) return inner
      }
    }

    return { enriched: [], summary: null, artifacts: [] }
  }, [])

  // === Extract module_outputs from any level ===
  const extractArtifactFiles = useCallback((result: any): ArtifactFile[] => {
    if (!result) return []
    // Top level
    if (Array.isArray(result.module_outputs?.artifact_files) && result.module_outputs.artifact_files.length > 0) {
      return result.module_outputs.artifact_files
    }
    // Inside response
    if (Array.isArray(result.response?.module_outputs?.artifact_files) && result.response.module_outputs.artifact_files.length > 0) {
      return result.response.module_outputs.artifact_files
    }
    // Try raw_response
    if (result.raw_response && typeof result.raw_response === 'string') {
      try {
        const raw = JSON.parse(result.raw_response)
        if (Array.isArray(raw?.module_outputs?.artifact_files)) {
          return raw.module_outputs.artifact_files
        }
        if (Array.isArray(raw?.response?.module_outputs?.artifact_files)) {
          return raw.response.module_outputs.artifact_files
        }
      } catch { /* ignore */ }
    }
    return []
  }, [])

  // === Enrichment ===
  const handleEnrich = useCallback(async () => {
    if (!selectedFile && !sampleMode) return
    setLoading(true)
    setErrorMessage(null)
    setStatusMessage(null)
    setActiveAgentId(MANAGER_AGENT_ID)

    try {
      if (sampleMode) {
        // Simulate with sample data
        setLoadingMessage('Enriching 5 sample records...')
        await new Promise((r) => setTimeout(r, 1500))
        setEnrichedData(SAMPLE_ENRICHED)
        setSummary(SAMPLE_SUMMARY)
        setArtifactFiles([])
        setStatusMessage('Sample enrichment complete.')
        setView('results')
        setLoading(false)
        setActiveAgentId(null)
        return
      }

      // Step 1: Upload file
      setLoadingMessage('Uploading file...')
      const uploadResult = await uploadFiles(selectedFile as File)
      if (!uploadResult.success || !Array.isArray(uploadResult.asset_ids) || uploadResult.asset_ids.length === 0) {
        setErrorMessage('File upload failed: ' + (uploadResult.error ?? 'Unknown error'))
        setLoading(false)
        setActiveAgentId(null)
        return
      }

      const assetIds = uploadResult.asset_ids

      // Step 2: Build message with ALL parsed data (not just preview)
      // Re-read the file to get ALL rows if CSV
      let allRows = previewRows
      if (selectedFile && selectedFile.name.toLowerCase().endsWith('.csv')) {
        try {
          const text = await selectedFile.text()
          const parsed = parseCSV(text)
          if (parsed.length > 0) allRows = parsed
        } catch { /* fallback to previewRows */ }
      }

      let message = `You have received an uploaded file with contact and company data. Please enrich EVERY row.

IMPORTANT SEARCH INSTRUCTIONS:
- Many companies may be Italian. Search for revenue in Italian: "[company] fatturato annuale", "[company] ricavi", "[company] bilancio". Also try English: "[company] annual revenue".
- Check these sources for revenue: registroimprese.it, reportaziende.it, dnb.com, crunchbase.com, company websites, annual reports, news articles.
- For job titles, search LinkedIn specifically: "[person name] [company] LinkedIn", "[person name] [company] site:linkedin.com". Also check company websites and press releases.
- Do NOT change or translate person names or company names from the original data.
- Revenue must be a specific value like "€15M" or "$120M", not "N/A". If exact revenue is not available, estimate based on company size and industry.
- Job titles must be specific (e.g., "VP Sales", "Direttore Commerciale"), not generic like "Employee".

For each row provide:
1. Revenue/Fatturato (e.g., "€15M", "$120M", "€2.5B")
2. Industry Sector/Settore (be specific, e.g., "Consulenza IT", "Enterprise SaaS")
3. Job Title/Ruolo (from LinkedIn or company website)
4. Decision Maker status: "Yes" if C-level, VP, Director, Direttore, Responsabile, Founder, Managing Director, Amministratore Delegato, Partner, Head of, Titolare; "No" otherwise
5. Confidence: "High" if data from official sources, "Low" if estimated or uncertain

Return your response as JSON with this EXACT structure:
{
  "enriched_data": [
    {"name": "original name unchanged", "company": "original company unchanged", "revenue": "€15M", "sector": "specific sector", "decision_maker": "Yes/No", "job_title": "specific title", "confidence": "High/Low"}
  ],
  "summary": {
    "total_records": <number>,
    "decision_makers_found": <number>,
    "low_confidence_count": <number>,
    "high_confidence_rate": "<percentage>"
  }
}`

      if (allRows.length > 0) {
        const dataPayload = allRows.map(r => ({ name: r.name, company: r.company }))
        message += '\n\nHere is the data to enrich (DO NOT change these names):\n' + JSON.stringify(dataPayload)
      } else {
        message += '\n\nThe data is in the attached file. Parse the file to extract names and companies, then enrich each row. Do NOT change the original names.'
      }

      // Step 3: Call the Manager agent
      const recordCount = allRows.length > 0 ? allRows.length : (totalRowCount > 0 ? totalRowCount : 'the')
      setLoadingMessage(`Enriching ${recordCount} records... This may take a few minutes.`)

      const result = await callAIAgent(message, MANAGER_AGENT_ID, { assets: assetIds })

      // Log raw response for debugging
      console.log('[DataEnrich] Raw agent result:', JSON.stringify(result, null, 2).substring(0, 2000))

      if (!result.success) {
        setErrorMessage('Enrichment failed: ' + (result.error ?? 'Unknown error'))
        setLoading(false)
        setActiveAgentId(null)
        return
      }

      // Step 4: Deep extract enrichment data from any nesting level
      // Try multiple sources for the data
      const sources = [
        result?.response?.result,
        result?.response,
        result,
      ]

      // Also try parsing raw_response directly
      if (result?.raw_response && typeof result.raw_response === 'string') {
        try {
          const rawParsed = parseLLMJson(result.raw_response)
          if (rawParsed) sources.push(rawParsed)
        } catch { /* ignore */ }
      }

      let extracted = { enriched: [] as EnrichedRecord[], summary: null as any, artifacts: [] as ArtifactFile[] }
      for (const source of sources) {
        if (!source) continue
        extracted = deepExtractEnrichedData(source)
        if (extracted.enriched.length > 0) break
      }

      console.log('[DataEnrich] Extracted enriched records:', extracted.enriched.length)

      // Extract artifact files from all possible locations
      const files = extractArtifactFiles(result)

      // Normalize enriched records - ensure all fields exist
      const normalizedEnriched: EnrichedRecord[] = Array.isArray(extracted.enriched) ? extracted.enriched.map((r: any) => ({
        name: String(r.name ?? r.person_name ?? r.contact_name ?? r.full_name ?? ''),
        company: String(r.company ?? r.company_name ?? r.organization ?? ''),
        revenue: String(r.revenue ?? r.company_revenue ?? r.annual_revenue ?? 'N/A'),
        sector: String(r.sector ?? r.industry ?? r.company_sector ?? 'N/A'),
        decision_maker: String(r.decision_maker ?? r.is_decision_maker ?? r.decisionMaker ?? 'N/A'),
        job_title: String(r.job_title ?? r.title ?? r.role ?? r.position ?? r.jobTitle ?? 'N/A'),
        confidence: String(r.confidence ?? r.confidence_level ?? r.confidenceLevel ?? 'Low'),
      })) : []

      const summaryData = extracted.summary
      setEnrichedData(normalizedEnriched)
      setSummary(summaryData ? {
        total_records: Number(summaryData.total_records) || normalizedEnriched.length,
        decision_makers_found: Number(summaryData.decision_makers_found) || 0,
        low_confidence_count: Number(summaryData.low_confidence_count) || 0,
        high_confidence_rate: String(summaryData.high_confidence_rate ?? '0%'),
      } : {
        total_records: normalizedEnriched.length,
        decision_makers_found: normalizedEnriched.filter((r) => /yes/i.test(r.decision_maker)).length,
        low_confidence_count: normalizedEnriched.filter((r) => /low/i.test(r.confidence)).length,
        high_confidence_rate: normalizedEnriched.length > 0 ? Math.round((normalizedEnriched.filter((r) => /high/i.test(r.confidence)).length / normalizedEnriched.length) * 100) + '%' : '0%',
      })
      setArtifactFiles(files)

      if (normalizedEnriched.length > 0) {
        setStatusMessage(`Successfully enriched ${normalizedEnriched.length} records.`)
        setView('results')
      } else {
        // Show the raw response text so user can see what agent returned
        const responseText = result?.response?.message
          ?? (typeof result?.response?.result === 'string' ? result.response.result : '')
          ?? (typeof result?.response?.result?.text === 'string' ? result.response.result.text : '')
        if (responseText) {
          setStatusMessage('Agent responded but could not parse structured enrichment data. Check the response below.')
          setRawResponseText(typeof responseText === 'string' ? responseText : JSON.stringify(responseText, null, 2))
          setView('results')
        } else {
          setErrorMessage('No enrichment data was returned. The agent may not have processed the file correctly. Please try again.')
        }
      }
    } catch (err) {
      setErrorMessage('An unexpected error occurred: ' + (err instanceof Error ? err.message : String(err)))
    } finally {
      setLoading(false)
      setActiveAgentId(null)
    }
  }, [selectedFile, sampleMode, previewRows, totalRowCount, deepExtractEnrichedData, extractArtifactFiles])

  // === Filter & Sort ===
  const getFilteredData = useCallback(() => {
    const data = sampleMode && view === 'results' && enrichedData.length === 0 ? SAMPLE_ENRICHED : enrichedData
    let filtered = [...data]
    if (filterMode === 'low_confidence') {
      filtered = filtered.filter((r) => /low/i.test(r.confidence ?? ''))
    } else if (filterMode === 'decision_makers') {
      filtered = filtered.filter((r) => /yes/i.test(r.decision_maker ?? ''))
    }
    filtered.sort((a, b) => {
      const aVal = (a[sortField] ?? '').toString().toLowerCase()
      const bVal = (b[sortField] ?? '').toString().toLowerCase()
      if (aVal < bVal) return sortDir === 'asc' ? -1 : 1
      if (aVal > bVal) return sortDir === 'asc' ? 1 : -1
      return 0
    })
    return filtered
  }, [enrichedData, filterMode, sortField, sortDir, sampleMode, view])

  const handleSort = useCallback((field: SortField) => {
    if (sortField === field) {
      setSortDir((prev) => (prev === 'asc' ? 'desc' : 'asc'))
    } else {
      setSortField(field)
      setSortDir('asc')
    }
  }, [sortField])

  // === CSV Export ===
  const exportCSV = useCallback(() => {
    const data = getFilteredData()
    if (data.length === 0) return
    const headers = ['Name', 'Company', 'Revenue', 'Sector', 'Decision Maker', 'Job Title', 'Confidence']
    const csvRows = [headers.join(',')]
    data.forEach((r) => {
      csvRows.push([
        `"${(r.name ?? '').replace(/"/g, '""')}"`,
        `"${(r.company ?? '').replace(/"/g, '""')}"`,
        `"${(r.revenue ?? '').replace(/"/g, '""')}"`,
        `"${(r.sector ?? '').replace(/"/g, '""')}"`,
        `"${(r.decision_maker ?? '').replace(/"/g, '""')}"`,
        `"${(r.job_title ?? '').replace(/"/g, '""')}"`,
        `"${(r.confidence ?? '').replace(/"/g, '""')}"`,
      ].join(','))
    })
    const blob = new Blob([csvRows.join('\n')], { type: 'text/csv;charset=utf-8;' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = 'enriched_data.csv'
    a.click()
    URL.revokeObjectURL(url)
  }, [getFilteredData])

  const handleNewEnrichment = useCallback(() => {
    setView('upload')
    setSelectedFile(null)
    setPreviewRows([])
    setTotalRowCount(0)
    setFileError(null)
    setEnrichedData([])
    setSummary(null)
    setArtifactFiles([])
    setStatusMessage(null)
    setErrorMessage(null)
    setRawResponseText(null)
    setFilterMode('all')
    setSortField('name')
    setSortDir('asc')
    if (fileInputRef.current) fileInputRef.current.value = ''
  }, [])

  const displaySummary = sampleMode && view === 'results' && !summary ? SAMPLE_SUMMARY : summary
  const filteredData = getFilteredData()

  // === Render Helpers ===
  const sortIndicator = (field: SortField) => {
    if (sortField !== field) return null
    return <span className="ml-1 text-xs">{sortDir === 'asc' ? '\u2191' : '\u2193'}</span>
  }

  return (
    <ErrorBoundary>
      <div className="min-h-screen bg-background text-foreground font-sans">
        {/* === Header === */}
        <header className="sticky top-0 z-30 bg-card border-b border-border">
          <div className="max-w-7xl mx-auto px-4 py-2.5 flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="flex items-center justify-center w-8 h-8 bg-primary rounded-sm">
                <FiBarChart2 className="w-4 h-4 text-primary-foreground" />
              </div>
              <div>
                <h1 className="text-base font-semibold leading-tight">DataEnrich Pro</h1>
                <p className="text-xs text-muted-foreground leading-tight">Enrich contact and company data with AI-powered insights</p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <label className="text-xs text-muted-foreground" htmlFor="sample-toggle">Sample Data</label>
              <Switch id="sample-toggle" checked={sampleMode} onCheckedChange={(checked) => { setSampleMode(checked); if (checked && view === 'upload') { setPreviewRows(SAMPLE_PREVIEW_ROWS); setTotalRowCount(5); } else if (!checked && !selectedFile) { setPreviewRows([]); setTotalRowCount(0); } }} />
            </div>
          </div>
        </header>

        {/* === Main Content === */}
        <main className="max-w-7xl mx-auto px-4 py-4">
          {/* Status/Error Messages */}
          {statusMessage && (
            <div className="mb-3 flex items-center gap-2 px-3 py-2 bg-accent/10 border border-accent/20 rounded-sm text-sm text-accent">
              <FiCheckCircle className="w-4 h-4 flex-shrink-0" />
              <span>{statusMessage}</span>
              <button onClick={() => setStatusMessage(null)} className="ml-auto"><FiX className="w-3 h-3" /></button>
            </div>
          )}
          {errorMessage && (
            <div className="mb-3 flex items-center gap-2 px-3 py-2 bg-destructive/10 border border-destructive/20 rounded-sm text-sm text-destructive">
              <FiAlertTriangle className="w-4 h-4 flex-shrink-0" />
              <span>{errorMessage}</span>
              <button onClick={() => setErrorMessage(null)} className="ml-auto"><FiX className="w-3 h-3" /></button>
            </div>
          )}

          {/* === Upload View === */}
          {view === 'upload' && !loading && (
            <div className="space-y-4">
              {/* Upload Dropzone */}
              <Card className="border border-border">
                <CardContent className="p-0">
                  <div
                    onDrop={handleDrop}
                    onDragOver={handleDragOver}
                    onDragLeave={handleDragLeave}
                    onClick={() => !selectedFile && fileInputRef.current?.click()}
                    className={`relative flex flex-col items-center justify-center py-12 px-6 cursor-pointer transition-colors ${isDragging ? 'bg-primary/5 border-primary' : 'bg-background'} ${selectedFile ? 'cursor-default' : ''}`}
                  >
                    <input
                      ref={fileInputRef}
                      type="file"
                      accept=".csv,.xlsx,.xls"
                      onChange={handleFileSelect}
                      className="hidden"
                    />
                    {!selectedFile && !sampleMode && (
                      <>
                        <FiUploadCloud className="w-10 h-10 text-muted-foreground mb-3" />
                        <p className="text-sm font-medium text-foreground mb-1">Drop your file here or click to browse</p>
                        <p className="text-xs text-muted-foreground">Accepts .csv, .xlsx, or .xls files (max 10MB)</p>
                      </>
                    )}
                    {selectedFile && (
                      <div className="flex items-center gap-3">
                        <div className="flex items-center justify-center w-10 h-10 bg-primary/10 rounded-sm">
                          <FiCheckCircle className="w-5 h-5 text-primary" />
                        </div>
                        <div>
                          <p className="text-sm font-medium">{selectedFile.name}</p>
                          <p className="text-xs text-muted-foreground">{(selectedFile.size / 1024).toFixed(1)} KB</p>
                        </div>
                        <Button variant="ghost" size="sm" onClick={(e) => { e.stopPropagation(); clearFile(); }} className="ml-2">
                          <FiX className="w-4 h-4" />
                        </Button>
                      </div>
                    )}
                    {sampleMode && !selectedFile && (
                      <div className="flex items-center gap-3">
                        <div className="flex items-center justify-center w-10 h-10 bg-accent/10 rounded-sm">
                          <FiCheckCircle className="w-5 h-5 text-accent" />
                        </div>
                        <div>
                          <p className="text-sm font-medium">Sample dataset loaded</p>
                          <p className="text-xs text-muted-foreground">5 contacts ready for enrichment</p>
                        </div>
                      </div>
                    )}
                  </div>
                  {fileError && (
                    <div className="px-4 py-2 bg-destructive/5 border-t border-destructive/10">
                      <p className="text-xs text-destructive flex items-center gap-1">
                        <FiAlertTriangle className="w-3 h-3" /> {fileError}
                      </p>
                    </div>
                  )}
                </CardContent>
              </Card>

              {/* Data Preview */}
              {(previewRows.length > 0 || totalRowCount === -1) && (
                <Card className="border border-border">
                  <CardHeader className="p-3 pb-2">
                    <CardTitle className="text-sm font-medium flex items-center justify-between">
                      <span className="flex items-center gap-1.5">
                        <FiSearch className="w-3.5 h-3.5 text-muted-foreground" />
                        Data Preview
                      </span>
                      {totalRowCount > 0 && (
                        <Badge variant="secondary" className="text-xs font-normal">{totalRowCount} records detected</Badge>
                      )}
                      {totalRowCount === -1 && (
                        <Badge variant="secondary" className="text-xs font-normal">Excel file - preview after enrichment</Badge>
                      )}
                    </CardTitle>
                  </CardHeader>
                  {previewRows.length > 0 && (
                    <CardContent className="p-0">
                      <ScrollArea className="max-h-[280px]">
                        <Table>
                          <TableHeader>
                            <TableRow className="bg-muted/50">
                              <TableHead className="text-xs font-medium py-2 px-3">#</TableHead>
                              <TableHead className="text-xs font-medium py-2 px-3">Name</TableHead>
                              <TableHead className="text-xs font-medium py-2 px-3">Company</TableHead>
                            </TableRow>
                          </TableHeader>
                          <TableBody>
                            {previewRows.map((row, idx) => (
                              <TableRow key={idx}>
                                <TableCell className="text-xs py-1.5 px-3 text-muted-foreground">{idx + 1}</TableCell>
                                <TableCell className="text-xs py-1.5 px-3">{row.name}</TableCell>
                                <TableCell className="text-xs py-1.5 px-3">{row.company}</TableCell>
                              </TableRow>
                            ))}
                          </TableBody>
                        </Table>
                      </ScrollArea>
                      {totalRowCount > 10 && (
                        <div className="px-3 py-1.5 border-t border-border">
                          <p className="text-xs text-muted-foreground">Showing first 10 of {totalRowCount} records</p>
                        </div>
                      )}
                    </CardContent>
                  )}
                </Card>
              )}

              {/* Enrich CTA */}
              <div className="flex justify-center">
                <Button onClick={handleEnrich} disabled={!selectedFile && !sampleMode} className="px-8 py-2 text-sm font-medium">
                  <FiBarChart2 className="w-4 h-4 mr-2" />
                  Enrich Data
                </Button>
              </div>
            </div>
          )}

          {/* === Loading State === */}
          {loading && (
            <div className="space-y-4">
              <Card className="border border-border">
                <CardContent className="p-6">
                  <div className="flex flex-col items-center gap-3">
                    <FiRefreshCw className="w-8 h-8 text-primary animate-spin" />
                    <p className="text-sm font-medium">{loadingMessage}</p>
                    <p className="text-xs text-muted-foreground">The AI agents are researching and enriching your data</p>
                  </div>
                </CardContent>
              </Card>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                {Array.from({ length: 4 }).map((_, i) => (
                  <Card key={i} className="border border-border"><CardContent className="p-3"><Skeleton className="h-4 w-2/3 mb-1" /><Skeleton className="h-6 w-1/2" /></CardContent></Card>
                ))}
              </div>
              <Card className="border border-border">
                <CardContent className="p-0">
                  <SkeletonTable />
                </CardContent>
              </Card>
            </div>
          )}

          {/* === Results View === */}
          {view === 'results' && !loading && (
            <div className="space-y-4">
              {/* Summary Cards */}
              {displaySummary && (
                <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                  <SummaryCard icon={<FiBarChart2 className="w-4 h-4" />} label="Total Records" value={displaySummary.total_records ?? 0} />
                  <SummaryCard icon={<FiUsers className="w-4 h-4" />} label="Decision Makers Found" value={displaySummary.decision_makers_found ?? 0} />
                  <SummaryCard icon={<FiAlertTriangle className="w-4 h-4" />} label="Low Confidence" value={displaySummary.low_confidence_count ?? 0} accent />
                  <SummaryCard icon={<FiCheckCircle className="w-4 h-4" />} label="High Confidence Rate" value={displaySummary.high_confidence_rate ?? '0%'} accent />
                </div>
              )}

              {/* Filter & Action Bar */}
              <Card className="border border-border">
                <CardContent className="p-3">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div className="flex items-center gap-1.5">
                      <FiFilter className="w-3.5 h-3.5 text-muted-foreground" />
                      <Button variant={filterMode === 'all' ? 'default' : 'outline'} size="sm" className="text-xs h-7 px-2.5" onClick={() => setFilterMode('all')}>All</Button>
                      <Button variant={filterMode === 'low_confidence' ? 'default' : 'outline'} size="sm" className="text-xs h-7 px-2.5" onClick={() => setFilterMode('low_confidence')}>Low Confidence</Button>
                      <Button variant={filterMode === 'decision_makers' ? 'default' : 'outline'} size="sm" className="text-xs h-7 px-2.5" onClick={() => setFilterMode('decision_makers')}>Decision Makers</Button>
                      <Separator orientation="vertical" className="h-5 mx-1" />
                      <span className="text-xs text-muted-foreground">{filteredData.length} record{filteredData.length !== 1 ? 's' : ''}</span>
                    </div>
                    <div className="flex items-center gap-2">
                      {artifactFiles.length > 0 && (
                        <a href={artifactFiles[0]?.file_url} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1.5 text-xs font-medium text-primary hover:underline">
                          <FiDownload className="w-3.5 h-3.5" />
                          Download Enriched File
                        </a>
                      )}
                      {artifactFiles.length > 0 && <Separator orientation="vertical" className="h-5" />}
                      <Button variant="outline" size="sm" className="text-xs h-7 px-2.5" onClick={exportCSV}>
                        <FiDownload className="w-3 h-3 mr-1" />
                        Export CSV
                      </Button>
                    </div>
                  </div>
                </CardContent>
              </Card>

              {/* Enriched Data Table */}
              <Card className="border border-border">
                <CardContent className="p-0">
                  <ScrollArea className="max-h-[520px]">
                    <Table>
                      <TableHeader>
                        <TableRow className="bg-muted/50">
                          <TableHead className="text-xs font-medium py-2 px-3 cursor-pointer select-none hover:text-foreground" onClick={() => handleSort('name')}>Name{sortIndicator('name')}</TableHead>
                          <TableHead className="text-xs font-medium py-2 px-3 cursor-pointer select-none hover:text-foreground" onClick={() => handleSort('company')}>Company{sortIndicator('company')}</TableHead>
                          <TableHead className="text-xs font-medium py-2 px-3 cursor-pointer select-none hover:text-foreground" onClick={() => handleSort('revenue')}>Revenue{sortIndicator('revenue')}</TableHead>
                          <TableHead className="text-xs font-medium py-2 px-3 cursor-pointer select-none hover:text-foreground" onClick={() => handleSort('sector')}>Sector{sortIndicator('sector')}</TableHead>
                          <TableHead className="text-xs font-medium py-2 px-3 cursor-pointer select-none hover:text-foreground" onClick={() => handleSort('decision_maker')}>Decision Maker{sortIndicator('decision_maker')}</TableHead>
                          <TableHead className="text-xs font-medium py-2 px-3 cursor-pointer select-none hover:text-foreground" onClick={() => handleSort('job_title')}>Job Title{sortIndicator('job_title')}</TableHead>
                          <TableHead className="text-xs font-medium py-2 px-3 cursor-pointer select-none hover:text-foreground" onClick={() => handleSort('confidence')}>Confidence{sortIndicator('confidence')}</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {filteredData.length === 0 && (
                          <TableRow>
                            <TableCell colSpan={7} className="text-center text-sm text-muted-foreground py-8">
                              No records match the current filter.
                            </TableCell>
                          </TableRow>
                        )}
                        {filteredData.map((row, idx) => {
                          const isLow = /low/i.test(row.confidence ?? '')
                          return (
                            <TableRow key={idx} className={isLow ? 'bg-orange-50/50' : ''}>
                              <TableCell className="text-xs py-1.5 px-3 font-medium">{row.name ?? ''}</TableCell>
                              <TableCell className="text-xs py-1.5 px-3">{row.company ?? ''}</TableCell>
                              <TableCell className="text-xs py-1.5 px-3">{row.revenue ?? ''}</TableCell>
                              <TableCell className="text-xs py-1.5 px-3">{row.sector ?? ''}</TableCell>
                              <TableCell className="text-xs py-1.5 px-3"><DecisionMakerBadge value={row.decision_maker ?? ''} /></TableCell>
                              <TableCell className="text-xs py-1.5 px-3">{row.job_title ?? ''}</TableCell>
                              <TableCell className="text-xs py-1.5 px-3"><ConfidenceBadge value={row.confidence ?? ''} /></TableCell>
                            </TableRow>
                          )
                        })}
                      </TableBody>
                    </Table>
                  </ScrollArea>
                </CardContent>
              </Card>

              {/* Raw Response Fallback (when parsing found no structured data) */}
              {rawResponseText && enrichedData.length === 0 && (
                <Card className="border border-border">
                  <CardHeader className="p-3 pb-2">
                    <CardTitle className="text-sm font-medium flex items-center gap-1.5">
                      <FiAlertTriangle className="w-3.5 h-3.5 text-orange-500" />
                      Agent Response (Raw)
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="p-3 pt-0">
                    <ScrollArea className="max-h-[300px]">
                      <pre className="text-xs text-muted-foreground whitespace-pre-wrap break-words bg-muted/30 p-3 rounded-sm">{rawResponseText}</pre>
                    </ScrollArea>
                  </CardContent>
                </Card>
              )}

              {/* Additional artifact files */}
              {artifactFiles.length > 1 && (
                <Card className="border border-border">
                  <CardHeader className="p-3 pb-2">
                    <CardTitle className="text-sm font-medium">Generated Files</CardTitle>
                  </CardHeader>
                  <CardContent className="p-3 pt-0 space-y-1.5">
                    {artifactFiles.map((file, idx) => (
                      <a key={idx} href={file.file_url} target="_blank" rel="noopener noreferrer" className="flex items-center gap-2 text-xs text-primary hover:underline">
                        <FiDownload className="w-3 h-3" />
                        <span>{file.name ?? `File ${idx + 1}`}</span>
                        {file.format_type && <Badge variant="outline" className="text-[10px] ml-auto">{file.format_type}</Badge>}
                      </a>
                    ))}
                  </CardContent>
                </Card>
              )}

              {/* Start New */}
              <div className="flex justify-center pt-1">
                <button onClick={handleNewEnrichment} className="text-xs text-primary hover:underline flex items-center gap-1">
                  <FiRefreshCw className="w-3 h-3" />
                  Start New Enrichment
                </button>
              </div>
            </div>
          )}

          {/* Agent Status Panel */}
          <AgentStatusPanel activeAgentId={activeAgentId} loading={loading} />
        </main>
      </div>
    </ErrorBoundary>
  )
}
