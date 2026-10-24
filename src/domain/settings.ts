import type { Settings } from '@/data/types'

/** Parâmetros padrão do sistema (spec reservas §4.1). */
export const DEFAULT_SETTINGS: Settings = {
  defaultCleaningDays: 2,
  defaultPrepDays: 0,
  lateFeeDailyPercent: 20,
  depositPercent: 0,
  discountLimitPercent: 15,
  minSignalPercent: 50,
  idleAlertDays: 90,
}
