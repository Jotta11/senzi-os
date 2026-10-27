/**
 * De onde o diálogo de PIN tira os administradores e a autorização. Padrão = banco (RPCs `list_active_admins`
 * e `authorize_exception`); a prévia fornece a versão em memória, com `demoHint` ("PIN de demonstração: 1234").
 * Falha de autenticação vem no retorno (`{ ok: false, error }`, inclusive erro lançado pela RPC); falha de rede, como exceção.
 */
import { createContext, createElement, useContext, type ReactNode } from 'react'
import { getSupabase } from '@/lib/supabase'
import type { ActiveAdmin, AuthorizeArgs, AuthorizeResult, ExceptionsSource } from '@/data/source-reservas'

export type ExceptionAuthorizer = {
  listActiveAdmins(): Promise<ActiveAdmin[]>
  authorize(args: AuthorizeArgs): Promise<AuthorizeResult>
  /** Texto de ajuda no diálogo (só na prévia). */
  demoHint?: string
}

export const supabaseAuthorizer: ExceptionAuthorizer = {
  async listActiveAdmins() {
    const sb = getSupabase()
    if (!sb) return []
    const { data, error } = await sb.rpc('list_active_admins')
    if (error) throw error
    return (data ?? []) as ActiveAdmin[]
  },
  async authorize(args) {
    const sb = getSupabase()
    if (!sb) throw new Error('Supabase não configurado')
    const { data, error } = await sb.rpc('authorize_exception', {
      p_admin_email: args.email,
      p_pin: args.pin,
      p_kind: args.kind,
      p_reason: args.reason,
      p_ref_type: args.refType,
      p_ref_id: args.refId,
      p_max_amount: args.maxAmount ?? null,
    })
    if (error) return { ok: false, error: error.message }
    const result = data as { ok: boolean; id?: string; error?: string } | null
    return result?.ok && result.id ? { ok: true, id: result.id } : { ok: false, error: result?.error ?? '' }
  },
}

/** Autorizador sobre a fonte de dados (a fonte em memória da prévia guarda a exceção no mundo). */
export function sourceAuthorizer(src: ExceptionsSource, demoHint?: string): ExceptionAuthorizer {
  return { listActiveAdmins: () => src.listActiveAdmins(), authorize: (args) => src.authorizeException(args), demoHint }
}

const ExceptionAuthorizerContext = createContext<ExceptionAuthorizer>(supabaseAuthorizer)

export function ExceptionAuthorizerProvider({ value, children }: { value: ExceptionAuthorizer; children: ReactNode }) {
  return createElement(ExceptionAuthorizerContext.Provider, { value }, children)
}

export function useExceptionAuthorizer(): ExceptionAuthorizer {
  return useContext(ExceptionAuthorizerContext)
}
