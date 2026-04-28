# Database Circuit Breaker for Mass Unlock Events

## Overview

This implementation provides a specialized circuit breaker pattern to protect database write-load during mass unlock events in the vesting vault system. It ensures system reliability and graceful degradation when processing high volumes of unlock transactions.

## Features

### 🛡️ Circuit Breaker Protection
- **State Management**: CLOSED, OPEN, HALF_OPEN, and THROTTLING states
- **Failure Detection**: Configurable failure thresholds with automatic circuit opening
- **Automatic Recovery**: Self-healing with exponential backoff and gradual recovery
- **Concurrent Write Limits**: Prevents database overload from too many simultaneous writes

### 📊 Mass Unlock Detection
- **Event Frequency Monitoring**: Tracks events per time window to detect mass unlocks
- **Dynamic Thresholds**: Configurable detection thresholds based on your system capacity
- **Automatic Throttling**: Proactive throttling when mass unlock patterns are detected

### ⚡ Intelligent Throttling
- **Adaptive Throttling**: Dynamic adjustment based on current system performance
- **Performance-Based**: Throttling level adjusts based on write times and failure rates
- **Graceful Degradation**: System continues operating at reduced capacity instead of failing

### 📈 Monitoring & Alerting
- **Real-time Monitoring**: Continuous tracking of circuit breaker state and performance metrics
- **Multi-channel Alerting**: Email, Slack, and custom alert service integration
- **Performance Analytics**: Detailed statistics and performance summaries
- **Health Checks**: Integrated health status reporting

## Architecture

```
┌─────────────────┐    ┌──────────────────┐    ┌─────────────────┐
│   Event Source  │───▶│  Circuit Breaker │───▶│   Database      │
│                 │    │                  │    │                 │
│ • Mass Unlocks  │    │ • State Mgmt    │    │ • Write Ops     │
│ • Normal Flow   │    │ • Throttling    │    │ • Batch Proc    │
│ • Failures      │    │ • Monitoring    │    │                 │
└─────────────────┘    └──────────────────┘    └─────────────────┘
                                │
                                ▼
                       ┌──────────────────┐
                       │   Monitor       │
                       │                  │
                       │ • Alerting      │
                       │ • Analytics     │
                       │ • Health Checks │
                       └──────────────────┘
```

## Configuration

### Environment Variables

```bash
# Database Circuit Breaker Configuration
DATABASE_CIRCUIT_BREAKER_FAILURE_THRESHOLD=15
DATABASE_CIRCUIT_BREAKER_RESET_TIMEOUT=180000
DATABASE_CIRCUIT_BREAKER_MAX_CONCURRENT_WRITES=30
DATABASE_CIRCUIT_BREAKER_WRITE_TIMEOUT_THRESHOLD=3000
DATABASE_CIRCUIT_BREAKER_MASS_UNLOCK_THRESHOLD=50
DATABASE_CIRCUIT_BREAKER_MASS_UNLOCK_WINDOW=60000
DATABASE_CIRCUIT_BREAKER_BATCH_SIZE=5
DATABASE_CIRCUIT_BREAKER_BATCH_TIMEOUT=1000
```

### Configuration Options

| Parameter | Description | Default | Recommended Range |
|-----------|-------------|----------|-------------------|
| `failureThreshold` | Failures before opening circuit | 15 | 10-25 |
| `resetTimeout` | Time before attempting reset (ms) | 180000 | 60000-300000 |
| `maxConcurrentWrites` | Maximum simultaneous writes | 30 | 20-50 |
| `writeTimeoutThreshold` | Write operation timeout (ms) | 3000 | 1000-5000 |
| `massUnlockThreshold` | Events per minute to trigger mass unlock | 50 | 25-100 |
| `massUnlockWindow` | Time window for mass unlock detection (ms) | 60000 | 30000-120000 |
| `batchSize` | Operations per batch | 5 | 3-10 |
| `batchTimeout` | Delay between batches during high load (ms) | 1000 | 500-2000 |

