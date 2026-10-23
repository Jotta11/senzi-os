import { useState, type FormEvent } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { getSupabase } from '@/lib/supabase'
import { errorMessage } from '@/lib/errorMessages'
import { Button, Card, Field } from '@/ui'

const digits = (v: string) => v.replace(/\D/g, '').slice(0, 6)

/** PIN do próprio administrador, usado para autorizar exceções no balcão. */
export function PinTab() {
  const qc = useQueryClient()
  const [pin, setPin] = useState('')
  const [confirm, setConfirm] = useState('')
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null)
  const [busy, setBusy] = useState(false)

  async function submit(e: FormEvent) {
    e.preventDefault()
    setMsg(null)
    if (pin !== confirm) return setMsg({ ok: false, text: 'Os PINs não conferem.' })
    const sb = getSupabase()
    if (!sb) return
    setBusy(true)
    try {
      const { error } = await sb.rpc('set_my_pin', { p_pin: pin })
      if (error) throw error
      setPin('')
      setConfirm('')
      setMsg({ ok: true, text: 'PIN salvo.' })
      await qc.invalidateQueries({ queryKey: ['active_admins'] })
    } catch (err) {
      setMsg({ ok: false, text: errorMessage(err) })
    } finally {
      setBusy(false)
    }
  }

  return (
    <Card title="Meu PIN de autorização">
      <form className="cfg-narrow" onSubmit={submit} noValidate>
        <p className="muted">
          Com o PIN você autoriza exceções no balcão, como retirada com saldo em aberto ou desconto acima do limite. Use de 4 a
          6 dígitos e não compartilhe.
        </p>
        <Field
          label="Novo PIN"
          type="password"
          inputMode="numeric"
          autoComplete="new-password"
          maxLength={6}
          value={pin}
          onChange={(e) => setPin(digits(e.target.value))}
        />
        <Field
          label="Confirmar PIN"
          type="password"
          inputMode="numeric"
          autoComplete="new-password"
          maxLength={6}
          value={confirm}
          onChange={(e) => setConfirm(digits(e.target.value))}
        />
        {msg && (
          <p className={`note ${msg.ok ? 'green' : 'red'}`} role={msg.ok ? 'status' : 'alert'}>
            {msg.text}
          </p>
        )}
        <div>
          <Button type="submit" variant="primary" icon="chave" disabled={busy || !pin}>
            Salvar PIN
          </Button>
        </div>
      </form>
    </Card>
  )
}
