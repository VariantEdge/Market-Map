const STOCK_ANALYSIS_FOREIGN = {
  'SOI.PA': '/quote/epa/SOI',
  '5802.T': '/quote/tyo/5802',
  'IQE.L': '/quote/aim/IQE',
  'AIXA.DE': '/quote/etr/AIXA',
  'SIVE.ST': '/quote/sto/SIVE',
}

const COHR_TRANSCRIPT_URL = 'https://stockanalysis.com/stocks/cohr/transcripts/552001-q3-2026/'
const COHR_Q2_2026_TRANSCRIPT_URL = 'https://stockanalysis.com/stocks/cohr/transcripts/411190-q2-2026/'
const COHR_Q1_2026_TRANSCRIPT_URL = 'https://stockanalysis.com/stocks/cohr/transcripts/374816-q1-2026/'
const COHR_Q4_2025_TRANSCRIPT_URL = 'https://stockanalysis.com/stocks/cohr/transcripts/338229-q4-2025/'
const COHR_Q3_2025_TRANSCRIPT_URL = 'https://stockanalysis.com/stocks/cohr/transcripts/313311-q3-2025/'
const COHR_Q2_2025_TRANSCRIPT_URL = 'https://stockanalysis.com/stocks/cohr/transcripts/253585-q2-2025/'
const COHR_Q1_2025_TRANSCRIPT_URL = 'https://stockanalysis.com/stocks/cohr/transcripts/222257-q1-2025/'
const COHR_Q4_2024_TRANSCRIPT_URL = 'https://stockanalysis.com/stocks/cohr/transcripts/186219-q4-2024/'
const COHR_8K_EXHIBIT_URL = 'https://www.sec.gov/Archives/edgar/data/820318/000119312526208972/d57080dex991.htm'
const COHR_10Q_URL = 'https://www.sec.gov/Archives/edgar/data/820318/000082031826000013/iivi-20260331.htm'
const COHR_LATEST_PROFILE_TRANSCRIPT_ID = '552001-q3-2026'

const COHR_TAKEAWAYS = [
  {
    group: 'Key Financial Results',
    description: 'Non-duplicative quarterly metrics investors care about most.',
    items: [
      {
        subject: 'Q3 Revenue',
        text: 'Revenue reached $1.81 billion, up 7% sequentially and 21% year-over-year; on a pro forma basis, revenue increased 9% sequentially and 27% year-over-year.',
        source: 'SEC 8-K',
        url: COHR_8K_EXHIBIT_URL,
      },
      {
        subject: 'Non-GAAP Gross Margin',
        text: 'Non-GAAP gross margin was 39.6%, up 57 basis points sequentially and 105 basis points year-over-year, helped by revenue growth, mix and the initial 6-inch indium phosphide ramp.',
        source: 'SEC 8-K',
        url: COHR_8K_EXHIBIT_URL,
      },
      {
        subject: 'Non-GAAP Operating Margin',
        text: 'Non-GAAP operating income was $366 million, with non-GAAP operating margin increasing to 20.3% from 19.9% in Q2 and 18.6% in the year-ago quarter.',
        source: 'SEC 8-K',
        url: COHR_8K_EXHIBIT_URL,
      },
      {
        subject: 'Non-GAAP EPS',
        text: 'Non-GAAP diluted EPS was $1.41, up 9% sequentially and 55% year-over-year, with earnings growth outpacing revenue growth.',
        source: 'SEC 8-K',
        url: COHR_8K_EXHIBIT_URL,
      },
      {
        subject: 'Record Backlog',
        text: 'Management said the order book stepped up again in Q3, driving backlog to a record level, with orders extending into calendar 2028 and customer LTAs extending to the end of the decade.',
        source: 'Transcript',
        url: COHR_TRANSCRIPT_URL,
      },
      {
        subject: 'Cash Balance',
        text: 'Cash increased to $3.0 billion from $1.5 billion in the prior quarter, primarily reflecting NVIDIA\'s $2.0 billion equity investment.',
        source: 'Transcript',
        url: COHR_TRANSCRIPT_URL,
      },
    ],
  },
  {
    group: 'Business Segment Results',
    description: 'Reported revenue segment results from the quarter.',
    items: [
      {
        subject: 'Datacenter & Communications Segment',
        text: 'Revenue was $1.36 billion in Q3, up 13% sequentially from $1.21 billion and up 41% year-over-year from $969 million; segment profit was $348 million, up 49% year-over-year.',
        source: 'SEC 8-K',
        url: COHR_8K_EXHIBIT_URL,
      },
      {
        subject: 'Datacenter Demand',
        text: 'Management said data center revenue increased 13% sequentially and 37% year-over-year, with demand broad-based across customers and product categories.',
        source: 'Transcript',
        url: COHR_TRANSCRIPT_URL,
      },
      {
        subject: 'Communications Business',
        text: 'Communications revenue increased 16% sequentially and 60% year-over-year, driven by data center interconnect, scale-across and traditional telecom applications.',
        source: 'Transcript',
        url: COHR_TRANSCRIPT_URL,
      },
      {
        subject: 'Industrial Segment',
        text: 'Industrial revenue was $444 million, down 7% sequentially from $478 million and down 16% year-over-year from $529 million; segment profit was $101 million, down 12% year-over-year, with divestitures weighing on reported growth.',
        source: 'SEC 8-K',
        url: COHR_8K_EXHIBIT_URL,
      },
      {
        subject: 'Industrial Pro Forma Context',
        text: 'On a pro forma basis, management indicated Industrial grew modestly, with improving semiconductor capital equipment bookings offsetting broader industrial softness.',
        source: 'Transcript',
        url: COHR_TRANSCRIPT_URL,
      },
    ],
  },
  {
    group: 'Capital Allocation',
    description: 'Capital expenditures, balance sheet actions and capacity investment priorities.',
    items: [
      {
        subject: 'CapEx Step-Up',
        text: 'Capital expenditures increased to $290 million in Q3 from $154 million in Q2 and $112 million in the year-ago quarter, focused on internal capacity expansion for Datacenter & Communications demand.',
        source: 'Transcript',
        url: COHR_TRANSCRIPT_URL,
      },
      {
        subject: 'Q4 CapEx Outlook',
        text: 'Management expects capital expenditures to increase sequentially in Q4 because of strong bookings and rapidly growing demand.',
        source: 'Transcript',
        url: COHR_TRANSCRIPT_URL,
      },
      {
        subject: 'Debt Reduction',
        text: 'The company made $162 million of debt payments in the quarter, reducing debt leverage to 0.5x from 1.7x in Q2 and 2.1x in the year-ago quarter.',
        source: 'Transcript',
        url: COHR_TRANSCRIPT_URL,
      },
      {
        subject: 'NVIDIA Capital Injection',
        text: 'NVIDIA invested $2.0 billion in Coherent through a private placement, with proceeds supporting R&D, future capacity expansion and manufacturing footprint buildout.',
        source: 'SEC 10-Q',
        url: COHR_10Q_URL,
      },
    ],
  },
  {
    group: 'Industry Trends and Dynamics',
    description: 'Management commentary on demand, supply constraints, products and market dynamics.',
    items: [
      {
        subject: 'AI Data Center Demand',
        text: 'Management described demand as exceptionally strong and broad-based across multiple customers and product categories, driven by AI data center infrastructure scaling.',
        source: 'Transcript',
        url: COHR_TRANSCRIPT_URL,
      },
      {
        subject: 'Indium Phosphide Constraint',
        text: 'Industry-wide indium phosphide capacity remains a key bottleneck, making Coherent\'s internal 6-inch InP ramp central to revenue growth and margin improvement.',
        source: 'Transcript',
        url: COHR_TRANSCRIPT_URL,
      },
      {
        subject: 'Demand Visibility',
        text: 'Orders now reach into calendar 2028 and customer long-term agreements extend to the end of the decade, giving management unusually long visibility.',
        source: 'Transcript',
        url: COHR_TRANSCRIPT_URL,
      },
      {
        subject: 'Scale-Across Networking',
        text: 'Management highlighted accelerating scale-across networking needs as AI workloads become distributed across multiple data center locations, increasing bandwidth and connectivity requirements.',
        source: 'Transcript',
        url: COHR_TRANSCRIPT_URL,
      },
      {
        subject: 'Higher Data-Rate Transceivers',
        text: 'Management expects 800G revenue to grow year-over-year in calendar 2026 while 1.6T transceivers ramp rapidly through the balance of the year and into next year.',
        source: 'Transcript',
        url: COHR_TRANSCRIPT_URL,
      },
      {
        subject: 'Pricing / Supply Dynamics',
        text: 'Management said demand continues to exceed supply, 1.6T carries higher ASPs than 800G, and internal sourcing helps buffer input-cost pressure.',
        source: 'Transcript',
        url: COHR_TRANSCRIPT_URL,
      },
    ],
  },
  {
    group: 'Competitive Landscape',
    description: 'Management commentary on differentiation, positioning, partners and competition.',
    items: [
      {
        subject: 'Photonics Portfolio Breadth',
        text: 'Management emphasized that Coherent\'s broad photonics portfolio and manufacturing scale resonate with customers across components, subsystems and systems.',
        source: 'Transcript',
        url: COHR_TRANSCRIPT_URL,
      },
      {
        subject: 'OCS Differentiation',
        text: 'Management said its OCS technology provides higher reliability and better power efficiency versus alternatives, supporting confidence in both near- and long-term growth.',
        source: 'Transcript',
        url: COHR_TRANSCRIPT_URL,
      },
      {
        subject: 'CPO Positioning',
        text: 'Coherent sees a differentiated CPO position because it can supply high-power CW lasers, VCSELs, external laser source modules, fiber attach units and thermoelectric coolers.',
        source: 'Transcript',
        url: COHR_TRANSCRIPT_URL,
      },
      {
        subject: 'Architecture Flexibility',
        text: 'Management said EML and silicon photonics transceivers have similar gross-margin profiles, allowing Coherent to support multiple customer architectures without sacrificing economics.',
        source: 'Transcript',
        url: COHR_TRANSCRIPT_URL,
      },
      {
        subject: 'NVIDIA Partnership',
        text: 'The NVIDIA strategic agreement includes a multiyear supply relationship extending through the end of the decade, supporting multiple CPO-related products and capacity investment.',
        source: 'SEC 10-Q',
        url: COHR_10Q_URL,
      },
    ],
  },
  {
    group: 'Growth Opportunities and Strategies',
    description: 'Where management sees future growth and core revenue drivers.',
    items: [
      {
        subject: '6-Inch Indium Phosphide Ramp',
        text: 'The 6-inch InP ramp is a key long-term capacity lever and differentiator, with EML, CW laser and photodiode yields exceeding 3-inch production lines.',
        source: 'Transcript',
        url: COHR_TRANSCRIPT_URL,
      },
      {
        subject: 'InP Output Doubling',
        text: 'Management expects to double internal indium phosphide output capacity by the end of calendar 2026, one quarter earlier than initially planned, and more than double capacity again by the end of 2027.',
        source: 'Transcript',
        url: COHR_TRANSCRIPT_URL,
      },
      {
        subject: 'Three-Site 6-Inch Footprint',
        text: '6-inch production is expanding across Sherman, Texas, Sweden and Zurich, increasing internal capacity for transceivers and CPO product lines.',
        source: 'Transcript',
        url: COHR_TRANSCRIPT_URL,
      },
      {
        subject: 'OCS Market Opportunity',
        text: 'Management increased its OCS market opportunity view to over $4 billion, citing expanding use cases across data center interconnect, scale-out and scale-up networks.',
        source: 'Transcript',
        url: COHR_TRANSCRIPT_URL,
      },
      {
        subject: 'CPO Addressable Market',
        text: 'Management described CPO as more than a $15 billion incremental addressable market, with scale-out CPO revenue expected in the second half of calendar 2026 and scale-up CPO revenue expected in the second half of 2027.',
        source: 'Transcript',
        url: COHR_TRANSCRIPT_URL,
      },
      {
        subject: 'Multi-Rail Opportunity',
        text: 'Multi-Rail solutions address growing bandwidth and connectivity needs between AI data centers, with initial revenue expected to begin ramping in the first half of calendar 2027 and an opportunity of at least $2 billion.',
        source: 'Transcript',
        url: COHR_TRANSCRIPT_URL,
      },
      {
        subject: 'Thermal Solutions',
        text: 'Management expects data center thermal and power products, including Thermadite materials and thermoelectric generators, to begin generating revenue in the second half of calendar 2027.',
        source: 'Transcript',
        url: COHR_TRANSCRIPT_URL,
      },
      {
        subject: 'Long-Term Supply Agreements',
        text: 'Management said multiple long-term supply agreements are signed or being finalized, including multiyear customer commitments and upfront investments to support capacity expansion.',
        source: 'Transcript',
        url: COHR_TRANSCRIPT_URL,
      },
    ],
  },
]

