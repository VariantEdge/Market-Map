export const ISSUER_CLASSIFICATION = Object.freeze({
  SEC_OPERATING_COMPANY: 'SEC_OPERATING_COMPANY',
  FOREIGN_PRIVATE_ISSUER: 'FOREIGN_PRIVATE_ISSUER',
  PRE_IPO_OR_REGISTRATION_HISTORY: 'PRE_IPO_OR_REGISTRATION_HISTORY',
  SPINOFF_OR_PREDECESSOR: 'SPINOFF_OR_PREDECESSOR',
  ETF: 'ETF',
  NON_SEC_SECURITY: 'NON_SEC_SECURITY',
  OUT_OF_SEC_SCOPE: 'OUT_OF_SEC_SCOPE',
})

export const HISTORICAL_VALIDATION_STATUS = Object.freeze({
  VERIFIED_REPORTED: 'VERIFIED_REPORTED',
  VERIFIED_DERIVED: 'VERIFIED_DERIVED',
  MISMATCH: 'MISMATCH',
  MISSING_BUT_AVAILABLE: 'MISSING_BUT_AVAILABLE',
  LEGITIMATE_NA: 'LEGITIMATE_NA',
  REQUIRES_REVIEW: 'REQUIRES_REVIEW',
  ETF_NOT_APPLICABLE: 'ETF_NOT_APPLICABLE',
  OUT_OF_SEC_SCOPE: 'OUT_OF_SEC_SCOPE',
})

const ETF_TICKERS = new Set(['AIS', 'DRAM', 'IGV', 'QQQ', 'SOXX', 'SPY'])
const PRE_IPO_HISTORY_TICKERS = new Set(['CRWV'])
const SPINOFF_TICKERS = new Set(['GEV'])

function formsFromFilings(filings = []) {
  return new Set(filings.map((filing) => String(filing.form ?? '').toUpperCase()))
}

export function classifyIssuer({ ticker, company = null, filings = [] } = {}) {
  const normalizedTicker = String(ticker ?? company?.ticker ?? '').trim().toUpperCase()
  if (ETF_TICKERS.has(normalizedTicker)) {
    return {
      classification: ISSUER_CLASSIFICATION.ETF,
      financialStatus: HISTORICAL_VALIDATION_STATUS.ETF_NOT_APPLICABLE,
      reason: 'The security is an ETF, not an operating company.',
    }
  }

  if (!company?.cik) {
    const hasForeignExchangeSuffix = /\.(?:KS|KQ|TW|T|SZ|SS|HK|L|PA|DE|SW|ST|MI|AS)$/i.test(normalizedTicker)
    return {
      classification: hasForeignExchangeSuffix
        ? ISSUER_CLASSIFICATION.NON_SEC_SECURITY
        : ISSUER_CLASSIFICATION.OUT_OF_SEC_SCOPE,
      financialStatus: HISTORICAL_VALIDATION_STATUS.OUT_OF_SEC_SCOPE,
      reason: hasForeignExchangeSuffix
        ? 'The exchange-listed security could not be resolved to an SEC registrant.'
        : 'The symbol could not be resolved to an SEC operating-company registrant.',
    }
  }

  if (PRE_IPO_HISTORY_TICKERS.has(normalizedTicker)) {
    return {
      classification: ISSUER_CLASSIFICATION.PRE_IPO_OR_REGISTRATION_HISTORY,
      financialStatus: null,
      reason: 'Historical coverage may require registration-statement filings.',
    }
  }

  if (SPINOFF_TICKERS.has(normalizedTicker)) {
    return {
      classification: ISSUER_CLASSIFICATION.SPINOFF_OR_PREDECESSOR,
      financialStatus: null,
      reason: 'Historical coverage may include predecessor or carve-out statements.',
    }
  }

  const forms = formsFromFilings(filings)
  const foreignPrivateIssuer = forms.has('20-F') || forms.has('20-F/A') || forms.has('40-F') ||
    (forms.has('6-K') && !forms.has('10-K'))
  if (foreignPrivateIssuer) {
    return {
      classification: ISSUER_CLASSIFICATION.FOREIGN_PRIVATE_ISSUER,
      financialStatus: null,
      reason: 'The registrant reports through foreign-private-issuer forms.',
    }
  }

  return {
    classification: ISSUER_CLASSIFICATION.SEC_OPERATING_COMPANY,
    financialStatus: null,
    reason: 'The security resolves to an SEC operating-company registrant.',
  }
}

export function isOperatingCompanyClassification(classification) {
  return [
    ISSUER_CLASSIFICATION.SEC_OPERATING_COMPANY,
    ISSUER_CLASSIFICATION.FOREIGN_PRIVATE_ISSUER,
    ISSUER_CLASSIFICATION.PRE_IPO_OR_REGISTRATION_HISTORY,
    ISSUER_CLASSIFICATION.SPINOFF_OR_PREDECESSOR,
  ].includes(classification)
}

export function knownEtfTickers() {
  return [...ETF_TICKERS]
}