## Usage

### Basic Integration

```javascript
const { DatabaseCircuitBreaker } = require('./utils/databaseCircuitBreaker');

const circuitBreaker = new DatabaseCircuitBreaker({
  failureThreshold: 15,
  maxConcurrentWrites: 30,
  massUnlockThreshold: 50,
  onStateChange: (stateChange) => {
    console.warn('Circuit breaker state changed:', stateChange);
  },
  onMassUnlockDetected: (massUnlock) => {
    console.warn('Mass unlock detected:', massUnlock);
  }
});

// Protect database writes
await circuitBreaker.executeWrite(async () => {
  // Your database operation here
  await database.insert(data);
}, { operation: 'insert_user' });
```

### Batch Processing

```javascript
const operations = [
  () => database.insert(user1),
  () => database.insert(user2),
  () => database.insert(user3)
];

const results = await circuitBreaker.executeBatchWrite(operations, {
  operation: 'batch_insert_users'
});
```

### Monitoring Integration

```javascript
const { DatabaseCircuitBreakerMonitor } = require('./services/databaseCircuitBreakerMonitor');

const monitor = new DatabaseCircuitBreakerMonitor(config, {
  logger: console,
  alertService: alertService,
  emailService: emailService,
  slackService: slackService
});

await monitor.initialize();
```

## States and Behaviors

### CLOSED (Normal Operation)
- All operations pass through normally
- Monitoring for failures and performance metrics
- No throttling applied

### THROTTLING (Mass Unlock Detected)
- Probabilistic throttling based on load
- Adaptive throttling level (0-100%)
- System continues operating at reduced capacity
- Automatic adjustment based on performance

### OPEN (Circuit Open)
- All operations immediately rejected
- No database writes allowed
- Automatic reset attempt after timeout
- Critical state requiring attention

### HALF_OPEN (Recovery Mode)
- Limited operations allowed to test recovery
- Success rate monitoring
- Returns to CLOSED if successful, stays OPEN if failed

## Performance Metrics

The circuit breaker tracks comprehensive metrics:

### Circuit Breaker Stats
- Total writes, successful writes, failed writes
- Throttled writes and mass unlock events
- Current state and throttling level
- Average write times and peak concurrent writes

### Performance Analytics
- Write time distributions
- Failure rate trends
- State transition history
- Load patterns and mass unlock frequency

## Alerting

### Alert Types

1. **Circuit Breaker State Change**
   - Severity: Critical for OPEN, Warning for other changes
   - Triggers: Circuit opens, closes, or enters recovery

2. **Mass Unlock Detected**
   - Severity: Warning
   - Triggers: Event frequency exceeds threshold

3. **Performance Degradation**
   - Severity: Warning
   - Triggers: High throttling levels or failure rates

### Alert Channels

- **Email**: Critical alerts sent to configured email addresses
- **Slack**: Real-time notifications to Slack channels
- **Custom Alert Service**: Integration with existing alerting systems
- **Logs**: Comprehensive logging with structured data

## Testing

### Running Tests

```bash
# Run circuit breaker tests
npm test -- tests/databaseCircuitBreaker.test.js

# Run with coverage
npm test -- --coverage tests/databaseCircuitBreaker.test.js
```

### Test Scenarios

1. **Basic Circuit Breaker Functionality**
   - Normal operation, failure handling, circuit opening
   - State transitions and recovery behavior

2. **Mass Unlock Detection**
   - High-frequency event processing
   - Throttling activation and adjustment

3. **Batch Processing**
   - Concurrent batch operations
   - Partial failure handling

4. **Graceful Degradation**
   - System behavior under high load
   - Recovery and self-healing

5. **Integration Tests**
   - Realistic mass unlock scenarios
   - End-to-end system behavior

## Monitoring Dashboard

### Key Metrics to Monitor

1. **Circuit Breaker State**
   - Current state and recent transitions
   - Time spent in each state