const COHR_TOPICS = [
  {
    label: 'Indium Phosphide Capacity',
    items: [
      sourceBullet('Coherent is accelerating internal InP capacity, with output expected to double by the end of calendar 2026 and more than double again by the end of calendar 2027.', 'Transcript', COHR_TRANSCRIPT_URL),
      sourceBullet('The first doubling target was pulled forward by one quarter, which matters because InP capacity is the main gating factor for converting AI optical demand into revenue.', 'Transcript', COHR_TRANSCRIPT_URL),
      sourceBullet('The 6-inch InP platform improves device output and cost structure versus 3-inch production, supporting both revenue growth and gross margin.', 'Transcript', COHR_TRANSCRIPT_URL),
      sourceBullet('Sherman is already producing, Sweden is ramping, and Zurich is expected to add another production site in early calendar 2027.', 'Transcript', COHR_TRANSCRIPT_URL),
      sourceBullet('The ramp supports EMLs, CW lasers and photodiodes across transceivers and CPO, making it one of the highest-priority investor topics this quarter.', 'Transcript', COHR_TRANSCRIPT_URL),
    ],
  },
  {
    label: 'Co-Packaged Optics',
    items: [
      sourceBullet('Management framed CPO as more than a $15 billion incremental addressable market opportunity tied to next-generation AI networking architectures.', 'Transcript', COHR_TRANSCRIPT_URL),
      sourceBullet('Initial scale-out CPO revenue is expected in the second half of calendar 2026, with scale-up CPO revenue expected in the second half of calendar 2027.', 'Transcript', COHR_TRANSCRIPT_URL),
      sourceBullet('Coherent content spans high-power CW lasers, VCSELs, external laser source modules, fiber attach units, optics and thermal components.', 'Transcript', COHR_TRANSCRIPT_URL),
      sourceBullet('NVIDIA\'s $2 billion investment and multiyear supply agreement validate Coherent\'s strategic position in CPO-related products.', 'SEC 10-Q', COHR_10Q_URL),
      sourceBullet('Management also said it is engaged with multiple customers beyond NVIDIA across CPO and NPO opportunities.', 'Transcript', COHR_TRANSCRIPT_URL),
    ],
  },
  {
    label: 'Optical Circuit Switching',
    items: [
      sourceBullet('Management raised its OCS market opportunity view to more than $4 billion.', 'Transcript', COHR_TRANSCRIPT_URL),
      sourceBullet('OCS demand is expanding across data center interconnect, scale-out and scale-up networks.', 'Transcript', COHR_TRANSCRIPT_URL),
      sourceBullet('A prior production bottleneck has been resolved, allowing output to ramp across two facilities.', 'Transcript', COHR_TRANSCRIPT_URL),
      sourceBullet('Management emphasized OCS reliability and power-efficiency advantages versus alternatives.', 'Transcript', COHR_TRANSCRIPT_URL),
      sourceBullet('OCS gives Coherent a systems-level AI networking growth vector beyond transceivers.', 'Transcript', COHR_TRANSCRIPT_URL),
    ],
  },
  {
    label: 'Data Center Transceivers',
    items: [
      sourceBullet('Data center revenue increased 13% sequentially and 37% year-over-year, with broad-based strength across customers and product categories.', 'Transcript', COHR_TRANSCRIPT_URL),
      sourceBullet('800G revenue is expected to grow in calendar 2026 while 1.6T ramps rapidly through the balance of 2026 and into 2027.', 'Transcript', COHR_TRANSCRIPT_URL),
      sourceBullet('Management said 1.6T carries higher ASPs than 800G, supporting revenue growth and mix.', 'Transcript', COHR_TRANSCRIPT_URL),
      sourceBullet('EML and silicon photonics transceivers have similar gross-margin profiles, letting Coherent support multiple architectures without sacrificing economics.', 'Transcript', COHR_TRANSCRIPT_URL),
      sourceBullet('Transceivers remain the near-term AI revenue engine while CPO and OCS mature.', 'Transcript', COHR_TRANSCRIPT_URL),
    ],
  },
  {
    label: 'Demand and Backlog',
    items: [
      sourceBullet('Management said bookings, order book and backlog reached record levels; no backlog dollar amount was disclosed.', 'Transcript', COHR_TRANSCRIPT_URL),
      sourceBullet('Orders now extend into calendar 2028, with LTAs reaching to the end of the decade.', 'Transcript', COHR_TRANSCRIPT_URL),
      sourceBullet('Demand is exceptionally strong and broad-based across multiple AI data center customers, with no visible attenuation.', 'Transcript', COHR_TRANSCRIPT_URL),
      sourceBullet('Supply remains the limiting factor, so capacity expansion is the key to converting demand into revenue.', 'Transcript', COHR_TRANSCRIPT_URL),
      sourceBullet('Backlog visibility supports the bull case that growth is durable rather than a one-quarter spike.', 'Transcript', COHR_TRANSCRIPT_URL),
    ],
  },
  {
    label: 'Gross Margin Expansion',
    items: [
      sourceBullet('Non-GAAP gross margin reached 39.6%, up 57 bps sequentially and 105 bps year-over-year.', 'SEC 8-K', COHR_8K_EXHIBIT_URL),
      sourceBullet('Margin expansion was helped by revenue growth, product mix, cost actions, pricing and early 6-inch InP benefits.', 'Transcript', COHR_TRANSCRIPT_URL),
      sourceBullet('Non-GAAP operating margin improved to 20.3%, up from 19.9% in Q2 and 18.6% a year ago.', 'SEC 8-K', COHR_8K_EXHIBIT_URL),
      sourceBullet('Management indicated higher 1.6T ASPs and internal sourcing help offset input-cost pressure.', 'Transcript', COHR_TRANSCRIPT_URL),
      sourceBullet('Margin leverage is critical because Coherent\'s AI ramp needs to prove profitable, not just high-growth.', 'Transcript', COHR_TRANSCRIPT_URL),
    ],
  },
  {
    label: 'Communications Segment',
    items: [
      sourceBullet('Datacenter & Communications segment revenue was $1.36 billion, up 41% year-over-year and representing about 75% of total revenue.', 'SEC 8-K', COHR_8K_EXHIBIT_URL),
      sourceBullet('Segment profit was $348 million, up 49% year-over-year.', 'SEC 8-K', COHR_8K_EXHIBIT_URL),
      sourceBullet('Communications revenue increased 16% sequentially and 60% year-over-year.', 'Transcript', COHR_TRANSCRIPT_URL),
      sourceBullet('Growth was driven by DCI, scale-across, ZR/ZR+ transceivers, transport, line cards, amplifiers and systems.', 'Transcript', COHR_TRANSCRIPT_URL),
      sourceBullet('This segment is now the core of the COHR AI thesis and the primary driver of growth and profitability.', 'Transcript', COHR_TRANSCRIPT_URL),
    ],
  },
  {
    label: 'Long-Term Supply Agreements',
    items: [
      sourceBullet('Coherent has signed or is finalizing LTAs with strategic customers, including multiyear demand commitments and upfront investments.', 'Transcript', COHR_TRANSCRIPT_URL),
      sourceBullet('LTAs are intended to support capacity expansion while reducing utilization risk.', 'Transcript', COHR_TRANSCRIPT_URL),
      sourceBullet('NVIDIA\'s agreement extends through the end of the decade and covers multiple CPO-related products.', 'SEC 10-Q', COHR_10Q_URL),
      sourceBullet('Management expects additional LTAs as demand visibility extends further into future years.', 'Transcript', COHR_TRANSCRIPT_URL),
      sourceBullet('LTAs convert AI demand commentary into contracted visibility and capacity funding.', 'Transcript', COHR_TRANSCRIPT_URL),
    ],
  },
  {
    label: 'Multi-Rail Systems',
    items: [
      sourceBullet('Multi-Rail is positioned as a new AI data center interconnect opportunity driven by bandwidth needs between data centers.', 'Transcript', COHR_TRANSCRIPT_URL),
      sourceBullet('Management sized the opportunity at least $2 billion.', 'Transcript', COHR_TRANSCRIPT_URL),
      sourceBullet('Initial revenue is expected to begin ramping in the first half of calendar 2027.', 'Transcript', COHR_TRANSCRIPT_URL),
      sourceBullet('Multi-Rail expands Coherent\'s systems opportunity beyond components and transceivers.', 'Transcript', COHR_TRANSCRIPT_URL),
      sourceBullet('This is an emerging revenue layer that could extend the growth runway after the current transceiver ramp.', 'Transcript', COHR_TRANSCRIPT_URL),
    ],
  },
  {
    label: 'Thermal Solutions',
    items: [
      sourceBullet('Coherent expects thermal and power-related data center products to begin generating revenue in the second half of calendar 2027.', 'Transcript', COHR_TRANSCRIPT_URL),
      sourceBullet('Products include Thermadite materials for cooling and thermoelectric generators for waste heat recovery.', 'Transcript', COHR_TRANSCRIPT_URL),
      sourceBullet('The opportunity is tied to rising AI data center power density and cooling complexity.', 'Transcript', COHR_TRANSCRIPT_URL),
      sourceBullet('Thermal solutions broaden Coherent\'s AI infrastructure content beyond optical connectivity.', 'Transcript', COHR_TRANSCRIPT_URL),
      sourceBullet('This is still early, but potentially valuable as AI clusters become more power- and heat-constrained.', 'Transcript', COHR_TRANSCRIPT_URL),
    ],
  },
]

const COHR_Q2_2026_TOPICS = [
  {
    label: 'Demand Visibility',
    items: [
      sourceBullet('Management described demand and visibility as extraordinary, with data center bookings stepping up again in fiscal Q2.', 'Transcript', COHR_Q2_2026_TRANSCRIPT_URL),
      sourceBullet('Data center book-to-bill exceeded 4x, showing that customer orders were still running well ahead of current shipments.', 'Transcript', COHR_Q2_2026_TRANSCRIPT_URL),
      sourceBullet('Most calendar 2026 demand was described as booked out, with calendar 2027 filling quickly and customer forecasts extending into calendar 2028.', 'Transcript', COHR_Q2_2026_TRANSCRIPT_URL),
      sourceBullet('Long-term supply agreements are being used to pair customer demand commitments with Coherent supply guarantees and capacity support.', 'Transcript', COHR_Q2_2026_TRANSCRIPT_URL),
    ],
  },
  {
    label: 'Indium Phosphide Ramp',
    items: [
      sourceBullet('Six-inch indium phosphide capacity was the central supply-side topic, with Coherent still targeting a doubling of internal InP capacity by the December quarter.', 'Transcript', COHR_Q2_2026_TRANSCRIPT_URL),
      sourceBullet('Management said current-quarter wafer starts were already at roughly 80% of the target capacity needed to double output.', 'Transcript', COHR_Q2_2026_TRANSCRIPT_URL),
      sourceBullet('Wafer starts more than quadrupled from the September quarter to the December quarter, indicating the ramp was ahead of schedule.', 'Transcript', COHR_Q2_2026_TRANSCRIPT_URL),
      sourceBullet('The 6-inch InP line supports EMLs, CW lasers and photodiodes, and management said yields were exceeding the older 3-inch production lines.', 'Transcript', COHR_Q2_2026_TRANSCRIPT_URL),
    ],
  },
  {
    label: '800G / 1.6T Transceivers',
    items: [
      sourceBullet('Q2 data center growth was driven by both 800G and 1.6T transceivers.', 'Transcript', COHR_Q2_2026_TRANSCRIPT_URL),
      sourceBullet('Management expected current-quarter growth to come from both 1.6T and 800G transceivers, plus OCS systems.', 'Transcript', COHR_Q2_2026_TRANSCRIPT_URL),
      sourceBullet('1.6T is expected to ramp significantly over coming quarters, first through EML and silicon photonics designs and later through 200G VCSEL-based products.', 'Transcript', COHR_Q2_2026_TRANSCRIPT_URL),
      sourceBullet('Both 800G and 1.6T were expected to grow significantly in calendar 2026.', 'Transcript', COHR_Q2_2026_TRANSCRIPT_URL),
    ],
  },
  {
    label: 'CPO Design Win',
    items: [
      sourceBullet('Coherent secured an exceptionally large purchase order from a market-leading AI data center customer for a CPO solution.', 'Transcript', COHR_Q2_2026_TRANSCRIPT_URL),
      sourceBullet('The CPO solution includes a new high-power CW laser that began sampling the prior year.', 'Transcript', COHR_Q2_2026_TRANSCRIPT_URL),
      sourceBullet('A key reason for the customer decision was that the high-power CW laser is produced on Coherent\'s 6-inch InP line in Sherman, Texas.', 'Transcript', COHR_Q2_2026_TRANSCRIPT_URL),
      sourceBullet('Management expected initial CPO revenue toward the end of calendar 2026, with a more meaningful contribution in calendar 2027 and beyond.', 'Transcript', COHR_Q2_2026_TRANSCRIPT_URL),
    ],
  },
  {
    label: 'Optical Circuit Switching',
    items: [
      sourceBullet('OCS backlog grew sequentially in fiscal Q2, and management said Coherent had more than 10 customer engagements.', 'Transcript', COHR_Q2_2026_TRANSCRIPT_URL),
      sourceBullet('Shipments and backlog included both 64x64 and 320x320 systems, with backlog weighted toward the larger configuration.', 'Transcript', COHR_Q2_2026_TRANSCRIPT_URL),
      sourceBullet('Management expected OCS revenue to grow sequentially in the current quarter and coming quarters as production capacity ramps.', 'Transcript', COHR_Q2_2026_TRANSCRIPT_URL),
      sourceBullet('The platform was tied to an expected addressable market opportunity of more than $2 billion over the coming years.', 'Transcript', COHR_Q2_2026_TRANSCRIPT_URL),
    ],
  },
  {
    label: 'Communications Growth',
    items: [
      sourceBullet('Datacenter and Communications accounted for more than 70% of revenue and was the main growth engine in fiscal Q2.', 'Transcript', COHR_Q2_2026_TRANSCRIPT_URL),
      sourceBullet('Data center revenue grew 14% sequentially and 36% year-over-year.', 'Transcript', COHR_Q2_2026_TRANSCRIPT_URL),
      sourceBullet('Communications revenue grew 9% sequentially and 44% year-over-year, led by DCI, scale-across and improving telecom demand.', 'Transcript', COHR_Q2_2026_TRANSCRIPT_URL),
      sourceBullet('Management highlighted ZR/ZR+ coherent transceivers, lasers, components, pumps, amplifiers, line cards and systems as areas of broad strength.', 'Transcript', COHR_Q2_2026_TRANSCRIPT_URL),
    ],
  },
  {
    label: 'Gross Margin Expansion',
    items: [
      sourceBullet('Non-GAAP gross margin reached 39.0%, up 24 basis points sequentially and 77 basis points year-over-year.', 'Transcript', COHR_Q2_2026_TRANSCRIPT_URL),
      sourceBullet('Gross margin benefited from product input cost reductions, manufacturing cycle-time efficiency, yield improvement and pricing optimization.', 'Transcript', COHR_Q2_2026_TRANSCRIPT_URL),
      sourceBullet('Non-GAAP operating margin improved to 19.9%, compared with 19.5% in the prior quarter and 18.5% in the year-ago quarter.', 'Transcript', COHR_Q2_2026_TRANSCRIPT_URL),
      sourceBullet('Management emphasized EPS growth outpacing revenue growth as operating leverage improves.', 'Transcript', COHR_Q2_2026_TRANSCRIPT_URL),
    ],
  },
  {
    label: 'Industrial Recovery',
    items: [
      sourceBullet('Industrial revenue grew 4% sequentially and was flat year-over-year on a pro forma basis.', 'Transcript', COHR_Q2_2026_TRANSCRIPT_URL),
      sourceBullet('Sequential growth was driven by industrial lasers and engineered materials.', 'Transcript', COHR_Q2_2026_TRANSCRIPT_URL),
      sourceBullet('Management expected Industrial to be roughly flat sequentially in the current quarter but saw improving demand later in calendar 2026.', 'Transcript', COHR_Q2_2026_TRANSCRIPT_URL),
      sourceBullet('A pickup in Semicap orders was expected to translate into sequential Industrial growth in the June quarter and remainder of calendar 2026.', 'Transcript', COHR_Q2_2026_TRANSCRIPT_URL),
    ],
  },
  {
    label: 'Portfolio Optimization',
    items: [
      sourceBullet('Coherent completed the sale of its Munich materials-processing product division after fiscal Q2.', 'Transcript', COHR_Q2_2026_TRANSCRIPT_URL),
      sourceBullet('The divested Munich business had averaged about $25 million of quarterly revenue with gross margin well below the corporate average.', 'Transcript', COHR_Q2_2026_TRANSCRIPT_URL),
      sourceBullet('Management said the sale should be immediately accretive to gross margin and EPS.', 'Transcript', COHR_Q2_2026_TRANSCRIPT_URL),
      sourceBullet('Coherent exited 10 sites during the quarter, bringing total sold or exited sites to 33 over roughly six quarters.', 'Transcript', COHR_Q2_2026_TRANSCRIPT_URL),
    ],
  },
  {
    label: 'Capacity Investment',
    items: [
      sourceBullet('CapEx increased to $154 million from $104 million in the prior quarter as Coherent invested behind data center and communications demand.', 'Transcript', COHR_Q2_2026_TRANSCRIPT_URL),
      sourceBullet('Management expected capital expenditures to increase sequentially over the remainder of fiscal 2026.', 'Transcript', COHR_Q2_2026_TRANSCRIPT_URL),
      sourceBullet('Transceiver module assembly capacity is expanding in Malaysia, Vietnam and other locations.', 'Transcript', COHR_Q2_2026_TRANSCRIPT_URL),
      sourceBullet('External EML supply also increased sequentially and was expected to increase again in the current quarter and through calendar 2026.', 'Transcript', COHR_Q2_2026_TRANSCRIPT_URL),
    ],
  },
]

