package dev.ratelab.ratelab.algorithms;

import dev.ratelab.ratelab.model.AlgorithmConfig;
import dev.ratelab.ratelab.model.AlgorithmType;
import dev.ratelab.ratelab.model.RateLimitDecision;
import java.time.Clock;
import java.util.HashMap;
import java.util.Map;
import org.springframework.stereotype.Component;

@Component
public class SlidingWindowCounterAlgorithm implements RateLimiterAlgorithm {
    private final Clock clock;
    private final Map<String, WindowState> clients = new HashMap<>();

    public SlidingWindowCounterAlgorithm(Clock clock) {
        this.clock = clock;
    }

    @Override
    public AlgorithmType type() {
        return AlgorithmType.SLIDING_WINDOW_COUNTER;
    }

    @Override
    public synchronized RateLimitDecision evaluate(String clientId, AlgorithmConfig config) {
        long windowMillis = config.windowSeconds() * 1_000;
        long now = clock.millis();
        long window = Math.floorDiv(now, windowMillis);
        long elapsedInWindow = Math.floorMod(now, windowMillis);
        WindowState previous = clients.get(clientId);
        long previousCount = previous == null ? 0 : previous.currentCount();
        long currentCount = 0;

        if (previous != null && previous.window() == window) {
            previousCount = previous.previousCount();
            currentCount = previous.currentCount();
        } else if (previous != null && previous.window() == window - 1) {
            previousCount = previous.currentCount();
        } else {
            previousCount = 0;
        }

        double weightedPrevious = previousCount * (1.0 - (double) elapsedInWindow / windowMillis);
        double estimatedCount = weightedPrevious + currentCount;
        boolean allowed = estimatedCount + 1 <= config.maximumRequests();
        if (allowed) {
            currentCount++;
        }
        clients.put(clientId, new WindowState(window, previousCount, currentCount));

        long retryAfter = allowed ? 0 : windowMillis - elapsedInWindow;
        long remaining = Math.max(0, (long) Math.floor(config.maximumRequests() - (weightedPrevious + currentCount)));
        return new RateLimitDecision(type(), allowed, remaining, retryAfter);
    }

    private record WindowState(long window, long previousCount, long currentCount) {}
}