2. **Performance Metrics**
   - Average write times and percentiles
   - Throttling level trends
   - Success/failure rates

3. **Mass Unlock Events**
   - Frequency and duration
   - Impact on system performance

4. **Database Health**
   - Connection pool status
   - Query performance
   - Resource utilization

### Health Check Endpoints

```javascript
// Get circuit breaker status
GET /api/health/circuit-breaker

// Get detailed statistics
GET /api/health/circuit-breaker/stats

// Get performance summary
GET /api/health/circuit-breaker/performance
```

## Troubleshooting

### Common Issues

1. **Circuit Breaker Stays Open**
   - Check database connectivity and performance
   - Review error logs for root cause
   - Consider adjusting failure threshold

2. **Excessive Throttling**
   - Verify mass unlock threshold settings
   - Check for actual performance issues
   - Monitor system resources

3. **False Mass Unlock Detection**
   - Adjust mass unlock threshold
   - Review event frequency patterns
   - Consider seasonal variations

### Debugging

Enable debug logging:

```javascript
const circuitBreaker = new DatabaseCircuitBreaker({
  // ... other config
  onStateChange: (stateChange) => {
    console.debug('Circuit breaker state change:', stateChange);
  },
  onMassUnlockDetected: (massUnlock) => {
    console.debug('Mass unlock detected:', massUnlock);
  },
  onThrottlingAdjustment: (adjustment) => {
    console.debug('Throttling adjusted:', adjustment);
  }
});
```

## Best Practices

### Configuration
- Start with conservative thresholds and adjust based on observed behavior
- Monitor system performance during normal operations to establish baselines
- Test mass unlock scenarios in staging environment

### Monitoring
- Set up comprehensive alerting with appropriate thresholds
- Monitor circuit breaker state changes closely during initial deployment
- Track performance trends over time

### Operations
- Have clear runbooks for circuit breaker events
- Establish escalation procedures for critical alerts
- Regularly review and update configuration based on usage patterns

## Integration with Existing Systems

### Soroban Event Indexer
The circuit breaker is integrated into the Soroban event indexer to protect against mass unlock events:

```javascript
// Automatic integration in SorobanEventIndexer
this.databaseCircuitBreaker = new DatabaseCircuitBreaker(config);

// Protected database operations
await this.databaseCircuitBreaker.executeWrite(writeOperation, context);
```

### Database Connection Factory
Works with existing database connection pooling and management:

```javascript
// Respects existing connection limits
const connection = await connectionFactory.getConnection(tenantId);
await circuitBreaker.executeWrite(() => connection.query(sql), context);
```

## Performance Impact

### Overhead
- **Minimal**: ~1-2ms additional latency per operation
- **Memory**: Small footprint for state tracking and metrics
- **CPU**: Negligible impact during normal operation

### Benefits
- **Reliability**: Prevents database overload during mass events
- **Availability**: System continues operating at reduced capacity
- **Observability**: Comprehensive monitoring and alerting
- **Self-healing**: Automatic recovery and optimization

## Future Enhancements

### Planned Features
- **Machine Learning**: Predictive throttling based on historical patterns
- **Multi-database Support**: Circuit breaker for different database types
- **Distributed Coordination**: Cluster-wide circuit breaker coordination
- **Advanced Analytics**: More sophisticated performance analysis

### Extensibility
The circuit breaker is designed to be extensible:

```javascript
// Custom throttling strategy
class CustomThrottlingStrategy extends DatabaseCircuitBreaker {
  calculateThrottlingLevel(metrics) {
    // Your custom logic here
    return customLevel;
  }
}
```

## Support

For issues, questions, or contributions:

1. Check the troubleshooting section above
2. Review test cases for expected behavior
3. Enable debug logging for detailed information
4. Contact the development team with system details and logs

---

**Version**: 1.0.0  
**Last Updated**: 2025-04-28  
**Compatibility**: Node.js 16+, PostgreSQL 12+, SQLite 3.x
