'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import { Icon } from '@/components/ui'
import type { Notice } from '@/lib/notifications'

const seenKey = (userId: string) => `nsib-seen-notices-${userId}`

function readSeen(userId: string): string[] {
  try {
    return JSON.parse(window.localStorage.getItem(seenKey(userId)) || '[]')
  } catch {
    return []
  }
}

function writeSeen(userId: string, ids: string[]) {
  try {
    window.localStorage.setItem(seenKey(userId), JSON.stringify(ids.slice(-400)))
  } catch {
    /* a full or blocked localStorage only costs us the "already seen" memory */
  }
}

/**
 * A bell that lists everything waiting on you, and — on the first load where
 * something is new — a plain-language popup that says so outright. The nav
 * badges alone were too quiet to notice.
 */
export function Notifications({ notices, userId, onOpen }: { notices: Notice[]; userId: string; onOpen: (section: string) => void }) {
  const [seen, setSeen] = useState<string[] | null>(null)
  const [listOpen, setListOpen] = useState(false)
  const [popupDismissed, setPopupDismissed] = useState(false)
  const panel = useRef<HTMLDivElement>(null)

  useEffect(() => {
    setSeen(readSeen(userId))
  }, [userId])

  useEffect(() => {
    if (!listOpen) return
    const onClickAway = (event: MouseEvent) => {
      if (panel.current && !panel.current.contains(event.target as Node)) setListOpen(false)
    }
    const onKey = (event: KeyboardEvent) => event.key === 'Escape' && setListOpen(false)
    document.addEventListener('mousedown', onClickAway)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('mousedown', onClickAway)
      document.removeEventListener('keydown', onKey)
    }
  }, [listOpen])

  // Until localStorage has been read, treat nothing as unread so the popup does
  // not flash on every page load before we know what was already dismissed.
  const unread = useMemo(() => (seen === null ? [] : notices.filter(notice => !seen.includes(notice.id))), [notices, seen])

  const markAllSeen = () => {
    const ids = Array.from(new Set([...(seen || []), ...notices.map(notice => notice.id)]))
    setSeen(ids)
    writeSeen(userId, ids)
  }

  const go = (notice: Notice) => {
    markAllSeen()
    setListOpen(false)
    setPopupDismissed(true)
    onOpen(notice.section)
  }

  const showPopup = !popupDismissed && unread.length > 0
  const headline = unread[0]

  return (
    <>
      <div className="bell-wrap" ref={panel}>
        <button
          type="button"
          className={unread.length ? 'bell has-unread' : 'bell'}
          onClick={() => {
            setListOpen(open => !open)
            setPopupDismissed(true)
          }}
          aria-label={unread.length ? `Notifications, ${unread.length} new` : 'Notifications'}
          aria-expanded={listOpen}
        >
          <Icon name="bell" size={20} />
          {unread.length > 0 && <span className="bell-count">{unread.length}</span>}
        </button>

        {listOpen && (
          <div className="bell-panel" role="dialog" aria-label="Notifications">
            <div className="bell-panel-head">
              <strong>Notifications</strong>
              {notices.length > 0 && (
                <button type="button" className="text-button" onClick={markAllSeen}>
                  Mark all as read
                </button>
              )}
            </div>
            {notices.length ? (
              <ul className="bell-list">
                {notices.slice(0, 30).map(notice => (
                  <li key={notice.id}>
                    <button type="button" className={seen?.includes(notice.id) ? 'bell-item' : 'bell-item unread'} onClick={() => go(notice)}>
                      <span className={`bell-mark bell-${notice.tone}`}>
                        <Icon name={notice.icon} size={15} />
                      </span>
                      <span className="bell-copy">
                        <strong>{notice.title}</strong>
                        <small>{notice.detail}</small>
                      </span>
                      {!seen?.includes(notice.id) && <span className="bell-dot" aria-hidden="true" />}
                    </button>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="bell-empty">Nothing needs your attention.</p>
            )}
          </div>
        )}
      </div>

      {showPopup && headline && (
        <div className="notice-popup-backdrop" role="dialog" aria-modal="true" aria-labelledby="notice-popup-title">
          <div className="notice-popup">
            <span className={`notice-popup-mark bell-${headline.tone}`}>
              <Icon name={headline.icon} size={30} />
            </span>
            <h2 id="notice-popup-title">{headline.title}</h2>
            <p>{headline.detail}</p>
            {unread.length > 1 && (
              <p className="notice-popup-more">
                And {unread.length - 1} other {unread.length - 1 === 1 ? 'item' : 'items'} waiting for you.
              </p>
            )}
            <div className="notice-popup-actions">
              <button
                type="button"
                className="secondary"
                onClick={() => {
                  markAllSeen()
                  setPopupDismissed(true)
                }}
              >
                Close
              </button>
              <button type="button" className="primary" onClick={() => go(headline)}>
                Take me there
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  )
}
