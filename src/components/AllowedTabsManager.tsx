import React, { useState } from 'react'
import {
  Check,
  ExternalLink,
  GitBranch,
  Lock,
  Plus,
  RefreshCw,
  Trash2,
  Unlock,
} from 'lucide-react'
import { AllowedTab } from '../types'

interface AllowedTabsManagerProps {
  allowedTabs: AllowedTab[]
  isWhitelistLocked: boolean
  activeAllowedTabId: string | null
  extensionConnected: boolean
  onRequestExtensionSync: () => void
  onLockWhitelist: () => void
  onUnlockWhitelistReset: () => void
  onAddInitialTab: (title: string, url: string, openInChrome?: boolean) => void
  onRemoveInitialTab: (id: string) => void
  onExpandSubTab: (parentId: string, title: string, url: string) => void
  onSwitchToAllowedTab: (tab: AllowedTab, openNewWindow?: boolean) => void
}

export const AllowedTabsManager: React.FC<AllowedTabsManagerProps> = ({
  allowedTabs,
  isWhitelistLocked,
  activeAllowedTabId,
  extensionConnected,
  onRequestExtensionSync,
  onLockWhitelist,
  onUnlockWhitelistReset,
  onAddInitialTab,
  onRemoveInitialTab,
  onExpandSubTab,
  onSwitchToAllowedTab,
}) => {
  const [newTitle, setNewTitle] = useState('')
  const [expandingParentId, setExpandingParentId] = useState<string | null>(null)
  const [expandTitle, setExpandTitle] = useState('')

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
    return { title: trimmed, url: '' }
  }

  const handleAddInitial = (e: React.FormEvent) => {
    e.preventDefault()
    if (!newTitle.trim()) return
    const { title, url } = parseInputToTitleAndUrl(newTitle)
    onAddInitialTab(title, url, false)
    setNewTitle('')
  }

  const handleExpandSubmit = (e: React.FormEvent, parentId: string) => {
    e.preventDefault()
    if (!expandTitle.trim()) return
    const { title, url } = parseInputToTitleAndUrl(expandTitle)
    onExpandSubTab(parentId, title, url)
    setExpandTitle('')
    setExpandingParentId(null)
  }

  return (
    <div className="flex flex-col gap-2 text-xs font-mono">
      {/* Top Action Row */}
      <div className="flex items-center justify-between gap-2">
        <button
          onClick={onRequestExtensionSync}
          className="flex items-center gap-1 rounded-lg border border-stone-700 bg-stone-800 px-2 py-1 text-[10px] font-semibold text-stone-300 hover:bg-stone-700"
          title="Sync open Chrome tabs via companion extension"
        >
          <RefreshCw className="h-3 w-3 text-emerald-400" />
          {extensionConnected ? 'Synced with Chrome' : 'Sync Chrome'}
        </button>

        {!isWhitelistLocked ? (
          <button
            onClick={onLockWhitelist}
            className="flex items-center gap-1 rounded-lg bg-emerald-600 px-2.5 py-1 text-[10px] font-bold text-white hover:bg-emerald-500"
          >
            <Lock className="h-3 w-3" />
            Lock Initial Tabs
          </button>
        ) : (
          <button
            onClick={onUnlockWhitelistReset}
            className="flex items-center gap-1 rounded-lg border border-amber-500/40 bg-amber-500/10 px-2.5 py-1 text-[10px] font-bold text-amber-300 hover:bg-amber-500/20"
          >
            <Unlock className="h-3 w-3" />
            Locked (Click to Edit)
          </button>
        )}
      </div>

      {/* Add Initial Chrome Tab Input (Only when unlocked) */}
      {!isWhitelistLocked && (
        <form onSubmit={handleAddInitial} className="flex gap-1.5">
          <input
            type="text"
            value={newTitle}
            onChange={(e) => setNewTitle(e.target.value)}
            placeholder="Add Chrome tab name or URL (e.g. github.com)..."
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

      {/* Clean Tab List */}
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
                  onClick={() => onSwitchToAllowedTab(tab, false)}
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
                    <button
                      onClick={() => onSwitchToAllowedTab(tab, true)}
                      className="rounded p-1 text-stone-500 hover:bg-stone-800 hover:text-stone-200"
                      title={`Open ${tab.url} in Chrome`}
                    >
                      <ExternalLink className="h-3 w-3" />
                    </button>
                  )}
                  <button
                    onClick={() =>
                      setExpandingParentId(expandingParentId === tab.id ? null : tab.id)
                    }
                    className="flex items-center gap-0.5 rounded border border-teal-500/30 bg-teal-950/40 px-1.5 py-0.5 text-[9.5px] font-semibold text-teal-300 hover:bg-teal-900/50"
                  >
                    <GitBranch className="h-2.5 w-2.5" />
                    Sub-tab
                  </button>
                  {!isWhitelistLocked && rootTabs.length > 1 && (
                    <button
                      onClick={() => onRemoveInitialTab(tab.id)}
                      className="rounded p-1 text-stone-500 hover:text-rose-400"
                    >
                      <Trash2 className="h-3 w-3" />
                    </button>
                  )}
                </div>
              </div>

              {/* Expand Sub-Tab inline input */}
              {expandingParentId === tab.id && (
                <form
                  onSubmit={(e) => handleExpandSubmit(e, tab.id)}
                  className="mt-1.5 flex items-center gap-1 border-t border-stone-800 pt-1.5"
                >
                  <input
                    type="text"
                    value={expandTitle}
                    onChange={(e) => setExpandTitle(e.target.value)}
                    placeholder={`Sub-tab from ${tab.title}...`}
                    className="flex-1 rounded border border-stone-700 bg-stone-900 px-2 py-0.5 text-[10px] text-stone-100 focus:outline-none"
                    autoFocus
                  />
                  <button
                    type="submit"
                    className="rounded bg-teal-600 px-2 py-0.5 text-[10px] font-bold text-white"
                  >
                    Add
                  </button>
                </form>
              )}

              {/* Child Sub-Tabs */}
              {children.length > 0 && (
                <div className="mt-1 ml-3 space-y-1 border-l border-stone-800 pl-2">
                  {children.map((child) => (
                    <div
                      key={child.id}
                      onClick={() => onSwitchToAllowedTab(child, false)}
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
