import { useId, type InputHTMLAttributes, type SelectHTMLAttributes, type TextareaHTMLAttributes } from 'react'

type Common = { label: string; error?: string; hint?: string }

export type FieldProps = Common &
  (
    | ({ as?: 'input' } & InputHTMLAttributes<HTMLInputElement>)
    | ({ as: 'textarea' } & TextareaHTMLAttributes<HTMLTextAreaElement>)
    | ({ as: 'select' } & SelectHTMLAttributes<HTMLSelectElement>)
  )

export function Field(props: FieldProps) {
  const autoId = useId()
  const { label, error, hint, id = autoId } = props
  const describedBy = [hint && !error && `${id}-hint`, error && `${id}-error`].filter(Boolean).join(' ') || undefined
  const aria = { id, 'aria-invalid': error ? true : undefined, 'aria-describedby': describedBy }

  let control
  if (props.as === 'textarea') {
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const { as: _as, label: _l, error: _e, hint: _h, ...rest } = props
    control = <textarea {...rest} {...aria} />
  } else if (props.as === 'select') {
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const { as: _as, label: _l, error: _e, hint: _h, ...rest } = props
    control = <select {...rest} {...aria} />
  } else {
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const { as: _as, label: _l, error: _e, hint: _h, ...rest } = props
    control = <input {...rest} {...aria} />
  }

  return (
    <div className={error ? 'field has-error' : 'field'}>
      <label htmlFor={id}>{label}</label>
      {control}
      {hint && !error && (
        <span className="hint" id={`${id}-hint`}>
          {hint}
        </span>
      )}
      {error && (
        <span className="error" id={`${id}-error`} role="alert">
          {error}
        </span>
      )}
    </div>
  )
}
