import { Fragment } from 'react'

/** Códigos como `RS-2026-0106` nunca quebram no meio da linha. */
export function nowrapCodes(text: string) {
  return text.split(/([A-Z]{2}-\d{4}-\d+)/).map((part, i) => (i % 2 ? <span key={i} className="fx-nowrap">{part}</span> : <Fragment key={i}>{part}</Fragment>))
}
