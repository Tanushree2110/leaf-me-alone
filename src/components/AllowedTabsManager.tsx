import React, { useState } from 'react'
import {
  Check,
  ExternalLink,
  GitBranch,
  Lock,
  Plus,
  Puzzle,
  RefreshCw,
  Trash2,
  Unlock,
} from 'lucide-react'
import { AllowedTab } from '../types'

interface AllowedTabsManagerProps {
  allowedTabs: AllowedTab[]
  isWhitelistLocked: boolean
  isPomodoroRunning: boolean
  activeAllowedTabId: string | null
  extensionConnected: boolean
  onRequestExtensionSync: () => void
  onLockWhitelist: () => void
  onUnlockWhitelistReset: () => void
  onAddInitialTab: (title: string, url: string) => void
  onRemoveInitialTab: (id: string) => void
  onOpenLinkFromExistingTab: (parentTab: AllowedTab, linkUrl: string) => void
  onSwitchToAllowedTab: (tab: AllowedTab) => void
}

const EXTENSION_FOLDER_PATH =
  '/Users/tanushree/stupid-project-ideas/leaf-me-alone/chrome-extension'

export const AllowedTabsManager: React.FC<AllowedTabsManagerProps> = ({
  allowedTabs,
  isWhitelistLocked,
  isPomodoroRunning,
  activeAllowedTabId,
  extensionConnected,
  onRequestExtensionSync,
  onLockWhitelist,
  onUnlockWhitelistReset,
  onAddInitialTab,
  onRemoveInitialTab,
  onOpenLinkFromExistingTab,
  onSwitchToAllowedTab,
}) => {
  const [newTitle, setNewTitle] = useState('')
  const [copiedPath, setCopiedPath] = useState(false)

  const rootTabs = allowedTabs.filter((t) => !t.parentId)
  const getChildren = (parentId: string) =>
    allowedTabs.filter((t) => t.parentId === parentId)

  const parseInputToTitleAndUrl = (raw: string) => {
    const trimmed = raw.trim()
    if (trimmed.startsWith('http://') || trimmed.startsWith('https://')) {
      try {
        const u = new URL(trimmed)
        return { title: u.hostname.replace(/^www\./, ''), url: trimmed }
      } catch {
        return { title: trimmed, url: trimmed }
      }
    }
    if (trimmed.includes('.') && !trimmed.includes(' ')) {
      return { title: trimmed, url: `https://${trimmed}` }
    }
    return { title: trimmed, url: `https://www.google.com/search?q=${encodeURIComponent(trimmed)}` }
  }

  const handleAddInitial = (e: React.FormEvent) => {
    e.preventDefault()
    if (isWhitelistLocked || isPomodoroRunning || !newTitle.trim()) return
    const { title, url } = parseInputToTitleAndUrl(newTitle)
    onAddInitialTab(title, url)
    setNewTitle('')
  }

  const handleCopyExtensionPath = () => {
    navigator.clipboard.writeText(EXTENSION_FOLDER_PATH)
    setCopiedPath(true)
    setTimeout(() => setCopiedPath(false), 2500)
  }

  const locked = isWhitelistLocked || isPomodoroRunning

  return (
    <div className="flex flex-col gap-2 text-xs font-mono">
      {/* Top Action Row */}
      <div className="flex items-center justify-between gap-2">
        <button
          onClick={onRequestExtensionSync}
          className={`flex items-center gap-1 rounded-lg border px-2 py-1 text-[10px] font-semibold transition ${
            extensionConnected
              ? 'border-emerald-500/40 bg-emerald-950/40 text-emerald-300'
              : 'border-stone-700 bg-stone-800 text-stone-300 hover:bg-stone-700'
          }`}
        >
          <RefreshCw className="h-3 w-3 text-emerald-400" />
          {extensionConnected ? 'Strict Tab Blocker Active' : 'Sync Chrome Tabs'}
        </button>

        {!locked ? (
          <button
            onClick={onLockWhitelist}
            className="flex items-center gap-1 rounded-lg bg-emerald-600 px-2.5 py-1 text-[10px] font-bold text-white hover:bg-emerald-500"
          >
            <Lock className="h-3 w-3" />
            Lock Initial Tabs
          </button>
        ) : (
          <button
            disabled={isPomodoroRunning}
            onClick={() => {
              if (!isPomodoroRunning) onUnlockWhitelistReset()
            }}
            className={`flex items-center gap-1 rounded-lg border border-amber-500/40 bg-amber-500/10 px-2.5 py-1 text-[10px] font-bold text-amber-300 ${
              isPomodoroRunning ? 'opacity-60 cursor-not-allowed' : 'hover:bg-amber-500/20'
            }`}
            title={
              isPomodoroRunning
                ? 'Stop Pomodoro session first to edit initial tabs'
                : 'Click to edit initial tabs'
            }
          >
            {isPomodoroRunning ? <Lock className="h-3 w-3" /> : <Unlock className="h-3 w-3" />}
            {isPomodoroRunning ? 'Locked (No New Tabs)' : 'Locked (Edit)'}
          </button>
        )}
      </div>

      {/* Strict Rule Notice */}
      <div className="rounded-lg border border-rose-500/30 bg-rose-950/30 px-2.5 py-1.5 text-[10px] text-rose-200 leading-snug">
        <strong>No New Tabs Allowed:</strong> Opening a new tab (`Cmd+T` / `+`) is blocked &amp; turns the studio <strong>RED</strong>. Only clicking a link from an existing tab below is allowed!
      </div>

      {/* 1-Click Chrome Extension Setup Banner if not yet connected */}
      {!extensionConnected && (
        <div className="rounded-lg border border-sky-500/30 bg-sky-950/30 p-2 text-[10px] text-sky-200 leading-snug">
          <div className="flex items-center justify-between font-bold text-sky-300 mb-1">
            <span className="flex items-center gap-1">
              <Puzzle className="h-3 w-3" /> Auto-Close New Tabs in Chrome:
            </span>
            <button
              onClick={handleCopyExtensionPath}
              className="rounded bg-sky-600 px-2 py-0.5 text-[9.5px] font-bold text-white hover:bg-sky-500"
            >
              {copiedPath ? '✓ Copied Path!' : 'Copy Extension Folder'}
            </button>
          </div>
          <div className="text-[9.5px] text-stone-300">
            Load/Reload in <strong>chrome://extensions</strong> → <strong>Load unpacked</strong> so Chrome physically closes any `Cmd+T` new tab!
          </div>
        </div>
      )}

      {/* Add Initial Chrome Tab Input (Only when stopped & unlocked) */}
      {!locked && (
        <form onSubmit={handleAddInitial} className="flex gap-1.5">
          <input
            type="text"
            value={newTitle}
            onChange={(e) => setNewTitle(e.target.value)}
            placeholder="Add initial tab URL (e.g. github.com)..."
            className="flex-1 rounded-lg border border-stone-700 bg-stone-950 px-2.5 py-1.5 text-[11px] text-stone-100 focus:border-emerald-500 focus:outline-none"
          />
          <button
            type="submit"
            className="flex items-center gap-1 rounded-lg bg-stone-800 px-2.5 py-1.5 text-[11px] font-bold text-emerald-300 hover:bg-stone-700"
          >
            <Plus className="h-3.5 w-3.5" /> Add
          </button>
        </form>
      )}

      {/* Existing Allowed Tabs + Clickable Links */}
      <div className="max-h-48 space-y-1.5 overflow-y-auto pr-0.5">
        {rootTabs.map((tab) => {
          const children = getChildren(tab.id)
          const isSelected = activeAllowedTabId === tab.id

          return (
            <div
              key={tab.id}
              className="rounded-lg border border-stone-800 bg-stone-950/90 p-2"
            >
              <div className="flex items-center justify-between gap-1.5">
                <button
                  onClick={() => onSwitchToAllowedTab(tab)}
                  className={`flex items-center gap-1.5 truncate rounded px-1.5 py-0.5 text-[11px] font-bold transition ${
                    isSelected
                      ? 'text-emerald-300'
                      : 'text-stone-300 hover:text-white'
                  }`}
                >
                  {isSelected && <Check className="h-3 w-3 text-emerald-400 shrink-0" />}
                  <span className="truncate">{tab.title}</span>
                </button>

                <div className="flex items-center gap-1 shrink-0">
                  {tab.url && tab.url.startsWith('http') && (
                    <a
                      href={tab.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      onClick={(e) => {
                        e.preventDefault()
                        onOpenLinkFromExistingTab(tab, tab.url)
                      }}
                      className="flex items-center gap-1 rounded border border-emerald-500/30 bg-emerald-950/40 px-1.5 py-0.5 text-[9.5px] font-semibold text-emerald-300 hover:bg-emerald-900/50"
                      title="Open link from this existing tab (Allowed)"
                    >
                      <ExternalLink className="h-2.5 w-2.5" />
                      Open Link
                    </a>
                  )}
                  {!locked && rootTabs.length > 1 && (
                    <button
                      onClick={() => onRemoveInitialTab(tab.id)}
                      className="rounded p-1 text-stone-500 hover:text-rose-400"
                    >
                      <Trash2 className="h-3 w-3" />
                    </button>
                  )}
                </div>
              </div>

              {children.length > 0 && (
                <div className="mt-1 ml-3 space-y-1 border-l border-stone-800 pl-2">
                  {children.map((child) => (
                    <div
                      key={child.id}
                      onClick={() => onSwitchToAllowedTab(child)}
                      className="flex cursor-pointer items-center gap-1.5 text-[10px] text-teal-300 hover:underline"
                    >
                      <GitBranch className="h-2.5 w-2.5 shrink-0" />
                      <span className="truncate">{child.title}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}
