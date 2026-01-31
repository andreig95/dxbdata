# DXBData Product Roadmap & Spec

**Vision:** Become the Bayut/PropertyFinder of Dubai real estate transaction data - the go-to platform for investors, buyers, and analysts to understand the market through actual transaction intelligence.

**Target Users:**
- Real estate investors (local & international)
- Property buyers doing due diligence
- Real estate agents researching comps
- Analysts & researchers
- Developers tracking competition

---

## Phase 1: Foundation (Week 1)
*Goal: Modern UI framework + core pages*

### 1.1 Design System
- [ ] Color palette (dark theme like current, or light option?)
- [ ] Typography (Inter or similar modern font)
- [ ] Component library:
  - Cards (transaction, area, building, developer)
  - Buttons, inputs, dropdowns
  - Charts (consistent styling)
  - Map markers & popups
  - Loading skeletons
  - Empty states

### 1.2 Navigation & Layout
- [ ] Sticky header with search bar
- [ ] Main nav: Home, Areas, Buildings, Developers, Off-Plan, Calculator, Insights
- [ ] Footer with links, newsletter signup
- [ ] Mobile hamburger menu
- [ ] Breadcrumbs on detail pages

### 1.3 Homepage Redesign
- [ ] Hero section with search (area, property type, price range)
- [ ] Market snapshot cards (total transactions, avg price, trending areas)
- [ ] Featured areas grid (top 6-8 with images)
- [ ] Recent transactions feed
- [ ] Price trend chart (last 12 months)
- [ ] Top developers section
- [ ] Newsletter signup

---

## Phase 2: Area Intelligence (Week 1-2)
*Goal: Best-in-class neighborhood pages*

### 2.1 Areas Listing Page (/areas)
- [ ] Grid of area cards with:
  - Area image/icon
  - Transaction count
  - Avg price
  - Avg price/sqft
  - YoY price change (↑↓%)
- [ ] Filters: price range, property type
- [ ] Sort: by transactions, price, growth
- [ ] Search areas

### 2.2 Area Detail Page (/area/dubai-marina)
- [ ] Hero banner with area stats
- [ ] Key metrics cards:
  - Total transactions (all time / this year)
  - Avg price, median price
  - Avg price/sqft
  - Price range (min-max)
  - Most common property type
- [ ] Price trend chart (1Y, 3Y, 5Y, All)
- [ ] Price distribution histogram
- [ ] Transaction volume chart
- [ ] Top buildings table (click to building page)
- [ ] Top developers in area
- [ ] Recent transactions list
- [ ] Nearby areas comparison
- [ ] Map showing area boundaries + transactions as dots

---

## Phase 3: Building Intelligence (Week 2)
*Goal: Every building has a profile*

### 3.1 Buildings Listing Page (/buildings)
- [ ] Search by building name
- [ ] Filter by area, price range
- [ ] Sort by transactions, avg price
- [ ] Building cards with stats

### 3.2 Building Detail Page (/building/marina-gate-1)
- [ ] Building info (name, area, developer, year built)
- [ ] Key metrics:
  - Total transactions
  - Avg price / price per sqft
  - Price range
  - Most traded unit types
- [ ] Price history chart
- [ ] All transactions table (sortable, filterable)
- [ ] Unit type breakdown (studios, 1BR, 2BR, etc.)
- [ ] Flip analysis (units sold multiple times, profit %)
- [ ] Similar buildings in area

---

## Phase 4: Developer Profiles (Week 2)
*Goal: Track record transparency*

### 4.1 Developers Listing Page (/developers)
- [ ] Developer cards with:
  - Logo/icon
  - Total projects
  - Completed vs ongoing
  - On-time delivery rate
  - Avg price range
  - Rating
- [ ] Sort by projects, rating, delivery rate
- [ ] Filter by area presence

