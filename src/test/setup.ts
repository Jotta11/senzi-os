import '@testing-library/jest-dom/vitest'

import { configure } from '@testing-library/react'

// findBy*/waitFor esperam até 3 s: com a suíte em paralelo, 1 s (padrão) dá falhas intermitentes.
configure({ asyncUtilTimeout: 3000 })
