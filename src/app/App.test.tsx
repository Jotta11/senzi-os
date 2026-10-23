import { render, screen } from '@testing-library/react'
import { App } from './App'

describe('App', () => {
  it('renderiza o nome Senzi OS', () => {
    render(<App />)
    expect(screen.getByText('Senzi OS')).toBeInTheDocument()
  })
})
