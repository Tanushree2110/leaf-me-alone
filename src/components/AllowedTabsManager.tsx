import React, { useState } from 'react'
import {
  Check,
  ExternalLink,
  GitBranch,
  Lock,
  Plus,
  Puzzle,
  ShieldAlert,
  ShieldCheck,
  Trash2,
  Unlock,
} from 'lucide-react'
import { AllowedTab } from '../types'

interface AllowedTabsManagerProps {
  allowedTabs: AllowedTab[]
  isWhitelistLocked: boolean
  activeAllowedTabId: string | null
  extensionConnected: boolean
  onLockWhitelist: () => void
  onUnlockWhitelistReset: () => void
  onAddInitialTab: (title: string, url: string) => void
  onRemoveInitialTab: (id: string) => void
  onExpandSubTab: (parentId: string, title: string, url: string) => void
  onSwitchToAllowedTab: (tab: AllowedTab, openNewWindow?: boolean) => void
  onTriggerUnauthorizedTab: (attemptedTitle?: string) => void
}

export const AllowedTabsManager: React.FC<AllowedTabsManagerProps> = ({
  allowedTabs,
  isWhitelistLocked,
  activeAllowedTabId,
  extensionConnected,
  onLockWhitelist,
  onUnlockWhitelistReset,
  onAddInitialTab,
  onRemoveInitialTab,
  onExpandSubTab,
  onSwitchToAllowedTab,
  onTriggerUnauthorizedTab,
}) => {
  const [newTitle, setNewTitle] = useState('')
  const [newUrl, setNewUrl] = useState('')
  const [expandingParentId, setExpandingParentId] = useState<string | null>(null)
  const [expandTitle, setExpandTitle] = useState('')
  const [expandUrl, setExpandUrl] = useState('')
  const [unapprovedInput, setUnapprovedInput] = useState('')

  const rootTabs = allowedTabs.filter((t) => !t.parentId)
  const getChildren = (parentId: string) =>
    allowedTabs.filter((t) => t.parentId === parentId)

  const handleAddInitial = (e: React.FormEvent) => {
    e.preventDefault()
    if (!newTitle.trim()) return
    onAddInitialTab(newTitle.trim(), newUrl.trim() || 'https://')
    setNewTitle('')
    setNewUrl('')
  }

  const handleExpandSubmit = (e: React.FormEvent, parentId: string) => {
    e.preventDefault()
    if (!expandTitle.trim()) return
    onExpandSubTab(parentId, expandTitle.trim(), expandUrl.trim() || 'https://')
    setExpandTitle('')
    setExpandUrl('')
    setExpandingParentId(null)
  }

  const handleTryOpenUnapproved = (e: React.FormEvent) => {
    e.preventDefault()
    const title = unapprovedInput.trim() || 'Random YouTube / Reddit Tab'
    setUnapprovedInput('')
    onTriggerUnauthorizedTab(title)
  }

  return (
    <div className="flex flex-col gap-2.5 rounded-xl border border-stone-800 bg-stone-900/95 p-3 text-xs">
      {/* Header & Lock State */}
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-1.5 font-mono font-bold text-stone-100">
          <ShieldCheck className="h-4 w-4 text-emerald-400" />
          <span>Allowed Existing Tabs ({allowedTabs.length})</span>
        </div>

        {!isWhitelistLocked ? (
          <button
            onClick={onLockWhitelist}
            className="flex items-center gap-1 rounded-lg bg-emerald-600 px-2.5 py-1 font-mono text-[10px] font-bold text-white hover:bg-emerald-500"
          >
            <Lock className="h-3 w-3" />
            Lock Initial Tabs
          </button>
        ) : (
          <div className="flex items-center gap-1.5">
            <span className="flex items-center gap-1 rounded-md border border-amber-500/40 bg-amber-500/10 px-2 py-0.5 font-mono text-[10px] font-semibold text-amber-300">
              <Lock className="h-2.5 w-2.5" /> Locked (Expand Only)
            </span>
            <button
              onClick={onUnlockWhitelistReset}
              className="rounded-md border border-stone-700 bg-stone-800 p-1 text-stone-400 hover:text-stone-200"
              title="Unlock to edit initial root tabs"
            >
              <Unlock className="h-3 w-3" />
            </button>
          </div>
        )}
      </div>

      {/* Status Notice: Switching to existing tabs is SAFE */}
      <div className="rounded-lg border border-emerald-500/30 bg-emerald-950/30 px-2.5 py-1.5 font-mono text-[10px] text-emerald-200 leading-snug">
        ✓ <strong>Existing Tabs Safe:</strong> Switching between your existing browser tabs is{' '}
        <strong>ALLOWED</strong> and keeps your vine growing! Violations only happen if you
        open an unapproved new tab or doomscroll-hop (4+ rapid switches in 15s).
      </div>

      {/* Initial Setup Form (Only when unlocked at start of session) */}
      {!isWhitelistLocked ? (
        <form onSubmit={handleAddInitial} className="flex gap-1.5">
          <input
            type="text"
            value={newTitle}
            onChange={(e) => setNewTitle(e.target.value)}
            placeholder="Add your existing open tab (e.g. Docs, IDE)..."
            className="flex-1 rounded-lg border border-stone-700 bg-stone-950 px-2.5 py-1 font-mono text-[11px] text-stone-100 focus:border-emerald-500 focus:outline-none"
          />
          <input
            type="text"
            value={newUrl}
            onChange={(e) => setNewUrl(e.target.value)}
            placeholder="URL (optional)"
            className="w-24 rounded-lg border border-stone-700 bg-stone-950 px-2 py-1 font-mono text-[11px] text-stone-300 focus:border-emerald-500 focus:outline-none"
          />
          <button
            type="submit"
            className="flex items-center gap-1 rounded-lg border border-emerald-500/40 bg-emerald-950/60 px-2.5 py-1 font-mono text-[11px] font-bold text-emerald-300 hover:bg-emerald-900/60"
          >
            <Plus className="h-3 w-3" /> Add
          </button>
        </form>
      ) : (
        /* When locked, trying to open a brand new root tab triggers violation! */
        <form onSubmit={handleTryOpenUnapproved} className="flex gap-1.5">
          <input
            type="text"
            value={unapprovedInput}
            onChange={(e) => setUnapprovedInput(e.target.value)}
            placeholder="Try opening a new unapproved root tab..."
            className="flex-1 rounded-lg border border-rose-500/30 bg-stone-950 px-2.5 py-1 font-mono text-[10.5px] text-stone-200 focus:border-rose-500 focus:outline-none"
          />
          <button
            type="submit"
            className="flex items-center gap-1 rounded-lg border border-rose-500/40 bg-rose-950/50 px-2 py-1 font-mono text-[10px] font-bold text-rose-300 hover:bg-rose-900/60 shrink-0"
          >
            <ShieldAlert className="h-3 w-3" /> Open New Tab
          </button>
        </form>
      )}

      {/* Allowed Tabs Tree (Root tabs + Expanded Sub-tabs) */}
      <div className="max-h-36 space-y-1.5 overflow-y-auto pr-1">
        {rootTabs.map((tab) => {
          const children = getChildren(tab.id)
          const isSelected = activeAllowedTabId === tab.id

          return (
            <div
              key={tab.id}
              className="rounded-lg border border-stone-800 bg-stone-950/80 p-2"
            >
              <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-1.5 min-w-0">
                  <button
                    onClick={() => onSwitchToAllowedTab(tab, false)}
                    className={`flex items-center gap-1.5 truncate rounded-md px-2 py-0.5 font-mono text-[11px] font-bold transition ${
                      isSelected
                        ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/40'
                        : 'bg-stone-900 text-stone-200 hover:bg-stone-800'
                    }`}
                    title="Select as active existing tab"
                  >
                    {isSelected && <Check className="h-3 w-3 text-emerald-400 shrink-0" />}
                    <span className="truncate">{tab.title}</span>
                  </button>
                  {tab.url && tab.url.startsWith('http') && (
                    <button
                      onClick={() => onSwitchToAllowedTab(tab, true)}
                      className="rounded p-1 text-stone-500 hover:bg-stone-800 hover:text-stone-200"
                      title={`Launch ${tab.url}`}
                    >
                      <ExternalLink className="h-3 w-3" />
                    </button>
                  )}
                </div>

                <div className="flex items-center gap-1 shrink-0">
                  <button
                    onClick={() =>
                      setExpandingParentId(expandingParentId === tab.id ? null : tab.id)
                    }
                    className="flex items-center gap-1 rounded border border-teal-500/30 bg-teal-950/40 px-1.5 py-0.5 font-mono text-[9.5px] font-semibold text-teal-300 hover:bg-teal-900/50"
                    title="Expand a child sub-tab from this allowed tab"
                  >
                    <GitBranch className="h-2.5 w-2.5" />
                    + Expand
                  </button>
                  {!isWhitelistLocked && rootTabs.length > 1 && (
                    <button
                      onClick={() => onRemoveInitialTab(tab.id)}
                      className="rounded p-1 text-stone-500 hover:bg-stone-800 hover:text-rose-400"
                    >
                      <Trash2 className="h-3 w-3" />
                    </button>
                  )}
                </div>
              </div>

              {/* Expand Sub-Tab inline form */}
              {expandingParentId === tab.id && (
                <form
                  onSubmit={(e) => handleExpandSubmit(e, tab.id)}
                  className="mt-2 flex items-center gap-1.5 border-t border-stone-800/80 pt-2"
                >
                  <GitBranch className="h-3 w-3 text-teal-400 shrink-0" />
                  <input
                    type="text"
                    value={expandTitle}
                    onChange={(e) => setExpandTitle(e.target.value)}
                    placeholder={`Expand child tab from ${tab.title}...`}
                    className="flex-1 rounded border border-stone-700 bg-stone-900 px-2 py-0.5 font-mono text-[10px] text-stone-100 focus:border-teal-500 focus:outline-none"
                    autoFocus
                  />
                  <button
                    type="submit"
                    className="rounded bg-teal-600 px-2 py-0.5 font-mono text-[10px] font-bold text-white hover:bg-teal-500"
                  >
                    Branch
                  </button>
                </form>
              )}

              {/* Expanded Child Sub-Tabs */}
              {children.length > 0 && (
                <div className="mt-1.5 ml-3 space-y-1 border-l border-teal-500/30 pl-2.5">
                  {children.map((child) => {
                    const isChildActive = activeAllowedTabId === child.id
                    return (
                      <div
                        key={child.id}
                        className="flex items-center justify-between gap-2"
                      >
                        <button
                          onClick={() => onSwitchToAllowedTab(child, false)}
                          className={`flex items-center gap-1.5 truncate rounded px-2 py-0.5 font-mono text-[10.5px] transition ${
                            isChildActive
                              ? 'bg-teal-500/20 text-teal-200 border border-teal-500/40 font-bold'
                              : 'text-stone-300 hover:bg-stone-900'
                          }`}
                        >
                          <GitBranch className="h-2.5 w-2.5 text-teal-400 shrink-0" />
                          <span className="truncate">{child.title}</span>
                        </button>
                        <span className="font-mono text-[9px] text-teal-400/70">
                          from {tab.title}
                        </span>
                      </div>
                    )
                  })}
                </div>
              )}
            </div>
          )
        })}
      </div>

      {/* Footer: Extension Status */}
      <div className="flex items-center justify-between border-t border-stone-800/80 pt-1.5 font-mono text-[9.5px] text-stone-400">
        <span className="flex items-center gap-1">
          <Puzzle className="h-3 w-3 text-teal-400" />
          {extensionConnected
            ? 'Chrome Extension Active: Syncing real browser tabs'
            : 'Smart Tab Mode: Existing tabs allowed · Rapid tab-hopping blocked'}
        </span>
      </div>
    </div>
  )
}
