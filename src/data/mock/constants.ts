/**
 * Constantes da fonte em memória compartilhadas com o mundo fictício: instante no fuso da loja e os usuários da prévia.
 */

/** Instante no fuso da loja (`2026-10-24T10:30:00-03:00`): os 10 primeiros caracteres são a data. */
export const at = (date: string, hhmm: string): string => `${date}T${hhmm}:00-03:00`

/** Usuários da prévia (Júlia = administradora). */
export const USER = {
  julia: { id: 'u-julia', name: 'Júlia Senzi' },
  ana: { id: 'u-ana', name: 'Ana Lima' },
  bruna: { id: 'u-bruna', name: 'Bruna Costa' },
} as const
