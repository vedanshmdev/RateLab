package dev.ratelab.ratelab.algorithms;

import dev.ratelab.ratelab.model.AlgorithmConfig;
import dev.ratelab.ratelab.model.AlgorithmType;
import dev.ratelab.ratelab.model.RateLimitDecision;
import java.time.Clock;
import java.util.HashMap;
import java.util.Map;
import org.springframework.stereotype.Component;

@Component
public class TokenBucketAlgorithm implements RateLimiterAlgorithm {
    private final Clock clock;
    private final Map<String, BucketState> buckets = new HashMap<>();

    public TokenBucketAlgorithm(Clock clock) {
        this.clock = clock;
    }

    @Override
    public AlgorithmType type() {
        return AlgorithmType.TOKEN_BUCKET;
    }

    @Override
    public synchronized RateLimitDecision evaluate(String clientId, AlgorithmConfig config) {
        long now = clock.millis();
        double refillRatePerMillisecond =
            (double) config.refillTokens() / (config.refillPeriodSeconds() * 1_000.0);
        BucketState previous = buckets.get(clientId);
        double tokens = previous == null
            ? config.capacity()
            : Math.min(config.capacity(), previous.tokens() + Math.max(0, now - previous.updatedAt()) * refillRatePerMillisecond);

        boolean allowed = tokens >= 1;
        if (allowed) {
            tokens -= 1;
        }
        buckets.put(clientId, new BucketState(tokens, now));

        long retryAfter = allowed
            ? 0
            : (long) Math.ceil((1 - tokens) / refillRatePerMillisecond);
        return new RateLimitDecision(type(), allowed, (long) Math.floor(tokens), retryAfter);
    }

    private record BucketState(double tokens, long updatedAt) {}
}