'use client'

import { useCallback, useState } from 'react'
import { Upload } from 'lucide-react'
import { cn } from '@/lib/utils'

interface DropZoneProps {
  onFiles: (files: File[]) => void
  accept?: string[]
  maxSizeMb?: number
  label?: string
  disabled?: boolean
  className?: string
  children?: React.ReactNode
}

export function DropZone({
  onFiles,
  accept,
  maxSizeMb = 25,
  label,
  disabled,
  className,
  children,
}: DropZoneProps) {
  const [dragging, setDragging] = useState(false)

  const filterFiles = useCallback(
    (raw: FileList | File[]) =>
      Array.from(raw).filter((f) => {
        if (accept && !accept.some((a) => f.type === a || f.name.toLowerCase().endsWith(a.replace('*', '')))) return false
        if (maxSizeMb && f.size > maxSizeMb * 1024 * 1024) return false
        return true
      }),
    [accept, maxSizeMb],
  )

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault()
      setDragging(false)
      if (disabled) return
      const files = filterFiles(e.dataTransfer.files)
      if (files.length) onFiles(files)
    },
    [onFiles, filterFiles, disabled],
  )

  const handleFileInput = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const files = filterFiles(Array.from(e.target.files ?? []))
      if (files.length) onFiles(files)
      e.target.value = ''
    },
    [onFiles, filterFiles],
  )

  // Wrap-Modus: children als Inhalt, DropZone als Overlay
  if (children) {
    return (
      <div
        className={cn('relative', className)}
        onDragOver={(e) => { e.preventDefault(); if (!disabled) setDragging(true) }}
        onDragLeave={() => setDragging(false)}
        onDrop={handleDrop}
      >
        {children}
        {dragging && (
          <div className="absolute inset-0 z-50 flex flex-col items-center justify-center rounded-xl bg-primary/10 border-2 border-dashed border-primary pointer-events-none">
            <Upload className="h-10 w-10 text-primary mb-2" />
            <p className="text-sm font-semibold text-primary">Dateien hier ablegen</p>
          </div>
        )}
      </div>
    )
  }

  // Stand-alone Modus
  return (
    <label
      className={cn(
        'flex flex-col items-center justify-center gap-3 rounded-xl border-2 border-dashed p-8 transition-colors cursor-pointer select-none',
        dragging
          ? 'border-primary bg-primary/5'
          : 'border-border hover:border-primary/50 hover:bg-muted/30',
        disabled && 'opacity-50 cursor-not-allowed',
        className,
      )}
      onDragOver={(e) => { e.preventDefault(); if (!disabled) setDragging(true) }}
      onDragLeave={() => setDragging(false)}
      onDrop={handleDrop}
    >
      <input
        type="file"
        className="hidden"
        multiple
        accept={accept?.join(',')}
        onChange={handleFileInput}
        disabled={disabled}
      />
      <div className={cn(
        'flex h-12 w-12 items-center justify-center rounded-xl transition-colors',
        dragging ? 'bg-primary' : 'bg-muted',
      )}>
        <Upload className={cn('h-6 w-6', dragging ? 'text-white' : 'text-muted-foreground')} />
      </div>
      <div className="text-center">
        <p className="text-sm font-medium">{label ?? 'Dateien hier ablegen oder klicken'}</p>
        <p className="text-xs text-muted-foreground mt-0.5">
          {accept ? accept.map((a) => a.split('/')[1]?.toUpperCase() ?? a).join(', ') : 'PDF, JPG, PNG'} · max. {maxSizeMb} MB
        </p>
      </div>
    </label>
  )
}
