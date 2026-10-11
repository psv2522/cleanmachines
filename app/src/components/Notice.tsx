import type { ReactNode } from 'react'
import './Notice.css'

interface NoticeProps {
  tone?: 'neutral' | 'warning' | 'error'
  title: string
  children?: ReactNode
  actions?: ReactNode
  /** Announce politely (status) or assertively (alert). */
  role?: 'status' | 'alert'
}

/** Centred message for empty and error states inside a data region. */
export function Notice({ tone = 'neutral', title, children, actions, role = 'status' }: NoticeProps) {
  return (
    <div className={`notice notice--${tone}`} role={role}>
      <p className="notice__title">{title}</p>
      {children && <div className="notice__body">{children}</div>}
      {actions && <div className="notice__actions">{actions}</div>}
    </div>
  )
}

export function Spinner({ label }: { label?: string }) {
  return <span className="spinner" role={label ? 'img' : undefined} aria-label={label} aria-hidden={label ? undefined : true} />
}