### 4.2 Developer Detail Page (/developer/emaar)
- [ ] Developer overview (founded, HQ, description)
- [ ] Key stats:
  - Total projects, completed, ongoing
  - Total units delivered
  - On-time delivery %
  - Avg price appreciation post-handover
- [ ] Projects list (completed + ongoing)
- [ ] Areas where they build (map)
- [ ] Price trends across their projects
- [ ] Transaction volume over time
- [ ] Notable projects showcase

---

## Phase 5: Off-Plan Hub (Week 2-3)
*Goal: Track new project launches & sales*

### 5.1 Off-Plan Listing (/offplan)
- [ ] Active projects grid
- [ ] Filters: developer, area, price, launch date
- [ ] Sort by: sales velocity, price, launch date
- [ ] Project cards with:
  - Render/image
  - Developer
  - Area
  - Price range
  - Units sold / total
  - Sales velocity indicator

### 5.2 Off-Plan Project Page (/offplan/emaar-beachfront-tower-2)
- [ ] Project details (developer, location, handover date)
- [ ] Pricing: from/to, avg per sqft
- [ ] Sales tracker:
  - Units launched
  - Units sold
  - Sales by month chart
- [ ] Unit mix breakdown
- [ ] All transactions list
- [ ] Location map

---

## Phase 6: Search & Discovery (Week 3)
*Goal: Find anything fast*

### 6.1 Global Search
- [ ] Search bar in header (always visible)
- [ ] Search across: areas, buildings, developers, projects
- [ ] Autocomplete with categorized results
- [ ] Recent searches

### 6.2 Advanced Transaction Search (/search)
- [ ] Full filter panel:
  - Area (multi-select)
  - Building
  - Developer
  - Property type
  - Unit type (studio, 1BR, etc.)
  - Price range
  - Size range
  - Date range
  - Transaction type (sale, mortgage, gift)
  - Status (ready, off-plan)
- [ ] Save search functionality
- [ ] Results as cards or table (toggle)
- [ ] Map view with clusters
- [ ] Export to CSV

### 6.3 Map Search (/map)
- [ ] Full-screen map
- [ ] Draw to search (rectangle/polygon)
- [ ] Cluster markers
- [ ] Click cluster → show transactions
- [ ] Filter sidebar
- [ ] Heatmap layer (price intensity)

---

## Phase 7: Investment Tools (Week 3)
*Goal: Help investors make decisions*

### 7.1 Mortgage Calculator (existing, enhance)
- [ ] Already built ✅
- [ ] Add: save calculations, share link

### 7.2 ROI Calculator (/calculator/roi)
- [ ] Input: purchase price, rental income, expenses
- [ ] Output: gross yield, net yield, cap rate
- [ ] Compare to area average yields
- [ ] Rental estimate based on area data

### 7.3 Compare Tool (/compare)
- [ ] Compare 2-4 areas or buildings side by side
- [ ] Metrics: price, growth, transactions, yields
- [ ] Charts overlay
- [ ] Export comparison

### 7.4 Flip Analyzer (/flips)
- [ ] Best areas for flipping
- [ ] Avg profit margins
- [ ] Holding period analysis
- [ ] Success rate by area
- [ ] Individual flip transactions

---

## Phase 8: User Features (Week 3-4)
*Goal: Personalization & engagement*

### 8.1 User Accounts
- [ ] Sign up / Login (email + Google)
- [ ] User profile page
- [ ] Saved searches
- [ ] Favorite areas/buildings
- [ ] Search history

### 8.2 Alerts
- [ ] Price drop alerts (area or building)
- [ ] New transaction alerts
- [ ] Email notifications
- [ ] In-app notification center

### 8.3 Saved & Favorites
- [ ] Save any page (area, building, search)
- [ ] Organize into collections
- [ ] Quick access from dashboard

### 8.4 User Dashboard
- [ ] Overview of saved items
- [ ] Active alerts
- [ ] Recent activity
- [ ] Market updates relevant to saved areas

---

