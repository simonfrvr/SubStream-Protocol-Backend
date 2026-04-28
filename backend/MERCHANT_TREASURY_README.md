# Multi-Currency Consolidated Treasury View Implementation

## Overview

This implementation addresses Issue #220 by providing a comprehensive consolidated treasury view for merchants managing multi-c cryptocurrency assets across different payment plans.

## Features

### ✅ Core Functionality
- **Single-Currency View**: Converts all crypto assets (XLM, USDC, EURC) to merchant's base currency
- **Real-time Price Feeds**: Uses PriceCache with 5-minute freshness window for accurate valuations
- **Asset Breakdown**: Detailed exposure analysis showing percentage allocation to each token
- **24-Hour Delta**: Tracks treasury value changes (price fluctuations vs revenue growth)
- **Historical Tracking**: Stores treasury snapshots for trend analysis

### ✅ API Endpoints

#### GET `/api/v1/merchants/:id/treasury/consolidated`
Returns a complete consolidated treasury view for a merchant.

**Response Structure:**
```json
{
  "success": true,
  "data": {
    "merchantId": "550e8400-e29b-41d4-a716-446655440001",
    "baseCurrency": "USD",
    "totalValueLocked": "93802.500000",
    "totalValueLockedUsd": "93802.500000",
    "delta24h": {
      "absolute": "1250.500000",
      "percentage": "1.3524"
    },
    "assetBreakdown": [
      {
        "assetCode": "USDC",
        "assetIssuer": "GA5ZSEJYB37JRC5HVCI5YJPNOIYSWKJ6RUMLA5OZNGXXHQ5T7YRWDWBR",
        "balance": "50000.00000000",
        "valueInBaseCurrency": "50000.000000",
        "valueInUsd": "50000.000000",
        "percentageOfTotal": 53.31,
        "currentPrice": "1.00000000",
        "priceChange24h": 0
      },
      {
        "assetCode": "EURC",
        "assetIssuer": "GAK5A6Y5N4JQK3DRMLNDJZTFJ2XGQZSHJLLZDGKQK5DKHP5A6YZQKXZ",
        "balance": "30000.00000000",
        "valueInBaseCurrency": "32400.000000",
        "valueInUsd": "32400.000000",
        "percentageOfTotal": 34.54,
        "currentPrice": "1.08000000",
        "priceChange24h": 0.4651
      },
      {
        "assetCode": "XLM",
        "balance": "10000.50000000",
        "valueInBaseCurrency": "1334.067000",
        "valueInUsd": "1334.067000",
        "percentageOfTotal": 1.42,
        "currentPrice": "0.13340000",
        "priceChange24h": 4.2188
      }
    ],
    "lastUpdated": "2026-04-28T14:30:00.000Z"
  },
  "timestamp": "2026-04-28T14:30:00.000Z",
  "message": "Consolidated treasury retrieved successfully"
}
```

#### GET `/api/v1/merchants/:id/treasury/history`
Returns historical treasury values for trend analysis.

**Query Parameters:**
- `days` (optional): Number of days of history to retrieve (default: 30)

## Architecture

### Database Schema

#### `merchants` table
- `id`: UUID primary key
- `name`: Merchant name
- `base_currency`: Preferred reporting currency (USD, EUR, etc.)
- `created_at`, `updated_at`: Timestamps

#### `merchant_balances` table
- `id`: UUID primary key
- `merchant_id`: Foreign key to merchants
- `asset_code`: Cryptocurrency code (XLM, USDC, EURC)
- `asset_issuer`: Stellar asset issuer (optional)
- `balance`: Current balance (decimal, 20,8 precision)
- `last_updated`: Last balance update timestamp

#### `price_cache` table
- `id`: UUID primary key
- `base_asset`: Base asset for pricing (XLM, USDC, EURC)
- `quote_asset`: Quote asset (USD, EUR, etc.)
- `price`: Current price (decimal, 20,8 precision)
- `source`: Price source (stellar, coinbase, binance)
- `timestamp`: Price timestamp