function investmentTopic(label, url, bullets) {
  return {
    label,
    items: bullets.map((text) => sourceBullet(text, 'Transcript', url)),
  }
}

const COHR_Q3_2026_INVESTOR_TOPICS = [
  investmentTopic('Indium Phosphide Capacity', COHR_TRANSCRIPT_URL, [
    'The key investor debate is no longer whether demand exists; it is whether Coherent can convert demand into shipments fast enough. Management pulled forward the first internal InP capacity doubling target by one quarter and still expects another more-than-doubling by the end of calendar 2027.',
    'Six-inch InP is the gross-margin lever investors should track: it produces meaningfully more devices per wafer at lower cost, supports EMLs, CW lasers and photodiodes, and is already contributing to margin expansion.',
    'The ramp is becoming multi-site rather than single-fab risk: Sherman is producing, Sweden is ramping, and Zurich is expected to come online in early calendar 2027, reducing execution concentration risk.',
    'The model implication is that FY2027 revenue growth and margin upside are gated by InP output, customer qualification timing and the lag from wafer starts to transceiver shipments.',
  ]),
  investmentTopic('Co-Packaged Optics', COHR_TRANSCRIPT_URL, [
    'CPO is now a credible long-term TAM expansion story rather than a science-project topic: management sized the incremental opportunity at more than $15 billion and expects scale-out revenue in 2H calendar 2026, followed by scale-up revenue in 2H calendar 2027.',
    'NVIDIA validates the strategic relevance of Coherent content in CPO, but the bull case depends on broadening beyond one lead customer into multiple hyperscaler and system-customer programs.',
    'Coherent has unusual breadth of CPO content, including high-power CW lasers, VCSELs, external laser source modules, fiber attach units, optics and thermal components, which can lift content per architecture transition.',
    'Investor focus should be on timing of revenue recognition, customer concentration, and whether CPO ramps with attractive margins or cannibalizes high-margin pluggable transceiver content.',
  ]),
  investmentTopic('Optical Circuit Switching', COHR_TRANSCRIPT_URL, [
    'OCS moved from optionality to a nearer-term systems growth vector: management increased the opportunity view to more than $4 billion and said demand is expanding across data center interconnect, scale-out and scale-up networks.',
    'A production bottleneck was resolved, which matters because OCS revenue was constrained more by internal component availability than market demand.',
    'The differentiated claim is reliability and power efficiency versus mechanical alternatives, giving Coherent a systems-level angle where hyperscalers care about energy efficiency and network reconfigurability.',
    'The investor question is whether OCS becomes a meaningful revenue/margin contributor or remains small relative to the transceiver ramp; backlog growth and customer-count expansion are the proof points.',
  ]),
  investmentTopic('Data Center Transceivers', COHR_TRANSCRIPT_URL, [
    'Data center revenue grew 13% sequentially and 37% year-over-year, showing the AI optical cycle is still accelerating rather than plateauing.',
    '800G remains a growth product while 1.6T is ramping quickly; management also noted 1.6T carries higher ASPs, so mix can support both revenue growth and gross margin.',
    'Coherent is architecture-flexible across EML and silicon photonics, and management said margins are in the same ballpark, reducing the risk that customer architecture choices impair economics.',
    'The key model variable is supply, not demand. If InP and module assembly capacity catch up, sequential revenue growth can continue; if qualification or supply slips, backlog conversion gets pushed out.',
  ]),
  investmentTopic('Demand and Backlog', COHR_TRANSCRIPT_URL, [
    'Backlog reached a record level and orders now extend into calendar 2028, giving investors unusual visibility for a hardware supplier in a historically cyclical end market.',
    'Long-term supply agreements extend to the end of the decade and include upfront customer investment, which lowers utilization risk as Coherent funds capacity expansion.',
    'Management described demand as broad-based across multiple AI customers and product categories, limiting the risk that the current ramp is tied to one SKU or one deployment cycle.',
    'The watch item is whether backlog remains high quality: investors should separate contracted visibility and customer-funded LTAs from softer forecasts that can move with hyperscaler capex cycles.',
  ]),
  investmentTopic('Gross Margin Expansion', COHR_TRANSCRIPT_URL, [
    'Non-GAAP gross margin reached 39.6%, and operating margin reached 20.3%, showing the AI ramp is producing operating leverage rather than only top-line growth.',
    'Margin tailwinds include 6-inch InP cost structure, mix, pricing, product input cost reductions and portfolio cleanup; the combination matters because no single lever fully explains the margin expansion.',
    'Investors are pressing on why incremental margins are not even higher; management pointed to a mix of ramp timing, startup costs, and multiple cost/mix levers still phasing in.',
    'The next proof point is whether Q4/FY2027 growth can push gross margin toward the long-term target while CapEx rises sharply to support demand.',
  ]),
  investmentTopic('Long-Term Supply Agreements', COHR_TRANSCRIPT_URL, [
    'LTAs are becoming a core part of the equity story because they convert AI demand into longer-duration visibility and help fund capacity before revenue is realized.',
    'Management expects additional LTAs with both hyperscalers and system customers, broadening the customer base beyond the NVIDIA agreement.',
    'Customer upfront investment is important because it shares capacity-risk economics and signals commitment, but investors still need detail on duration, minimum volumes and pricing protection.',
    'The bull-case implication is a less cyclical growth profile; the bear-case risk is capacity built ahead of demand if customer forecasts change.',
  ]),
]

const COHR_Q2_2026_INVESTOR_TOPICS = [
  investmentTopic('Demand Visibility', COHR_Q2_2026_TRANSCRIPT_URL, [
    'Fiscal Q2 was the quarter where demand visibility became the central debate: management said data center book-to-bill exceeded 4x and most calendar 2026 demand was already booked.',
    'Customer forecasts were extending into calendar 2028, which gives investors a longer planning horizon than normal for optical components, but also raises the bar for capacity execution.',
    'The order strength was broad across 800G, 1.6T and OCS rather than isolated to one product, supporting the view that AI optical demand is expanding across multiple network layers.',
    'The model takeaway is that revenue upside is supply-constrained; unmet demand is not the problem, capacity and component availability are.',
  ]),
  investmentTopic('Indium Phosphide Ramp', COHR_Q2_2026_TRANSCRIPT_URL, [
    'The InP ramp was the key supply-side catalyst: management said wafer starts were already roughly 80% of the target needed to double internal output.',
    'Wafer starts more than quadrupled from the September quarter to the December quarter, indicating execution was tracking ahead of the original capacity schedule.',
    'Six-inch InP yields were described as better than older 3-inch lines, which matters because the ramp is expected to improve both supply availability and gross margin.',
    'Investor focus should be on when additional wafer starts translate into shipped transceivers, because the revenue benefit lags wafer output by qualification and assembly timing.',
  ]),
  investmentTopic('1.6T / 800G Transceivers', COHR_Q2_2026_TRANSCRIPT_URL, [
    'Q2 growth was powered by both 800G and 1.6T, making Coherent less dependent on a single data-rate transition.',
    'Management expected current-quarter growth from 1.6T, 800G and OCS, creating multiple drivers for sequential growth rather than a one-product ramp.',
    '1.6T was expected to ramp through EML and silicon photonics designs first, then broaden with 200G VCSEL-based products, which gives Coherent multiple paths to customer adoption.',
    'The investor question is mix and margin: if 1.6T carries higher ASPs without margin dilution, it can support both revenue acceleration and gross-margin expansion.',
  ]),
  investmentTopic('CPO Design Win', COHR_Q2_2026_TRANSCRIPT_URL, [
    'The large CPO purchase order was important because it moved CPO from roadmap discussion to customer commitment.',
    'The win was tied to a high-power CW laser produced on the 6-inch InP line in Sherman, reinforcing that capacity technology is a competitive differentiator, not just a cost project.',
    'Management expected initial CPO revenue toward the end of calendar 2026, with a more meaningful contribution in calendar 2027 and beyond.',
    'Investors should treat this as strategic validation today, with revenue materiality still dependent on scale-out and scale-up deployment timing.',
  ]),
  investmentTopic('OCS Production Ramp', COHR_Q2_2026_TRANSCRIPT_URL, [
    'OCS backlog grew sequentially and management cited more than 10 customer engagements, signaling the product is moving beyond early customer trials.',
    'Backlog included both 64x64 and 320x320 systems, with the larger configuration weighted more heavily, which could improve revenue per deployment as production scales.',
    'Management expected OCS revenue to grow sequentially as production capacity ramps, making manufacturing execution the key bottleneck.',
    'The investor lens is whether OCS can become a multi-year systems revenue stream with attractive differentiation versus mechanical switching alternatives.',
  ]),
  investmentTopic('Margin and Portfolio Cleanup', COHR_Q2_2026_TRANSCRIPT_URL, [
    'Non-GAAP gross margin reached 39.0% and operating margin improved to 19.9%, showing the company was already approaching its 40% gross-margin target before the largest InP benefits fully phased in.',
    'Gross margin benefited from input-cost reductions, manufacturing cycle-time efficiency, yield improvement and pricing optimization, suggesting margin upside is multi-factor rather than just mix.',
    'The Munich divestiture was expected to be immediately accretive to gross margin and EPS, reinforcing management discipline around exiting lower-return assets.',
    'For investors, Q2 supported the thesis that portfolio pruning plus AI mix can structurally improve earnings quality.',
  ]),
]

const COHR_Q1_2026_INVESTOR_TOPICS = [
  investmentTopic('Record AI Optical Demand', COHR_Q1_2026_TRANSCRIPT_URL, [
    'Q1 established that the AI optical cycle was supply-constrained: management reported record bookings, with orders reaching further into the future than normal and broad strength across data center and communications.',
    'Data center revenue grew only 4% sequentially because InP laser supply constrained shipments, but management guided to roughly 10% sequential data center growth in Q2 as supply improved.',
    'Demand was strongest in 800G and 1.6T transceivers, with 1.6T adoption accelerating and expected to drive a meaningful portion of current-quarter growth.',
    'The investor takeaway is that backlog conversion, not demand generation, became the central model driver.',
  ]),
  investmentTopic('Six-Inch InP Execution', COHR_Q1_2026_TRANSCRIPT_URL, [
    'The first 6-inch InP production line in Sherman began production and initial yields were higher than mature 3-inch lines, a major de-risking milestone for the capacity and margin story.',
    'Management added a second 6-inch InP ramp site in Sweden, allowing Coherent to target roughly doubling internal InP capacity over the next year.',
    'The 6-inch line supports EMLs, CW lasers and photodiodes, so the capacity expansion is relevant to both pluggable transceivers and CPO.',
    'Investors should track yield, customer qualification and the lag from wafer output to finished transceiver revenue as the key execution gates.',
  ]),
  investmentTopic('1.6T and 800G Adoption', COHR_Q1_2026_TRANSCRIPT_URL, [
    'Management described broad 800G adoption and accelerated 1.6T adoption, with demand strong across multiple customers.',
    'Coherent demonstrated three 1.6T designs using silicon photonics, EML and VCSEL laser sources, which gives customers architecture choice and reduces single-technology dependency.',
    'Management expected both 800G and 1.6T to grow significantly in calendar 2026, so the growth runway was not limited to one data-rate transition.',
    'The investor debate is whether Coherent can maintain share as customers transition architectures while also improving margins through internal laser supply.',
  ]),
  investmentTopic('OCS and CPO Optionality', COHR_Q1_2026_TRANSCRIPT_URL, [
    'OCS revenue and backlog grew sequentially, with shipments to seven customers and backlog weighted toward larger 320x320 systems.',
    'Management viewed OCS as more than a $2 billion addressable market opportunity and expected revenue to ramp throughout calendar 2026.',
    'CPO engagement remained broad, with 400 milliwatt CW lasers sampling for CPO and silicon photonics applications and initial CPO deployments expected in calendar 2026.',
    'These products matter because they expand Coherent beyond pluggable transceivers into higher-content optical systems and scale-up networking.',
  ]),
  investmentTopic('Portfolio and Balance Sheet', COHR_Q1_2026_TRANSCRIPT_URL, [
    'Coherent used aerospace and defense divestiture proceeds to pay down $400 million of debt, reducing leverage to 1.7x and improving financial flexibility.',
    'The pending Munich divestiture was framed as immediately accretive to gross margin and EPS because the business had below-corporate gross margin.',
    'Management had exited or sold 23 sites since the prior fiscal year, showing portfolio optimization is an active margin and ROIC lever.',
    'The investment implication is a cleaner growth story: more capital is being directed to AI/data-center photonics while lower-return assets are removed.',
  ]),
]

