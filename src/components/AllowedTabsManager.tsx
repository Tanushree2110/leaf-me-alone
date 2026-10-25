import React, { useState } from 'react'
import { CheckCircle2, Puzzle, ShieldCheck } from 'lucide-react'

interface AllowedTabsManagerProps {
  extensionConnected: boolean
  allowedTabsCount: number
}

const EXTENSION_FOLDER_PATH =
  '/Users/tanushree/stupid-project-ideas/leaf-me-alone/chrome-extension'

export const AllowedTabsManager: React.FC<AllowedTabsManagerProps> = ({
  extensionConnected,
  allowedTabsCount,
}) => {
  const [copiedPath, setCopiedPath] = useState(false)

  const handleCopyExtensionPath = () => {
    navigator.clipboard.writeText(EXTENSION_FOLDER_PATH)
    setCopiedPath(true)
    setTimeout(() => setCopiedPath(false), 2500)
  }

  return (
    <div className="flex flex-col gap-2.5 text-xs font-mono">
      {/* Status Card */}
      <div className="flex items-center justify-between rounded-xl border border-emerald-500/30 bg-emerald-950/30 px-3 py-2">
        <span className="flex items-center gap-1.5 font-bold text-emerald-300">
          <ShieldCheck className="h-4 w-4 text-emerald-400" />
          Tab Rule Active
        </span>
        <span className="rounded-full bg-emerald-500/20 px-2 py-0.5 text-[10px] font-bold text-emerald-200">
          {extensionConnected ? `${allowedTabsCount} Tabs Protected` : 'Ready'}
        </span>
      </div>

      {/* Simple 3-Bullet Explanation */}
      <div className="space-y-1.5 rounded-xl border border-stone-800 bg-stone-950 p-3 text-[11px] text-stone-300">
        <div className="flex items-start gap-2">
          <CheckCircle2 className="mt-0.5 h-3.5 w-3.5 shrink-0 text-emerald-400" />
          <span>
            <strong>Existing Tabs Allowed:</strong> Switching between or closing any tab you already had open is 100% allowed.
          </span>
        </div>
        <div className="flex items-start gap-2">
          <CheckCircle2 className="mt-0.5 h-3.5 w-3.5 shrink-0 text-emerald-400" />
          <span>
            <strong>Links from Existing Tabs Allowed:</strong> Clicking a link inside any existing tab to open a sub-tab is allowed.
          </span>
        </div>
        <div className="flex items-start gap-2 text-rose-300">
          <span className="mt-0.5 flex h-3.5 w-3.5 shrink-0 items-center justify-center rounded-full bg-rose-500/20 text-[10px] font-bold text-rose-400">
            ✕
          </span>
          <span>
            <strong>Blocked:</strong> Opening a standalone new tab (`Cmd+T` / `+`), opening a new window (`Cmd+N`), or moving off from Chrome to another app triggers a RED violation.
          </span>
        </div>
      </div>

      {/* 1-Click Chrome Extension Setup if not yet connected */}
      {!extensionConnected && (
        <div className="rounded-xl border border-sky-500/30 bg-sky-950/30 p-2.5 text-[10px] text-sky-200 leading-snug">
          <div className="flex items-center justify-between font-bold text-sky-300 mb-1">
            <span className="flex items-center gap-1">
              <Puzzle className="h-3.5 w-3.5" /> Enable Chrome New-Tab Blocker:
            </span>
            <button
              onClick={handleCopyExtensionPath}
              className="rounded bg-sky-600 px-2 py-0.5 text-[9.5px] font-bold text-white hover:bg-sky-500"
            >
              {copiedPath ? '✓ Copied!' : 'Copy Folder Path'}
            </button>
          </div>
          <div className="text-[9.5px] text-stone-300">
            Open <strong>chrome://extensions</strong> → <strong>Load unpacked</strong> → select copied folder so Chrome automatically closes any `Cmd+T` new tab!
          </div>
        </div>
      )}
    </div>
  )
}
