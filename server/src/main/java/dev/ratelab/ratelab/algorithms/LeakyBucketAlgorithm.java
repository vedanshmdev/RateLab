package dev.ratelab.ratelab.algorithms;

import dev.ratelab.ratelab.model.AlgorithmConfig;
import dev.ratelab.ratelab.model.AlgorithmType;
import dev.ratelab.ratelab.model.RateLimitDecision;
import java.time.Clock;
import java.util.HashMap;
import java.util.Map;
import org.springframework.stereotype.Component;

@Component
public class LeakyBucketAlgorithm implements RateLimiterAlgorithm {
    private final Clock clock;
    private final Map<String, BucketState> buckets = new HashMap<>();

    public LeakyBucketAlgorithm(Clock clock) {
        this.clock = clock;
    }

    @Override
    public AlgorithmType type() {
        return AlgorithmType.LEAKY_BUCKET;
    }

    @Override
    public synchronized RateLimitDecision evaluate(String clientId, AlgorithmConfig config) {
        long now = clock.millis();
        double leakRatePerMillisecond = config.leakRatePerSecond() / 1_000.0;
        BucketState previous = buckets.get(clientId);
        double level = previous == null
            ? 0
            : Math.max(0, previous.level() - Math.max(0, now - previous.updatedAt()) * leakRatePerMillisecond);

        boolean allowed = level + 1 <= config.capacity();
        if (allowed) {
            level += 1;
        }
        buckets.put(clientId, new BucketState(level, now));

        long retryAfter = allowed
            ? 0
            : (long) Math.ceil((level + 1 - config.capacity()) / leakRatePerMillisecond);
        long remaining = Math.max(0, (long) Math.floor(config.capacity() - level));
        return new RateLimitDecision(type(), allowed, remaining, retryAfter);
    }

    private record BucketState(double level, long updatedAt) {}
}