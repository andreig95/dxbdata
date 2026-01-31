# DXBData - Dubai Real Estate Intelligence

A real-time Dubai real estate transaction explorer with analytics, price alerts, and mortgage calculator.

**Live Site:** https://dxbdata.xyz

## What This App Does

DXBData provides comprehensive access to Dubai Land Department (DLD) transaction data, helping investors and buyers:

1. **Search & Filter Transactions** - Browse real property sales with filters for area, building, property type, price range, size, and date
2. **Analyze Market Trends** - View price trends over time, compare areas, track average price/sqm
3. **Flip Analysis** - Identify areas with profitable resale opportunities (buy/sell profit tracking)
4. **Off-Plan Tracking** - Monitor off-plan project sales and developer activity
5. **Price Alerts** - Get notified when prices in specific areas drop below thresholds
6. **Mortgage Calculator** - Calculate monthly payments with live currency conversion (AED/USD/EUR) and developer reliability ratings

## Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                        NGINX                                 │
│  dxbdata.xyz → /var/www/dxbdata/public (static files)       │
│  dxbdata.xyz/api/* → proxy to localhost:3003                │
└─────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────┐
│                    Node.js API (PM2)                         │
│  index.js on port 3003                                       │
│  - REST API for transactions, areas, stats, alerts           │
│  - Connects to external DLD data source                      │
└─────────────────────────────────────────────────────────────┘
```

## Files

| File | Purpose |
|------|---------|
| `index.js` | Main API server - all backend endpoints |
| `public/index.html` | Main explorer UI - search, filters, charts, map |
| `public/calculator.html` | Mortgage calculator with developer ratings |
| `public/transaction.html` | Individual transaction detail page |
| `check-alerts.js` | Cron job to check price alerts and notify users |
| `update-data.sh` | Script to refresh transaction data from DLD |
| `package.json` | Node.js dependencies |
| `.env` | Environment variables (not in git) |

## API Endpoints

### Public Endpoints

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/api/transactions` | GET | Search transactions with filters |
| `/api/transactions/:id` | GET | Get single transaction details |
| `/api/areas` | GET | List all areas with stats |
| `/api/stats` | GET | Overall market statistics |
| `/api/trends` | GET | Price trends over time |
| `/api/neighborhoods/:name` | GET | Detailed area info |
| `/api/flips/by-area` | GET | Flip profit analysis by area |
| `/api/offplan/projects` | GET | Off-plan project listings |

### Auth Endpoints

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/api/auth/register` | POST | Create new account |
| `/api/auth/login` | POST | Login, get JWT token |
| `/api/auth/me` | GET | Get current user (requires token) |

### Protected Endpoints (require JWT)

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/api/watchlists` | GET/POST | User watchlists |
| `/api/watchlists/:id` | DELETE | Remove watchlist |
| `/api/alerts` | GET/POST | Price alerts |
| `/api/alerts/:id` | DELETE | Remove alert |

## Query Parameters for /api/transactions

| Param | Type | Description |
|-------|------|-------------|
| `area` | string | Filter by area name |
| `building` | string | Filter by building name |
| `property_type` | string | Unit, Villa, Land |
| `reg_type` | string | Off-plan, Existing |
| `min_price` | number | Minimum price AED |
| `max_price` | number | Maximum price AED |
| `min_size` | number | Minimum size sqm |
| `max_size` | number | Maximum size sqm |
| `from_date` | date | Start date (YYYY-MM-DD) |
| `to_date` | date | End date (YYYY-MM-DD) |
| `sort` | string | Sort field (instance_date, actual_worth, meter_sale_price) |
| `order` | string | ASC or DESC |
| `limit` | number | Results per page (default 50) |
| `offset` | number | Pagination offset |

## Environment Variables (.env)

```bash
PORT=3003
DATABASE_URL=<postgres connection string if using DB>
JWT_SECRET=<secret for auth tokens>
DLD_API_KEY=<Dubai Land Department API key if applicable>
```

## Running Locally

```bash
# Install dependencies
npm install

# Set environment variables
cp .env.example .env
# Edit .env with your values

# Run development server
node index.js

# Or with PM2 for production
pm2 start index.js --name dxbdata
```

## Deployment (Current Setup)

The app runs on a Hostinger VPS (147.93.52.138):

```bash
# SSH to server
ssh root@147.93.52.138

# App location
cd /var/www/dxbdata

# View logs
pm2 logs dxbdata

# Restart
pm2 restart dxbdata

# Update from git
git pull origin main
pm2 restart dxbdata
```

## Frontend Features

### Main Explorer (index.html)
- **Search Filters**: Area autocomplete, property type, status, price range, size range, date range
- **Quick Presets**: Luxury (>5M), Budget (<1M), Off-plan, Recent (30 days)
- **Views**: Table view, Map view (Leaflet)
- **Charts**: Price trend line chart, Top areas bar chart
- **Tabs**: Transactions, Areas, Flips, Off-Plan, Map
- **Export**: CSV download of filtered results
- **Share**: Copy search URL to clipboard
- **User Features**: Login, watchlists, price alerts

### Calculator (calculator.html)
- **Unit Toggles**: sqm ↔ sq ft
- **Currency Toggles**: AED ↔ USD ↔ EUR (live exchange rates from ExchangeRate-API)
- **Developer Check**: 10 major developers with ratings, on-time delivery %, price ranges
- **Calculations**: Monthly payment, total interest, upfront costs (DLD 4%, agent 2%, admin fees)
- **Affordability**: Debt-to-income ratio check (30% recommended max)

## Developers Data (in calculator)

The calculator includes reliability data for major Dubai developers:

| Developer | On-Time Delivery | Rating | Price Range |
|-----------|-----------------|--------|-------------|
| Emaar Properties | 92% | 4.5★ | 1.5M - 50M |
| Sobha Realty | 95% | 4.6★ | 1.8M - 15M |
| Meraas | 90% | 4.4★ | 1.2M - 25M |
| Select Group | 88% | 4.2★ | 600K - 8M |
| Ellington | 88% | 4.3★ | 800K - 8M |
| Nakheel | 85% | 4.3★ | 1M - 80M |
| Omniyat | 85% | 4.7★ | 3M - 100M |
| Danube Properties | 80% | 4.0★ | 300K - 3M |
| DAMAC Properties | 78% | 4.0★ | 800K - 30M |
| Azizi Developments | 75% | 3.9★ | 400K - 5M |

## Data Flow

1. **Transaction Data**: Sourced from Dubai Land Department (DLD) open data
2. **Exchange Rates**: Live rates from ExchangeRate-API (updates daily)
3. **Area Statistics**: Calculated aggregates (avg price, transaction count, price/sqm)
4. **Flip Analysis**: Tracks same-property resales to calculate profit margins

## Key Calculations

### Mortgage Payment (PMT Formula)
```
Monthly Payment = (P × r × (1+r)^n) / ((1+r)^n - 1)

Where:
P = Loan amount (price - down payment)
r = Monthly interest rate (annual rate / 12)
n = Total number of payments (years × 12)
```

### Dubai Buying Costs
- **DLD Fee**: 4% of property price
- **Agent Commission**: 2% of property price  
- **Admin/Registration**: ~AED 4,000
- **Minimum Down Payment**: 20% for expats, 15% for UAE nationals

## Future Improvements

- [ ] Add more developers to calculator database
- [ ] Property comparison tool (side-by-side)
- [ ] ROI calculator for rental yields
- [ ] Historical price charts per building/project
- [ ] Email/SMS notifications for price alerts
- [ ] Mobile app version (React Native)
- [ ] Integration with property listing sites (Bayut, Property Finder)
- [ ] AI-powered investment recommendations

## Tech Stack

- **Backend**: Node.js, Express.js
- **Frontend**: Vanilla HTML/CSS/JavaScript (no framework - fast loading)
- **Charts**: Chart.js
- **Maps**: Leaflet with CartoDB dark tiles
- **Auth**: JWT tokens (localStorage)
- **Process Manager**: PM2
- **Web Server**: Nginx with Let's Encrypt SSL
- **Hosting**: Hostinger VPS (Ubuntu)

## Contributing

1. Fork the repo
2. Create feature branch: `git checkout -b feature/new-feature`
3. Commit changes: `git commit -am 'Add new feature'`
4. Push: `git push origin feature/new-feature`
5. Create Pull Request

## License

MIT License - feel free to use for personal or commercial projects.

---

*Built for Dubai real estate market analysis and investment research.*

**Questions?** Open an issue or contact the maintainer.
