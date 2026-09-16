export const COMPANY_CHAT_CONFIGS = {
  COHR: {
    ticker: 'COHR',
    companyName: 'Coherent',
    theme: 'photonics',
    layer: 1,
  },
  AXTI: {
    ticker: 'AXTI',
    companyName: 'AXT',
    theme: 'photonics',
    layer: 1,
  },
  NBIS: {
    ticker: 'NBIS',
    companyName: 'Nebius Group',
    theme: 'neoclouds',
    layer: 1,
  },
  CRWV: {
    ticker: 'CRWV',
    companyName: 'CoreWeave',
    theme: 'neoclouds',
    layer: 1,
  },
  IREN: {
    ticker: 'IREN',
    companyName: 'IREN',
    theme: 'neoclouds',
    layer: 1,
  },
}

export function getCompanyChatConfig(ticker, companyName, theme = 'photonics', layer = 1) {
  const normalizedTicker = String(ticker ?? '').toUpperCase()
  const configured = COMPANY_CHAT_CONFIGS[normalizedTicker]
  if (!configured) return null

  return {
    ...configured,
    companyName: companyName || configured.companyName,
    theme,
    layer,
    promptChips: [
      `What would break the bull case on ${normalizedTicker}?`,
      `What chokepoint does ${normalizedTicker} sit on?`,
      `Bull and bear case for ${normalizedTicker}`,
      'Who are the alternatives?',
    ],
  }
}
