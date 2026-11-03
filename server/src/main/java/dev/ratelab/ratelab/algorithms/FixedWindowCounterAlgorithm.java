package dev.ratelab.ratelab.algorithms;

import dev.ratelab.ratelab.model.AlgorithmConfig;
import dev.ratelab.ratelab.model.AlgorithmType;
import dev.ratelab.ratelab.model.RateLimitDecision;
import java.time.Clock;
import java.util.HashMap;
import java.util.Map;
import org.springframework.stereotype.Component;

@Component
public class FixedWindowCounterAlgorithm implements RateLimiterAlgorithm {
    private final Clock clock;
    private final Map<String, WindowState> clients = new HashMap<>();

    public FixedWindowCounterAlgorithm(Clock clock) {
        this.clock = clock;
    }

    @Override
    public AlgorithmType type() {
        return AlgorithmType.FIXED_WINDOW_COUNTER;
    }

    @Override
    public synchronized RateLimitDecision evaluate(String clientId, AlgorithmConfig config) {
        long windowMillis = config.windowSeconds() * 1_000;
        long now = clock.millis();
        long window = Math.floorDiv(now, windowMillis);
        WindowState state = clients.get(clientId);
        long count = state != null && state.window() == window ? state.count() : 0;

        boolean allowed = count < config.maximumRequests();
        if (allowed) {
            count++;
        }
        clients.put(clientId, new WindowState(window, count));

        long retryAfter = allowed ? 0 : (window + 1) * windowMillis - now;
        return new RateLimitDecision(type(), allowed, config.maximumRequests() - count, retryAfter);
    }

    private record WindowState(long window, long count) {}
}