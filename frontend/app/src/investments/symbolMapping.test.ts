import { describe, expect, it } from 'vitest'
import { toYahooSymbol } from './symbolMapping'

describe('toYahooSymbol', () => {
  it('translates a Freedom24 country-suffixed ticker to its Yahoo exchange suffix', () => {
    expect(toYahooSymbol('VIO.GR', 'freedom24')).toBe('VIO.AT')
  })

  it('drops the suffix entirely for US tickers, matching Yahoo convention', () => {
    expect(toYahooSymbol('AAPL.US', 'freedom24')).toBe('AAPL')
  })

  it('leaves an unrecognized Freedom24 suffix untranslated', () => {
    expect(toYahooSymbol('XYZ.ZZ', 'freedom24')).toBe('XYZ.ZZ')
  })

  it('leaves a Freedom24 ticker with no suffix untouched', () => {
    expect(toYahooSymbol('BONDXYZ', 'freedom24')).toBe('BONDXYZ')
  })

  it('appends -USD for a Binance asset', () => {
    expect(toYahooSymbol('BTC', 'binance')).toBe('BTC-USD')
  })

  it('passes the symbol through unchanged when the provider is unknown', () => {
    expect(toYahooSymbol('AAPL', null)).toBe('AAPL')
  })
})