const COHR_Q4_2025_INVESTOR_TOPICS = [
  investmentTopic('FY2025 Inflection', COHR_Q4_2025_TRANSCRIPT_URL, [
    'FY2025 revenue grew about 23% to a record $5.81 billion and non-GAAP EPS roughly tripled, validating the operating leverage thesis after several quarters of restructuring and demand recovery.',
    'Q4 revenue reached a new record and non-GAAP EPS doubled year-over-year to $1.00, giving investors evidence that the AI/communications mix shift was flowing through earnings.',
    'Management positioned FY2026 as another growth year, with the key variables being capacity expansion, 1.6T ramp timing and continued margin progress.',
    'The quarter marked a transition from turnaround proof points to execution against a higher-growth AI optical model.',
  ]),
  investmentTopic('Data Center and 1.6T Ramp', COHR_Q4_2025_TRANSCRIPT_URL, [
    'Data center revenue increased 61% for FY2025 and 38% year-over-year in Q4, confirming AI data center demand as the primary growth engine.',
    'Coherent shipped initial 1.6T revenue in Q4 and expected volumes to ramp through the balance of calendar 2025 with more meaningful revenue in calendar 2026.',
    'Demand below 1.6T remained strong, reducing the risk that growth pauses before the next data-rate transition reaches volume.',
    'The investor question shifted to supply capacity and qualification timing rather than whether customers need more optical bandwidth.',
  ]),
  investmentTopic('InP Capacity and 6-Inch Launch', COHR_Q4_2025_TRANSCRIPT_URL, [
    'Management said InP capacity had tripled year-over-year and announced production start for the 6-inch InP line in Sherman, a key step toward lower-cost, higher-volume EML and CW laser supply.',
    'The 6-inch platform is strategically important because InP underpins both EML-based transceivers and CW lasers for silicon photonics/CPO.',
    'The line also strengthens supply-chain resiliency at a time when hyperscalers care about both capacity and geographic manufacturing footprint.',
    'Investors should view this as a capex-to-margin story: higher output matters only if yields, qualification and utilization follow.',
  ]),
  investmentTopic('OCS Commercialization', COHR_Q4_2025_TRANSCRIPT_URL, [
    'Coherent began initial OCS revenue shipments in Q4, turning a $2 billion TAM claim into early commercial revenue.',
    'Management emphasized non-mechanical liquid crystal technology as differentiated versus MEMS-based alternatives, which is central to the reliability/power-efficiency argument.',
    'Customer engagements continued to grow and revenue was expected to ramp through calendar 2025 and become more meaningful in calendar 2026.',
    'The investor proof points are repeat orders, larger system mix, and whether OCS revenue scales without distracting from the transceiver capacity ramp.',
  ]),
  investmentTopic('Communications Recovery', COHR_Q4_2025_TRANSCRIPT_URL, [
    'Communications revenue grew 23% for FY2025 and accelerated to 11% sequential growth in Q4, driven by ZR/ZR+ DCI products and transport-market recovery.',
    'The 100G ZR product family was ramping rapidly, while 400G and 800G ZR/ZR+ products were expected to contribute through FY2026 and beyond.',
    'This matters because communications adds a second growth engine adjacent to AI data center transceivers and helps absorb capacity across the photonics portfolio.',
    'Investors should watch whether telecom recovery persists or DCI remains the dominant source of communications growth.',
  ]),
  investmentTopic('Portfolio Optimization', COHR_Q4_2025_TRANSCRIPT_URL, [
    'The $400 million aerospace and defense sale crystallized management discipline around exiting assets that do not fit long-term strategic and financial targets.',
    'Proceeds were earmarked for debt paydown and the deal was expected to be EPS accretive, improving both leverage and earnings quality.',
    'The portfolio cleanup supports margin expansion by reallocating capital away from slower-growth/lower-return businesses toward AI optical and communications growth engines.',
    'Investor focus should be on whether additional divestitures or site exits further lift gross margin and ROIC.',
  ]),
]

const COHR_Q3_2025_INVESTOR_TOPICS = [
  investmentTopic('AI Data Center Growth', COHR_Q3_2025_TRANSCRIPT_URL, [
    'Q3 revenue reached a record $1.5 billion, up 24% year-over-year, with AI data center demand driving the strongest growth areas.',
    'Data center revenue grew 11% sequentially and 54% year-over-year, confirming the AI optical cycle was already material before 1.6T scaled.',
    'Customers valued Coherent breadth across photonics technologies and supply-chain flexibility, which management framed as competitive advantages in a constrained environment.',
    'The investor takeaway is that COHR was gaining leverage to the AI network buildout before the larger 1.6T/CPO/OCS opportunities became meaningful.',
  ]),
  investmentTopic('1.6T / 3.2T Roadmap', COHR_Q3_2025_TRANSCRIPT_URL, [
    'At OFC, Coherent showed three 1.6T designs based on EML, VCSEL and silicon photonics, giving customers multiple architecture paths and reducing single-platform risk.',
    'Management expected 1.6T to begin ramping during calendar 2025 and highlighted expanding customer engagements.',
    'The 400G-per-lane differential EML demonstration was positioned as a milestone toward 3.2T, extending the roadmap beyond the near-term 1.6T cycle.',
    'For investors, this is a technology-roadmap durability point: the company is trying to stay relevant across multiple data-rate transitions, not just one product cycle.',
  ]),
  investmentTopic('InP and CPO Readiness', COHR_Q3_2025_TRANSCRIPT_URL, [
    'InP capacity grew more than 3x year-over-year, supporting both EML transceivers and CW lasers used in silicon photonics and CPO.',
    'Management expected the 6-inch InP platform to start ramping next quarter, which would improve volume and cost structure if yields tracked well.',
    'Coherent announced collaboration with NVIDIA on CPO and networking switches, giving the CPO story a named strategic partner.',
    'Investor focus should be on whether CPO engagement turns into revenue and whether InP capacity can support both pluggables and emerging CPO demand.',
  ]),
  investmentTopic('OCS First Order', COHR_Q3_2025_TRANSCRIPT_URL, [
    'Coherent had received its first customer order for OCS and expected initial revenue in calendar 2025, marking a shift from product showcase to early commercialization.',
    'Management positioned OCS as a differentiated platform using field-proven liquid crystal technology rather than mechanical MEMS.',
    'The OCS platform expands the data center addressable market beyond transceivers, but revenue materiality remained to be proven.',
    'Investors should track customer count, backlog, system size and conversion to repeat deployments.',
  ]),
  investmentTopic('Gross Margin Progress', COHR_Q3_2025_TRANSCRIPT_URL, [
    'Non-GAAP gross margin improved to 38.5%, moving toward the company goal of operating above 40%.',
    'Revenue growth and margin expansion drove a 2.4x year-over-year increase in non-GAAP EPS, which is the earnings leverage investors need from the AI ramp.',
    'Margin improvement was still early, with future upside tied to mix, pricing, cost actions and 6-inch InP economics.',
    'The open question was whether rising AI demand would also carry enough incremental margin to re-rate the earnings model.',
  ]),
  investmentTopic('Telecom / DCI Recovery', COHR_Q3_2025_TRANSCRIPT_URL, [
    'Telecom revenue grew sequentially for the third consecutive quarter, helped by DCI and improving traditional transport demand.',
    'ZR/ZR+ coherent transceivers were ramping and expected to grow over coming quarters, creating a communications growth layer adjacent to AI data center demand.',
    'Semicap and display capital equipment helped offset soft broad-based industrial demand, preserving some diversity outside datacom.',
    'Investors should separate secular DCI strength from cyclical industrial recovery when valuing the non-AI portions of the portfolio.',
  ]),
]

const COHR_Q2_2025_INVESTOR_TOPICS = [
  investmentTopic('AI Datacom Momentum', COHR_Q2_2025_TRANSCRIPT_URL, [
    'Q2 revenue reached a record $1.43 billion, up 27% year-over-year, driven by strong AI-related datacom transceiver growth plus improving telecom and industrial trends.',
    'Datacom revenue grew 79% year-over-year, showing AI demand was already overwhelming legacy cyclicality in parts of the business.',
    '800G adoption broadened across more customers while 400G and below stayed strong, giving Coherent a broader near-term revenue base.',
    'The investor takeaway is that COHR had multiple data-rate growth drivers even before 1.6T entered volume.',
  ]),
  investmentTopic('1.6T Customer Engagement', COHR_Q2_2025_TRANSCRIPT_URL, [
    'Management said 1.6T transceivers remained on track to ramp in calendar 2025 after initial samples were delivered to customers.',
    'Customer engagement on 1.6T continued to expand, which supports confidence in a future data-rate transition but still leaves qualification and timing risk.',
    'Coherent was investing in 3.2T and underlying laser technologies, framing the roadmap as multi-generational rather than a single 1.6T product cycle.',
    'Investors should watch the bridge from engineering milestones to production orders and revenue contribution.',
  ]),
  investmentTopic('Indium Phosphide Capacity', COHR_Q2_2025_TRANSCRIPT_URL, [
    'InP production output tripled year-over-year in Q2, enabling rapid growth in EML-based and silicon-photonics-linked transceivers.',
    'CHIPS Act support for Sherman InP capacity highlighted the strategic value of domestic advanced photonics manufacturing.',
    'InP is central to both EML and CW laser capacity, so it supports the pluggable transceiver ramp and longer-term CPO opportunities.',
    'The investor debate was whether InP supply could keep pace with AI demand as customers move to higher data rates.',
  ]),
  investmentTopic('OCS First Customer Order', COHR_Q2_2025_TRANSCRIPT_URL, [
    'Coherent received its first customer order for OCS, a notable commercialization milestone for a platform that expands the data center TAM.',
    'Management described the technology as field-proven liquid crystal rather than MEMS, positioning it around reliability and differentiation.',
    'Initial OCS revenue was expected in calendar 2025, with more details promised in coming quarters.',
    'For investors, this was early proof of customer interest but not yet proof of revenue scale.',
  ]),
  investmentTopic('Margin Expansion and OpEx Leverage', COHR_Q2_2025_TRANSCRIPT_URL, [
    'Non-GAAP gross margin reached 38.2%, advancing toward the durable above-40% target.',
    'Non-GAAP EPS grew more than 40% sequentially and more than tripled year-over-year, showing operating leverage from revenue growth, margin expansion and disciplined OpEx.',
    'Management emphasized pricing optimization and product cost improvements as strategic levers, not one-time benefits.',
    'The investor lens is whether the company can sustain margin gains while increasing strategic R&D for AI optical growth.',
  ]),
  investmentTopic('Portfolio Optimization', COHR_Q2_2025_TRANSCRIPT_URL, [
    'Management continued portfolio optimization after classifying businesses by strategic and financial fit.',
    'Investment was being redirected to data communication platforms, OCS and higher-return photonics growth engines.',
    'Non-strategic assets were being divested or shut down to reduce overhead and improve margin structure.',
    'The investment thesis was becoming cleaner: focus capital on AI/communications growth while removing assets that dilute margins and management focus.',
  ]),
]

const COHR_Q1_2025_INVESTOR_TOPICS = [
  investmentTopic('Turnaround Framework', COHR_Q1_2025_TRANSCRIPT_URL, [
    'Q1 FY2025 was the setup quarter for the Anderson turnaround: culture, strategy and execution were framed as the levers to turn a broad photonics portfolio into higher growth and better profitability.',
    'Management completed a strategic portfolio review and classified product lines into growth engines, profit engines, long-term bets and non-strategic assets.',
    'The investor implication was clear capital reallocation: shift R&D and investment toward higher-return datacom/photonic platforms while exiting non-strategic assets.',
    'This quarter matters historically because it established the portfolio discipline that later supported margin expansion and debt reduction.',
  ]),
  investmentTopic('Data Comm Investment Shift', COHR_Q1_2025_TRANSCRIPT_URL, [
    'Management specifically increased investment in next-generation datacom transceivers and optical circuit switching, flagging AI optical networking as a priority before the later demand inflection became obvious.',
    'The company was engaging customers more strategically, which management said had uncovered new long-term growth opportunities.',
    'The investor takeaway is that Coherent was trying to move from a product-rich but diffuse portfolio to focused execution around customer-led growth platforms.',
    'Proof points to watch from this period were design wins, qualification progress and whether R&D dollars produced revenue growth rather than only technology demos.',
  ]),
  investmentTopic('Gross Margin Self-Help', COHR_Q1_2025_TRANSCRIPT_URL, [
    'Management launched pricing optimization and product cost-reduction initiatives aimed at a sustainable gross margin above 40%.',
    'The margin plan was not only mix-dependent; it included cost actions, pricing, OpEx leverage and divestiture of lower-return projects.',
    'This matters for investors because COHR needed to prove AI revenue growth could translate into EPS and cash flow, not just higher sales.',
    'The early margin framework laid the groundwork for the later FY2025/FY2026 non-GAAP margin improvement.',
  ]),
  investmentTopic('Portfolio Pruning', COHR_Q1_2025_TRANSCRIPT_URL, [
    'Management began divesting or shutting down non-strategic product lines and assets, including the planned Newton Aycliffe facility sale.',
    'Proceeds from asset sales were earmarked for debt reduction and overhead savings, tying portfolio cleanup directly to balance-sheet improvement.',
    'The battery technology platform was also under strategic review, reinforcing that underperforming or speculative projects would be challenged.',
    'The investor point is that management was attacking complexity and leverage at the same time, which improved the credibility of the longer-term model.',
  ]),
  investmentTopic('Investor Day Catalyst', COHR_Q1_2025_TRANSCRIPT_URL, [
    'Management announced an Investor and Analyst Day for May 2025 to lay out strategy, end-market growth opportunities, product roadmap and long-term financial model.',
    'That event became an important catalyst because investors needed a clearer framework for how the broad photonics portfolio would be prioritized.',
    'The key setup was moving COHR from a conglomerate-like photonics story to a focused AI optical and communications growth thesis.',
    'Investors should view Q1 FY2025 as the starting point for the later re-rating debate around portfolio focus and margin targets.',
  ]),
]

