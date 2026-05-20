'use client'

import { useEffect, useState } from 'react'
import { CheckCircle2, XCircle, Loader2, FileText } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Progress } from '@/components/ui/progress'

export interface UploadResult {
  id:   string
  name: string
}

interface UploadItem {
  file:     File
  status:   'pending' | 'uploading' | 'done' | 'error'
  progress: number
  result?:  { id: string }
  error?:   string
}

interface UploadQueueProps {
  files:      File[]
  uploadFn:   (file: File, onProgress: (p: number) => void) => Promise<{ id: string }>
  onComplete: (results: UploadResult[]) => void
  onClose:    () => void
}

export function UploadQueue({ files, uploadFn, onComplete, onClose }: UploadQueueProps) {
  const [items, setItems] = useState<UploadItem[]>(
    files.map((f) => ({ file: f, status: 'pending', progress: 0 })),
  )
  const [finished, setFinished] = useState(false)

  useEffect(() => {
    let active = true

    async function run() {
      const results: UploadResult[] = []

      for (let i = 0; i < files.length; i++) {
        if (!active) break
        setItems((prev) => prev.map((it, idx) => idx === i ? { ...it, status: 'uploading' } : it))
        try {
          const result = await uploadFn(files[i], (progress) => {
            setItems((prev) => prev.map((it, idx) => idx === i ? { ...it, progress } : it))
          })
          setItems((prev) => prev.map((it, idx) =>
            idx === i ? { ...it, status: 'done', progress: 100, result } : it,
          ))
          results.push({ id: result.id, name: files[i].name })
        } catch (err: unknown) {
          const msg = err instanceof Error ? err.message : 'Fehler'
          setItems((prev) => prev.map((it, idx) =>
            idx === i ? { ...it, status: 'error', error: msg } : it,
          ))
        }
      }

      if (active) {
        setFinished(true)
        if (results.length > 0) onComplete(results)
      }
    }

    void run()
    return () => { active = false }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const doneCount  = items.filter((i) => i.status === 'done').length
  const errorCount = items.filter((i) => i.status === 'error').length

  return (
    <div className="space-y-3">
      <div className="space-y-2 max-h-64 overflow-y-auto pr-1">
        {items.map((item, idx) => (
          <div key={idx} className="flex items-center gap-3 rounded-lg border p-3 bg-card">
            <FileText className="h-4 w-4 shrink-0 text-muted-foreground" />
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium truncate">{item.file.name}</p>
              {item.status === 'uploading' && (
                <Progress value={item.progress} className="h-1.5 mt-1.5" />
              )}
              {item.status === 'error' && (
                <p className="text-xs text-destructive mt-0.5 truncate">{item.error}</p>
              )}
            </div>
            <div className="shrink-0">
              {item.status === 'pending'   && <Loader2 className="h-4 w-4 text-muted-foreground" />}
              {item.status === 'uploading' && <Loader2 className="h-4 w-4 text-primary animate-spin" />}
              {item.status === 'done'      && <CheckCircle2 className="h-4 w-4 text-emerald-500" />}
              {item.status === 'error'     && <XCircle className="h-4 w-4 text-destructive" />}
            </div>
          </div>
        ))}
      </div>

      {finished && (
        <div className={`rounded-lg p-3 text-sm border ${errorCount === 0 ? 'bg-emerald-50 border-emerald-200 text-emerald-700' : 'bg-amber-50 border-amber-200 text-amber-700'}`}>
          {doneCount} von {files.length} Dateien hochgeladen
          {doneCount > 0 && ' · KI-Analyse läuft im Hintergrund'}
          {errorCount > 0 && ` · ${errorCount} Fehler`}
        </div>
      )}

      <Button
        onClick={onClose}
        variant={finished ? 'default' : 'outline'}
        className="w-full"
      >
        {finished ? 'Schließen' : 'Abbrechen'}
      </Button>
    </div>
  )
}