#### `treasury_snapshots` table
- `id`: UUID primary key
- `merchant_id`: Foreign key to merchants
- `total_value_usd`: Total treasury value in USD
- `asset_breakdown`: JSON breakdown of asset values
- `timestamp`: Snapshot timestamp

### Services

#### `PriceCacheService`
- **Price Retrieval**: Gets current prices with 5-minute freshness check
- **Currency Conversion**: Handles direct and USD-bridged conversions
- **Historical Data**: Provides 24-hour price change calculations
- **Price Caching**: Stores price data from multiple sources

#### `MerchantService`
- **Merchant Management**: CRUD operations for merchant data
- **Balance Tracking**: Updates and retrieves merchant balances
- **Historical Snapshots**: Stores treasury value history

#### `TreasuryService`
- **Consolidation Logic**: Converts all balances to base currency
- **Delta Calculations**: Computes 24-hour value changes
- **Asset Breakdown**: Provides detailed exposure analysis
- **Real-time Valuation**: Ensures accurate, up-to-date valuations

## Acceptance Criteria Verification

### ✅ Acceptance 1: Single-Currency View
- **Implementation**: All crypto balances converted to merchant's base currency
- **Features**: Support for USD, EUR, and other major currencies
- **Validation**: Total value shown in both base currency and USD

### ✅ Acceptance 2: Real-time Price Accuracy
- **Implementation**: 5-minute price freshness window enforced
- **Sources**: Multiple price sources (Stellar, Coinbase, Binance)
- **Fallback**: USD-bridged conversion for unsupported pairs

### ✅ Acceptance 3: Asset Exposure Breakdown
- **Implementation**: Detailed breakdown by asset with percentages
- **Features**: Individual asset prices and 24h changes
- **Risk Analysis**: Clear view of volatile token exposure

## Testing

### Sample Data
The implementation includes comprehensive seed data:
- **2 Sample Merchants**: Acme Corporation (USD base), Global Tech Ltd (EUR base)
- **Multiple Assets**: XLM, USDC, EURC balances
- **Price Data**: Current and historical prices for delta calculations

### Test Script
Run the test script to verify functionality:
```bash
node test_treasury_endpoint.js
```

### Manual Testing
1. Start the server: `npm run dev` or `npm start`
2. Test the consolidated endpoint:
   ```bash
   curl http://localhost:3001/api/v1/merchants/550e8400-e29b-41d4-a716-446655440001/treasury/consolidated
   ```
3. Test the history endpoint:
   ```bash
   curl "http://localhost:3001/api/v1/merchants/550e8400-e29b-41d4-a716-446655440001/treasury/history?days=7"
   ```

## Security & Compliance

- **Audit Logging**: All treasury views logged with `data_access` category
- **Rate Limiting**: Standard rate limiting applied to merchant endpoints
- **Error Handling**: Comprehensive error responses with proper HTTP status codes
- **Data Validation**: Input validation and sanitization throughout

## Performance Considerations

- **Database Indexing**: Optimized indexes on merchant_id, asset_code, and timestamps
- **Price Caching**: Efficient price lookup with freshness checks
- **Batch Operations**: Historical data processed in batches
- **Connection Pooling**: Database connection pooling for high concurrency

## Future Enhancements

- **WebSocket Updates**: Real-time treasury value updates
- **Advanced Analytics**: Portfolio optimization recommendations
- **Multi-Exchange Prices**: Aggregated pricing from more exchanges
- **Risk Metrics**: VaR and other risk calculations
- **Export Features**: CSV/PDF export of treasury reports

## Dependencies

The implementation uses existing project dependencies:
- Express.js for API routing
- Knex.js for database operations
- PostgreSQL for data persistence
- Existing middleware for rate limiting, auditing, and error handling

## Migration & Setup

1. Run database migrations:
   ```bash
   npm run migrate
   ```

2. Seed sample data:
   ```bash
   npm run seed
   ```

3. Start the server and test endpoints as described above.

---

**Status**: ✅ Complete - All acceptance criteria met and tested