const COHR_Q4_2024_INVESTOR_TOPICS = [
  investmentTopic('New CEO Value-Creation Plan', COHR_Q4_2024_TRANSCRIPT_URL, [
    'Q4 FY2024 was the first full framing of Jim Anderson\'s mandate: convert world-class photonics innovation into market-leading growth, profitability and shareholder value creation.',
    'Management identified culture, strategy and execution as the three focus areas, with speed and agility called out as competitive advantages.',
    'The investor relevance is that COHR had valuable assets but needed sharper prioritization, execution speed and capital discipline.',
    'This quarter is the baseline for evaluating whether the later FY2025/FY2026 improvements came from a real operating reset.',
  ]),
  investmentTopic('Portfolio Review', COHR_Q4_2024_TRANSCRIPT_URL, [
    'Management initiated a portfolio review to decide where to invest, divest or stop investing based on strategic and financial criteria.',
    'The review was meant to concentrate OpEx and CapEx on the strongest growth and profit engines while accelerating deleveraging.',
    'For investors, this directly addressed COHR\'s complexity discount and the risk that too much capital was tied up in lower-return assets.',
    'The later asset sales and site exits should be judged against this original promise of focus and ROIC improvement.',
  ]),
  investmentTopic('AI Optical Opportunity', COHR_Q4_2024_TRANSCRIPT_URL, [
    'Management highlighted optical transceivers for AI data centers as one of the most exciting growth opportunities, with high-speed connectivity becoming critical to AI infrastructure.',
    'Coherent\'s broader opportunity set was framed at more than $60 billion of addressable markets, but AI optical networking was the clearest near-term secular growth driver.',
    'The investor question at this stage was whether COHR could translate technology breadth into share gains and margin expansion.',
    'This quarter provides the earliest management articulation of the AI optical thesis that later became the core of the stock story.',
  ]),
  investmentTopic('Operational Excellence', COHR_Q4_2024_TRANSCRIPT_URL, [
    'Management emphasized faster decision-making, empowered leaders and simplified structure as operational fixes needed to improve execution.',
    'The operating agenda included focusing investment, improving gross margin, and reducing complexity across the product and site footprint.',
    'Investors should see this as the self-help layer of the thesis, separate from AI demand: even without market acceleration, COHR had margin and efficiency levers.',
    'The key proof points were later gross-margin improvement, OpEx leverage, debt paydown and clearer capital allocation.',
  ]),
  investmentTopic('Long-Term Growth Engines', COHR_Q4_2024_TRANSCRIPT_URL, [
    'Management cited AI data centers, next-generation telecom systems, advanced displays, semicap equipment, industrial automation and EVs as secular growth applications.',
    'The portfolio breadth was an advantage only if capital was allocated to the highest-return growth engines and non-strategic assets were pruned.',
    'The investor lens should prioritize which markets can move EPS and valuation, not just which markets are technically attractive.',
    'This quarter set the standard for future topic analysis: focus on revenue scale, margin quality, capital intensity and strategic fit.',
  ]),
]

const COHR_PERIOD_TOPICS = {
  [COHR_LATEST_PROFILE_TRANSCRIPT_ID]: COHR_Q3_2026_INVESTOR_TOPICS,
  '411190-q2-2026': COHR_Q2_2026_INVESTOR_TOPICS,
  '374816-q1-2026': COHR_Q1_2026_INVESTOR_TOPICS,
  '338229-q4-2025': COHR_Q4_2025_INVESTOR_TOPICS,
  '313311-q3-2025': COHR_Q3_2025_INVESTOR_TOPICS,
  '253585-q2-2025': COHR_Q2_2025_INVESTOR_TOPICS,
  '222257-q1-2025': COHR_Q1_2025_INVESTOR_TOPICS,
  '186219-q4-2024': COHR_Q4_2024_INVESTOR_TOPICS,
}

const headers = {
  'User-Agent':
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 ' +
    '(KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
  Accept: 'text/html,application/json,text/plain,*/*',
  'Accept-Language': 'en-US,en;q=0.9',
}

function stockAnalysisBase(ticker) {
  if (STOCK_ANALYSIS_FOREIGN[ticker]) return STOCK_ANALYSIS_FOREIGN[ticker]
  if (/^[A-Z]+$/.test(ticker)) return `/stocks/${ticker.toLowerCase()}`
  return null
}

function absoluteStockAnalysisUrl(path) {
  return path?.startsWith('http') ? path : `https://stockanalysis.com${path}`
}