## Phase 9: Insights & Content (Week 4)
*Goal: Become a trusted source*

### 9.1 Market Reports (/insights)
- [ ] Monthly market report (auto-generated)
- [ ] Top areas this month
- [ ] Price movement summary
- [ ] Notable transactions
- [ ] Developer activity

### 9.2 Area Guides (/guides)
- [ ] Written guides for top areas
- [ ] Investment thesis per area
- [ ] Lifestyle info (schools, malls, metro)
- [ ] Price forecast

### 9.3 Blog / News (/news)
- [ ] Market news & analysis
- [ ] SEO content for organic traffic

---

## Phase 10: Technical & Performance (Ongoing)

### 10.1 Performance
- [ ] Page load < 2 seconds
- [ ] Lazy loading images
- [ ] API response caching
- [ ] CDN for static assets

### 10.2 SEO
- [ ] Meta titles/descriptions per page
- [ ] Structured data (JSON-LD)
- [ ] Sitemap generation
- [ ] Area/building pages indexed

### 10.3 Mobile
- [ ] Fully responsive (mobile-first)
- [ ] Touch-friendly interactions
- [ ] PWA support (add to home screen)

### 10.4 Analytics
- [ ] Google Analytics / Mixpanel
- [ ] Track: searches, page views, conversions
- [ ] User behavior funnels

---

## Tech Stack Recommendation

### Option A: Enhance Current (Faster)
- Keep Node.js + vanilla HTML/JS
- Add Tailwind CSS for styling
- Add Alpine.js for interactivity
- Keep Leaflet for maps
- Keep Chart.js

### Option B: Modern Rebuild (Better long-term)
- Next.js 14 (React, SSR, file-based routing)
- Tailwind CSS
- Shadcn/ui components
- React-Leaflet for maps
- Recharts or Tremor for charts
- Prisma + PostgreSQL for data
- NextAuth for authentication

**Recommendation:** Option B if we want to scale. Option A if we want speed.

---

## Data Requirements

### Current Data
- Transactions (DLD open data)
- Areas (derived from transactions)
- Basic stats

### Needed Data
- [ ] Building database (name, location, developer, year, units)
- [ ] Developer database (full profiles)
- [ ] Area boundaries (GeoJSON for map)
- [ ] Area images (for cards)
- [ ] Rental data (for ROI calculations)
- [ ] Project database (off-plan launches)

### Data Sources to Explore
- DLD REST API
- OpenStreetMap for boundaries
- Scrape developer websites for project info
- Manual curation for top 100 buildings

---

## Success Metrics

### Traffic
- 10K monthly visitors (Month 3)
- 50K monthly visitors (Month 6)

### Engagement
- Avg session duration > 3 minutes
- Pages per session > 4
- Return visitor rate > 30%

### Features
- 1000+ registered users (Month 6)
- 500+ active alerts (Month 6)

### SEO
- Page 1 for "Dubai transaction data"
- Page 1 for "[Area name] property prices"

---

## Timeline Summary

| Phase | Focus | Duration |
|-------|-------|----------|
| 1 | Design system + homepage | 3-4 days |
| 2 | Area pages | 3-4 days |
| 3 | Building pages | 2-3 days |
| 4 | Developer pages | 2-3 days |
| 5 | Off-plan hub | 2-3 days |
| 6 | Search & map | 3-4 days |
| 7 | Investment tools | 2-3 days |
| 8 | User features | 3-4 days |
| 9 | Insights & content | 2-3 days |
| 10 | Polish & launch | 2-3 days |

**Total: ~4 weeks for MVP**

---

## Next Steps

1. **Decide tech stack** (enhance current vs rebuild)
2. **Prioritize phases** (what's most valuable first?)
3. **Gather missing data** (buildings, developers, boundaries)
4. **Design mockups** (optional but helpful)
5. **Start building!**

---

*Document created: 2026-01-31*
*Last updated: 2026-01-31*
