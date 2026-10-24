import type { GarmentBlock } from '@/data/types'
import { addDays } from '@/lib/format'

/** Janela da faixa "Próximos 45 dias" do calendário da peça. */
export const STRIP_DAYS = 45

export const blockOn = (blocks: GarmentBlock[], day: string) => blocks.find((b) => b.from <= day && day <= b.to)

/** Dias sem nenhum bloqueio entre hoje e os próximos `STRIP_DAYS` dias. */
export const freeDays = (blocks: GarmentBlock[], today: string) =>
  Array.from({ length: STRIP_DAYS }, (_, i) => addDays(today, i)).filter((d) => !blockOn(blocks, d)).length