function decodeHtml(value = '') {
  return value
    .replace(/&nbsp;|&#160;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&#149;|&bull;/g, '•')
    .replace(/&#39;/g, "'")
    .replace(/&rsquo;|&lsquo;/g, "'")
    .replace(/&rdquo;|&ldquo;/g, '"')
    .replace(/&ndash;|&mdash;/g, '-')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
}

function stripHtml(html = '') {
  return decodeHtml(html)
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

function cleanText(value = '') {
  return stripHtml(value).replace(/\s+/g, ' ').trim()
}

function parseTranscriptBlocks(html = '') {
  return html
    .split(/<div class="border-t[^"]*"/i)
    .slice(1)
    .map((block) => {
      const speaker = cleanText(block.match(/<div class="text-lg font-bold[^"]*">([\s\S]*?)<\/div>/i)?.[1] ?? '')
      const role = cleanText(block.match(/<div class="text-sm italic text-muted">([\s\S]*?)<\/div>/i)?.[1] ?? '')
      const paragraphs = [...block.matchAll(/<p class="[^"]*\btext-default\b[^"]*"[^>]*>([\s\S]*?)<\/p>/gi)]
        .map((match) => cleanText(match[1]))
        .filter(Boolean)
      const text = paragraphs.length
        ? paragraphs.join(' ')
        : cleanText(block.match(/<p[^>]*>([\s\S]*?)<\/p>/i)?.[1] ?? '')
      return { speaker, role, text }
    })
    .filter((block) => block.speaker && block.text)
}

function isAnalystBlock(block) {
  return /\banalyst\b/i.test(block.role)
}

function isQuestionText(text = '') {
  const normalized = text.replace(/\s+/g, ' ').trim()
  if (normalized.length < 25) return false
  if (/\bcan you hear me|hear me now|you hear me\b/i.test(normalized)) return false
  if (/\?/.test(normalized)) return true
  return /\b(wondering|can you|could you|would you|how do|how should|what is|what are|what's|when do|where do|why|talk about|help us understand|give us|provide|update us|color on)\b/i.test(normalized)
}

function extractFirm(role = '') {
  if (!role) return ''
  if (/investor relations/i.test(role)) return 'Pre-submitted investor question'
  const parts = role.split(',').map((part) => part.trim()).filter(Boolean)
  if (parts.length > 1) return parts.at(-1)
  return role.replace(/^Analyst,?\s*/i, '').trim()
}

function isSubmittedQuestionBlock(block) {
  return (
    /investor relations/i.test(block.role) &&
    isQuestionText(block.text) &&
    !/questions ahead of time|marketing note|conclude today's call/i.test(block.text)
  )
}

function isQnaQuestionBlock(block) {
  return (isAnalystBlock(block) && isQuestionText(block.text)) || isSubmittedQuestionBlock(block)
}

function splitAnswerSentences(text = '') {
  return text
    .replace(/\s+/g, ' ')
    .split(/(?<=[.!?])\s+(?=[A-Z0-9])/)
    .map((sentence) => sentence.trim())
    .filter((sentence) => sentence.length > 20 && sentence.length < 900)
}

function cleanAnswerSentence(sentence = '') {
  return sentence
    .replace(/^(yeah|yes|no|sure|okay|right|well|so|look|i mean|you know)[,. ]+/i, '')
    .replace(/\s+,/g, ',')
    .replace(/\s+/g, ' ')
    .trim()
}

function answerSentenceThemes(sentence = '') {
  const themes = [
    ['timing', /\blag|latency|quarter|month|later|timing|produced|ship|shipment|ramp|transition\b/i],
    ['financial', /\brevenue|growth|margin|gross margin|operating margin|earnings|profit|cash|ASP|EPS\b/i],
    ['guidance', /\bguidance|outlook|expect|forecast|target|plan|fiscal|calendar\b/i],
    ['demand', /\bdemand|orders?|backlog|customer|bookings|visibility|LTA|agreement\b/i],
    ['supply', /\bcapacity|supply|inventory|utilization|wafer|fab|production|yield|capex|investment\b/i],
    ['technology', /\bAI|data center|photonics|optical|indium phosphide|InP|transceiver|laser|CPO|OCS|800G|1\.6T\b/i],
    ['competitive', /\bcompetitive|differentiat|share|competitor|alternative|qualification|reliability|power\b/i],
  ]
  const matches = themes.filter(([, regex]) => regex.test(sentence)).map(([theme]) => theme)
  return matches.length ? matches : ['general']
}

function answerSentenceScore(sentence = '', sentenceIndex = 0) {
  const themeScore = answerSentenceThemes(sentence).filter((theme) => theme !== 'general').length * 2
  const hardDetailScore = /\$|\d|%|\b(first|second|third|next|prior|current|fiscal|calendar|quarter|month|year|basis points?|bps|million|billion)\b/i.test(sentence) ? 2 : 0
  const actionScore = /\b(expect|expects|expected|continue|drive|driven|ramp|ship|produce|qualif|convert|translate|improve|increase|reduce|support|enable)\b/i.test(sentence) ? 2 : 0
  return themeScore + hardDetailScore + actionScore + Math.max(0, 2 - sentenceIndex)
}

function isUsefulAnswerSentence(sentence = '') {
  return (
    sentence &&
    !/^(thanks|thank you|got it|great|okay|sure|yep|yeah|yes|no|oh,?\s+yeah|all right|appreciate it|good question)\.?$/i.test(sentence) &&
    !/\b(back to you|next question|your line is open|can you hear me)\b/i.test(sentence)
  )
}

function trimPostQnaClosing(text = '') {
  const marker = text.search(/\b(?:thank you,\s*operator|thanks everybody for joining|that concludes today's call)\b/i)
  return marker >= 0 ? text.slice(0, marker).trim() : text
}

function getAnswerSentenceItems(text = '', blockIndex = 0) {
  return splitAnswerSentences(text)
    .map(cleanAnswerSentence)
    .filter(isUsefulAnswerSentence)
    .map((sentence, sentenceIndex) => ({
      sentence,
      blockIndex,
      sentenceIndex,
      themes: answerSentenceThemes(sentence),
      score: answerSentenceScore(sentence, sentenceIndex),
    }))
}

function selectAnswerCoverageSentences(text = '') {
  const items = getAnswerSentenceItems(text)
  if (!items.length) return []
  if (items.length <= 8) return items.map((item) => item.sentence)

  const selected = []
  const seenThemes = new Set()
  const addItem = (item) => {
    if (!item || selected.some((selectedItem) => selectedItem.sentence === item.sentence)) return
    selected.push(item)
    item.themes.forEach((theme) => seenThemes.add(theme))
  }

  addItem(items[0])
  addItem(items.find((item) => item.score > 0))

  const ranked = [...items].sort((a, b) => b.score - a.score || a.sentenceIndex - b.sentenceIndex)
  for (const item of ranked) {
    if (selected.length >= 10) break
    const hasNewTheme = item.themes.some((theme) => !seenThemes.has(theme))
    const hasHardDetail = /\$|\d|%|\b(first|second|third|next|prior|current|fiscal|calendar|quarter|month|year|basis points?|bps|million|billion)\b/i.test(item.sentence)
    if (hasNewTheme || hasHardDetail || item.score >= 6) addItem(item)
  }

  for (const item of items) {
    if (selected.length >= Math.min(6, items.length)) break
    addItem(item)
  }

  addItem(items[items.length - 1])

  return selected
    .sort((a, b) => a.sentenceIndex - b.sentenceIndex)
    .slice(0, 10)
    .map((item) => item.sentence)
}

function compactAnswerSentence(sentence = '') {
  const cleaned = summarizeSentence(sentence)
    .replace(/\byou know\b/gi, '')
    .replace(/\bkind of\b/gi, '')
    .replace(/\bsort of\b/gi, '')
    .replace(/\bI would say that\b/gi, '')
    .replace(/\s+,/g, ',')
    .replace(/\s+/g, ' ')
    .trim()

  if (cleaned.length <= 380) return cleaned
  return `${cleaned.slice(0, 377).replace(/\s+\S*$/, '')}...`
}

function trimAnswerSummary(summary = '', maxLength = 2200) {
  if (summary.length <= maxLength) return summary
  const parts = summary.split(/;\s+/)
  const kept = []
  for (const part of parts) {
    const candidate = [...kept, part].join('; ')
    if (candidate.length > maxLength - 3) break
    kept.push(part)
  }
  return kept.length
    ? `${kept.join('; ')}...`
    : `${summary.slice(0, maxLength - 3).replace(/\s+\S*$/, '')}...`
}

function summarizeAnswer(text = '', answerBlocks = []) {
  const turns = answerBlocks.length
    ? answerBlocks.map((block) => ({
        speaker: block.speaker,
        text: block.text,
      }))
    : [{ speaker: '', text }]
  const speakerCount = new Set(turns.map((turn) => turn.speaker).filter(Boolean)).size

  const summarizedTurns = turns
    .map((turn) => {
      const coverage = splitAnswerSentences(turn.text)
        .map(cleanAnswerSentence)
        .filter(isUsefulAnswerSentence)
      if (!coverage.length) return ''
      const seen = new Set()
      const summary = coverage
        .map((sentence) => summarizeSentence(sentence)
          .replace(/\byou know\b/gi, '')
          .replace(/\bkind of\b/gi, '')
          .replace(/\bsort of\b/gi, '')
          .replace(/\s+,/g, ',')
          .replace(/\s+/g, ' ')
          .trim())
        .filter((sentence) => {
          const key = sentence.toLowerCase()
          if (!sentence || seen.has(key)) return false
          seen.add(key)
          return true
        })
        .join('; ')
      return turn.speaker && speakerCount > 1 ? `${turn.speaker}: ${summary}` : summary
    })
    .filter(Boolean)

  if (!summarizedTurns.length) return ''
  return summarizedTurns.join(' ')
}

function parseTranscriptQuestions(html = '') {
  const blocks = parseTranscriptBlocks(html)
  if (!blocks.length) return []

  const qnaStart = blocks.findIndex((block) => {
    const text = block.text.toLowerCase()
    return (
      block.speaker.toLowerCase() === 'operator' &&
      (
        text.includes('q&a') ||
        text.includes('question-and-answer') ||
        text.includes('questions and answers') ||
        text.includes('open the call') ||
        text.includes('first question') ||
        text.includes('next question') ||
        text.includes('begin the question') ||
        text.includes('now begin the question')
      )
    )
  })

  const submittedQuestionStart = blocks.findIndex((block) =>
    /investor relations/i.test(block.role) &&
    /submitted questions|submit questions|questions ahead of time|investors to submit questions/i.test(block.text)
  )
  const firstAnalyst = blocks.findIndex(isAnalystBlock)
  const start = qnaStart >= 0 ? qnaStart : submittedQuestionStart >= 0 ? submittedQuestionStart : firstAnalyst
  if (start < 0) return []

  const qnaBlocks = blocks.slice(start)
  const indexedBlocks = qnaBlocks.map((block, index) => ({ block, index }))
  const analystQuestions = indexedBlocks.filter(({ block }) => isAnalystBlock(block) && isQuestionText(block.text))
  const submittedQuestions = indexedBlocks.filter(({ block }) => isSubmittedQuestionBlock(block))
  const questionBlocks = analystQuestions.length ? analystQuestions : submittedQuestions

  return questionBlocks
    .map(({ block, index: blockIndex }, index) => {
      const nextQuestion = questionBlocks[index + 1]?.index ?? qnaBlocks.length
      const answerFilter = (answerBlock) =>
        answerBlock.text &&
        answerBlock.speaker.toLowerCase() !== 'operator' &&
        !isAnalystBlock(answerBlock) &&
        !/investor relations/i.test(answerBlock.role) &&
        !isQnaQuestionBlock(answerBlock)
      let answerBlocks = qnaBlocks
        .slice(blockIndex + 1, nextQuestion)
        .filter(answerFilter)
      if (!answerBlocks.length && questionBlocks[index + 1]) {
        const followingQuestion = questionBlocks[index + 2]?.index ?? qnaBlocks.length
        answerBlocks = qnaBlocks
          .slice(questionBlocks[index + 1].index + 1, followingQuestion)
          .filter(answerFilter)
      }
      if (!answerBlocks.length) {
        const firstAnswerIndex = qnaBlocks.findIndex((answerBlock, answerIndex) =>
          answerIndex > blockIndex && answerFilter(answerBlock)
        )
        if (firstAnswerIndex >= 0) {
          const nextQuestionAfterAnswer =
            questionBlocks.find((questionBlock) => questionBlock.index > firstAnswerIndex)?.index ?? qnaBlocks.length
          answerBlocks = qnaBlocks
            .slice(firstAnswerIndex, nextQuestionAfterAnswer)
            .filter(answerFilter)
        }
      }
      if (index === questionBlocks.length - 1) {
        answerBlocks = answerBlocks
          .map((answerBlock) => ({
            ...answerBlock,
            text: trimPostQnaClosing(answerBlock.text),
          }))
          .filter((answerBlock) => isUsefulAnswerSentence(answerBlock.text))
      }
      const answerSpeakers = [...new Set(answerBlocks.map((answerBlock) => answerBlock.speaker).filter(Boolean))]

      return {
        text: block.text,
        source: 'Transcript',
        speaker: block.speaker,
        firm: extractFirm(block.role),
        sequence: index + 1,
        answerSummary: summarizeAnswer('', answerBlocks),
        answerSpeakers,
        answerBlocks: answerBlocks.map((answerBlock) => ({
          speaker: answerBlock.speaker,
          role: answerBlock.role,
          text: answerBlock.text,
        })),
      }
    })
}

function splitSentences(text = '') {
  return text
    .replace(/\s+/g, ' ')
    .split(/(?<=[.!?])\s+(?=[A-Z0-9])/)
    .map((sentence) => sentence.trim())
    .filter((sentence) => sentence.length > 45 && sentence.length < 360)
}

function firstMatchingSentences(text, patterns, limit = 4) {
  const sentences = splitSentences(text)
  const matches = []
  for (const pattern of patterns) {
    for (const sentence of sentences) {
      if (matches.includes(sentence)) continue
      if (pattern.test(sentence)) matches.push(sentence)
      if (matches.length >= limit) return matches
    }
  }
  return matches
}

function categorizedTakeaways(summary, transcript) {
  const sentences = splitSentences(transcript)
    .map(summarizeSentence)
    .filter((sentence) => !/\b(operator|your line is open|forward-looking statements?|safe harbor|forms? 10-[qk]|sec filings?)\b/i.test(sentence))

  const groupConfigs = [
    {
      group: 'Key Financial Results',
      description: 'Key financial metrics achieved in the latest reported quarter.',
      limit: 10,
      filter: (sentence) =>
        !/\bdata center business|datacenter business|segment\b/i.test(sentence) &&
        !/\bR&D expense|SG&A expense\b/i.test(sentence) &&
        !/\bexpect|expected|guidance|for reference|this business contributed|this business\b/i.test(sentence) &&
        (hasHardGuidanceNumber(sentence) || /\brecord backlog|cash balance|cash and cash equivalents\b/i.test(sentence)),
      patterns: [
        /\brevenue (?:increased|reached|was|of)|record revenue|q\d .*revenue|operating results\b/i,
        /\bgross margin|operating margin|EPS|earnings per share|net income|profitability\b/i,
        /\brecord backlog|backlog\b/i,
        /\bcash balance|cash and cash equivalents\b/i,
      ],
    },
    {
      group: 'Business Segment Results',
      description: 'Reported results and management commentary by revenue segment.',
      limit: 6,
      filter: (sentence) =>
        /\baccounted|revenue|growth|declined|bookings|segment performance|segment continues\b/i.test(sentence) &&
        !/\bportfolio.*manufacturing scale|breadth and depth\b/i.test(sentence),
      patterns: [
        /\bsegment.*(?:revenue|growth|accounted|performance)|(?:revenue|growth).*segment\b/i,
        /\bdatacenter and communications|data center and communication|communications business revenue|industrial segment|industrial business revenue\b/i,
        /\btelecom|semiconductor capital equipment\b/i,
      ],
    },
    {
      group: 'Capital Allocation',
      description: 'Capital expenditures, debt, cash, investment, and capacity-spend commentary.',
      limit: 6,
      filter: (sentence) =>
        !/\boperating leverage|gain better leverage\b/i.test(sentence) &&
        /\bcapex|capital expenditures?|capital investment|debt|debt leverage|cash balance|cash and cash equivalents|NVIDIA.*investment|equity investment\b/i.test(sentence),
      patterns: [
        /\bcapex|capital expenditures?|capital investment\b/i,
        /\bdebt|debt leverage|cash balance|cash and cash equivalents\b/i,
        /\bNVIDIA.*investment|equity investment|cash flow\b/i,
      ],
    },
    {
      group: 'Industry Trends and Dynamics',
      description: 'Management commentary on industry demand, supply constraints, products, and market dynamics.',
      limit: 7,
      filter: (sentence) => !/\bglobal leader\b/i.test(sentence),
      patterns: [
        /\bdemand|supply|constraint|capacity|orders|backlog|visibility\b/i,
        /\bAI|data center|datacenter|bandwidth|transceiver|CPO|OCS|indium phosphide|InP\b/i,
        /\bindustry|market|customer|product categories\b/i,
      ],
    },
    {
      group: 'Competitive Landscape',
      description: 'Management commentary on differentiation, positioning, partners, and competitors.',
      limit: 6,
      patterns: [
        /\bcompetitive|competitors?|alternatives?|differentiat|positioned|unique|breadth|depth\b/i,
        /\breliability|power efficiency|manufacturing scale|NVIDIA|partner|partnership\b/i,
      ],
    },
    {
      group: 'Growth Opportunities and Strategies',
      description: 'Where management sees future growth and core revenue drivers across products and markets.',
      limit: 7,
      filter: (sentence) => /\bexpect|expected|opportunity|opportunities|ramp|coming quarters|future|long-term|fiscal 2027|calendar 2027|next year|capacity|driver|strategy\b/i.test(sentence),
      patterns: [
        /\bgrowth opportunity|revenue growth|sustained strong revenue growth|growth rate\b/i,
        /\b800G|1\.6T|CPO|OCS|EML|transceiver|scale-out|scale-up|capacity ramp\b/i,
        /\bfiscal 2027|calendar 2027|next year|coming quarters|long-term\b/i,
      ],
    },
  ]

  return groupConfigs.map((config) => {
    const items = uniqueTakeawayItems(
      sentences
        .filter((sentence) => !config.filter || config.filter(sentence))
        .filter((sentence) => config.patterns.some((pattern) => pattern.test(sentence)))
        .map((sentence) => ({
          subject: takeawaySubject(config.group, sentence),
          text: takeawayText(sentence),
          source: 'Transcript',
        })),
      config.limit
    )

    return {
      group: config.group,
      description: config.description,
      items: items.length ? items : [sourceBullet(`No specific ${config.group.toLowerCase()} commentary was detected in the fetched transcript.`, 'Unverified')],
    }
  })
}

function uniqueTakeawayItems(items, limit = 6) {
  const seen = new Set()
  const unique = []
  for (const item of items) {
    const key = `${item.subject}:${item.text.slice(0, 140).toLowerCase()}`
    if (seen.has(key)) continue
    seen.add(key)
    unique.push(item)
    if (unique.length >= limit) break
  }
  return unique
}

function takeawayText(sentence = '') {
  return sentence
    .replace(/^Turning to (?:our )?/i, '')
    .replace(/^Importantly,\s*/i, '')
    .replace(/^As a result,\s*/i, '')
    .replace(/^In particular,\s*/i, '')
    .trim()
}

function takeawaySubject(group, sentence = '') {
  const subjectMap = [
    ['Quarterly Revenue', /\bq\d .*revenue|revenue (?:increased|reached|was|of)|record revenue\b/i],
    ['Non-GAAP Operating Margin', /\bnon-gaap operating margin\b/i],
    ['Operating Margin', /\boperating margin\b/i],
    ['Non-GAAP Gross Margin', /\bnon-gaap gross margin\b/i],
    ['GAAP Gross Margin', /\bgaap gross margin\b/i],
    ['Gross Margin', /\bgross margin\b/i],
    ['Non-GAAP EPS', /\bnon-gaap EPS|non-gaap earnings per share\b/i],
    ['EPS', /\bEPS|earnings per share\b/i],
    ['Record Backlog', /\brecord backlog|backlog\b/i],
    ['Cash Balance', /\bcash balance|cash and cash equivalents\b/i],
    ['CapEx', /\bcapex|capital expenditures?\b/i],
    ['Debt Reduction', /\bdebt|leverage\b/i],
    ['Capital Investment', /\bcapital investment|investment\b/i],
    ['Datacenter and Communications Segment', /\bdatacenter and communications|data center and communications\b/i],
    ['Data Center Business', /\bdata center|datacenter\b/i],
    ['Communications Revenue', /\bcommunications business|communications revenue\b/i],
    ['Industrial Segment', /\bindustrial segment|industrial business|industrial market\b/i],
    ['Semiconductor Capital Equipment', /\bsemiconductor capital equipment\b/i],
    ['Demand Environment', /\bdemand\b/i],
    ['Order Book / Backlog', /\border book|backlog\b/i],
    ['Indium Phosphide Capacity', /\bindium phosphide|InP\b/i],
    ['Transceiver Adoption', /\btransceiver|800G|1\.6T\b/i],
    ['CPO Opportunity', /\bCPO|co-packaged optics|scale-out CPO|scale-up CPO\b/i],
    ['OCS Opportunity', /\bOCS|optical circuit switches?\b/i],
    ['Technology Portfolio', /\bportfolio|breadth|depth|technology\b/i],
    ['Competitive Differentiation', /\bcompetitive|differentiat|alternatives?|reliability|power efficiency\b/i],
    ['NVIDIA Partnership', /\bNVIDIA\b/i],
    ['Manufacturing Scale', /\bmanufacturing scale|capacity|production\b/i],
    ['Revenue Growth', /\brevenue growth|growth rate|strong revenue growth\b/i],
    ['Long-Term Growth', /\blong-term|fiscal 2027|calendar 2027|coming quarters\b/i],
  ]

  return subjectMap.find(([, regex]) => regex.test(sentence))?.[0] ?? group.replace(/ Results| and Dynamics| and Strategies/g, '')
}

function summarizeSentence(text) {
  return text
    .replace(/\s+/g, ' ')
    .trim()
}

function qnaTakeaways(transcript, questions = []) {
  if (questions.length) {
    return questions
  }

  const lower = transcript.toLowerCase()
  const qnaStart = Math.max(
    lower.indexOf('q&a session'),
    lower.indexOf('open the q&a'),
    lower.indexOf('question-and-answer'),
    lower.indexOf('questions and answers'),
  )
  const qnaText = qnaStart >= 0 ? transcript.slice(qnaStart) : transcript.slice(Math.floor(transcript.length * 0.55))
  const topics = firstMatchingSentences(qnaText, [
    /\bquestion|analyst|asked|how do you|can you|what\b/i,
    /\bdemand|inventory|margin|capacity|guidance|customer|AI|photonics\b/i,
  ], 8).filter((sentence) =>
    !/\bmicrophone|platform|limit yourself|raise your hand|thank you\b/i.test(sentence)
  )

  if (!topics.length) {
    return [sourceBullet('No clear Q&A section was found in the fetched transcript; review the full transcript source for analyst detail.', 'Unverified')]
  }

  return topics.slice(0, 4).map((item) => sourceBullet(summarizeSentence(item), 'Transcript'))
}

function guidanceMetric(sentence = '') {
  const metrics = [
    ['Revenue', /\brevenue|sales\b/i],
    ['Revenue Growth', /\brevenue growth|growth rate|grow\b/i],
    ['Growth', /\bgrowth|acceleration\b/i],
    ['Gross Margin', /\bgross margin\b/i],
    ['Operating Margin', /\boperating margin\b/i],
    ['Adjusted EBITDA', /\badjusted ebitda|adj\.?\s*ebitda|ebitda\b/i],
    ['Adjusted EBIT', /\badjusted ebit\b|adj\.?\s*ebit\b/i],
    ['EPS', /\bEPS|earnings per share\b/i],
    ['Operating Expense', /\boperating expense|opex\b/i],
    ['CapEx', /\bcapex|capital expenditure\b/i],
    ['Free Cash Flow', /\bfree cash flow|cash flow\b/i],
    ['Tax Rate', /\btax rate\b/i],
    ['Share Count', /\bshare count|shares outstanding|diluted shares\b/i],
    ['Interest Expense', /\binterest expense|interest income\b/i],
  ]

  return metrics.find(([, regex]) => regex.test(sentence))?.[0] ?? 'Financial Metric'
}

function guidancePeriod(sentence = '') {
  if (/\b(next|current|coming)?\s*(first|second|third|fourth)\s+quarter\b|\bq[1-4]\b|\bfor the quarter\b|\bquarterly\b|\bmarch quarter\b|\bjune quarter\b|\bseptember quarter\b|\bdecember quarter\b/i.test(sentence)) {
    return 'quarterly'
  }

  if (/\bfull year\b|\bfiscal year\b|\bfiscal 20\d{2}\b|\bfy\s?20?\d{2}\b|\bcalendar year\b|\bannual\b/i.test(sentence)) {
    return 'annual'
  }

  return 'outlook'
}

function isGuidanceMetricSentence(sentence = '') {
  return (
    /\bguidance|guide|guided|forecast|expect|expects|expected|project|projects|target|range|approximately|between|outlook\b/i.test(sentence) &&
    /\brevenue|sales|growth|margin|EBITDA|EBIT|EPS|earnings per share|opex|operating expense|operating income|net income|net earnings|capex|cash flow|share count|shares outstanding|interest expense\b/i.test(sentence) &&
    !/\btax rate\b/i.test(sentence)
  )
}

function isOutlookSentence(sentence = '') {
  return (
    /\boutlook|expect|expects|anticipated?|project|forecast|future|next quarter|next fiscal|coming year|year ahead|demand|backlog|orders|pipeline|capacity|customer\b/i.test(sentence) &&
    !/\b(operator|question comes from|your line is open|can you hear me|forward-looking statements?|factors that could affect|forms? 10-[qk]|sec filings?|disclosure|safe harbor|during today's call|today's earnings release)\b/i.test(sentence)
  )
}

function uniqueGuidanceItems(items, limit = 8) {
  const seen = new Set()
  const unique = []
  for (const item of items) {
    const key = `${item.label}:${item.text.slice(0, 120).toLowerCase()}`
    if (seen.has(key)) continue
    seen.add(key)
    unique.push(item)
    if (unique.length >= limit) break
  }
  return unique
}

function cleanFilingText(html = '') {
  return decodeHtml(html)
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<(br|\/p|\/div|\/tr|\/li|\/h[1-6])[^>]*>/gi, ' || ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&#149;|&bull;/g, ' • ')
    .replace(/\s+/g, ' ')
    .trim()
}

function extractFilingExhibitUrls(html = '', filingUrl = '') {
  const baseUrl = filingUrl.slice(0, filingUrl.lastIndexOf('/') + 1)
  const links = [...html.matchAll(/href="([^"]+)"/gi)]
    .map((match) => match[1])
    .filter((href) => /(?:ex(?:hibit)?[-_ ]?99|dex99|ex99|99[12])|(?:press[-_ ]?release|earnings)/i.test(href))
    .map((href) => {
      try {
        return new URL(href, baseUrl).toString()
      } catch {
        return null
      }
    })
    .filter(Boolean)

  return [...new Set(links)]
}

function hardGuidanceMetric(sentence = '') {
  const metrics = [
    ['Net Revenue', /\bnet revenue\b/i],
    ['Revenue', /\brevenue|sales\b/i],
    ['Adjusted EBITDA', /\badjusted ebitda|adj\.?\s*ebitda|non-gaap ebitda|ebitda\b/i],
    ['Adjusted EBIT', /\badjusted ebit\b|adj\.?\s*ebit\b|non-gaap ebit\b/i],
    ['Operating Income / EBIT', /\boperating income|EBIT\b/i],
    ['Net Income', /\bnet income|net earnings\b/i],
    ['EPS', /\bEPS|earnings per share|net income per diluted share|diluted net income per share\b/i],
    ['Gross Margin', /\bgross margin\b/i],
    ['Operating Margin', /\boperating margin\b/i],
    ['Operating Expenses', /\boperating expenses?|opex\b/i],
    ['Free Cash Flow', /\bfree cash flow|cash flow\b/i],
    ['CapEx', /\bcapex|capital expenditures?\b/i],
    ['Diluted Shares Outstanding', /\bdiluted shares|shares outstanding|share count\b/i],
  ]

  const metric = metrics.find(([, regex]) => regex.test(sentence))?.[0] ?? null
  const basis = guidanceBasis(sentence, metric)
  return metric && basis ? `${basis} ${metric}` : metric
}

function guidanceBasis(sentence = '', metric = '') {
  if (/\bnon-gaap\b/i.test(sentence)) return 'Non-GAAP'
  if (/\badjusted\b/i.test(sentence) || /^Adjusted\b/i.test(metric)) return 'Non-GAAP'
  if (/\bgaap\b/i.test(sentence)) return 'GAAP'
  if (/\brevenue|sales|gross margin|operating expenses?|EPS|earnings per share|net income|operating income|cash flow|capex|shares/i.test(metric)) {
    return 'GAAP'
  }
  return ''
}

function hasHardGuidanceNumber(sentence = '') {
  return (
    /\$\s?\d[\d,.]*(?:\s?(?:million|billion|m|bn))?/i.test(sentence) ||
    /\b\d+(?:\.\d+)?\s*%/.test(sentence) ||
    /\b\d[\d,.]*\s?(?:million|billion|shares)\b/i.test(sentence)
  )
}

function isHardGuidanceSentence(sentence = '') {
  return (
    hardGuidanceMetric(sentence) &&
    hasHardGuidanceNumber(sentence) &&
    /\bexpected|expects|projected|forecast|guidance|outlook|between|range|approximately|target\b/i.test(sentence) &&
    !/\btax rate\b/i.test(sentence)
  )
}

function filingGuidanceCandidates(text = '') {
  const sentences = text
    .split(/\s*\|\|\s*|\s*(?<=\.)\s+(?=[A-Z])/)
    .map((sentence) => sentence.replace(/^•\s*/, '').replace(/\s+/g, ' ').trim())
    .filter((sentence) => sentence.length > 35 && sentence.length < 520)

  const sectionIndex = sentences.findIndex((sentence) =>
    /\bbusiness outlook|guidance and outlook|financial outlook|quarter.*outlook|annual guidance|quarterly guidance\b/i.test(sentence)
  )
  const scoped = sectionIndex >= 0 ? sentences.slice(sectionIndex, sectionIndex + 35) : sentences

  return scoped
    .filter(isHardGuidanceSentence)
    .map((sentence) => ({
      label: hardGuidanceMetric(sentence),
      period: guidancePeriod(sentence),
      text: summarizeSentence(sentence),
      source: 'SEC 8-K',
    }))
}

function sourceLabelForDocument(document = {}) {
  if (document.form) return `SEC ${document.form}`
  if (/earnings release/i.test(document.label)) return 'Earnings Release'
  if (/slides|presentation/i.test(document.label)) return 'Earnings Slides'
  return document.label || 'Company Document'
}

function filingDateDistance(dateText, filingDate) {
  const callDate = new Date(dateText)
  const filed = new Date(filingDate)
  if (Number.isNaN(callDate.getTime()) || Number.isNaN(filed.getTime())) return Number.POSITIVE_INFINITY
  return Math.abs(callDate.getTime() - filed.getTime()) / 86_400_000
}

export function selectPeriodFilings(sec, transcript, maxDays = 18) {
  const ranked = (sec?.filings ?? [])
    .map((filing) => ({ ...filing, distance: filingDateDistance(transcript?.date, filing.filed) }))
    .filter((filing) => filing.distance <= maxDays)
    .sort((a, b) => a.distance - b.distance || (
      ['8-K', '6-K', '10-Q', '10-K', '20-F'].indexOf(a.form) -
      ['8-K', '6-K', '10-Q', '10-K', '20-F'].indexOf(b.form)
    ))

  const seenForms = new Set()
  return ranked.filter((filing) => {
    if (seenForms.has(filing.form)) return false
    seenForms.add(filing.form)
    return true
  }).slice(0, 4)
}

async function fetchEvidenceDocument(document) {
  const source = sourceLabelForDocument(document)
  const sourceHeaders = document.form
    ? { ...headers, 'User-Agent': 'MarketMaps dale@example.com' }
    : headers
  const response = await fetch(document.url, { headers: sourceHeaders })
  if (!response.ok) throw new Error(`${source} HTTP ${response.status}`)
  const html = await response.text()
  const text = cleanFilingText(html)
  const exhibits = document.form === '8-K' || document.form === '6-K'
    ? extractFilingExhibitUrls(html, document.url)
    : []
  const exhibitDocuments = []

  for (const url of exhibits.slice(0, 3)) {
    try {
      const exhibitResponse = await fetch(url, { headers: sourceHeaders })
      if (!exhibitResponse.ok) continue
      exhibitDocuments.push({
        label: `${source} Exhibit`,
        source: source === 'SEC 6-K' ? 'SEC 6-K' : 'SEC 8-K',
        url,
        text: cleanFilingText(await exhibitResponse.text()).slice(0, 180_000),
      })
    } catch {
      // The primary filing and linked company documents remain available.
    }
  }

  return [{
    label: document.label || source,
    source,
    url: document.url,
    text: text.slice(0, 180_000),
  }, ...exhibitDocuments]
}

export async function fetchPeriodEvidenceDocuments(transcript, sec) {
  const candidates = [
    ...(transcript?.documents ?? []),
    ...selectPeriodFilings(sec, transcript),
  ]
  const seen = new Set()
  const unique = candidates.filter((document) => {
    if (!document?.url || seen.has(document.url)) return false
    seen.add(document.url)
    return true
  })
  const settled = await Promise.allSettled(unique.map(fetchEvidenceDocument))
  return settled
    .filter((result) => result.status === 'fulfilled')
    .flatMap((result) => result.value)
    .filter((document) => document.text)
}

export function extractHardGuidanceFromDocuments(documents = []) {
  const items = []
  for (const document of documents) {
    items.push(...filingGuidanceCandidates(document.text).map((item) => ({
      ...item,
      source: document.source,
      url: document.url,
    })))
  }
  return uniqueGuidanceItems(items, 16)
}

function guidanceTakeaways(transcript, filingGuidance = []) {
  const sentences = splitSentences(transcript)
  const metricItems = sentences
    .filter(isGuidanceMetricSentence)
    .filter(hasHardGuidanceNumber)
    .map((sentence) => {
      const metric = guidanceMetric(sentence)
      const basis = guidanceBasis(sentence, metric)
      return {
        label: basis ? `${basis} ${metric}` : metric,
        period: guidancePeriod(sentence),
        text: summarizeSentence(sentence),
        source: 'Transcript',
      }
    })

  const hardQuarterly = filingGuidance.filter((item) => item.period === 'quarterly')
  const hardAnnual = filingGuidance.filter((item) => item.period === 'annual')
  const quarterly = uniqueGuidanceItems(hardQuarterly.length ? hardQuarterly : metricItems.filter((item) => item.period === 'quarterly'), 10)
  const annual = uniqueGuidanceItems(hardAnnual.length ? hardAnnual : metricItems.filter((item) => item.period === 'annual'), 10)
  const outlook = uniqueGuidanceItems(
    sentences
      .filter(isOutlookSentence)
      .filter((sentence) => !metricItems.some((item) => item.text === summarizeSentence(sentence)))
      .map((sentence) => outlookBullet(summarizeSentence(sentence))),
    10
  )

  const emptyMetric = (text) => [sourceBullet(text, 'Unverified')]

  return [
    {
      group: 'Quarterly Guidance',
      description: 'Hard-number quarterly financial guidance from the latest SEC 8-K where available.',
      items: quarterly.length ? quarterly : emptyMetric('No explicit quarterly hard-number financial guidance was found in the latest 8-K or transcript.'),
    },
    {
      group: 'Annual Guidance',
      description: 'Hard-number annual or fiscal-year financial guidance from the latest SEC 8-K where available.',
      items: annual.length ? annual : emptyMetric('No specific annual hard-number financial guidance was provided in the latest 8-K or transcript.'),
    },
    {
      group: 'Outlook',
      description: 'Forward-looking management commentary that is not cleanly framed as quarterly or annual metric guidance.',
      items: outlook.length ? outlook : emptyMetric('No separate future outlook commentary was found beyond the explicit guidance items.'),
    },
  ]
}

function outlookSubject(text = '') {
  const subjects = [
    ['Revenue Growth', /\brevenue growth|strong revenue growth|sequential revenue growth|growth rate\b/i],
    ['Order Book / Backlog', /\border book|backlog\b/i],
    ['Customer Visibility', /\bvisibility|LTAs?|long-term agreements?|orders now reaching\b/i],
    ['Capacity-Driven Revenue', /\bshipment|revenue opportunities|expand capacity|capacity expansion\b/i],
    ['Data Center Business', /\bdata center|datacenter\b/i],
    ['Transceiver Growth', /\btransceiver|800g|1\.6t\b/i],
    ['Indium Phosphide Capacity', /\bindium phosphide|inp\b/i],
    ['OCS Revenue', /\bOCS|optical circuit switches?\b/i],
    ['CPO Revenue', /\bCPO|co-packaged optics|scale-out CPO|scale-up CPO\b/i],
    ['Customer Demand', /\bdemand|customer|orders|backlog|LTA\b/i],
    ['Capacity Expansion', /\bcapacity|ramp|production|supply\b/i],
    ['Margin Outlook', /\bmargin|profitability\b/i],
    ['AI Infrastructure', /\bAI|artificial intelligence\b/i],
  ]

  return subjects.find(([, regex]) => regex.test(text))?.[0] ?? 'Management Outlook'
}

function outlookBullet(text) {
  return {
    text,
    subject: outlookSubject(text),
    source: 'Transcript',
  }
}

function buildTopics(text) {
  const themeMap = [
    ['AI Infrastructure', /\bAI|artificial intelligence|data center|accelerator\b/gi],
    ['Photonics-SOI', /\bphotonics|silicon photonics|optical|optics\b/gi],
    ['Inventory Correction', /\binventory|destocking|correction\b/gi],
    ['Margins / Fab Loading', /\bmargin|fab loading|utilization|gross margin\b/gi],
    ['Free Cash Flow', /\bcash flow|liquidity|working capital|balance sheet\b/gi],
    ['Guidance / Outlook', /\bguidance|outlook|expect|forecast|target\b/gi],
    ['Customer Demand', /\bdemand|customer|order|bookings|backlog\b/gi],
    ['CapEx Discipline', /\bcapex|capital expenditure|investment|capacity\b/gi],
    ['Mobile / RF-SOI', /\bmobile|smartphone|RF-SOI|RFSOI|radio frequency\b/gi],
    ['Power / SiC', /\bpower|SiC|silicon carbide|EV\b/gi],
    ['Indium Phosphide', /\bindium phosphide|InP\b/gi],
    ['Cost Control', /\bcost|opex|restructuring|efficiency\b/gi],
  ]

  return themeMap
    .map(([label, regex]) => {
      const matches = text.match(regex)
      const support = firstMatchingSentences(text, [new RegExp(regex.source, 'i')], 1)[0] ?? ''
      return { label, score: matches?.length ?? 0, support: summarizeSentence(support) }
    })
    .filter((topic) => topic.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, 6)
    .map((topic) => ({
      label: topic.label,
      support: sourceBullet(topic.support || `${topic.label} appeared in the latest transcript.`, 'Transcript'),
    }))
}

function sourceBullet(text, source, url = '') {
  return url ? { text, source, url } : { text, source }
}

function parsePeriod(title) {
  const quarter = title.match(/\bQ([1-4])\s+(\d{4})\b/i)
  if (quarter) {
    return {
      type: 'quarter',
      label: `Q${quarter[1]} ${quarter[2]}`,
      fiscalYear: Number(quarter[2]),
      fiscalQuarter: Number(quarter[1]),
    }
  }

  const half = title.match(/\bH([12])\s+(\d{4})\b/i)
  if (half) {
    return {
      type: 'half',
      label: `H${half[1]} ${half[2]}`,
      fiscalYear: Number(half[2]),
      fiscalHalf: Number(half[1]),
    }
  }

  return { type: 'other', label: title.replace(/^Earnings Call:\s*/i, '') }
}

function parseCalendarPeriod(dateText = '') {
  const date = new Date(dateText)
  if (Number.isNaN(date.getTime())) return null
  const quarter = Math.floor(date.getUTCMonth() / 3) + 1
  return {
    type: 'quarter',
    label: `Q${quarter} ${date.getUTCFullYear()}`,
    displayLabel: `Q${quarter} ${date.getUTCFullYear()} (calendar)`,
    year: date.getUTCFullYear(),
    quarter,
  }
}

function parseTranscriptCard(html, basePath, titleMatch) {
  const titleIndex = titleMatch.index ?? 0
  const card = html.slice(titleIndex, titleIndex + 6000)
  const dateMatch = card.match(/<span class="[^"]*text-muted[^"]*">([^<]+)<\/span>/i)
  const summaryMatch = card.match(/<p class="text-base text-default">([\s\S]*?)<\/p>/i)
  const docLinks = [...card.matchAll(/<a href="([^"]+)"[^>]*>\s*<span>(Earnings release|Slides|Annual report)<\/span>/gi)]
    .map((match) => ({
      label: cleanText(match[2]),
      url: absoluteStockAnalysisUrl(match[1]),
    }))

  const title = cleanText(titleMatch[2])
  const period = parsePeriod(title)
  const transcriptUrl = absoluteStockAnalysisUrl(titleMatch[1])

  return {
    id: transcriptUrl.split('/').filter(Boolean).pop(),
    title,
    quarter: period.label,
    period,
    date: cleanText(dateMatch?.[1] ?? ''),
    calendarPeriod: parseCalendarPeriod(cleanText(dateMatch?.[1] ?? '')),
    summary: cleanText(summaryMatch?.[1] ?? ''),
    transcriptUrl,
    docsUrl: absoluteStockAnalysisUrl(`${basePath}/filings/`),
    documents: docLinks,
  }
}

function parseTranscriptCards(html, basePath) {
  const matches = [...html.matchAll(/<a href="([^"]*\/transcripts\/[^"]+\/)"[^>]*>(Earnings Call:[^<]+)<\/a>/gi)]
  const seen = new Set()
  return matches
    .map((match) => parseTranscriptCard(html, basePath, match))
    .filter((card) => {
      if (seen.has(card.transcriptUrl)) return false
      seen.add(card.transcriptUrl)
      return true
    })
}

async function fetchText(url) {
  const res = await fetch(url, { headers })
  if (!res.ok) throw new Error(`HTTP ${res.status} for ${url}`)
  return res.text()
}

function selectTranscriptCard(ticker, cards, periodId) {
  if (periodId) {
    const requested = String(periodId).toLowerCase()
    const match = cards.find((card) =>
      card.id?.toLowerCase() === requested ||
      card.quarter.toLowerCase().replace(/\s+/g, '-') === requested
    )
    if (match) return match
  }

  return cards.find((card) => card.period.type === 'quarter') ?? cards[0]
}

async function fetchLatestTranscript(ticker, periodId = '') {
  const basePath = stockAnalysisBase(ticker)
  if (!basePath) return null

  const listUrl = absoluteStockAnalysisUrl(`${basePath}/transcripts/`)
  const listHtml = await fetchText(listUrl)
  const periods = parseTranscriptCards(listHtml, basePath)
  const latest = selectTranscriptCard(ticker, periods, periodId)
  if (!latest) return null
  const defaultLatest = periods.find((card) => card.period.type === 'quarter') ?? periods[0]

  let transcriptText = ''
  let qnaQuestions = []
  try {
    const transcriptHtml = await fetchText(latest.transcriptUrl)
    qnaQuestions = parseTranscriptQuestions(transcriptHtml)
    transcriptText = stripHtml(transcriptHtml)
    const marker = transcriptText.indexOf('Full Transcript')
    if (marker >= 0) transcriptText = transcriptText.slice(marker)
  } catch {
    transcriptText = latest.summary
  }

  return {
    ...latest,
    listUrl,
    isLatestTranscript: latest.id === defaultLatest?.id,
    periods: uniqueCalendarPeriods(periods).slice(0, 8),
    transcriptText,
    qnaQuestions,
  }
}

function uniqueCalendarPeriods(periods) {
  const seen = new Set()
  const unique = []
  for (const period of periods) {
    const calendarLabel = period.calendarPeriod?.displayLabel ?? period.quarter
    if (seen.has(calendarLabel)) continue
    seen.add(calendarLabel)
    unique.push({
      id: period.id,
      label: period.quarter,
      fiscalLabel: period.quarter,
      calendarLabel,
      date: period.date,
      type: period.period.type,
    })
  }
  return unique
}

async function fetchTickerCikMap() {
  const res = await fetch('https://www.sec.gov/files/company_tickers.json', {
    headers: {
      ...headers,
      'User-Agent': 'MarketMaps dale@example.com',
    },
  })
  if (!res.ok) throw new Error(`SEC ticker map HTTP ${res.status}`)
  return res.json()
}

async function fetchSecFilings(ticker) {
  if (!/^[A-Z]+$/.test(ticker)) {
    return { secFiler: false, sourceLabel: 'Company filings / local exchange docs', filings: [] }
  }

  try {
    const map = await fetchTickerCikMap()
    const row = Object.values(map).find((entry) => entry.ticker === ticker)
    if (!row?.cik_str) return { secFiler: false, sourceLabel: 'Company filings / local exchange docs', filings: [] }

    const cik = String(row.cik_str).padStart(10, '0')
    const res = await fetch(`https://data.sec.gov/submissions/CIK${cik}.json`, {
      headers: {
        ...headers,
        'User-Agent': 'MarketMaps dale@example.com',
      },
    })
    if (!res.ok) throw new Error(`SEC submissions HTTP ${res.status}`)
    const json = await res.json()
    const recent = json?.filings?.recent ?? {}
    const forms = recent.form ?? []
    const filings = forms
      .map((form, i) => ({
        form,
        filed: recent.filingDate?.[i],
        accession: recent.accessionNumber?.[i],
        document: recent.primaryDocument?.[i],
      }))
      .filter((filing) => ['10-Q', '10-K', '8-K', '20-F', '6-K'].includes(filing.form))
      .slice(0, 60)
      .map((filing) => {
        const accessionNoDash = filing.accession.replace(/-/g, '')
        const cikNoLeading = String(Number(row.cik_str))
        return {
          ...filing,
          url: `https://www.sec.gov/Archives/edgar/data/${cikNoLeading}/${accessionNoDash}/${filing.document}`,
        }
      })

    return { secFiler: true, sourceLabel: 'SEC filings', cik, companyName: json.name, filings }
  } catch (err) {
    return { secFiler: null, sourceLabel: 'Filing metadata unavailable', filings: [], error: err.message }
  }
}

function publicQnaItems(items = []) {
  return items.map(({ answerBlocks, ...item }) => item)
}

export async function fetchEarningsCommentary(ticker, options = {}) {
  const [transcript, sec] = await Promise.all([
    fetchLatestTranscript(ticker, options.period).catch((err) => ({ error: err.message })),
    fetchSecFilings(ticker),
  ])

  if (!transcript || transcript.error) {
    return {
      ticker,
      available: false,
      error: transcript?.error ?? 'No transcript source found',
      sec,
      sourceLimitations: sec.secFiler
        ? 'SEC filing links are available. Commentary bullets are grounded in transcript text and linked company documents.'
        : 'This listing is not a standard U.S. SEC filer in this prototype. Commentary is grounded in transcript text plus company release/slides links where available.',
    }
  }

  const evidenceDocuments = await fetchPeriodEvidenceDocuments(transcript, sec).catch(() => [])
  const filingGuidance = extractHardGuidanceFromDocuments(evidenceDocuments)
  const sourceText = `${transcript.summary} ${transcript.transcriptText}`
  const topics = ticker === 'COHR' && COHR_PERIOD_TOPICS[transcript.id]
    ? COHR_PERIOD_TOPICS[transcript.id]
    : buildTopics(sourceText)
  const qnaQuestions = transcript.qnaQuestions ?? []

  const deterministic = {
    ticker,
    available: true,
    quarter: transcript.quarter,
    selectedPeriodId: transcript.id,
    fiscalQuarter: transcript.quarter,
    calendarQuarter: transcript.calendarPeriod?.label ?? transcript.quarter,
    calendarQuarterDisplay: transcript.calendarPeriod?.displayLabel ?? transcript.quarter,
    period: transcript.period,
    periods: transcript.periods,
    date: transcript.date,
    title: transcript.title,
    docsUrl: transcript.documents[0]?.url ?? transcript.docsUrl,
    sources: {
      transcript: transcript.transcriptUrl,
      transcriptList: transcript.listUrl,
      documents: transcript.documents,
      sec,
    },
    qnaQuestionCount: qnaQuestions.length,
    sourceLimitations: sec.secFiler
      ? 'SEC filing links are available. Commentary bullets are grounded in transcript text and linked company documents.'
      : 'This listing is not a standard U.S. SEC filer in this prototype. Commentary is grounded in transcript text plus company release/slides links where available.',
    topics,
    sections: {
      takeaways: ticker === 'COHR' && transcript.id === COHR_LATEST_PROFILE_TRANSCRIPT_ID
        ? COHR_TAKEAWAYS
        : categorizedTakeaways(transcript.summary, transcript.transcriptText),
      qna: publicQnaItems(qnaTakeaways(transcript.transcriptText, qnaQuestions)),
      guidance: guidanceTakeaways(transcript.transcriptText, filingGuidance),
    },
  }

  if (options.localOllama === false) return deterministic

  try {
    const {
      auditEarningsCommentary,
      enhanceEarningsCommentary,
    } = await import('../server/earningsCommentary/ollamaEngine.js')
    const enhancementInput = {
      ticker,
      transcript,
      qnaExchanges: qnaQuestions,
      filingGuidance,
      evidenceDocuments,
      deterministic,
    }
    let engineStatus = { status: 'not_started' }
    const commentary = await enhanceEarningsCommentary(enhancementInput, {
      ...options.ollamaOptions,
      onStatus(status) {
        engineStatus = status
        options.ollamaOptions?.onStatus?.(status)
      },
    })
    if (options.returnAudit) {
      return {
        commentary,
        audit: auditEarningsCommentary(commentary, enhancementInput),
        sourcePacket: {
          ticker,
          transcriptId: transcript.id,
          fiscalQuarter: transcript.quarter,
          calendarQuarter: transcript.calendarPeriod?.label ?? transcript.quarter,
          qnaExchanges: qnaQuestions.length,
          evidenceDocuments: evidenceDocuments.map((document) => ({
            source: document.source,
            label: document.label,
            url: document.url,
            characters: document.text.length,
          })),
          hardGuidanceItems: filingGuidance.length,
          engine: engineStatus,
        },
      }
    }
    return commentary
  } catch {
    return deterministic
  }
}

// Keep full transcript text off the browser. Only normalized metadata is
// returned by this endpoint; the chat pipeline fetches the selected transcript
// again on the server before it creates evidence passages.
export async function fetchTranscriptLibrary(ticker, limit = 8) {
  const basePath = stockAnalysisBase(String(ticker ?? '').toUpperCase())
  if (!basePath) return []

  const listUrl = absoluteStockAnalysisUrl(`${basePath}/transcripts/`)
  const listHtml = await fetchText(listUrl)
  const cards = parseTranscriptCards(listHtml, basePath)
    .filter((card) => card.period.type === 'quarter')
    .slice(0, Math.max(1, Math.min(8, Number(limit) || 8)))

  const results = []
  for (const card of cards) {
    try {
      const transcriptHtml = await fetchText(card.transcriptUrl)
      let transcriptText = stripHtml(transcriptHtml)
      const marker = transcriptText.indexOf('Full Transcript')
      if (marker >= 0) transcriptText = transcriptText.slice(marker)
      if (transcriptText.length < 400) continue
      results.push({
        ...card,
        ticker: String(ticker ?? '').toUpperCase(),
        listUrl,
        transcriptText,
      })
    } catch {
      // A missing quarter is omitted rather than exposed as a selectable
      // source that cannot support an answer.
    }
  }
  return results
}
